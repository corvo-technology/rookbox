import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import type { ApiKeyService } from "./api-keys.js";
import { asSystem } from "./database-access.js";
import type { Db } from "./db.js";
import { apiOrigin, type Env } from "./env.js";
import type { Logger } from "./logger.js";

export type AuthUser = { id: string; email: string };

/** Who is calling: a session cookie or an `Authorization: Bearer rbx_...` key, else null. */
export type Identity = (headers: Headers) => Promise<AuthUser | null>;

export type AuthOptions = {
  /** Open the sign-up endpoint. Only the CLI (seed and `user create`) does; the HTTP server never does. */
  allowSignUp: boolean;
  /** Replaces the Prisma adapter. Tests only. */
  database?: Parameters<typeof betterAuth>[0]["database"];
};

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

/**
 * The session cookie's scope.
 *
 * Host-only by default: no `Domain` attribute, so the browser sends the cookie to the API's own
 * host and to no other, in particular not to the machine hosts (`<port>-<id>.box...`) where any
 * customer can run a web server. Over HTTPS the cookies also take the `__Host-` prefix, which makes
 * the browser refuse any copy of them set with a `Domain` attribute (a page on a sibling host
 * cannot plant a cookie of that name for this one). `COOKIE_DOMAIN` is a dangerous override that
 * shares the cookie with every subdomain and gives up the prefix.
 */
export function cookieSettings(
  env: Pick<Env, "BETTER_AUTH_URL" | "COOKIE_DOMAIN">,
): NonNullable<Parameters<typeof betterAuth>[0]["advanced"]> {
  const secure = new URL(env.BETTER_AUTH_URL).protocol === "https:";
  const defaultCookieAttributes = { sameSite: "lax", secure, httpOnly: true } as const;
  if (env.COOKIE_DOMAIN) {
    return {
      useSecureCookies: secure,
      crossSubDomainCookies: { enabled: true, domain: env.COOKIE_DOMAIN },
      defaultCookieAttributes,
    };
  }
  if (!secure) return { useSecureCookies: false, defaultCookieAttributes };
  const host = (name: string) => ({ name: `__Host-rookbox.${name}` });
  return {
    // better-auth would add `__Secure-` in front of our `__Host-` names; the attributes below
    // already make every cookie Secure, so its own prefixing is switched off.
    useSecureCookies: false,
    defaultCookieAttributes,
    cookies: {
      session_token: host("session_token"),
      session_data: host("session_data"),
      account_data: host("account_data"),
      dont_remember: host("dont_remember"),
    },
  };
}

/**
 * better-auth with email and password. The public sign-up endpoint is closed: the owner account
 * comes from the seed command and every other account from an operator (the CLI or the admin
 * panel), which is the authorization. An account that exists may sign in.
 */
export function createAuth(db: Db, env: Env, logger: Logger, options: AuthOptions) {
  return betterAuth({
    appName: "Rookbox",
    secret: env.BETTER_AUTH_SECRET,
    baseURL: apiOrigin(env),
    basePath: "/api/auth",
    trustedOrigins: [env.APP_ORIGIN],
    database: options.database ?? prismaAdapter(db, { provider: "postgresql" }),
    // `disabledAt` is ours (the kill switch); declaring it lets better-auth read it back with the user.
    user: {
      additionalFields: { disabledAt: { type: "date", required: false, input: false } },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: !options.allowSignUp,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
    },
    advanced: cookieSettings(env),
    databaseHooks: {
      // A disabled account gets no new session, so it cannot sign in.
      session: {
        create: {
          before: async (session, context) => {
            const user = await context?.context.internalAdapter.findUserById(session.userId);
            if (user && (user as { disabledAt?: Date | null }).disabledAt) {
              logger.warn("sign-in refused: account disabled", { user: session.userId });
              return false;
            }
            return { data: session };
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

export function createIdentity(deps: {
  auth: Pick<Auth, "api">;
  apiKeys: Pick<ApiKeyService, "authenticate">;
  db: Db;
}): Identity {
  // The kill switch: a disabled account is refused on every request, session or key alike, so it
  // takes effect at once, without waiting for a session to expire. Existing accounts are allowed.
  const permitted = (user: (AuthUser & { disabledAt?: Date | string | null }) | null) =>
    user && !user.disabledAt ? { id: user.id, email: user.email } : null;
  // Who the caller is is not known until this answers, so it runs as system work; the handler's
  // own work then runs as that user (`withUser`).
  return (headers) =>
    asSystem("authenticate", async () => {
      const bearer = headers.get("authorization")?.match(/^Bearer (rbx_[A-Za-z0-9]+)$/)?.[1];
      if (bearer) {
        const userId = await deps.apiKeys.authenticate(bearer);
        if (!userId) return null;
        return permitted(await deps.db.user.findUnique({ where: { id: userId } }));
      }
      const session = await deps.auth.api.getSession({ headers });
      return permitted(session?.user ?? null);
    });
}

/** True when the account exists and is not disabled. The desktop proxy asks it on every request. */
export function createIsActive(db: Db): (userId: string) => Promise<boolean> {
  return (userId) =>
    asSystem("is the account active", async () => {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { disabledAt: true },
      });
      return user !== null && user.disabledAt === null;
    });
}

/** Creates the owner account from ROOKBOX_SEED_OWNER_PASSWORD when it does not exist yet. */
export async function seedOwner(
  db: Db,
  env: Env,
  logger: Logger,
): Promise<"created" | "exists" | "skipped"> {
  const password = env.ROOKBOX_SEED_OWNER_PASSWORD;
  const email = env.ROOKBOX_ALLOWED_EMAILS[0];
  if (!password || !email) return "skipped";
  return asSystem("seed the owner account", async () => {
    if (await db.user.findUnique({ where: { email } })) return "exists";
    const auth = createAuth(db, env, logger, { allowSignUp: true });
    await auth.api.signUpEmail({ body: { email, password, name: email.split("@")[0] ?? "Owner" } });
    logger.info("owner account created", { email });
    return "created";
  });
}

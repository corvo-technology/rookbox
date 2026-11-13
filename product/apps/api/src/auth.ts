import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import type { ApiKeyService } from "./api-keys.js";
import type { Db } from "./db.js";
import { apiOrigin, type Env } from "./env.js";
import type { Logger } from "./logger.js";

export type AuthUser = { id: string; email: string };

/** Who is calling: a session cookie or an `Authorization: Bearer rbx_...` key, else null. */
export type Identity = (headers: Headers) => Promise<AuthUser | null>;

export type AuthOptions = {
  /** Open the sign-up endpoint. Only the seed command does; the HTTP server never does. */
  allowSignUp: boolean;
};

export const MIN_PASSWORD_LENGTH = 12;

/**
 * better-auth with email and password. Accounts exist only for ROOKBOX_ALLOWED_EMAILS, and the
 * public sign-up endpoint is closed: the owner account comes from the seed command.
 */
export function createAuth(db: Db, env: Env, logger: Logger, options: AuthOptions) {
  const secure = new URL(env.BETTER_AUTH_URL).protocol === "https:";
  const allowed = new Set(env.ROOKBOX_ALLOWED_EMAILS);
  return betterAuth({
    appName: "Rookbox",
    secret: env.BETTER_AUTH_SECRET,
    baseURL: apiOrigin(env),
    basePath: "/api/auth",
    trustedOrigins: [env.APP_ORIGIN],
    database: prismaAdapter(db, { provider: "postgresql" }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: !options.allowSignUp,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: 128,
    },
    advanced: {
      useSecureCookies: secure,
      ...(env.COOKIE_DOMAIN
        ? { crossSubDomainCookies: { enabled: true, domain: env.COOKIE_DOMAIN } }
        : {}),
      defaultCookieAttributes: { sameSite: "lax", secure, httpOnly: true },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (!allowed.has(String(user.email).toLowerCase())) {
              logger.warn("account refused: email not allowed");
              return false;
            }
            return { data: user };
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
  return async (headers) => {
    const bearer = headers.get("authorization")?.match(/^Bearer (rbx_[A-Za-z0-9]+)$/)?.[1];
    if (bearer) {
      const userId = await deps.apiKeys.authenticate(bearer);
      if (!userId) return null;
      const user = await deps.db.user.findUnique({ where: { id: userId } });
      return user ? { id: user.id, email: user.email } : null;
    }
    const session = await deps.auth.api.getSession({ headers });
    return session ? { id: session.user.id, email: session.user.email } : null;
  };
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
  if (await db.user.findUnique({ where: { email } })) return "exists";
  const auth = createAuth(db, env, logger, { allowSignUp: true });
  await auth.api.signUpEmail({ body: { email, password, name: email.split("@")[0] ?? "Owner" } });
  logger.info("owner account created", { email });
  return "created";
}

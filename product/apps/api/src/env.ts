import { TEMPLATES } from "@rookbox/contracts";
import * as z from "zod";
import {
  type ClassBudget,
  DEFAULT_LIMITS,
  LIMIT_CLASSES,
  LIMIT_ENV,
  type LimitClass,
  parseBudget,
  type RouteLimits,
} from "./route-limits.js";

const csv = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const flag = z
  .enum(["true", "false", "1", "0"])
  .transform((value) => value === "true" || value === "1");

/** An unset or empty variable is "not set". */
const optionalText = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

/** A request budget such as `user=20/3600,ip=60/3600`; see `route-limits.ts`. */
const budget = (cls: LimitClass) =>
  z
    .string()
    .default(DEFAULT_LIMITS[cls])
    .transform((text, ctx): ClassBudget => {
      const parsed = parseBudget(text);
      if ("error" in parsed) {
        ctx.addIssue({ code: "custom", message: `${LIMIT_ENV[cls]}: ${parsed.error}` });
        return z.NEVER;
      }
      return parsed;
    });

const hostPattern = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/;

/** Every setting the API reads, validated once at start so a bad deploy fails loudly. */
const EnvObject = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  HOST: z.string().min(1).default("0.0.0.0"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  DATABASE_URL: z.string().min(1),
  /** Apply pending Prisma migrations when the server starts. */
  RUN_MIGRATIONS: flag.default(true),
  MIGRATIONS_DIR: z.string().min(1).optional(),

  BETTER_AUTH_SECRET: z.string().min(32, "Use at least 32 characters (openssl rand -base64 32)"),
  /** Public origin of this API, e.g. https://api.rookbox.run. */
  BETTER_AUTH_URL: z.url(),
  /** The dashboard's origin. The only origin CORS and CSRF checks accept. */
  APP_ORIGIN: z.url(),
  /**
   * DANGEROUS override. By default the session cookie is host-only (sent to the API's own host and
   * nowhere else). Setting this makes the browser send it to every subdomain of the domain, which
   * includes machine hosts where other people run web servers. Leave it unset.
   */
  COOKIE_DOMAIN: optionalText(z.string().min(1)),
  /**
   * How many reverse proxies sit between the internet and this process, for reading the client
   * address from X-Forwarded-For. 0 (the default) ignores the header and uses the socket address.
   */
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  /** Master switch for the per-route request limits below. */
  RATE_LIMITS_ENABLED: flag.default(true),
  RATE_LIMIT_MACHINE_CREATE: budget("machine_create"),
  RATE_LIMIT_MACHINE_DELETE: budget("machine_delete"),
  RATE_LIMIT_MACHINE_FORK: budget("machine_fork"),
  RATE_LIMIT_MACHINE_LIFECYCLE: budget("machine_lifecycle"),
  RATE_LIMIT_MACHINE_EXEC: budget("machine_exec"),
  RATE_LIMIT_API_KEY_CREATE: budget("api_key_create"),
  RATE_LIMIT_DESKTOP_LINK: budget("desktop_link"),
  RATE_LIMIT_AUTH: budget("auth"),
  /** Most bytes of stdout, and of stderr, that `machines.exec` returns. */
  EXEC_MAX_OUTPUT_BYTES: z.coerce.number().int().min(1_024).max(1_048_576).default(262_144),

  /**
   * Host name (and port, if any) the desktop is served from, e.g. desk.rookbox.run. The API must
   * be reachable under it too. Unset: the desktop is served from the API's own host (development).
   */
  DESKTOP_HOST: optionalText(z.string().trim().toLowerCase().regex(hostPattern)),
  /** Signs desktop links and sessions. 32+ characters. Required in production with DESKTOP_HOST. */
  DESKTOP_LINK_SECRET: optionalText(z.string().min(32)),
  /** The previous secret, still accepted for verification while links signed with it expire. */
  DESKTOP_LINK_SECRET_PREVIOUS: optionalText(z.string().min(32)),
  /** How long a freshly issued desktop link works, in seconds. */
  DESKTOP_LINK_TTL_S: z.coerce.number().int().min(30).max(900).default(120),
  /** How long the desktop session a link starts lasts, in seconds. */
  DESKTOP_SESSION_TTL_S: z.coerce.number().int().min(300).max(86_400).default(14_400),
  /** Emails that may use the admin procedures. Default: the first allowed email (the owner). */
  ROOKBOX_ADMIN_EMAILS: optionalText(z.string()),
  /** Seconds between reconciler runs against the machine service. 0 (default) is off. */
  RECONCILE_INTERVAL_S: z.coerce.number().int().min(0).max(86_400).default(0),
  /** Let the scheduled reconciler fix rows (drop gone machines, clear stuck operations). */
  RECONCILE_ACT: flag.default(false),
  /** Let it also DELETE machines that have no row. Needs RECONCILE_ACT. Off by default. */
  RECONCILE_KILL_ORPHANS: flag.default(false),
  /** A transitional operation older than this is stuck, in seconds. */
  RECONCILE_STUCK_AFTER_S: z.coerce.number().int().min(60).max(86_400).default(600),
  /** A machine without a row younger than this may be a create in flight, in seconds. */
  RECONCILE_ORPHAN_GRACE_S: z.coerce.number().int().min(60).max(86_400).default(900),
  /** Emails that may have an account. Sign-up over HTTP is always closed. */
  ROOKBOX_ALLOWED_EMAILS: z.string().transform(csv).pipe(z.array(z.email()).min(1)),
  /** When set, the first allowed email gets an account with this password at start, once. */
  ROOKBOX_SEED_OWNER_PASSWORD: z.string().min(12).optional(),

  /** Base URL of SPACE's E2B-compatible API, e.g. https://api.box.rookbox.run. */
  SPACE_ECW_API_URL: z.url(),
  /**
   * The SPACE service key. Optional so the API can start and `/health/space` can say it is
   * missing; every machine call then fails with a credentials error.
   */
  SPACE_ECW_API_KEY: z.string().default(""),
  /** Templates people may create machines from, in the order the dashboard offers them. */
  SPACE_TEMPLATES: z
    .string()
    .default("desktop,corvo-computer,seed")
    .transform(csv)
    .pipe(z.array(z.enum(TEMPLATES)).min(1)),
  /** How long to wait on a SPACE call that waits on a VM (create, suspend, restore, fork). */
  SPACE_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(300_000).default(60_000),
  /** Failed sign-ins allowed per email and per address within the window. */
  SIGNIN_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(100).default(5),
  SIGNIN_WINDOW_S: z.coerce.number().int().min(10).max(86_400).default(600),
  /** The E2B domain: sandboxes live at https://<port>-<id>.<E2B_DOMAIN>. */
  E2B_DOMAIN: z.string().min(1),
  /** Idle seconds before a machine is suspended on its own. */
  MACHINE_IDLE_TIMEOUT_S: z.coerce.number().int().min(60).max(86_400).default(900),
  /**
   * Create machines with open internet (`allowInternetAccess: true`). The host's own default is
   * closed: no DNS, no internet. The host always blocks the metadata address, private ranges and
   * host services either way.
   */
  MACHINE_ALLOW_INTERNET: flag.default(true),
  /** Most machines one account may hold at once (a cost guard). */
  MAX_MACHINES_PER_USER: z.coerce.number().int().min(1).max(100).default(10),
  /**
   * Shared secret the usage reporter signs its requests with. Without it, `POST
   * /ingest/usage-events` answers 503 and no usage is recorded.
   */
  INGEST_SECRET: z.string().min(32, "Use at least 32 characters (openssl rand -hex 32)").optional(),
  /** Emails that may see everyone's usage. Defaults to the owner, the first allowed email. */
  ADMIN_EMAILS: z.string().transform(csv).pipe(z.array(z.email())).optional(),
});

export const EnvSchema = EnvObject.superRefine((env, ctx) => {
  const issue = (path: string, message: string) =>
    ctx.addIssue({ code: "custom", path: [path], message });
  const api = new URL(env.BETTER_AUTH_URL);
  if (env.DESKTOP_HOST) {
    if (env.DESKTOP_HOST === api.host) {
      issue("DESKTOP_HOST", "Must differ from the API's own host: the point is a separate origin");
    }
    if (env.DESKTOP_HOST === new URL(env.APP_ORIGIN).host) {
      issue("DESKTOP_HOST", "Must differ from the dashboard's host");
    }
    if (env.NODE_ENV === "production" && !env.DESKTOP_LINK_SECRET) {
      issue("DESKTOP_LINK_SECRET", "Required in production when DESKTOP_HOST is set");
    }
  }
  if (env.RECONCILE_KILL_ORPHANS && !env.RECONCILE_ACT) {
    issue("RECONCILE_KILL_ORPHANS", "Needs RECONCILE_ACT=true");
  }
  for (const email of csv(env.ROOKBOX_ADMIN_EMAILS ?? "")) {
    if (!z.email().safeParse(email).success) {
      issue("ROOKBOX_ADMIN_EMAILS", `"${email}" is not an email`);
    }
  }
});

export type Env = z.infer<typeof EnvSchema>;

/** Origin of the API. */
export function apiOrigin(env: Pick<Env, "BETTER_AUTH_URL">): string {
  return new URL(env.BETTER_AUTH_URL).origin;
}

/** Origin the desktop is served from: its own host when set, else the API's. */
export function desktopOrigin(env: Pick<Env, "BETTER_AUTH_URL" | "DESKTOP_HOST">): string {
  if (!env.DESKTOP_HOST) return apiOrigin(env);
  return `${new URL(env.BETTER_AUTH_URL).protocol}//${env.DESKTOP_HOST}`;
}

/** Who may use the admin procedures: ROOKBOX_ADMIN_EMAILS, else the owner. */
export function adminEmails(
  env: Pick<Env, "ROOKBOX_ADMIN_EMAILS" | "ROOKBOX_ALLOWED_EMAILS">,
): string[] {
  const listed = csv(env.ROOKBOX_ADMIN_EMAILS ?? "");
  const owner = env.ROOKBOX_ALLOWED_EMAILS[0];
  return listed.length > 0 ? listed : owner ? [owner] : [];
}

/** The per-route budgets from the environment. */
export function routeLimits(env: Env): RouteLimits {
  const named: Record<LimitClass, ClassBudget> = {
    machine_create: env.RATE_LIMIT_MACHINE_CREATE,
    machine_delete: env.RATE_LIMIT_MACHINE_DELETE,
    machine_fork: env.RATE_LIMIT_MACHINE_FORK,
    machine_lifecycle: env.RATE_LIMIT_MACHINE_LIFECYCLE,
    machine_exec: env.RATE_LIMIT_MACHINE_EXEC,
    api_key_create: env.RATE_LIMIT_API_KEY_CREATE,
    desktop_link: env.RATE_LIMIT_DESKTOP_LINK,
    auth: env.RATE_LIMIT_AUTH,
  };
  return Object.fromEntries(LIMIT_CLASSES.map((cls) => [cls, named[cls]])) as RouteLimits;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid environment:\n${lines.join("\n")}`);
  }
  return parsed.data;
}

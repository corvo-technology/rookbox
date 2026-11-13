import { TEMPLATES } from "@rookbox/contracts";
import * as z from "zod";

const csv = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const flag = z
  .enum(["true", "false", "1", "0"])
  .transform((value) => value === "true" || value === "1");

/** Every setting the API reads, validated once at start so a bad deploy fails loudly. */
export const EnvSchema = z.object({
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
  /** Parent domain for the session cookie so the app and the API share it, e.g. .rookbox.run. */
  COOKIE_DOMAIN: z.string().min(1).optional(),
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
  /** Most machines one account may hold at once (a cost guard). */
  MAX_MACHINES_PER_USER: z.coerce.number().int().min(1).max(100).default(10),
});

export type Env = z.infer<typeof EnvSchema>;

/** Origin of the API, which serves the desktop proxy. */
export function apiOrigin(env: Pick<Env, "BETTER_AUTH_URL">): string {
  return new URL(env.BETTER_AUTH_URL).origin;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid environment:\n${lines.join("\n")}`);
  }
  return parsed.data;
}

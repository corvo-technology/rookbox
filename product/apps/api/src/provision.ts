import pg from "pg";

/**
 * NOLOGIN group role the row-level security migration creates. It holds the runtime grants; the
 * login named in DATABASE_URL is a member of it.
 */
export const RUNTIME_ROLE = "rookbox_app";

/** Anything that runs one SQL statement: a `pg` client, or PGlite in the tests. */
export interface SqlRunner {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export type DatabaseUrls = {
  /** What the API connects with at run time. */
  url: string;
  /** What migrations and provisioning run with: DATABASE_MIGRATION_URL, else DATABASE_URL. */
  migrationUrl: string;
  /** False when one login does both, so the policies are bypassed. */
  separate: boolean;
};

const loginOf = (url: string) => decodeURIComponent(new URL(url).username);

export function databaseUrls(env: {
  DATABASE_URL: string;
  DATABASE_MIGRATION_URL?: string | undefined;
}): DatabaseUrls {
  const url = env.DATABASE_URL.trim();
  const migrationUrl = env.DATABASE_MIGRATION_URL?.trim() || url;
  return { url, migrationUrl, separate: loginOf(url) !== loginOf(migrationUrl) };
}

export const SINGLE_LOGIN_WARNING =
  "DATABASE_MIGRATION_URL is not set (or names the same login as DATABASE_URL): migrations and the app share one login, so row-level security is not enforced. Set DATABASE_MIGRATION_URL to the owner and DATABASE_URL to a runtime login (DEPLOY.md, Database roles and row-level security).";

const ident = (name: string) => `"${name.replaceAll('"', '""')}"`;
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

/**
 * Creates or updates the runtime login named in `runtimeUrl`, makes it a member of the group role
 * and (re)applies the group's grants. Idempotent. Runs as the owner after the migrations, so a
 * password changed in DATABASE_URL takes effect on the next start, and tables a later migration
 * creates are granted by the default privileges set here.
 *
 * A login that is a superuser or bypasses RLS is left alone and reported in `warning`.
 */
export async function provisionRuntimeRole(
  owner: SqlRunner,
  runtimeUrl: string,
): Promise<{ warning?: string }> {
  const parsed = new URL(runtimeUrl);
  const login = decodeURIComponent(parsed.username);
  const password = decodeURIComponent(parsed.password);
  if (!login) throw new Error("DATABASE_URL must name the runtime login");
  if (login === RUNTIME_ROLE) {
    throw new Error(
      `DATABASE_URL must name a login that is a member of ${RUNTIME_ROLE}, not ${RUNTIME_ROLE} itself (it is NOLOGIN)`,
    );
  }
  const group = ident(RUNTIME_ROLE);

  const exists = await owner.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [RUNTIME_ROLE]);
  if (exists.rows.length === 0) {
    // The migration normally creates it; this covers a restore into a fresh cluster (roles are
    // not part of a dump).
    try {
      await owner.query(
        `CREATE ROLE ${group} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`,
      );
    } catch (error) {
      throw new Error(
        `Could not create role ${RUNTIME_ROLE}; the owner login needs CREATEROLE, or create it NOLOGIN NOBYPASSRLS yourself`,
        { cause: error },
      );
    }
  }

  const statements = [
    `GRANT USAGE ON SCHEMA public TO ${group}`,
    `REVOKE CREATE ON SCHEMA public FROM ${group}`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${group}`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${group}`,
    // Append-only: events are inserted, never rewritten or removed by the app.
    `REVOKE UPDATE, DELETE ON TABLE "usage_event" FROM ${group}`,
    // Tables and sequences later migrations create (run by this same owner).
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${group}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${group}`,
    `DO $$ BEGIN EXECUTE format('GRANT CONNECT ON DATABASE %I TO ${RUNTIME_ROLE}', current_database()); END $$`,
  ];
  for (const sql of statements) await owner.query(sql);
  // The migrations ledger is the owner's. REVOKE fails on a table that does not exist.
  const ledger = await owner.query("SELECT to_regclass('public._prisma_migrations') AS t");
  if (ledger.rows[0]?.t) {
    await owner.query(`REVOKE ALL ON TABLE "_prisma_migrations" FROM ${group}`);
  }

  const existing = (
    await owner.query("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1", [login])
  ).rows[0] as { rolsuper: boolean; rolbypassrls: boolean } | undefined;
  if (existing && (existing.rolsuper || existing.rolbypassrls)) {
    return {
      warning: `DATABASE_URL logs in as ${login}, which ${existing.rolsuper ? "is a superuser" : "bypasses row-level security"}; row-level security is not enforced.`,
    };
  }

  const admin = (
    await owner.query(
      "SELECT rolsuper OR rolcreaterole AS can, rolsuper AS superuser FROM pg_roles WHERE rolname = current_user",
    )
  ).rows[0] as { can: boolean; superuser: boolean } | undefined;
  const member =
    existing !== undefined &&
    (await owner.query("SELECT pg_has_role($1, $2, 'USAGE') AS member", [login, RUNTIME_ROLE]))
      .rows[0]?.member === true;
  const cannotChange = () =>
    new Error(
      `The owner login cannot create or change ${login}. Create it (LOGIN NOBYPASSRLS) and GRANT ${RUNTIME_ROLE} TO it, then deploy again.`,
    );
  if (!admin?.can) {
    // Managed Postgres without CREATEROLE: an administrator made the login and granted the group.
    if (member) return {};
    throw cannotChange();
  }

  const name = ident(login);
  const secret = password ? `PASSWORD ${literal(password)}` : "";
  // Only a superuser may name SUPERUSER, BYPASSRLS or REPLICATION, even as NO...; a CREATEROLE
  // owner leaves them at their defaults (off).
  const limits = admin.superuser
    ? "NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION"
    : "";
  try {
    await owner.query(`${existing ? "ALTER" : "CREATE"} ROLE ${name} LOGIN ${secret} ${limits}`);
    await owner.query(`GRANT ${group} TO ${name}`);
  } catch (error) {
    if ((error as { code?: string }).code === "42501") {
      if (member) return {};
      throw Object.assign(cannotChange(), { cause: error });
    }
    throw error;
  }
  return {};
}

/** Connects with `migrationUrl`, provisions, disconnects. */
export async function provisionDatabase(urls: DatabaseUrls): Promise<{ warning?: string }> {
  if (!urls.separate) return { warning: SINGLE_LOGIN_WARNING };
  const client = new pg.Client({ connectionString: urls.migrationUrl });
  await client.connect();
  try {
    return await provisionRuntimeRole(client, urls.url);
  } finally {
    await client.end();
  }
}

export type RowSecurityStatus = { enforced: boolean; role: string; reason?: string };

/** Whether the connected login is actually subject to the policies. */
export async function describeRowSecurity(db: SqlRunner): Promise<RowSecurityStatus> {
  const row = (
    await db.query(
      `SELECT current_user AS role, r.rolsuper, r.rolbypassrls,
          pg_has_role(current_user, c.relowner, 'USAGE') AS owns
        FROM pg_roles r, pg_class c
        WHERE r.rolname = current_user AND c.oid = 'public.machine'::regclass`,
    )
  ).rows[0] as
    | { role: string; rolsuper: boolean; rolbypassrls: boolean; owns: boolean }
    | undefined;
  if (!row) return { enforced: false, role: "unknown", reason: "could not be read" };
  const reason = row.rolsuper
    ? "is a superuser"
    : row.rolbypassrls
      ? "has BYPASSRLS"
      : row.owns
        ? "owns the tables"
        : undefined;
  return { enforced: !reason, role: row.role, ...(reason ? { reason } : {}) };
}

/** The startup warning for a login that bypasses the policies, if any. */
export function rowSecurityWarning(status: RowSecurityStatus): string | undefined {
  if (status.enforced) return undefined;
  return `Row-level security is not enforced: the app connects as ${status.role}, which ${status.reason}. Point DATABASE_URL at a runtime login and DATABASE_MIGRATION_URL at the owner (DEPLOY.md, Database roles and row-level security).`;
}

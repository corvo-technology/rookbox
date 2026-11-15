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
 * The one list of privileges the runtime needs. It is applied to the group role and, when the
 * owner may not grant membership of the group, to the login directly, so the two cannot drift.
 * `target` is an already-quoted identifier.
 */
export async function applyRuntimePrivileges(owner: SqlRunner, target: string): Promise<void> {
  const statements = [
    `GRANT USAGE ON SCHEMA public TO ${target}`,
    `REVOKE CREATE ON SCHEMA public FROM ${target}`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${target}`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${target}`,
    // Append-only: events are inserted, never rewritten or removed by the app.
    `REVOKE UPDATE, DELETE ON TABLE "usage_event" FROM ${target}`,
    // Tables and sequences later migrations create (run by this same owner).
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${target}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${target}`,
  ];
  const database = (await owner.query("SELECT current_database() AS name")).rows[0]?.name;
  statements.push(`GRANT CONNECT ON DATABASE ${ident(String(database))} TO ${target}`);
  for (const sql of statements) await owner.query(sql);
  // The migrations ledger is the owner's. REVOKE fails on a table that does not exist.
  const ledger = await owner.query("SELECT to_regclass('public._prisma_migrations') AS t");
  if (ledger.rows[0]?.t) {
    await owner.query(`REVOKE ALL ON TABLE "_prisma_migrations" FROM ${target}`);
  }
}

export type ProvisionMode = "group membership" | "direct grants";

/**
 * Creates or updates the runtime login named in `runtimeUrl`, makes it a member of the group role
 * and (re)applies the group's grants. Idempotent. Runs as the owner after the migrations, so a
 * password changed in DATABASE_URL takes effect on the next start, and tables a later migration
 * creates are granted by the default privileges set here.
 *
 * Membership of the group is preferred. When the owner administers no such membership (a
 * CREATEROLE role can only grant roles it has ADMIN OPTION on, and the group may have been created
 * by someone else) the same privileges are granted to the login directly and `mode` says so.
 *
 * A login that is a superuser or bypasses RLS is left alone and reported in `warning`.
 */
export async function provisionRuntimeRole(
  owner: SqlRunner,
  runtimeUrl: string,
): Promise<{ warning?: string; mode?: ProvisionMode }> {
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

  // The group role first: the owner owns the tables, so it can always grant on them. A login that
  // cannot join the group (below) gets the same list directly.
  await applyRuntimePrivileges(owner, group);

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
      `The owner login cannot create or change ${login}. Create it (LOGIN NOBYPASSRLS) and GRANT ${RUNTIME_ROLE} TO it (or let the owner grant it directly), then deploy again.`,
    );
  const direct = async (name: string): Promise<{ mode: ProvisionMode }> => {
    await applyRuntimePrivileges(owner, name);
    return { mode: "direct grants" };
  };
  const name = ident(login);
  if (!admin?.can) {
    // Managed Postgres without CREATEROLE: an administrator made the login.
    if (member) return { mode: "group membership" };
    if (existing) return direct(name);
    throw cannotChange();
  }

  const secret = password ? `PASSWORD ${literal(password)}` : "";
  // Only a superuser may name SUPERUSER, BYPASSRLS or REPLICATION, even as NO...; a CREATEROLE
  // owner leaves them at their defaults (off).
  const limits = admin.superuser
    ? "NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION"
    : "";
  try {
    await owner.query(`${existing ? "ALTER" : "CREATE"} ROLE ${name} LOGIN ${secret} ${limits}`);
  } catch (error) {
    if ((error as { code?: string }).code === "42501") {
      if (member) return { mode: "group membership" };
      if (existing) return direct(name);
      throw Object.assign(cannotChange(), { cause: error });
    }
    throw error;
  }
  if (member) return { mode: "group membership" };
  try {
    await owner.query(`GRANT ${group} TO ${name}`);
    return { mode: "group membership" };
  } catch (error) {
    if ((error as { code?: string }).code === "42501") return direct(name);
    throw error;
  }
}

/** Connects with `migrationUrl`, provisions, disconnects. */
export async function provisionDatabase(
  urls: DatabaseUrls,
): Promise<{ warning?: string; mode?: ProvisionMode }> {
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
          pg_has_role(current_user, c.relowner, 'USAGE') AS owns,
          has_table_privilege(current_user, c.oid, 'SELECT,INSERT,UPDATE,DELETE') AS dml
        FROM pg_roles r, pg_class c
        WHERE r.rolname = current_user AND c.oid = 'public.machine'::regclass`,
    )
  ).rows[0] as
    | { role: string; rolsuper: boolean; rolbypassrls: boolean; owns: boolean; dml: boolean }
    | undefined;
  if (!row) return { enforced: false, role: "unknown", reason: "could not be read" };
  const reason = row.rolsuper
    ? "is a superuser"
    : row.rolbypassrls
      ? "has BYPASSRLS"
      : row.owns
        ? "owns the tables"
        : !row.dml
          ? "lacks the table privileges it needs (neither group membership nor direct grants)"
          : undefined;
  return { enforced: !reason, role: row.role, ...(reason ? { reason } : {}) };
}

/** The startup warning for a login that bypasses the policies, if any. */
export function rowSecurityWarning(status: RowSecurityStatus): string | undefined {
  if (status.enforced) return undefined;
  return `Row-level security is not enforced: the app connects as ${status.role}, which ${status.reason}. Point DATABASE_URL at a runtime login and DATABASE_MIGRATION_URL at the owner (DEPLOY.md, Database roles and row-level security).`;
}

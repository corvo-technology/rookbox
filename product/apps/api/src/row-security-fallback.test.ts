// Production situation: the group role rookbox_app exists but the owner login (CREATEROLE, not a
// superuser) holds no ADMIN OPTION on it, so `GRANT rookbox_app TO <login>` is denied. Provisioning
// must fall back to direct grants, and the policies must still bind the runtime login.
import type { PGlite, Transaction } from "@electric-sql/pglite";
import { PGlite as Lite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readMigrations } from "./migrate.js";
import {
  apiKeySql,
  MIGRATIONS_DIR,
  machineSql,
  RUNTIME_LOGIN,
  RUNTIME_URL,
  runner,
  seedTwoUsers,
} from "./pglite-support.js";
import { describeRowSecurity, provisionRuntimeRole, RUNTIME_ROLE } from "./provision.js";

const OWNER = "rookbox_owner";
let lite: PGlite;

/** Provisioning as the non-superuser owner, the way the API runs it. */
async function provisionAsOwner(url: string) {
  await lite.exec(`SET ROLE ${OWNER}`);
  try {
    return await provisionRuntimeRole(runner(lite), url);
  } finally {
    await lite.exec("RESET ROLE");
  }
}

beforeAll(async () => {
  lite = await Lite.create();
  // The superuser creates the schema (and so the group role, with no grant to the owner).
  for (const migration of await readMigrations(MIGRATIONS_DIR)) await lite.exec(migration.sql);
  await lite.exec(
    `CREATE TABLE "_prisma_migrations" ("id" TEXT PRIMARY KEY, "migration_name" TEXT)`,
  );
  // The owner: CREATEROLE, not a superuser, owns every table and sequence.
  await lite.exec(`CREATE ROLE ${OWNER} LOGIN CREATEROLE NOSUPERUSER NOBYPASSRLS`);
  await lite.exec(`GRANT CREATE, USAGE ON SCHEMA public TO ${OWNER}`);
  const objects = (
    await lite.query(
      `SELECT c.relname, c.relkind FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p')`,
    )
  ).rows as { relname: string; relkind: string }[];
  for (const { relname, relkind } of objects) {
    await lite.exec(
      `ALTER ${relkind === "S" ? "SEQUENCE" : "TABLE"} "${relname}" OWNER TO ${OWNER}`,
    );
  }
});
afterAll(async () => {
  await lite.close();
});

async function as<T>(
  context: "system" | "none" | { user: string },
  fn: (tx: Transaction) => Promise<T>,
) {
  await lite.exec(`SET ROLE ${RUNTIME_LOGIN}`);
  try {
    return await lite.transaction(async (tx) => {
      if (context !== "none") {
        const user = context === "system" ? "" : context.user;
        const bypass = context === "system" ? "on" : "off";
        await tx.query(
          "SELECT set_config('app.user_id', $1, true), set_config('app.rls_bypass', $2, true)",
          [user, bypass],
        );
      }
      return fn(tx);
    });
  } finally {
    await lite.exec("RESET ROLE");
  }
}

const ids = async (tx: Transaction, table: string) =>
  ((await tx.query(`SELECT "id" FROM "${table}" ORDER BY "id"`)).rows as { id: string }[]).map(
    (row) => row.id,
  );

describe("the owner cannot grant the group role", () => {
  beforeAll(async () => {
    // Reproduces the cause: the group exists, the owner administers nothing.
    expect(
      (await lite.query(`SELECT 1 FROM pg_auth_members WHERE roleid = '${RUNTIME_ROLE}'::regrole`))
        .rows,
    ).toEqual([]);
    await lite.exec(`SET ROLE ${OWNER}`);
    await expect(
      lite.exec(`CREATE ROLE rbx_probe LOGIN; GRANT ${RUNTIME_ROLE} TO rbx_probe`),
    ).rejects.toThrow(/permission denied/);
    await lite.exec("RESET ROLE");
    await lite.exec("DROP ROLE IF EXISTS rbx_probe");
  });

  it("falls back to direct grants, idempotently, and rotates the password", async () => {
    expect(await provisionAsOwner(RUNTIME_URL)).toEqual({ mode: "direct grants" });
    expect(await provisionAsOwner(RUNTIME_URL)).toEqual({ mode: "direct grants" });
    expect(
      await provisionAsOwner(`postgres://${RUNTIME_LOGIN}:another%20secret@localhost/rookbox`),
    ).toEqual({ mode: "direct grants" });
    const member = (
      await lite.query(`SELECT pg_has_role('${RUNTIME_LOGIN}', '${RUNTIME_ROLE}', 'USAGE') AS m`)
    ).rows;
    expect(member).toEqual([{ m: false }]);
  });

  describe("the runtime login still obeys row-level security", () => {
    beforeEach(async () => {
      await provisionAsOwner(RUNTIME_URL);
      await lite.exec(
        `TRUNCATE "machine","api_key","session","account","verification","usage_event","usage_interval","usage_reporter","waitlist_entry","user" CASCADE`,
      );
      await seedTwoUsers(lite);
      await lite.exec(
        `INSERT INTO "usage_reporter" ("id","lastContactAt") VALUES ('r1', now());
         INSERT INTO "usage_event" ("reporterId","seq","idempotencyKey","type","machineId","observedAt","template","vcpu","memoryMib","diskMib")
           VALUES ('r1', 1, 'k1', 'seen', 'm-a', now(), 'desktop-v2', 1, 1024, 4096);`,
      );
    });

    it("isolates users, and sees nothing without a context", async () => {
      await as({ user: "user-a" }, async (tx) => {
        expect(await ids(tx, "machine")).toEqual(["m-a"]);
        expect(await ids(tx, "api_key")).toEqual(["k-a"]);
        expect(
          (await tx.query(`UPDATE "machine" SET "name" = 'x' WHERE "id" = 'm-b'`)).affectedRows,
        ).toBe(0);
      });
      await as({ user: "user-b" }, async (tx) => {
        expect(await ids(tx, "machine")).toEqual(["m-b"]);
      });
      await as("none", async (tx) => {
        expect(await ids(tx, "machine")).toEqual([]);
      });
      await expect(
        as({ user: "user-a" }, (tx) => tx.query(machineSql("m-evil", "user-b"))),
      ).rejects.toThrow(/row-level security/);
      await expect(
        as({ user: "user-a" }, (tx) => tx.query(apiKeySql("k-evil", "user-b"))),
      ).rejects.toThrow(/row-level security/);
    });

    it("a system context sees all rows", async () => {
      await as("system", async (tx) => {
        expect(await ids(tx, "machine")).toEqual(["m-a", "m-b"]);
      });
    });

    it("cannot create tables or touch the migrations ledger, usage_event is append-only", async () => {
      await expect(as("system", (tx) => tx.query(`CREATE TABLE "evil" (id int)`))).rejects.toThrow(
        /permission denied/,
      );
      await expect(
        as("system", (tx) => tx.query(`SELECT * FROM "_prisma_migrations"`)),
      ).rejects.toThrow(/permission denied/);
      await expect(
        as("system", (tx) => tx.query(`UPDATE "usage_event" SET "state" = 'running'`)),
      ).rejects.toThrow(/permission denied/);
      await expect(as("system", (tx) => tx.query(`DELETE FROM "usage_event"`))).rejects.toThrow(
        /permission denied/,
      );
      await as("system", (tx) => tx.query(`SELECT * FROM "usage_event"`));
    });

    it("covers tables the owner creates later", async () => {
      await lite.exec(`SET ROLE ${OWNER}`);
      await lite.exec(`CREATE TABLE "later" ("id" int PRIMARY KEY)`);
      await lite.exec("RESET ROLE");
      await as("none", async (tx) => {
        expect((await tx.query(`SELECT * FROM "later"`)).rows).toEqual([]);
      });
      await lite.exec(`DROP TABLE "later"`);
    });

    it("is reported as enforced without group membership", async () => {
      await lite.exec(`SET ROLE ${RUNTIME_LOGIN}`);
      const status = await describeRowSecurity(runner(lite)).finally(() => lite.exec("RESET ROLE"));
      expect(status).toEqual({ enforced: true, role: RUNTIME_LOGIN });
    });
  });

  it("does not break a login that already has the group membership", async () => {
    await lite.exec(`DROP OWNED BY ${RUNTIME_LOGIN}; DROP ROLE ${RUNTIME_LOGIN}`);
    // A superuser (the earlier path) made it a member.
    await lite.exec(
      `CREATE ROLE ${RUNTIME_LOGIN} LOGIN; GRANT ${RUNTIME_ROLE} TO ${RUNTIME_LOGIN}`,
    );
    expect(await provisionAsOwner(RUNTIME_URL)).toEqual({ mode: "group membership" });
  });
});

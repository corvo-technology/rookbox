// The policies, proven on a real PostgreSQL engine (PGlite) with the real migrations and the real
// provisioning step, connected as the runtime role the API uses in production.
import type { PGlite, Transaction } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  apiKeySql,
  createDatabase,
  machineSql,
  RUNTIME_LOGIN,
  RUNTIME_URL,
  runner,
  seedTwoUsers,
  userSql,
} from "./pglite-support.js";
import {
  databaseUrls,
  describeRowSecurity,
  provisionRuntimeRole,
  RUNTIME_ROLE,
  rowSecurityWarning,
} from "./provision.js";

type Context = { user: string } | "system" | "none";

let lite: PGlite;

beforeAll(async () => {
  lite = await createDatabase();
});
afterAll(async () => {
  await lite.close();
});

/**
 * One transaction as the runtime login, with the settings the API sets as its first statement
 * (`set_config(..., true)`), or none.
 */
async function as<T>(context: Context, fn: (tx: Transaction) => Promise<T>): Promise<T> {
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

const owned = async (sql: string) => (await lite.query(sql)).rows as Record<string, unknown>[];

beforeEach(async () => {
  await lite.exec(
    `TRUNCATE "machine","api_key","session","account","verification","usage_event","usage_interval","usage_reporter","waitlist_entry","user" CASCADE`,
  );
  await seedTwoUsers(lite);
  await lite.exec(
    `INSERT INTO "session" ("id","expiresAt","token","updatedAt","userId") VALUES ('s-a', now(), 'tok-a', now(), 'user-a');
     INSERT INTO "account" ("id","accountId","providerId","userId","password","updatedAt") VALUES ('acc-a','a','credential','user-a','hash', now());
     INSERT INTO "verification" ("id","identifier","value","expiresAt") VALUES ('v1','a@example.test','123456', now());
     INSERT INTO "waitlist_entry" ("email") VALUES ('wait@example.test');
     INSERT INTO "usage_reporter" ("id","lastContactAt") VALUES ('r1', now());
     INSERT INTO "usage_event" ("reporterId","seq","idempotencyKey","type","machineId","observedAt","template","vcpu","memoryMib","diskMib")
       VALUES ('r1', 1, 'k1', 'seen', 'm-a', now(), 'desktop-v2', 1, 1024, 4096);
     INSERT INTO "usage_interval" ("machineId","ownerUserId","template","vcpu","memoryMib","diskMib","state","startedAt")
       VALUES ('m-a','user-a','desktop-v2',1,1024,4096,'running', now()), ('m-b','user-b','desktop-v2',1,1024,4096,'running', now()), ('m-x',NULL,'desktop-v2',1,1024,4096,'running', now());`,
  );
});

describe("a user context", () => {
  it("reads only its own machines and api keys", async () => {
    await as({ user: "user-a" }, async (tx) => {
      expect(await ids(tx, "machine")).toEqual(["m-a"]);
      expect(await ids(tx, "api_key")).toEqual(["k-a"]);
    });
    await as({ user: "user-b" }, async (tx) => {
      expect(await ids(tx, "machine")).toEqual(["m-b"]);
      expect(await ids(tx, "api_key")).toEqual(["k-b"]);
    });
  });

  it("cannot see another user's row even by its exact id", async () => {
    await as({ user: "user-a" }, async (tx) => {
      expect((await tx.query(`SELECT 1 FROM "machine" WHERE "id" = 'm-b'`)).rows).toHaveLength(0);
      expect((await tx.query(`SELECT 1 FROM "api_key" WHERE "id" = 'k-b'`)).rows).toHaveLength(0);
    });
  });

  it("cannot update or delete another user's rows", async () => {
    await as({ user: "user-a" }, async (tx) => {
      const update = await tx.query(`UPDATE "machine" SET "name" = 'hijacked' WHERE "id" = 'm-b'`);
      expect(update.affectedRows).toBe(0);
      const revoke = await tx.query(`UPDATE "api_key" SET "revokedAt" = now() WHERE "id" = 'k-b'`);
      expect(revoke.affectedRows).toBe(0);
      expect((await tx.query(`DELETE FROM "machine" WHERE "id" = 'm-b'`)).affectedRows).toBe(0);
      expect((await tx.query(`DELETE FROM "api_key" WHERE "id" = 'k-b'`)).affectedRows).toBe(0);
    });
    expect(await owned(`SELECT "name" FROM "machine" WHERE "id" = 'm-b'`)).toEqual([
      { name: "name-m-b" },
    ]);
    expect(await owned(`SELECT "revokedAt" FROM "api_key" WHERE "id" = 'k-b'`)).toEqual([
      { revokedAt: null },
    ]);
  });

  it("can update and delete its own rows", async () => {
    await as({ user: "user-a" }, async (tx) => {
      expect(
        (await tx.query(`UPDATE "machine" SET "name" = 'mine' WHERE "id" = 'm-a'`)).affectedRows,
      ).toBe(1);
      expect((await tx.query(`DELETE FROM "api_key" WHERE "id" = 'k-a'`)).affectedRows).toBe(1);
    });
  });

  it("cannot insert a row for another owner, nor move its own row to one", async () => {
    await expect(
      as({ user: "user-a" }, (tx) => tx.query(machineSql("m-evil", "user-b"))),
    ).rejects.toThrow(/row-level security/);
    await expect(
      as({ user: "user-a" }, (tx) => tx.query(apiKeySql("k-evil", "user-b"))),
    ).rejects.toThrow(/row-level security/);
    await expect(
      as({ user: "user-a" }, (tx) =>
        tx.query(`UPDATE "machine" SET "ownerId" = 'user-b' WHERE "id" = 'm-a'`),
      ),
    ).rejects.toThrow(/row-level security/);
    await as({ user: "user-a" }, (tx) => tx.query(machineSql("m-ok", "user-a")));
  });

  it("sees no credentials, tokens, waitlist or usage reporter data", async () => {
    await as({ user: "user-a" }, async (tx) => {
      for (const table of [
        "session",
        "account",
        "verification",
        "waitlist_entry",
        "usage_event",
        "usage_reporter",
      ]) {
        expect(await ids(tx, table), table).toEqual([]);
      }
    });
  });

  it("cannot write the system-only tables", async () => {
    await expect(
      as({ user: "user-a" }, (tx) =>
        tx.query(`INSERT INTO "waitlist_entry" ("email") VALUES ('x@example.test')`),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      as({ user: "user-a" }, (tx) =>
        tx.query(
          `INSERT INTO "session" ("id","expiresAt","token","updatedAt","userId") VALUES ('s-x', now(), 'tok-x', now(), 'user-a')`,
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("reads its own account row and own usage, and nobody else's", async () => {
    await as({ user: "user-a" }, async (tx) => {
      expect(await ids(tx, "user")).toEqual(["user-a"]);
      const usage = (await tx.query(`SELECT "machineId" FROM "usage_interval"`)).rows as {
        machineId: string;
      }[];
      expect(usage.map((row) => row.machineId)).toEqual(["m-a"]);
    });
  });

  it("cannot change its account row or write usage", async () => {
    await as({ user: "user-a" }, async (tx) => {
      const update = await tx.query(
        `UPDATE "user" SET "disabledAt" = NULL, "name" = 'x' WHERE "id" = 'user-a'`,
      );
      expect(update.affectedRows).toBe(0);
      expect((await tx.query(`UPDATE "usage_interval" SET "seconds" = 1`)).affectedRows).toBe(0);
    });
    await expect(
      as({ user: "user-a" }, (tx) =>
        tx.query(
          `INSERT INTO "usage_interval" ("machineId","ownerUserId","template","vcpu","memoryMib","diskMib","state","startedAt") VALUES ('m-a','user-a','t',1,1,1,'running', now())`,
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("an empty user id matches nothing", async () => {
    await as({ user: "" }, async (tx) => {
      expect(await ids(tx, "machine")).toEqual([]);
    });
  });
});

describe("no context", () => {
  it("returns zero rows from every table", async () => {
    await as("none", async (tx) => {
      for (const table of [
        "machine",
        "api_key",
        "user",
        "session",
        "account",
        "verification",
        "waitlist_entry",
        "usage_event",
        "usage_interval",
        "usage_reporter",
      ]) {
        expect((await tx.query(`SELECT 1 FROM "${table}"`)).rows, table).toEqual([]);
      }
    });
  });

  it("rejects writes", async () => {
    await expect(as("none", (tx) => tx.query(machineSql("m-n", "user-a")))).rejects.toThrow(
      /row-level security/,
    );
    await expect(as("none", (tx) => tx.query(apiKeySql("k-n", "user-a")))).rejects.toThrow(
      /row-level security/,
    );
    await expect(as("none", (tx) => tx.query(userSql("user-n")))).rejects.toThrow(
      /row-level security/,
    );
    const update = await as("none", (tx) => tx.query(`UPDATE "machine" SET "name" = 'x'`));
    expect(update.affectedRows).toBe(0);
    const del = await as("none", (tx) => tx.query(`DELETE FROM "machine"`));
    expect(del.affectedRows).toBe(0);
  });
});

describe("a system context", () => {
  it("sees and writes everything", async () => {
    await as("system", async (tx) => {
      expect(await ids(tx, "machine")).toEqual(["m-a", "m-b"]);
      expect(await ids(tx, "api_key")).toEqual(["k-a", "k-b"]);
      expect(await ids(tx, "user")).toEqual(["user-a", "user-b"]);
      expect(await ids(tx, "session")).toEqual(["s-a"]);
      expect(await ids(tx, "account")).toEqual(["acc-a"]);
      expect(await ids(tx, "waitlist_entry")).toHaveLength(1);
      await tx.query(machineSql("m-sys", "user-b"));
      expect(
        (await tx.query(`UPDATE "machine" SET "name" = 'by-system' WHERE "id" = 'm-b'`))
          .affectedRows,
      ).toBe(1);
    });
  });

  it("still cannot rewrite or remove usage events (append-only grants)", async () => {
    await expect(
      as("system", (tx) => tx.query(`UPDATE "usage_event" SET "state" = 'running'`)),
    ).rejects.toThrow(/permission denied/);
    await expect(as("system", (tx) => tx.query(`DELETE FROM "usage_event"`))).rejects.toThrow(
      /permission denied/,
    );
    await as("system", (tx) =>
      tx.query(
        `INSERT INTO "usage_event" ("reporterId","seq","idempotencyKey","type","machineId","observedAt","template","vcpu","memoryMib","diskMib") VALUES ('r1', 2, 'k2', 'seen', 'm-a', now(), 't', 1, 1, 1)`,
      ),
    );
  });
});

describe("transaction-local settings (a transaction-mode pooler reuses connections)", () => {
  it("do not outlive the transaction that set them", async () => {
    await as({ user: "user-a" }, async (tx) => {
      expect(await ids(tx, "machine")).toEqual(["m-a"]);
    });
    // The next transaction on the same connection sets nothing: it must not inherit user-a.
    await as("none", async (tx) => {
      const settings = (
        await tx.query(
          `SELECT current_setting('app.user_id', true) AS u, current_setting('app.rls_bypass', true) AS b`,
        )
      ).rows[0] as { u: string | null; b: string | null };
      expect(settings.u || "").toBe("");
      expect(settings.b || "").not.toBe("on");
      expect(await ids(tx, "machine")).toEqual([]);
    });
  });

  it("do not leak a system context into the next transaction", async () => {
    await as("system", async (tx) => {
      expect(await ids(tx, "machine")).toHaveLength(2);
    });
    await as("none", async (tx) => {
      expect(await ids(tx, "machine")).toEqual([]);
    });
  });

  it("a second user on the same connection sees only itself", async () => {
    await as({ user: "user-a" }, (tx) => ids(tx, "machine"));
    await as({ user: "user-b" }, async (tx) => {
      expect(await ids(tx, "machine")).toEqual(["m-b"]);
    });
  });

  it("a rolled-back transaction leaves nothing behind either", async () => {
    await expect(
      as({ user: "user-a" }, async (tx) => {
        await tx.query(`SELECT 1 FROM "no_such_table"`);
      }),
    ).rejects.toThrow();
    await as("none", async (tx) => {
      expect(await ids(tx, "machine")).toEqual([]);
    });
  });
});

describe("the runtime role's privileges", () => {
  it("cannot create tables, nor read or write the migrations ledger", async () => {
    await expect(as("system", (tx) => tx.query(`CREATE TABLE "evil" (id int)`))).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      as("system", (tx) => tx.query(`SELECT * FROM "_prisma_migrations"`)),
    ).rejects.toThrow(/permission denied/);
    await expect(
      as("system", (tx) => tx.query(`DELETE FROM "_prisma_migrations"`)),
    ).rejects.toThrow(/permission denied/);
  });

  it("cannot switch the policies off or take the tables over", async () => {
    await expect(
      as("system", (tx) => tx.query(`ALTER TABLE "machine" DISABLE ROW LEVEL SECURITY`)),
    ).rejects.toThrow(/must be owner/);
    await expect(
      as("system", (tx) => tx.query(`DROP POLICY machine_tenant ON "machine"`)),
    ).rejects.toThrow(/must be owner/);
    await expect(
      as("system", (tx) => tx.query(`ALTER ROLE ${RUNTIME_LOGIN} BYPASSRLS`)),
    ).rejects.toThrow(/permission denied|must be superuser/);
  });

  it("is a plain login, member of a NOLOGIN group with no special attributes", async () => {
    const roles = await owned(
      `SELECT rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolcanlogin FROM pg_roles WHERE rolname IN ('${RUNTIME_ROLE}', '${RUNTIME_LOGIN}') ORDER BY rolname`,
    );
    expect(roles).toEqual([
      {
        rolname: RUNTIME_ROLE,
        rolsuper: false,
        rolbypassrls: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolcanlogin: false,
      },
      {
        rolname: RUNTIME_LOGIN,
        rolsuper: false,
        rolbypassrls: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolcanlogin: true,
      },
    ]);
    expect(
      await owned(`SELECT pg_has_role('${RUNTIME_LOGIN}', '${RUNTIME_ROLE}', 'USAGE') AS m`),
    ).toEqual([{ m: true }]);
  });

  it("is reported as enforced; the owner is reported as not", async () => {
    await lite.exec(`SET ROLE ${RUNTIME_LOGIN}`);
    const runtime = await describeRowSecurity(runner(lite)).finally(() => lite.exec("RESET ROLE"));
    expect(runtime).toEqual({ enforced: true, role: RUNTIME_LOGIN });
    expect(rowSecurityWarning(runtime)).toBeUndefined();

    const owner = await describeRowSecurity(runner(lite));
    expect(owner.enforced).toBe(false);
    expect(rowSecurityWarning(owner)).toMatch(/Row-level security is not enforced/);
  });

  it("every table the migrations create has row-level security on", async () => {
    const unprotected = await owned(
      `SELECT c.relname FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p') AND NOT c.relrowsecurity AND c.relname <> '_prisma_migrations'`,
    );
    expect(unprotected).toEqual([]);
  });
});

describe("provisioning", () => {
  it("is idempotent, changes the password and covers tables created later", async () => {
    const again = await provisionRuntimeRole(runner(lite), RUNTIME_URL);
    expect(again).toEqual({});
    const rotated = await provisionRuntimeRole(
      runner(lite),
      `postgres://${RUNTIME_LOGIN}:another%20secret@localhost/rookbox`,
    );
    expect(rotated).toEqual({});

    await lite.exec(`CREATE TABLE "later" ("id" int PRIMARY KEY)`);
    await as("none", async (tx) => {
      expect((await tx.query(`SELECT * FROM "later"`)).rows).toEqual([]);
    });
    await lite.exec(`DROP TABLE "later"`);
  });

  it("refuses a login that is not a plain runtime login", async () => {
    await expect(
      provisionRuntimeRole(runner(lite), `postgres://${RUNTIME_ROLE}:x@localhost/rookbox`),
    ).rejects.toThrow(/not .*itself|NOLOGIN/);
    await expect(
      provisionRuntimeRole(runner(lite), "postgres://localhost/rookbox"),
    ).rejects.toThrow(/name the runtime login/);
  });

  it("reports a superuser login instead of using it", async () => {
    const result = await provisionRuntimeRole(
      runner(lite),
      "postgres://postgres:x@localhost/rookbox",
    );
    expect(result.warning).toMatch(/superuser/);
  });

  it("quotes a hostile login name and password", async () => {
    const result = await provisionRuntimeRole(
      runner(lite),
      `postgres://${encodeURIComponent('odd"login')}:${encodeURIComponent("pa'ss\\word")}@localhost/rookbox`,
    );
    expect(result).toEqual({});
    expect(await owned(`SELECT rolname FROM pg_roles WHERE rolname = 'odd"login'`)).toHaveLength(1);
  });
});

describe("databaseUrls", () => {
  it("falls back to DATABASE_URL, as one login that is not separate", () => {
    const urls = databaseUrls({ DATABASE_URL: "postgres://app:x@h/db" });
    expect(urls).toEqual({
      url: "postgres://app:x@h/db",
      migrationUrl: "postgres://app:x@h/db",
      separate: false,
    });
  });

  it("is separate when the logins differ", () => {
    const urls = databaseUrls({
      DATABASE_URL: "postgres://app:x@h/db",
      DATABASE_MIGRATION_URL: "postgres://owner:y@h/db",
    });
    expect(urls.separate).toBe(true);
    expect(urls.migrationUrl).toBe("postgres://owner:y@h/db");
  });

  it("is not separate when both name the same login", () => {
    const urls = databaseUrls({
      DATABASE_URL: "postgres://o:x@h/db",
      DATABASE_MIGRATION_URL: "postgres://o:y@h2/db",
    });
    expect(urls.separate).toBe(false);
  });
});

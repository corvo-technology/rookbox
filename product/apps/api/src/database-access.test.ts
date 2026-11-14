// The real Prisma client (with the real extension, stores and driver adapter) against a real
// PostgreSQL engine (PGlite behind its socket server), connected as the runtime role.
import type { AddressInfo } from "node:net";
import type { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaApiKeyStore } from "./api-keys.js";
import {
  asSystem,
  currentDbContext,
  inTransaction,
  MissingDatabaseContextError,
  settingsFor,
  systemStore,
  withRowLevelSecurity,
  withUser,
} from "./database-access.js";
import { PrismaClient } from "./generated/prisma/client.js";
import { createPrismaMachineStore } from "./machines/store.js";
import { createDatabase, RUNTIME_LOGIN, seedTwoUsers } from "./pglite-support.js";
import { createPrismaUsageStore } from "./usage/prisma-store.js";
import { createPrismaUserStore } from "./users.js";
import { createPrismaWaitlistStore } from "./waitlist.js";

let lite: PGlite;
let server: PGLiteSocketServer;
let pool: pg.Pool;
let db: PrismaClient;
/** Every statement the pool sent, in order, with the transaction boundaries. */
let sent: string[] = [];

beforeAll(async () => {
  lite = await createDatabase();
  server = new PGLiteSocketServer({ db: lite, port: 0, host: "127.0.0.1" });
  await server.start();
  const { port } = (server as unknown as { server: { address(): AddressInfo } }).server.address();
  // PGlite is a single session behind the socket: from here on, everything runs as the runtime
  // login. Fixtures are written by the owner before that (see beforeEach).
  pool = new pg.Pool({
    connectionString: `postgres://postgres@127.0.0.1:${port}/postgres`,
    max: 1,
  });
  pool.on("connect", (client) => {
    const original = client.query.bind(client) as (...args: unknown[]) => unknown;
    (client as unknown as { query: unknown }).query = (...args: unknown[]) => {
      const first = args[0];
      sent.push(typeof first === "string" ? first : String((first as { text?: string })?.text));
      return original(...args);
    };
  });
  db = withRowLevelSecurity(new PrismaClient({ adapter: new PrismaPg(pool) }));
}, 60_000);

afterAll(async () => {
  await db.$disconnect();
  await pool.end();
  await server.stop();
  await lite.close();
});

beforeEach(async () => {
  await lite.exec("RESET ROLE");
  await lite.exec(
    `TRUNCATE "machine","api_key","session","account","verification","usage_event","usage_interval","usage_reporter","waitlist_entry","user" CASCADE`,
  );
  await seedTwoUsers(lite);
  await lite.exec(`SET ROLE ${RUNTIME_LOGIN}`);
  sent = [];
});

const machineData = (id: string, ownerId: string) => ({
  id,
  ownerId,
  name: `n-${id}`,
  template: "desktop-v2",
  vcpu: 1,
  memoryMib: 1024,
  diskMib: 4096,
});

describe("context", () => {
  it("withUser and asSystem set and nest, and the inner one wins", async () => {
    expect(currentDbContext()).toBeUndefined();
    await withUser("user-a", async () => {
      expect(currentDbContext()).toEqual({ kind: "user", userId: "user-a" });
      await asSystem("because", async () => {
        expect(currentDbContext()).toEqual({ kind: "system", reason: "because" });
      });
      expect(currentDbContext()).toEqual({ kind: "user", userId: "user-a" });
    });
    expect(currentDbContext()).toBeUndefined();
  });

  it("refuses an empty user id and an empty reason", async () => {
    await expect(withUser("", async () => 1)).rejects.toThrow(/user id/);
    await expect(asSystem("  ", async () => 1)).rejects.toThrow(/reason/);
  });

  it("maps to the settings the policies read", () => {
    expect(settingsFor({ kind: "user", userId: "u" })).toEqual(["u", "off"]);
    expect(settingsFor({ kind: "system", reason: "r" })).toEqual(["", "on"]);
  });
});

describe("the extension", () => {
  it("refuses a query with no context, before any SQL is sent", async () => {
    await expect(db.machine.findMany()).rejects.toBeInstanceOf(MissingDatabaseContextError);
    await expect(db.$queryRaw`SELECT 1`).rejects.toBeInstanceOf(MissingDatabaseContextError);
    expect(sent).toEqual([]);
  });

  it("puts a transaction-local set_config first in the same transaction as the operation", async () => {
    await withUser("user-a", () => db.machine.findMany());
    const begin = sent.findIndex((sql) => /^begin/i.test(sql));
    const commit = sent.findIndex((sql) => /^commit/i.test(sql));
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(commit).toBeGreaterThan(begin);
    const inside = sent.slice(begin + 1, commit);
    expect(inside[0]).toMatch(
      /set_config\('app\.user_id', \$1, true\).*set_config\('app\.rls_bypass', \$2, true\)/s,
    );
    expect(inside[1]).toMatch(/"public"\."machine"/);
    // Never a session-level setting.
    expect(sent.join("\n")).not.toMatch(/, false\)/);
    expect(sent.join("\n")).not.toMatch(/^\s*set /im);
  });

  it("a user reads only its own rows", async () => {
    const rows = await withUser("user-a", () => db.machine.findMany());
    expect(rows.map((row) => row.id)).toEqual(["m-a"]);
    expect(
      await withUser("user-a", () => db.machine.findFirst({ where: { id: "m-b" } })),
    ).toBeNull();
    expect(
      await withUser("user-a", () => db.machine.findUnique({ where: { id: "m-b" } })),
    ).toBeNull();
  });

  it("a user cannot update, delete or insert for another owner", async () => {
    const updated = await withUser("user-a", () =>
      db.machine.updateMany({ where: { id: "m-b" }, data: { name: "hijacked" } }),
    );
    expect(updated.count).toBe(0);
    const removed = await withUser("user-a", () => db.apiKey.deleteMany({ where: { id: "k-b" } }));
    expect(removed.count).toBe(0);
    await expect(
      withUser("user-a", () => db.machine.create({ data: machineData("m-evil", "user-b") })),
    ).rejects.toThrow(/row-level security/);
    const asB = await asSystem("check", () => db.machine.findUnique({ where: { id: "m-b" } }));
    expect(asB?.name).toBe("name-m-b");
  });

  it("a system context sees every row", async () => {
    const rows = await asSystem("test", () => db.machine.findMany({ orderBy: { id: "asc" } }));
    expect(rows.map((row) => row.id)).toEqual(["m-a", "m-b"]);
  });

  it("two consecutive operations on the one connection do not inherit each other's user", async () => {
    expect((await withUser("user-a", () => db.machine.findMany())).map((row) => row.id)).toEqual([
      "m-a",
    ]);
    expect((await withUser("user-b", () => db.machine.findMany())).map((row) => row.id)).toEqual([
      "m-b",
    ]);
    // The pool has exactly one connection, so these ran back to back on it. Raw, with no
    // context, the settings are empty.
    const raw = await lite.query(`SELECT current_setting('app.user_id', true) AS u`);
    expect((raw.rows[0] as { u: string | null }).u || "").toBe("");
  });

  it("concurrent users stay separate", async () => {
    const results = await Promise.all(
      ["user-a", "user-b", "user-a", "user-b"].map((id) =>
        withUser(id, async () => (await db.machine.findMany()).map((row) => row.id)),
      ),
    );
    expect(results).toEqual([["m-a"], ["m-b"], ["m-a"], ["m-b"]]);
  });

  it("an interactive transaction sets the context once and is atomic", async () => {
    await withUser("user-a", () =>
      inTransaction(db, async (tx) => {
        await tx.machine.create({ data: machineData("m-a2", "user-a") });
        expect((await tx.machine.findMany()).map((row) => row.id).sort()).toEqual(["m-a", "m-a2"]);
      }),
    );
    await expect(
      withUser("user-a", () =>
        inTransaction(db, async (tx) => {
          await tx.machine.create({ data: machineData("m-a3", "user-a") });
          throw new Error("boom");
        }),
      ),
    ).rejects.toThrow("boom");
    const ids = (await asSystem("check", () => db.machine.findMany())).map((row) => row.id).sort();
    expect(ids).toEqual(["m-a", "m-a2", "m-b"]);
  });

  it("inTransaction needs a context, and a transaction is not given another user's rows", async () => {
    await expect(inTransaction(db, async () => 1)).rejects.toBeInstanceOf(
      MissingDatabaseContextError,
    );
    await withUser("user-a", () =>
      inTransaction(db, async (tx) => {
        expect(await tx.machine.findMany({ where: { ownerId: "user-b" } })).toEqual([]);
      }),
    );
  });

  it("refuses a batch $transaction, which would run without settings", async () => {
    await expect(
      asSystem("test", () => db.$transaction([db.machine.findMany(), db.apiKey.findMany()])),
    ).rejects.toThrow(/Batch/);
  });

  it("an interactive transaction opened by hand sees nothing rather than everything", async () => {
    const rows = await db.$transaction(async (tx) => tx.machine.findMany());
    expect(rows).toEqual([]);
  });
});

describe("the stores, as the app wires them", () => {
  it("api keys: a lookup by hash needs no context; the rest is the user's own", async () => {
    const store = createPrismaApiKeyStore(db);
    expect((await store.findActiveByHash("hash-k-b"))?.userId).toBe("user-b");
    await store.touch("k-b", new Date());
    expect(
      (await withUser("user-a", () => store.listActive("user-a"))).map((row) => row.id),
    ).toEqual(["k-a"]);
    // Even asking for another user's keys by id returns nothing under your own context.
    expect(await withUser("user-a", () => store.listActive("user-b"))).toEqual([]);
    expect(await withUser("user-a", () => store.revoke("user-b", "k-b"))).toBe(false);
    expect(await withUser("user-a", () => store.revoke("user-a", "k-a"))).toBe(true);
    await expect(
      withUser("user-a", () =>
        store.insert({ id: "k-evil", userId: "user-b", name: "n", hint: "h", keyHash: "x" }),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("machines: owner reads are limited, listAll is explicit system work", async () => {
    const store = createPrismaMachineStore(db);
    expect(
      (await withUser("user-a", () => store.listByOwner("user-a"))).map((row) => row.id),
    ).toEqual(["m-a"]);
    expect(await withUser("user-a", () => store.find("user-b", "m-b"))).toBeNull();
    expect((await store.listAll()).map((row) => row.id)).toEqual(["m-a", "m-b"]);
    await withUser("user-a", () => store.setOp("m-b", "deleting"));
    expect(
      (await asSystem("check", () => db.machine.findUnique({ where: { id: "m-b" } })))?.op,
    ).toBeNull();
    await expect(store.listByOwner("user-a")).rejects.toBeInstanceOf(MissingDatabaseContextError);
  });

  it("usage: ingest and operator reads run as system, replaceIntervals is atomic", async () => {
    const store = createPrismaUsageStore(db);
    const draft = {
      machineId: "m-a",
      ownerUserId: "user-a",
      template: "desktop-v2",
      vcpu: 1,
      memoryMib: 1024,
      diskMib: 4096,
      state: "running" as const,
      startedAt: new Date("2026-01-01T00:00:00Z"),
      endedAt: null,
      seconds: null,
    };
    await store.replaceIntervals("m-a", [draft]);
    await store.replaceIntervals("m-b", [{ ...draft, machineId: "m-b", ownerUserId: "user-b" }]);
    const everyone = await store.openIntervals();
    expect(everyone.map((row) => row.machineId).sort()).toEqual(["m-a", "m-b"]);
    // A customer's own view is the user context, and the policy backs the filter.
    const own = await store.openIntervals({ ownerUserId: "user-a" });
    expect(own.map((row) => row.machineId)).toEqual(["m-a"]);
    expect(
      await withUser("user-a", () => db.usageInterval.findMany()).then((rows) =>
        rows.map((row) => row.machineId),
      ),
    ).toEqual(["m-a"]);
    expect(await store.reporters()).toEqual([]);
  });

  it("users and waitlist: operator-only stores, system by construction", async () => {
    const users = createPrismaUserStore(db);
    expect((await users.list()).map((row) => row.id)).toEqual(["user-a", "user-b"]);
    expect((await users.findByEmail("user-a@example.test"))?.id).toBe("user-a");
    const waitlist = createPrismaWaitlistStore(db);
    expect(await waitlist.insert({ email: "w@example.test", note: null, locale: "en" })).toBe(
      "created",
    );
    expect(await waitlist.insert({ email: "w@example.test", note: null, locale: "en" })).toBe(
      "exists",
    );
    // And a user context does not reach them directly.
    expect(await withUser("user-a", () => db.waitlistEntry.findMany())).toEqual([]);
    expect(await withUser("user-a", () => db.session.findMany())).toEqual([]);
  });

  it("systemStore runs every function as system and passes values through", async () => {
    const seen: unknown[] = [];
    const wrapped = systemStore(
      { name: "x", read: async () => seen.push(currentDbContext()) },
      "why",
    );
    await wrapped.read();
    expect(wrapped.name).toBe("x");
    expect(seen).toEqual([{ kind: "system", reason: "why" }]);
  });
});

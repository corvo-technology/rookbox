import { SIZE_PRESETS } from "@rookbox/contracts";
import { describe, expect, it } from "vitest";
import { silentLogger } from "./logger.js";
import { setupApp } from "./test-app.js";
import { type Credentials, createUserAdmin, type UserRecord, type UserStore } from "./users.js";

/** Accounts in memory; an id is the part of the email before the `@`, like the test identity. */
function memoryUsers() {
  const users = new Map<string, UserRecord>();
  const passwords = new Map<string, string>();
  const sessionsEnded: string[] = [];
  const store: UserStore = {
    async findByEmail(email) {
      return users.get(email) ?? null;
    },
    async list() {
      return [...users.values()];
    },
    async setDisabled(id, at) {
      for (const user of users.values()) if (user.id === id) user.disabledAt = at;
    },
    async deleteSessions(id) {
      sessionsEnded.push(id);
    },
  };
  const credentials: Credentials = {
    async create({ email, name, password }) {
      users.set(email, {
        id: email.split("@")[0] ?? email,
        email,
        name,
        disabledAt: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      });
      passwords.set(email, password);
    },
    async setPassword(userId, password) {
      for (const user of users.values())
        if (user.id === userId) passwords.set(user.email, password);
    },
  };
  const userAdmin = createUserAdmin({
    store,
    credentials,
    suspendMachines: async () => ({ suspended: 0, skipped: 0, failed: 0 }),
    logger: silentLogger,
  });
  return { userAdmin, users, passwords, sessionsEnded };
}

function setup() {
  const people = memoryUsers();
  const app = setupApp(
    { userAdmin: people.userAdmin, maxRunningTotal: 5 },
    { maxMachinesPerUser: 3 },
  );
  return { ...app, ...people };
}

const small = { template: "seed", size: SIZE_PRESETS.small } as const;

describe("admin panel: only admins", () => {
  it("refuses every procedure to a user who is not an admin, and changes nothing", async () => {
    const { client, users, space } = setup();
    const alice = client("alice");
    const machine = await alice.machines.create(small);
    const calls = [
      () => alice.admin.health(),
      () => alice.admin.users.list(),
      () => alice.admin.users.create({ email: "bob@example.test", name: "Bob" }),
      () => alice.admin.users.resetPassword({ email: "alice@example.test" }),
      () => alice.admin.users.disable({ email: "alice@example.test", suspendMachines: false }),
      () => alice.admin.users.enable({ email: "alice@example.test" }),
      () => alice.admin.machines.list(),
      () => alice.admin.machines.suspend({ id: machine.id }),
      () => alice.admin.machines.delete({ id: machine.id }),
    ];
    for (const call of calls) {
      await expect(call()).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    }
    expect(users.size).toBe(0);
    expect(space.sandboxes.get(machine.id)?.state).toBe("running");
    await expect(client("alice").machines.list()).resolves.toHaveLength(1);
  });

  it("tells each caller whether they are an admin, and never refuses to answer", async () => {
    const { client } = setup();
    await expect(client("admin").admin.access()).resolves.toEqual({ admin: true });
    await expect(client("alice").admin.access()).resolves.toEqual({ admin: false });
  });
});

describe("admin panel: users", () => {
  it("creates an account with a generated password, once, and lists it", async () => {
    const { client, passwords } = setup();
    const admin = client("admin").admin;
    const created = await admin.users.create({ email: "Bob@Example.test", name: "Bob" });
    expect(created).toMatchObject({ email: "bob@example.test", generated: true });
    expect(created.password).toHaveLength(24);
    expect(passwords.get("bob@example.test")).toBe(created.password);

    const list = await admin.users.list();
    expect(list).toEqual([
      expect.objectContaining({
        email: "bob@example.test",
        name: "Bob",
        status: "active",
        admin: false,
        machines: 0,
      }),
    ]);
    expect(JSON.stringify(list)).not.toContain(created.password);
  });

  it("explains a refused create by reason", async () => {
    const { client } = setup();
    const admin = client("admin").admin;
    await expect(
      admin.users.create({ email: "bob@example.test", name: "Bob", password: "short" }),
    ).rejects.toMatchObject({ data: { reason: "password_short" } });
    await admin.users.create({ email: "bob@example.test", name: "Bob" });
    await expect(
      admin.users.create({ email: "bob@example.test", name: "Bob" }),
    ).rejects.toMatchObject({ data: { reason: "exists" } });
  });

  it("resets a password, ends the logins, and answers 404 for an unknown account", async () => {
    const { client, passwords, sessionsEnded } = setup();
    const admin = client("admin").admin;
    await admin.users.create({ email: "bob@example.test", name: "Bob" });
    const reset = await admin.users.resetPassword({ email: "bob@example.test" });
    expect(reset.generated).toBe(true);
    expect(passwords.get("bob@example.test")).toBe(reset.password);
    expect(sessionsEnded).toContain("bob");
    await expect(admin.users.resetPassword({ email: "nobody@example.test" })).rejects.toMatchObject(
      { status: 404, data: { reason: "no_account" } },
    );
  });

  it("disables and enables, can suspend the machines, and never lets an admin disable themselves", async () => {
    const { client, users } = setup();
    const admin = client("admin").admin;
    await admin.users.create({ email: "bob@example.test", name: "Bob" });
    await expect(
      admin.users.disable({ email: "bob@example.test", suspendMachines: true }),
    ).resolves.toEqual({
      email: "bob@example.test",
      suspended: { suspended: 0, skipped: 0, failed: 0 },
    });
    expect(users.get("bob@example.test")?.disabledAt).toBeInstanceOf(Date);
    expect((await admin.users.list())[0]?.status).toBe("disabled");
    await admin.users.enable({ email: "bob@example.test" });
    expect(users.get("bob@example.test")?.disabledAt).toBeNull();

    await admin.users.create({ email: "admin@example.test", name: "Admin" });
    await expect(
      admin.users.disable({ email: "Admin@example.test", suspendMachines: false }),
    ).rejects.toMatchObject({ data: { reason: "self" } });
    expect(users.get("admin@example.test")?.disabledAt).toBeNull();
  });

  it("counts each account's machines", async () => {
    const { client } = setup();
    const admin = client("admin").admin;
    await admin.users.create({ email: "alice@example.test", name: "Alice" });
    await client("alice").machines.create(small);
    await client("alice").machines.create(small);
    expect((await admin.users.list())[0]?.machines).toBe(2);
  });
});

describe("admin panel: machines", () => {
  it("lists every owner's machines with the owner, then suspends and deletes on request", async () => {
    const { client, space } = setup();
    const admin = client("admin").admin;
    await admin.users.create({ email: "alice@example.test", name: "Alice" });
    const a = await client("alice").machines.create({ ...small, name: "one" });
    const b = await client("bob").machines.create({ ...small, name: "two" });

    const all = await admin.machines.list();
    expect(all.map((m) => [m.name, m.ownerEmail, m.status]).sort()).toEqual([
      ["one", "alice@example.test", "running"],
      // Bob has no account row here, so his email is unknown but the machine is still listed.
      ["two", null, "running"],
    ]);

    await admin.machines.suspend({ id: a.id });
    expect(space.sandboxes.get(a.id)?.state).toBe("paused");
    await admin.machines.delete({ id: b.id });
    expect(space.sandboxes.has(b.id)).toBe(false);
    await expect(client("bob").machines.list()).resolves.toEqual([]);

    await expect(admin.machines.delete({ id: "missing" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("admin panel: health", () => {
  it("reports the database, the host, the meter and the capacity", async () => {
    const { client } = setup();
    await client("alice").machines.create(small);
    const health = await client("admin").admin.health();
    expect(health.db).toEqual({ ok: true });
    expect(health.host).toMatchObject({ ok: true, auth: "ok", reachable: true });
    expect(health.reporter).toBeNull();
    expect(health.capacity).toEqual({
      running: 1,
      suspended: 0,
      maxRunning: 5,
      maxPerUser: 3,
      rows: 1,
    });
  });

  it("keeps answering when the database check fails or the host rejects the key", async () => {
    const { client, space } = setup();
    const down = setupApp({
      checkDb: async () => {
        throw new Error("connect ECONNREFUSED 10.1.2.3:5432");
      },
    });
    const health = await down.client("admin").admin.health();
    expect(health.db).toEqual({ ok: false });
    expect(JSON.stringify(health)).not.toContain("10.1.2.3");

    space.probeResult = {
      keyConfigured: true,
      reachable: true,
      statusClass: "4xx",
      auth: "rejected",
      ms: 3,
    };
    expect((await client("admin").admin.health()).host).toMatchObject({
      ok: false,
      auth: "rejected",
    });
  });
});

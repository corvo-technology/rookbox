import { describe, expect, it } from "vitest";
import { silentLogger } from "./logger.js";
import {
  type Credentials,
  createUserAdmin,
  generatePassword,
  type UserRecord,
  type UserStore,
} from "./users.js";

function setup(allowed = ["owner@example.test", "friend@example.test"]) {
  const users = new Map<string, UserRecord>();
  const passwords = new Map<string, string>();
  const calls: string[] = [];
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
      calls.push(`sessions:${id}`);
    },
  };
  const credentials: Credentials = {
    async create({ email, name, password }) {
      users.set(email, { id: `id-${email}`, email, name, disabledAt: null, createdAt: new Date() });
      passwords.set(email, password);
    },
    async setPassword(userId, password) {
      passwords.set(userId.replace("id-", ""), password);
    },
  };
  const admin = createUserAdmin({
    store,
    credentials,
    allowedEmails: allowed,
    suspendMachines: async (id) => {
      calls.push(`suspend:${id}`);
      return { suspended: 2, skipped: 0, failed: 0 };
    },
    logger: silentLogger,
  });
  return { admin, users, passwords, calls };
}

describe("user create", () => {
  it("generates a strong password and returns it once", async () => {
    const { admin, passwords } = setup();
    const result = await admin.create({ email: " Friend@Example.test ", name: "Friend" });
    expect(result).toMatchObject({ email: "friend@example.test", generated: true });
    expect(result.password).toHaveLength(24);
    expect(passwords.get("friend@example.test")).toBe(result.password);
    expect(generatePassword()).not.toBe(generatePassword());
  });

  it("takes a given password and refuses a short one", async () => {
    const { admin } = setup();
    await expect(
      admin.create({ email: "friend@example.test", name: "F", password: "short" }),
    ).rejects.toThrow(/at least 12/);
    const ok = await admin.create({
      email: "friend@example.test",
      name: "F",
      password: "a long enough one",
    });
    expect(ok.generated).toBe(false);
  });

  it("refuses an email that is not on the allowlist, and a duplicate", async () => {
    const { admin, users } = setup();
    await expect(admin.create({ email: "stranger@example.test", name: "S" })).rejects.toThrow(
      /ROOKBOX_ALLOWED_EMAILS/,
    );
    expect(users.size).toBe(0);
    await admin.create({ email: "friend@example.test", name: "F" });
    await expect(admin.create({ email: "friend@example.test", name: "F" })).rejects.toThrow(
      /already exists/,
    );
  });
});

describe("user set-password, disable, enable, list", () => {
  it("resets the password and ends the sessions", async () => {
    const { admin, passwords, calls } = setup();
    await admin.create({ email: "friend@example.test", name: "F" });
    const result = await admin.setPassword({ email: "friend@example.test" });
    expect(passwords.get("friend@example.test")).toBe(result.password);
    expect(calls).toContain("sessions:id-friend@example.test");
    await expect(admin.setPassword({ email: "nobody@example.test" })).rejects.toThrow(/No account/);
  });

  it("disables, optionally suspends machines, and enables again", async () => {
    const { admin, users, calls } = setup();
    await admin.create({ email: "friend@example.test", name: "F" });
    const plain = await admin.disable({ email: "friend@example.test" });
    expect(plain.suspended).toBeNull();
    expect(users.get("friend@example.test")?.disabledAt).toBeInstanceOf(Date);
    expect(calls).not.toContain("suspend:id-friend@example.test");
    const loud = await admin.disable({ email: "friend@example.test", suspendMachines: true });
    expect(loud.suspended).toEqual({ suspended: 2, skipped: 0, failed: 0 });
    expect(calls).toContain("suspend:id-friend@example.test");
    expect((await admin.list())[0]).toMatchObject({ status: "disabled", allowed: true });
    await admin.enable({ email: "friend@example.test" });
    expect((await admin.list())[0]?.status).toBe("active");
  });
});

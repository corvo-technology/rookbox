import { SIZE_PRESETS } from "@rookbox/contracts";
import { describe, expect, it } from "vitest";
import { OWNER_TAG } from "./machines/service.js";
import { DESK, setupApp } from "./test-app.js";

/**
 * Two accounts on the real application (router, guards, desktop proxy) over in-memory fakes. Alice
 * owns machines and a key; Bob must never see, change or open any of it, however he asks.
 */
async function world() {
  const ctx = setupApp({}, { maxMachinesPerUser: 5 });
  const alice = ctx.client("alice");
  const seed = await alice.machines.create({
    name: "box",
    template: "seed",
    size: SIZE_PRESETS.small,
  });
  const desk = await alice.machines.create({
    name: "desk",
    template: "desktop",
    size: SIZE_PRESETS.small,
  });
  const key = await alice.apiKeys.create({ name: "ci" });
  return { ...ctx, alice, bob: ctx.client("bob"), seed, desk, key };
}

const notFound = { code: "NOT_FOUND", status: 404 };

describe("two accounts", () => {
  it("Bob cannot list, get, exec, suspend, restore, fork or delete Alice's machine", async () => {
    const { bob, seed, space, store } = await world();
    expect(await bob.machines.list()).toEqual([]);
    const before = space.calls.length;
    await expect(bob.machines.get({ id: seed.id })).rejects.toMatchObject(notFound);
    await expect(bob.machines.exec({ id: seed.id, command: "id" })).rejects.toMatchObject(notFound);
    await expect(bob.machines.suspend({ id: seed.id })).rejects.toMatchObject(notFound);
    await expect(bob.machines.restore({ id: seed.id })).rejects.toMatchObject(notFound);
    await expect(bob.machines.fork({ id: seed.id })).rejects.toMatchObject(notFound);
    await expect(bob.machines.delete({ id: seed.id })).rejects.toMatchObject(notFound);
    // Nothing reached the host on Alice's machine, and nothing changed.
    const touched = space.calls
      .slice(before)
      .filter((c) => ["suspend", "restore", "fork", "kill", "exec"].includes(c.op));
    expect(touched).toEqual([]);
    expect(space.sandboxes.get(seed.id)?.state).toBe("running");
    expect(store.rows.has(seed.id)).toBe(true);
  });

  it("Bob cannot open Alice's desktop or mint a link for it", async () => {
    const { bob, desk, app, tokens, upstream } = await world();
    await expect(bob.machines.desktopLink({ id: desk.id })).rejects.toMatchObject(notFound);
    // Even a link signed with the real key, naming Bob, is refused for Alice's machine.
    const forged = tokens.sign("link", { machineId: desk.id, userId: "bob" }, 60);
    expect((await app.request(`https://${DESK}/open/${forged.token}`)).status).toBe(404);
    // A session cookie signed for Bob and this machine is refused by the ownership check too.
    const session = tokens.sign("session", { machineId: desk.id, userId: "bob" }, 600);
    const response = await app.request(`https://${DESK}/m/${desk.id}/vnc.html`, {
      headers: { cookie: `rbx_desk=${session.token}` },
    });
    expect(response.status).toBe(404);
    expect(upstream).toEqual([]);
  });

  it("Bob cannot see, use or revoke Alice's API keys", async () => {
    const { bob, alice, key, client } = await world();
    expect(await bob.apiKeys.list()).toEqual([]);
    await expect(bob.apiKeys.revoke({ id: key.key.id })).rejects.toMatchObject(notFound);
    expect(await alice.apiKeys.list()).toHaveLength(1);
    // Bob's own key sees Bob's machines, not Alice's.
    const own = await bob.apiKeys.create({ name: "mine" });
    expect(await client(undefined, own.secret).machines.list()).toEqual([]);
    // Alice's key still sees hers.
    expect(await client(undefined, key.secret).machines.list()).toHaveLength(2);
  });

  it("forged and odd ids reach nobody", async () => {
    const { bob, alice, app, seed } = await world();
    const ids = [
      "sbx999",
      "nope",
      seed.id.toUpperCase(),
      ` ${seed.id}`,
      `${seed.id}/../x`,
      `${seed.id}%00`,
      "*",
      "../../etc/passwd",
      "x".repeat(64),
    ];
    for (const id of ids) {
      for (const user of [bob, alice]) {
        const call = user.machines.get({ id });
        // Alice holds sbx1, so only the exact id (not among these) is hers.
        await expect(call, id).rejects.toMatchObject({
          code: expect.stringMatching(/NOT_FOUND|BAD_REQUEST/),
        });
      }
      await expect(bob.machines.desktopLink({ id })).rejects.toBeDefined();
    }
    for (const id of ["../x", "sbx999", "%2e%2e"]) {
      const response = await app.request(`https://${DESK}/m/${id}/vnc.html`, {
        headers: { cookie: "rbx_desk=v1.a.b" },
      });
      expect([401, 404]).toContain(response.status);
    }
  });

  it("a sandbox tagged for someone else is refused for the row's owner too", async () => {
    const { alice, seed, space } = await world();
    // A row points at a sandbox that the host tags for Bob (corrupted data or a forged row).
    const info = space.sandboxes.get(seed.id)!;
    space.sandboxes.set(seed.id, { ...info, metadata: { ...info.metadata, [OWNER_TAG]: "bob" } });
    await expect(alice.machines.get({ id: seed.id })).rejects.toMatchObject(notFound);
    await expect(alice.machines.exec({ id: seed.id, command: "id" })).rejects.toMatchObject(
      notFound,
    );
    await expect(alice.machines.delete({ id: seed.id })).rejects.toMatchObject(notFound);
    await expect(alice.machines.desktopLink({ id: seed.id })).rejects.toMatchObject(notFound);
    // Alice's list does not show it either.
    expect((await alice.machines.list()).map((m) => m.id)).not.toContain(seed.id);
  });

  it("a sandbox with no tag stays with the row's owner and is never Bob's", async () => {
    const { alice, bob, seed, space } = await world();
    // Forks come back from the host without a tag; the row decides who owns them.
    const info = space.sandboxes.get(seed.id)!;
    space.sandboxes.set(seed.id, { ...info, metadata: {} });
    await expect(alice.machines.get({ id: seed.id })).resolves.toMatchObject({ id: seed.id });
    await expect(bob.machines.get({ id: seed.id })).rejects.toMatchObject(notFound);
    await expect(bob.machines.exec({ id: seed.id, command: "id" })).rejects.toMatchObject(notFound);
    expect(await bob.machines.list()).toEqual([]);
  });

  it("a fork belongs to whoever forked it, and Bob cannot fork into his account", async () => {
    const { alice, bob, seed } = await world();
    const fork = await alice.machines.fork({ id: seed.id, name: "copy" });
    expect(fork.forkedFrom).toBe(seed.id);
    await expect(bob.machines.get({ id: fork.id })).rejects.toMatchObject(notFound);
    await expect(bob.machines.fork({ id: fork.id })).rejects.toMatchObject(notFound);
    expect(await bob.machines.list()).toEqual([]);
  });

  it("Bob cannot call the admin procedures", async () => {
    const { bob } = await world();
    await expect(bob.admin.reconcile({ act: false, killOrphans: false })).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
    await expect(
      bob.admin.suspendUserMachines({ email: "alice@example.test" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

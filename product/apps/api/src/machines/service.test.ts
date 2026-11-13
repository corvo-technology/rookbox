import { SIZE_PRESETS } from "@rookbox/contracts";
import { describe, expect, it } from "vitest";
import { newMachineService } from "../test-support.js";
import { MachineError, OWNER_TAG } from "./service.js";

const small = SIZE_PRESETS.small;

async function failure(promise: Promise<unknown>) {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

describe("create", () => {
  it("tags the sandbox with its owner, sizes it, and sends the idle timeout", async () => {
    const { space, service } = newMachineService();
    const machine = await service.create("alice", { name: "work", template: "seed", size: small });
    const call = space.calls.find((c) => c.op === "create")?.args[0] as {
      metadata: Record<string, string>;
      timeoutS: number;
      size: unknown;
      templateId: string;
    };
    expect(call.metadata[OWNER_TAG]).toBe("alice");
    expect(call.timeoutS).toBe(900);
    expect(call.size).toEqual(small);
    expect(call.templateId).toBe("seed");
    expect(machine.status).toBe("running");
    expect(machine.access.portUrlTemplate).toBe(`https://{port}-${machine.id}.box.example.test`);
  });

  it("gives a desktop template a proxied desktop link while it runs", async () => {
    const { service } = newMachineService();
    const desktop = await service.create("alice", { name: "d", template: "desktop", size: small });
    expect(desktop.access.desktopUrl).toContain(
      `https://api.example.test/desktop/${desktop.id}/vnc.html`,
    );
    const plain = await service.create("alice", { name: "p", template: "seed", size: small });
    expect(plain.access.desktopUrl).toBeNull();
  });

  it("refuses a duplicate name and a full account", async () => {
    const { service } = newMachineService({ maxMachinesPerUser: 1 });
    await service.create("alice", { name: "one", template: "seed", size: small });
    const error = await failure(
      service.create("alice", { name: "two", template: "seed", size: small }),
    );
    expect(error).toBeInstanceOf(MachineError);
    expect((error as MachineError).code).toBe("CONFLICT");
  });

  it("kills the sandbox when it cannot be recorded", async () => {
    const { space, service, store } = newMachineService();
    await service.create("alice", { name: "dup", template: "seed", size: small });
    // Another request took the name between the check and the insert.
    const original = store.listByOwner;
    store.listByOwner = async () => [];
    const error = await failure(
      service.create("alice", { name: "dup", template: "seed", size: small }),
    );
    store.listByOwner = original;
    expect((error as MachineError).code).toBe("CONFLICT");
    expect(space.calls.some((c) => c.op === "kill")).toBe(true);
  });
});

describe("owner filtering", () => {
  it("lists only the caller's machines, and asks SPACE with the owner tag", async () => {
    const { space, service } = newMachineService();
    const mine = await service.create("alice", { name: "mine", template: "seed", size: small });
    await service.create("bob", { name: "theirs", template: "seed", size: small });
    const list = await service.list("alice");
    expect(list.map((m) => m.id)).toEqual([mine.id]);
    const listCall = space.calls.filter((c) => c.op === "list").at(-1);
    expect(listCall?.args[0]).toEqual({ [OWNER_TAG]: "alice" });
  });

  it("answers not found for another user's machine, for every action, without touching SPACE", async () => {
    const { space, service } = newMachineService();
    const bobs = await service.create("bob", { name: "theirs", template: "desktop", size: small });
    const before = space.calls.length;
    const attempts = [
      service.get("alice", bobs.id),
      service.suspend("alice", bobs.id),
      service.restore("alice", bobs.id),
      service.fork("alice", { id: bobs.id }),
      service.delete("alice", bobs.id),
      service.exec("alice", { id: bobs.id, command: "id", timeoutMs: 1000 }),
      service.desktopTarget("alice", bobs.id),
    ];
    for (const attempt of attempts) {
      expect(((await failure(attempt)) as MachineError).code).toBe("NOT_FOUND");
    }
    const mutating = space.calls.slice(before).filter((c) => c.op !== "get" && c.op !== "list");
    expect(mutating).toEqual([]);
  });

  it("refuses a sandbox that SPACE tags for someone else even if a row points at it", async () => {
    const { space, service, store } = newMachineService();
    const bobs = await service.create("bob", { name: "theirs", template: "seed", size: small });
    await store.insert({
      id: bobs.id + "x",
      ownerId: "alice",
      name: "stolen",
      template: "seed",
      size: small,
      forkedFrom: null,
    });
    space.sandboxes.set(bobs.id + "x", { ...space.sandboxes.get(bobs.id)!, id: bobs.id + "x" });
    expect(((await failure(service.get("alice", bobs.id + "x"))) as MachineError).code).toBe(
      "NOT_FOUND",
    );
  });

  it("drops a machine SPACE no longer has", async () => {
    const { space, service, store } = newMachineService();
    const machine = await service.create("alice", { name: "gone", template: "seed", size: small });
    space.sandboxes.delete(machine.id);
    expect(await service.list("alice")).toEqual([]);
    expect(store.rows.has(machine.id)).toBe(false);
  });
});

describe("state mapping and lifecycle", () => {
  it("suspends (ECW pause) and restores (ECW resume)", async () => {
    const { space, service } = newMachineService();
    const machine = await service.create("alice", { name: "m", template: "seed", size: small });
    const suspended = await service.suspend("alice", machine.id);
    expect(suspended.status).toBe("suspended");
    expect(space.sandboxes.get(machine.id)?.state).toBe("paused");
    expect(((await failure(service.suspend("alice", machine.id))) as MachineError).code).toBe(
      "CONFLICT",
    );
    const restored = await service.restore("alice", machine.id);
    expect(restored.status).toBe("running");
    expect(space.calls.find((c) => c.op === "restore")?.args).toEqual([machine.id, 900]);
  });

  it("shows suspending while the pause call is in flight", async () => {
    const { space, service } = newMachineService();
    const machine = await service.create("alice", { name: "m", template: "seed", size: small });
    let seen: string | undefined;
    const original = space.suspend;
    space.suspend = async (id) => {
      seen = (await service.list("alice"))[0]?.status;
      await original(id);
    };
    await service.suspend("alice", machine.id);
    expect(seen).toBe("suspending");
  });

  it("forks into a new machine of the same owner that remembers its source", async () => {
    const { service } = newMachineService();
    const source = await service.create("alice", { name: "base", template: "seed", size: small });
    const fork = await service.fork("alice", { id: source.id });
    expect(fork.forkedFrom).toBe(source.id);
    expect(fork.name).toBe("base-fork");
    expect((await service.list("alice")).map((m) => m.id).sort()).toEqual(
      [source.id, fork.id].sort(),
    );
    expect(await service.list("bob")).toEqual([]);
  });

  it("keeps a queued delete visible as deleting, and removes a finished one", async () => {
    const { space, service } = newMachineService();
    const a = await service.create("alice", { name: "a", template: "seed", size: small });
    await service.delete("alice", a.id);
    expect(await service.list("alice")).toEqual([]);

    const b = await service.create("alice", { name: "b", template: "seed", size: small });
    space.killOutcome = "queued";
    await service.delete("alice", b.id);
    expect((await service.get("alice", b.id)).status).toBe("deleting");
  });
});

describe("exec", () => {
  it("runs in a running machine with its envd token", async () => {
    const { space, service } = newMachineService();
    const machine = await service.create("alice", { name: "m", template: "seed", size: small });
    const result = await service.exec("alice", {
      id: machine.id,
      command: "echo hi",
      timeoutMs: 5000,
    });
    expect(result.stdout).toBe("hi\n");
    expect(space.calls.find((c) => c.op === "exec")?.args).toEqual([
      machine.id,
      `envd-${machine.id}`,
      "echo hi",
      5000,
    ]);
  });

  it("will not run in a suspended machine", async () => {
    const { service } = newMachineService();
    const machine = await service.create("alice", { name: "m", template: "seed", size: small });
    await service.suspend("alice", machine.id);
    const error = await failure(
      service.exec("alice", { id: machine.id, command: "id", timeoutMs: 1000 }),
    );
    expect((error as MachineError).code).toBe("CONFLICT");
  });
});

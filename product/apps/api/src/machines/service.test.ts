import { SIZE_PRESETS } from "@rookbox/contracts";
import { describe, expect, it } from "vitest";
import { SpaceError } from "../space/client.js";
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
    expect((error as MachineError).code).toBe("MACHINE_LIMIT");
    expect((error as MachineError).data).toEqual({ limit: 1 });
  });

  it("refuses a name the account already uses", async () => {
    const { service } = newMachineService();
    await service.create("alice", { name: "one", template: "seed", size: small });
    const error = await failure(
      service.create("alice", { name: "one", template: "seed", size: small }),
    );
    expect((error as MachineError).code).toBe("NAME_TAKEN");
  });

  it("holds two creates at once to the machine cap", async () => {
    const { service, space } = newMachineService({ maxMachinesPerUser: 1 });
    const results = await Promise.allSettled([
      service.create("alice", { name: "a", template: "seed", size: small }),
      service.create("alice", { name: "b", template: "seed", size: small }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(space.calls.filter((c) => c.op === "create")).toHaveLength(1);
  });

  it("frees the cap when a machine's sandbox is already gone", async () => {
    const { service, space } = newMachineService({ maxMachinesPerUser: 1 });
    const first = await service.create("alice", { name: "a", template: "seed", size: small });
    space.sandboxes.delete(first.id);
    const second = await service.create("alice", { name: "b", template: "seed", size: small });
    expect(second.name).toBe("b");
  });

  it("only offers the templates the deployment allows", async () => {
    const { service, space } = newMachineService({ templates: ["seed"] });
    const error = await failure(
      service.create("alice", { name: "d", template: "desktop", size: small }),
    );
    expect((error as MachineError).code).toBe("TEMPLATE_UNAVAILABLE");
    expect(space.calls.some((c) => c.op === "create")).toBe(false);
    expect(service.config().templates).toEqual(["seed"]);
  });

  it("applies the requested idle timeout, and keeps it for restore and fork", async () => {
    const { service, space } = newMachineService();
    const machine = await service.create("alice", {
      name: "m",
      template: "seed",
      size: small,
      idleTimeoutS: 3600,
    });
    expect(machine.idleTimeoutS).toBe(3600);
    const create = space.calls.find((c) => c.op === "create")?.args[0] as { timeoutS: number };
    expect(create.timeoutS).toBe(3600);
    await service.suspend("alice", machine.id);
    await service.restore("alice", machine.id);
    expect(space.calls.find((c) => c.op === "restore")?.args[1]).toBe(3600);
    const fork = await service.fork("alice", { id: machine.id });
    expect(fork.idleTimeoutS).toBe(3600);
    expect(space.calls.find((c) => c.op === "fork")?.args[1]).toBe(3600);
  });

  it("uses the deployment's idle timeout when the request has none", async () => {
    const { service } = newMachineService();
    const machine = await service.create("alice", { name: "m", template: "seed", size: small });
    expect(machine.idleTimeoutS).toBe(900);
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
    expect((error as MachineError).code).toBe("NAME_TAKEN");
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
      idleTimeoutS: 900,
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

describe("SPACE failures", () => {
  const cases: [SpaceError, string][] = [
    [new SpaceError(401, "Invalid or missing API key"), "HOST_AUTH"],
    [new SpaceError(403, "forbidden"), "HOST_AUTH"],
    [new SpaceError(0, "down", "UNREACHABLE"), "HOST_UNREACHABLE"],
    [new SpaceError(0, "slow", "TIMEOUT"), "HOST_TIMEOUT"],
    [new SpaceError(504, "gateway"), "HOST_TIMEOUT"],
    [new SpaceError(503, "no room"), "HOST_CAPACITY"],
    [new SpaceError(429, "slow down"), "HOST_CAPACITY"],
    [new SpaceError(429, "sandbox quota reached"), "HOST_QUOTA"],
    [new SpaceError(404, "no template", "TEMPLATE_NOT_FOUND"), "TEMPLATE_UNAVAILABLE"],
    [new SpaceError(500, "boom at 10.0.0.7"), "HOST_ERROR"],
  ];

  it.each(cases)("maps %s to a coded error with a generic message", async (upstream, code) => {
    const { space, service } = newMachineService();
    space.create = async () => {
      throw upstream;
    };
    const error = (await failure(
      service.create("alice", { name: "m", template: "seed", size: small }),
    )) as MachineError;
    expect(error).toBeInstanceOf(MachineError);
    expect(error.code).toBe(code);
    expect(error.message).not.toContain(upstream.message);
  });

  it("keeps a timed-out suspend marked in flight, since SPACE may still finish it", async () => {
    const { space, service } = newMachineService();
    const machine = await service.create("alice", { name: "m", template: "seed", size: small });
    space.suspend = async () => {
      throw new SpaceError(0, "slow", "TIMEOUT");
    };
    await failure(service.suspend("alice", machine.id));
    expect((await service.get("alice", machine.id)).status).toBe("suspending");
  });

  it("clears the in-flight mark when SPACE refuses outright", async () => {
    const { space, service } = newMachineService();
    const machine = await service.create("alice", { name: "m", template: "seed", size: small });
    space.suspend = async () => {
      throw new SpaceError(500, "boom");
    };
    await failure(service.suspend("alice", machine.id));
    expect((await service.get("alice", machine.id)).status).toBe("running");
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

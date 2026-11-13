import { ORPCError } from "@orpc/client";
import { SIZE_PRESETS } from "@rookbox/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeApi } from "./fake-api";

const STEP = 1_000;

function api(seed = false) {
  return createFakeApi({
    latencyMs: [0, 0],
    stepMs: STEP,
    seed,
    now: () => new Date("2026-03-10T12:00:00Z"),
  });
}

function codeOf(error: unknown) {
  return error instanceof ORPCError ? error.code : undefined;
}

async function settle() {
  await vi.advanceTimersByTimeAsync(STEP);
}

/** With no latency a call answers on the microtask queue; the name keeps the tests readable. */
function call<T>(promise: Promise<T>) {
  return promise;
}

describe("fake api", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("answers a create once the machine is up, like the real API", async () => {
    const client = createFakeApi({ latencyMs: [0, 0], stepMs: STEP, createMs: 500 });
    const pending = client.machines.create({
      name: "worker",
      template: "seed",
      size: SIZE_PRESETS.small,
      idleTimeoutS: 3600,
    });
    await vi.advanceTimersByTimeAsync(500);
    const created = await pending;
    expect(created.status).toBe("running");
    expect(created.idleTimeoutS).toBe(3600);
    expect(created.size).toEqual(SIZE_PRESETS.small);
  });

  it("fails a create with the chosen coded error", async () => {
    const client = createFakeApi({ latencyMs: [0, 0], failCreateWith: "HOST_AUTH" });
    const failure = await client.machines
      .create({ template: "seed", size: SIZE_PRESETS.small })
      .catch((error: unknown) => error);
    expect(codeOf(failure)).toBe("HOST_AUTH");
  });

  it("offers templates and limits through config", async () => {
    const config = await api().config.get();
    expect(config.templates).toContain("seed");
    expect(config.maxMachines).toBeGreaterThan(0);
  });

  it("suspends and restores through the transitional states", async () => {
    const client = api();
    const { id } = await call(
      client.machines.create({ template: "seed", size: SIZE_PRESETS.small }),
    );

    const suspending = client.machines.suspend({ id });
    await vi.advanceTimersByTimeAsync(0);
    expect((await client.machines.get({ id })).status).toBe("suspending");
    await settle();
    expect((await suspending).status).toBe("suspended");

    const restoring = client.machines.restore({ id });
    await vi.advanceTimersByTimeAsync(0);
    expect((await client.machines.get({ id })).status).toBe("restoring");
    await settle();
    expect((await restoring).status).toBe("running");
  });

  it("refuses an action the state does not allow, with the contract's error", async () => {
    const client = api();
    const { id } = await call(
      client.machines.create({ template: "seed", size: SIZE_PRESETS.small }),
    );
    const failure = await call(client.machines.restore({ id })).catch((error: unknown) => error);
    expect(codeOf(failure)).toBe("CONFLICT");
  });

  it("forks into a new machine that points at its source and keeps its size", async () => {
    const client = api();
    const source = await call(
      client.machines.create({ name: "base", template: "seed", size: SIZE_PRESETS.large }),
    );
    await settle();
    const fork = await call(client.machines.fork({ id: source.id }));
    expect(fork).toMatchObject({ name: "base-fork", forkedFrom: source.id, status: "running" });
    expect(fork.size).toEqual(SIZE_PRESETS.large);
    const second = await call(client.machines.fork({ id: source.id }));
    expect(second.name).toBe("base-fork-2");
  });

  it("deletes a machine after it passes through deleting", async () => {
    const client = api();
    const { id } = await call(
      client.machines.create({ template: "seed", size: SIZE_PRESETS.small }),
    );
    await settle();
    await call(client.machines.delete({ id }));
    expect((await call(client.machines.get({ id }))).status).toBe("deleting");
    await settle();
    const failure = await call(client.machines.get({ id })).catch((error: unknown) => error);
    expect(codeOf(failure)).toBe("NOT_FOUND");
    expect(await call(client.machines.list())).toEqual([]);
  });

  it("creates from any offered template and keeps it", async () => {
    const client = api();
    const created = await call(
      client.machines.create({ template: "desktop", size: SIZE_PRESETS.small }),
    );
    expect(created.template).toBe("desktop");
    expect(created.access.portUrlTemplate).toContain("{port}");
  });

  it("runs commands only in running machines", async () => {
    const client = api();
    const created = await call(
      client.machines.create({ template: "seed", size: SIZE_PRESETS.small }),
    );
    const done = client.machines.suspend({ id: created.id });
    await settle();
    await done;
    const early = await call(client.machines.exec({ id: created.id, command: "uname" })).catch(
      (error: unknown) => error,
    );
    expect(codeOf(early)).toBe("CONFLICT");
  });

  it("validates input against the contract", async () => {
    const client = api();
    const failure = await call(
      client.machines.create({
        template: "seed",
        size: { vcpu: 0, memoryMib: 1024, diskMib: 2048 },
      }),
    ).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(await call(client.machines.list())).toEqual([]);
  });

  it("shows a key's secret once and keeps only its hint", async () => {
    const client = api();
    const { key, secret } = await call(client.apiKeys.create({ name: "ci" }));
    expect(secret).toMatch(/^rbx_[0-9a-f]{40}$/);
    expect(secret.startsWith(key.hint)).toBe(true);
    const listed = await call(client.apiKeys.list());
    expect(JSON.stringify(listed)).not.toContain(secret);
    await call(client.apiKeys.revoke({ id: key.id }));
    expect(await call(client.apiKeys.list())).toEqual([]);
  });

  it("seeds sample machines newest first", async () => {
    const client = api(true);
    const list = await call(client.machines.list());
    expect(list.map((machine) => machine.name)).toEqual([
      "research-agent-fork",
      "research-agent",
      "build-runner",
    ]);
    expect(list[0]?.forkedFrom).toBe(list[1]?.id);
  });
});

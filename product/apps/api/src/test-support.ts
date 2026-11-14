import type { ExecResult, MachineTemplate } from "@rookbox/contracts";
import type { ApiKeyRow, ApiKeyStore } from "./api-keys.js";
import { silentLogger } from "./logger.js";
import { createMachineService } from "./machines/service.js";
import type { MachineOp } from "./machines/state.js";
import { DuplicateNameError, type MachineRow, type MachineStore } from "./machines/store.js";
import type { SandboxInfo, SpaceClient, SpaceProbe, SpaceState } from "./space/client.js";
import { SpaceError } from "./space/client.js";

export function memoryMachineStore(): MachineStore & { rows: Map<string, MachineRow> } {
  const rows = new Map<string, MachineRow>();
  return {
    rows,
    async listByOwner(ownerId) {
      return [...rows.values()].filter((row) => row.ownerId === ownerId);
    },
    async listAll() {
      return [...rows.values()];
    },
    async find(ownerId, id) {
      const row = rows.get(id);
      return row && row.ownerId === ownerId ? row : null;
    },
    async insert(row) {
      for (const other of rows.values()) {
        if (other.ownerId === row.ownerId && other.name === row.name)
          throw new DuplicateNameError(row.name);
      }
      const full: MachineRow = {
        ...row,
        op: null,
        opAt: null,
        createdAt: row.createdAt ?? new Date(),
      };
      rows.set(row.id, full);
      return full;
    },
    async setOp(id, op: MachineOp | null) {
      const row = rows.get(id);
      if (row) rows.set(id, { ...row, op, opAt: op ? new Date() : null });
    },
    async remove(id) {
      rows.delete(id);
    },
  };
}

export type FakeSandbox = SandboxInfo & { trafficToken: string };

/** An in-memory SPACE that records what the API asked of it. */
export function fakeSpace() {
  const sandboxes = new Map<string, FakeSandbox>();
  const calls: { op: string; args: unknown[] }[] = [];
  let next = 1;
  const record = (op: string, ...args: unknown[]) => calls.push({ op, args });
  const require = (id: string) => {
    const found = sandboxes.get(id);
    if (!found) throw new SpaceError(404, "sandbox not found");
    return found;
  };
  const set = (id: string, state: SpaceState) => {
    sandboxes.set(id, { ...require(id), state });
  };
  const space: SpaceClient & {
    sandboxes: typeof sandboxes;
    calls: typeof calls;
    execResult: ExecResult;
    killOutcome: "deleted" | "queued";
    probeResult: SpaceProbe;
  } = {
    sandboxes,
    calls,
    execResult: { stdout: "hi\n", stderr: "", exitCode: 0, truncated: false },
    killOutcome: "deleted",
    async create(input) {
      record("create", input);
      const id = `sbx${next++}`;
      sandboxes.set(id, {
        id,
        templateId: input.templateId,
        state: "running",
        metadata: { ...input.metadata },
        envdAccessToken: `envd-${id}`,
        trafficToken: `traffic-${id}`,
      });
      return { id };
    },
    async list(metadata) {
      record("list", metadata);
      return [...sandboxes.values()].filter((s) =>
        Object.entries(metadata).every(([key, value]) => s.metadata[key] === value),
      );
    },
    async get(id) {
      record("get", id);
      return sandboxes.get(id) ?? null;
    },
    async suspend(id) {
      record("suspend", id);
      set(id, "paused");
    },
    async restore(id, timeoutS) {
      record("restore", id, timeoutS);
      set(id, "running");
    },
    async fork(id, timeoutS) {
      record("fork", id, timeoutS);
      const source = require(id);
      const child = `sbx${next++}`;
      // Like SPACE, the fork starts without the source's lifecycle state.
      sandboxes.set(child, { ...source, id: child, state: "running", metadata: {} });
      return { id: child };
    },
    probeResult: {
      keyConfigured: true,
      reachable: true,
      statusClass: "2xx",
      auth: "ok",
      ms: 1,
    },
    async probe() {
      return space.probeResult;
    },
    async kill(id) {
      record("kill", id);
      if (!sandboxes.has(id)) return "missing";
      if (space.killOutcome === "deleted") sandboxes.delete(id);
      return space.killOutcome;
    },
    async trafficToken(id, timeoutS) {
      record("trafficToken", id, timeoutS);
      return require(id).trafficToken;
    },
    async exec(id, token, command, timeoutMs) {
      record("exec", id, token, command, timeoutMs);
      return space.execResult;
    },
  };
  return space;
}

export function newMachineService(
  overrides: {
    maxMachinesPerUser?: number;
    maxRunningTotal?: number;
    templates?: MachineTemplate[];
    allowInternet?: boolean;
  } = {},
) {
  const store = memoryMachineStore();
  const space = fakeSpace();
  const service = createMachineService({
    store,
    space,
    logger: silentLogger,
    e2bDomain: "box.example.test",
    templates: overrides.templates ?? ["desktop", "corvo-computer", "seed"],
    defaultIdleTimeoutS: 900,
    maxMachinesPerUser: overrides.maxMachinesPerUser ?? 10,
    maxRunningTotal: overrides.maxRunningTotal ?? 0,
    allowInternet: overrides.allowInternet ?? true,
    random: () => 0.5,
  });
  return { store, space, service };
}

export function memoryApiKeyStore(): ApiKeyStore & {
  rows: Map<string, ApiKeyRow & { revokedAt: Date | null }>;
} {
  const rows = new Map<string, ApiKeyRow & { revokedAt: Date | null }>();
  return {
    rows,
    async listActive(userId) {
      return [...rows.values()].filter((row) => row.userId === userId && !row.revokedAt);
    },
    async insert(row) {
      const full = { ...row, createdAt: new Date(), lastUsedAt: null, revokedAt: null };
      rows.set(row.id, full);
      return full;
    },
    async revoke(userId, id) {
      const row = rows.get(id);
      if (!row || row.userId !== userId || row.revokedAt) return false;
      rows.set(id, { ...row, revokedAt: new Date() });
      return true;
    },
    async findActiveByHash(keyHash) {
      return [...rows.values()].find((row) => row.keyHash === keyHash && !row.revokedAt) ?? null;
    },
    async touch(id, at) {
      const row = rows.get(id);
      if (row) rows.set(id, { ...row, lastUsedAt: at });
    },
  };
}

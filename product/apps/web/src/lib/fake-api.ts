import { createRouterClient, implement } from "@orpc/server";
import type { ApiKey, AppClient, Machine, MachineSize, UsageDay } from "@rookbox/contracts";
import {
  API_KEY_PREFIX,
  AVAILABLE_TEMPLATES,
  appContract,
  canPerform,
  MACHINE_NAME_MAX_LENGTH,
  SIZE_PRESETS,
} from "@rookbox/contracts";

/**
 * An in-memory stand-in for the Rook Box API, so the dashboard runs with no server. It implements
 * the shared contract, so inputs and outputs are validated exactly as the real API will validate
 * them, and screens move through the same states (creating, running, suspending, ...) with
 * simulated latency. Everything resets on reload.
 */
export type FakeApiOptions = {
  /** Range of the delay before each answer, in milliseconds. */
  latencyMs?: readonly [number, number];
  /** How long a machine stays in a transitional state. */
  stepMs?: number;
  now?: () => Date;
  random?: () => number;
  /** Start with a few sample machines and a key. */
  seed?: boolean;
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** A steady number in [0, 1) from a string, so the sample usage is the same on every load. */
function hash01(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 2 ** 32;
}

export function createFakeApi(options: FakeApiOptions = {}): AppClient {
  const {
    latencyMs = [180, 520],
    stepMs = 1_600,
    now = () => new Date(),
    random = Math.random,
    seed = false,
  } = options;

  const machines = new Map<string, Machine>();
  const keys = new Map<string, ApiKey>();

  const id = (prefix: string) =>
    `${prefix}_${Array.from({ length: 10 }, () => Math.floor(random() * 36).toString(36)).join("")}`;

  const latency = async () => {
    if (latencyMs[1] > 0) await sleep(latencyMs[0] + random() * (latencyMs[1] - latencyMs[0]));
  };

  /** Moves a machine on after `stepMs`, unless it was deleted or changed in between. */
  const later = (machineId: string, from: Machine["status"], to: Machine["status"] | null) => {
    setTimeout(() => {
      const machine = machines.get(machineId);
      if (!machine || machine.status !== from) return;
      if (to === null) machines.delete(machineId);
      else machines.set(machineId, { ...machine, status: to });
    }, stepMs);
  };

  const uniqueName = (base: string) => {
    const taken = new Set([...machines.values()].map((machine) => machine.name));
    const stem = base.slice(0, MACHINE_NAME_MAX_LENGTH - 3).replace(/-+$/, "");
    if (!taken.has(stem)) return stem;
    for (let n = 2; ; n += 1) {
      const candidate = `${stem}-${n}`;
      if (!taken.has(candidate)) return candidate;
    }
  };

  const add = (fields: {
    name: string;
    size: MachineSize;
    status: Machine["status"];
    createdAt: Date;
    forkedFrom?: string | null;
  }) => {
    const machine: Machine = {
      id: id("m"),
      name: uniqueName(fields.name),
      template: "seed",
      status: fields.status,
      size: { ...fields.size },
      createdAt: fields.createdAt.toISOString(),
      forkedFrom: fields.forkedFrom ?? null,
    };
    machines.set(machine.id, machine);
    return machine;
  };

  if (seed) {
    const at = now().getTime();
    add({
      name: "build-runner",
      size: SIZE_PRESETS.medium,
      status: "running",
      createdAt: new Date(at - 3 * DAY),
    });
    const research = add({
      name: "research-agent",
      size: SIZE_PRESETS.small,
      status: "suspended",
      createdAt: new Date(at - 26 * HOUR),
    });
    add({
      name: "research-agent-fork",
      size: SIZE_PRESETS.small,
      status: "running",
      createdAt: new Date(at - 2 * HOUR),
      forkedFrom: research.id,
    });
    const key: ApiKey = {
      id: id("k"),
      name: "Local development",
      hint: `${API_KEY_PREFIX}7f3c`,
      createdAt: new Date(at - 5 * DAY).toISOString(),
      lastUsedAt: new Date(at - 40 * 60_000).toISOString(),
    };
    keys.set(key.id, key);
  }

  const os = implement(appContract);

  const find = (machineId: string) => machines.get(machineId);

  const router = os.router({
    machines: {
      list: os.machines.list.handler(async () => {
        await latency();
        return [...machines.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      }),
      get: os.machines.get.handler(async ({ input, errors }) => {
        await latency();
        const machine = find(input.id);
        if (!machine) throw errors.NOT_FOUND();
        return machine;
      }),
      create: os.machines.create.handler(async ({ input, errors }) => {
        await latency();
        if (!AVAILABLE_TEMPLATES.includes(input.template)) {
          throw errors.CONFLICT({
            message: `The ${input.template} template is not available yet.`,
          });
        }
        const machine = add({
          name: input.name ?? `machine-${id("x").slice(2, 6)}`,
          size: input.size,
          status: "creating",
          createdAt: now(),
        });
        later(machine.id, "creating", "running");
        return machine;
      }),
      suspend: os.machines.suspend.handler(async ({ input, errors }) => {
        await latency();
        const machine = find(input.id);
        if (!machine) throw errors.NOT_FOUND();
        if (!canPerform(machine.status, "suspend")) throw errors.CONFLICT();
        const next = { ...machine, status: "suspending" as const };
        machines.set(next.id, next);
        later(next.id, "suspending", "suspended");
        return next;
      }),
      restore: os.machines.restore.handler(async ({ input, errors }) => {
        await latency();
        const machine = find(input.id);
        if (!machine) throw errors.NOT_FOUND();
        if (!canPerform(machine.status, "restore")) throw errors.CONFLICT();
        const next = { ...machine, status: "restoring" as const };
        machines.set(next.id, next);
        later(next.id, "restoring", "running");
        return next;
      }),
      fork: os.machines.fork.handler(async ({ input, errors }) => {
        await latency();
        const source = find(input.id);
        if (!source) throw errors.NOT_FOUND();
        if (!canPerform(source.status, "fork")) throw errors.CONFLICT();
        // Only the disk is copied: the fork boots fresh, whatever the source was doing.
        const fork = add({
          name: input.name ?? `${source.name}-fork`,
          size: source.size,
          status: "creating",
          createdAt: now(),
          forkedFrom: source.id,
        });
        later(fork.id, "creating", "running");
        return fork;
      }),
      delete: os.machines.delete.handler(async ({ input, errors }) => {
        await latency();
        const machine = find(input.id);
        if (!machine) throw errors.NOT_FOUND();
        if (!canPerform(machine.status, "delete")) throw errors.CONFLICT();
        machines.set(machine.id, { ...machine, status: "deleting" });
        later(machine.id, "deleting", null);
        return { ok: true as const };
      }),
    },
    apiKeys: {
      list: os.apiKeys.list.handler(async () => {
        await latency();
        return [...keys.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      }),
      create: os.apiKeys.create.handler(async ({ input }) => {
        await latency();
        const bytes = new Uint8Array(20);
        globalThis.crypto.getRandomValues(bytes);
        const secret = `${API_KEY_PREFIX}${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
        const key: ApiKey = {
          id: id("k"),
          name: input.name,
          hint: secret.slice(0, API_KEY_PREFIX.length + 4),
          createdAt: now().toISOString(),
          lastUsedAt: null,
        };
        keys.set(key.id, key);
        return { key, secret };
      }),
      revoke: os.apiKeys.revoke.handler(async ({ input, errors }) => {
        await latency();
        if (!keys.delete(input.id)) throw errors.NOT_FOUND();
        return { ok: true as const };
      }),
    },
    usage: {
      summary: os.usage.summary.handler(async ({ input }) => {
        await latency();
        const today = Date.UTC(now().getUTCFullYear(), now().getUTCMonth(), now().getUTCDate());
        const days: UsageDay[] = Array.from({ length: input.days }, (_, index) => {
          const date = new Date(today - (input.days - 1 - index) * DAY).toISOString().slice(0, 10);
          const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
          const quiet = weekday === 0 || weekday === 6 ? 0.35 : 1;
          return { date, machineHours: Math.round(hash01(date) * 48 * quiet * 10) / 10 };
        });
        const total = days.reduce((sum, day) => sum + day.machineHours, 0);
        return { days, totalMachineHours: Math.round(total * 10) / 10, sample: true };
      }),
    },
  });

  return createRouterClient(router);
}

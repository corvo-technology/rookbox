import { createRouterClient, implement, ORPCError } from "@orpc/server";
import type { ApiErrorCode, ApiKey, AppClient, Machine, MachineSize } from "@rookbox/contracts";
import {
  API_ERRORS,
  API_KEY_PREFIX,
  appContract,
  canPerform,
  MACHINE_NAME_MAX_LENGTH,
  SIZE_PRESETS,
} from "@rookbox/contracts";
import { sampleUsage } from "./fake-usage";

/**
 * An in-memory stand-in for the Rookbox API, so the dashboard runs with no server. It implements
 * the shared contract, so inputs and outputs are validated exactly as the real API will validate
 * them, and screens move through the same states (creating, running, suspending, ...) with
 * simulated latency. Everything resets on reload.
 */
export type FakeApiOptions = {
  /** Range of the delay before each answer, in milliseconds. */
  latencyMs?: readonly [number, number];
  /** How long a machine stays in a transitional state (suspending, restoring, deleting). */
  stepMs?: number;
  /** How long a create waits before it answers, like a template's first boot. */
  createMs?: number;
  /** Fail every create with this error, to see how the screens report it. */
  failCreateWith?: ApiErrorCode;
  now?: () => Date;
  random?: () => number;
  /** Start with a few sample machines and a key. */
  seed?: boolean;
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MAX_MACHINES = 10;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function createFakeApi(options: FakeApiOptions = {}): AppClient {
  const {
    latencyMs = [180, 520],
    stepMs = 1_600,
    createMs = 0,
    failCreateWith,
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
    template?: Machine["template"];
    size: MachineSize;
    status: Machine["status"];
    createdAt: Date;
    forkedFrom?: string | null;
    idleTimeoutS?: number;
  }) => {
    const machineId = id("m");
    const machine: Machine = {
      id: machineId,
      name: uniqueName(fields.name),
      template: fields.template ?? "seed",
      status: fields.status,
      size: { ...fields.size },
      idleTimeoutS: fields.idleTimeoutS ?? 900,
      createdAt: fields.createdAt.toISOString(),
      forkedFrom: fields.forkedFrom ?? null,
      // The fake has no real host, so there is no desktop to open.
      access: { desktop: false, portUrlTemplate: `https://{port}-${machineId}.box.example.com` },
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
      create: os.machines.create.handler(async ({ input }) => {
        await latency();
        if (failCreateWith) {
          throw new ORPCError(failCreateWith, { status: API_ERRORS[failCreateWith].status });
        }
        if (machines.size >= MAX_MACHINES) {
          throw new ORPCError("MACHINE_LIMIT", {
            status: API_ERRORS.MACHINE_LIMIT.status,
            data: { limit: MAX_MACHINES },
          });
        }
        const name = input.name ?? `machine-${id("x").slice(2, 6)}`;
        if ([...machines.values()].some((machine) => machine.name === name)) {
          throw new ORPCError("NAME_TAKEN", { status: API_ERRORS.NAME_TAKEN.status });
        }
        // Like the real API, the answer comes once the machine is up.
        if (createMs > 0) await sleep(createMs);
        return add({
          template: input.template,
          name,
          size: input.size,
          idleTimeoutS: input.idleTimeoutS,
          status: "running",
          createdAt: now(),
        });
      }),
      suspend: os.machines.suspend.handler(async ({ input, errors }) => {
        await latency();
        const machine = find(input.id);
        if (!machine) throw errors.NOT_FOUND();
        if (!canPerform(machine.status, "suspend")) throw errors.CONFLICT();
        machines.set(machine.id, { ...machine, status: "suspending" });
        await sleep(stepMs);
        const done = { ...machine, status: "suspended" as const };
        machines.set(done.id, done);
        return done;
      }),
      restore: os.machines.restore.handler(async ({ input, errors }) => {
        await latency();
        const machine = find(input.id);
        if (!machine) throw errors.NOT_FOUND();
        if (!canPerform(machine.status, "restore")) throw errors.CONFLICT();
        machines.set(machine.id, { ...machine, status: "restoring" });
        await sleep(stepMs);
        const done = { ...machine, status: "running" as const };
        machines.set(done.id, done);
        return done;
      }),
      fork: os.machines.fork.handler(async ({ input, errors }) => {
        await latency();
        const source = find(input.id);
        if (!source) throw errors.NOT_FOUND();
        if (!canPerform(source.status, "fork")) throw errors.CONFLICT();
        // Only the disk is copied: the fork boots fresh, whatever the source was doing.
        const fork = add({
          template: source.template,
          name: input.name ?? `${source.name}-fork`,
          size: source.size,
          idleTimeoutS: source.idleTimeoutS,
          status: "running",
          createdAt: now(),
          forkedFrom: source.id,
        });
        return fork;
      }),
      exec: os.machines.exec.handler(async ({ input, errors }) => {
        await latency();
        const machine = find(input.id);
        if (!machine) throw errors.NOT_FOUND();
        if (machine.status !== "running") {
          throw errors.CONFLICT({ message: "The machine is not running." });
        }
        // The fake runs nothing: it echoes the command so the runner can be tried.
        return {
          stdout: `(fake) would run: ${input.command}\n`,
          stderr: "",
          exitCode: 0,
          truncated: false,
        };
      }),
      // The fake has no desktop, so there is never a link to hand out.
      desktopLink: os.machines.desktopLink.handler(async ({ input, errors }) => {
        await latency();
        if (!find(input.id)) throw errors.NOT_FOUND();
        throw errors.NOT_FOUND({ message: "No such desktop." });
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
        return sampleUsage(input.period, now(), [...machines.values()]);
      }),
    },
    admin: {
      // Nobody is an admin in the fake.
      usage: os.admin.usage.handler(async ({ errors }) => {
        await latency();
        throw errors.FORBIDDEN();
      }),
    },
    config: {
      get: os.config.get.handler(async () => {
        await latency();
        return {
          templates: ["desktop", "corvo-computer", "seed"],
          maxMachines: MAX_MACHINES,
          defaultIdleTimeoutS: 900,
          domain: "box.example.com",
        };
      }),
    },
  });

  return createRouterClient(router);
}

import type {
  CreateMachineInput,
  ExecInput,
  ExecResult,
  ForkMachineInput,
  Machine,
} from "@rookbox/contracts";
import {
  AVAILABLE_TEMPLATES,
  canPerform,
  DESKTOP_TEMPLATES,
  MACHINE_NAME_MAX_LENGTH,
} from "@rookbox/contracts";
import type { Logger } from "../logger.js";
import type { SandboxInfo, SpaceClient } from "../space/client.js";
import { SpaceError, sandboxHost } from "../space/client.js";
import { type MachineOp, mapStatus } from "./state.js";
import { DuplicateNameError, type MachineRow, type MachineStore } from "./store.js";

/** The metadata key every sandbox is tagged with; list and ownership checks rely on it. */
export const OWNER_TAG = "rookbox.owner";

export class MachineError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "MachineError";
  }
}

export type MachineServiceOptions = {
  store: MachineStore;
  space: SpaceClient;
  logger: Logger;
  e2bDomain: string;
  /** Origin that serves the desktop proxy (the API itself). */
  apiOrigin: string;
  idleTimeoutS: number;
  maxMachinesPerUser: number;
  now?: () => Date;
  random?: () => number;
};

function randomSuffix(random: () => number): string {
  return Array.from({ length: 4 }, () => Math.floor(random() * 36).toString(36)).join("");
}

export function createMachineService(options: MachineServiceOptions) {
  const { store, space, logger, e2bDomain, apiOrigin, idleTimeoutS } = options;
  const now = options.now ?? (() => new Date());
  const random = options.random ?? Math.random;

  /** SPACE's answer, but only for a sandbox this user owns. */
  async function owned(
    ownerId: string,
    id: string,
  ): Promise<{ row: MachineRow; info: SandboxInfo | null }> {
    const row = await store.find(ownerId, id);
    if (!row) throw new MachineError("NOT_FOUND", "No such machine.");
    const info = await space.get(id);
    const tag = info?.metadata[OWNER_TAG];
    // The tag is a second lock: a sandbox tagged for someone else is never touched.
    if (info && tag !== undefined && tag !== ownerId) {
      throw new MachineError("NOT_FOUND", "No such machine.");
    }
    return { row, info };
  }

  function toMachine(row: MachineRow, info: SandboxInfo | null): Machine | null {
    const status = mapStatus({
      space: info ? info.state : "missing",
      op: row.op,
      opAt: row.opAt,
      now: now(),
    });
    if (status === null) return null;
    const hasDesktop = DESKTOP_TEMPLATES.includes(row.template);
    return {
      id: row.id,
      name: row.name,
      template: row.template,
      status,
      size: row.size,
      createdAt: row.createdAt.toISOString(),
      forkedFrom: row.forkedFrom,
      access: {
        desktopUrl:
          hasDesktop && status === "running"
            ? `${apiOrigin}/desktop/${encodeURIComponent(row.id)}/vnc.html?autoconnect=true&resize=scale&path=${encodeURIComponent(`desktop/${row.id}/websockify`)}`
            : null,
        // E2B's getHost(port) is `${port}-${sandboxId}.${domain}`.
        portUrlTemplate: `https://${sandboxHost("{port}", row.id, e2bDomain)}`,
      },
    };
  }

  async function uniqueName(ownerId: string, base: string): Promise<string> {
    const taken = new Set((await store.listByOwner(ownerId)).map((row) => row.name));
    const stem = base.slice(0, MACHINE_NAME_MAX_LENGTH - 5).replace(/-+$/, "") || "machine";
    if (!taken.has(base) && base.length <= MACHINE_NAME_MAX_LENGTH) return base;
    for (let n = 2; n < 1_000; n += 1) {
      const candidate = `${stem}-${n}`;
      if (!taken.has(candidate)) return candidate;
    }
    return `${stem}-${randomSuffix(random)}`;
  }

  async function withOp<T>(id: string, op: MachineOp, run: () => Promise<T>): Promise<T> {
    await store.setOp(id, op);
    try {
      return await run();
    } catch (error) {
      await store.setOp(id, null);
      throw error;
    }
  }

  function wrap(error: unknown): never {
    if (error instanceof MachineError) throw error;
    if (error instanceof SpaceError) {
      if (error.status === 404) throw new MachineError("NOT_FOUND", "No such machine.");
      if (error.status === 409 || error.status === 412) {
        throw new MachineError("CONFLICT", error.message);
      }
    }
    throw error;
  }

  async function view(ownerId: string, id: string): Promise<Machine> {
    const { row, info } = await owned(ownerId, id);
    const machine = toMachine(row, info);
    if (!machine) {
      await store.remove(id);
      throw new MachineError("NOT_FOUND", "No such machine.");
    }
    return machine;
  }

  return {
    async list(ownerId: string): Promise<Machine[]> {
      const rows = await store.listByOwner(ownerId);
      if (rows.length === 0) return [];
      const listed = new Map(
        (await space.list({ [OWNER_TAG]: ownerId })).map((info) => [info.id, info]),
      );
      const machines: Machine[] = [];
      for (const row of rows) {
        // A row SPACE did not list may be a fork that carries no tag; ask for it by id.
        const info = listed.get(row.id) ?? (await space.get(row.id));
        const tag = info?.metadata[OWNER_TAG];
        const machine =
          info && (tag === undefined || tag === ownerId) ? toMachine(row, info) : null;
        if (machine) machines.push(machine);
        else if (!info) await store.remove(row.id);
      }
      return machines;
    },

    get: view,

    async create(ownerId: string, input: CreateMachineInput): Promise<Machine> {
      if (!AVAILABLE_TEMPLATES.includes(input.template)) {
        throw new MachineError("CONFLICT", `The ${input.template} template is not available.`);
      }
      const existing = await store.listByOwner(ownerId);
      if (existing.length >= options.maxMachinesPerUser) {
        throw new MachineError(
          "CONFLICT",
          `You have ${existing.length} machines, the most this account may hold. Delete one first.`,
        );
      }
      const name = input.name ?? (await uniqueName(ownerId, `machine-${randomSuffix(random)}`));
      if (existing.some((row) => row.name === name)) {
        throw new MachineError("CONFLICT", `You already have a machine named ${name}.`);
      }
      let created: { id: string };
      try {
        created = await space.create({
          templateId: input.template,
          metadata: { [OWNER_TAG]: ownerId, "rookbox.name": name },
          timeoutS: idleTimeoutS,
          size: input.size,
        });
      } catch (error) {
        logger.warn("space create failed", { owner: ownerId, error });
        if (error instanceof SpaceError && error.status >= 400 && error.status < 500) {
          throw new MachineError("CONFLICT", error.message);
        }
        throw error;
      }
      try {
        const row = await store.insert({
          id: created.id,
          ownerId,
          name,
          template: input.template,
          size: input.size,
          forkedFrom: null,
        });
        logger.info("machine created", { owner: ownerId, machine: row.id, template: row.template });
        return await view(ownerId, row.id);
      } catch (error) {
        // Do not leave a running sandbox nobody can see.
        await space.kill(created.id).catch(() => undefined);
        if (error instanceof DuplicateNameError) {
          throw new MachineError("CONFLICT", `You already have a machine named ${name}.`);
        }
        throw error;
      }
    },

    async suspend(ownerId: string, id: string): Promise<Machine> {
      const current = await view(ownerId, id);
      if (!canPerform(current.status, "suspend")) {
        throw new MachineError("CONFLICT", `A ${current.status} machine cannot be suspended.`);
      }
      try {
        await withOp(id, "suspending", () => space.suspend(id));
      } catch (error) {
        wrap(error);
      }
      await store.setOp(id, null);
      logger.info("machine suspended", { owner: ownerId, machine: id });
      return view(ownerId, id);
    },

    async restore(ownerId: string, id: string): Promise<Machine> {
      const current = await view(ownerId, id);
      if (!canPerform(current.status, "restore")) {
        throw new MachineError("CONFLICT", `A ${current.status} machine cannot be restored.`);
      }
      try {
        await withOp(id, "restoring", () => space.restore(id, idleTimeoutS));
      } catch (error) {
        wrap(error);
      }
      await store.setOp(id, null);
      logger.info("machine restored", { owner: ownerId, machine: id });
      return view(ownerId, id);
    },

    async fork(ownerId: string, input: ForkMachineInput): Promise<Machine> {
      const source = await view(ownerId, input.id);
      if (!canPerform(source.status, "fork")) {
        throw new MachineError("CONFLICT", `A ${source.status} machine cannot be forked.`);
      }
      const rows = await store.listByOwner(ownerId);
      if (rows.length >= options.maxMachinesPerUser) {
        throw new MachineError("CONFLICT", "You have reached the machine limit. Delete one first.");
      }
      const name = input.name ?? (await uniqueName(ownerId, `${source.name}-fork`));
      if (rows.some((row) => row.name === name)) {
        throw new MachineError("CONFLICT", `You already have a machine named ${name}.`);
      }
      let child: { id: string };
      try {
        child = await space.fork(input.id, idleTimeoutS);
      } catch (error) {
        wrap(error);
      }
      try {
        const row = await store.insert({
          id: child.id,
          ownerId,
          name,
          template: source.template,
          size: source.size,
          forkedFrom: source.id,
        });
        logger.info("machine forked", { owner: ownerId, machine: row.id, source: source.id });
        return await view(ownerId, row.id);
      } catch (error) {
        await space.kill(child.id).catch(() => undefined);
        if (error instanceof DuplicateNameError) {
          throw new MachineError("CONFLICT", `You already have a machine named ${name}.`);
        }
        throw error;
      }
    },

    async delete(ownerId: string, id: string): Promise<void> {
      const current = await view(ownerId, id);
      if (!canPerform(current.status, "delete")) {
        throw new MachineError("CONFLICT", `A ${current.status} machine cannot be deleted.`);
      }
      let outcome: "deleted" | "queued" | "missing";
      try {
        outcome = await withOp(id, "deleting", () => space.kill(id));
      } catch (error) {
        wrap(error);
      }
      // A queued delete stays visible as "deleting" until SPACE drops the sandbox.
      if (outcome !== "queued") await store.remove(id);
      logger.info("machine deleted", { owner: ownerId, machine: id, outcome });
    },

    async exec(ownerId: string, input: ExecInput): Promise<ExecResult> {
      const { row, info } = await owned(ownerId, input.id);
      const machine = toMachine(row, info);
      if (!machine || !info) throw new MachineError("NOT_FOUND", "No such machine.");
      if (machine.status !== "running") {
        throw new MachineError("CONFLICT", `The machine is ${machine.status}, not running.`);
      }
      if (!info.envdAccessToken) {
        throw new MachineError("CONFLICT", "SPACE did not give access to the machine.");
      }
      try {
        const result = await space.exec(
          input.id,
          info.envdAccessToken,
          input.command,
          input.timeoutMs,
        );
        logger.info("machine exec", { owner: ownerId, machine: row.id, exitCode: result.exitCode });
        return result;
      } catch (error) {
        wrap(error);
      }
    },

    /** What the desktop proxy needs: the sandbox id and its traffic token, for a running desktop. */
    async desktopTarget(
      ownerId: string,
      id: string,
    ): Promise<{ id: string; trafficToken: string }> {
      const { row, info } = await owned(ownerId, id);
      const machine = toMachine(row, info);
      if (!machine || !DESKTOP_TEMPLATES.includes(row.template)) {
        throw new MachineError("NOT_FOUND", "No such desktop.");
      }
      if (machine.status !== "running") {
        throw new MachineError("CONFLICT", `The machine is ${machine.status}, not running.`);
      }
      try {
        return { id, trafficToken: await space.trafficToken(id, idleTimeoutS) };
      } catch (error) {
        wrap(error);
      }
    },
  };
}

export type MachineService = ReturnType<typeof createMachineService>;

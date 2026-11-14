import type {
  ApiErrorCode,
  Config,
  CreateMachineInput,
  ExecInput,
  ExecResult,
  ForkMachineInput,
  Machine,
  MachineTemplate,
} from "@rookbox/contracts";
import {
  API_ERRORS,
  canPerform,
  DESKTOP_TEMPLATES,
  MACHINE_NAME_MAX_LENGTH,
} from "@rookbox/contracts";
import type { Logger } from "../logger.js";
import type { SandboxInfo, SpaceClient, SpaceErrorCode } from "../space/client.js";
import { SpaceError, sandboxHost } from "../space/client.js";
import { DESKTOP_EXEC_TIMEOUT_MS, DESKTOP_SCRIPT } from "./desktop-stack.js";
import { type MachineOp, mapStatus } from "./state.js";
import { DuplicateNameError, type MachineRow, type MachineStore } from "./store.js";

/** The metadata key every sandbox is tagged with; list and ownership checks rely on it. */
export const OWNER_TAG = "rookbox.owner";

/** A failure the API reports to the client by code. The message is safe to send. */
export class MachineError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string = API_ERRORS[code].message,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = "MachineError";
  }
}

const SPACE_CODES: Record<SpaceErrorCode, ApiErrorCode> = {
  AUTH: "HOST_AUTH",
  NOT_FOUND: "NOT_FOUND",
  TEMPLATE_NOT_FOUND: "TEMPLATE_UNAVAILABLE",
  CONFLICT: "CONFLICT",
  BAD_REQUEST: "HOST_ERROR",
  QUOTA: "HOST_QUOTA",
  CAPACITY: "HOST_CAPACITY",
  TIMEOUT: "HOST_TIMEOUT",
  UNREACHABLE: "HOST_UNREACHABLE",
  UPSTREAM: "HOST_ERROR",
};

/**
 * Turns a SPACE failure into a coded error with a generic message, so what SPACE said (which may
 * name internals) never reaches a client. Anything else comes back unchanged.
 */
export function toMachineError(error: unknown): unknown {
  if (error instanceof SpaceError) return new MachineError(SPACE_CODES[error.code]);
  return error;
}

/** Runs one task at a time per key, so a check and the write that follows it cannot interleave. */
function keyedLock() {
  const tails = new Map<string, Promise<unknown>>();
  return async <T>(key: string, task: () => Promise<T>): Promise<T> => {
    const previous = tails.get(key) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(task);
    const tail = run.catch(() => undefined);
    tails.set(key, tail);
    try {
      return await run;
    } finally {
      if (tails.get(key) === tail) tails.delete(key);
    }
  };
}

export type MachineServiceOptions = {
  store: MachineStore;
  space: SpaceClient;
  logger: Logger;
  e2bDomain: string;
  /** Templates this deployment offers (`SPACE_TEMPLATES`). */
  templates: readonly MachineTemplate[];
  /** Idle seconds before a machine suspends, when the request does not choose. */
  defaultIdleTimeoutS: number;
  maxMachinesPerUser: number;
  /** Send `allowInternetAccess` at create. The host's default is no internet. Default true. */
  allowInternet?: boolean;
  now?: () => Date;
  random?: () => number;
};

function randomSuffix(random: () => number): string {
  return Array.from({ length: 4 }, () => Math.floor(random() * 36).toString(36)).join("");
}

export function createMachineService(options: MachineServiceOptions) {
  const { store, space, logger, e2bDomain } = options;
  const lock = keyedLock();
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
      idleTimeoutS: row.idleTimeoutS,
      createdAt: row.createdAt.toISOString(),
      forkedFrom: row.forkedFrom,
      access: {
        desktop: hasDesktop && status === "running",
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
      // A call that timed out or lost its connection may still finish on SPACE's side, so the
      // operation stays marked (it expires on its own) and the status follows what SPACE shows.
      const unsure =
        error instanceof SpaceError && (error.code === "TIMEOUT" || error.code === "UNREACHABLE");
      if (!unsure) await store.setOp(id, null);
      throw error;
    }
  }

  function wrap(error: unknown): never {
    throw toMachineError(error);
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

  async function listMachines(ownerId: string): Promise<Machine[]> {
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
      const machine = info && (tag === undefined || tag === ownerId) ? toMachine(row, info) : null;
      if (machine) machines.push(machine);
      else if (!info) await store.remove(row.id);
    }
    return machines;
  }

  /** Rows the owner holds. When it looks full, rows whose sandbox is gone are dropped first. */
  async function countMachines(ownerId: string): Promise<number> {
    const rows = await store.listByOwner(ownerId);
    if (rows.length < options.maxMachinesPerUser) return rows.length;
    return (await listMachines(ownerId)).length;
  }

  async function suspendMachine(ownerId: string, id: string): Promise<Machine> {
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
  }

  return {
    list: listMachines,

    get: view,

    /** What this deployment offers, for the dashboard's create form. */
    config(): Config {
      return {
        templates: [...options.templates],
        maxMachines: options.maxMachinesPerUser,
        defaultIdleTimeoutS: options.defaultIdleTimeoutS,
        domain: e2bDomain,
      };
    },

    create(ownerId: string, input: CreateMachineInput): Promise<Machine> {
      // One create at a time per account, so two at once cannot both pass the machine cap.
      return lock(ownerId, async () => {
        if (!options.templates.includes(input.template)) {
          throw new MachineError("TEMPLATE_UNAVAILABLE");
        }
        if ((await countMachines(ownerId)) >= options.maxMachinesPerUser) {
          throw new MachineError("MACHINE_LIMIT", undefined, { limit: options.maxMachinesPerUser });
        }
        const existing = await store.listByOwner(ownerId);
        const name = input.name ?? (await uniqueName(ownerId, `machine-${randomSuffix(random)}`));
        if (existing.some((row) => row.name === name)) throw new MachineError("NAME_TAKEN");
        const idleTimeoutS = input.idleTimeoutS ?? options.defaultIdleTimeoutS;
        let created: { id: string };
        try {
          created = await space.create({
            templateId: input.template,
            metadata: { [OWNER_TAG]: ownerId, "rookbox.name": name },
            timeoutS: idleTimeoutS,
            size: input.size,
            allowInternet: options.allowInternet ?? true,
          });
        } catch (error) {
          logger.warn("space create failed", { owner: ownerId, template: input.template, error });
          throw toMachineError(error);
        }
        try {
          const row = await store.insert({
            id: created.id,
            ownerId,
            name,
            template: input.template,
            size: input.size,
            idleTimeoutS,
            forkedFrom: null,
          });
          logger.info("machine created", {
            owner: ownerId,
            machine: row.id,
            template: row.template,
          });
          return await view(ownerId, row.id);
        } catch (error) {
          // Do not leave a running sandbox nobody can see.
          await space.kill(created.id).catch(() => undefined);
          if (error instanceof DuplicateNameError) throw new MachineError("NAME_TAKEN");
          throw toMachineError(error);
        }
      });
    },

    suspend: suspendMachine,

    async restore(ownerId: string, id: string): Promise<Machine> {
      const current = await view(ownerId, id);
      if (!canPerform(current.status, "restore")) {
        throw new MachineError("CONFLICT", `A ${current.status} machine cannot be restored.`);
      }
      try {
        await withOp(id, "restoring", () => space.restore(id, current.idleTimeoutS));
      } catch (error) {
        wrap(error);
      }
      await store.setOp(id, null);
      logger.info("machine restored", { owner: ownerId, machine: id });
      return view(ownerId, id);
    },

    fork(ownerId: string, input: ForkMachineInput): Promise<Machine> {
      return lock(ownerId, async () => {
        const source = await view(ownerId, input.id);
        if (!canPerform(source.status, "fork")) {
          throw new MachineError("CONFLICT", `A ${source.status} machine cannot be forked.`);
        }
        if ((await countMachines(ownerId)) >= options.maxMachinesPerUser) {
          throw new MachineError("MACHINE_LIMIT", undefined, { limit: options.maxMachinesPerUser });
        }
        const rows = await store.listByOwner(ownerId);
        const name = input.name ?? (await uniqueName(ownerId, `${source.name}-fork`));
        if (rows.some((row) => row.name === name)) throw new MachineError("NAME_TAKEN");
        let child: { id: string };
        try {
          child = await space.fork(input.id, source.idleTimeoutS);
        } catch (error) {
          logger.warn("space fork failed", { owner: ownerId, machine: input.id, error });
          throw toMachineError(error);
        }
        try {
          const row = await store.insert({
            id: child.id,
            ownerId,
            name,
            template: source.template,
            size: source.size,
            idleTimeoutS: source.idleTimeoutS,
            forkedFrom: source.id,
          });
          logger.info("machine forked", { owner: ownerId, machine: row.id, source: source.id });
          return await view(ownerId, row.id);
        } catch (error) {
          await space.kill(child.id).catch(() => undefined);
          if (error instanceof DuplicateNameError) throw new MachineError("NAME_TAKEN");
          throw toMachineError(error);
        }
      });
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
        throw new MachineError("CONFLICT", "The machine did not give access.");
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

    /**
     * Suspends every running machine the user owns (an operator action). Machines already
     * suspended or in transition are skipped; one that fails does not stop the others.
     */
    async suspendAll(
      ownerId: string,
    ): Promise<{ suspended: number; skipped: number; failed: number }> {
      const result = { suspended: 0, skipped: 0, failed: 0 };
      for (const row of await store.listByOwner(ownerId)) {
        try {
          const current = await view(ownerId, row.id);
          if (!canPerform(current.status, "suspend")) {
            result.skipped += 1;
            continue;
          }
          await suspendMachine(ownerId, row.id);
          result.suspended += 1;
        } catch (error) {
          logger.warn("suspend of a user's machine failed", {
            owner: ownerId,
            machine: row.id,
            error,
          });
          if (error instanceof MachineError && error.code === "NOT_FOUND") result.skipped += 1;
          else result.failed += 1;
        }
      }
      logger.info("user machines suspended", { owner: ownerId, ...result });
      return result;
    },

    /**
     * Makes sure the machine's desktop stack runs (see `desktop-stack.ts`), starting it when it
     * does not. Safe to call on every open: a stack that is up costs one local request.
     */
    async ensureDesktop(ownerId: string, id: string): Promise<void> {
      const { row, info } = await owned(ownerId, id);
      const machine = toMachine(row, info);
      if (!machine || !DESKTOP_TEMPLATES.includes(row.template)) {
        throw new MachineError("NOT_FOUND", "No such desktop.");
      }
      if (machine.status !== "running") {
        throw new MachineError("CONFLICT", `The machine is ${machine.status}, not running.`);
      }
      if (!info?.envdAccessToken) {
        throw new MachineError("CONFLICT", "The machine did not give access.");
      }
      let result: ExecResult;
      try {
        result = await space.exec(
          id,
          info.envdAccessToken,
          DESKTOP_SCRIPT,
          DESKTOP_EXEC_TIMEOUT_MS,
        );
      } catch (error) {
        logger.warn("desktop start failed", { owner: ownerId, machine: id, error });
        wrap(error);
      }
      if (result.exitCode !== 0) {
        logger.warn("desktop did not come up", {
          owner: ownerId,
          machine: id,
          exitCode: result.exitCode,
          stderr: result.stderr.slice(0, 500),
        });
        throw new MachineError("HOST_ERROR", "The desktop did not start. Try again in a moment.");
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
        return { id, trafficToken: await space.trafficToken(id, row.idleTimeoutS) };
      } catch (error) {
        wrap(error);
      }
    },
  };
}

export type MachineService = ReturnType<typeof createMachineService>;

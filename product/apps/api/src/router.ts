import { implement, ORPCError } from "@orpc/server";
import { API_ERRORS, appContract } from "@rookbox/contracts";
import { ApiKeyLimitError, type ApiKeyService } from "./api-keys.js";
import type { AuthUser } from "./auth.js";
import type { Logger } from "./logger.js";
import { MachineError, type MachineService, toMachineError } from "./machines/service.js";

export type RpcContext = { user: AuthUser };

export type RouterDeps = {
  machines: MachineService;
  apiKeys: ApiKeyService;
  logger: Logger;
};

export function createRouter({ machines, apiKeys, logger }: RouterDeps) {
  const os = implement(appContract).$context<RpcContext>();

  /**
   * Coded errors reach the client with their code and a generic message. Anything else is logged
   * here and hidden: no upstream body, address or credential ever leaves the API.
   */
  async function run<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (raw) {
      const error = toMachineError(raw);
      if (error instanceof MachineError) {
        if (error.code === "HOST_AUTH") logger.error("SPACE rejected the service key");
        throw new ORPCError(error.code, {
          status: API_ERRORS[error.code].status,
          message: error.message,
          data: error.data,
        });
      }
      if (error instanceof ORPCError) throw error;
      logger.error("request failed", { error });
      throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Something went wrong." });
    }
  }

  return os.router({
    machines: {
      list: os.machines.list.handler(({ context }) => run(() => machines.list(context.user.id))),
      get: os.machines.get.handler(({ input, context }) =>
        run(() => machines.get(context.user.id, input.id)),
      ),
      create: os.machines.create.handler(({ input, context }) =>
        run(() => machines.create(context.user.id, input)),
      ),
      suspend: os.machines.suspend.handler(({ input, context }) =>
        run(() => machines.suspend(context.user.id, input.id)),
      ),
      restore: os.machines.restore.handler(({ input, context }) =>
        run(() => machines.restore(context.user.id, input.id)),
      ),
      fork: os.machines.fork.handler(({ input, context }) =>
        run(() => machines.fork(context.user.id, input)),
      ),
      delete: os.machines.delete.handler(({ input, context }) =>
        run(async () => {
          await machines.delete(context.user.id, input.id);
          return { ok: true as const };
        }),
      ),
      exec: os.machines.exec.handler(({ input, context }) =>
        run(() => machines.exec(context.user.id, input)),
      ),
    },
    apiKeys: {
      list: os.apiKeys.list.handler(({ context }) => apiKeys.list(context.user.id)),
      create: os.apiKeys.create.handler(async ({ input, context }) => {
        try {
          return await apiKeys.create(context.user.id, input.name);
        } catch (error) {
          if (error instanceof ApiKeyLimitError) {
            throw new ORPCError("BAD_REQUEST", { message: error.message });
          }
          throw error;
        }
      }),
      revoke: os.apiKeys.revoke.handler(async ({ input, context, errors }) => {
        if (!(await apiKeys.revoke(context.user.id, input.id))) throw errors.NOT_FOUND();
        return { ok: true as const };
      }),
    },
    config: {
      get: os.config.get.handler(() => machines.config()),
    },
  });
}

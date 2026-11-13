import { implement, ORPCError } from "@orpc/server";
import { appContract } from "@rookbox/contracts";
import { ApiKeyLimitError, type ApiKeyService } from "./api-keys.js";
import type { AuthUser } from "./auth.js";
import type { Logger } from "./logger.js";
import { MachineError, type MachineService } from "./machines/service.js";
import { SpaceError } from "./space/client.js";
import { sampleUsage } from "./usage.js";

export type RpcContext = { user: AuthUser };

export type RouterDeps = {
  machines: MachineService;
  apiKeys: ApiKeyService;
  logger: Logger;
};

export function createRouter({ machines, apiKeys, logger }: RouterDeps) {
  const os = implement(appContract).$context<RpcContext>();

  /** Business errors keep their code; anything else is logged and hidden from the client. */
  async function run<T>(
    errors: {
      NOT_FOUND: (o?: { message?: string }) => Error;
      CONFLICT: (o?: { message?: string }) => Error;
    },
    work: () => Promise<T>,
  ): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof MachineError) throw errors[error.code]({ message: error.message });
      if (error instanceof ORPCError) throw error;
      logger.error("request failed", { error });
      const detail =
        error instanceof SpaceError
          ? "The machine host did not answer as expected."
          : "Something went wrong.";
      throw new ORPCError("INTERNAL_SERVER_ERROR", { message: detail });
    }
  }

  return os.router({
    machines: {
      list: os.machines.list.handler(({ context }) =>
        run({ NOT_FOUND: () => new Error(), CONFLICT: () => new Error() }, () =>
          machines.list(context.user.id),
        ),
      ),
      get: os.machines.get.handler(({ input, context, errors }) =>
        run(errors, () => machines.get(context.user.id, input.id)),
      ),
      create: os.machines.create.handler(({ input, context, errors }) =>
        run(errors, () => machines.create(context.user.id, input)),
      ),
      suspend: os.machines.suspend.handler(({ input, context, errors }) =>
        run(errors, () => machines.suspend(context.user.id, input.id)),
      ),
      restore: os.machines.restore.handler(({ input, context, errors }) =>
        run(errors, () => machines.restore(context.user.id, input.id)),
      ),
      fork: os.machines.fork.handler(({ input, context, errors }) =>
        run(errors, () => machines.fork(context.user.id, input)),
      ),
      delete: os.machines.delete.handler(({ input, context, errors }) =>
        run(errors, async () => {
          await machines.delete(context.user.id, input.id);
          return { ok: true as const };
        }),
      ),
      exec: os.machines.exec.handler(({ input, context, errors }) =>
        run(errors, () => machines.exec(context.user.id, input)),
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
    usage: {
      summary: os.usage.summary.handler(({ input }) => sampleUsage(input.days)),
    },
  });
}

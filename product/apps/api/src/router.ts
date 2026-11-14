import { implement, ORPCError } from "@orpc/server";
import { API_ERRORS, type ReconcileReport, serverContract } from "@rookbox/contracts";
import type { AdminHealthReader } from "./admin-health.js";
import { ApiKeyLimitError, type ApiKeyService } from "./api-keys.js";
import type { AuthUser } from "./auth.js";
import type { DesktopProxy } from "./desktop.js";
import type { Logger } from "./logger.js";
import { MachineError, type MachineService, toMachineError } from "./machines/service.js";
import type { LimitClass, Throttle } from "./route-limits.js";
import { usageHandlers } from "./usage/router.js";
import type { UsageService } from "./usage/service.js";
import { type UserAdmin, UserAdminError } from "./users.js";

export type RpcContext = {
  user: AuthUser;
  /** The caller's address, as `clientAddress` read it. */
  ip: string;
  /** Added by oRPC's ResponseHeadersPlugin. */
  resHeaders?: Headers;
};

export type RouterDeps = {
  machines: MachineService;
  apiKeys: ApiKeyService;
  desktop: Pick<DesktopProxy, "issueLink">;
  throttle: Throttle;
  /** Lower-case emails that may call `admin.*`. */
  admins: ReadonlySet<string>;
  users: { findIdByEmail(email: string): Promise<string | null> };
  reconcile(mode: { act: boolean; killOrphans: boolean }): Promise<ReconcileReport>;
  /** Account management for the operator panel. */
  userAdmin?: UserAdmin;
  /** The operator panel's health view. */
  adminHealth?: AdminHealthReader;
  logger: Logger;
  usage?: UsageService;
};

export function createRouter({
  machines,
  apiKeys,
  desktop,
  throttle,
  admins,
  users,
  reconcile,
  userAdmin,
  adminHealth,
  logger,
  usage,
}: RouterDeps) {
  const usageNow = usageHandlers(usage);
  const os = implement(serverContract).$context<RpcContext>();

  /** Counts a request against its class's budgets; throws `RATE_LIMITED` with `Retry-After`. */
  function limit(cls: LimitClass, context: RpcContext) {
    const verdict = throttle.hit(cls, { userId: context.user.id, ip: context.ip });
    if (verdict.allowed) return;
    context.resHeaders?.set("retry-after", String(verdict.retryAfterS));
    logger.warn("rate limited", { class: cls, user: context.user.id });
    throw new ORPCError("RATE_LIMITED", {
      status: API_ERRORS.RATE_LIMITED.status,
      message: API_ERRORS.RATE_LIMITED.message,
      data: { retryAfterS: verdict.retryAfterS },
    });
  }

  function requireAdmin(context: RpcContext) {
    if (admins.has(context.user.email.toLowerCase())) return;
    logger.warn("admin call refused", { user: context.user.id });
    throw new ORPCError("FORBIDDEN", {
      status: API_ERRORS.FORBIDDEN.status,
      message: API_ERRORS.FORBIDDEN.message,
    });
  }

  /** The account service, or a refusal when this deployment has none. */
  function needUserAdmin(): UserAdmin {
    if (!userAdmin) throw new ORPCError("SERVICE_UNAVAILABLE", { status: 503, message: "Off." });
    return userAdmin;
  }

  /** A refused account change reaches the client with its `reason`, never a password or a trace. */
  async function userWork<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof UserAdminError) {
        const missing = error.reason === "no_account";
        throw new ORPCError(missing ? "NOT_FOUND" : "BAD_REQUEST", {
          status: missing ? 404 : 400,
          message: error.message,
          data: { reason: error.reason },
        });
      }
      throw error;
    }
  }

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
        run(async () => {
          limit("machine_create", context);
          return machines.create(context.user.id, input);
        }),
      ),
      suspend: os.machines.suspend.handler(({ input, context }) =>
        run(async () => {
          limit("machine_lifecycle", context);
          return machines.suspend(context.user.id, input.id);
        }),
      ),
      restore: os.machines.restore.handler(({ input, context }) =>
        run(async () => {
          limit("machine_lifecycle", context);
          return machines.restore(context.user.id, input.id);
        }),
      ),
      fork: os.machines.fork.handler(({ input, context }) =>
        run(async () => {
          limit("machine_fork", context);
          return machines.fork(context.user.id, input);
        }),
      ),
      delete: os.machines.delete.handler(({ input, context }) =>
        run(async () => {
          limit("machine_delete", context);
          await machines.delete(context.user.id, input.id);
          return { ok: true as const };
        }),
      ),
      exec: os.machines.exec.handler(({ input, context }) =>
        run(async () => {
          limit("machine_exec", context);
          return machines.exec(context.user.id, input);
        }),
      ),
      desktopLink: os.machines.desktopLink.handler(({ input, context }) =>
        run(async () => {
          limit("desktop_link", context);
          return desktop.issueLink(context.user.id, input.id);
        }),
      ),
    },
    apiKeys: {
      list: os.apiKeys.list.handler(({ context }) => apiKeys.list(context.user.id)),
      create: os.apiKeys.create.handler(({ input, context }) =>
        run(async () => {
          limit("api_key_create", context);
          try {
            return await apiKeys.create(context.user.id, input.name);
          } catch (error) {
            if (error instanceof ApiKeyLimitError) {
              throw new ORPCError("BAD_REQUEST", { message: error.message });
            }
            throw error;
          }
        }),
      ),
      revoke: os.apiKeys.revoke.handler(async ({ input, context, errors }) => {
        if (!(await apiKeys.revoke(context.user.id, input.id))) throw errors.NOT_FOUND();
        return { ok: true as const };
      }),
    },
    usage: {
      summary: os.usage.summary.handler(({ input, context }) =>
        usageNow.summary(context.user, input.period),
      ),
    },
    config: {
      get: os.config.get.handler(() => machines.config()),
    },
    admin: {
      usage: os.admin.usage.handler(({ input, context }) =>
        usageNow.admin(context.user, input.period),
      ),
      suspendUserMachines: os.admin.suspendUserMachines.handler(({ input, context }) =>
        run(async () => {
          requireAdmin(context);
          const ownerId = await users.findIdByEmail(input.email.trim().toLowerCase());
          if (!ownerId) throw new MachineError("NOT_FOUND", "No such user.");
          logger.warn("admin suspends a user's machines", {
            admin: context.user.id,
            target: ownerId,
          });
          return machines.suspendAll(ownerId);
        }),
      ),
      access: os.admin.access.handler(({ context }) => ({
        admin: admins.has(context.user.email.toLowerCase()),
      })),
      health: os.admin.health.handler(({ context }) =>
        run(async () => {
          requireAdmin(context);
          if (!adminHealth) throw new MachineError("NOT_FOUND");
          return adminHealth();
        }),
      ),
      users: {
        list: os.admin.users.list.handler(({ context }) =>
          run(async () => {
            requireAdmin(context);
            const counts = await machines.countByOwner();
            return (await needUserAdmin().list()).map((user) => ({
              email: user.email,
              name: user.name,
              status: user.status,
              allowed: user.allowed,
              admin: admins.has(user.email.toLowerCase()),
              createdAt: user.createdAt.toISOString(),
              machines: counts.get(user.id) ?? 0,
            }));
          }),
        ),
        create: os.admin.users.create.handler(({ input, context }) =>
          run(async () => {
            requireAdmin(context);
            const result = await userWork(() => needUserAdmin().create(input));
            logger.warn("admin created a user", { admin: context.user.id, email: result.email });
            return result;
          }),
        ),
        resetPassword: os.admin.users.resetPassword.handler(({ input, context }) =>
          run(async () => {
            requireAdmin(context);
            const result = await userWork(() => needUserAdmin().setPassword(input));
            logger.warn("admin reset a password", { admin: context.user.id, email: result.email });
            return result;
          }),
        ),
        disable: os.admin.users.disable.handler(({ input, context }) =>
          run(async () => {
            requireAdmin(context);
            // An operator who locks themselves out cannot undo it from here.
            if (input.email.trim().toLowerCase() === context.user.email.toLowerCase()) {
              throw new ORPCError("BAD_REQUEST", {
                status: 400,
                message: "You cannot disable your own account.",
                data: { reason: "self" },
              });
            }
            const result = await userWork(() => needUserAdmin().disable(input));
            logger.warn("admin disabled a user", { admin: context.user.id, email: result.email });
            return result;
          }),
        ),
        enable: os.admin.users.enable.handler(({ input, context }) =>
          run(async () => {
            requireAdmin(context);
            const result = await userWork(() => needUserAdmin().enable(input));
            logger.warn("admin enabled a user", { admin: context.user.id, email: result.email });
            return result;
          }),
        ),
      },
      machines: {
        list: os.admin.machines.list.handler(({ context }) =>
          run(async () => {
            requireAdmin(context);
            const [all, people] = await Promise.all([
              machines.listAll(),
              userAdmin ? userAdmin.list() : Promise.resolve([]),
            ]);
            const emails = new Map(people.map((person) => [person.id, person.email]));
            return all.map(({ row, status }) => ({
              id: row.id,
              name: row.name,
              template: row.template,
              status,
              size: row.size,
              createdAt: row.createdAt.toISOString(),
              ownerEmail: emails.get(row.ownerId) ?? null,
              ownerId: row.ownerId,
            }));
          }),
        ),
        suspend: os.admin.machines.suspend.handler(({ input, context }) =>
          run(async () => {
            requireAdmin(context);
            const ownerId = await machines.ownerOf(input.id);
            if (!ownerId) throw new MachineError("NOT_FOUND", "No such machine.");
            logger.warn("admin suspends a machine", {
              admin: context.user.id,
              target: ownerId,
              machine: input.id,
            });
            await machines.suspend(ownerId, input.id);
            return { ok: true as const };
          }),
        ),
        delete: os.admin.machines.delete.handler(({ input, context }) =>
          run(async () => {
            requireAdmin(context);
            const ownerId = await machines.ownerOf(input.id);
            if (!ownerId) throw new MachineError("NOT_FOUND", "No such machine.");
            logger.warn("admin deletes a machine", {
              admin: context.user.id,
              target: ownerId,
              machine: input.id,
            });
            await machines.delete(ownerId, input.id);
            return { ok: true as const };
          }),
        ),
      },
      reconcile: os.admin.reconcile.handler(({ input, context }) =>
        run(async () => {
          requireAdmin(context);
          logger.warn("admin runs the reconciler", { admin: context.user.id, ...input });
          return reconcile(input);
        }),
      ),
    },
  });
}

import { AsyncLocalStorage } from "node:async_hooks";
import { Prisma, type PrismaClient } from "./generated/prisma/client.js";

/**
 * Who a database operation runs for. Row-level security policies read the matching `app.*`
 * settings, and those settings are TRANSACTION-LOCAL: the managed database sits behind a
 * transaction-mode pooler, so two statements of one client connection can run on different
 * backends and connection-level state (`SET`, `set_config(..., false)`) leaks or vanishes.
 *
 * - `user`: rows are limited to the ones that user owns.
 * - `system`: an explicit, named bypass for work that has no tenant: sign-in, API key lookup,
 *   operator tools, the usage ingest, the reconciler, the waitlist.
 *
 * With neither, the client refuses to query, and the policies would return no rows anyway.
 */
export type DbContext = { kind: "user"; userId: string } | { kind: "system"; reason: string };

const storage = new AsyncLocalStorage<DbContext>();

export function currentDbContext(): DbContext | undefined {
  return storage.getStore();
}

/** Run `fn` with every database operation limited to the rows `userId` owns. */
export function withUser<T>(userId: string, fn: () => T | PromiseLike<T>): Promise<T> {
  if (typeof userId !== "string" || userId.length === 0) {
    return Promise.reject(new Error("withUser needs a user id"));
  }
  return within({ kind: "user", userId }, fn);
}

/**
 * Run `fn` across tenants. Every call is an audited bypass of row-level security, so say why:
 * `grep -rn "asSystem("` lists them all.
 */
export function asSystem<T>(reason: string, fn: () => T | PromiseLike<T>): Promise<T> {
  if (typeof reason !== "string" || reason.trim().length === 0) {
    return Promise.reject(new Error("asSystem needs a reason"));
  }
  return within({ kind: "system", reason }, fn);
}

// Prisma operations are lazy and start when awaited, so await inside the scope: an operation
// returned from `fn` still runs with this context.
function within<T>(context: DbContext, fn: () => T | PromiseLike<T>): Promise<T> {
  return storage.run(context, async () => await fn());
}

/** Every function of `target` run as `asSystem(reason)`. For stores that are operator-only. */
export function systemStore<T extends object>(target: T, reason: string): T {
  const wrapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(target)) {
    wrapped[key] =
      typeof value === "function"
        ? (...args: unknown[]) => asSystem(reason, () => Reflect.apply(value, target, args))
        : value;
  }
  return wrapped as T;
}

export class MissingDatabaseContextError extends Error {
  constructor(what: string) {
    super(
      `Database access without a context (${what}). Wrap it in withUser(userId, ...) or asSystem(reason, ...).`,
    );
    this.name = "MissingDatabaseContextError";
  }
}

/** The settings the policies read: the user id and the bypass switch. */
export function settingsFor(context: DbContext): [userId: string, bypass: "on" | "off"] {
  return context.kind === "user" ? [context.userId, "off"] : ["", "on"];
}

/**
 * `is_local = true` on both: the values last until this transaction ends and are gone for the
 * next one, whichever backend the pooler hands it. Never use `false` here.
 */
export function settingsSql(context: DbContext) {
  const [userId, bypass] = settingsFor(context);
  return Prisma.sql`SELECT set_config('app.user_id', ${userId}, true), set_config('app.rls_bypass', ${bypass}, true)`;
}

type InternalParams = { transaction?: { kind?: string } };

// Prisma's defaults (2s wait, 5s run) are for interactive transactions; a wrapped single
// operation gets a longer allowance so a slow checkout does not fail a plain read.
const WRAPPED_OPTIONS = { maxWait: 10_000, timeout: 120_000 };

/**
 * Wraps every operation in one transaction whose FIRST statement sets the context, so the
 * operation sees the user (or the bypass) on the same backend connection, and on no other.
 *
 * - Inside an interactive transaction (`inTransaction`) the settings are already set, so the
 *   operation is not wrapped again.
 * - A batch `$transaction([...])` is refused: its statements would run with no settings.
 */
export function withRowLevelSecurity(base: PrismaClient): PrismaClient {
  return base.$extends({
    query: {
      async $allOperations({ model, operation, args, query, ...rest }) {
        const transaction = (rest as { __internalParams?: InternalParams }).__internalParams
          ?.transaction;
        if (transaction) {
          if (transaction.kind === "batch") {
            throw new Error(
              "Batch $transaction([...]) cannot carry a database context; use inTransaction(db, async (tx) => ...)",
            );
          }
          return query(args);
        }
        const context = storage.getStore();
        if (!context) throw new MissingDatabaseContextError(`${model ?? "raw"}.${operation}`);
        const [, result] = await base.$transaction(
          [base.$queryRaw(settingsSql(context)), query(args)],
          WRAPPED_OPTIONS as never,
        );
        return result;
      },
    },
  }) as unknown as PrismaClient;
}

/**
 * An interactive transaction for the current context: `set_config` is the first statement, and
 * every operation on `tx` runs on that one backend connection. Use this for work that must be
 * atomic; it needs a `withUser` or `asSystem` around it, like any other query.
 */
export async function inTransaction<T>(
  db: PrismaClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const context = storage.getStore();
  if (!context) throw new MissingDatabaseContextError("transaction");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw(settingsSql(context));
    return fn(tx);
  }, WRAPPED_OPTIONS as never);
}

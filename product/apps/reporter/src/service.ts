import type { Config } from "./config.js";
import type { ReporterDb } from "./db.js";
import type { EcwClient } from "./ecw.js";
import type { Logger } from "./log.js";
import { pollOnce } from "./poller.js";
import { backoffMs, type Sender } from "./sender.js";

export type ServiceDeps = {
  config: Config;
  db: ReporterDb;
  ecw: EcwClient;
  sender: Sender;
  logger: Logger;
  now?: () => number;
  random?: () => number;
  /** Replaces the retry delay (tests). */
  backoff?: (failures: number) => number;
  /** How long the delivery loop sleeps with nothing to send (tests shorten it). */
  idleWaitMs?: number;
  /** Replaces the poll interval (tests). */
  pollEveryMs?: number;
};

export type Status = {
  startedAt: string;
  lastPollOkAt: string | null;
  lastPollAttemptAt: string | null;
  lastPollFailure: string | null;
  lastDeliveryOkAt: string | null;
  lastDeliveryFailure: string | null;
  consecutiveSendFailures: number;
  pending: number;
  oldestPendingAgeS: number | null;
  machines: number;
};

const PRUNE_EVERY_MS = 3_600_000;
const KEEP_DELIVERED_MS = 3 * 86_400_000;
const IDLE_WAIT_MS = 5_000;

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

/** The poll loop and the delivery loop, and what `/healthz` reports about them. */
export function createService(deps: ServiceDeps) {
  const { config, db, sender, logger } = deps;
  const clock = deps.now ?? Date.now;
  const random = deps.random ?? Math.random;
  const stop = new AbortController();
  let wake: (() => void) | null = null;
  let machines = db.knownMachines().size;
  const state = {
    startedAt: clock(),
    lastPollOkAt: null as number | null,
    lastPollAttemptAt: null as number | null,
    lastPollFailure: null as string | null,
    lastDeliveryOkAt: null as number | null,
    lastDeliveryFailure: null as string | null,
    sendFailures: 0,
  };
  const tasks: Promise<void>[] = [];

  /** Waits `ms`, or until stopped, or until `wake()` when `wakeable`. */
  function wait(ms: number, wakeable = false): Promise<void> {
    return new Promise((resolve) => {
      if (stop.signal.aborted) return resolve();
      const done = () => {
        clearTimeout(timer);
        stop.signal.removeEventListener("abort", done);
        if (wake === done) wake = null;
        resolve();
      };
      const timer = setTimeout(done, ms);
      stop.signal.addEventListener("abort", done, { once: true });
      if (wakeable) wake = done;
    });
  }

  async function pollLoop() {
    let lastPrune = 0;
    while (!stop.signal.aborted) {
      state.lastPollAttemptAt = clock();
      try {
        const result = await pollOnce({ ...deps, config });
        if (result.ok) {
          state.lastPollOkAt = clock();
          state.lastPollFailure = null;
          machines = result.machines;
          if (result.events > 0 || result.snapshot) wake?.();
        } else {
          state.lastPollFailure = result.reason;
        }
      } catch (error) {
        // A bug or a full disk: log it and keep going, the next poll starts from stored state.
        state.lastPollFailure = "internal_error";
        logger.error("poll failed", { error });
      }
      if (clock() - lastPrune > PRUNE_EVERY_MS) {
        lastPrune = clock();
        try {
          const removed = db.prune(clock() - KEEP_DELIVERED_MS);
          if (removed > 0) logger.debug("pruned delivered rows", { removed });
        } catch (error) {
          logger.warn("pruning failed", { error });
        }
      }
      await wait(deps.pollEveryMs ?? config.pollIntervalS * 1_000);
    }
  }

  async function sendLoop() {
    while (!stop.signal.aborted) {
      let outcome: Awaited<ReturnType<Sender["sendOnce"]>>;
      try {
        outcome = await sender.sendOnce();
      } catch (error) {
        logger.error("delivery failed", { error });
        outcome = { kind: "retry", reason: "internal error", status: 0 };
      }
      if (outcome.kind === "idle") {
        state.sendFailures = 0;
        await wait(deps.idleWaitMs ?? IDLE_WAIT_MS, true);
      } else if (outcome.kind === "retry") {
        state.sendFailures += 1;
        state.lastDeliveryFailure = outcome.reason;
        const delay = (deps.backoff ?? ((n: number) => backoffMs(n, random)))(state.sendFailures);
        // The first failure and then every tenth, so an outage does not fill the log.
        if (state.sendFailures === 1 || state.sendFailures % 10 === 0) {
          logger.warn("delivery failed, will retry", {
            reason: outcome.reason,
            status: outcome.status,
            attempt: state.sendFailures,
            retryInMs: delay,
            pending: db.pendingCount(),
          });
        }
        await wait(delay);
      } else {
        if (outcome.kind === "sent") {
          if (state.sendFailures > 0)
            logger.info("delivery recovered", { after: state.sendFailures });
          state.lastDeliveryOkAt = clock();
          state.lastDeliveryFailure = null;
          logger.debug("delivered", { events: outcome.events, ackedSeq: outcome.ackedSeq });
        }
        state.sendFailures = 0;
      }
    }
  }

  return {
    start() {
      tasks.push(pollLoop(), sendLoop());
    },
    /** Stops both loops and waits for the request in flight to end. */
    async stop() {
      stop.abort();
      await Promise.allSettled(tasks);
    },
    status(): Status {
      const oldest = db.oldestPendingMs();
      return {
        startedAt: iso(state.startedAt) as string,
        lastPollOkAt: iso(state.lastPollOkAt),
        lastPollAttemptAt: iso(state.lastPollAttemptAt),
        lastPollFailure: state.lastPollFailure,
        lastDeliveryOkAt: iso(state.lastDeliveryOkAt),
        lastDeliveryFailure: state.lastDeliveryFailure,
        consecutiveSendFailures: state.sendFailures,
        pending: db.pendingCount(),
        oldestPendingAgeS:
          oldest === null ? null : Math.max(0, Math.round((clock() - oldest) / 1000)),
        machines,
      };
    },
  };
}

export type Service = ReturnType<typeof createService>;

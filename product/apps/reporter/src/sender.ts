import type { Config } from "./config.js";
import type { ReporterDb } from "./db.js";
import type { Logger } from "./log.js";
import { REPORTER_HEADER, SIGNATURE_HEADER, signBody, TIMESTAMP_HEADER } from "./sign.js";
import type { OutboxRow } from "./types.js";

export type SenderDeps = {
  db: ReporterDb;
  logger: Logger;
  config: Pick<
    Config,
    "apiUrl" | "ingestSecret" | "reporterId" | "batchSize" | "sendTimeoutMs" | "pollIntervalS"
  >;
  fetch?: typeof fetch;
  now?: () => number;
  /** Replaces the real wait between attempts (tests). */
  sleep?: (ms: number) => Promise<void>;
  /** Spreads retries; 0..1. */
  random?: () => number;
};

export type SendOutcome =
  | { kind: "idle" }
  | { kind: "sent"; events: number; ackedSeq: number }
  | { kind: "retry"; reason: string; status: number }
  | { kind: "rejected"; seq: number };

export const BACKOFF_START_MS = 1_000;
export const BACKOFF_MAX_MS = 5 * 60_000;

/** Delay before attempt `failures + 1`: doubling from a second to five minutes, with jitter. */
export function backoffMs(failures: number, random: () => number = Math.random): number {
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_START_MS * 2 ** Math.max(0, failures - 1));
  return Math.round(base * (0.75 + random() * 0.5));
}

/** Takes the next request's worth of rows: one snapshot alone, or events up to `batchSize`. */
export function nextBatch(rows: readonly OutboxRow[], batchSize: number): OutboxRow[] {
  const first = rows[0];
  if (!first) return [];
  if (first.kind === "snapshot") return [first];
  const batch: OutboxRow[] = [];
  for (const row of rows) {
    if (row.kind !== "event" || batch.length >= batchSize) break;
    batch.push(row);
  }
  return batch;
}

export function createSender(deps: SenderDeps) {
  const { db, logger, config } = deps;
  const doFetch = deps.fetch ?? fetch;
  const clock = deps.now ?? Date.now;
  const endpoint = `${config.apiUrl.replace(/\/+$/, "")}/ingest/usage-events`;

  function bodyOf(batch: readonly OutboxRow[]): string {
    const first = batch[0] as OutboxRow;
    if (first.kind === "snapshot") {
      return JSON.stringify({
        kind: "snapshot",
        reporterId: config.reporterId,
        pollIntervalS: config.pollIntervalS,
        seq: first.seq,
        ...JSON.parse(first.payload),
      });
    }
    return JSON.stringify({
      kind: "events",
      reporterId: config.reporterId,
      pollIntervalS: config.pollIntervalS,
      events: batch.map((row) => ({ seq: row.seq, ...JSON.parse(row.payload) })),
    });
  }

  /** One request. Marks rows delivered only when the API says so. */
  async function sendOnce(limit = config.batchSize): Promise<SendOutcome> {
    const batch = nextBatch(db.pending(limit), limit);
    if (batch.length === 0) return { kind: "idle" };
    const body = bodyOf(batch);
    const timestamp = String(Math.floor(clock() / 1000));

    let response: Response;
    try {
      response = await doFetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [TIMESTAMP_HEADER]: timestamp,
          [SIGNATURE_HEADER]: signBody(config.ingestSecret, timestamp, body),
          [REPORTER_HEADER]: config.reporterId,
        },
        body,
        signal: AbortSignal.timeout(config.sendTimeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      return { kind: "retry", reason: timedOut ? "timeout" : "unreachable", status: 0 };
    }

    if (response.ok) {
      let ackedSeq = -1;
      try {
        const ack = (await response.json()) as { ok?: unknown; ackedSeq?: unknown };
        if (ack.ok === true && typeof ack.ackedSeq === "number") ackedSeq = ack.ackedSeq;
      } catch {
        // Falls through to the retry below: a 200 that does not say what it stored is not an ack.
      }
      const last = (batch.at(-1) as OutboxRow).seq;
      if (ackedSeq < (batch[0] as OutboxRow).seq) {
        return { kind: "retry", reason: "unreadable acknowledgement", status: response.status };
      }
      const done = batch.filter((row) => row.seq <= Math.min(ackedSeq, last));
      db.markSent(
        done.map((row) => row.seq),
        clock(),
      );
      return { kind: "sent", events: done.length, ackedSeq: Math.min(ackedSeq, last) };
    }

    // 400 and 413 mean the API will never take this request as it is. A batch is split down to
    // single rows so that one bad row cannot hold up the rest; a single bad row is set aside.
    if (response.status === 400 || response.status === 413 || response.status === 422) {
      if (batch.length > 1) return sendOnce(Math.max(1, Math.floor(batch.length / 2)));
      const row = batch[0] as OutboxRow;
      db.markRejected(row.seq, clock());
      logger.error("the API refused an event as malformed; it was set aside", {
        seq: row.seq,
        key: row.key,
        status: response.status,
      });
      return { kind: "rejected", seq: row.seq };
    }
    // 401 (wrong secret or clock), 429, 5xx and the rest: keep everything, try again later.
    return { kind: "retry", reason: `status ${response.status}`, status: response.status };
  }

  return { sendOnce };
}

export type Sender = ReturnType<typeof createSender>;

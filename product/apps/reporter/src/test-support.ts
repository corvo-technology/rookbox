import { createServer, type IncomingMessage, type Server } from "node:http";
import { IngestMessageSchema } from "@rookbox/contracts";
import { verifySignature } from "../../api/src/usage/signature.js";
import type { Config } from "./config.js";
import { openDb, type ReporterDb } from "./db.js";
import type { EcwClient } from "./ecw.js";
import type { Machine } from "./types.js";

export const SECRET = "t".repeat(40);

export function machine(id: string, fields: Partial<Machine> = {}): Machine {
  return {
    id,
    owner: "u1",
    template: "seed",
    vcpu: 2,
    memoryMib: 2_048,
    diskMib: 10_240,
    state: "running",
    startedAt: "2026-11-10T00:00:00.000Z",
    ...fields,
  };
}

export const config: Config = {
  ecwUrl: "http://ecw.test",
  ecwKey: "ecw-key",
  apiUrl: "http://api.test",
  ingestSecret: SECRET,
  reporterId: "rep1",
  pollIntervalS: 30,
  snapshotIntervalS: 300,
  dbPath: ":memory:",
  healthPort: 9464,
  batchSize: 200,
  outboxWarn: 80,
  outboxMax: 100,
  ecwTimeoutMs: 1_000,
  sendTimeoutMs: 1_000,
  diskResizeMinMib: 1_024,
  missedPollsForGone: 2,
  logLevel: "error",
};

/** A fresh database. Its first snapshot is not due, so tests see only the events they cause. */
export function memoryDb(): ReporterDb {
  const db = openDb(":memory:");
  db.setMeta("last_snapshot_ms", String(Number.MAX_SAFE_INTEGER));
  return db;
}

/** An ECW whose list the test sets, or makes fail. */
export function fakeEcw(initial: Machine[] = []) {
  const state = { machines: initial, fail: null as Error | null, calls: 0 };
  const ecw: EcwClient = {
    async listMachines() {
      state.calls += 1;
      if (state.fail) throw state.fail;
      return state.machines.map((m) => ({ ...m }));
    },
  };
  return Object.assign(ecw, { state });
}

export type Received = { body: string; headers: IncomingMessage["headers"]; verdict: string };

/**
 * A stand-in for the product API on a real local socket. It checks the signature with the API's
 * own verifier and the body with the API's own schema, stores events idempotently by key, and
 * can be told to fail, so delivery is tested against the real wire format.
 */
export async function fakeApi() {
  const received: Received[] = [];
  const stored = new Map<string, number>();
  const control = {
    /** Answer this status to the next requests, without storing anything. */
    failNext: [] as number[],
    /** Store the request but drop the connection before answering. */
    dropAckNext: 0,
    now: () => Date.now(),
  };
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      const verdict = verifySignature({
        secret: SECRET,
        timestamp: String(request.headers["x-rookbox-timestamp"] ?? ""),
        signature: String(request.headers["x-rookbox-signature"] ?? ""),
        body,
        nowMs: control.now(),
      });
      received.push({ body, headers: request.headers, verdict });
      const status = control.failNext.shift();
      if (status) return void response.writeHead(status).end("{}");
      if (verdict !== "ok") return void response.writeHead(401).end("{}");
      const parsed = IngestMessageSchema.safeParse(JSON.parse(body));
      if (!parsed.success) return void response.writeHead(400).end("{}");
      const message = parsed.data;
      const items =
        message.kind === "events"
          ? message.events.map((event) => ({ key: event.key, seq: event.seq }))
          : [{ key: message.key, seq: message.seq }];
      let accepted = 0;
      for (const item of items) {
        if (!stored.has(item.key)) {
          stored.set(item.key, item.seq);
          accepted += 1;
        }
      }
      if (control.dropAckNext > 0) {
        control.dropAckNext -= 1;
        return void request.socket.destroy();
      }
      const ackedSeq = Math.max(...items.map((item) => item.seq));
      response
        .writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify({ ok: true, ackedSeq, accepted, duplicates: items.length - accepted }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    received,
    stored,
    control,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

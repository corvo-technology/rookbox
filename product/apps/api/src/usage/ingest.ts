import { IngestMessageSchema } from "@rookbox/contracts";
import type { Logger } from "../logger.js";
import type { UsageService } from "./service.js";
import {
  REPORTER_HEADER,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  verifySignature,
} from "./signature.js";

/** Large enough for a 500-event batch or a snapshot of a few thousand machines. */
export const MAX_INGEST_BYTES = 4 * 1024 * 1024;

export type IngestOptions = {
  /** `INGEST_SECRET`. Empty or missing turns the endpoint off. */
  secret: string | undefined;
  usage: Pick<UsageService, "ingest">;
  logger: Logger;
  now?: () => number;
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/**
 * `POST /ingest/usage-events`. It sits outside the session login: the caller proves itself with
 * an HMAC of the exact body and a timestamp, which also bounds how long a captured request could
 * be replayed. Storing is idempotent, so a replay inside that window changes nothing.
 */
export function createIngestHandler(options: IngestOptions) {
  const { logger } = options;
  const clock = options.now ?? Date.now;

  return async (request: Request): Promise<Response> => {
    if (!options.secret) return json({ code: "INGEST_DISABLED" }, 503);

    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_INGEST_BYTES) return json({ code: "TOO_LARGE" }, 413);
    const body = await request.text();
    if (Buffer.byteLength(body) > MAX_INGEST_BYTES) return json({ code: "TOO_LARGE" }, 413);

    const verdict = verifySignature({
      secret: options.secret,
      timestamp: request.headers.get(TIMESTAMP_HEADER),
      signature: request.headers.get(SIGNATURE_HEADER),
      body,
      nowMs: clock(),
    });
    if (verdict !== "ok") {
      // The reason is logged for the owner; the caller only learns it was refused.
      logger.warn("usage ingest refused", { reason: verdict });
      return json({ code: "UNAUTHORIZED" }, 401);
    }

    let raw: unknown;
    try {
      raw = JSON.parse(body);
    } catch {
      return json({ code: "BAD_REQUEST" }, 400);
    }
    const parsed = IngestMessageSchema.safeParse(raw);
    if (!parsed.success) {
      logger.warn("usage ingest rejected a malformed body", {
        issues: parsed.error.issues.slice(0, 5).map((issue) => issue.path.join(".")),
      });
      return json({ code: "BAD_REQUEST" }, 400);
    }
    if (request.headers.get(REPORTER_HEADER) !== parsed.data.reporterId) {
      return json({ code: "BAD_REQUEST" }, 400);
    }

    const ack = await options.usage.ingest(parsed.data);
    return json(ack, 200);
  };
}

import { createServer, type Server } from "node:http";
import type { Status } from "./service.js";

/**
 * What `/healthz` says. It answers 503 only when polling has stopped working: no good poll for
 * three intervals (or for a minute, if that is longer) since start. A backlog of undelivered
 * events is reported as `delivery: "behind"` but is not a failure of this process, so it does
 * not make a supervisor restart it.
 */
export function healthBody(status: Status, pollIntervalS: number, nowMs: number) {
  const limitMs = Math.max(60_000, pollIntervalS * 3_000);
  const since = Date.parse(status.lastPollOkAt ?? status.startedAt);
  const polling = nowMs - since <= limitMs;
  const delivery =
    status.pending === 0
      ? "ok"
      : status.lastDeliveryOkAt && nowMs - Date.parse(status.lastDeliveryOkAt) <= limitMs
        ? "ok"
        : "behind";
  return {
    ok: polling,
    polling: polling ? "ok" : "stalled",
    delivery,
    ...status,
  };
}

/** Serves `/healthz` on 127.0.0.1 only. Nothing else is served. */
export function startHealthServer(options: {
  port: number;
  status: () => Status;
  pollIntervalS: number;
  now?: () => number;
}): Promise<Server> {
  const server = createServer((request, response) => {
    if (request.method !== "GET" || request.url?.split("?")[0] !== "/healthz") {
      response.writeHead(404, { "content-type": "application/json" }).end('{"ok":false}');
      return;
    }
    const body = healthBody(options.status(), options.pollIntervalS, (options.now ?? Date.now)());
    response
      .writeHead(body.ok ? 200 : 503, { "content-type": "application/json" })
      .end(JSON.stringify(body));
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, "127.0.0.1", () => resolve(server));
  });
}

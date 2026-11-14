import type { FakeSandbox, fakeSpace } from "../test-support.js";

export type EcwRequest = { method: string; path: string; apiKey: string | null; body: unknown };

/**
 * A fake of the ECW upstream's E2B routes over `fakeSpace`, as a `fetch`. It records every
 * request so tests can see exactly what the front forwarded.
 */
export function fakeEcwFetch(space: ReturnType<typeof fakeSpace>, serviceKey = "svc-key") {
  const requests: EcwRequest[] = [];
  const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(body === null ? null : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers },
    });
  const detail = (s: FakeSandbox) => ({
    sandboxID: s.id,
    clientID: s.id,
    startedAt: "2026-01-01T00:00:00Z",
    endAt: "2026-01-01T01:00:00Z",
    cpuCount: 2,
    memoryMB: 2048,
    diskSizeMB: 10240,
    templateID: s.templateId,
    state: s.state,
    metadata: s.metadata,
    envdAccessToken: s.envdAccessToken,
    trafficAccessToken: s.trafficToken,
    envdVersion: "0.2.4",
  });
  /** The SDKs' two-layer metadata filter: pairs joined with `&`, each part percent-encoded. */
  const filterOf = (raw: string | null) => {
    const out: Record<string, string> = {};
    for (const part of (raw ?? "").split("&")) {
      if (!part) continue;
      const [k = "", v = ""] = part.split("=");
      out[decodeURIComponent(k)] = decodeURIComponent(v);
    }
    return out;
  };
  const doFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({
      method,
      path: url.pathname + url.search,
      apiKey: headers.get("x-api-key"),
      body,
    });
    if (headers.get("x-api-key") !== serviceKey) return json(401, { code: 401, message: "no" });
    const p = url.pathname;
    if (method === "POST" && p === "/sandboxes") {
      const { id } = await space.create({
        templateId: body.templateID,
        metadata: body.metadata,
        timeoutS: body.timeout,
        size: { vcpu: 2, memoryMib: 2048, diskMib: 10240 },
        allowInternet: body.allowInternetAccess,
      });
      return json(201, detail(space.sandboxes.get(id) as FakeSandbox));
    }
    if (method === "GET" && (p === "/sandboxes" || p === "/v2/sandboxes")) {
      // SPACE accepts ONE comma-separated state parameter.
      const states = url.searchParams.getAll("state");
      if (states.length > 1) return json(400, { code: 400, message: "one state param only" });
      const wanted = (states[0] ?? "running,paused").split(",");
      const filter = filterOf(url.searchParams.get("metadata"));
      const items = [...space.sandboxes.values()].filter(
        (s) =>
          wanted.includes(s.state) && Object.entries(filter).every(([k, v]) => s.metadata[k] === v),
      );
      const headersOut: Record<string, string> =
        url.searchParams.get("limit") === "1" ? { "x-next-token": "t1" } : {};
      return json(200, items.map(detail), headersOut);
    }
    const m = /^(?:\/v2)?\/sandboxes\/([^/]+)(?:\/(\w+))?$/.exec(p);
    if (!m) return json(404, { code: 404, message: "nope" });
    const id = decodeURIComponent(m[1] ?? "");
    const sandbox = space.sandboxes.get(id);
    if (!sandbox) return json(404, { code: 404, message: "sandbox not found" });
    const action = m[2];
    if (method === "GET" && !action) return json(200, detail(sandbox));
    if (method === "DELETE" && !action) {
      space.sandboxes.delete(id);
      return json(204, null);
    }
    if (method === "POST" && action === "pause") {
      await space.suspend(id);
      return json(204, null);
    }
    if (method === "POST" && (action === "resume" || action === "connect")) {
      await space.restore(id, body?.timeout ?? 0);
      return json(action === "resume" ? 201 : 200, detail(space.sandboxes.get(id) as FakeSandbox));
    }
    if (method === "POST" && (action === "timeout" || action === "refreshes")) {
      return json(204, null);
    }
    return json(404, { code: 404, message: "nope" });
  }) as typeof fetch;
  return { fetch: doFetch, requests, serviceKey };
}

import {
  API_ERRORS,
  IDLE_TIMEOUT_LIMITS,
  type MachineTemplate,
  SIZE_PRESETS,
} from "@rookbox/contracts";
import { type Context, Hono } from "hono";
import type { ApiKeyService } from "../api-keys.js";
import type { Logger } from "../logger.js";
import { MachineError, type MachineService, OWNER_TAG } from "../machines/service.js";
import type { LimitClass, Throttle } from "../route-limits.js";
import { metadataQuery, resourcesMetadata } from "../space/client.js";

/**
 * The E2B-compatible control plane.
 *
 * The unmodified E2B SDKs call it with `E2B_API_KEY=<a Rookbox key>`. It authenticates the key,
 * works out who owns it, and forwards the call to the sandbox engine ECW upstream with the shared service
 * key, tagging every sandbox with its owner. A sandbox that is not the caller's is a 404.
 * ECW's answers (envd and traffic tokens, domain) pass through, so the SDK reaches the machine
 * directly at `<port>-<id>.<E2B_DOMAIN>`.
 *
 * Supported: create, list (v1 and v2), get, delete, pause, resume, connect (v1 and v2), timeout
 * and refreshes. ECW has no metrics, fork-through-SDK or template-build surface here, so those
 * are not offered.
 */

const RESERVED_PREFIXES = ["rookbox.", "space."];
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const FORWARD_HEADERS = ["content-type", "retry-after", "x-next-token"];
const LISTED_STATES = ["running", "paused"];

export type E2bFrontOptions = {
  upstream: {
    baseUrl: string;
    /** The shared service key. Empty: every call answers 502. */
    apiKey: string;
    fetch?: typeof fetch;
    timeoutMs?: number;
  };
  apiKeys: Pick<ApiKeyService, "authenticate">;
  /** True when the account exists and is not disabled (the kill switch). */
  isActive: (userId: string) => Promise<boolean>;
  machines: Pick<MachineService, "config" | "createExternal" | "withCapacity" | "forget" | "list">;
  throttle: Throttle;
  logger: Logger;
  /** The domain sandboxes are served from; added to answers that carry none. */
  domain: string;
  /** Send `allowInternetAccess` as the caller asks. When false it is always off. Default true. */
  allowInternet?: boolean;
};

type Reply = { status: number; headers: Headers; text: string; json: unknown };

/** The error body the E2B SDKs expect: `{ code, message }`. */
function e2bError(status: number, message: string, retryAfterS?: number): Response {
  const headers = new Headers({ "content-type": "application/json" });
  if (retryAfterS !== undefined) headers.set("retry-after", String(retryAfterS));
  return new Response(JSON.stringify({ code: status, message }), { status, headers });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampTimeout(value: unknown): unknown {
  if (typeof value !== "number" || !Number.isFinite(value)) return value;
  return Math.min(Math.max(Math.trunc(value), 0), IDLE_TIMEOUT_LIMITS.max);
}

/**
 * Decodes the SDKs' `metadata` filter (each pair percent-encoded, joined with `&`, then encoded
 * again as one query value), drops keys the caller may not set, and returns plain pairs.
 */
function callerMetadataFilter(raw: string | null): Record<string, string> {
  const pairs: Record<string, string> = {};
  if (!raw) return pairs;
  for (const part of raw.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    try {
      const key = decodeURIComponent(eq < 0 ? part : part.slice(0, eq));
      const value = decodeURIComponent(eq < 0 ? "" : part.slice(eq + 1));
      if (!RESERVED_PREFIXES.some((prefix) => key.startsWith(prefix))) pairs[key] = value;
    } catch {
      // A malformed pair filters nothing; the owner pair still applies.
    }
  }
  return pairs;
}

/** What `createApp` mounts: the front as a fetch handler that is told the caller's address. */
export type E2bFront = {
  fetch(request: Request, env: { ip: string }): Response | Promise<Response>;
};

export function createE2bFront(options: E2bFrontOptions): E2bFront {
  const { logger, machines, throttle } = options;
  const doFetch = options.upstream.fetch ?? fetch;
  const base = options.upstream.baseUrl.replace(/\/+$/, "");
  const timeoutMs = options.upstream.timeoutMs ?? 60_000;
  const allowInternet = options.allowInternet ?? true;

  async function call(method: string, path: string, body?: unknown): Promise<Reply | null> {
    if (!options.upstream.apiKey) return null;
    try {
      const response = await doFetch(`${base}${path}`, {
        method,
        headers: {
          "x-api-key": options.upstream.apiKey,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await response.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      return { status: response.status, headers: response.headers, text, json };
    } catch (error) {
      logger.warn("e2b upstream unreachable", { path, error });
      return null;
    }
  }

  /** Never lets an upstream auth failure look like the caller's own. */
  function unavailable(): Response {
    return e2bError(502, "The machine service is not reachable right now. Try again shortly.");
  }

  /** The upstream's answer to the caller: its status and body, a few headers, `domain` filled in. */
  function pass(reply: Reply | null): Response {
    if (!reply) return unavailable();
    if (reply.status === 401 || reply.status === 403) {
      logger.error("e2b upstream refused the service key", { status: reply.status });
      return unavailable();
    }
    if (reply.status >= 500 && reply.status !== 503) {
      logger.warn("e2b upstream error", { status: reply.status });
      return e2bError(502, "The machine service failed. Try again shortly.");
    }
    const headers = new Headers();
    for (const name of FORWARD_HEADERS) {
      const value = reply.headers.get(name);
      if (value) headers.set(name, value);
    }
    if (reply.status === 204 || reply.status === 205 || !reply.text) {
      return new Response(null, { status: reply.status, headers });
    }
    let text = reply.text;
    if (isRecord(reply.json) && typeof reply.json.sandboxID === "string" && !reply.json.domain) {
      text = JSON.stringify({ ...reply.json, domain: options.domain });
    }
    return new Response(text, { status: reply.status, headers });
  }

  function throttled(cls: LimitClass, userId: string, ip: string): Response | null {
    const verdict = throttle.hit(cls, { userId, ip });
    if (verdict.allowed) return null;
    logger.warn("rate limited", { class: cls, user: userId, via: "e2b" });
    return e2bError(429, "Too many requests. Slow down.", verdict.retryAfterS);
  }

  function machineFailure(error: unknown): Response {
    if (error instanceof MachineError) {
      if (error.code === "MACHINE_LIMIT") return e2bError(429, error.message);
      if (error.code === "TEMPLATE_UNAVAILABLE") return e2bError(400, error.message);
      return e2bError(API_ERRORS[error.code].status, error.message);
    }
    logger.error("e2b request failed", { error });
    return e2bError(500, "Something went wrong.");
  }

  async function jsonBody(request: Request): Promise<Record<string, unknown> | null> {
    const text = await request.text();
    if (!text.trim()) return {};
    try {
      const parsed: unknown = JSON.parse(text);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  /** The sandbox as the upstream reports it, only when this user owns it; else null. */
  async function ownedSandbox(
    userId: string,
    id: string,
  ): Promise<{ reply: Reply; state: string } | "missing" | "down"> {
    const reply = await call("GET", `/sandboxes/${encodeURIComponent(id)}`);
    if (!reply) return "down";
    if (reply.status === 404 || reply.status === 410) return "missing";
    if (reply.status < 200 || reply.status >= 300 || !isRecord(reply.json)) return "down";
    const metadata = reply.json.metadata;
    const tag = isRecord(metadata) ? metadata[OWNER_TAG] : undefined;
    // No tag, or someone else's: the same answer as no sandbox at all.
    if (tag !== userId) return "missing";
    return { reply, state: String(reply.json.state ?? "") };
  }

  type Vars = { Variables: { userId: string; ip: string }; Bindings: { ip: string } };
  type Ctx = Context<Vars>;
  const app = new Hono<Vars>();

  app.use("*", async (c, next) => {
    // The caller's address arrives as the app's environment: `app.fetch(request, { ip })`.
    const ip = (c.env as { ip?: string } | undefined)?.ip ?? "unknown";
    const key = c.req.header("x-api-key")?.trim();
    const userId = key ? await options.apiKeys.authenticate(key) : null;
    if (!userId || !(await options.isActive(userId))) {
      // A wrong key costs the address a point; a right one never does.
      const verdict = throttle.hit("auth", { ip });
      if (!verdict.allowed) {
        return e2bError(429, "Too many requests. Slow down.", verdict.retryAfterS);
      }
      return e2bError(401, "Invalid API key.");
    }
    c.set("userId", userId);
    c.set("ip", ip);
    return next();
  });

  async function create(c: Ctx): Promise<Response> {
    const userId = c.get("userId");
    const limited = throttled("machine_create", userId, c.get("ip"));
    if (limited) return limited;
    const body = await jsonBody(c.req.raw);
    if (!body) return e2bError(400, "The request body must be a JSON object.");

    const config = machines.config();
    const asked = body.templateID;
    if (asked !== undefined && typeof asked !== "string") {
      return e2bError(400, "templateID must be a string.");
    }
    // The SDKs' own default ("base") means "whatever this deployment offers first".
    const template = (
      asked === undefined || asked === "" || asked === "base" ? config.templates[0] : asked
    ) as MachineTemplate | undefined;
    if (!template || !config.templates.includes(template)) {
      return e2bError(400, `Template not available. Use one of: ${config.templates.join(", ")}.`);
    }
    if (body.metadata !== undefined && !isRecord(body.metadata)) {
      return e2bError(400, "metadata must be an object.");
    }
    const timeout = clampTimeout(body.timeout);
    const idleTimeoutS =
      typeof timeout === "number" && timeout >= IDLE_TIMEOUT_LIMITS.min
        ? timeout
        : typeof timeout === "number"
          ? IDLE_TIMEOUT_LIMITS.min
          : config.defaultIdleTimeoutS;
    const size = { ...SIZE_PRESETS.small };
    // Only plain string pairs survive, and never a key the platform owns.
    const callerMetadata: Record<string, string> = {};
    for (const [key, value] of Object.entries(
      (body.metadata as Record<string, unknown> | undefined) ?? {},
    )) {
      if (RESERVED_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;
      callerMetadata[key] = String(value);
    }

    try {
      const launched = await machines.createExternal(userId, {
        template,
        size,
        idleTimeoutS,
        launch: async (name) => {
          const reply = await call("POST", "/sandboxes", {
            ...body,
            templateID: template,
            timeout: idleTimeoutS,
            // E2B's own default: the sandbox ends at its timeout. A caller may ask for auto-pause.
            autoPause: body.autoPause === true,
            allowInternetAccess: allowInternet ? body.allowInternetAccess !== false : false,
            metadata: {
              ...callerMetadata,
              [OWNER_TAG]: userId,
              "rookbox.name": name,
              "space.resources": resourcesMetadata(size),
            },
          });
          if (!reply) throw new UpstreamReply(unavailable());
          if (reply.status !== 200 && reply.status !== 201) throw new UpstreamReply(pass(reply));
          const id = isRecord(reply.json) ? reply.json.sandboxID : undefined;
          if (typeof id !== "string" || !id) {
            throw new UpstreamReply(e2bError(502, "The machine service returned no sandbox."));
          }
          return { id, reply };
        },
      });
      logger.info("e2b sandbox created", { owner: userId, machine: launched.id });
      return pass(launched.reply);
    } catch (error) {
      if (error instanceof UpstreamReply) return error.response;
      return machineFailure(error);
    }
  }
  // Newer SDKs create through the v2 path; ECW answers both the same way.
  app.post("/sandboxes", create);
  app.post("/v2/sandboxes", create);

  async function list(c: Ctx) {
    const userId = c.get("userId");
    const limited = throttled("e2b_read", userId, c.get("ip"));
    if (limited) return limited;
    const url = new URL(c.req.url);
    const wanted = url.searchParams
      .getAll("state")
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter((value) => LISTED_STATES.includes(value));
    const states = wanted.length > 0 ? [...new Set(wanted)] : LISTED_STATES;
    const filter = {
      ...callerMetadataFilter(url.searchParams.get("metadata")),
      [OWNER_TAG]: userId,
    };
    const params = [metadataQuery(filter), `state=${states.join(",")}`];
    const limit = url.searchParams.get("limit");
    if (limit && /^\d{1,4}$/.test(limit)) params.push(`limit=${limit}`);
    const next = url.searchParams.get("nextToken");
    if (next) params.push(`nextToken=${encodeURIComponent(next)}`);
    const reply = await call("GET", `${new URL(c.req.url).pathname}?${params.join("&")}`);
    if (reply && Array.isArray(reply.json)) {
      // The upstream already filtered; this keeps a stray row of another owner from ever leaving.
      const mine = reply.json.filter(
        (item) => isRecord(item) && isRecord(item.metadata) && item.metadata[OWNER_TAG] === userId,
      );
      const headers = new Headers({ "content-type": "application/json" });
      const token = reply.headers.get("x-next-token");
      if (token) headers.set("x-next-token", token);
      return new Response(
        JSON.stringify(
          mine.map((item) => ({ ...(item as Record<string, unknown>), domain: options.domain })),
        ),
        { status: reply.status, headers },
      );
    }
    return pass(reply);
  }
  app.get("/v2/sandboxes", list);
  app.get("/sandboxes", list);

  /** Runs `act` for a sandbox the caller owns, with the shared checks around it. */
  async function onOwned(
    c: Ctx,
    cls: LimitClass,
    act: (id: string, found: { reply: Reply; state: string }) => Promise<Response>,
  ): Promise<Response> {
    const userId = c.get("userId");
    const limited = throttled(cls, userId, c.get("ip"));
    if (limited) return limited;
    const id = c.req.param("id") ?? "";
    if (!ID_PATTERN.test(id)) return e2bError(404, "Sandbox not found.");
    const found = await ownedSandbox(userId, id);
    if (found === "missing") return e2bError(404, `Sandbox ${id} not found.`);
    if (found === "down") return unavailable();
    return act(id, found);
  }

  app.get("/sandboxes/:id", (c) => onOwned(c, "e2b_read", async (_id, found) => pass(found.reply)));

  app.delete("/sandboxes/:id", (c) =>
    onOwned(c, "machine_delete", async (id) => {
      const reply = await call("DELETE", `/sandboxes/${encodeURIComponent(id)}`);
      // 202 is a delete the host has queued; its row goes when the host drops the sandbox.
      if (reply && (reply.status === 204 || reply.status === 404)) await machines.forget(id);
      if (reply?.status === 404) return e2bError(404, `Sandbox ${id} not found.`);
      return pass(reply);
    }),
  );

  app.get("/sandboxes/:id/metrics", (c) =>
    onOwned(c, "e2b_read", async () =>
      e2bError(501, "Sandbox metrics are not available on this service."),
    ),
  );

  app.post("/sandboxes/:id/pause", (c) =>
    onOwned(c, "machine_lifecycle", async (id) =>
      pass(await call("POST", `/sandboxes/${encodeURIComponent(id)}/pause`)),
    ),
  );

  /** Bodies that carry a timeout: it is clamped, and nothing else the caller sends is trusted. */
  async function lifecycleBody(request: Request): Promise<Record<string, unknown> | null> {
    const body = await jsonBody(request);
    if (!body) return null;
    const out: Record<string, unknown> = {};
    if ("timeout" in body) out.timeout = clampTimeout(body.timeout);
    if (typeof body.autoPause === "boolean") out.autoPause = body.autoPause;
    return out;
  }

  /** Resume and connect bring a suspended machine back, so they need room like a restore. */
  function wakeRoute(route: string, upstreamPath: (id: string) => string) {
    app.post(route, (c) =>
      onOwned(c, "machine_lifecycle", async (id, found) => {
        const body = await lifecycleBody(c.req.raw);
        if (!body) return e2bError(400, "The request body must be a JSON object.");
        const send = () => call("POST", upstreamPath(id), body);
        try {
          return pass(found.state === "paused" ? await machines.withCapacity(send) : await send());
        } catch (error) {
          return machineFailure(error);
        }
      }),
    );
  }
  const enc = encodeURIComponent;
  wakeRoute("/sandboxes/:id/resume", (id) => `/sandboxes/${enc(id)}/resume`);
  wakeRoute("/sandboxes/:id/connect", (id) => `/sandboxes/${enc(id)}/connect`);
  wakeRoute("/v2/sandboxes/:id/connect", (id) => `/v2/sandboxes/${enc(id)}/connect`);

  for (const action of ["timeout", "refreshes"] as const) {
    app.post(`/sandboxes/:id/${action}`, (c) =>
      onOwned(c, "machine_lifecycle", async (id) => {
        const raw = await jsonBody(c.req.raw);
        if (!raw) return e2bError(400, "The request body must be a JSON object.");
        const body: Record<string, unknown> = {};
        if ("timeout" in raw) body.timeout = clampTimeout(raw.timeout);
        if ("duration" in raw) body.duration = raw.duration;
        return pass(await call("POST", `/sandboxes/${encodeURIComponent(id)}/${action}`, body));
      }),
    );
  }

  app.notFound(() => e2bError(404, "Not found."));
  app.onError((error) => {
    logger.error("e2b front error", { error });
    return e2bError(500, "Something went wrong.");
  });
  return app;
}

/** Carries a ready-made answer out of a `launch` callback. */
class UpstreamReply extends Error {
  constructor(readonly response: Response) {
    super("upstream reply");
  }
}

import type { ExecResult } from "@rookbox/contracts";

/** What SPACE reports through its E2B-compatible API. */
export type SpaceState = "running" | "paused" | "failed";

export type SandboxInfo = {
  id: string;
  templateId: string;
  state: SpaceState;
  metadata: Record<string, string>;
  /** Present on a single-sandbox read; lets the API talk to the machine's process service. */
  envdAccessToken?: string;
  /** ISO time the sandbox started, when the host reports it. */
  startedAt?: string;
};

export type SpaceSize = { vcpu: number; memoryMib: number; diskMib: number };

/** What `/health/space` learns about SPACE with one cheap, authenticated read. */
export type SpaceProbe = {
  /** A service key is set on this API. */
  keyConfigured: boolean;
  /** SPACE answered at all (any HTTP status). */
  reachable: boolean;
  /** HTTP status class only (`2xx`, `4xx`, `5xx`), never a body. */
  statusClass: "2xx" | "3xx" | "4xx" | "5xx" | null;
  /** `ok` when the key was accepted, `rejected` on 401 or 403, `unknown` when unreachable. */
  auth: "ok" | "rejected" | "missing" | "unknown";
  ms: number;
};

/** The slice of SPACE the product API uses. The real client calls ECW; tests pass a fake. */
export interface SpaceClient {
  create(input: {
    templateId: string;
    metadata: Record<string, string>;
    timeoutS: number;
    size: SpaceSize;
    /** ECW `allowInternetAccess`. The server's default is closed (no DNS, no internet). */
    allowInternet: boolean;
  }): Promise<{ id: string }>;
  /** Sandboxes whose metadata contains every given pair. */
  list(metadata: Record<string, string>): Promise<SandboxInfo[]>;
  /** Null when SPACE has no such sandbox. */
  get(id: string): Promise<SandboxInfo | null>;
  /** ECW pause: SPACE suspends the VM and releases the worker. */
  suspend(id: string): Promise<void>;
  /** ECW resume: SPACE restores the persisted VM. */
  restore(id: string, timeoutS: number): Promise<void>;
  /** Copies the disk into a new sandbox; returns the new id. */
  fork(id: string, timeoutS: number): Promise<{ id: string }>;
  /** `queued` means SPACE accepted the delete but has not finished it. */
  kill(id: string): Promise<"deleted" | "queued" | "missing">;
  /**
   * The token the sandbox's public ports require in `e2b-traffic-access-token`. SPACE returns it
   * from connect, which also sets the idle timeout, so call it for a running sandbox only.
   */
  trafficToken(id: string, timeoutS: number): Promise<string>;
  exec(
    id: string,
    envdAccessToken: string,
    command: string,
    timeoutMs: number,
  ): Promise<ExecResult>;
  /** Never throws: reports whether SPACE is reachable and accepts the key. */
  probe(): Promise<SpaceProbe>;
}

/**
 * Why a SPACE call failed, in terms the product can act on. The raw upstream message stays in
 * `message` for logs; it is never sent to a client.
 */
export type SpaceErrorCode =
  | "AUTH"
  | "NOT_FOUND"
  | "TEMPLATE_NOT_FOUND"
  | "CONFLICT"
  | "BAD_REQUEST"
  | "QUOTA"
  | "CAPACITY"
  | "TIMEOUT"
  | "UNREACHABLE"
  | "UPSTREAM";

/** Classifies an HTTP status SPACE answered with. */
export function classifyStatus(status: number, message = ""): SpaceErrorCode {
  if (status === 401 || status === 403) return "AUTH";
  if (status === 404) return "NOT_FOUND";
  if (status === 409 || status === 412) return "CONFLICT";
  if (status === 408 || status === 504) return "TIMEOUT";
  if (status === 429) return /quota|limit/i.test(message) ? "QUOTA" : "CAPACITY";
  if (status === 503) return "CAPACITY";
  if (status === 400 || status === 422) {
    return /quota|limit (reached|exceeded)/i.test(message) ? "QUOTA" : "BAD_REQUEST";
  }
  return "UPSTREAM";
}

export class SpaceError extends Error {
  readonly code: SpaceErrorCode;
  constructor(
    /** HTTP status from SPACE, or 0 when no answer arrived. */
    readonly status: number,
    message: string,
    code?: SpaceErrorCode,
    /** `Retry-After` from SPACE, in milliseconds. */
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "SpaceError";
    this.code = code ?? classifyStatus(status, message);
  }
}

/** The E2B SDK's `getHost`: where a sandbox port is served. */
export function sandboxHost(port: number | string, sandboxId: string, domain: string): string {
  return `${port}-${sandboxId}.${domain}`;
}

/** SPACE's reserved metadata key for sizing a sandbox at create. */
export function resourcesMetadata(size: SpaceSize): string {
  return JSON.stringify({ vcpu: size.vcpu, memory_mib: size.memoryMib, disk_mib: size.diskMib });
}

/**
 * ECW decodes the `metadata` query parameter in two layers: each key and value is percent-encoded,
 * the pairs are joined with `&`, and that string is encoded again as the parameter value.
 */
export function metadataQuery(metadata: Record<string, string>): string {
  if (Object.keys(metadata).length === 0) return "";
  const inner = Object.entries(metadata)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  return new URLSearchParams({ metadata: inner }).toString();
}

const STATES: Record<string, SpaceState> = {
  running: "running",
  paused: "paused",
  failed: "failed",
};

type Json = Record<string, unknown>;

function toInfo(raw: Json): SandboxInfo {
  const state = STATES[String(raw.state)] ?? "failed";
  const metadata: Record<string, string> = {};
  if (raw.metadata && typeof raw.metadata === "object") {
    for (const [key, value] of Object.entries(raw.metadata as Json)) metadata[key] = String(value);
  }
  return {
    id: String(raw.sandboxID),
    templateId: String(raw.templateID ?? ""),
    state,
    metadata,
    envdAccessToken: typeof raw.envdAccessToken === "string" ? raw.envdAccessToken : undefined,
    startedAt: typeof raw.startedAt === "string" ? raw.startedAt : undefined,
  };
}

export type EcwClientOptions = {
  baseUrl: string;
  /** Empty when the deployment has no key yet; calls then fail with `AUTH`. */
  apiKey: string;
  domain: string;
  fetch?: typeof fetch;
  /** Timeout for calls that wait on a VM: create, suspend, restore, fork, delete. */
  timeoutMs?: number;
  /** Timeout for plain reads. */
  readTimeoutMs?: number;
  /** Extra attempts for idempotent calls after a network error, timeout, 429, 502, 503 or 504. */
  retries?: number;
  /** Replaces the wait between attempts (tests). */
  sleep?: (ms: number) => Promise<void>;
  /** Most bytes of stdout, and of stderr, that `exec` keeps. Default 256 KiB. */
  maxOutputBytes?: number;
};

const MAX_OUTPUT_BYTES = 256 * 1024;
const RETRY_STATUSES = new Set([429, 502, 503, 504]);
const MAX_BACKOFF_MS = 2_000;

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1_000 : undefined;
}

type CallOptions = {
  /** Statuses returned to the caller instead of thrown. */
  accept?: readonly number[];
  /** Safe to repeat: reads, deletes, and forks that carry an idempotency key. */
  idempotent?: boolean;
  /** A read, so it gets the shorter timeout. */
  read?: boolean;
  headers?: Record<string, string>;
};

export function createEcwClient(options: EcwClientOptions): SpaceClient {
  const doFetch = options.fetch ?? fetch;
  const base = options.baseUrl.replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? 60_000;
  const readTimeoutMs = options.readTimeoutMs ?? Math.min(15_000, timeoutMs);
  const retries = options.retries ?? 2;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));

  async function attempt(
    method: string,
    path: string,
    body: unknown,
    opts: CallOptions,
  ): Promise<{ status: number; json: unknown; headers: Headers }> {
    let response: Response;
    let text: string;
    try {
      response = await doFetch(`${base}${path}`, {
        method,
        headers: {
          ...(options.apiKey ? { "x-api-key": options.apiKey } : {}),
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...opts.headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(opts.read ? readTimeoutMs : timeoutMs),
      });
      text = await response.text();
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      throw new SpaceError(
        0,
        timedOut ? "SPACE did not answer in time" : "SPACE could not be reached",
        timedOut ? "TIMEOUT" : "UNREACHABLE",
      );
    }
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    if (!response.ok && !(opts.accept ?? []).includes(response.status)) {
      const message =
        json && typeof json === "object" && "message" in json
          ? String((json as Json).message).slice(0, 300)
          : `SPACE answered ${response.status}`;
      throw new SpaceError(
        response.status,
        message,
        undefined,
        parseRetryAfter(response.headers.get("retry-after")),
      );
    }
    return { status: response.status, json, headers: response.headers };
  }

  async function call(
    method: string,
    path: string,
    body?: unknown,
    opts: CallOptions = {},
  ): Promise<{ status: number; json: unknown; headers: Headers }> {
    for (let n = 0; ; n += 1) {
      try {
        return await attempt(method, path, body, opts);
      } catch (error) {
        const retryable =
          opts.idempotent === true &&
          n < retries &&
          error instanceof SpaceError &&
          (error.status === 0 || RETRY_STATUSES.has(error.status));
        if (!retryable) throw error;
        const backoff = Math.min(250 * 2 ** n, MAX_BACKOFF_MS);
        await sleep(Math.min(error.retryAfterMs ?? backoff, MAX_BACKOFF_MS));
      }
    }
  }

  const enc = encodeURIComponent;

  return {
    async create({ templateId, metadata, timeoutS, size, allowInternet }) {
      let json: unknown;
      try {
        ({ json } = await call("POST", "/sandboxes", {
          templateID: templateId,
          timeout: timeoutS,
          autoPause: true,
          allowInternetAccess: allowInternet,
          metadata: { ...metadata, "space.resources": resourcesMetadata(size) },
        }));
      } catch (error) {
        // No sandbox exists yet, so a 404 here can only mean the template.
        if (error instanceof SpaceError && error.code === "NOT_FOUND") {
          throw new SpaceError(error.status, error.message, "TEMPLATE_NOT_FOUND");
        }
        throw error;
      }
      const id = (json as Json | null)?.sandboxID;
      if (typeof id !== "string" || !id) throw new SpaceError(502, "SPACE returned no sandbox id");
      return { id };
    },

    async list(metadata) {
      const found: SandboxInfo[] = [];
      let token: string | null = null;
      do {
        const query: string = `${metadataQuery(metadata)}&state=running&state=paused&limit=100${
          token ? `&nextToken=${enc(token)}` : ""
        }`;
        const { json, headers } = await call("GET", `/v2/sandboxes?${query}`, undefined, {
          idempotent: true,
          read: true,
        });
        for (const item of Array.isArray(json) ? json : []) found.push(toInfo(item as Json));
        token = headers.get("x-next-token") || null;
      } while (token && found.length < 1_000);
      return found;
    },

    async get(id) {
      const { status, json } = await call("GET", `/sandboxes/${enc(id)}`, undefined, {
        accept: [404],
        idempotent: true,
        read: true,
      });
      return status === 404 ? null : toInfo(json as Json);
    },

    async suspend(id) {
      await call("POST", `/sandboxes/${enc(id)}/pause`, {});
    },

    async restore(id, timeoutS) {
      await call("POST", `/sandboxes/${enc(id)}/resume`, { timeout: timeoutS, autoPause: true });
    },

    async fork(id, timeoutS) {
      // The idempotency key makes a repeat after a lost answer join the first fork, not add one.
      const { json } = await call(
        "POST",
        `/sandboxes/${enc(id)}/fork`,
        { count: 1, timeout: timeoutS },
        { idempotent: true, headers: { "idempotency-key": crypto.randomUUID() } },
      );
      const first = Array.isArray(json) ? (json[0] as Json | undefined) : undefined;
      if (!first || first.sandboxID === undefined) {
        const error = first?.error as Json | undefined;
        throw new SpaceError(502, String(error?.message ?? "SPACE returned no fork"));
      }
      return { id: String(first.sandboxID) };
    },

    async kill(id) {
      const { status } = await call("DELETE", `/sandboxes/${enc(id)}`, undefined, {
        accept: [404],
        idempotent: true,
      });
      if (status === 404) return "missing";
      return status === 202 ? "queued" : "deleted";
    },

    async trafficToken(id, timeoutS) {
      const { json } = await call(
        "POST",
        `/sandboxes/${enc(id)}/connect`,
        { timeout: timeoutS },
        { idempotent: true },
      );
      const token = (json as Json | null)?.trafficAccessToken;
      if (typeof token !== "string" || !token) {
        throw new SpaceError(502, "SPACE did not return a traffic access token");
      }
      return token;
    },

    exec(id, envdAccessToken, command, timeoutMs) {
      return execViaEnvd({
        url: `https://${sandboxHost(49_983, id, options.domain)}/process.Process/Start`,
        envdAccessToken,
        command,
        timeoutMs,
        doFetch,
        maxOutputBytes: options.maxOutputBytes,
      });
    },

    async probe() {
      const started = Date.now();
      const keyConfigured = options.apiKey.length > 0;
      try {
        const response = await doFetch(`${base}/v2/sandboxes?limit=1`, {
          method: "GET",
          headers: keyConfigured ? { "x-api-key": options.apiKey } : {},
          signal: AbortSignal.timeout(readTimeoutMs),
        });
        const statusClass =
          response.status >= 500
            ? "5xx"
            : response.status >= 400
              ? "4xx"
              : response.status >= 300
                ? "3xx"
                : "2xx";
        const rejected = response.status === 401 || response.status === 403;
        return {
          keyConfigured,
          reachable: true,
          statusClass,
          auth: !keyConfigured ? "missing" : rejected ? "rejected" : response.ok ? "ok" : "unknown",
          ms: Date.now() - started,
        };
      } catch {
        return {
          keyConfigured,
          reachable: false,
          statusClass: null,
          auth: keyConfigured ? "unknown" : "missing",
          ms: Date.now() - started,
        };
      }
    },
  };
}

/** One Connect streaming frame: a flag byte, a 4-byte big-endian length, then JSON. */
function frame(payload: unknown): Uint8Array {
  const body = new TextEncoder().encode(JSON.stringify(payload));
  const out = new Uint8Array(5 + body.length);
  new DataView(out.buffer).setUint32(1, body.length);
  out.set(body, 5);
  return out;
}

class Capped {
  private chunks: Buffer[] = [];
  private size = 0;
  truncated = false;
  constructor(private readonly max: number) {}
  push(chunk: Buffer) {
    const room = this.max - this.size;
    if (room <= 0) {
      this.truncated = true;
      return;
    }
    const part = chunk.length > room ? chunk.subarray(0, room) : chunk;
    if (part.length < chunk.length) this.truncated = true;
    this.chunks.push(part);
    this.size += part.length;
  }
  text() {
    return Buffer.concat(this.chunks).toString("utf8");
  }
}

/**
 * Runs a command through the sandbox's envd process service (Connect protocol, `Process.Start`)
 * and gathers its output until the process ends or the time runs out.
 */
export async function execViaEnvd(input: {
  url: string;
  envdAccessToken: string;
  command: string;
  timeoutMs: number;
  doFetch: typeof fetch;
  maxOutputBytes?: number | undefined;
}): Promise<ExecResult> {
  const stdout = new Capped(input.maxOutputBytes ?? MAX_OUTPUT_BYTES);
  const stderr = new Capped(input.maxOutputBytes ?? MAX_OUTPUT_BYTES);
  let exitCode: number | null = null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    const response = await input.doFetch(input.url, {
      method: "POST",
      headers: {
        "content-type": "application/connect+json",
        "connect-protocol-version": "1",
        "x-access-token": input.envdAccessToken,
        authorization: `Basic ${Buffer.from("root:").toString("base64")}`,
      },
      body: frame({
        process: { cmd: "/bin/bash", args: ["-l", "-c", input.command], envs: {} },
        stdin: false,
      }),
      signal: controller.signal,
    });
    if (!response.ok || !response.body) {
      throw new SpaceError(
        response.status === 404 ? 404 : 502,
        `The machine's process service answered ${response.status}`,
      );
    }
    const reader = response.body.getReader();
    let pending = Buffer.alloc(0);
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        pending = Buffer.concat([pending, value]);
        while (pending.length >= 5) {
          const length = pending.readUInt32BE(1);
          if (pending.length < 5 + length) break;
          const flags = pending[0] ?? 0;
          const json = JSON.parse(pending.subarray(5, 5 + length).toString("utf8") || "{}") as Json;
          pending = pending.subarray(5 + length);
          if (flags & 0x02) {
            const error = json.error as Json | undefined;
            if (error)
              throw new SpaceError(502, String(error.message ?? "The command failed to run"));
            continue;
          }
          const event = json.event as Json | undefined;
          const data = event?.data as Json | undefined;
          if (typeof data?.stdout === "string") stdout.push(Buffer.from(data.stdout, "base64"));
          if (typeof data?.stderr === "string") stderr.push(Buffer.from(data.stderr, "base64"));
          const end = event?.end as Json | undefined;
          if (end) exitCode = Number(end.exitCode ?? 0);
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) throw error;
    }
  } catch (error) {
    if (!controller.signal.aborted) throw error;
  } finally {
    clearTimeout(timer);
  }
  return {
    stdout: stdout.text(),
    stderr: stderr.text(),
    exitCode,
    truncated: stdout.truncated || stderr.truncated,
  };
}

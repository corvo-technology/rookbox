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
};

export type SpaceSize = { vcpu: number; memoryMib: number; diskMib: number };

/** The slice of SPACE the product API uses. The real client calls ECW; tests pass a fake. */
export interface SpaceClient {
  create(input: {
    templateId: string;
    metadata: Record<string, string>;
    timeoutS: number;
    size: SpaceSize;
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
}

export class SpaceError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "SpaceError";
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
  };
}

export type EcwClientOptions = {
  baseUrl: string;
  apiKey: string;
  domain: string;
  fetch?: typeof fetch;
  /** Request timeout for management calls. */
  timeoutMs?: number;
};

const MAX_OUTPUT_BYTES = 256 * 1024;

export function createEcwClient(options: EcwClientOptions): SpaceClient {
  const doFetch = options.fetch ?? fetch;
  const base = options.baseUrl.replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? 120_000;

  async function call(
    method: string,
    path: string,
    body?: unknown,
    accept: readonly number[] = [],
  ): Promise<{ status: number; json: unknown; headers: Headers }> {
    const response = await doFetch(`${base}${path}`, {
      method,
      headers: {
        "x-api-key": options.apiKey,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    if (!response.ok && !accept.includes(response.status)) {
      const message =
        json && typeof json === "object" && "message" in json
          ? String((json as Json).message)
          : `SPACE answered ${response.status}`;
      throw new SpaceError(response.status, message);
    }
    return { status: response.status, json, headers: response.headers };
  }

  const enc = encodeURIComponent;

  return {
    async create({ templateId, metadata, timeoutS, size }) {
      const { json } = await call("POST", "/sandboxes", {
        templateID: templateId,
        timeout: timeoutS,
        autoPause: true,
        metadata: { ...metadata, "space.resources": resourcesMetadata(size) },
      });
      return { id: String((json as Json).sandboxID) };
    },

    async list(metadata) {
      const found: SandboxInfo[] = [];
      let token: string | null = null;
      do {
        const query: string = `${metadataQuery(metadata)}&state=running&state=paused&limit=100${
          token ? `&nextToken=${enc(token)}` : ""
        }`;
        const { json, headers } = await call("GET", `/v2/sandboxes?${query}`);
        for (const item of Array.isArray(json) ? json : []) found.push(toInfo(item as Json));
        token = headers.get("x-next-token") || null;
      } while (token && found.length < 1_000);
      return found;
    },

    async get(id) {
      const { status, json } = await call("GET", `/sandboxes/${enc(id)}`, undefined, [404]);
      return status === 404 ? null : toInfo(json as Json);
    },

    async suspend(id) {
      await call("POST", `/sandboxes/${enc(id)}/pause`, {});
    },

    async restore(id, timeoutS) {
      await call("POST", `/sandboxes/${enc(id)}/resume`, { timeout: timeoutS, autoPause: true });
    },

    async fork(id, timeoutS) {
      const { json } = await call("POST", `/sandboxes/${enc(id)}/fork`, {
        count: 1,
        timeout: timeoutS,
      });
      const first = Array.isArray(json) ? (json[0] as Json | undefined) : undefined;
      if (!first || first.sandboxID === undefined) {
        const error = first?.error as Json | undefined;
        throw new SpaceError(502, String(error?.message ?? "SPACE returned no fork"));
      }
      return { id: String(first.sandboxID) };
    },

    async kill(id) {
      const { status } = await call("DELETE", `/sandboxes/${enc(id)}`, undefined, [404]);
      if (status === 404) return "missing";
      return status === 202 ? "queued" : "deleted";
    },

    async trafficToken(id, timeoutS) {
      const { json } = await call("POST", `/sandboxes/${enc(id)}/connect`, { timeout: timeoutS });
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
      });
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
  push(chunk: Buffer) {
    const room = MAX_OUTPUT_BYTES - this.size;
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
}): Promise<ExecResult> {
  const stdout = new Capped();
  const stderr = new Capped();
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

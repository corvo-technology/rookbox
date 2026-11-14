import type { Machine } from "./types.js";

/** The metadata key the product API tags every machine it makes with. */
export const OWNER_TAG = "rookbox.owner";

export class EcwError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "EcwError";
  }
}

export interface EcwClient {
  /**
   * Every machine the key's organization has, running or suspended. All or nothing: if any page
   * fails, or an entry is not understood, it throws, so a half list is never mistaken for a
   * machine having gone away.
   */
  listMachines(): Promise<Machine[]>;
}

export type EcwOptions = {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  pageSize?: number;
  fetch?: typeof fetch;
};

type Json = Record<string, unknown>;

const MAX_PAGES = 1_000;

function whole(value: unknown, field: string, id: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new EcwError(`sandbox ${id}: ${field} is not a number`, 0);
  }
  return Math.round(value);
}

/**
 * One entry of `GET /v2/sandboxes` (ListedSandbox in the E2B API): `sandboxID`, `templateID`,
 * `cpuCount`, `memoryMB`, `diskSizeMB`, `startedAt`, `metadata` and `state`, which is `running`
 * or `paused` (a paused sandbox is a suspended one). Anything else is refused.
 */
export function parseSandbox(raw: unknown): Machine {
  if (!raw || typeof raw !== "object") throw new EcwError("a listed sandbox is not an object", 0);
  const item = raw as Json;
  const id = item.sandboxID;
  if (typeof id !== "string" || !id) throw new EcwError("a listed sandbox has no sandboxID", 0);
  const state = item.state === "running" ? "running" : item.state === "paused" ? "suspended" : null;
  if (!state) throw new EcwError(`sandbox ${id}: unknown state`, 0);
  const metadata =
    item.metadata && typeof item.metadata === "object" ? (item.metadata as Json) : {};
  const owner = metadata[OWNER_TAG];
  const startedAt =
    typeof item.startedAt === "string" && !Number.isNaN(Date.parse(item.startedAt))
      ? new Date(item.startedAt).toISOString()
      : null;
  return {
    id,
    owner: typeof owner === "string" && owner ? owner : null,
    template: typeof item.templateID === "string" ? item.templateID : "",
    vcpu: whole(item.cpuCount, "cpuCount", id),
    memoryMib: whole(item.memoryMB, "memoryMB", id),
    diskMib: whole(item.diskSizeMB, "diskSizeMB", id),
    state,
    startedAt,
  };
}

export function createEcwClient(options: EcwOptions): EcwClient {
  const doFetch = options.fetch ?? fetch;
  const base = options.baseUrl.replace(/\/+$/, "");
  const limit = options.pageSize ?? 100;

  return {
    async listMachines() {
      const byId = new Map<string, Machine>();
      let token: string | null = null;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const query = new URLSearchParams({ limit: String(limit) });
        if (token) query.set("nextToken", token);
        let response: Response;
        try {
          response = await doFetch(`${base}/v2/sandboxes?${query}`, {
            headers: { "x-api-key": options.apiKey, accept: "application/json" },
            signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
          });
        } catch (error) {
          const timedOut = error instanceof Error && error.name === "TimeoutError";
          throw new EcwError(timedOut ? "list timed out" : "list could not reach the server", 0);
        }
        if (!response.ok) throw new EcwError(`list answered ${response.status}`, response.status);
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          throw new EcwError("list did not answer with JSON", response.status);
        }
        if (!Array.isArray(body)) throw new EcwError("list did not answer with an array", 0);
        for (const item of body) {
          const machine = parseSandbox(item);
          byId.set(machine.id, machine);
        }
        token = response.headers.get("x-next-token") || null;
        if (!token) return [...byId.values()];
      }
      throw new EcwError("list did not end", 0);
    },
  };
}

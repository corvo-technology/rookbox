import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const DEFAULT_API_URL = "https://api.rookbox.run";
export const DASHBOARD_URL = "https://app.rookbox.run";

export type StoredConfig = { apiKey?: string; apiUrl?: string };

export type Env = Record<string, string | undefined>;

export function configPath(env: Env): string {
  const base = env.XDG_CONFIG_HOME || join(env.HOME || homedir(), ".config");
  return join(base, "rookbox", "config.json");
}

export function readConfig(path: string): StoredConfig {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (typeof parsed !== "object" || parsed === null) return {};
    const out: StoredConfig = {};
    const { apiKey, apiUrl } = parsed as Record<string, unknown>;
    if (typeof apiKey === "string" && apiKey) out.apiKey = apiKey;
    if (typeof apiUrl === "string" && apiUrl) out.apiUrl = apiUrl;
    return out;
  } catch {
    return {};
  }
}

/** Writes the file readable by its owner only, even when it already existed with wider rights. */
export function writeConfig(path: string, config: StoredConfig): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

export function removeConfig(path: string): boolean {
  if (!existsSync(path)) return false;
  rmSync(path);
  return true;
}

export type KeySource = "--key" | "ROOKBOX_API_KEY" | "E2B_API_KEY" | "config";

export type Resolved = { apiKey?: string; source?: KeySource; apiUrl: string };

/** The key the environment carries, `ROOKBOX_API_KEY` before `E2B_API_KEY`. */
export function keyFromEnv(env: Env): { apiKey: string; source: KeySource } | null {
  for (const source of ["ROOKBOX_API_KEY", "E2B_API_KEY"] as const) {
    const apiKey = env[source];
    if (apiKey) return { apiKey, source };
  }
  return null;
}

/** The key from the flag, then the environment, then the saved file. */
export function resolveAuth(env: Env, path: string, flagKey?: string): Resolved {
  const stored = readConfig(path);
  const apiUrl = (env.ROOKBOX_API_URL || stored.apiUrl || DEFAULT_API_URL).replace(/\/+$/, "");
  if (flagKey) return { apiKey: flagKey, source: "--key", apiUrl };
  const fromEnv = keyFromEnv(env);
  if (fromEnv) return { ...fromEnv, apiUrl };
  if (stored.apiKey) return { apiKey: stored.apiKey, source: "config", apiUrl };
  return { apiUrl };
}

/** `rbx_abcd...wxyz`: enough to recognise a key, never enough to use it. */
export function maskKey(key: string): string {
  if (key.length <= 12) return "****";
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}

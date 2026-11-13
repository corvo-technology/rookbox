import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { ApiKey, CreatedApiKey } from "@rookbox/contracts";
import { API_KEY_PREFIX } from "@rookbox/contracts";
import type { Db } from "./db.js";

export type ApiKeyRow = {
  id: string;
  userId: string;
  name: string;
  hint: string;
  keyHash: string;
  createdAt: Date;
  lastUsedAt: Date | null;
};

export interface ApiKeyStore {
  listActive(userId: string): Promise<ApiKeyRow[]>;
  insert(row: Omit<ApiKeyRow, "createdAt" | "lastUsedAt">): Promise<ApiKeyRow>;
  /** True when a live key of that user was revoked. */
  revoke(userId: string, id: string): Promise<boolean>;
  findActiveByHash(keyHash: string): Promise<ApiKeyRow | null>;
  touch(id: string, at: Date): Promise<void>;
}

export const MAX_KEYS_PER_USER = 20;
/** `lastUsedAt` is refreshed at most this often, so a busy key does not write on every call. */
const TOUCH_INTERVAL_MS = 5 * 60_000;

/** Only this hash is stored; the secret is shown once. */
export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function view(row: ApiKeyRow): ApiKey {
  return {
    id: row.id,
    name: row.name,
    hint: row.hint,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  };
}

export class ApiKeyLimitError extends Error {}

export function createApiKeyService(store: ApiKeyStore, now: () => Date = () => new Date()) {
  return {
    async list(userId: string): Promise<ApiKey[]> {
      return (await store.listActive(userId)).map(view);
    },

    async create(userId: string, name: string): Promise<CreatedApiKey> {
      if ((await store.listActive(userId)).length >= MAX_KEYS_PER_USER) {
        throw new ApiKeyLimitError(`At most ${MAX_KEYS_PER_USER} keys. Revoke one first.`);
      }
      const secret = `${API_KEY_PREFIX}${randomBytes(20).toString("hex")}`;
      const row = await store.insert({
        id: `k_${randomUUID().replaceAll("-", "").slice(0, 12)}`,
        userId,
        name,
        hint: secret.slice(0, API_KEY_PREFIX.length + 4),
        keyHash: hashSecret(secret),
      });
      return { key: view(row), secret };
    },

    revoke(userId: string, id: string): Promise<boolean> {
      return store.revoke(userId, id);
    },

    /** The user a secret belongs to, or null when it is unknown or revoked. */
    async authenticate(secret: string): Promise<string | null> {
      if (!secret.startsWith(API_KEY_PREFIX)) return null;
      const row = await store.findActiveByHash(hashSecret(secret));
      if (!row) return null;
      const at = now();
      if (!row.lastUsedAt || at.getTime() - row.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
        await store.touch(row.id, at).catch(() => undefined);
      }
      return row.userId;
    },
  };
}

export type ApiKeyService = ReturnType<typeof createApiKeyService>;

export function createPrismaApiKeyStore(db: Db): ApiKeyStore {
  return {
    listActive: (userId) =>
      db.apiKey.findMany({ where: { userId, revokedAt: null }, orderBy: { createdAt: "desc" } }),
    insert: (row) => db.apiKey.create({ data: row }),
    async revoke(userId, id) {
      const result = await db.apiKey.updateMany({
        where: { id, userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return result.count > 0;
    },
    findActiveByHash: (keyHash) => db.apiKey.findFirst({ where: { keyHash, revokedAt: null } }),
    async touch(id, at) {
      await db.apiKey.update({ where: { id }, data: { lastUsedAt: at } });
    },
  };
}

import { describe, expect, it } from "vitest";
import { createApiKeyService, hashSecret, MAX_KEYS_PER_USER } from "./api-keys.js";
import { memoryApiKeyStore } from "./test-support.js";

describe("api keys", () => {
  it("shows the secret once and stores only its hash", async () => {
    const store = memoryApiKeyStore();
    const service = createApiKeyService(store);
    const { key, secret } = await service.create("alice", "ci");
    expect(secret).toMatch(/^rbx_[0-9a-f]{40}$/);
    const stored = store.rows.get(key.id)!;
    expect(stored.keyHash).toBe(hashSecret(secret));
    expect(JSON.stringify(stored)).not.toContain(secret);
    expect(key.hint).toBe(secret.slice(0, 8));
    expect(JSON.stringify(await service.list("alice"))).not.toContain(secret);
  });

  it("authenticates a live key, records use, and refuses unknown or revoked ones", async () => {
    const store = memoryApiKeyStore();
    const service = createApiKeyService(store);
    const { key, secret } = await service.create("alice", "ci");
    expect(await service.authenticate(secret)).toBe("alice");
    expect(store.rows.get(key.id)!.lastUsedAt).not.toBeNull();
    expect(await service.authenticate("rbx_" + "0".repeat(40))).toBeNull();
    expect(await service.authenticate("not-a-key")).toBeNull();
    expect(await service.revoke("alice", key.id)).toBe(true);
    expect(await service.authenticate(secret)).toBeNull();
  });

  it("lets a user revoke only their own keys", async () => {
    const service = createApiKeyService(memoryApiKeyStore());
    const { key } = await service.create("alice", "ci");
    expect(await service.revoke("bob", key.id)).toBe(false);
    expect(await service.list("alice")).toHaveLength(1);
  });

  it("caps keys per user", async () => {
    const service = createApiKeyService(memoryApiKeyStore());
    for (let i = 0; i < MAX_KEYS_PER_USER; i += 1) await service.create("alice", `k${i}`);
    await expect(service.create("alice", "one more")).rejects.toThrow(/At most/);
  });
});

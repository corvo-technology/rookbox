import { describe, expect, it } from "vitest";
import { parseCustomerRules } from "./customers.js";
import { createEcwClient, parseSandbox } from "./ecw.js";

const listed = (id: string, extra: Record<string, unknown> = {}) => ({
  templateID: "seed",
  sandboxID: id,
  clientID: id,
  startedAt: "2026-11-10T00:00:00Z",
  endAt: "2026-11-10T00:15:00Z",
  cpuCount: 2,
  memoryMB: 2048,
  diskSizeMB: 10240,
  metadata: { "rookbox.owner": "u1", "rookbox.name": "box" },
  state: "running",
  envdVersion: "0.2.0",
  ...extra,
});

function client(pages: { body: unknown; next?: string; status?: number }[]) {
  const urls: string[] = [];
  const headers: Headers[] = [];
  let n = 0;
  const instance = createEcwClient({
    baseUrl: "https://ecw.test/",
    apiKey: "key-123",
    pageSize: 2,
    fetch: async (input, init) => {
      urls.push(String(input));
      headers.push(new Headers(init?.headers));
      const page = pages[n++] ?? { body: [] };
      return new Response(JSON.stringify(page.body), {
        status: page.status ?? 200,
        headers: page.next ? { "x-next-token": page.next } : {},
      });
    },
  });
  return { instance, urls, headers };
}

describe("parseSandbox", () => {
  it("reads the fields usage needs from a listed sandbox", () => {
    expect(parseSandbox(listed("sbx1"))).toEqual({
      id: "sbx1",
      owner: "u1",
      template: "seed",
      vcpu: 2,
      memoryMib: 2048,
      diskMib: 10240,
      state: "running",
      startedAt: "2026-11-10T00:00:00.000Z",
    });
  });

  it("maps paused to suspended, and a missing owner tag to null", () => {
    const parsed = parseSandbox(listed("sbx1", { state: "paused", metadata: {} }));
    expect(parsed).toMatchObject({ state: "suspended", owner: null });
  });

  it("files a machine under a customer by its metadata, but never over an owner tag", () => {
    const rules = parseCustomerRules("corvo=rook");
    const rook = listed("sbx1", { metadata: { botId: "b1", corvo: "1" } });
    expect(parseSandbox(rook, rules).owner).toBe("customer:rook");
    expect(parseSandbox(rook).owner).toBeNull();
    const tagged = listed("sbx2", { metadata: { corvo: "1", "rookbox.owner": "u1" } });
    expect(parseSandbox(tagged, rules).owner).toBe("u1");
    const stranger = listed("sbx3", { metadata: { other: "1" } });
    expect(parseSandbox(stranger, rules).owner).toBeNull();
  });

  it("refuses what it does not understand rather than guess", () => {
    expect(() => parseSandbox(listed("sbx1", { state: "weird" }))).toThrow(/unknown state/);
    expect(() => parseSandbox(listed("sbx1", { cpuCount: "2" }))).toThrow(/cpuCount/);
    expect(() => parseSandbox({ state: "running" })).toThrow(/sandboxID/);
  });
});

describe("listMachines", () => {
  it("follows the next-token header across pages and sends the service key", async () => {
    const { instance, urls, headers } = client([
      { body: [listed("a"), listed("b")], next: "tok1" },
      { body: [listed("c", { state: "paused" })] },
    ]);
    const machines = await instance.listMachines();
    expect(machines.map((m) => [m.id, m.state])).toEqual([
      ["a", "running"],
      ["b", "running"],
      ["c", "suspended"],
    ]);
    expect(urls[0]).toBe("https://ecw.test/v2/sandboxes?limit=2");
    expect(urls[1]).toBe("https://ecw.test/v2/sandboxes?limit=2&nextToken=tok1");
    expect(headers[0]?.get("x-api-key")).toBe("key-123");
  });

  it("includes machines it did not create, with no owner", async () => {
    const { instance } = client([{ body: [listed("x", { metadata: {} })] }]);
    expect((await instance.listMachines())[0]?.owner).toBeNull();
  });

  it("fails as a whole when a later page fails, so a half list is never used", async () => {
    const { instance } = client([
      { body: [listed("a")], next: "t" },
      { body: {}, status: 503 },
    ]);
    await expect(instance.listMachines()).rejects.toThrow(/503/);
  });

  it("fails on a body that is not a list", async () => {
    const { instance } = client([{ body: { error: "nope" } }]);
    await expect(instance.listMachines()).rejects.toThrow(/array/);
  });

  it("reports an unreachable server without its address", async () => {
    const instance = createEcwClient({
      baseUrl: "https://ecw.test",
      apiKey: "k",
      fetch: async () => {
        throw new TypeError("connect ECONNREFUSED 10.1.2.3:443");
      },
    });
    const error = await instance.listMachines().catch((e: Error) => e);
    expect(String(error)).not.toContain("10.1.2.3");
  });
});

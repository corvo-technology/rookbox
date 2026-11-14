import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";
import { healthBody, startHealthServer } from "./health.js";
import { createLogger } from "./log.js";
import type { Status } from "./service.js";

const env = {
  SPACE_ECW_API_URL: "https://api.box.example.test/",
  SPACE_ECW_API_KEY: "ecw-key",
  ROOKBOX_API_URL: "https://api.example.test",
  INGEST_SECRET: "i".repeat(40),
  REPORTER_ID: "box 1",
};

describe("loadConfig", () => {
  it("applies the documented defaults and cleans values", () => {
    const config = loadConfig(env);
    expect(config).toMatchObject({
      ecwUrl: "https://api.box.example.test",
      pollIntervalS: 30,
      snapshotIntervalS: 300,
      batchSize: 200,
      healthPort: 9464,
      reporterId: "box-1",
    });
  });
  it("names what is missing or wrong", () => {
    expect(() => loadConfig({ ...env, INGEST_SECRET: "short" })).toThrow(/INGEST_SECRET/);
    expect(() => loadConfig({ ...env, SPACE_ECW_API_KEY: "" })).toThrow(/SPACE_ECW_API_KEY/);
    expect(() => loadConfig({ ...env, POLL_INTERVAL_S: "0" })).toThrow(/POLL_INTERVAL_S/);
    expect(() => loadConfig({ ...env, ROOKBOX_API_URL: "ftp://x" })).toThrow(/ROOKBOX_API_URL/);
  });
});

describe("logs", () => {
  it("never write secrets, keys or signatures", () => {
    const lines: string[] = [];
    const logger = createLogger("info", {}, (line) => lines.push(line));
    logger.info("x", {
      ingestSecret: "hunter2",
      apiKey: "k",
      signature: "s",
      error: new Error("boom"),
      ok: 1,
    });
    expect(lines[0]).not.toContain("hunter2");
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({
      ingestSecret: "[redacted]",
      apiKey: "[redacted]",
      ok: 1,
    });
  });
});

const status = (fields: Partial<Status> = {}): Status => ({
  startedAt: "2026-11-10T00:00:00.000Z",
  lastPollOkAt: "2026-11-10T00:10:00.000Z",
  lastPollAttemptAt: "2026-11-10T00:10:00.000Z",
  lastPollFailure: null,
  lastDeliveryOkAt: "2026-11-10T00:10:00.000Z",
  lastDeliveryFailure: null,
  consecutiveSendFailures: 0,
  pending: 0,
  oldestPendingAgeS: null,
  machines: 2,
  ...fields,
});

describe("healthBody", () => {
  const now = Date.parse("2026-11-10T00:10:30.000Z");
  it("is ok while polling is fresh", () => {
    expect(healthBody(status(), 30, now)).toMatchObject({ ok: true, delivery: "ok" });
  });
  it("is stalled when no poll has worked for three intervals", () => {
    const old = status({ lastPollOkAt: "2026-11-10T00:05:00.000Z" });
    expect(healthBody(old, 30, now)).toMatchObject({ ok: false, polling: "stalled" });
  });
  it("says delivery is behind without failing the check", () => {
    const behind = status({ pending: 40, lastDeliveryOkAt: "2026-11-10T00:00:00.000Z" });
    expect(healthBody(behind, 30, now)).toMatchObject({ ok: true, delivery: "behind" });
  });
});

describe("the health server", () => {
  let close: (() => void) | null = null;
  afterEach(() => close?.());
  it("serves /healthz on loopback and nothing else", async () => {
    const server = await startHealthServer({
      port: 0,
      status: () => status(),
      pollIntervalS: 30,
      now: () => Date.parse("2026-11-10T00:10:10.000Z"),
    });
    close = () => server.close();
    const address = server.address();
    expect(typeof address === "object" && address?.address).toBe("127.0.0.1");
    const port = typeof address === "object" && address ? address.port : 0;
    const ok = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({
      ok: true,
      machines: 2,
      lastDeliveryOkAt: "2026-11-10T00:10:00.000Z",
    });
    expect((await fetch(`http://127.0.0.1:${port}/other`)).status).toBe(404);
  });
});

import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { AppClient } from "@rookbox/contracts";
import { describe, expect, it } from "vitest";
import { createApiKeyService } from "../api-keys.js";
import { createApp } from "../app.js";
import { silentLogger } from "../logger.js";
import { memoryApiKeyStore, newMachineService } from "../test-support.js";
import { createIngestHandler } from "./ingest.js";
import { REPORTER_HEADER, SIGNATURE_HEADER, signBody, TIMESTAMP_HEADER } from "./signature.js";
import { ev, events, newUsage, resetSeq } from "./test-support.js";

const SECRET = "k".repeat(40);

function setup() {
  resetSeq();
  const usage = newUsage({ admins: ["admin@example.test"] });
  usage.store.users.set("admin", "admin@example.test");
  const app = createApp({
    appOrigin: "https://app.example.test",
    logger: silentLogger,
    identity: async (headers) => {
      const who = headers.get("cookie")?.match(/session=([a-z0-9]+)/)?.[1];
      return who ? { id: who, email: `${who}@example.test` } : null;
    },
    authHandler: async () => new Response("auth"),
    machines: newMachineService().service,
    apiKeys: createApiKeyService(memoryApiKeyStore()),
    desktop: {
      http: async () => new Response(""),
      issueLink: async () => ({
        url: "https://desk.example.test/x",
        expiresAt: "2026-01-01T00:00:00Z",
      }),
      open: async () => new Response(""),
    },
    usage: usage.service,
    ingestUsage: createIngestHandler({
      secret: SECRET,
      usage: usage.service,
      logger: silentLogger,
    }),
  });
  const client = (who?: string) =>
    createORPCClient(
      new RPCLink({
        url: "http://api.test/rpc",
        fetch: (request) => {
          const headers = new Headers(request.headers);
          if (who) headers.set("cookie", `session=${who}`);
          return Promise.resolve(app.fetch(new Request(request, { headers })));
        },
      }),
    ) as AppClient;
  const ingest = (message: unknown) => {
    const body = JSON.stringify(message);
    const timestamp = String(Math.floor(Date.now() / 1000));
    return app.request("/ingest/usage-events", {
      method: "POST",
      headers: {
        [TIMESTAMP_HEADER]: timestamp,
        [SIGNATURE_HEADER]: signBody(SECRET, timestamp, body),
        [REPORTER_HEADER]: "rep1",
      },
      body,
    });
  };
  return { app, client, ingest, usage };
}

describe("usage over HTTP", () => {
  it("takes signed events outside the session login, then shows each user only their own", async () => {
    const { client, ingest, usage } = setup();
    const response = await ingest(
      events([ev("seen", "mine", 0, { owner: "u1" }), ev("seen", "theirs", 0, { owner: "u2" })]),
    );
    expect(response.status).toBe(200);
    usage.setNow(3_600);
    const a = await client("u1").usage.summary({ period: "7d" });
    expect(a.byMachine.map((m) => m.machineId)).toEqual(["mine"]);
    const b = await client("u2").usage.summary({ period: "7d" });
    expect(b.byMachine.map((m) => m.machineId)).toEqual(["theirs"]);
  });

  it("needs a session for the dashboard procedures and refuses unsigned ingest", async () => {
    const { client, app } = setup();
    await expect(client().usage.summary({ period: "7d" })).rejects.toMatchObject({ status: 401 });
    const unsigned = await app.request("/ingest/usage-events", { method: "POST", body: "{}" });
    expect(unsigned.status).toBe(401);
  });

  it("keeps the admin view to admins", async () => {
    const { client, ingest } = setup();
    await ingest(events([ev("seen", "stray", 0, { owner: null })]));
    await expect(client("u1").admin.usage({ period: "7d" })).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });
    const report = await client("admin").admin.usage({ period: "7d" });
    expect(report.unassigned.machines).toBe(1);
  });
});

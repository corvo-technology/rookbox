import { describe, expect, it } from "vitest";
import { createEcwClient, metadataQuery, SpaceError, sandboxHost } from "./client.js";

type Call = {
  url: string;
  method: string;
  headers: Headers;
  body: string | undefined;
  signal: AbortSignal | null | undefined;
};

function client(
  respond: (call: Call) => Response | Promise<Response>,
  extra: Partial<Parameters<typeof createEcwClient>[0]> = {},
) {
  const calls: Call[] = [];
  const waits: number[] = [];
  const space = createEcwClient({
    sleep: async (ms) => {
      waits.push(ms);
    },
    baseUrl: "https://api.box.example.test/",
    apiKey: "service-key",
    domain: "box.example.test",
    ...extra,
    fetch: async (url, init) => {
      const call = {
        url: String(url),
        method: String(init?.method),
        headers: new Headers(init?.headers),
        body: init?.body ? Buffer.from(init.body as Uint8Array).toString("utf8") : undefined,
        signal: init?.signal,
      };
      calls.push(call);
      return respond(call);
    },
  });
  return { space, calls, waits };
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, ...init });

describe("ECW client", () => {
  it("builds E2B's getHost", () => {
    expect(sandboxHost(6080, "abc", "box.example.test")).toBe("6080-abc.box.example.test");
  });

  it("encodes the metadata filter in two layers", () => {
    const query = metadataQuery({ "rookbox.owner": "a&b=c" });
    expect(query).toBe("metadata=rookbox.owner%3Da%2526b%253Dc");
    const inner = new URLSearchParams(query).get("metadata")!;
    expect(decodeURIComponent(inner.split("=")[1]!)).toBe("a&b=c");
  });

  it("creates with the service key, template, auto-pause, owner tag and sizing", async () => {
    const { space, calls } = client(() => json({ sandboxID: "sbx1" }, { status: 201 }));
    const created = await space.create({
      templateId: "seed",
      metadata: { "rookbox.owner": "u1" },
      timeoutS: 900,
      size: { vcpu: 2, memoryMib: 2048, diskMib: 10240 },
      allowInternet: true,
    });
    expect(created).toEqual({ id: "sbx1" });
    const call = calls[0]!;
    expect(call.url).toBe("https://api.box.example.test/sandboxes");
    expect(call.headers.get("x-api-key")).toBe("service-key");
    const body = JSON.parse(call.body!);
    expect(body).toMatchObject({
      templateID: "seed",
      timeout: 900,
      autoPause: true,
      allowInternetAccess: true,
    });
    expect(body.metadata["rookbox.owner"]).toBe("u1");
    expect(JSON.parse(body.metadata["space.resources"])).toEqual({
      vcpu: 2,
      memory_mib: 2048,
      disk_mib: 10240,
    });
  });

  it("lists with the filter, follows pages, and maps states", async () => {
    let page = 0;
    const { space, calls } = client(() => {
      page += 1;
      return json(
        [
          {
            sandboxID: `s${page}`,
            templateID: "seed",
            state: page === 1 ? "running" : "paused",
            metadata: { a: "b" },
          },
        ],
        { headers: page === 1 ? { "x-next-token": "t1" } : {} },
      );
    });
    const found = await space.list({ "rookbox.owner": "u1" });
    expect(found.map((s) => [s.id, s.state])).toEqual([
      ["s1", "running"],
      ["s2", "paused"],
    ]);
    expect(calls[0]!.url).toContain("/v2/sandboxes?metadata=");
    expect(calls[1]!.url).toContain("nextToken=t1");
  });

  it("returns null for a missing sandbox and reports delete outcomes", async () => {
    const { space } = client((call) =>
      call.method === "DELETE"
        ? new Response(null, { status: 202 })
        : json({ message: "nope" }, { status: 404 }),
    );
    expect(await space.get("x")).toBeNull();
    expect(await space.kill("x")).toBe("queued");
  });

  it("surfaces SPACE errors with their status", async () => {
    const { space } = client(() => json({ message: "already paused" }, { status: 409 }));
    await expect(space.suspend("x")).rejects.toMatchObject({
      status: 409,
      message: "already paused",
    });
    expect(new SpaceError(500, "x")).toBeInstanceOf(Error);
  });

  it("reads the traffic token from connect", async () => {
    const { space, calls } = client(() => json({ sandboxID: "s", trafficAccessToken: "tok" }));
    expect(await space.trafficToken("s", 900)).toBe("tok");
    expect(calls[0]!.url).toContain("/sandboxes/s/connect");
  });
});

function frame(flags: number, payload: unknown) {
  const body = Buffer.from(JSON.stringify(payload));
  const head = Buffer.alloc(5);
  head[0] = flags;
  head.writeUInt32BE(body.length, 1);
  return Buffer.concat([head, body]);
}
const b64 = (text: string) => Buffer.from(text).toString("base64");

describe("failures and retries", () => {
  it("classifies SPACE statuses", () => {
    expect(new SpaceError(401, "Invalid or missing API key").code).toBe("AUTH");
    expect(new SpaceError(409, "x").code).toBe("CONFLICT");
    expect(new SpaceError(503, "x").code).toBe("CAPACITY");
    expect(new SpaceError(429, "x").code).toBe("CAPACITY");
    expect(new SpaceError(429, "quota exceeded").code).toBe("QUOTA");
    expect(new SpaceError(504, "x").code).toBe("TIMEOUT");
    expect(new SpaceError(500, "x").code).toBe("UPSTREAM");
  });

  it("reads a missing template from a 404 on create", async () => {
    const { space } = client(() => json({ message: "template not found" }, { status: 404 }));
    await expect(
      space.create({
        templateId: "nope",
        metadata: {},
        allowInternet: true,
        timeoutS: 900,
        size: { vcpu: 1, memoryMib: 512, diskMib: 1024 },
      }),
    ).rejects.toMatchObject({ code: "TEMPLATE_NOT_FOUND" });
  });

  it("retries a read after a 503, waiting for Retry-After", async () => {
    let n = 0;
    const { space, calls, waits } = client(() =>
      ++n < 3
        ? json({ message: "busy" }, { status: 503, headers: { "retry-after": "1" } })
        : json({ sandboxID: "s", state: "running", templateID: "seed" }),
    );
    expect((await space.get("s"))?.state).toBe("running");
    expect(calls).toHaveLength(3);
    expect(waits).toEqual([1000, 1000]);
  });

  it("gives up after the bounded retries, with the last error", async () => {
    const { space, calls } = client(() => json({ message: "busy" }, { status: 502 }), {
      retries: 2,
    });
    await expect(space.get("s")).rejects.toMatchObject({ status: 502, code: "UPSTREAM" });
    expect(calls).toHaveLength(3);
  });

  it("retries a network failure on a read, then reports SPACE as unreachable", async () => {
    let n = 0;
    const { space } = client(() => {
      n += 1;
      throw new TypeError("fetch failed");
    });
    await expect(space.get("s")).rejects.toMatchObject({ code: "UNREACHABLE", status: 0 });
    expect(n).toBe(3);
  });

  it("does not retry a call that is not safe to repeat", async () => {
    const { space, calls } = client(() => json({ message: "busy" }, { status: 503 }));
    await expect(space.suspend("s")).rejects.toMatchObject({ code: "CAPACITY" });
    await expect(
      space.create({
        templateId: "seed",
        metadata: {},
        allowInternet: true,
        timeoutS: 900,
        size: { vcpu: 1, memoryMib: 512, diskMib: 1024 },
      }),
    ).rejects.toMatchObject({ code: "CAPACITY" });
    expect(calls).toHaveLength(2);
  });

  it("does not retry a refusal such as bad credentials", async () => {
    const { space, calls } = client(() =>
      json({ message: "Invalid or missing API key" }, { status: 401 }),
    );
    await expect(space.get("s")).rejects.toMatchObject({ code: "AUTH" });
    expect(calls).toHaveLength(1);
  });

  it("times out a slow answer and reports it as a timeout", async () => {
    const { space } = client(
      (call) =>
        new Promise<Response>((_, reject) => {
          call.signal?.addEventListener("abort", () => reject(call.signal?.reason));
        }),
      { readTimeoutMs: 20, retries: 0 },
    );
    await expect(space.get("s")).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("forks with one idempotency key across retries", async () => {
    let n = 0;
    const { space, calls } = client(() =>
      ++n === 1 ? json({}, { status: 503 }) : json([{ sandboxID: "child" }], { status: 201 }),
    );
    expect(await space.fork("s", 900)).toEqual({ id: "child" });
    const keys = calls.map((c) => c.headers.get("idempotency-key"));
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
  });

  it("probes with the key and reports only the status class", async () => {
    const { space, calls } = client(() =>
      json({ message: "Invalid or missing API key" }, { status: 401 }),
    );
    expect(await space.probe()).toMatchObject({
      keyConfigured: true,
      reachable: true,
      statusClass: "4xx",
      auth: "rejected",
    });
    expect(calls[0]!.headers.get("x-api-key")).toBe("service-key");
  });

  it("probes without a key and says it is missing", async () => {
    const { space, calls } = client(() => json({}, { status: 401 }), { apiKey: "" });
    expect(await space.probe()).toMatchObject({ keyConfigured: false, auth: "missing" });
    expect(calls[0]!.headers.has("x-api-key")).toBe(false);
  });

  it("probes an unreachable SPACE without throwing", async () => {
    const { space } = client(() => {
      throw new TypeError("fetch failed");
    });
    expect(await space.probe()).toMatchObject({ reachable: false, statusClass: null });
  });
});

describe("exec through envd", () => {
  it("sends a Connect frame to the process service and gathers output and exit code", async () => {
    // The response is split mid-frame to prove frames are reassembled.
    const stream = Buffer.concat([
      frame(0, { event: { start: { pid: 7 } } }),
      frame(0, { event: { data: { stdout: b64("hello ") } } }),
      frame(0, { event: { data: { stdout: b64("world\n") } } }),
      frame(0, { event: { data: { stderr: b64("warn\n") } } }),
      frame(0, { event: { end: { exitCode: 3, exited: true } } }),
      frame(2, {}),
    ]);
    const { space, calls } = client(
      () =>
        new Response(new Blob([stream.subarray(0, 20), stream.subarray(20)]).stream(), {
          status: 200,
        }),
    );
    const result = await space.exec("sbx1", "envd-token", "echo hello world", 5000);
    expect(result).toEqual({
      stdout: "hello world\n",
      stderr: "warn\n",
      exitCode: 3,
      truncated: false,
    });
    const call = calls[0]!;
    expect(call.url).toBe("https://49983-sbx1.box.example.test/process.Process/Start");
    expect(call.headers.get("x-access-token")).toBe("envd-token");
    expect(call.headers.get("content-type")).toBe("application/connect+json");
    expect(call.body!.slice(5)).toContain('"cmd":"/bin/bash"');
    expect(call.body!.slice(5)).toContain("echo hello world");
  });

  it("returns what it has, with no exit code, when the time runs out", async () => {
    const { space } = client(
      (call) =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                new Uint8Array(frame(0, { event: { data: { stdout: b64("partial") } } })),
              );
              // A real fetch errors the body when the request is aborted.
              call.signal?.addEventListener("abort", () => controller.error(new Error("aborted")));
            },
          }),
          { status: 200 },
        ),
    );
    const result = await space.exec("sbx1", "t", "sleep 100", 1000);
    expect(result.stdout).toBe("partial");
    expect(result.exitCode).toBeNull();
  });
});

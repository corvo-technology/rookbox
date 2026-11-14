import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { compareVersions, type Deps, runCli, shellQuote } from "./cli.js";
import { configPath, maskKey, resolveAuth } from "./config.js";
import { mapError } from "./errors.js";
import { parseDuration } from "./format.js";
import { translator } from "./i18n.js";
import { type Api, sdkApi } from "./sdk.js";

const GOOD_KEY = "rbx_goodkey_0123456789";

type Fake = {
  server: Server;
  url: string;
  /** What POST /sandboxes answers next: status and JSON body. */
  create: { status: number; body: unknown };
  seen: { method: string; path: string; key: string | undefined }[];
  sandboxes: unknown[];
  /** Answers queued for the next matching requests, before the normal handler runs. */
  queue: { method: string; status: number; body: string; type: string }[];
};

function startFake(): Promise<Fake> {
  const fake = {
    create: { status: 201, body: {} },
    seen: [],
    sandboxes: [],
    queue: [],
  } as unknown as Fake;
  fake.server = createServer((req, res) => {
    const key = req.headers["x-api-key"] as string | undefined;
    const path = req.url ?? "";
    fake.seen.push({ method: req.method ?? "", path, key });
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(body === undefined ? "" : JSON.stringify(body));
    };
    const queuedAt = fake.queue.findIndex((q) => q.method === req.method);
    if (queuedAt !== -1) {
      const [q] = fake.queue.splice(queuedAt, 1);
      res.writeHead(q?.status ?? 500, { "content-type": q?.type ?? "text/html" });
      return res.end(q?.body ?? "");
    }
    if (key !== GOOD_KEY) return send(401, { code: 401, message: "Invalid API key." });
    if (req.method === "GET" && path.startsWith("/v2/sandboxes")) return send(200, fake.sandboxes);
    if (req.method === "DELETE" && path.startsWith("/sandboxes/")) {
      res.writeHead(204);
      return res.end();
    }
    if (req.method === "POST" && (path === "/sandboxes" || path === "/v2/sandboxes")) {
      return send(fake.create.status, fake.create.body);
    }
    return send(404, { code: 404, message: "Sandbox not found." });
  });
  return new Promise((resolve) => {
    fake.server.listen(0, "127.0.0.1", () => {
      fake.url = `http://127.0.0.1:${(fake.server.address() as AddressInfo).port}`;
      resolve(fake);
    });
  });
}

let fake: Fake;
const dirs: string[] = [];

beforeAll(async () => {
  fake = await startFake();
});
afterAll(() => {
  fake.server.close();
});
afterEach(() => {
  fake.seen.length = 0;
  fake.sandboxes = [];
  fake.queue = [];
  fake.create = { status: 201, body: {} };
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function home(): string {
  const dir = mkdtempSync(join(tmpdir(), "rookbox-cli-"));
  dirs.push(dir);
  return dir;
}

type Result = { code: number; out: string; err: string };

async function cli(
  argv: string[],
  options: {
    env?: Record<string, string | undefined>;
    stdinText?: string;
    api?: (auth: { apiKey: string; apiUrl: string }) => Api;
    tty?: boolean;
    stderrTty?: boolean;
  } = {},
): Promise<Result & { dir: string }> {
  const dir = home();
  const outChunks: string[] = [];
  const errChunks: string[] = [];
  const stdin = new PassThrough() as unknown as NodeJS.ReadStream;
  if (options.stdinText !== undefined) (stdin as unknown as PassThrough).end(options.stdinText);
  else (stdin as unknown as PassThrough).end();
  const stdout = {
    isTTY: options.tty ?? false,
    write: (s: string) => outChunks.push(s),
  } as unknown as NodeJS.WriteStream;
  const deps: Deps = {
    env: {
      XDG_CONFIG_HOME: dir,
      ROOKBOX_API_URL: fake.url,
      ROOKBOX_LANG: "en",
      ...options.env,
    },
    version: "1.2.3",
    stdin,
    stdout,
    stderr: {
      isTTY: options.stderrTty ?? false,
      write: (s: string) => errChunks.push(s),
    } as Deps["stderr"],
    sleep: async () => undefined,
    makeApi: options.api ?? sdkApi,
    openUrl: async () => false,
    fetch: async () => new Response("[]"),
  };
  const code = await runCli(argv, deps);
  return { code, out: outChunks.join(""), err: errChunks.join(""), dir };
}

const sandbox = (id: string, state: string, name?: string) => ({
  sandboxID: id,
  templateID: "seed",
  clientID: "x",
  startedAt: new Date(Date.now() - 90 * 60_000).toISOString(),
  endAt: new Date(Date.now() + 30 * 60_000).toISOString(),
  cpuCount: 2,
  memoryMB: 4096,
  diskSizeMB: 10240,
  envdVersion: "0.2.0",
  state,
  metadata: name ? { "rookbox.name": name } : {},
});

describe("login", () => {
  it("validates the key against the API and saves it with mode 0600", async () => {
    fake.sandboxes = [sandbox("sbx1", "running")];
    const r = await cli(["login", "--key", GOOD_KEY]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("Logged in. 1 machine(s)");
    expect(fake.seen[0]?.key).toBe(GOOD_KEY);
    const file = configPath({ XDG_CONFIG_HOME: r.dir });
    expect(statSync(file).mode & 0o777).toBe(0o600);
    const saved = JSON.parse(readFileSync(file, "utf8"));
    expect(saved.apiKey).toBe(GOOD_KEY);
    // The key never reaches the screen.
    expect(r.out + r.err).not.toContain(GOOD_KEY);
  });

  it("reads the key from a pipe", async () => {
    const r = await cli(["login"], { stdinText: `${GOOD_KEY}\n` });
    expect(r.code).toBe(0);
    expect(existsSync(configPath({ XDG_CONFIG_HOME: r.dir }))).toBe(true);
  });

  it("rejects a bad key with exit 3 and saves nothing", async () => {
    const r = await cli(["login", "--key", "rbx_wrong"]);
    expect(r.code).toBe(3);
    expect(r.err).toContain("not accepted");
    expect(existsSync(configPath({ XDG_CONFIG_HOME: r.dir }))).toBe(false);
  });

  it("tightens a config file that was world-readable", async () => {
    const dir = home();
    const file = configPath({ XDG_CONFIG_HOME: dir });
    mkdirSync(join(dir, "rookbox"), { recursive: true });
    writeFileSync(file, "{}", { mode: 0o644 });
    const r = await cli(["login", "--key", GOOD_KEY], { env: { XDG_CONFIG_HOME: dir } });
    expect(r.code).toBe(0);
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it("logout removes the file", async () => {
    const dir = home();
    const env = { XDG_CONFIG_HOME: dir };
    await cli(["login", "--key", GOOD_KEY], { env });
    const r = await cli(["logout"], { env });
    expect(r.out).toContain("Logged out");
    expect(existsSync(configPath(env))).toBe(false);
  });
});

describe("ls and key resolution", () => {
  it("prints a table, and uses ROOKBOX_API_KEY without a saved key", async () => {
    fake.sandboxes = [sandbox("sbx-aaa", "running", "dev"), sandbox("sbx-bbb", "paused")];
    const r = await cli(["ls"], { env: { ROOKBOX_API_KEY: GOOD_KEY } });
    expect(r.code).toBe(0);
    const lines = r.out.trim().split("\n");
    expect(lines[0]).toMatch(/^ID\s+NAME\s+STATE\s+AGE$/);
    expect(lines[1]).toMatch(/^sbx-aaa\s+dev\s+running\s+1h30m$/);
    expect(lines[2]).toMatch(/^sbx-bbb\s+-\s+paused\s+1h30m$/);
    // Not a terminal: no color codes.
    expect(r.out).not.toContain("\u001b[");
  });

  it("E2B_API_KEY works, ROOKBOX_API_KEY wins over it", () => {
    const env = { E2B_API_KEY: "e", XDG_CONFIG_HOME: home() };
    expect(resolveAuth(env, configPath(env)).source).toBe("E2B_API_KEY");
    expect(resolveAuth({ ...env, ROOKBOX_API_KEY: "r" }, configPath(env)).apiKey).toBe("r");
    expect(resolveAuth(env, configPath(env), "flag").apiKey).toBe("flag");
    expect(resolveAuth(env, configPath(env)).apiUrl).toBe("https://api.rookbox.run");
  });

  it("--json is machine readable", async () => {
    fake.sandboxes = [sandbox("sbx-aaa", "running", "dev")];
    const r = await cli(["ls", "--json"], { env: { ROOKBOX_API_KEY: GOOD_KEY } });
    const data = JSON.parse(r.out);
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ id: "sbx-aaa", name: "dev", state: "running", cpuCount: 2 });
  });

  it("says so when there are no machines", async () => {
    const r = await cli(["ls"], { env: { ROOKBOX_API_KEY: GOOD_KEY } });
    expect(r.out).toContain("No machines yet");
  });

  it("without a key: exit 3 and a hint", async () => {
    const r = await cli(["ls"]);
    expect(r.code).toBe(3);
    expect(r.err).toContain("rookbox login");
  });

  it("speaks Portuguese when asked", async () => {
    const r = await cli(["ls"], { env: { ROOKBOX_LANG: "pt" } });
    expect(r.err).toContain("Você não está logado");
  });

  it("colors only on a terminal and honors NO_COLOR", async () => {
    fake.sandboxes = [sandbox("sbx-aaa", "running")];
    const env = { ROOKBOX_API_KEY: GOOD_KEY };
    expect((await cli(["ls"], { env, tty: true })).out).toContain("\u001b[");
    expect((await cli(["ls"], { env: { ...env, NO_COLOR: "1" }, tty: true })).out).not.toContain(
      "\u001b[",
    );
  });
});

describe("new and error mapping", () => {
  const env = () => ({ ROOKBOX_API_KEY: GOOD_KEY });

  it("creates a machine and prints how to use it", async () => {
    fake.create = {
      status: 201,
      body: { sandboxID: "sbx-new", templateID: "seed", clientID: "x", envdVersion: "0.2.0" },
    };
    const r = await cli(["new", "--name", "dev", "--timeout", "30m"], { env: env() });
    expect(r.code).toBe(0);
    expect(r.out).toContain("Machine ready: sbx-new");
    expect(r.out).toContain("rookbox shell sbx-new");
    expect(r.out).toContain("30m");
  });

  it("new --json prints the id only as JSON", async () => {
    fake.create = {
      status: 201,
      body: { sandboxID: "sbx-new", templateID: "seed", clientID: "x", envdVersion: "0.2.0" },
    };
    const r = await cli(["new", "--json"], { env: env() });
    expect(JSON.parse(r.out)).toEqual({ id: "sbx-new", name: null });
  });

  it("rejects an unreadable --timeout before calling the API", async () => {
    const r = await cli(["new", "--timeout", "soon"], { env: env() });
    expect(r.code).toBe(2);
    expect(fake.seen).toHaveLength(0);
  });

  it("429 machine limit: exit 5, count and how to free one", async () => {
    fake.sandboxes = [sandbox("a", "running"), sandbox("b", "paused"), sandbox("c", "running")];
    fake.create = {
      status: 429,
      body: { code: 429, message: "The machine limit for this account is reached." },
    };
    const r = await cli(["new"], { env: env() });
    expect(r.code).toBe(5);
    expect(r.err).toContain("already has 3 machine(s)");
    expect(r.err).toContain("rookbox kill");
  }, 30_000);

  it("503 capacity: exit 5 with a plain sentence", async () => {
    fake.create = { status: 503, body: { code: 503, message: "The beta is full right now" } };
    const r = await cli(["new"], { env: env() });
    expect(r.code).toBe(5);
    expect(r.err).toContain("beta is full");
  }, 30_000);

  it("404: exit 4", async () => {
    const r = await cli(["url", "nope", "3000"], { env: env() });
    expect(r.code).toBe(4);
    expect(r.err).toContain("Machine not found");
  });

  it("unreachable API: names the address", async () => {
    const r = await cli(["ls"], {
      env: { ROOKBOX_API_KEY: GOOD_KEY, ROOKBOX_API_URL: "http://127.0.0.1:1" },
    });
    expect(r.code).toBe(6);
    expect(r.err).toContain("http://127.0.0.1:1");
  }, 30_000);
});

describe("mapError", () => {
  const t = translator("en");
  const ctx = { t, apiUrl: "https://api.rookbox.run" };
  const named = (name: string, message: string, statusCode?: number) =>
    Object.assign(new Error(message), { name, statusCode });

  it("maps the SDK's classes", async () => {
    expect((await mapError(named("AuthenticationError", "x"), ctx)).exitCode).toBe(3);
    expect((await mapError(named("SandboxNotFoundError", "x"), ctx)).exitCode).toBe(4);
    expect((await mapError(named("RateLimitError", "Too many requests"), ctx)).message).toContain(
      "Too many requests",
    );
    expect((await mapError(named("ServiceBusyError", "x", 503), ctx)).exitCode).toBe(5);
    expect((await mapError(new Error("boom"), ctx)).message).toContain("boom");
  });

  it("falls back when the count is unknown", async () => {
    const e = await mapError(named("RateLimitError", "machine limit reached"), {
      ...ctx,
      countMachines: async () => {
        throw new Error("down");
      },
    });
    expect(e.message).toContain("Machine limit reached.");
  });
});

describe("run, kill and friends with a stand-in API", () => {
  function stub(over: Partial<Api>): (auth: unknown) => Api {
    const api: Api = {
      list: async () => [],
      create: async () => ({ id: "x" }),
      run: async () => 0,
      shell: async () => 0,
      pause: async () => {},
      resume: async () => {},
      kill: async () => {},
      host: async () => "3000-sbx.box.rookbox.run",
      ...over,
    };
    return () => api;
  }
  const env = { ROOKBOX_API_KEY: GOOD_KEY };

  it("propagates the command's exit code and streams output", async () => {
    let seen = "";
    const r = await cli(["run", "sbx1", "--", "sh", "-c", "echo hi; exit 7"], {
      env,
      api: stub({
        run: async (id, line, output) => {
          seen = `${id}|${line}`;
          output.onStdout("hi\n");
          output.onStderr("oops\n");
          return 7;
        },
      }),
    });
    expect(r.code).toBe(7);
    expect(r.out).toBe("hi\n");
    expect(r.err).toBe("oops\n");
    expect(seen).toBe("sbx1|sh -c 'echo hi; exit 7'");
  });

  it("a single argument is a whole command line", () => {
    expect(shellQuote(["ls -la | wc -l"])).toBe("ls -la | wc -l");
    expect(shellQuote(["echo", "it's"])).toBe("echo 'it'\\''s'");
  });

  it("run without a command is a usage error", async () => {
    expect((await cli(["run", "sbx1"], { env, api: stub({}) })).code).toBe(2);
  });

  it("kill without -y needs a terminal; with -y it deletes", async () => {
    let killed = "";
    const api = stub({
      kill: async (id) => {
        killed = id;
      },
    });
    expect((await cli(["kill", "sbx1"], { env, api })).code).toBe(2);
    expect(killed).toBe("");
    const r = await cli(["kill", "sbx1", "-y"], { env, api });
    expect(r.code).toBe(0);
    expect(killed).toBe("sbx1");
  });

  it("url prints the https address", async () => {
    const r = await cli(["url", "sbx1", "3000"], { env, api: stub({}) });
    expect(r.out.trim()).toBe("https://3000-sbx.box.rookbox.run");
    expect((await cli(["url", "sbx1", "99999"], { env, api: stub({}) })).code).toBe(2);
  });

  it("desktop prints the URL when no browser opens", async () => {
    const r = await cli(["desktop", "sbx1"], { env, api: stub({}) });
    expect(r.out).toContain("https://app.rookbox.run/machines/sbx1");
  });

  it("shell refuses without a terminal", async () => {
    expect((await cli(["shell", "sbx1"], { env, api: stub({}) })).code).toBe(2);
  });
});

describe("help and small helpers", () => {
  it("prints help, per-command help and the version", async () => {
    expect((await cli(["--help"])).out).toContain("rookbox run <id> -- <command...>");
    expect((await cli(["kill", "--help"])).out).toContain("Delete a machine");
    expect((await cli(["version"])).out.trim()).toBe("1.2.3");
    const unknown = await cli(["frobnicate"]);
    expect(unknown.code).toBe(2);
  });

  it("parses durations", () => {
    expect(parseDuration("30m")).toBe(1_800_000);
    expect(parseDuration("1h30m")).toBe(5_400_000);
    expect(parseDuration("90")).toBe(90_000);
    expect(parseDuration("soon")).toBeNull();
    expect(parseDuration("")).toBeNull();
  });

  it("masks keys and compares versions", () => {
    expect(maskKey("rbx_abcdefghijklmnop")).toBe("rbx_abcd...mnop");
    expect(compareVersions("0.2.0", "0.1.9")).toBeGreaterThan(0);
    expect(compareVersions("0.1.0", "0.1.0")).toBe(0);
  });
});

const EDGE_HTML =
  '<!DOCTYPE html>\n<!--[if lt IE 7]> <html class="ie6"> <![endif]-->\n<html><head><title>502 Bad Gateway</title></head><body><center><h1>502 Bad Gateway</h1></center><hr><center>edge</center></body></html>';

const edge = (status: number, method: string) => ({
  method,
  status,
  body: EDGE_HTML.replace(/502/g, String(status)),
  type: "text/html",
});

describe("transient failures", () => {
  const env = () => ({ ROOKBOX_API_KEY: GOOD_KEY });
  const calls = (method: string) => fake.seen.filter((s) => s.method === method).length;

  it("kill: a 502 HTML page then success retries and succeeds", async () => {
    fake.queue.push(edge(502, "DELETE"));
    const r = await cli(["kill", "abc", "-y"], { env: env() });
    expect(r.code).toBe(0);
    expect(r.out).toContain("abc");
    expect(r.err).not.toContain("<");
    expect(calls("DELETE")).toBe(2);
  }, 30_000);

  it("shows Retrying... only on a TTY", async () => {
    fake.queue.push(edge(502, "DELETE"));
    const quiet = await cli(["kill", "abc", "-y"], { env: env() });
    expect(quiet.err).not.toContain("Retrying");
    fake.queue.push(edge(502, "DELETE"));
    const tty = await cli(["kill", "abc", "-y"], { env: env(), stderrTty: true });
    expect(tty.err).toContain("Retrying...");
    expect(tty.out).not.toContain("Retrying");
  }, 30_000);

  it("kill: persistent 502 gives a friendly message, exit 6 and no HTML", async () => {
    for (let i = 0; i < 4; i++) fake.queue.push(edge(502, "DELETE"));
    const r = await cli(["kill", "abc", "-y"], { env: env() });
    expect(r.code).toBe(6);
    expect(r.err).toContain("temporarily unavailable");
    expect(r.err).not.toMatch(/<|DOCTYPE|Bad Gateway/);
    expect(r.out).toBe("");
    expect(calls("DELETE")).toBe(4);
  }, 30_000);

  it("pt message", async () => {
    for (let i = 0; i < 4; i++) fake.queue.push(edge(504, "DELETE"));
    const r = await cli(["kill", "abc", "-y"], { env: { ...env(), ROOKBOX_LANG: "pt" } });
    expect(r.code).toBe(6);
    expect(r.err).toContain("temporariamente indisponível");
  }, 30_000);

  it("new: a 502 is not retried and points at rookbox ls", async () => {
    fake.queue.push(edge(502, "POST"));
    const r = await cli(["new"], { env: env() });
    expect(r.code).toBe(6);
    expect(calls("POST")).toBe(1);
    expect(r.err).toContain("rookbox ls");
    expect(r.err).not.toMatch(/<|DOCTYPE/);
  }, 30_000);

  it("--debug shows the raw body, ROOKBOX_DEBUG too, and the default does not", async () => {
    for (let i = 0; i < 4; i++) fake.queue.push(edge(502, "DELETE"));
    const plain = await cli(["kill", "abc", "-y"], { env: env() });
    expect(plain.err).not.toContain("DOCTYPE");
    for (let i = 0; i < 4; i++) fake.queue.push(edge(502, "DELETE"));
    const debug = await cli(["kill", "abc", "-y", "--debug"], { env: env() });
    expect(debug.err).toContain("502");
    expect(debug.err).toContain("DOCTYPE");
    for (let i = 0; i < 4; i++) fake.queue.push(edge(502, "DELETE"));
    const viaEnv = await cli(["kill", "abc", "-y"], { env: { ...env(), ROOKBOX_DEBUG: "1" } });
    expect(viaEnv.err).toContain("DOCTYPE");
  }, 30_000);

  it("ls --json keeps stdout clean while retrying", async () => {
    fake.queue.push(edge(503, "GET"));
    fake.sandboxes = [];
    const r = await cli(["ls", "--json"], { env: env(), stderrTty: true });
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out)).toEqual([]);
  }, 30_000);

  it("a 503 with a plain API message stays a capacity error", async () => {
    fake.create = { status: 503, body: { code: 503, message: "The beta is full right now" } };
    const r = await cli(["new"], { env: env() });
    expect(r.code).toBe(5);
    expect(calls("POST")).toBe(1);
  }, 30_000);

  it("a 502 on a machine's own command is never retried", async () => {
    let runs = 0;
    const api = () =>
      ({
        run: async () => {
          runs++;
          throw Object.assign(new Error("502: <html>x</html>"), { statusCode: 502 });
        },
      }) as unknown as Api;
    const r = await cli(["run", "abc", "--", "ls"], { env: env(), api });
    expect(runs).toBe(1);
    expect(r.code).toBe(6);
  });
});

describe("mapError for upstream bodies", () => {
  const t = translator("en");
  const ctx = { t, apiUrl: "https://api.rookbox.run" };
  const html = "<html><body><h1>oops</h1></body></html>";
  const withStatus = (message: string, statusCode: number) =>
    Object.assign(new Error(message), { name: "SandboxError", statusCode });

  it("maps 502/503/504 and HTML bodies to short sentences", async () => {
    for (const status of [502, 503, 504]) {
      const e = await mapError(withStatus(`${status}: ${html}`, status), ctx);
      expect(e.exitCode).toBe(6);
      expect(e.message).not.toContain("<");
    }
    expect((await mapError(withStatus(`401: ${html}`, 401), ctx)).exitCode).toBe(3);
    expect((await mapError(withStatus(`403: ${html}`, 403), ctx)).message).not.toContain("<");
    expect((await mapError(withStatus(`404: ${html}`, 404), ctx)).exitCode).toBe(4);
    expect((await mapError(withStatus(`429: ${html}`, 429), ctx)).exitCode).toBe(5);
    expect((await mapError(withStatus(`500: ${html}`, 500), ctx)).message).not.toContain("<");
  });

  it("truncates a long unknown body", async () => {
    const e = await mapError(new Error(`418: ${"teapot ".repeat(200)}`), ctx);
    expect(e.message.length).toBeLessThan(300);
  });

  it("maps network errors", async () => {
    for (const code of ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN"]) {
      const cause = Object.assign(new Error("x"), { code });
      const e = await mapError(new TypeError("fetch failed", { cause }), ctx);
      expect(e.exitCode).toBe(6);
    }
    expect((await mapError(new TypeError("fetch failed"), ctx)).exitCode).toBe(6);
    const bun = new Error("Unable to connect. Is the computer able to access the url?");
    expect((await mapError(bun, ctx)).exitCode).toBe(6);
  });
});

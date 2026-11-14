import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
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
import { arch, platform, tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const INSTALLER = new URL("../../www/public/install", import.meta.url).pathname;
const os = platform() === "darwin" ? "darwin" : "linux";
const cpu = arch() === "arm64" ? "arm64" : "x64";
const ASSET = `rookbox-${os}-${cpu}`;
const STUB = "#!/bin/sh\necho stub-rookbox\n";
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

let server: Server;
let base = "";
/** path -> body; the fake release host. */
const files = new Map<string, string>();
const scratch: string[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    const body = files.get(req.url ?? "");
    if (body === undefined) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200).end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.close();
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

function release(version: string, options: { binary?: string; sums?: string } = {}) {
  const binary = options.binary ?? STUB;
  files.set(`/download/cli-v${version}/${ASSET}`, binary);
  files.set(
    `/download/cli-v${version}/SHA256SUMS`,
    options.sums ?? `${sha(binary)}  ${ASSET}\n${"0".repeat(64)}  rookbox-other\n`,
  );
}

/** Async on purpose: the fake release server lives in this process and must keep answering. */
async function install(env: Record<string, string> = {}, args: string[] = []) {
  const home = mkdtempSync(join(tmpdir(), "rookbox-install-"));
  scratch.push(home);
  const child = spawn("sh", [INSTALLER, ...args], {
    env: {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      HOME: home,
      SHELL: "/bin/zsh",
      ROOKBOX_RELEASES_API: `${base}/releases`,
      ROOKBOX_DOWNLOAD_BASE: `${base}/download`,
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d) => {
    stdout += d;
  });
  child.stderr.on("data", (d) => {
    stderr += d;
  });
  const status = await new Promise<number | null>((resolve) => child.on("close", resolve));
  return { status, stdout, stderr, home, bin: join(home, ".local", "bin", "rookbox") };
}

describe("install script", () => {
  it("installs the latest cli release after verifying the checksum", async () => {
    files.clear();
    // A newer non-CLI tag listed first must be ignored.
    files.set(
      "/releases",
      JSON.stringify([
        { tag_name: "v9.9.9" },
        { tag_name: "cli-v0.2.0" },
        { tag_name: "cli-v0.1.0" },
      ]),
    );
    release("0.2.0");
    const r = await install();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("Installed rookbox 0.2.0");
    expect(r.stdout).toContain("Checksum OK");
    expect(r.stdout).toContain("rookbox login");
    // Not on PATH: a zsh hint.
    expect(r.stdout).toContain(".zshrc");
    expect(readFileSync(r.bin, "utf8")).toBe(STUB);
    expect(statSync(r.bin).mode & 0o111).not.toBe(0);
    // The installer never ran what it downloaded.
    expect(r.stdout).not.toContain("stub-rookbox");
  });

  it("honors ROOKBOX_VERSION and ROOKBOX_INSTALL_DIR, and skips the PATH hint when on PATH", async () => {
    files.clear();
    release("0.1.0");
    const dir = mkdtempSync(join(tmpdir(), "rookbox-dir-"));
    scratch.push(dir);
    const r = await install({
      ROOKBOX_VERSION: "cli-v0.1.0",
      ROOKBOX_INSTALL_DIR: join(dir, "nested", "bin"),
      PATH: `${join(dir, "nested", "bin")}:${process.env.PATH}`,
    });
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(join(dir, "nested", "bin", "rookbox"))).toBe(true);
    expect(r.stdout).not.toContain("is not in your PATH");
  });

  it("aborts on a checksum mismatch and installs nothing", async () => {
    files.clear();
    release("0.3.0", { sums: `${"a".repeat(64)}  ${ASSET}\n` });
    const r = await install({ ROOKBOX_VERSION: "0.3.0" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("checksum mismatch");
    expect(existsSync(r.bin)).toBe(false);
  });

  it("aborts when SHA256SUMS has no entry for this platform", async () => {
    files.clear();
    release("0.3.0", { sums: `${"a".repeat(64)}  rookbox-other\n` });
    const r = await install({ ROOKBOX_VERSION: "0.3.0" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("no entry");
    expect(existsSync(r.bin)).toBe(false);
  });

  it("says so when there is no CLI release yet", async () => {
    files.clear();
    files.set("/releases", JSON.stringify([{ tag_name: "v1.0.0" }]));
    const r = await install();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("no CLI release");
  });

  it("refuses a version that is not a number", async () => {
    const r = await install({ ROOKBOX_VERSION: "../../etc" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("not a version number");
  });

  it("refuses an unsupported system", async () => {
    const shims = mkdtempSync(join(tmpdir(), "rookbox-shim-"));
    scratch.push(shims);
    mkdirSync(shims, { recursive: true });
    writeFileSync(join(shims, "uname"), "#!/bin/sh\necho Plan9\n", {
      mode: 0o755,
    });
    const r = await install({ PATH: `${shims}:${process.env.PATH}` });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("unsupported system: Plan9");
  });

  it("--help prints usage and exits 0", async () => {
    const r = await install({}, ["--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("ROOKBOX_INSTALL_DIR");
  });
});

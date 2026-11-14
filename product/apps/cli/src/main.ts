import { spawn } from "node:child_process";
import { runCli } from "./cli.js";
import { sdkApi } from "./sdk.js";

declare const __ROOKBOX_VERSION__: string | undefined;

/** Set at build time from package.json; a run from source says so. */
const VERSION = typeof __ROOKBOX_VERSION__ === "string" ? __ROOKBOX_VERSION__ : "0.0.0-dev";

function openUrl(url: string): Promise<boolean> {
  const command =
    process.platform === "darwin" ? "open" : process.platform === "linux" ? "xdg-open" : null;
  if (!command) return Promise.resolve(false);
  return new Promise((resolve) => {
    const child = spawn(command, [url], { stdio: "ignore", detached: true });
    child.once("error", () => resolve(false));
    child.once("spawn", () => {
      child.unref();
      resolve(true);
    });
  });
}

const code = await runCli(process.argv.slice(2), {
  env: process.env,
  version: VERSION,
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
  makeApi: sdkApi,
  openUrl,
  fetch,
});

// The SDK may keep sockets open; the exit code is already decided.
process.exit(code);

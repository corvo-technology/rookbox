import { Sandbox } from "e2b";

/**
 * The only file that touches the E2B SDK. Everything else talks to `Api`, so the commands can be
 * tested with a stand-in. The SDK is the unmodified `e2b` package; Rookbox's API speaks its
 * protocol, so none of it is reimplemented here.
 */

export type Machine = {
  id: string;
  name: string;
  state: "running" | "paused";
  template: string;
  startedAt: Date;
  endAt: Date;
  cpuCount: number;
  memoryMB: number;
};

export type Auth = { apiKey: string; apiUrl: string };

export type Output = { onStdout(data: string): void; onStderr(data: string): void };

export type TtyIo = {
  stdin: NodeJS.ReadStream;
  stdout: NodeJS.WriteStream;
};

export interface Api {
  list(): Promise<Machine[]>;
  create(options: { name?: string; timeoutMs?: number }): Promise<{ id: string }>;
  /** Runs a shell command line and resolves with its exit code. */
  run(id: string, commandLine: string, output: Output): Promise<number>;
  shell(id: string, tty: TtyIo): Promise<number>;
  pause(id: string): Promise<void>;
  resume(id: string): Promise<void>;
  kill(id: string): Promise<void>;
  /** The public host for a port, e.g. `3000-<id>.box.rookbox.run`. Throws when paused. */
  host(id: string, port: number): Promise<string>;
}

export class MachinePausedError extends Error {
  constructor(readonly id: string) {
    super(`machine ${id} is paused`);
    this.name = "MachinePausedError";
  }
}

const NAME_KEYS = ["name", "rookbox.name"];

export function machineName(metadata: Record<string, string> | undefined): string {
  for (const key of NAME_KEYS) {
    const value = metadata?.[key];
    if (value) return value;
  }
  return "";
}

export function sdkApi(auth: Auth): Api {
  // The SDK retries on its own (3 times, POST included). The CLI owns retries instead, so a create
  // is never replayed and a safe call is retried exactly once per policy.
  const conn = { apiKey: auth.apiKey, apiUrl: auth.apiUrl, retries: 0 };

  /** E2B_API_URL is what the SDK reads on its own; set it too so nothing falls back to e2b.dev. */
  process.env.E2B_API_URL = auth.apiUrl;

  async function connect(id: string): Promise<Sandbox> {
    return Sandbox.connect(id, conn);
  }

  return {
    async list() {
      const paginator = Sandbox.list({ ...conn, query: { state: ["running", "paused"] } });
      const out: Machine[] = [];
      while (paginator.hasNext) {
        for (const item of await paginator.nextItems()) {
          out.push({
            id: item.sandboxId,
            name: machineName(item.metadata),
            state: item.state,
            template: item.name ?? item.templateId,
            startedAt: item.startedAt,
            endAt: item.endAt,
            cpuCount: item.cpuCount,
            memoryMB: item.memoryMB,
          });
        }
      }
      return out;
    },

    async create({ name, timeoutMs }) {
      const sandbox = await Sandbox.create({
        ...conn,
        ...(timeoutMs ? { timeoutMs } : {}),
        ...(name ? { metadata: { name } } : {}),
      });
      return { id: sandbox.sandboxId };
    },

    async run(id, commandLine, output) {
      const sandbox = await connect(id);
      try {
        const result = await sandbox.commands.run(commandLine, {
          onStdout: output.onStdout,
          onStderr: output.onStderr,
          timeoutMs: 0,
        });
        return result.exitCode;
      } catch (error) {
        // The SDK throws on a non-zero exit; the exit code is the answer, not a failure.
        if (error instanceof Error && error.name === "CommandExitError") {
          const code = (error as { exitCode?: unknown }).exitCode;
          if (typeof code === "number") return code;
        }
        throw error;
      }
    },

    async shell(id, { stdin, stdout }) {
      const sandbox = await connect(id);
      const size = () => ({ cols: stdout.columns || 80, rows: stdout.rows || 24 });
      const handle = await sandbox.pty.create({
        ...size(),
        timeoutMs: 0,
        envs: { TERM: process.env.TERM || "xterm-256color" },
        onData: (data) => {
          stdout.write(data);
        },
      });
      // Input goes out one request at a time so keystrokes keep their order.
      let queue: Promise<unknown> = Promise.resolve();
      const onInput = (chunk: Buffer) => {
        queue = queue
          .then(() => sandbox.pty.sendInput(handle.pid, new Uint8Array(chunk)))
          .catch(() => undefined);
      };
      const onResize = () => {
        void sandbox.pty.resize(handle.pid, size()).catch(() => undefined);
      };
      stdin.setRawMode(true);
      stdin.resume();
      stdin.on("data", onInput);
      stdout.on("resize", onResize);
      try {
        const result = await handle.wait();
        return result.exitCode;
      } catch (error) {
        if (error instanceof Error && error.name === "CommandExitError") {
          const code = (error as { exitCode?: unknown }).exitCode;
          if (typeof code === "number") return code;
        }
        throw error;
      } finally {
        stdout.off("resize", onResize);
        stdin.off("data", onInput);
        stdin.setRawMode(false);
        stdin.pause();
      }
    },

    async pause(id) {
      await Sandbox.pause(id, conn);
    },

    async resume(id) {
      await connect(id);
    },

    async kill(id) {
      await Sandbox.kill(id, conn);
    },

    async host(id, port) {
      const info = await Sandbox.getInfo(id, conn);
      if (info.state === "paused") throw new MachinePausedError(id);
      const sandbox = await connect(id);
      return sandbox.getHost(port);
    },
  };
}

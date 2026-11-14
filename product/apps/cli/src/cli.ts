import { parseArgs } from "node:util";
import {
  configPath,
  DASHBOARD_URL,
  DEFAULT_API_URL,
  type Env,
  keyFromEnv,
  maskKey,
  type Resolved,
  removeConfig,
  resolveAuth,
  writeConfig,
} from "./config.js";
import { CliError, EXIT, mapError } from "./errors.js";
import { colorEnabled, formatDuration, makeStyle, parseDuration, table } from "./format.js";
import { COMMANDS, commandHelp, mainHelp } from "./help.js";
import { detectLang, type MessageKey, translator } from "./i18n.js";
import { confirm, readLine, readSecret } from "./prompt.js";
import { type Api, type Auth, MachinePausedError } from "./sdk.js";

export const REPO = "corvo-technology/rookbox";
export const INSTALL_COMMAND = "curl -fsSL https://rookbox.run/install | sh";

export type Deps = {
  env: Env;
  version: string;
  stdin: NodeJS.ReadStream;
  stdout: NodeJS.WriteStream;
  stderr: { write(s: string): unknown };
  makeApi(auth: Auth): Api;
  openUrl(url: string): Promise<boolean>;
  fetch: typeof fetch;
};

const TIMEOUT_LIMITS_MS = { min: 60_000, max: 86_400_000 } as const;

/** Quotes each word for the machine's shell. One argument is taken as a whole command line. */
export function shellQuote(args: string[]): string {
  if (args.length === 1) return args[0] ?? "";
  return args
    .map((a) => (/^[\w@%+=:,./-]+$/.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`))
    .join(" ");
}

/** Returns the process exit code. Never throws. */
export async function runCli(argv: string[], deps: Deps): Promise<number> {
  const { env } = deps;
  const lang = detectLang(env);
  const t = translator(lang);
  const outTty = Boolean(deps.stdout.isTTY);
  const style = makeStyle(colorEnabled(outTty, env));
  const path = configPath(env);
  const out = (s = "") => deps.stdout.write(`${s}\n`);

  const fail = (message: string, code: number): number => {
    deps.stderr.write(`${style.red("error:")} ${message}\n`);
    return code;
  };

  const [name, ...rest] = argv;
  if (!name || name === "help" || name === "-h" || name === "--help") {
    const topic = name === "help" ? rest[0] : undefined;
    out((topic && commandHelp(topic, lang)) || mainHelp(lang));
    return EXIT.ok;
  }
  if (name === "-v" || name === "--version" || name === "version") {
    out(deps.version);
    return EXIT.ok;
  }
  if (!(name in COMMANDS)) {
    return fail(t("err.unknownCommand", { name }), EXIT.usage);
  }
  if (rest.includes("-h") || rest.includes("--help")) {
    out(commandHelp(name, lang) ?? mainHelp(lang));
    return EXIT.ok;
  }

  let apiForErrors: Api | null = null;
  let apiUrl = DEFAULT_API_URL;

  try {
    return await dispatch(name, rest);
  } catch (error) {
    const mapped = await mapError(error, {
      t,
      apiUrl,
      countMachines: apiForErrors
        ? async () => (await (apiForErrors as Api).list()).length
        : undefined,
    });
    return fail(mapped.message, mapped.exitCode);
  }

  function parse<T extends Record<string, { type: "boolean" | "string"; short?: string }>>(
    args: string[],
    options: T,
    positionals = 1,
  ) {
    try {
      const parsed = parseArgs({ args, options, allowPositionals: true, strict: true });
      if (parsed.positionals.length > positionals) {
        throw new Error(`Unexpected argument: ${parsed.positionals[positionals]}`);
      }
      return parsed;
    } catch (error) {
      throw new CliError(
        t("err.badOption", { message: error instanceof Error ? error.message : String(error) }),
        EXIT.usage,
      );
    }
  }

  function auth(flagKey?: string): { resolved: Resolved & { apiKey: string }; api: Api } {
    const resolved = resolveAuth(env, path, flagKey);
    apiUrl = resolved.apiUrl;
    if (!resolved.apiKey) throw new CliError(t("err.noKey"), EXIT.auth);
    const credentials = { apiKey: resolved.apiKey, apiUrl: resolved.apiUrl };
    const api = deps.makeApi(credentials);
    apiForErrors = api;
    return { resolved: { ...resolved, apiKey: resolved.apiKey }, api };
  }

  function machineId(positionals: string[]): string {
    const id = positionals[0];
    if (!id) throw new CliError(t("err.missingId"), EXIT.usage);
    return id;
  }

  async function dispatch(command: string, args: string[]): Promise<number> {
    switch (command) {
      case "login": {
        const { values } = parse(args, { key: { type: "string" } }, 0);
        let key = values.key?.trim();
        if (!key) {
          if (deps.stdin.isTTY) {
            out(t("login.created", { url: `${DASHBOARD_URL}/settings` }));
            try {
              key = await readSecret(deps.stdin, deps.stdout, t("login.prompt"));
            } catch {
              return fail(t("login.empty"), EXIT.usage);
            }
          } else {
            key = (await readLine(deps.stdin)) || keyFromEnv(env)?.apiKey || "";
          }
        }
        if (!key) return fail(t("login.empty"), EXIT.usage);
        apiUrl = resolveAuth(env, path).apiUrl;
        const api = deps.makeApi({ apiKey: key, apiUrl });
        apiForErrors = api;
        const machines = await api.list();
        writeConfig(path, { apiKey: key, ...(apiUrl !== DEFAULT_API_URL ? { apiUrl } : {}) });
        out(style.green(t("login.ok", { n: machines.length })));
        out(style.dim(t("login.saved", { path })));
        out(t("login.next"));
        return EXIT.ok;
      }

      case "logout": {
        out(removeConfig(path) ? t("logout.ok", { path }) : t("logout.none"));
        return EXIT.ok;
      }

      case "whoami": {
        const resolved = resolveAuth(env, path);
        if (!resolved.apiKey) return fail(t("whoami.none"), EXIT.auth);
        const { api } = auth();
        const machines = await api.list();
        out(t("whoami.key", { key: maskKey(resolved.apiKey) }));
        out(
          t("whoami.source", {
            source: resolved.source === "config" ? path : `$${resolved.source}`,
          }),
        );
        out(t("whoami.api", { url: resolved.apiUrl }));
        out(t("whoami.machines", { n: machines.length }));
        return EXIT.ok;
      }

      case "new": {
        const { values } = parse(
          args,
          { name: { type: "string" }, timeout: { type: "string" }, json: { type: "boolean" } },
          0,
        );
        let timeoutMs: number | undefined;
        if (values.timeout !== undefined) {
          const parsed = parseDuration(values.timeout);
          if (parsed === null || parsed < TIMEOUT_LIMITS_MS.min || parsed > TIMEOUT_LIMITS_MS.max) {
            return fail(t("err.badTimeout", { value: values.timeout }), EXIT.usage);
          }
          timeoutMs = parsed;
        }
        const { api } = auth();
        if (!values.json) out(style.dim(t("new.creating")));
        const created = await api.create({ name: values.name, timeoutMs });
        if (values.json) {
          out(JSON.stringify({ id: created.id, name: values.name ?? null }));
          return EXIT.ok;
        }
        out(style.green(t("new.created", { id: created.id })));
        out(t("new.use", { id: created.id, timeout: formatDuration(timeoutMs ?? 1_800_000) }));
        return EXIT.ok;
      }

      case "ls": {
        const { values } = parse(args, { json: { type: "boolean" } }, 0);
        const { api } = auth();
        const machines = await api.list();
        if (values.json) {
          out(
            JSON.stringify(
              machines.map((m) => ({
                id: m.id,
                name: m.name || null,
                state: m.state,
                template: m.template,
                startedAt: m.startedAt.toISOString(),
                endAt: m.endAt.toISOString(),
                cpuCount: m.cpuCount,
                memoryMB: m.memoryMB,
              })),
              null,
              2,
            ),
          );
          return EXIT.ok;
        }
        if (machines.length === 0) {
          out(t("ls.empty"));
          return EXIT.ok;
        }
        const now = Date.now();
        const rows = [
          [t("ls.id"), t("ls.name"), t("ls.state"), t("ls.age")],
          ...machines.map((m) => [
            m.id,
            m.name || "-",
            t(`state.${m.state}` as MessageKey),
            formatDuration(now - m.startedAt.getTime()),
          ]),
        ];
        out(
          table(rows, (column, row, cell) => {
            if (row === 0) return style.bold(cell);
            if (column === 2)
              return cell === t("state.running") ? style.green(cell) : style.yellow(cell);
            return cell;
          }),
        );
        return EXIT.ok;
      }

      case "run": {
        const id = rest[0];
        if (!id || id.startsWith("-")) return fail(t("run.usage"), EXIT.usage);
        const command = rest.slice(1);
        if (command[0] === "--") command.shift();
        if (command.length === 0) return fail(t("run.usage"), EXIT.usage);
        const { api } = auth();
        return await api.run(id, shellQuote(command), {
          onStdout: (data) => void deps.stdout.write(data),
          onStderr: (data) => void deps.stderr.write(data),
        });
      }

      case "shell": {
        const { positionals } = parse(args, {});
        const id = machineId(positionals);
        if (!deps.stdin.isTTY || !deps.stdout.isTTY) return fail(t("shell.notTty"), EXIT.usage);
        const { api } = auth();
        deps.stderr.write(`${style.dim(t("shell.hint", { id }))}\n`);
        return await api.shell(id, { stdin: deps.stdin, stdout: deps.stdout });
      }

      case "pause":
      case "resume": {
        const { positionals } = parse(args, {});
        const id = machineId(positionals);
        const { api } = auth();
        if (command === "pause") await api.pause(id);
        else await api.resume(id);
        out(t(command === "pause" ? "pause.ok" : "resume.ok", { id }));
        return EXIT.ok;
      }

      case "kill": {
        const { positionals, values } = parse(args, { yes: { type: "boolean", short: "y" } });
        const id = machineId(positionals);
        const { api } = auth();
        if (!values.yes) {
          if (!deps.stdin.isTTY) return fail(t("kill.noTty"), EXIT.usage);
          if (!(await confirm(deps.stdin, deps.stdout, t("kill.confirm", { id })))) {
            out(t("kill.aborted"));
            return EXIT.failure;
          }
        }
        await api.kill(id);
        out(t("kill.ok", { id }));
        return EXIT.ok;
      }

      case "url": {
        const { positionals } = parse(args, {}, 2);
        const id = machineId(positionals);
        const portText = positionals[1];
        if (!portText) return fail(t("err.missingPort"), EXIT.usage);
        const port = Number(portText);
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
          return fail(t("err.badPort"), EXIT.usage);
        }
        const { api } = auth();
        try {
          out(`https://${await api.host(id, port)}`);
        } catch (error) {
          if (error instanceof MachinePausedError)
            return fail(t("url.paused", { id }), EXIT.failure);
          throw error;
        }
        return EXIT.ok;
      }

      case "desktop": {
        const { positionals } = parse(args, {});
        const id = machineId(positionals);
        const url = `${DASHBOARD_URL}/machines/${encodeURIComponent(id)}`;
        if (await deps.openUrl(url)) out(t("desktop.opening", { url }));
        else out(t("desktop.manual", { url }));
        return EXIT.ok;
      }

      case "update": {
        out(style.dim(t("update.checking")));
        const latest = await latestRelease(deps.fetch);
        if (latest && compareVersions(latest, deps.version) <= 0) {
          out(t("update.current", { version: deps.version }));
          return EXIT.ok;
        }
        if (latest) out(t("update.available", { version: deps.version, latest }));
        else out(t("update.noRelease"));
        out(t("update.hint", { cmd: INSTALL_COMMAND }));
        return EXIT.ok;
      }

      default:
        return fail(t("err.unknownCommand", { name: command }), EXIT.usage);
    }
  }
}

/** The newest `cli-vX.Y.Z` release that is neither a draft nor a prerelease, or null. */
export async function latestRelease(fetchFn: typeof fetch): Promise<string | null> {
  try {
    const response = await fetchFn(`https://api.github.com/repos/${REPO}/releases?per_page=30`, {
      headers: { accept: "application/vnd.github+json", "user-agent": "rookbox-cli" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const releases = (await response.json()) as Array<{
      tag_name?: string;
      draft?: boolean;
      prerelease?: boolean;
    }>;
    for (const release of releases) {
      const match = /^cli-v(\d+\.\d+\.\d+)$/.exec(release.tag_name ?? "");
      if (match && !release.draft && !release.prerelease) return match[1] ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

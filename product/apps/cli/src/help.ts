import type { Lang } from "./i18n.js";

type Entry = { usage: string; en: string; pt: string };

export const COMMANDS: Record<string, Entry> = {
  login: {
    usage: "login [--key <key>]",
    en: "Save your API key (asked with hidden input; checked against the API).",
    pt: "Salva sua chave de API (pedida com entrada oculta; conferida na API).",
  },
  logout: { usage: "logout", en: "Forget the saved key.", pt: "Esquece a chave salva." },
  whoami: {
    usage: "whoami",
    en: "Show which key and API are in use.",
    pt: "Mostra qual chave e qual API estão em uso.",
  },
  new: {
    usage: "new [--name <name>] [--timeout 30m] [--json]",
    en: "Create a machine. --timeout is the idle time before it pauses (1m to 24h).",
    pt: "Cria uma máquina. --timeout é o tempo parada antes de pausar (1m a 24h).",
  },
  ls: {
    usage: "ls [--json]",
    en: "List your machines.",
    pt: "Lista suas máquinas.",
  },
  run: {
    usage: "run <id> -- <command...>",
    en: "Run a command in a machine, streaming its output. Exits with the command's exit code.",
    pt: "Roda um comando numa máquina, mostrando a saída. Sai com o código do comando.",
  },
  shell: {
    usage: "shell <id>",
    en: "Open an interactive terminal in a machine. Ctrl-D leaves.",
    pt: "Abre um terminal interativo numa máquina. Ctrl-D sai.",
  },
  pause: {
    usage: "pause <id>",
    en: "Pause a machine (memory and disk are kept).",
    pt: "Pausa uma máquina (memória e disco são mantidos).",
  },
  resume: {
    usage: "resume <id>",
    en: "Bring a paused machine back.",
    pt: "Traz de volta uma máquina pausada.",
  },
  kill: {
    usage: "kill <id> [-y]",
    en: "Delete a machine. Asks first unless -y is given.",
    pt: "Apaga uma máquina. Pergunta antes, a menos que use -y.",
  },
  url: {
    usage: "url <id> <port>",
    en: "Print the public https URL for a port of a running machine.",
    pt: "Mostra a URL https pública de uma porta de uma máquina ligada.",
  },
  desktop: {
    usage: "desktop <id>",
    en: "Open the machine's desktop in your browser.",
    pt: "Abre o desktop da máquina no navegador.",
  },
  update: {
    usage: "update",
    en: "Check for a newer release and show how to install it.",
    pt: "Procura uma versão mais nova e mostra como instalar.",
  },
  version: { usage: "version", en: "Print the version.", pt: "Mostra a versão." },
};

const TEXT = {
  en: {
    intro: "Rookbox: on-demand machines for agents, from your terminal.",
    usage: "Usage",
    commands: "Commands",
    options: "Options",
    help: "Show help (also: rookbox <command> --help)",
    env: "Environment",
    exits: "Exit codes",
    exitsBody:
      "0 ok, 1 failure, 2 usage, 3 bad key, 4 not found, 5 limit or no capacity.\n`run` exits with the command's own code.",
    envBody:
      "ROOKBOX_API_KEY / E2B_API_KEY  use this key instead of the saved one\nROOKBOX_API_URL                API address (default https://api.rookbox.run)\nROOKBOX_LANG                   en or pt (default: from LANG)\nNO_COLOR                       turn colors off",
    start: "Start",
  },
  pt: {
    intro: "Rookbox: máquinas sob demanda para agentes, direto do terminal.",
    usage: "Uso",
    commands: "Comandos",
    options: "Opções",
    help: "Mostra a ajuda (também: rookbox <comando> --help)",
    env: "Ambiente",
    exits: "Códigos de saída",
    exitsBody:
      "0 ok, 1 falha, 2 uso, 3 chave inválida, 4 não encontrado, 5 limite ou sem capacidade.\n`run` sai com o código do próprio comando.",
    envBody:
      "ROOKBOX_API_KEY / E2B_API_KEY  usa esta chave no lugar da salva\nROOKBOX_API_URL                endereço da API (padrão https://api.rookbox.run)\nROOKBOX_LANG                   en ou pt (padrão: vem de LANG)\nNO_COLOR                       desliga as cores",
    start: "Comece",
  },
} as const;

export function mainHelp(lang: Lang): string {
  const x = TEXT[lang];
  const rows = Object.values(COMMANDS).flatMap((c) => [`  rookbox ${c.usage}`, `      ${c[lang]}`]);
  return [
    x.intro,
    "",
    `${x.start}:`,
    "  rookbox login && rookbox new",
    "",
    `${x.usage}: rookbox <command> [options]`,
    "",
    `${x.commands}:`,
    ...rows,
    "",
    `${x.options}:`,
    `  -h, --help     ${x.help}`,
    "  -v, --version  rookbox version",
    "  --json         ls, new: machine-readable output",
    "",
    `${x.env}:`,
    ...x.envBody.split("\n").map((l) => `  ${l}`),
    "",
    `${x.exits}:`,
    ...x.exitsBody.split("\n").map((l) => `  ${l}`),
  ].join("\n");
}

export function commandHelp(name: string, lang: Lang): string | null {
  const entry = COMMANDS[name];
  if (!entry) return null;
  return `${TEXT[lang].usage}: rookbox ${entry.usage}\n\n${entry[lang]}`;
}

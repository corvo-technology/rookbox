export type Lang = "en" | "pt";

/** `ROOKBOX_LANG` wins over `LANG`; anything that is not Portuguese is English. */
export function detectLang(env: Record<string, string | undefined>): Lang {
  const raw = (env.ROOKBOX_LANG ?? env.LC_ALL ?? env.LC_MESSAGES ?? env.LANG ?? "").toLowerCase();
  return raw.startsWith("pt") ? "pt" : "en";
}

const en = {
  "login.prompt": "Rookbox API key (rbx_...): ",
  "login.created": "Create one at {url}",
  "login.empty": "No key given.",
  "login.noTty": "No terminal to read the key from. Use --key or set ROOKBOX_API_KEY.",
  "login.ok": "Logged in. {n} machine(s) on this account.",
  "login.saved": "Key saved to {path}",
  "login.next": "Next: rookbox new",
  "logout.ok": "Logged out. Removed {path}",
  "logout.none": "Nothing to remove: no saved key.",
  "whoami.key": "Key:      {key}",
  "whoami.source": "Source:   {source}",
  "whoami.api": "API:      {url}",
  "whoami.machines": "Machines: {n}",
  "whoami.none": "Not logged in. Run: rookbox login",
  "new.creating": "Creating a machine...",
  "new.created": "Machine ready: {id}",
  "new.use":
    "Use it:\n  rookbox shell {id}\n  rookbox run {id} -- uname -a\n  rookbox desktop {id}\nIdle machines are deleted after {timeout}.",
  "ls.empty": "No machines yet. Create one with: rookbox new",
  "ls.id": "ID",
  "ls.name": "NAME",
  "ls.state": "STATE",
  "ls.age": "AGE",
  "ls.template": "TEMPLATE",
  "state.running": "running",
  "state.paused": "paused",
  "run.usage": "Usage: rookbox run <id> -- <command...>",
  "shell.notTty": "rookbox shell needs an interactive terminal. Use `rookbox run` in scripts.",
  "shell.hint": "Connected to {id}. Press Ctrl-D to leave.",
  "pause.ok": "Paused {id}.",
  "resume.ok": "Resumed {id}.",
  "kill.confirm": "Delete machine {id}? Its disk is lost. [y/N] ",
  "kill.ok": "Deleted {id}.",
  "kill.aborted": "Aborted.",
  "kill.noTty": "Not an interactive terminal. Pass -y to delete without asking.",
  "url.paused": "Machine {id} is paused. Run `rookbox resume {id}` first.",
  "desktop.opening": "Opening {url}",
  "desktop.manual": "Could not open a browser. Open this address:\n{url}",
  "update.hint": "To update, re-run the installer. It replaces this binary:\n  {cmd}",
  "update.checking": "Checking the latest release...",
  "update.current": "rookbox {version} is the latest release.",
  "update.available": "rookbox {version} is installed; {latest} is available.",
  "update.noRelease": "Could not read the latest release.",
  "err.noKey": "Not logged in. Run `rookbox login`, or set ROOKBOX_API_KEY.",
  "err.401":
    "That API key was not accepted. Check it, or make a new one in the dashboard, then run `rookbox login`.",
  "err.404": "Machine not found. List yours with `rookbox ls`.",
  "err.429.limit":
    "Machine limit reached: this account already has {n} machine(s). Free one with `rookbox kill <id>`, then try again.",
  "err.429.limitUnknown":
    "Machine limit reached. Free one with `rookbox kill <id>` (see `rookbox ls`), then try again.",
  "err.429.rate": "Too many requests. Wait a moment and try again.",
  "err.503": "No capacity right now: the beta is full. Try again in a few minutes.",
  "err.network": "Could not reach {url}. Check your connection, or try again in a few seconds.",
  "err.unavailable": "The Rookbox service is temporarily unavailable. Try again in a few seconds.",
  "err.maybeCreated":
    "The machine may have been created anyway: run `rookbox ls` before trying again.",
  "err.server": "The Rookbox service returned an error ({status}). Try again in a few seconds.",
  "err.debug": "details: {detail}",
  "retry.waiting": "Retrying...",
  "err.generic": "Something went wrong: {message}",
  "err.unknownCommand": "Unknown command: {name}. Run `rookbox --help`.",
  "err.missingId": "Missing machine id. List yours with `rookbox ls`.",
  "err.missingPort": "Usage: rookbox url <id> <port>",
  "err.badPort": "Port must be a number from 1 to 65535.",
  "err.badTimeout": "Could not read --timeout {value}. Examples: 90s, 30m, 2h.",
  "err.badOption": "{message}",
} as const;

export type MessageKey = keyof typeof en;

const pt: Record<MessageKey, string> = {
  "login.prompt": "Chave de API do Rookbox (rbx_...): ",
  "login.created": "Crie uma em {url}",
  "login.empty": "Nenhuma chave informada.",
  "login.noTty": "Sem terminal para ler a chave. Use --key ou defina ROOKBOX_API_KEY.",
  "login.ok": "Login feito. {n} máquina(s) nesta conta.",
  "login.saved": "Chave salva em {path}",
  "login.next": "Próximo passo: rookbox new",
  "logout.ok": "Sessão encerrada. Removi {path}",
  "logout.none": "Nada a remover: não há chave salva.",
  "whoami.key": "Chave:    {key}",
  "whoami.source": "Origem:   {source}",
  "whoami.api": "API:      {url}",
  "whoami.machines": "Máquinas: {n}",
  "whoami.none": "Você não está logado. Rode: rookbox login",
  "new.creating": "Criando uma máquina...",
  "new.created": "Máquina pronta: {id}",
  "new.use":
    "Para usar:\n  rookbox shell {id}\n  rookbox run {id} -- uname -a\n  rookbox desktop {id}\nMáquinas ociosas são apagadas depois de {timeout}.",
  "ls.empty": "Nenhuma máquina ainda. Crie uma com: rookbox new",
  "ls.id": "ID",
  "ls.name": "NOME",
  "ls.state": "ESTADO",
  "ls.age": "IDADE",
  "ls.template": "MODELO",
  "state.running": "ligada",
  "state.paused": "pausada",
  "run.usage": "Uso: rookbox run <id> -- <comando...>",
  "shell.notTty": "rookbox shell precisa de um terminal interativo. Em scripts, use `rookbox run`.",
  "shell.hint": "Conectado a {id}. Ctrl-D para sair.",
  "pause.ok": "{id} pausada.",
  "resume.ok": "{id} retomada.",
  "kill.confirm": "Apagar a máquina {id}? O disco será perdido. [s/N] ",
  "kill.ok": "{id} apagada.",
  "kill.aborted": "Cancelado.",
  "kill.noTty": "Terminal não interativo. Use -y para apagar sem perguntar.",
  "url.paused": "A máquina {id} está pausada. Rode `rookbox resume {id}` antes.",
  "desktop.opening": "Abrindo {url}",
  "desktop.manual": "Não consegui abrir o navegador. Abra este endereço:\n{url}",
  "update.hint": "Para atualizar, rode o instalador de novo. Ele troca este binário:\n  {cmd}",
  "update.checking": "Procurando a versão mais recente...",
  "update.current": "rookbox {version} é a versão mais recente.",
  "update.available": "rookbox {version} instalado; {latest} disponível.",
  "update.noRelease": "Não consegui ler a versão mais recente.",
  "err.noKey": "Você não está logado. Rode `rookbox login` ou defina ROOKBOX_API_KEY.",
  "err.401":
    "Essa chave de API não foi aceita. Confira, ou crie outra no painel e rode `rookbox login`.",
  "err.404": "Máquina não encontrada. Veja as suas com `rookbox ls`.",
  "err.429.limit":
    "Limite de máquinas atingido: esta conta já tem {n} máquina(s). Libere uma com `rookbox kill <id>` e tente de novo.",
  "err.429.limitUnknown":
    "Limite de máquinas atingido. Libere uma com `rookbox kill <id>` (veja `rookbox ls`) e tente de novo.",
  "err.429.rate": "Muitas requisições. Espere um momento e tente de novo.",
  "err.503": "Sem capacidade agora: o beta está cheio. Tente de novo em alguns minutos.",
  "err.network":
    "Não consegui falar com {url}. Confira sua conexão ou tente de novo em alguns segundos.",
  "err.unavailable":
    "O serviço do Rookbox está temporariamente indisponível. Tente de novo em alguns segundos.",
  "err.maybeCreated":
    "A máquina pode ter sido criada mesmo assim: rode `rookbox ls` antes de tentar de novo.",
  "err.server":
    "O serviço do Rookbox devolveu um erro ({status}). Tente de novo em alguns segundos.",
  "err.debug": "detalhes: {detail}",
  "retry.waiting": "Tentando de novo...",
  "err.generic": "Algo deu errado: {message}",
  "err.unknownCommand": "Comando desconhecido: {name}. Rode `rookbox --help`.",
  "err.missingId": "Falta o id da máquina. Veja as suas com `rookbox ls`.",
  "err.missingPort": "Uso: rookbox url <id> <porta>",
  "err.badPort": "A porta deve ser um número de 1 a 65535.",
  "err.badTimeout": "Não entendi --timeout {value}. Exemplos: 90s, 30m, 2h.",
  "err.badOption": "{message}",
};

const catalogs: Record<Lang, Record<MessageKey, string>> = { en, pt };

export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function translator(lang: Lang): Translate {
  return (key, vars = {}) =>
    catalogs[lang][key].replace(/\{(\w+)\}/g, (_, name: string) =>
      String(vars[name] ?? `{${name}}`),
    );
}

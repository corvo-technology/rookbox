import type { Copy } from "./types";

// TODO(content): the quickstart (install, env vars, first machine, first command, open a port) was
// removed from the landing and is meant to live in the docs. Decide the docs URL, then link it from
// the header. The old component is in git history (apps/www/src/components/Quickstart.tsx).

export const pt: Copy = {
  meta: {
    title: "Rookbox: um computador para cada agente",
    description:
      "Máquinas Linux sob demanda para agentes de IA, prontas em cerca de 2 segundos. Use o SDK da E2B que você já conhece.",
    skipToContent: "Pular para o conteúdo",
    ogAlt: "Rookbox: um computador para cada agente",
  },
  nav: {
    primary: "Principal",
    home: "Início do Rookbox",
    languages: "Idiomas",
    demo: "Demo",
    e2b: "E2B",
    pix: "Pix",
    join: "Entrar na lista",
    signIn: "Entrar",
  },
  hero: {
    title: "Um computador para cada agente.",
    lead: "Máquinas Linux sob demanda, prontas em cerca de 2 segundos. Use o SDK da E2B que você já conhece.",
  },
  visual: {
    label: "Um castelo em pixels que se acende conforme você digita o e-mail",
    booting: "iniciando",
    waiting: "aguardando seu e-mail",
    ready: "pronto",
  },
  demo: {
    title: "Crie, execute, suspenda, retome.",
    languageLabel: "Linguagem",
    terminalLabel: "Sessão de exemplo",
    steps: ["Criar", "Executar", "Expor uma porta", "Suspender", "Retomar"],
    facts: ["Kernel próprio", "~2 s para iniciar", "~1 s para retomar"],
    session: {
      ready: "pronta em cerca de 2 s",
      pause: "pause da E2B = suspender",
      saved: "memória mantida, processamento liberado",
      resumed: "retomada em cerca de 1 s",
    },
  },
  e2b: {
    title: "Já usa a E2B? Troque duas variáveis.",
    languageLabel: "Linguagem",
    before: "Antes",
    after: "Com o Rookbox",
    code: "O seu código continua igual",
  },
  brazil: {
    // TODO(content): confirm before launch: the legal entity that bills in BRL and issues the nota
    // fiscal, and whether Pix is the only BRL method at launch.
    // TODO(content): the IOF wording ("sem cartão internacional" is all we claim). Confirm with an
    // accountant before ever stating that IOF does not apply.
    // TODO(content): the Portuguese support channel and hours, before promising it publicly.
    title: "Pague em reais. Com Pix.",
    lead: "Cobrança por segundo, em reais, sem cartão internacional. Suporte em português.",
    badge: "Pix",
  },
  cta: { title: "Entre na lista." },
  ui: {
    copy: "Copiar",
    copied: "Copiado",
    memory: "memória mantida",
    fork: "fork",
    steps: "Etapas",
  },
  waitlist: {
    label: "Endereço de e-mail",
    placeholder: "voce@empresa.com",
    submit: "Entrar na lista",
    sending: "Enviando",
    ok: "Você está na lista. Avisamos por e-mail.",
    errorInvalid: "Isso não parece um e-mail. Confira e tente de novo.",
    errorRate: "Tentativas demais desta conexão. Tente de novo em alguns minutos.",
    errorGeneric: "Não conseguimos falar com o servidor. Seu e-mail não foi salvo. Tente de novo.",
  },
  footer: { tagline: "Máquinas para agentes de IA." },
};

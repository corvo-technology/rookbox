import type { Copy } from "./types";

export const pt: Copy = {
  meta: {
    title: "Rookbox: um computador para cada agente",
    description:
      "Máquinas Linux sob demanda para agentes de IA. Cada uma é uma microVM Firecracker com kernel próprio, inicia em cerca de 2 segundos e funciona com o seu código do SDK da E2B.",
    skipToContent: "Pular para o conteúdo",
    ogAlt: "Rookbox: um computador para cada agente",
  },
  nav: {
    primary: "Principal",
    home: "Início do Rookbox",
    menu: "Menu",
    product: "Produto",
    lifecycle: "Ciclo de vida",
    e2b: "Compatível com E2B",
    docs: "Documentação",
    getStarted: "Começar",
  },
  hero: {
    eyebrow: "Máquinas para agentes de IA",
    title: "Dê a cada agente o próprio computador.",
    lead: "O Rookbox dá aos seus agentes máquinas Linux sob demanda. Cada uma é uma microVM Firecracker com kernel próprio e funciona com o SDK da E2B que você talvez já use.",
    start: "Abrir o painel",
    watch: "Ver como funciona",
    facts: "Inicia em cerca de 2 s · Retoma em cerca de 1 s",
  },
  demo: {
    eyebrow: "Como é na prática",
    title: "Criar, executar, expor, suspender.",
    lead: "Poucas chamadas cobrem a maior parte do dia de um agente. Escolha a linguagem e veja uma sessão.",
    languageLabel: "Linguagem",
    terminalLabel: "Sessão de exemplo",
    steps: [
      { label: "Criar", note: "Uma microVM com kernel próprio" },
      { label: "Executar", note: "Rode um comando lá dentro" },
      { label: "Expor uma porta", note: "Uma URL pública para a porta" },
      { label: "Suspender", note: "Mantém a memória, libera o processamento" },
    ],
    note: "Uma ilustração do SDK da E2B apontado para o Rookbox. A saída está simplificada.",
    session: {
      ready: "pronta em cerca de 2 s",
      pause: "pause da E2B = suspender",
      saved: "memória mantida, retoma em cerca de 1 s",
    },
  },
  features: {
    eyebrow: "O que você recebe",
    title: "Uma máquina de verdade, não um contêiner compartilhado.",
    items: [
      {
        title: "Kernel e raiz próprios",
        body: "Cada máquina é uma microVM Firecracker. Seu agente pode instalar pacotes, rodar serviços e quebrar coisas sem afetar as vizinhas.",
      },
      {
        title: "Suspender mantém a memória",
        body: "Deixe a máquina em espera enquanto o agente aguarda. Ao retomar, a memória e os processos em execução voltam em cerca de um segundo.",
      },
      {
        title: "Fork de um ambiente pronto",
        body: "Copie o disco para uma nova máquina e teste outra abordagem em paralelo. O fork copia o disco, não a memória.",
      },
      {
        title: "Uma URL pública por porta",
        body: "Exponha uma porta e acesse em `<porta>-<id-da-sandbox>.box.rookbox.run`. Visualize um servidor de desenvolvimento ou compartilhe um link.",
      },
      {
        title: "Comandos e arquivos",
        body: "Execute comandos, acompanhe a saída, leia e grave arquivos. São as mesmas chamadas que o seu código E2B já faz.",
      },
      {
        title: "Um desktop no navegador",
        body: "Um desktop completo com Chromium, que você vê no navegador por VNC. Útil para agentes que precisam enxergar uma tela.",
      },
    ],
  },
  e2b: {
    eyebrow: "Compatível com E2B",
    title: "Já usa a E2B? Mude uma linha.",
    lead: "O Rookbox fala o protocolo da E2B. Se você já usa o SDK da E2B, aponte-o para o Rookbox e o seu código continua funcionando.",
    languageLabel: "Linguagem",
    before: "Antes",
    after: "Com o Rookbox",
    envLine: "Prefere variáveis de ambiente? Defina `E2B_DOMAIN` e `E2B_API_KEY`.",
    keyLine: "Chave de API:",
    keyLink: "peça acesso no painel",
  },
  lifecycle: {
    eyebrow: "Ciclo de vida",
    title: "Quatro movimentos, todos medidos em segundos.",
    lead: "Os tempos são típicos, não garantidos.",
    cards: [
      {
        value: "~2 s",
        title: "Iniciar",
        body: "Uma nova microVM a partir de um template: kernel e disco raiz próprios.",
      },
      {
        value: "Memória mantida",
        title: "Suspender",
        body: "Grava a memória e o estado e libera o worker.",
      },
      {
        value: "~1 s",
        title: "Retomar",
        body: "Continue exatamente de onde o agente parou, com os processos.",
      },
      {
        value: "Só o disco",
        title: "Fork",
        body: "Copia o disco para uma máquina irmã. A memória não é copiada.",
      },
    ],
  },
  cta: {
    eyebrow: "Preços: acesso antecipado",
    title: "Cobrança por segundo. Preços em breve.",
    lead: "O Rookbox está em acesso antecipado. A cobrança será por segundo e os preços ainda não foram publicados. Abra o painel para começar.",
    start: "Começar",
    docs: "Ler a documentação",
  },
  footer: {
    languages: "Idiomas",
    nav: "Site",
    tagline: "Máquinas para agentes de IA.",
    builtOn: "Construído sobre o projeto de código aberto",
    spaceName: "SPACE",
    license: "(Apache-2.0).",
    product: "Produto",
    howItWorks: "Como funciona",
    lifecycle: "Ciclo de vida",
    dashboard: "Painel",
    developers: "Desenvolvedores",
    docs: "Documentação",
    github: "GitHub",
  },
};

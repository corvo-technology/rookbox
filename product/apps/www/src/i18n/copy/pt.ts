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
    access: "Acesso",
    e2b: "Compatível com E2B",
    brazil: "Pagamento em reais",
    quickstart: "Primeiros passos",
    dashboard: "Abrir o painel",
  },
  hero: {
    eyebrow: "Lista de espera, só por convite",
    title: "Dê a cada agente o próprio computador.",
    lead: "O Rookbox dá aos seus agentes máquinas Linux sob demanda. Cada uma é uma microVM Firecracker com kernel próprio e funciona com o SDK da E2B que você talvez já use.",
    facts: ["Kernel próprio", "Inicia em cerca de 2 s", "Retoma em cerca de 1 s"],
  },
  visual: {
    label:
      "Sessão de exemplo: o SDK da E2B apontado para o Rookbox, e o convite que você está pedindo",
    caption: "O SDK da E2B apontado para o Rookbox. A saída está simplificada.",
    invite: "convite para",
    states: {
      idle: "digite seu email para entrar na fila",
      typed: "pronto para entrar na fila",
      sending: "enviando",
      done: "na lista. o convite chega por email",
    },
  },
  access: {
    title: "Como o acesso funciona.",
    steps: [
      {
        title: "Entre na lista",
        body: "Só o seu email, nada mais. Você recebe uma confirmação na hora.",
      },
      {
        title: "Receba o convite por email",
        body: "Liberamos o acesso em lotes pequenos para as máquinas continuarem rápidas. Não prometemos data: avisamos quando for a sua vez.",
      },
      {
        title: "Crie a sua primeira máquina",
        body: "O convite traz o acesso ao painel. Crie uma máquina ali ou aponte o SDK da E2B para o Rookbox.",
      },
    ],
  },
  brazil: {
    // TODO(content): confirm with the owner before launch: the legal entity that bills (BRL, nota
    // fiscal), whether Pix is the only BRL method at launch, and the exact IOF wording with an
    // accountant. This block is labelled as planned and must not read as live until billing ships.
    eyebrow: "Previsto para o lançamento da cobrança",
    title: "Feito para quem paga em reais.",
    lead: "A cobrança ainda não está no ar. Ela está sendo desenhada para quem está no Brasil, sem cartão internacional no caminho.",
    badge: "Pix",
    status: "Previsto, ainda não disponível",
    rows: [
      { label: "Pagamento", value: "Pix. Sem cartão internacional." },
      {
        label: "Moeda",
        value:
          "Reais (BRL). Pagando em reais por Pix, não há compra internacional no cartão, então não entra IOF.",
      },
      { label: "Medição", value: "Por segundo de uso." },
      // TODO(content): confirm the support channel and hours before promising Portuguese support.
      { label: "Suporte", value: "Em português, e o convite também chega em português." },
    ],
    // TODO(content): decide whether and when prices are published in reais. No price, discount or
    // founder perk is promised here.
    note: "Os preços ainda não foram publicados. Quando forem, saem em reais.",
  },
  demo: {
    title: "Criar, executar, expor, suspender, retomar.",
    lead: "Poucas chamadas cobrem a maior parte do dia de um agente. Escolha a linguagem e veja uma sessão.",
    languageLabel: "Linguagem",
    terminalLabel: "Sessão de exemplo",
    steps: [
      { label: "Criar", note: "Uma microVM com kernel próprio, pronta em cerca de 2 s" },
      { label: "Executar", note: "Rode um comando lá dentro" },
      { label: "Expor uma porta", note: "Uma URL pública para a porta" },
      { label: "Suspender", note: "Mantém a memória, libera o processamento" },
      { label: "Retomar", note: "De volta de onde parou em cerca de 1 s" },
    ],
    note: "Uma ilustração do SDK da E2B apontado para o Rookbox. A saída está simplificada.",
    session: {
      ready: "pronta em cerca de 2 s",
      pause: "pause da E2B = suspender",
      saved: "memória mantida, processamento liberado",
      resumed: "retomada em cerca de 1 s",
    },
  },
  features: {
    title: "Uma máquina de verdade, não um contêiner compartilhado.",
    lead: [
      {
        stat: "~2 s",
        statLabel: "para iniciar",
        title: "Kernel e raiz próprios",
        body: "Cada máquina é uma microVM Firecracker. Seu agente pode instalar pacotes, rodar serviços e quebrar coisas sem afetar as vizinhas.",
      },
      {
        stat: "~1 s",
        statLabel: "para retomar",
        title: "Suspender mantém a memória",
        body: "Deixe a máquina em espera enquanto o agente aguarda. Ao retomar, a memória e os processos em execução voltam em cerca de um segundo.",
      },
    ],
    items: [
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
        title: "Tamanho por máquina",
        body: "Escolha as vCPUs e a memória de cada máquina pelo SDK, para que uma tarefa pequena não precise de uma máquina grande.",
      },
      {
        title: "Desktop com Chromium",
        body: "Cada máquina pode rodar um desktop Linux completo com Chromium. Acompanhe ao vivo no navegador por VNC ou deixe o agente controlá-lo.",
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
    keyLink: "entre na lista de espera",
  },
  quickstart: {
    eyebrow: "Primeiros passos",
    title: "Do zero a uma máquina rodando em cinco passos.",
    lead: "Você precisa do SDK da E2B para Python ou TypeScript e de uma chave de API.",
    languageLabel: "Linguagem",
    steps: [
      { title: "Instale o SDK", body: "O Rookbox usa o SDK da E2B. Instale-o na sua linguagem." },
      {
        title: "Defina o domínio e a chave",
        body: "Aponte o SDK para o Rookbox e informe a sua chave de API.",
      },
      { title: "Crie uma máquina", body: "Uma nova máquina inicia em cerca de 2 segundos." },
      {
        title: "Execute um comando",
        body: "O comando roda dentro da máquina e devolve a saída.",
      },
      {
        title: "Abra uma porta",
        body: "Inicie um servidor, peça a URL pública dele e abra no navegador.",
      },
    ],
    keyLine: "Ainda sem chave?",
    keyLink: "Entre na lista de espera",
    note: "Nomes e saídas são ilustrativos.",
  },
  cta: {
    eyebrow: "Acesso antecipado",
    title: "Peça uma vaga no próximo lote.",
    lead: "Só por convite, em lotes pequenos para as máquinas continuarem rápidas. Deixe seu email e avisamos quando for a sua vez.",
    priceNote: "A cobrança por segundo ainda não começou. Os preços não foram publicados.",
  },
  waitlist: {
    label: "Endereço de email",
    placeholder: "voce@empresa.com",
    submit: "Entrar na lista",
    sending: "Enviando",
    followup: {
      prompt: "Quer nos contar o que vai rodar?",
      hint: "Opcional, 1 clique.",
      options: [
        "Navegador ou uso do computador",
        "Execução de código",
        "Agentes de longa duração em segundo plano",
        "Experimentos em paralelo",
      ],
      thanks: "Anotado. Obrigado.",
      error: "Não conseguimos salvar agora. Você continua na lista.",
    },
    fine: "Só o email. Usamos apenas para enviar o seu convite.",
    okTitle: "Você está na lista.",
    okBody:
      "Enviamos uma confirmação para {email}. Quando abrir uma vaga, você recebe um email de convite com o seu acesso.",
    errorInvalid: "Isso não parece um endereço de email. Confira e tente de novo.",
    errorRate: "Tentativas demais desta conexão. Tente de novo em alguns minutos.",
    errorGeneric: "Não conseguimos falar com o servidor. Seu email não foi salvo. Tente de novo.",
    haveAccount: "Já tenho conta",
  },
  footer: {
    languages: "Idiomas",
    nav: "Site",
    tagline: "Máquinas para agentes de IA.",
    product: "Produto",
    howItWorks: "Como funciona",
    access: "Como o acesso funciona",
    brazil: "Pagamento em reais",
    dashboard: "Painel",
    developers: "Desenvolvedores",
    quickstart: "Primeiros passos",
    e2b: "Compatível com E2B",
  },
};

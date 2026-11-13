import type { Copy } from "./types";

export const es: Copy = {
  meta: {
    title: "Rookbox: un ordenador para cada agente",
    description:
      "Máquinas Linux bajo demanda para agentes de IA. Cada una es una microVM Firecracker con kernel propio, arranca en unos 2 segundos y funciona con tu código del SDK de E2B.",
    skipToContent: "Saltar al contenido",
    ogAlt: "Rookbox: un ordenador para cada agente",
  },
  nav: {
    primary: "Principal",
    home: "Inicio de Rookbox",
    menu: "Menú",
    product: "Producto",
    lifecycle: "Ciclo de vida",
    e2b: "Compatible con E2B",
    docs: "Documentación",
    getStarted: "Empezar",
  },
  hero: {
    eyebrow: "Máquinas para agentes de IA",
    title: "Dale a cada agente su propio ordenador.",
    lead: "Rookbox da a tus agentes máquinas Linux bajo demanda. Cada una es una microVM Firecracker con kernel propio y funciona con el SDK de E2B que quizá ya uses.",
    start: "Abrir el panel",
    watch: "Ver cómo funciona",
    facts: "Arranca en unos 2 s · Se reanuda en alrededor de 1 s",
  },
  demo: {
    eyebrow: "Cómo se siente",
    title: "Crear, ejecutar, exponer, suspender.",
    lead: "Unas pocas llamadas cubren la mayor parte del día de un agente. Elige tu lenguaje y mira una sesión.",
    languageLabel: "Lenguaje",
    terminalLabel: "Sesión de ejemplo",
    steps: [
      { label: "Crear", note: "Una microVM con kernel propio" },
      { label: "Ejecutar", note: "Ejecuta un comando dentro" },
      { label: "Exponer un puerto", note: "Una URL pública para el puerto" },
      { label: "Suspender", note: "Conserva la memoria, libera el cómputo" },
    ],
    note: "Una ilustración del SDK de E2B apuntando a Rookbox. La salida está simplificada.",
    session: {
      ready: "lista en unos 2 s",
      pause: "pause de E2B = suspender",
      saved: "memoria conservada, se reanuda en alrededor de 1 s",
    },
  },
  features: {
    eyebrow: "Qué obtienes",
    title: "Una máquina de verdad, no un contenedor compartido.",
    items: [
      {
        title: "Kernel y raíz propios",
        body: "Cada máquina es una microVM Firecracker. Tu agente puede instalar paquetes, ejecutar servicios y romper cosas sin afectar a las vecinas.",
      },
      {
        title: "Suspender conserva la memoria",
        body: "Deja una máquina en espera mientras el agente aguarda. Al reanudarla, la memoria y los procesos en ejecución vuelven en aproximadamente un segundo.",
      },
      {
        title: "Fork de un entorno que ya funciona",
        body: "Copia el disco a una máquina nueva y prueba otro enfoque en paralelo. El fork copia el disco, no la memoria.",
      },
      {
        title: "Una URL pública por puerto",
        body: "Expón un puerto y accede en `<puerto>-<id-del-sandbox>.box.rookbox.run`. Previsualiza un servidor de desarrollo o comparte un enlace.",
      },
      {
        title: "Comandos y archivos",
        body: "Ejecuta comandos, sigue su salida, lee y escribe archivos. Son las mismas llamadas que ya hace tu código E2B.",
      },
      {
        title: "Un escritorio en el navegador",
        body: "Un escritorio completo con Chromium, que ves en el navegador por VNC. Útil para agentes que necesitan ver una pantalla.",
      },
    ],
  },
  e2b: {
    eyebrow: "Compatible con E2B",
    title: "¿Ya usas E2B? Cambia una línea.",
    lead: "Rookbox habla el protocolo de E2B. Si ya usas el SDK de E2B, apúntalo a Rookbox y tu código sigue funcionando.",
    languageLabel: "Lenguaje",
    before: "Antes",
    after: "Con Rookbox",
    envLine: "¿Prefieres variables de entorno? Define `E2B_DOMAIN` y `E2B_API_KEY`.",
    keyLine: "Clave de API:",
    keyLink: "solicita acceso en el panel",
  },
  lifecycle: {
    eyebrow: "Ciclo de vida",
    title: "Cuatro movimientos, todos medidos en segundos.",
    lead: "Los tiempos son típicos, no garantizados.",
    cards: [
      {
        value: "~2 s",
        title: "Arrancar",
        body: "Una microVM nueva a partir de una plantilla: kernel y disco raíz propios.",
      },
      {
        value: "Memoria conservada",
        title: "Suspender",
        body: "Guarda la memoria y el estado y libera el worker.",
      },
      {
        value: "~1 s",
        title: "Reanudar",
        body: "Sigue exactamente donde el agente lo dejó, con sus procesos.",
      },
      {
        value: "Solo el disco",
        title: "Fork",
        body: "Copia el disco a una máquina hermana. La memoria no se copia.",
      },
    ],
  },
  cta: {
    eyebrow: "Precios: acceso anticipado",
    title: "Facturación por segundo. Precios próximamente.",
    lead: "Rookbox está en acceso anticipado. La facturación será por segundo y todavía no se han publicado los precios. Abre el panel para empezar.",
    start: "Empezar",
    docs: "Leer la documentación",
  },
  footer: {
    languages: "Idiomas",
    nav: "Sitio",
    tagline: "Máquinas para agentes de IA.",
    builtOn: "Construido sobre el proyecto de código abierto",
    spaceName: "SPACE",
    license: "(Apache-2.0).",
    product: "Producto",
    howItWorks: "Cómo funciona",
    lifecycle: "Ciclo de vida",
    dashboard: "Panel",
    developers: "Desarrolladores",
    docs: "Documentación",
    github: "GitHub",
  },
};

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
    desktop: "Escritorio",
    lifecycle: "Ciclo de vida",
    e2b: "Compatible con E2B",
    quickstart: "Primeros pasos",
    dashboard: "Abrir el panel",
  },
  hero: {
    title: "Dale a cada agente su propio ordenador.",
    lead: "Rookbox da a tus agentes máquinas Linux bajo demanda. Cada una es una microVM Firecracker con kernel propio y funciona con el SDK de E2B que quizá ya uses.",
    facts: ["Kernel propio", "Arranca en unos 2 s", "Se reanuda en aprox. 1 s"],
  },
  visual: {
    label: "Sesión de ejemplo: el SDK de E2B apuntando a Rookbox",
    caption: "El SDK de E2B apuntando a Rookbox. La salida está simplificada.",
  },
  demo: {
    title: "Crear, ejecutar, exponer, suspender, reanudar.",
    lead: "Unas pocas llamadas cubren casi todo el día de un agente. Elige tu lenguaje y mira una sesión.",
    languageLabel: "Lenguaje",
    terminalLabel: "Sesión de ejemplo",
    steps: [
      { label: "Crear", note: "Una microVM con kernel propio, lista en unos 2 s" },
      { label: "Ejecutar", note: "Ejecuta un comando dentro" },
      { label: "Exponer un puerto", note: "Una URL pública para el puerto" },
      { label: "Suspender", note: "Conserva la memoria, libera el cómputo" },
      { label: "Reanudar", note: "De vuelta donde se quedó, en aprox. 1 s" },
    ],
    note: "Una ilustración del SDK de E2B apuntando a Rookbox. La salida está simplificada.",
    session: {
      ready: "lista en unos 2 s",
      pause: "pause de E2B = suspender",
      saved: "memoria conservada, cómputo liberado",
      resumed: "reanudada en aprox. 1 s",
    },
  },
  desktop: {
    title: "Cuando un agente necesita ver una pantalla, la tiene.",
    lead: "Cada máquina puede ejecutar un escritorio Linux completo con Chromium. Míralo en vivo en tu navegador por VNC o deja que el agente lo maneje.",
    points: [
      "Chromium instalado y listo",
      "Visible en tu navegador por VNC",
      "La misma máquina que tu terminal y tus archivos",
    ],
  },
  features: {
    title: "Una máquina de verdad, no un contenedor compartido.",
    lead: [
      {
        stat: "~2 s",
        statLabel: "para arrancar",
        title: "Kernel y raíz propios",
        body: "Cada máquina es una microVM Firecracker. Tu agente puede instalar paquetes, ejecutar servicios y romper cosas sin afectar a las vecinas.",
      },
      {
        stat: "~1 s",
        statLabel: "para reanudar",
        title: "Suspender conserva la memoria",
        body: "Deja la máquina en espera mientras el agente aguarda. Al reanudar, la memoria y los procesos en ejecución vuelven en aproximadamente un segundo.",
      },
    ],
    items: [
      {
        title: "Fork de un entorno listo",
        body: "Copia el disco en una máquina nueva y prueba otro enfoque en paralelo. El fork copia el disco, no la memoria.",
      },
      {
        title: "Una URL pública por puerto",
        body: "Expón un puerto y accede en `<puerto>-<id-de-la-sandbox>.box.rookbox.run`. Previsualiza un servidor de desarrollo o comparte un enlace.",
      },
      {
        title: "Comandos y archivos",
        body: "Ejecuta comandos, sigue su salida, lee y escribe archivos. Son las mismas llamadas que ya hace tu código E2B.",
      },
      {
        title: "Tamaño por máquina",
        body: "Elige las vCPU y la memoria de cada máquina desde el SDK, para que una tarea pequeña no necesite una máquina grande.",
      },
    ],
  },
  lifecycle: {
    title: "Cuatro movimientos, todos medidos en segundos.",
    lead: "Los tiempos son típicos, no garantizados.",
    cards: [
      {
        state: "En ejecución",
        value: "~2 s",
        title: "Arrancar",
        body: "Una microVM nueva a partir de una plantilla: kernel y disco raíz propios.",
      },
      {
        state: "Suspendida",
        value: "Memoria conservada",
        title: "Suspender",
        body: "Guarda la memoria y el estado y libera el worker.",
      },
      {
        state: "De nuevo en ejecución",
        value: "~1 s",
        title: "Reanudar",
        body: "Continúa exactamente donde el agente lo dejó, con sus procesos.",
      },
      {
        state: "Una máquina nueva",
        value: "Solo el disco",
        title: "Fork",
        body: "Copia el disco en una máquina hermana. La memoria no se copia.",
      },
    ],
  },
  usecases: {
    title: "Hecho para trabajos que piden un ordenador de verdad.",
    items: [
      {
        title: "Navegación y uso del ordenador",
        body: "Dale al agente un escritorio con Chromium para abrir páginas, rellenar formularios y usar apps hechas para personas.",
      },
      {
        title: "Ejecución de código",
        body: "Ejecuta el código que escribió el modelo en una máquina desechable, con kernel y archivos propios.",
      },
      {
        title: "Agentes de larga duración en segundo plano",
        body: "Deja que un agente trabaje durante horas, suspéndelo mientras espera y reanúdalo en aproximadamente un segundo.",
      },
      {
        title: "Experimentos en paralelo",
        body: "Haz fork de un disco preparado en varias máquinas y prueba enfoques distintos en paralelo.",
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
    keyLink: "apúntate a la lista de espera",
  },
  quickstart: {
    eyebrow: "Primeros pasos",
    title: "De cero a una máquina en marcha en cinco pasos.",
    lead: "Necesitas el SDK de E2B para Python o TypeScript y una clave de API.",
    languageLabel: "Lenguaje",
    steps: [
      { title: "Instala el SDK", body: "Rookbox usa el SDK de E2B. Instálalo para tu lenguaje." },
      {
        title: "Define el dominio y tu clave",
        body: "Apunta el SDK a Rookbox e indícale tu clave de API.",
      },
      { title: "Crea una máquina", body: "Una máquina nueva arranca en unos 2 segundos." },
      {
        title: "Ejecuta un comando",
        body: "El comando se ejecuta dentro de la máquina y devuelve su salida.",
      },
      {
        title: "Abre un puerto",
        body: "Inicia un servidor, pide su URL pública y ábrela en el navegador.",
      },
    ],
    keyLine: "¿Aún sin clave?",
    keyLink: "Apúntate a la lista de espera",
    note: "Los nombres y la salida son ilustrativos.",
  },
  cta: {
    eyebrow: "Acceso anticipado",
    title: "Pide un lugar en el próximo grupo.",
    lead: "Rookbox es solo por invitación por ahora. Damos acceso en grupos pequeños para que las máquinas sigan siendo rápidas. Deja tu email y te escribimos cuando tu invitación esté lista.",
    priceNote: "Facturación por segundo. Los precios aún no se han publicado.",
  },
  waitlist: {
    label: "Dirección de email",
    placeholder: "tu@empresa.com",
    submit: "Apuntarme a la lista",
    sending: "Enviando",
    optionsLegend: "¿Qué vas a ejecutar?",
    optionsOptional: "Opcional",
    options: [
      "Navegador o uso del ordenador",
      "Ejecución de código",
      "Agentes de larga duración en segundo plano",
      "Experimentos en paralelo",
    ],
    fine: "Solo por invitación, en grupos pequeños. Usamos tu email únicamente para enviarte la invitación.",
    okTitle: "Estás en la lista.",
    okBody:
      "Enviamos una confirmación a {email}. Cuando se libere un lugar recibirás un email de invitación con tu acceso.",
    errorInvalid: "Eso no parece una dirección de email. Revísala e inténtalo de nuevo.",
    errorRate: "Demasiados intentos desde esta conexión. Inténtalo de nuevo en unos minutos.",
    errorGeneric:
      "No pudimos contactar con el servidor. Tu email no se guardó. Inténtalo de nuevo.",
    haveAccount: "Ya tengo cuenta",
  },
  footer: {
    languages: "Idiomas",
    nav: "Sitio",
    tagline: "Máquinas para agentes de IA.",
    product: "Producto",
    howItWorks: "Cómo funciona",
    desktop: "Escritorio",
    lifecycle: "Ciclo de vida",
    dashboard: "Panel",
    developers: "Desarrolladores",
    quickstart: "Primeros pasos",
    e2b: "Compatible con E2B",
  },
};

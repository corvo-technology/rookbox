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
    access: "Acceso",
    e2b: "Compatible con E2B",
    brazil: "Pago en reales",
    quickstart: "Primeros pasos",
    dashboard: "Abrir el panel",
  },
  hero: {
    eyebrow: "Lista de espera, solo por invitación",
    title: "Dale a cada agente su propio ordenador.",
    lead: "Rookbox da a tus agentes máquinas Linux bajo demanda. Cada una es una microVM Firecracker con kernel propio y funciona con el SDK de E2B que quizá ya uses.",
    facts: ["Kernel propio", "Arranca en unos 2 s", "Se reanuda en aprox. 1 s"],
  },
  visual: {
    label:
      "Sesión de ejemplo: el SDK de E2B apuntando a Rookbox, y la invitación que estás pidiendo",
    caption: "El SDK de E2B apuntando a Rookbox. La salida está simplificada.",
    invite: "invitación para",
    states: {
      idle: "escribe tu email para entrar en la cola",
      typed: "listo para entrar en la cola",
      sending: "enviando",
      done: "en la lista. la invitación llega por email",
    },
  },
  access: {
    title: "Cómo funciona el acceso.",
    steps: [
      {
        title: "Entra en la lista",
        body: "Solo tu email, nada más. Recibes una confirmación al instante.",
      },
      {
        title: "Recibe la invitación por email",
        body: "Damos acceso en lotes pequeños para que las máquinas sigan siendo rápidas. No prometemos fecha: te escribimos cuando sea tu turno.",
      },
      {
        title: "Crea tu primera máquina",
        body: "La invitación te da acceso al panel. Crea una máquina allí o apunta el SDK de E2B a Rookbox.",
      },
    ],
  },
  brazil: {
    eyebrow: "Previsto para el lanzamiento del cobro",
    title: "Hecho para quienes pagan en reales.",
    lead: "El cobro todavía no está activo. Se está diseñando para quienes están en Brasil, sin tarjeta internacional de por medio.",
    badge: "Pix",
    status: "Previsto, aún no disponible",
    rows: [
      {
        label: "Pago",
        value: "Pix, el sistema de pago instantáneo de Brasil. Sin tarjeta internacional.",
      },
      {
        label: "Moneda",
        value:
          "Reales brasileños (BRL). Pagar en reales por Pix no es una compra internacional con tarjeta, así que no se aplica el IOF.",
      },
      { label: "Medición", value: "Por segundo de uso." },
      { label: "Soporte", value: "En portugués, y la invitación también llega en portugués." },
    ],
    note: "Los precios aún no se han publicado. Cuando lo estén, serán en reales.",
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
      {
        title: "Escritorio con Chromium",
        body: "Cada máquina puede ejecutar un escritorio Linux completo con Chromium. Míralo en vivo en tu navegador por VNC o deja que el agente lo maneje.",
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
    title: "Pide un lugar en el próximo lote.",
    lead: "Solo por invitación, en lotes pequeños para que las máquinas sigan siendo rápidas. Deja tu email y te escribimos cuando sea tu turno.",
    priceNote: "El cobro por segundo aún no ha empezado. Los precios no se han publicado.",
  },
  waitlist: {
    label: "Dirección de email",
    placeholder: "tu@empresa.com",
    submit: "Entrar en la lista",
    sending: "Enviando",
    followup: {
      prompt: "¿Quieres contarnos qué vas a ejecutar?",
      hint: "Opcional, un clic.",
      options: [
        "Navegador o uso del ordenador",
        "Ejecución de código",
        "Agentes de larga duración en segundo plano",
        "Experimentos en paralelo",
      ],
      thanks: "Anotado. Gracias.",
      error: "No pudimos guardarlo ahora. Sigues en la lista.",
    },
    fine: "Solo tu email. Lo usamos únicamente para enviarte la invitación.",
    okTitle: "Estás en la lista.",
    okBody:
      "Enviamos una confirmación a {email}. Cuando se abra un lugar, recibirás un email de invitación con tu acceso.",
    errorInvalid: "Eso no parece una dirección de email. Revísala e inténtalo de nuevo.",
    errorRate: "Demasiados intentos desde esta conexión. Inténtalo de nuevo en unos minutos.",
    errorGeneric: "No pudimos conectar con el servidor. Tu email no se guardó. Inténtalo de nuevo.",
    haveAccount: "Ya tengo cuenta",
  },
  footer: {
    languages: "Idiomas",
    nav: "Sitio",
    tagline: "Máquinas para agentes de IA.",
    product: "Producto",
    howItWorks: "Cómo funciona",
    access: "Cómo funciona el acceso",
    brazil: "Pago en reales",
    dashboard: "Panel",
    developers: "Desarrolladores",
    quickstart: "Primeros pasos",
    e2b: "Compatible con E2B",
  },
};

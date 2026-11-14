import type { Copy } from "./types";

// TODO(content): the quickstart was removed from the landing and is meant to live in the docs.
// Decide the docs URL, then link it from the header. The old component is in git history.

export const es: Copy = {
  meta: {
    title: "Rookbox: un computador para cada agente",
    description:
      "Máquinas Linux bajo demanda para agentes de IA, listas en unos 2 segundos. Usa el SDK de E2B que ya conoces.",
    skipToContent: "Saltar al contenido",
    ogAlt: "Rookbox: un computador para cada agente",
  },
  nav: {
    primary: "Principal",
    home: "Inicio de Rookbox",
    languages: "Idiomas",
    demo: "Demo",
    e2b: "E2B",
    pix: "Pix",
    docs: "Documentación",
    join: "Unirme a la lista",
    signIn: "Entrar",
  },
  hero: {
    title: "Un computador para cada agente.",
    lead: "Máquinas Linux bajo demanda, listas en unos 2 segundos. Usa el SDK de E2B que ya conoces.",
  },
  visual: {
    label: "Un castillo de píxeles que se enciende mientras escribes tu correo",
    booting: "iniciando",
    waiting: "esperando tu correo",
    ready: "listo",
  },
  demo: {
    title: "Crea, ejecuta, suspende, reanuda.",
    languageLabel: "Lenguaje",
    terminalLabel: "Sesión de ejemplo",
    steps: ["Crear", "Ejecutar", "Exponer un puerto", "Suspender", "Reanudar"],
    facts: ["Kernel propio", "~2 s para iniciar", "~1 s para reanudar"],
    session: {
      ready: "lista en aprox. 2 s",
      pause: "pause de E2B = suspender",
      saved: "memoria conservada, cómputo liberado",
      resumed: "reanudada en aprox. 1 s",
    },
  },
  e2b: {
    title: "¿Ya usas E2B? Cambia dos variables.",
    languageLabel: "Lenguaje",
    before: "Antes",
    after: "Con Rookbox",
    code: "Tu código sigue igual",
    cli: {
      title: "¿Prefieres la terminal?",
      lead: "¿Ya tienes acceso? Instala el CLI.",
      docs: "Ver la documentación",
    },
  },
  brazil: {
    // TODO(content): see pt.ts. Legal entity and nota fiscal for BRL billing, the IOF wording
    // (confirm with an accountant before claiming it), and the Portuguese support channel and hours.
    title: "Paga en reales. Con Pix.",
    lead: "Cobro por segundo, en reales, sin tarjeta internacional. Soporte en portugués.",
    badge: "Pix",
  },
  cta: { title: "Súmate a la lista." },
  ui: {
    copy: "Copiar",
    copied: "Copiado",
    memory: "memoria mantenida",
    fork: "fork",
    steps: "Pasos",
  },
  waitlist: {
    label: "Correo electrónico",
    placeholder: "tu@empresa.com",
    submit: "Unirme a la lista",
    sending: "Enviando",
    ok: "Estás en la lista. Te avisamos por correo.",
    errorInvalid: "Eso no parece un correo. Revísalo e inténtalo de nuevo.",
    errorRate: "Demasiados intentos desde esta conexión. Inténtalo de nuevo en unos minutos.",
    errorGeneric:
      "No pudimos conectar con el servidor. Tu correo no se guardó. Inténtalo de nuevo.",
  },
  footer: { tagline: "Máquinas para agentes de IA.", docs: "Documentación" },
};

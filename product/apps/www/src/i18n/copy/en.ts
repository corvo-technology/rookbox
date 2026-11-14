import type { Copy } from "./types";

// TODO(content): the quickstart was removed from the landing and is meant to live in the docs.
// Decide the docs URL, then link it from the header. The old component is in git history.

export const en: Copy = {
  meta: {
    title: "Rookbox: a computer for every agent",
    description:
      "On-demand Linux machines for AI agents, ready in about 2 seconds. Use the E2B SDK you already know.",
    skipToContent: "Skip to content",
    ogAlt: "Rookbox: a computer for every agent",
  },
  nav: {
    primary: "Main",
    home: "Rookbox home",
    languages: "Languages",
    demo: "Demo",
    e2b: "E2B",
    pix: "Pix",
    join: "Join the waitlist",
    signIn: "Sign in",
  },
  hero: {
    title: "A computer for every agent.",
    lead: "On-demand Linux machines, ready in about 2 seconds. Use the E2B SDK you already know.",
  },
  visual: {
    label: "A pixel castle that lights up as you type your email",
    booting: "booting",
    waiting: "waiting for your email",
    ready: "ready",
  },
  demo: {
    title: "Create, run, suspend, resume.",
    languageLabel: "Language",
    terminalLabel: "Sample session",
    steps: ["Create", "Run", "Expose a port", "Suspend", "Resume"],
    facts: ["Its own kernel", "~2 s to start", "~1 s to resume"],
    session: {
      ready: "ready in about 2 s",
      pause: "E2B pause = suspend",
      saved: "memory kept, compute released",
      resumed: "resumed in about 1 s",
    },
  },
  e2b: {
    title: "Already on E2B? Change two env vars.",
    languageLabel: "Language",
    before: "Before",
    after: "With Rookbox",
    code: "Your code stays the same",
  },
  brazil: {
    // TODO(content): see pt.ts. Legal entity and nota fiscal for BRL billing, the IOF wording
    // (confirm with an accountant before claiming it), and the Portuguese support channel and hours.
    title: "Pay in reais. With Pix.",
    lead: "Per-second billing, in reais, no international card. Support in Portuguese.",
    badge: "Pix",
  },
  cta: { title: "Join the waitlist." },
  ui: { copy: "Copy", copied: "Copied", memory: "memory kept", fork: "fork", steps: "Steps" },
  waitlist: {
    label: "Email address",
    placeholder: "you@company.com",
    submit: "Join the waitlist",
    sending: "Sending",
    ok: "You are on the list. We will email you.",
    errorInvalid: "That does not look like an email address. Check it and try again.",
    errorRate: "Too many attempts from this connection. Try again in a few minutes.",
    errorGeneric: "We could not reach the server. Your email was not saved. Try again.",
  },
  footer: { tagline: "Machines for AI agents." },
};

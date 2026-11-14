import type { Copy } from "./types";

export const en: Copy = {
  meta: {
    title: "Rookbox: a computer for every agent",
    description:
      "On-demand Linux machines for AI agents. Each one is a Firecracker microVM with its own kernel, boots in about 2 seconds and works with your existing E2B SDK code.",
    skipToContent: "Skip to content",
    ogAlt: "Rookbox: a computer for every agent",
  },
  nav: {
    primary: "Main",
    home: "Rookbox home",
    menu: "Menu",
    product: "Product",
    access: "Access",
    e2b: "E2B compatible",
    brazil: "Paying in reais",
    quickstart: "Quickstart",
    dashboard: "Open the dashboard",
  },
  hero: {
    eyebrow: "Waitlist, invitation only",
    title: "Give every agent its own computer.",
    lead: "Rookbox gives your agents on-demand Linux machines. Each one is a Firecracker microVM with its own kernel, and it works with the E2B SDK you may already use.",
    facts: ["Its own kernel", "Boots in about 2 s", "Resumes in about 1 s"],
  },
  visual: {
    label: "Sample session: the E2B SDK pointed at Rookbox, and the invitation you are asking for",
    caption: "The E2B SDK pointed at Rookbox. Output is simplified.",
    invite: "invitation for",
    states: {
      idle: "type your email to join the queue",
      typed: "ready to join the queue",
      sending: "sending",
      done: "on the list. the invitation arrives by email",
    },
  },
  access: {
    title: "How access works.",
    steps: [
      {
        title: "Join the list",
        body: "Just your email, nothing else. You get a confirmation right away.",
      },
      {
        title: "Get the invitation by email",
        body: "We let people in small batches so the machines stay fast. We do not promise a date: we write when it is your turn.",
      },
      {
        title: "Create your first machine",
        body: "The invitation gives you access to the dashboard. Create a machine there, or point the E2B SDK at Rookbox.",
      },
    ],
  },
  brazil: {
    eyebrow: "Planned for when billing launches",
    title: "Made for people who pay in reais.",
    lead: "Billing is not live yet. It is being designed for people in Brazil, with no international card in the way.",
    badge: "Pix",
    status: "Planned, not available yet",
    rows: [
      { label: "Payment", value: "Pix, Brazil's instant payment system. No international card." },
      {
        label: "Currency",
        value:
          "Brazilian reais (BRL). Paying in reais by Pix is not an international card purchase, so no IOF foreign-transaction tax applies.",
      },
      { label: "Metering", value: "Per second of use." },
      {
        label: "Support",
        value: "In Portuguese, and the invitation email arrives in Portuguese too.",
      },
    ],
    note: "Prices have not been published. When they are, they will be in reais.",
  },
  demo: {
    title: "Create, run, expose, suspend, resume.",
    lead: "A few calls cover most of an agent's day. Pick your language and watch a session.",
    languageLabel: "Language",
    terminalLabel: "Sample session",
    steps: [
      { label: "Create", note: "A microVM with its own kernel, ready in about 2 s" },
      { label: "Run", note: "Run a command inside" },
      { label: "Expose a port", note: "A public URL for a port" },
      { label: "Suspend", note: "Keep memory, release compute" },
      { label: "Resume", note: "Back where it left off in about 1 s" },
    ],
    note: "An illustration of the E2B SDK pointed at Rookbox. Output is simplified.",
    session: {
      ready: "ready in about 2 s",
      pause: "E2B pause = suspend",
      saved: "memory kept, compute released",
      resumed: "resumed in about 1 s",
    },
  },
  features: {
    title: "A real machine, not a shared container.",
    lead: [
      {
        stat: "~2 s",
        statLabel: "to boot",
        title: "Its own kernel and root",
        body: "Every machine is a Firecracker microVM. Your agent can install packages, run services and break things without touching a neighbour.",
      },
      {
        stat: "~1 s",
        statLabel: "to resume",
        title: "Suspend keeps memory",
        body: "Park a machine while its agent waits. Resuming brings back memory and running processes in about a second.",
      },
    ],
    items: [
      {
        title: "Fork a working setup",
        body: "Copy the disk into a new machine and try a second approach in parallel. Fork copies the disk, not memory.",
      },
      {
        title: "A public URL per port",
        body: "Expose a port and reach it at `<port>-<sandbox-id>.box.rookbox.run`. Preview a dev server or share a link.",
      },
      {
        title: "Commands and files",
        body: "Run commands, stream their output, read and write files. These are the same calls your E2B code already makes.",
      },
      {
        title: "Sized per machine",
        body: "Choose the vCPU and memory of each machine through the SDK, so a small task does not need a big machine.",
      },
      {
        title: "Desktop with Chromium",
        body: "Every machine can run a full Linux desktop with Chromium. Watch it live in your browser over VNC, or let the agent drive it.",
      },
    ],
  },
  e2b: {
    eyebrow: "E2B compatible",
    title: "Already using E2B? Change one line.",
    lead: "Rookbox speaks the E2B protocol. If you already use the E2B SDK, point it at Rookbox and your code keeps working.",
    languageLabel: "Language",
    before: "Before",
    after: "With Rookbox",
    envLine: "Prefer environment variables? Set `E2B_DOMAIN` and `E2B_API_KEY` instead.",
    keyLine: "API key:",
    keyLink: "join the waitlist",
  },
  quickstart: {
    eyebrow: "Get started",
    title: "From zero to a running machine in five steps.",
    lead: "You need the E2B SDK for Python or TypeScript and an API key.",
    languageLabel: "Language",
    steps: [
      { title: "Install the SDK", body: "Rookbox uses the E2B SDK. Install it for your language." },
      {
        title: "Set the domain and your key",
        body: "Point the SDK at Rookbox and give it your API key.",
      },
      { title: "Create a machine", body: "A new machine boots in about 2 seconds." },
      {
        title: "Run a command",
        body: "The command runs inside the machine and returns its output.",
      },
      {
        title: "Open a port",
        body: "Start a server, then ask for its public URL and open it in your browser.",
      },
    ],
    keyLine: "No key yet?",
    keyLink: "Join the waitlist",
    note: "Names and output are illustrative.",
  },
  cta: {
    eyebrow: "Early access",
    title: "Ask for a spot in the next batch.",
    lead: "Invitation only, in small batches so the machines stay fast. Leave your email and we write when it is your turn.",
    priceNote: "Per-second billing has not started. Prices have not been published.",
  },
  waitlist: {
    label: "Email address",
    placeholder: "you@company.com",
    submit: "Join the waitlist",
    sending: "Sending",
    followup: {
      prompt: "Want to tell us what you will run?",
      hint: "Optional, one click.",
      options: [
        "Browser or computer use",
        "Code execution",
        "Long-running background agents",
        "Parallel experiments",
      ],
      thanks: "Noted. Thank you.",
      error: "We could not save that now. You are still on the list.",
    },
    fine: "Just your email. We only use it to send your invitation.",
    okTitle: "You are on the list.",
    okBody:
      "We sent a confirmation to {email}. When a spot opens you get an invitation email with your access.",
    errorInvalid: "That does not look like an email address. Check it and try again.",
    errorRate: "Too many attempts from this connection. Try again in a few minutes.",
    errorGeneric: "We could not reach the server. Your email was not saved. Try again.",
    haveAccount: "I have an account",
  },
  footer: {
    languages: "Languages",
    nav: "Site",
    tagline: "Machines for AI agents.",
    product: "Product",
    howItWorks: "How it works",
    access: "How access works",
    brazil: "Paying in reais",
    dashboard: "Dashboard",
    developers: "Developers",
    quickstart: "Quickstart",
    e2b: "E2B compatible",
  },
};

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
    lifecycle: "Lifecycle",
    e2b: "E2B compatible",
    docs: "Docs",
    getStarted: "Get started",
  },
  hero: {
    eyebrow: "Machines for AI agents",
    title: "Give every agent its own computer.",
    lead: "Rookbox gives your agents on-demand Linux machines. Each one is a Firecracker microVM with its own kernel, and it works with the E2B SDK you may already use.",
    start: "Open the dashboard",
    watch: "See how it works",
    facts: "Boots in about 2 s · Resumes in about 1 s",
  },
  demo: {
    eyebrow: "How it feels",
    title: "Create, run, expose, suspend.",
    lead: "A few calls cover most of an agent's day. Pick your language and watch a session.",
    languageLabel: "Language",
    terminalLabel: "Sample session",
    steps: [
      { label: "Create", note: "A microVM with its own kernel" },
      { label: "Run", note: "Run a command inside" },
      { label: "Expose a port", note: "A public URL for a port" },
      { label: "Suspend", note: "Keep memory, release compute" },
    ],
    note: "An illustration of the E2B SDK pointed at Rookbox. Output is simplified.",
    session: {
      ready: "ready in about 2 s",
      pause: "E2B pause = suspend",
      saved: "memory kept, resumes in about 1 s",
    },
  },
  features: {
    eyebrow: "What you get",
    title: "A real machine, not a shared container.",
    items: [
      {
        title: "Its own kernel and root",
        body: "Every machine is a Firecracker microVM. Your agent can install packages, run services and break things without touching a neighbour.",
      },
      {
        title: "Suspend keeps memory",
        body: "Park a machine while its agent waits. Resuming brings back memory and running processes in about a second.",
      },
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
        title: "A desktop in the browser",
        body: "A full desktop with Chromium, viewable in your browser over VNC. Useful for agents that need to see a screen.",
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
    keyLink: "request access in the dashboard",
  },
  lifecycle: {
    eyebrow: "Lifecycle",
    title: "Four moves, all measured in seconds.",
    lead: "Timings are typical, not guarantees.",
    cards: [
      {
        value: "~2 s",
        title: "Boot",
        body: "A new microVM from a template: own kernel, own root disk.",
      },
      {
        value: "Memory kept",
        title: "Suspend",
        body: "Persist memory and state and release the worker.",
      },
      {
        value: "~1 s",
        title: "Resume",
        body: "Pick up exactly where the agent left off, processes and all.",
      },
      {
        value: "Disk only",
        title: "Fork",
        body: "Copy the disk into a sibling machine. Memory is not copied.",
      },
    ],
  },
  cta: {
    eyebrow: "Pricing: early access",
    title: "Billed per second. Prices coming soon.",
    lead: "Rookbox is in early access. Billing will be per second, and prices have not been published yet. Open the dashboard to get started.",
    start: "Get started",
    docs: "Read the docs",
  },
  footer: {
    languages: "Languages",
    nav: "Site",
    tagline: "Machines for AI agents.",
    builtOn: "Built on the open-source",
    spaceName: "SPACE project",
    license: "(Apache-2.0).",
    product: "Product",
    howItWorks: "How it works",
    lifecycle: "Lifecycle",
    dashboard: "Dashboard",
    developers: "Developers",
    docs: "Docs",
    github: "GitHub",
  },
};

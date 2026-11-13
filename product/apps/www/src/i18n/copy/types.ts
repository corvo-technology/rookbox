/**
 * Every visible word on the landing page, per language. Text in `backticks` renders in the
 * monospace face (see `rich` in ../rich.ts).
 */
export type Copy = {
  meta: { title: string; description: string; skipToContent: string; ogAlt: string };
  nav: {
    primary: string;
    home: string;
    menu: string;
    product: string;
    lifecycle: string;
    e2b: string;
    docs: string;
    getStarted: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    lead: string;
    start: string;
    watch: string;
    /** Measured facts, shown under the buttons. */
    facts: string;
  };
  demo: {
    eyebrow: string;
    title: string;
    lead: string;
    languageLabel: string;
    terminalLabel: string;
    steps: { label: string; note: string }[];
    note: string;
    /** Comments inside the sample session. */
    session: { ready: string; pause: string; saved: string };
  };
  features: {
    eyebrow: string;
    title: string;
    items: { title: string; body: string }[];
  };
  e2b: {
    eyebrow: string;
    title: string;
    lead: string;
    languageLabel: string;
    before: string;
    after: string;
    envLine: string;
    keyLine: string;
    keyLink: string;
  };
  lifecycle: {
    eyebrow: string;
    title: string;
    lead: string;
    cards: { value: string; title: string; body: string }[];
  };
  cta: {
    eyebrow: string;
    title: string;
    lead: string;
    start: string;
    docs: string;
  };
  footer: {
    languages: string;
    nav: string;
    tagline: string;
    builtOn: string;
    spaceName: string;
    license: string;
    product: string;
    howItWorks: string;
    lifecycle: string;
    dashboard: string;
    developers: string;
    docs: string;
    github: string;
  };
};

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
    desktop: string;
    lifecycle: string;
    e2b: string;
    quickstart: string;
    dashboard: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    lead: string;
    start: string;
    quickstart: string;
    /** Three short facts shown under the buttons. */
    facts: [string, string, string];
  };
  /** The machines-list picture next to the headline. Every name in it is made up. */
  visual: {
    illustration: string;
    title: string;
    newMachine: string;
    running: string;
    suspended: string;
    starting: string;
    columns: { name: string; status: string; size: string; created: string };
    ages: [string, string, string, string];
    publicUrl: string;
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
    session: { ready: string; pause: string; saved: string; resumed: string };
  };
  desktop: {
    eyebrow: string;
    title: string;
    lead: string;
    illustration: string;
    points: [string, string, string];
    terminal: string;
    browser: string;
    viewer: string;
  };
  features: {
    eyebrow: string;
    title: string;
    items: { title: string; body: string }[];
  };
  lifecycle: {
    eyebrow: string;
    title: string;
    lead: string;
    cards: { state: string; value: string; title: string; body: string }[];
  };
  usecases: {
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
  quickstart: {
    eyebrow: string;
    title: string;
    lead: string;
    languageLabel: string;
    steps: { title: string; body: string }[];
    keyLine: string;
    keyLink: string;
    note: string;
  };
  cta: {
    eyebrow: string;
    title: string;
    lead: string;
    start: string;
    quickstart: string;
  };
  footer: {
    languages: string;
    nav: string;
    tagline: string;
    product: string;
    howItWorks: string;
    desktop: string;
    lifecycle: string;
    dashboard: string;
    developers: string;
    quickstart: string;
    e2b: string;
  };
};

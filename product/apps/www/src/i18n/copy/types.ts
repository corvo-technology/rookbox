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
    title: string;
    lead: string;
    start: string;
    quickstart: string;
    /** Three short facts shown under the buttons. */
    facts: [string, string, string];
  };
  /** The terminal session next to the headline. */
  visual: { label: string; caption: string };
  demo: {
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
    title: string;
    lead: string;
    points: [string, string, string];
  };
  features: {
    title: string;
    /** The two capabilities shown large, each with one number. */
    lead: { stat: string; statLabel: string; title: string; body: string }[];
    items: { title: string; body: string }[];
  };
  lifecycle: {
    title: string;
    lead: string;
    cards: { state: string; value: string; title: string; body: string }[];
  };
  usecases: {
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

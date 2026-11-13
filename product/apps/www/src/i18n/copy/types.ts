/**
 * Every visible word on the landing page, per language. Text in `backticks` renders in the
 * monospace face (see `rich` in ../rich.ts). Values in [square brackets] elsewhere on the page are
 * owner placeholders and are deliberately not translated; they live in ../../placeholders.ts.
 */
export type Copy = {
  meta: { title: string; description: string; skipToContent: string };
  nav: {
    primary: string;
    home: string;
    menu: string;
    product: string;
    lifecycle: string;
    e2b: string;
    pricing: string;
    docs: string;
    signIn: string;
    getKey: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    lead: string;
    start: string;
    watch: string;
    fine: string;
    counter: { label: string; demo: string; aria: string; note: string };
  };
  demo: {
    eyebrow: string;
    title: string;
    lead: string;
    languageLabel: string;
    terminalLabel: string;
    cli: string;
    steps: { label: string; note: string }[];
    note: string;
    /** Comments and notes inside the sample session. */
    session: {
      ready: string;
      pause: string;
      saved: string;
      fork: string;
      forkChild: string;
      cliReady: string;
      cliSaved: string;
      cliFork: string;
    };
  };
  features: {
    eyebrow: string;
    title: string;
    soon: string;
    items: { title: string; body: string }[];
  };
  e2b: {
    eyebrow: string;
    title: string;
    lead: string;
    toggleLabel: string;
    before: string;
    after: string;
    beforeHint: string;
    unchanged: string;
  };
  lifecycle: {
    eyebrow: string;
    title: string;
    lead: string;
    cards: { value: string; title: string; body: string }[];
  };
  pricing: { eyebrow: string; title: string; lead: string };
  cta: { title: string; lead: string; getKey: string; docs: string };
  footer: {
    languages: string;
    nav: string;
    tagline: string;
    rook: string;
    product: string;
    howItWorks: string;
    pricing: string;
    status: string;
    developers: string;
    docs: string;
    api: string;
    changelog: string;
    company: string;
    privacy: string;
    terms: string;
  };
};

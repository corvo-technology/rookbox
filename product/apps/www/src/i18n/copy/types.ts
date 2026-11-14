/**
 * Every visible word on the landing page, per language. Text in `backticks` renders in the
 * monospace face (see `rich` in ../rich.ts).
 */
type Step = { title: string; body: string };

export type Copy = {
  meta: { title: string; description: string; skipToContent: string; ogAlt: string };
  nav: {
    primary: string;
    home: string;
    menu: string;
    product: string;
    access: string;
    e2b: string;
    brazil: string;
    quickstart: string;
    dashboard: string;
  };
  hero: {
    /** The small line above the headline: this is a waitlist. */
    eyebrow: string;
    title: string;
    lead: string;
    /** Three short facts shown under the buttons. */
    facts: [string, string, string];
  };
  /** The terminal session next to the headline. */
  visual: {
    label: string;
    caption: string;
    /** The line after the sample session, followed by the address being typed. */
    invite: string;
    /** What the last line says as the visitor goes through the form. */
    states: { idle: string; typed: string; sending: string; done: string };
  };
  /** How access works: three plain steps. */
  access: { title: string; steps: [Step, Step, Step] };
  /** Billing for people who pay in reais. Planned, not live. */
  brazil: {
    eyebrow: string;
    title: string;
    lead: string;
    badge: string;
    status: string;
    rows: { label: string; value: string }[];
    note: string;
  };
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
  features: {
    title: string;
    /** The two capabilities shown large, each with one number. */
    lead: { stat: string; statLabel: string; title: string; body: string }[];
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
    /** The small pricing line. */
    priceNote: string;
  };
  /** The waitlist form, in the hero and again at the end of the page. */
  waitlist: {
    label: string;
    placeholder: string;
    submit: string;
    sending: string;
    /** The optional "what will you run" question, asked after they are on the list. */
    followup: {
      prompt: string;
      hint: string;
      options: [string, string, string, string];
      thanks: string;
      error: string;
    };
    /** Honest framing: invitation only, small batches. */
    fine: string;
    okTitle: string;
    /** `{email}` is replaced with the address they typed. */
    okBody: string;
    errorInvalid: string;
    errorRate: string;
    errorGeneric: string;
    haveAccount: string;
  };
  footer: {
    languages: string;
    nav: string;
    tagline: string;
    product: string;
    howItWorks: string;
    access: string;
    brazil: string;
    dashboard: string;
    developers: string;
    quickstart: string;
    e2b: string;
  };
};

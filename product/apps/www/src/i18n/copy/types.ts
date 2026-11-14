/**
 * Every visible word on the landing page, per language. Keep it short: the page is a hero, a demo,
 * the E2B switch, Pix and a closing form.
 */
export type Copy = {
  meta: { title: string; description: string; skipToContent: string; ogAlt: string };
  nav: {
    primary: string;
    home: string;
    languages: string;
    demo: string;
    e2b: string;
    pix: string;
    join: string;
    signIn: string;
  };
  hero: { title: string; lead: string };
  /** The pixel castle beside the headline. */
  visual: { label: string; booting: string; waiting: string; ready: string };
  demo: {
    title: string;
    languageLabel: string;
    terminalLabel: string;
    /** Step names shown beside the terminal. */
    steps: string[];
    /** One thin row of three facts. */
    facts: [string, string, string];
    /** Comments inside the sample session. */
    session: { ready: string; pause: string; saved: string; resumed: string };
  };
  e2b: {
    title: string;
    languageLabel: string;
    before: string;
    after: string;
    code: string;
  };
  brazil: { title: string; lead: string; badge: string };
  cta: { title: string };
  /** Small labels on the interactive parts: copy buttons, the suspended tag, the step list. */
  ui: { copy: string; copied: string; memory: string; fork: string; steps: string };
  /** The waitlist form, in the hero and again at the end of the page. */
  waitlist: {
    label: string;
    placeholder: string;
    submit: string;
    sending: string;
    ok: string;
    errorInvalid: string;
    errorRate: string;
    errorGeneric: string;
  };
  footer: { tagline: string };
};

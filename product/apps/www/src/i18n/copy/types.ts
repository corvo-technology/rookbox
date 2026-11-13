/** Every visible word on the landing page, per language. */
export type Copy = {
  meta: { title: string; description: string; skipToContent: string };
  nav: {
    primary: string;
    home: string;
    menu: string;
    docs: string;
    pricing: string;
    changelog: string;
    dashboard: string;
  };
  hero: {
    title: string;
    lead: string;
    getStarted: string;
    readDocs: string;
    copy: string;
    copied: string;
    snippetLabel: string;
  };
  preview: {
    label: string;
    machines: string;
    newMachine: string;
    running: string;
    suspended: string;
    creating: string;
  };
  features: {
    heading: string;
    linux: { title: string; body: string };
    suspend: {
      title: string;
      body: string;
      running: string;
      suspended: string;
      memorySaved: string;
      restored: string;
    };
    fork: { title: string; body: string; diskCopied: string; memoryFresh: string };
    desktop: { title: string; body: string; soon: string };
    sdk: { title: string; body: string };
  };
  cta: { title: string; getStarted: string };
  footer: {
    languages: string;
    nav: string;
    product: string;
    company: string;
    about: string;
    privacy: string;
    terms: string;
  };
};

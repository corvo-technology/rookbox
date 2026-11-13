export const SITE_NAME = "Rook Box";

/** Placeholder until Rook Box has a public domain. Also the domain the SDK snippets point at. */
export const SDK_DOMAIN = "box.example.com";

/** The dashboard (apps/web). Set PUBLIC_DASHBOARD_URL when building for a real deployment. */
export const DASHBOARD_URL: string =
  import.meta.env.PUBLIC_DASHBOARD_URL ?? "http://127.0.0.1:5173/";

/** TODO(content): these pages do not exist yet; the links stay as placeholders until they do. */
export const DOCS_URL = "#docs";
export const PRICING_URL = "#pricing";
export const CHANGELOG_URL = "#changelog";
export const ABOUT_URL = "#about";
export const PRIVACY_URL = "#privacy";
export const TERMS_URL = "#terms";

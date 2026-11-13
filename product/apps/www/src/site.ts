export const SITE_NAME = "Rookbox";

/** Placeholder until Rookbox has a public domain. */
export const SDK_DOMAIN = "box.example.com";

/** The dashboard (apps/web). Set PUBLIC_DASHBOARD_URL when building for a real deployment. */
const DASHBOARD_BASE: string = import.meta.env.PUBLIC_DASHBOARD_URL ?? "http://127.0.0.1:5173/";

function dashboard(path: string): string {
  return new URL(path, DASHBOARD_BASE.endsWith("/") ? DASHBOARD_BASE : `${DASHBOARD_BASE}/`).href;
}

export const DASHBOARD_URL = dashboard("");
export const MACHINES_URL = dashboard("machines");
/** The dashboard has no sign-in yet, so "Sign in" and "Get an API key" both land inside it. */
export const API_KEYS_URL = dashboard("keys");

/** TODO(content): these pages do not exist yet; the links stay as placeholders until they do. */
export const DOCS_URL = "#docs";
export const API_REFERENCE_URL = "#api";
export const STATUS_URL = "#status";
export const CHANGELOG_URL = "#changelog";
export const ROOK_URL = "#rook";
export const PRIVACY_URL = "#privacy";
export const TERMS_URL = "#terms";
export const CONTACT_URL = "#contact";

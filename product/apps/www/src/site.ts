export const SITE_NAME = "Rookbox";

/** The domain to hand the E2B SDK. Machines live under `*.` of this domain; the API is `api.` of it. */
export const SDK_DOMAIN: string = import.meta.env.PUBLIC_SDK_DOMAIN ?? "box.rookbox.run";

/** The dashboard (apps/web). Set PUBLIC_DASHBOARD_URL when building for another deployment. */
const DASHBOARD_BASE: string = import.meta.env.PUBLIC_DASHBOARD_URL ?? "https://app.rookbox.run/";

export const DASHBOARD_URL = new URL(
  DASHBOARD_BASE.endsWith("/") ? DASHBOARD_BASE : `${DASHBOARD_BASE}/`,
).href;

/** The API the waitlist form posts to. Set PUBLIC_API_URL when building for another deployment. */
const API_BASE: string = import.meta.env.PUBLIC_API_URL ?? "https://api.rookbox.run";

export const WAITLIST_URL = new URL("/waitlist", API_BASE).href;

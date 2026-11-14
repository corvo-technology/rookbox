/** The public docs. `VITE_DOCS_URL` points a deployment at another host. */
const DOCS_BASE: string = (import.meta.env.VITE_DOCS_URL || "https://docs.rookbox.run").replace(
  /\/+$/,
  "",
);

/** The docs page in the dashboard's language: Portuguese at the root, every other language in English. */
export function docsUrl(locale: string, page = ""): string {
  const base = locale === "pt-BR" ? `${DOCS_BASE}/` : `${DOCS_BASE}/en/`;
  return page ? `${base}${page}/` : base;
}

/** The CLI installer, for people who already have access. */
export const CLI_INSTALL = "curl -fsSL https://rookbox.run/install | sh";

/** The machines filter field, which the Search button and Cmd/Ctrl K focus. */
export const FILTER_INPUT_ID = "machine-filter";

/** The docs link in the top bar. Unset until the docs site exists: then there is no link. */
export const DOCS_URL: string | undefined = import.meta.env.VITE_DOCS_URL || undefined;

/** The machines filter field, which the Search button and Cmd/Ctrl K focus. */
export const FILTER_INPUT_ID = "machine-filter";

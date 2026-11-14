import type { Translate } from "./i18n.js";

/** Exit codes: 0 ok; 1 failure; 2 usage; 3 auth; 4 not found; 5 limit or capacity. */
export const EXIT = { ok: 0, failure: 1, usage: 2, auth: 3, notFound: 4, limit: 5 } as const;

/** A failure to show to the person, with the exit code it maps to. */
export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode: number = EXIT.failure,
  ) {
    super(message);
    this.name = "CliError";
  }
}

export type MapContext = {
  t: Translate;
  apiUrl: string;
  /** How many machines the account holds; asked only when the limit error needs it. */
  countMachines?: () => Promise<number | null>;
};

function statusOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const status = (error as { statusCode?: unknown }).statusCode;
  return typeof status === "number" ? status : undefined;
}

const NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNRESET",
  "ETIMEDOUT",
]);

function looksLikeNetwork(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && NETWORK_CODES.has(code)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return error instanceof TypeError && /fetch failed/i.test(error.message);
}

/**
 * Turns whatever the SDK threw into one plain sentence and an exit code. It reads the class name
 * and `statusCode` rather than importing the SDK's classes, so tests need no SDK instance.
 */
export async function mapError(error: unknown, ctx: MapContext): Promise<CliError> {
  if (error instanceof CliError) return error;
  const { t } = ctx;
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  const status = statusOf(error);

  if (name === "AuthenticationError" || status === 401) {
    return new CliError(t("err.401"), EXIT.auth);
  }
  if (name === "RateLimitError" || status === 429) {
    if (/machine limit/i.test(message)) {
      const count = await ctx.countMachines?.().catch(() => null);
      return new CliError(
        count ? t("err.429.limit", { n: count }) : t("err.429.limitUnknown"),
        EXIT.limit,
      );
    }
    return new CliError(t("err.429.rate"), EXIT.limit);
  }
  if (name === "ServiceBusyError" || status === 503) {
    return new CliError(t("err.503"), EXIT.limit);
  }
  if (name.endsWith("NotFoundError") || status === 404) {
    return new CliError(t("err.404"), EXIT.notFound);
  }
  if (looksLikeNetwork(error)) {
    return new CliError(t("err.network", { url: ctx.apiUrl }));
  }
  return new CliError(t("err.generic", { message }));
}

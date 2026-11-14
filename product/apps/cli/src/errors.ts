import type { Translate } from "./i18n.js";

/**
 * Exit codes: 0 ok; 1 failure; 2 usage; 3 auth; 4 not found; 5 limit or capacity;
 * 6 service temporarily unavailable (502/503/504 or a network error).
 */
export const EXIT = {
  ok: 0,
  failure: 1,
  usage: 2,
  auth: 3,
  notFound: 4,
  limit: 5,
  unavailable: 6,
} as const;

/** A failure to show to the person, with the exit code it maps to. */
export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode: number = EXIT.failure,
    /** The raw upstream text, shown only with --debug. */
    readonly detail?: string,
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
  /** The failed call was a create: it may have reached the server, so a retry could duplicate. */
  maybeCreated?: boolean;
};

const MAX_BODY = 200;

/** True when the text looks like an HTML page (an edge or proxy error page, not our API). */
export function looksLikeHtml(text: string): boolean {
  return /<\s*(!doctype|html|head|body|title|h1|center)\b/i.test(text) || /<\/\w+>/.test(text);
}

/** Strips tags, collapses whitespace and cuts to a short, single line. */
export function sanitizeBody(text: string): string {
  const plain = text
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > MAX_BODY ? `${plain.slice(0, MAX_BODY - 3)}...` : plain;
}

/** The HTTP status from `statusCode`, or the "502: ..." prefix the SDK puts on its messages. */
function httpStatus(error: unknown): number | undefined {
  const direct = statusOf(error);
  if (direct !== undefined) return direct;
  const message = error instanceof Error ? error.message : "";
  const match = /^(\d{3})\b/.exec(message);
  if (match) return Number(match[1]);
  return error instanceof Error && error.name === "ServiceBusyError" ? 503 : undefined;
}

/** True for failures worth retrying on a safe call: 502/503/504 and connection errors. */
export function isTransient(error: unknown): boolean {
  const status = httpStatus(error);
  if (status === 502 || status === 503 || status === 504) return true;
  return looksLikeNetwork(error);
}

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
  "EPIPE",
  "ConnectionRefused",
  "ConnectionClosed",
  "FailedToOpenSocket",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);

/** Runtime wording for a failed connection: Node's undici and Bun's fetch differ. */
const NETWORK_MESSAGE =
  /fetch failed|unable to connect|failed to connect|connection (refused|reset|closed)|socket (hang up|connection was closed)|network error|ECONNRESET|ETIMEDOUT|ENOTFOUND/i;

function looksLikeNetwork(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && NETWORK_CODES.has(code)) return true;
    const text = current instanceof Error ? current.message : "";
    if (NETWORK_MESSAGE.test(text) && !/^\d{3}\b/.test(text)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

function unavailable(t: Translate, ctx: MapContext): string {
  return ctx.maybeCreated
    ? `${t("err.unavailable")} ${t("err.maybeCreated")}`
    : t("err.unavailable");
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
  const status = httpStatus(error);
  const html = looksLikeHtml(message);
  const detail = message;
  const withDetail = (text: string, code: number) => new CliError(text, code, detail);

  if (name === "AuthenticationError" || status === 401) {
    return new CliError(t("err.401"), EXIT.auth, detail);
  }
  if (name === "RateLimitError" || status === 429) {
    if (/machine limit/i.test(message)) {
      const count = await ctx.countMachines?.().catch(() => null);
      return new CliError(
        count ? t("err.429.limit", { n: count }) : t("err.429.limitUnknown"),
        EXIT.limit,
        detail,
      );
    }
    return new CliError(t("err.429.rate"), EXIT.limit, detail);
  }
  // A 503 with a plain API message is the beta being full; an HTML page is the edge failing.
  if ((name === "ServiceBusyError" || status === 503) && !html) {
    return new CliError(t("err.503"), EXIT.limit, detail);
  }
  if (status === 502 || status === 503 || status === 504) {
    return withDetail(unavailable(t, ctx), EXIT.unavailable);
  }
  if (name.endsWith("NotFoundError") || status === 404) {
    return new CliError(t("err.404"), EXIT.notFound, detail);
  }
  if (looksLikeNetwork(error)) {
    return withDetail(
      `${t("err.network", { url: ctx.apiUrl })}${ctx.maybeCreated ? ` ${t("err.maybeCreated")}` : ""}`,
      EXIT.unavailable,
    );
  }
  if (html || (status !== undefined && status >= 500)) {
    return withDetail(t("err.server", { status: status ?? 500 }), EXIT.failure);
  }
  return withDetail(t("err.generic", { message: sanitizeBody(message) }), EXIT.failure);
}

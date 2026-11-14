import { isApiErrorCode } from "@rookbox/contracts";

/** What went wrong, in terms a person can act on. The words live in `ErrorNote`. */
export type ErrorKind =
  | "session"
  | "credentials"
  | "template"
  | "limit"
  | "name_taken"
  | "unreachable"
  | "timeout"
  | "capacity"
  | "quota"
  | "network"
  | "not_found"
  | "conflict"
  | "space"
  | "rate_limited"
  | "forbidden"
  | "unknown";

export type ClassifiedError = {
  kind: ErrorKind;
  /** Seconds to wait, for `rate_limited`. */
  retryAfterS?: number;
  /** The machine limit, for `limit`. */
  limit?: number;
  /** Trying the same thing again can work, without anyone changing anything. */
  retryable: boolean;
};

function field(error: unknown, name: string): unknown {
  return typeof error === "object" && error !== null
    ? (error as Record<string, unknown>)[name]
    : undefined;
}

/**
 * Reads an error from the API client by its code (never its message, which is for developers),
 * falling back to the HTTP status for a proxy's answer and to the error type for a lost
 * connection.
 */
export function classifyError(error: unknown): ClassifiedError {
  const code = field(error, "code");
  const status = field(error, "status");
  const data = field(error, "data");

  if (isApiErrorCode(code)) {
    switch (code) {
      case "HOST_AUTH":
        return { kind: "credentials", retryable: false };
      case "TEMPLATE_UNAVAILABLE":
        return { kind: "template", retryable: false };
      case "MACHINE_LIMIT": {
        const limit = field(data, "limit");
        return {
          kind: "limit",
          limit: typeof limit === "number" ? limit : undefined,
          retryable: false,
        };
      }
      case "NAME_TAKEN":
        return { kind: "name_taken", retryable: false };
      case "HOST_UNREACHABLE":
        return { kind: "unreachable", retryable: true };
      case "HOST_TIMEOUT":
        return { kind: "timeout", retryable: true };
      case "HOST_CAPACITY":
        return { kind: "capacity", retryable: true };
      case "HOST_QUOTA":
        return { kind: "quota", retryable: false };
      case "HOST_ERROR":
        return { kind: "space", retryable: true };
      case "NOT_FOUND":
        return { kind: "not_found", retryable: false };
      case "CONFLICT":
        return { kind: "conflict", retryable: false };
      case "RATE_LIMITED": {
        const wait = field(data, "retryAfterS");
        return {
          kind: "rate_limited",
          retryAfterS: typeof wait === "number" ? wait : undefined,
          retryable: false,
        };
      }
      case "FORBIDDEN":
        return { kind: "forbidden", retryable: false };
    }
  }
  if (code === "UNAUTHORIZED" || status === 401) return { kind: "session", retryable: false };
  // The API itself did not answer: a proxy's 502/503/504, or no answer at all.
  if (status === 502 || status === 503 || status === 504) {
    return { kind: "network", retryable: true };
  }
  if (error instanceof TypeError || field(error, "name") === "AbortError") {
    return { kind: "network", retryable: true };
  }
  return { kind: "unknown", retryable: true };
}

/** Seconds from a `Retry-After` header value, or null. */
export function retryAfterSeconds(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
}

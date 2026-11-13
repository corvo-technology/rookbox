import * as z from "zod";

/**
 * Failures the API reports with a stable code, so a screen can say what happened in the user's
 * language instead of printing a server message. Messages are generic English for API clients and
 * logs; they never carry an upstream body, a credential or an internal address.
 */
export const API_ERRORS = {
  /** No such machine or key, or one that belongs to someone else. */
  NOT_FOUND: { status: 404, message: "Not found." },
  /** The machine's state does not allow the request. */
  CONFLICT: { status: 409, message: "The machine's state does not allow that right now." },
  /** The account already holds the most machines it may. */
  MACHINE_LIMIT: {
    status: 409,
    message: "The machine limit for this account is reached.",
    data: z.object({ limit: z.number().int() }),
  },
  NAME_TAKEN: { status: 409, message: "A machine with that name already exists." },
  /** The template is not offered by this deployment, or SPACE has no such template. */
  TEMPLATE_UNAVAILABLE: { status: 400, message: "That template is not available." },
  /** SPACE refused the service key. An operator has to fix it; retrying will not help. */
  HOST_AUTH: { status: 502, message: "The machine service rejected Rookbox's credentials." },
  HOST_UNREACHABLE: { status: 503, message: "The machine service can't be reached." },
  HOST_TIMEOUT: { status: 504, message: "The machine service took too long to answer." },
  /** SPACE has no room right now (503, or 429 without a quota). */
  HOST_CAPACITY: { status: 503, message: "The machine service is at capacity." },
  /** SPACE's own quota or limit was reached. */
  HOST_QUOTA: { status: 429, message: "The machine service's limit was reached." },
  /** Any other SPACE failure. */
  HOST_ERROR: { status: 502, message: "The machine service failed." },
} as const;

export type ApiErrorCode = keyof typeof API_ERRORS;

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === "string" && value in API_ERRORS;
}

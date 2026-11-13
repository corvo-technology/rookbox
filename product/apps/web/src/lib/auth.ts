import { useQuery } from "@tanstack/react-query";
import { retryAfterSeconds } from "./errors";

/**
 * The API's origin. Unset means "no server": the dashboard runs on the in-memory fake and needs
 * no sign-in. Set it at build time (`VITE_API_URL=https://api.rookbox.run`) for the real thing.
 */
export const API_URL: string | undefined =
  import.meta.env.VITE_API_URL?.replace(/\/+$/, "") || undefined;

/** True when the dashboard talks to the real API and so needs a signed-in user. */
export const AUTH_ENABLED = API_URL !== undefined;

export const SESSION_KEY = ["session"] as const;
/** Set when the API said 401 to a signed-in dashboard, so the sign-in screen can explain. */
export const SESSION_ENDED_KEY = ["session-ended"] as const;

export type Session = { email: string };

const JSON_HEADERS = { "content-type": "application/json" };

/**
 * The signed-in user, or null when nobody is. Throws when the API cannot be reached at all, so
 * a dead connection is not mistaken for being signed out.
 */
export async function fetchSession(): Promise<Session | null> {
  if (!API_URL) return { email: "demo@example.com" };
  const response = await fetch(`${API_URL}/api/auth/get-session`, { credentials: "include" });
  if (response.status >= 500) throw new Error(`session check answered ${response.status}`);
  if (!response.ok) return null;
  const body = (await response.json().catch(() => null)) as { user?: { email?: string } } | null;
  return body?.user?.email ? { email: body.user.email } : null;
}

export type SignInFailure = "credentials" | "network" | "rate_limited" | "server";

export class SignInError extends Error {
  constructor(
    readonly kind: SignInFailure,
    message: string,
    /** For `rate_limited`: seconds until another try is allowed. */
    readonly retryAfterS: number | null = null,
  ) {
    super(message);
  }
}

export async function signIn(email: string, password: string): Promise<void> {
  if (!API_URL) return;
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/auth/sign-in/email`, {
      method: "POST",
      credentials: "include",
      headers: JSON_HEADERS,
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new SignInError("network", "network");
  }
  if (response.ok) return;
  if (response.status === 429) {
    throw new SignInError(
      "rate_limited",
      "rate limited",
      retryAfterSeconds(response.headers.get("retry-after")),
    );
  }
  if (response.status >= 500) throw new SignInError("server", String(response.status));
  throw new SignInError("credentials", String(response.status));
}

export async function signOut(): Promise<void> {
  if (!API_URL) return;
  await fetch(`${API_URL}/api/auth/sign-out`, {
    method: "POST",
    credentials: "include",
    headers: JSON_HEADERS,
    body: "{}",
  }).catch(() => undefined);
}

export function useSession() {
  return useQuery({
    queryKey: SESSION_KEY,
    queryFn: fetchSession,
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: true,
  });
}

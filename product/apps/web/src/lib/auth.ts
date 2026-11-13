import { useQuery } from "@tanstack/react-query";

/**
 * The API's origin. Unset means "no server": the dashboard runs on the in-memory fake and needs
 * no sign-in. Set it at build time (`VITE_API_URL=https://api.rookbox.run`) for the real thing.
 */
export const API_URL: string | undefined =
  import.meta.env.VITE_API_URL?.replace(/\/+$/, "") || undefined;

/** True when the dashboard talks to the real API and so needs a signed-in user. */
export const AUTH_ENABLED = API_URL !== undefined;

export const SESSION_KEY = ["session"] as const;

export type Session = { email: string };

const JSON_HEADERS = { "content-type": "application/json" };

/** The signed-in user, or null. Without a server there is always a demo user. */
export async function fetchSession(): Promise<Session | null> {
  if (!API_URL) return { email: "demo@example.com" };
  const response = await fetch(`${API_URL}/api/auth/get-session`, { credentials: "include" });
  if (!response.ok) return null;
  const body = (await response.json().catch(() => null)) as { user?: { email?: string } } | null;
  return body?.user?.email ? { email: body.user.email } : null;
}

export class SignInError extends Error {
  constructor(
    readonly kind: "credentials" | "network",
    message: string,
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
  if (!response.ok) throw new SignInError("credentials", String(response.status));
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
  });
}

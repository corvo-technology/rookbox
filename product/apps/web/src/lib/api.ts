import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { AppClient } from "@rookbox/contracts";
import { QueryClient } from "@tanstack/react-query";
import { API_URL, SESSION_KEY } from "./auth";
import { createFakeApi } from "./fake-api";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5_000, retry: 1 },
  },
});

/** The real API, over cookies. A 401 means the session ended, so the sign-in screen takes over. */
function createRealApi(url: string): AppClient {
  return createORPCClient(
    new RPCLink({
      url: `${url}/rpc`,
      fetch: async (request, init) => {
        const response = await fetch(request, { ...init, credentials: "include" });
        if (response.status === 401) queryClient.setQueryData(SESSION_KEY, null);
        return response;
      },
    }),
  );
}

/**
 * The one place the dashboard gets its API: the real oRPC client when `VITE_API_URL` is set,
 * otherwise the in-memory fake. Both satisfy the same contract, so every screen works with either.
 */
export const api: AppClient = API_URL ? createRealApi(API_URL) : createFakeApi({ seed: true });

export const orpc = createTanstackQueryUtils(api);

/** How often screens refresh while a machine is between states. */
export const TRANSITION_POLL_MS = 700;

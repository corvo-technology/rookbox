import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { ApiErrorCode, AppClient } from "@rookbox/contracts";
import { isApiErrorCode } from "@rookbox/contracts";
import { QueryClient } from "@tanstack/react-query";
import { API_URL, SESSION_ENDED_KEY, SESSION_KEY } from "./auth";
import { classifyError } from "./errors";
import { createFakeApi } from "./fake-api";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      // A refusal (not found, no credentials, a limit) will not change by asking again.
      retry: (count, error) => count < 1 && classifyError(error).retryable,
    },
  },
});

/** The real API, over cookies. A 401 means the session ended, so the sign-in screen takes over. */
function createRealApi(url: string): AppClient {
  return createORPCClient(
    new RPCLink({
      url: `${url}/rpc`,
      fetch: async (request, init) => {
        const response = await fetch(request, { ...init, credentials: "include" });
        if (response.status === 401) {
          // Only a session that was there can "end"; the sign-in screen then says so.
          if (queryClient.getQueryData(SESSION_KEY))
            queryClient.setQueryData(SESSION_ENDED_KEY, true);
          queryClient.setQueryData(SESSION_KEY, null);
        }
        return response;
      },
    }),
  );
}

/**
 * The one place the dashboard gets its API: the real oRPC client when `VITE_API_URL` is set,
 * otherwise the in-memory fake. Both satisfy the same contract, so every screen works with either.
 */
export const api: AppClient = API_URL
  ? createRealApi(API_URL)
  : createFakeApi({
      seed: true,
      createMs: 2_500,
      stepMs: 2_000,
      // `?fakeError=HOST_AUTH` makes every create fail that way, to see how it reads.
      failCreateWith: fakeError(),
    });

export const orpc = createTanstackQueryUtils(api);

/** How often screens refresh while a machine is between states. */
export const TRANSITION_POLL_MS = 1_500;

function fakeError(): ApiErrorCode | undefined {
  const code = new URLSearchParams(globalThis.location?.search).get("fakeError");
  return isApiErrorCode(code) ? code : undefined;
}

import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { AppClient } from "@rookbox/contracts";
import { QueryClient } from "@tanstack/react-query";
import { createFakeApi } from "./fake-api";

/**
 * The one place the dashboard gets its API. Today it is the in-memory fake. When the real
 * Hono/oRPC API exists, replace this with
 * `createORPCClient(new RPCLink({ url: `${location.origin}/rpc` }))`; every screen keeps working
 * because both satisfy the same contract.
 */
export const api: AppClient = createFakeApi({ seed: true });

export const orpc = createTanstackQueryUtils(api);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5_000, retry: 1 },
  },
});

/** How often screens refresh while a machine is between states. */
export const TRANSITION_POLL_MS = 700;

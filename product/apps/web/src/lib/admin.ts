import { useQuery } from "@tanstack/react-query";
import { orpc } from "./api";

/**
 * Whether the signed-in user is an operator. The API decides (`ADMIN_EMAILS`); this only asks, so
 * the panel's links and routes show for the right people. Every admin call is checked again on the
 * server, so a wrong answer here can show a link but never give access.
 */
export function useIsAdmin() {
  const access = useQuery({
    ...orpc.admin.access.queryOptions(),
    staleTime: 5 * 60_000,
    retry: false,
  });
  return { isAdmin: access.data?.admin === true, isPending: access.isPending };
}

/** Seconds as "3 d 4 h", "2 h 5 min" or "40 s": how long something has been up or quiet. */
export function formatSpan(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const days = Math.floor(s / 86_400);
  const hours = Math.floor((s % 86_400) / 3_600);
  const minutes = Math.floor((s % 3_600) / 60);
  if (days > 0) return `${days} d ${hours} h`;
  if (hours > 0) return `${hours} h ${minutes} min`;
  if (minutes > 0) return `${minutes} min`;
  return `${s} s`;
}

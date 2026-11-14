import { ORPCError } from "@orpc/server";
import type { AdminUsage, UsagePeriod, UsageSummary } from "@rookbox/contracts";
import type { UsageService } from "./service.js";

/**
 * What the usage procedures do, for `createRouter` to mount. With no usage service (an app built
 * without one) they answer 503 rather than pretend there is nothing to report.
 */
export function usageHandlers(usage: UsageService | undefined) {
  const need = () => {
    if (!usage) {
      throw new ORPCError("SERVICE_UNAVAILABLE", { status: 503, message: "Usage is off." });
    }
    return usage;
  };
  return {
    summary: async (user: { id: string }, period: UsagePeriod): Promise<UsageSummary> =>
      need().summary(user.id, period),
    admin: async (user: { email: string }, period: UsagePeriod): Promise<AdminUsage> => {
      const service = need();
      if (!service.isAdmin(user.email)) {
        throw new ORPCError("FORBIDDEN", { status: 403, message: "Admins only." });
      }
      return service.admin(period);
    },
  };
}

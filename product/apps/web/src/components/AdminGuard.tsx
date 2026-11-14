import { Trans, useLingui } from "@lingui/react/macro";
import { Skeleton } from "@rookbox/ui-web";
import { Link, Outlet } from "react-router-dom";
import { useIsAdmin } from "../lib/admin";

/**
 * The operator area. It asks the API whether the signed-in user is an admin and shows the pages
 * only if so. This is a convenience: every admin call is refused again by the API, so reaching a
 * page by hand shows nothing.
 */
export function AdminGuard() {
  const { t } = useLingui();
  const { isAdmin, isPending } = useIsAdmin();
  if (isPending) {
    return <Skeleton className="h-24 w-full rounded-2xl" role="status" aria-label={t`Loading`} />;
  }
  if (!isAdmin) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-heading2 font-semibold text-foreground">
          <Trans>This area is for administrators</Trans>
        </h1>
        <p className="max-w-[520px] text-body1 text-muted-foreground">
          <Trans>Your account doesn't have access to it.</Trans>
        </p>
        <Link to="/machines" className="text-body1 text-link underline-offset-4 hover:underline">
          <Trans>Go to machines</Trans>
        </Link>
      </div>
    );
  }
  return <Outlet />;
}

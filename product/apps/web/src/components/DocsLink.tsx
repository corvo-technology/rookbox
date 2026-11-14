import { useLingui } from "@lingui/react/macro";
import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { docsUrl } from "../lib/site";

/** An external link to a page of the docs, in the dashboard's language, opened in a new tab. */
export function DocsLink({
  page,
  className = "inline-flex items-center gap-1.5 text-link underline-offset-4 hover:underline",
  children,
}: {
  page?: string;
  className?: string;
  children: ReactNode;
}) {
  const { i18n } = useLingui();
  return (
    <a href={docsUrl(i18n.locale, page)} target="_blank" rel="noopener" className={className}>
      {children}
      <ExternalLink className="size-3.5" aria-hidden="true" />
    </a>
  );
}

import { useLingui } from "@lingui/react/macro";
import { templateKind } from "../lib/templates";

/** A template by what it makes ("Linux", "Desktop"); a name we do not know shows as it is. */
export function useTemplateLabel(): (name: string) => string {
  const { t } = useLingui();
  return (name) => {
    switch (templateKind(name)) {
      case "desktop":
        return t`Desktop`;
      case "linux":
        return t`Linux`;
      default:
        return name;
    }
  };
}

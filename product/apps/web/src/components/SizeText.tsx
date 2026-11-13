import { useLingui } from "@lingui/react/macro";
import type { MachineSize } from "@rookbox/contracts";
import { sizeParts } from "../lib/format";

/** "4 vCPU · 8 GiB RAM · 20 GiB disk", in the reader's language. */
export function useSizeText() {
  const { t, i18n } = useLingui();
  return (size: MachineSize) => {
    const { vcpu, memory, disk } = sizeParts(size, i18n.locale);
    return t`${vcpu} vCPU · ${memory} RAM · ${disk} disk`;
  };
}

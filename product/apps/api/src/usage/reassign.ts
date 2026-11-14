import { CUSTOMER_ID_PATTERN, customerOwner } from "@rookbox/contracts";
import type { UsageStore } from "./store.js";

export type ReassignResult = {
  owner: string;
  /** Machines whose recorded time has no owner and would move (or moved, when applied). */
  machineIds: string[];
  /** Asked for, but left alone: they already have an owner, belong to a user, or have no usage. */
  skipped: string[];
  applied: boolean;
};

/**
 * Files the already-recorded usage of some machines under a customer. The reporter only tags
 * machines from the moment its rules exist, and a machine that was never restated keeps its time
 * as "unassigned"; this moves that time. It touches only time with no owner, never a user's, and
 * running it again finds nothing left to move. Without `apply` it only reports.
 */
export async function reassignToCustomer(
  store: UsageStore,
  options: { machineIds: readonly string[]; customerId: string; apply: boolean },
): Promise<ReassignResult> {
  if (!CUSTOMER_ID_PATTERN.test(options.customerId)) {
    throw new Error("customer id must be lowercase letters, digits, '.', '_' or '-'");
  }
  const wanted = [...new Set(options.machineIds)];
  const unassigned = new Set(await store.unassignedMachineIds(1_000_000));
  const records = await store.machineRows(wanted);
  const machineIds = wanted.filter((id) => unassigned.has(id) && !records.has(id));
  const owner = customerOwner(options.customerId);
  if (options.apply) {
    for (const id of machineIds) await store.setOwner(id, owner);
  }
  const moved = new Set(machineIds);
  return {
    owner,
    machineIds,
    skipped: wanted.filter((id) => !moved.has(id)),
    applied: options.apply,
  };
}

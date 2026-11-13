import type { MachineStatus } from "@rookbox/contracts";
import type { SpaceState } from "../space/client.js";

/** A call that has been in flight longer than this is treated as lost, not as still running. */
export const OP_TTL_MS = 5 * 60_000;

export type MachineOp = "suspending" | "restoring" | "deleting";

/**
 * The dashboard's status for a machine. SPACE reports only running, paused or failed (or no
 * sandbox at all); the in-flight operation the API recorded fills in the transitions, and is
 * dropped as soon as SPACE shows the state the operation was heading for. ECW "paused" is SPACE
 * `suspended`.
 *
 * Returns null when the machine no longer exists.
 */
export function mapStatus(input: {
  space: SpaceState | "missing";
  op: MachineOp | null;
  opAt: Date | null;
  now: Date;
}): MachineStatus | null {
  const { space, op, opAt, now } = input;
  const live = op !== null && opAt !== null && now.getTime() - opAt.getTime() < OP_TTL_MS;

  if (space === "missing") return null;
  if (space === "failed") return live && op === "deleting" ? "deleting" : "failed";
  if (live) {
    if (op === "deleting") return "deleting";
    if (op === "suspending" && space === "running") return "suspending";
    if (op === "restoring" && space === "paused") return "restoring";
  }
  return space === "running" ? "running" : "suspended";
}

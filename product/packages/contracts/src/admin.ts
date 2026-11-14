import { oc } from "@orpc/contract";
import * as z from "zod";
import { API_ERRORS } from "./errors.js";

/** One machine the reconciler found on the host without a row. */
const OrphanSchema = z.object({ id: z.string(), ownerId: z.string() });

export const ReconcileInput = z.object({
  /** Fix what is safe to fix: drop rows whose machine is gone, clear stuck operations. */
  act: z.boolean().default(false),
  /** With `act`, also delete machines that exist on the host but have no row. Never the default. */
  killOrphans: z.boolean().default(false),
});
export type ReconcileInput = z.infer<typeof ReconcileInput>;

export const ReconcileReportSchema = z.object({
  mode: z.enum(["report", "act"]),
  /** Machines the host listed with an owner tag. */
  hostMachines: z.number().int(),
  /** Rows the database holds. */
  rows: z.number().int(),
  /** Tagged machines with no row, old enough to not be a create still writing its row. */
  orphans: z.array(OrphanSchema),
  /** Tagged machines with no row that are too young to judge. */
  pendingOrphans: z.number().int(),
  /** Rows whose machine the host no longer has. */
  missing: z.array(z.string()),
  /** Rows stuck in a transitional operation for too long. */
  stuck: z.array(z.object({ id: z.string(), op: z.string() })),
  /** What `act` changed. All zero in report mode. */
  fixed: z.object({
    rowsRemoved: z.number().int(),
    opsCleared: z.number().int(),
    orphansKilled: z.number().int(),
  }),
});
export type ReconcileReport = z.infer<typeof ReconcileReportSchema>;

export const SuspendUserMachinesInput = z.object({ email: z.email() });
export const SuspendUserMachinesResult = z.object({
  /** Machines that were running and are now suspended. */
  suspended: z.number().int(),
  /** Machines that were not running (already suspended, or in transition). */
  skipped: z.number().int(),
  /** Machines the host refused to suspend. */
  failed: z.number().int(),
});

/** Operator-only procedures. The API answers `FORBIDDEN` unless the caller is an admin. */
export const adminContract = {
  suspendUserMachines: oc
    .errors(API_ERRORS)
    .input(SuspendUserMachinesInput)
    .output(SuspendUserMachinesResult),
  reconcile: oc.errors(API_ERRORS).input(ReconcileInput).output(ReconcileReportSchema),
};

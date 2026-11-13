import * as z from "zod";

export const USAGE_MAX_DAYS = 90;

export const UsageSummaryInput = z.object({
  days: z.number().int().min(1).max(USAGE_MAX_DAYS).default(14),
});

export const UsageDaySchema = z.object({
  /** Calendar day in UTC, `YYYY-MM-DD`. */
  date: z.iso.date(),
  machineHours: z.number().min(0),
});
export type UsageDay = z.infer<typeof UsageDaySchema>;

export const UsageSummarySchema = z.object({
  days: z.array(UsageDaySchema),
  totalMachineHours: z.number().min(0),
  /** True when the numbers are made up for development, so screens can say so. */
  sample: z.boolean(),
});
export type UsageSummary = z.infer<typeof UsageSummarySchema>;

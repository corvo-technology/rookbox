import * as z from "zod";

/**
 * Usage is measured, not priced: every quantity is an integer in a base unit (seconds, MiB,
 * vCPU), and the dashboard converts it to hours and GiB-hours when it shows it. Nothing here
 * carries a price, a credit or a balance.
 */

export const USAGE_PERIODS = ["7d", "30d", "month"] as const;
export const UsagePeriodSchema = z.enum(USAGE_PERIODS);
export type UsagePeriod = z.infer<typeof UsagePeriodSchema>;

export const UsagePeriodInput = z.object({ period: UsagePeriodSchema });

const count = z.number().int().min(0);

const DAY_MS = 86_400_000;

export const startOfUtcDay = (at: Date) => new Date(Math.floor(at.getTime() / DAY_MS) * DAY_MS);

/**
 * The range a period covers, in UTC: `7d` and `30d` are that many calendar days ending with
 * today, `month` runs from the first of the month. Every range ends now. The dashboard's sample
 * data and the API use the same function, so the numbers line up.
 */
export function usagePeriodRange(period: UsagePeriod, now: Date): { from: Date; to: Date } {
  if (period === "month") {
    return { from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), to: now };
  }
  const days = period === "7d" ? 7 : 30;
  return { from: new Date(startOfUtcDay(now).getTime() - (days - 1) * DAY_MS), to: now };
}

/** What a set of intervals adds up to. Running figures count only the time a machine ran. */
export const UsageAmountsSchema = z.object({
  /** Seconds machines were running. */
  runningSeconds: count,
  /** Running seconds times vCPUs. */
  vcpuSeconds: count,
  /** Running seconds times memory in MiB. */
  memoryMibSeconds: count,
  /** Running seconds times disk in MiB. */
  diskMibSeconds: count,
  /** Seconds machines were suspended. */
  suspendedSeconds: count,
  /** Suspended seconds times disk in MiB. */
  suspendedDiskMibSeconds: count,
});
export type UsageAmounts = z.infer<typeof UsageAmountsSchema>;

export const UsageTotalsSchema = UsageAmountsSchema.extend({
  /** Machines that existed for any part of the period. */
  machines: count,
});
export type UsageTotals = z.infer<typeof UsageTotalsSchema>;

export const UsageDaySchema = UsageAmountsSchema.extend({
  /** A UTC calendar day, `YYYY-MM-DD`. */
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type UsageDay = z.infer<typeof UsageDaySchema>;

export const UsageMachineSchema = UsageAmountsSchema.extend({
  machineId: z.string().min(1),
  /** The machine's name, or null once it is deleted or when it was not made here. */
  name: z.string().nullable(),
  template: z.string(),
  /** The last state measured. */
  state: z.enum(["running", "suspended", "deleted"]),
});
export type UsageMachine = z.infer<typeof UsageMachineSchema>;

export const UsageRunningSchema = z.object({
  machineId: z.string().min(1),
  name: z.string().nullable(),
  template: z.string(),
  vcpu: count,
  memoryMib: count,
  diskMib: count,
  since: z.iso.datetime(),
});
export type UsageRunning = z.infer<typeof UsageRunningSchema>;

export const UsageSummarySchema = z.object({
  period: UsagePeriodSchema,
  from: z.iso.datetime(),
  to: z.iso.datetime(),
  /** True when the numbers are made-up samples (the dashboard without a server). */
  sample: z.boolean(),
  /** How often machines are looked at. Time is measured to this precision. */
  measuredEveryS: count,
  /** When the meter last reported, or null when it never has. */
  updatedAt: z.iso.datetime().nullable(),
  totals: UsageTotalsSchema,
  byDay: z.array(UsageDaySchema),
  byMachine: z.array(UsageMachineSchema),
  running: z.array(UsageRunningSchema),
});
export type UsageSummary = z.infer<typeof UsageSummarySchema>;

/**
 * Usage of a customer app (one that uses the same sandbox key but is not a dashboard user) is
 * filed under the owner `customer:<id>`. It is never a user account, so a user's own summary
 * cannot include it; only an admin sees it, in `AdminUsage.customers`.
 */
export const CUSTOMER_OWNER_PREFIX = "customer:";
export const CUSTOMER_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/** The owner string for a customer id. */
export const customerOwner = (customerId: string) => `${CUSTOMER_OWNER_PREFIX}${customerId}`;

/** The customer id in an owner string, or null when it is not a well-formed customer owner. */
export function parseCustomerOwner(owner: string | null | undefined): string | null {
  if (!owner?.startsWith(CUSTOMER_OWNER_PREFIX)) return null;
  const id = owner.slice(CUSTOMER_OWNER_PREFIX.length);
  return CUSTOMER_ID_PATTERN.test(id) ? id : null;
}

export const AdminUsageUserSchema = UsageTotalsSchema.extend({
  userId: z.string().min(1),
  email: z.string().nullable(),
});

export const AdminUsageCustomerSchema = UsageTotalsSchema.extend({
  customerId: z.string().regex(CUSTOMER_ID_PATTERN),
  /** Machines of this customer running now. */
  machinesNow: count,
});
export type AdminUsageCustomer = z.infer<typeof AdminUsageCustomerSchema>;

export const AdminUsageSchema = z.object({
  period: UsagePeriodSchema,
  from: z.iso.datetime(),
  to: z.iso.datetime(),
  reporter: z.object({
    /** The last time the meter got through to the API, a heartbeat or an event. */
    lastContactAt: z.iso.datetime().nullable(),
    lastContactAgeS: count.nullable(),
    /** The last time an event that changed something arrived. */
    lastEventAt: z.iso.datetime().nullable(),
    lastEventAgeS: count.nullable(),
    /** No contact for longer than the stale limit: open machines stop accruing time. */
    stale: z.boolean(),
  }),
  users: z.array(AdminUsageUserSchema),
  /** Customer apps such as a product built on the same sandbox key. Only an admin sees this. */
  customers: z.array(AdminUsageCustomerSchema).default([]),
  /** Machines with no known owner. Only an admin sees this. */
  unassigned: UsageTotalsSchema,
});
export type AdminUsage = z.infer<typeof AdminUsageSchema>;

/**
 * The wire format between the usage reporter and `POST /ingest/usage-events`. A request is signed
 * (see `apps/reporter/README.md`) and carries either events or a snapshot.
 */
export const REPORTER_STATES = ["running", "suspended"] as const;
export const USAGE_EVENT_TYPES = ["seen", "resumed", "suspended", "resized", "gone"] as const;
export type UsageEventType = (typeof USAGE_EVENT_TYPES)[number];

const machineFields = {
  machineId: z.string().min(1).max(128),
  /** The `rookbox.owner` tag, when the machine has one. */
  owner: z.string().min(1).max(128).nullable(),
  template: z.string().max(200),
  vcpu: z.number().int().min(0).max(4_096),
  memoryMib: z.number().int().min(0).max(100_000_000),
  diskMib: z.number().int().min(0).max(1_000_000_000),
  /** When the machine was created, as the sandbox server reports it. */
  startedAt: z.iso.datetime().nullable(),
};

export const IngestEventSchema = z.object({
  /** Position in the reporter's own outbox; only ever grows. */
  seq: z.number().int().min(1),
  /** Stable for the life of the event, so a retry is recognised. */
  key: z.string().min(1).max(256),
  type: z.enum(USAGE_EVENT_TYPES),
  observedAt: z.iso.datetime(),
  /** The state after the event; null for `gone`. */
  state: z.enum(REPORTER_STATES).nullable(),
  ...machineFields,
});
export type IngestEvent = z.infer<typeof IngestEventSchema>;

export const SnapshotMachineSchema = z.object({
  ...machineFields,
  state: z.enum(REPORTER_STATES),
});
export type SnapshotMachine = z.infer<typeof SnapshotMachineSchema>;

export const REPORTER_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

export const IngestMessageSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("events"),
    reporterId: z.string().regex(REPORTER_ID_PATTERN),
    /** How often the reporter looks at machines; shown to people as the precision of the numbers. */
    pollIntervalS: z.number().int().min(1).max(3_600).optional(),
    events: z.array(IngestEventSchema).min(1).max(500),
  }),
  z.object({
    kind: z.literal("snapshot"),
    reporterId: z.string().regex(REPORTER_ID_PATTERN),
    /** How often the reporter looks at machines; shown to people as the precision of the numbers. */
    pollIntervalS: z.number().int().min(1).max(3_600).optional(),
    seq: z.number().int().min(1),
    key: z.string().min(1).max(256),
    takenAt: z.iso.datetime(),
    machines: z.array(SnapshotMachineSchema).max(5_000),
  }),
]);
export type IngestMessage = z.infer<typeof IngestMessageSchema>;

export const IngestAckSchema = z.object({
  ok: z.literal(true),
  /** The highest sequence number in the request, all of it now stored. */
  ackedSeq: z.number().int().min(0),
  accepted: count,
  duplicates: count,
});
export type IngestAck = z.infer<typeof IngestAckSchema>;

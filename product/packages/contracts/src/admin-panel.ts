import { oc } from "@orpc/contract";
import * as z from "zod";
import { SuspendUserMachinesResult } from "./admin.js";
import { API_ERRORS } from "./errors.js";
import { MachineId, MachineSize, MachineStatus, MachineTemplate } from "./machines.js";
import { waitlistContract } from "./waitlist.js";

const ADMIN_ERRORS = { FORBIDDEN: API_ERRORS.FORBIDDEN, NOT_FOUND: API_ERRORS.NOT_FOUND } as const;

/** Why a user-management call was refused, so the dashboard can say it in the reader's language. */
export const USER_ADMIN_REASONS = [
  "name_required",
  "exists",
  "password_short",
  "password_long",
  "no_account",
  "unavailable",
  "self",
] as const;
export type UserAdminReason = (typeof USER_ADMIN_REASONS)[number];

const count = z.number().int().min(0);

/** Everything the health view shows. */
export const AdminHealthSchema = z.object({
  /** When this was measured (ISO). */
  at: z.iso.datetime(),
  api: z.object({ uptimeS: count }),
  db: z.object({ ok: z.boolean() }),
  /** The machine service behind the API. */
  host: z.object({
    ok: z.boolean(),
    reachable: z.boolean(),
    auth: z.enum(["ok", "rejected", "missing", "unknown"]),
    keyConfigured: z.boolean(),
    ms: count,
  }),
  /** The usage meter. Null when usage is off on this deployment. */
  reporter: z
    .object({
      lastContactAt: z.iso.datetime().nullable(),
      lastContactAgeS: count.nullable(),
      stale: z.boolean(),
    })
    .nullable(),
  /** Machines on the host against the limits. Null when the host could not be listed. */
  capacity: z
    .object({
      running: count,
      suspended: count,
      /** Most machines running at once across everyone; 0 means no cap. */
      maxRunning: count,
      /** Most machines one account may hold. */
      maxPerUser: count,
      /** Machines the API holds a record of. */
      rows: count,
    })
    .nullable(),
});
export type AdminHealth = z.infer<typeof AdminHealthSchema>;

export const AdminUserSchema = z.object({
  email: z.string(),
  name: z.string(),
  status: z.enum(["active", "disabled"]),
  /** In `ADMIN_EMAILS`. */
  admin: z.boolean(),
  createdAt: z.iso.datetime(),
  /** Machines the account holds a record of. */
  machines: count,
});
export type AdminUser = z.infer<typeof AdminUserSchema>;

export const CreateUserInput = z.object({
  email: z.email(),
  name: z.string().trim().min(1).max(100),
  /** A strong one is generated when omitted. */
  password: z.string().optional(),
});
export const ResetPasswordInput = z.object({ email: z.email(), password: z.string().optional() });
/** The password is returned once, by the call that set it. */
export const PasswordResult = z.object({
  email: z.string(),
  password: z.string(),
  generated: z.boolean(),
});
export type PasswordResult = z.infer<typeof PasswordResult>;
export const DisableUserInput = z.object({
  email: z.email(),
  /** Also suspend the account's running machines. */
  suspendMachines: z.boolean().default(false),
});
export const DisableUserResult = z.object({
  email: z.string(),
  suspended: SuspendUserMachinesResult.nullable(),
});
export const EnableUserInput = z.object({ email: z.email() });

export const AdminMachineSchema = z.object({
  id: MachineId,
  name: z.string(),
  template: MachineTemplate,
  status: MachineStatus,
  size: MachineSize,
  createdAt: z.iso.datetime(),
  /** The owner's email, or null when the account is gone. */
  ownerEmail: z.string().nullable(),
  ownerId: z.string(),
});
export type AdminMachine = z.infer<typeof AdminMachineSchema>;

const MachineIdInput = z.object({ id: MachineId });
const ok = z.object({ ok: z.literal(true) });

/**
 * The operator panel's procedures, part of the dashboard's contract so the in-memory fake can
 * answer them. All but `access` answer `FORBIDDEN` unless the caller is an admin.
 */
export const adminPanelContract = {
  /** Whether the caller is an admin. Never a refusal, so the dashboard can decide what to show. */
  access: oc.errors(API_ERRORS).output(z.object({ admin: z.boolean() })),
  health: oc.errors(ADMIN_ERRORS).output(AdminHealthSchema),
  users: {
    list: oc.errors(ADMIN_ERRORS).output(z.array(AdminUserSchema)),
    create: oc.errors(ADMIN_ERRORS).input(CreateUserInput).output(PasswordResult),
    resetPassword: oc.errors(ADMIN_ERRORS).input(ResetPasswordInput).output(PasswordResult),
    disable: oc.errors(ADMIN_ERRORS).input(DisableUserInput).output(DisableUserResult),
    enable: oc
      .errors(ADMIN_ERRORS)
      .input(EnableUserInput)
      .output(z.object({ email: z.string() })),
  },
  waitlist: waitlistContract,
  machines: {
    list: oc.errors(ADMIN_ERRORS).output(z.array(AdminMachineSchema)),
    suspend: oc.errors(API_ERRORS).input(MachineIdInput).output(ok),
    delete: oc.errors(API_ERRORS).input(MachineIdInput).output(ok),
  },
};

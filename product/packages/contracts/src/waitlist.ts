import { oc } from "@orpc/contract";
import * as z from "zod";
import { API_ERRORS } from "./errors.js";

export const WAITLIST_LOCALES = ["en", "pt", "es"] as const;
export type WaitlistLocale = (typeof WAITLIST_LOCALES)[number];

export const WAITLIST_NOTE_MAX = 280;

/** The body of the public `POST /waitlist` the landing page sends. */
export const JoinWaitlistInput = z.object({
  email: z.email().max(254),
  /** What they plan to run. Optional. */
  note: z.string().trim().max(WAITLIST_NOTE_MAX).optional(),
  locale: z.enum(WAITLIST_LOCALES).optional(),
  /** A honeypot: people leave it empty, scripts fill it in. */
  website: z.string().optional(),
});
export type JoinWaitlistInput = z.infer<typeof JoinWaitlistInput>;

export const WaitlistEntrySchema = z.object({
  email: z.string(),
  note: z.string().nullable(),
  locale: z.enum(WAITLIST_LOCALES),
  status: z.enum(["waiting", "invited"]),
  createdAt: z.iso.datetime(),
  invitedAt: z.iso.datetime().nullable(),
});
export type WaitlistEntry = z.infer<typeof WaitlistEntrySchema>;

export const InviteInput = z.object({ email: z.email() });
/** The password is returned once, by the call that created the account. */
export const InviteResult = z.object({
  email: z.string(),
  password: z.string(),
  /** Whether the invitation email was accepted for delivery. */
  emailed: z.boolean(),
});
export type InviteResult = z.infer<typeof InviteResult>;

const ADMIN_ERRORS = { FORBIDDEN: API_ERRORS.FORBIDDEN, NOT_FOUND: API_ERRORS.NOT_FOUND } as const;

/** The operator's view of the waitlist. Both answer `FORBIDDEN` unless the caller is an admin. */
export const waitlistContract = {
  list: oc.errors(ADMIN_ERRORS).output(z.array(WaitlistEntrySchema)),
  invite: oc.errors(ADMIN_ERRORS).input(InviteInput).output(InviteResult),
};

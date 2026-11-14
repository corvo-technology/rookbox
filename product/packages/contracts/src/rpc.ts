import type {
  ContractRouterClient,
  InferContractRouterInputs,
  InferContractRouterOutputs,
} from "@orpc/contract";
import { oc } from "@orpc/contract";
import * as z from "zod";
import {
  ApiKeySchema,
  CreateApiKeyInput,
  CreatedApiKeySchema,
  RevokeApiKeyInput,
} from "./api-keys.js";
import { ConfigSchema } from "./config.js";
import { API_ERRORS } from "./errors.js";
import {
  CreateMachineInput,
  ExecInput,
  ExecResultSchema,
  ForkMachineInput,
  MachineIdInput,
  MachineSchema,
} from "./machines.js";
import { AdminUsageSchema, UsagePeriodInput, UsageSummarySchema } from "./usage.js";

const ok = z.object({ ok: z.literal(true) });

/** The dashboard's API. `apps/api` implements it; so does the in-memory fake the dashboard uses
 * when `VITE_API_URL` is not set. */
export const appContract = {
  machines: {
    list: oc.errors(API_ERRORS).output(z.array(MachineSchema)),
    get: oc.errors(API_ERRORS).input(MachineIdInput).output(MachineSchema),
    create: oc.errors(API_ERRORS).input(CreateMachineInput).output(MachineSchema),
    suspend: oc.errors(API_ERRORS).input(MachineIdInput).output(MachineSchema),
    restore: oc.errors(API_ERRORS).input(MachineIdInput).output(MachineSchema),
    /** Copies the source's disk into a new machine. Memory is not copied. */
    fork: oc.errors(API_ERRORS).input(ForkMachineInput).output(MachineSchema),
    delete: oc.errors(API_ERRORS).input(MachineIdInput).output(ok),
    /** Runs a shell command in a running machine and waits for it to end. */
    exec: oc.errors(API_ERRORS).input(ExecInput).output(ExecResultSchema),
  },
  apiKeys: {
    list: oc.output(z.array(ApiKeySchema)),
    create: oc.input(CreateApiKeyInput).output(CreatedApiKeySchema),
    revoke: oc.errors(API_ERRORS).input(RevokeApiKeyInput).output(ok),
  },
  /** Measured usage: raw quantities, no prices. */
  usage: {
    summary: oc.input(UsagePeriodInput).output(UsageSummarySchema),
  },
  /** For admins only (`ADMIN_EMAILS`): everyone's usage, and whether the meter is reporting. */
  admin: {
    usage: oc
      .errors({ FORBIDDEN: { status: 403, message: "Admins only." } })
      .input(UsagePeriodInput)
      .output(AdminUsageSchema),
  },
  /** What this deployment offers: templates, limits and the sandbox domain. */
  config: {
    get: oc.output(ConfigSchema),
  },
};

export type AppContract = typeof appContract;
export type AppClient = ContractRouterClient<AppContract>;
export type AppInputs = InferContractRouterInputs<AppContract>;
export type AppOutputs = InferContractRouterOutputs<AppContract>;

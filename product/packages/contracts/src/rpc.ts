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
import { CreateMachineInput, ForkMachineInput, MachineIdInput, MachineSchema } from "./machines.js";
import { UsageSummaryInput, UsageSummarySchema } from "./usage.js";

/**
 * Errors every implementation raises with the same code, so screens can tell a missing machine
 * from a request the machine's state does not allow.
 */
const errors = {
  NOT_FOUND: { status: 404 },
  CONFLICT: { status: 409 },
} as const;

const ok = z.object({ ok: z.literal(true) });

/** The dashboard's API. A fake in-memory client implements it today; the real API will too. */
export const appContract = {
  machines: {
    list: oc.output(z.array(MachineSchema)),
    get: oc.errors(errors).input(MachineIdInput).output(MachineSchema),
    create: oc.errors(errors).input(CreateMachineInput).output(MachineSchema),
    suspend: oc.errors(errors).input(MachineIdInput).output(MachineSchema),
    restore: oc.errors(errors).input(MachineIdInput).output(MachineSchema),
    /** Copies the source's disk into a new machine. Memory is not copied. */
    fork: oc.errors(errors).input(ForkMachineInput).output(MachineSchema),
    delete: oc.errors(errors).input(MachineIdInput).output(ok),
  },
  apiKeys: {
    list: oc.output(z.array(ApiKeySchema)),
    create: oc.input(CreateApiKeyInput).output(CreatedApiKeySchema),
    revoke: oc.errors(errors).input(RevokeApiKeyInput).output(ok),
  },
  usage: {
    summary: oc.input(UsageSummaryInput).output(UsageSummarySchema),
  },
};

export type AppContract = typeof appContract;
export type AppClient = ContractRouterClient<AppContract>;
export type AppInputs = InferContractRouterInputs<AppContract>;
export type AppOutputs = InferContractRouterOutputs<AppContract>;

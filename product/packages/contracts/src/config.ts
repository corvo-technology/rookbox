import * as z from "zod";
import { IdleTimeoutS, MachineTemplate } from "./machines.js";

/** What this deployment allows, so the dashboard offers only what will work. */
export const ConfigSchema = z.object({
  /** Templates a machine can be created from, in the order to offer them. */
  templates: z.array(MachineTemplate),
  maxMachines: z.number().int().min(1),
  defaultIdleTimeoutS: IdleTimeoutS,
  /** The E2B domain: a sandbox port is served at `https://<port>-<id>.<domain>`. */
  domain: z.string().min(1),
});
export type Config = z.infer<typeof ConfigSchema>;

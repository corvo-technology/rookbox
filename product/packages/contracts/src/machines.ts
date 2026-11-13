import * as z from "zod";

export const MachineId = z.string().min(1).max(64);

/** `seed` is the general Linux template. `desktop` (Xvfb, noVNC and Chromium) is not offered yet. */
export const TEMPLATES = ["seed", "desktop"] as const;
export const MachineTemplate = z.enum(TEMPLATES);
export type MachineTemplate = z.infer<typeof MachineTemplate>;

/** Templates a machine can be created from today. */
export const AVAILABLE_TEMPLATES: readonly MachineTemplate[] = ["seed"];

/**
 * Lifecycle, in SPACE vocabulary: `suspend` keeps the machine's memory and releases the worker,
 * `restore` brings it back where it left off.
 */
export const MACHINE_STATUSES = [
  "creating",
  "running",
  "suspending",
  "suspended",
  "restoring",
  "deleting",
  "failed",
] as const;
export const MachineStatus = z.enum(MACHINE_STATUSES);
export type MachineStatus = z.infer<typeof MachineStatus>;

/** Bounds the API accepts; the disk ceiling matches the 128 GiB limit of SPACE's create sizing. */
export const SIZE_LIMITS = {
  vcpu: { min: 1, max: 16 },
  memoryMib: { min: 512, max: 65_536 },
  diskMib: { min: 1_024, max: 131_072 },
} as const;

export const MachineSize = z.object({
  vcpu: z.number().int().min(SIZE_LIMITS.vcpu.min).max(SIZE_LIMITS.vcpu.max),
  memoryMib: z.number().int().min(SIZE_LIMITS.memoryMib.min).max(SIZE_LIMITS.memoryMib.max),
  diskMib: z.number().int().min(SIZE_LIMITS.diskMib.min).max(SIZE_LIMITS.diskMib.max),
});
export type MachineSize = z.infer<typeof MachineSize>;

export const SIZE_PRESETS = {
  small: { vcpu: 2, memoryMib: 2_048, diskMib: 10_240 },
  medium: { vcpu: 4, memoryMib: 8_192, diskMib: 20_480 },
  large: { vcpu: 8, memoryMib: 16_384, diskMib: 40_960 },
} as const satisfies Record<string, MachineSize>;
export type SizePreset = keyof typeof SIZE_PRESETS;

/** The preset a size matches exactly, or null for a custom size. */
export function presetOf(size: MachineSize): SizePreset | null {
  for (const [name, preset] of Object.entries(SIZE_PRESETS) as [SizePreset, MachineSize][]) {
    if (
      preset.vcpu === size.vcpu &&
      preset.memoryMib === size.memoryMib &&
      preset.diskMib === size.diskMib
    ) {
      return name;
    }
  }
  return null;
}

export const MACHINE_NAME_MAX_LENGTH = 48;
export const MachineName = z
  .string()
  .trim()
  .min(1)
  .max(MACHINE_NAME_MAX_LENGTH)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "Use lowercase letters, digits and dashes.");

export const MachineSchema = z.object({
  id: MachineId,
  name: MachineName,
  template: MachineTemplate,
  status: MachineStatus,
  size: MachineSize,
  createdAt: z.iso.datetime(),
  /** The machine whose disk this one was copied from. */
  forkedFrom: MachineId.nullable(),
});
export type Machine = z.infer<typeof MachineSchema>;

export const CreateMachineInput = z.object({
  /** Generated when omitted. */
  name: MachineName.optional(),
  template: MachineTemplate,
  size: MachineSize,
});
export type CreateMachineInput = z.infer<typeof CreateMachineInput>;

export const MachineIdInput = z.object({ id: MachineId });

export const ForkMachineInput = z.object({
  id: MachineId,
  name: MachineName.optional(),
});
export type ForkMachineInput = z.infer<typeof ForkMachineInput>;

export const MACHINE_ACTIONS = ["suspend", "restore", "fork", "delete"] as const;
export type MachineAction = (typeof MACHINE_ACTIONS)[number];

/** What a person may ask of a machine in each state. Transitional states accept nothing. */
const ALLOWED: Record<MachineStatus, readonly MachineAction[]> = {
  creating: [],
  running: ["suspend", "fork", "delete"],
  suspending: [],
  suspended: ["restore", "fork", "delete"],
  restoring: [],
  deleting: [],
  failed: ["delete"],
};

export function allowedActions(status: MachineStatus): readonly MachineAction[] {
  return ALLOWED[status];
}

export function canPerform(status: MachineStatus, action: MachineAction): boolean {
  return ALLOWED[status].includes(action);
}

/** A state the machine passes through on its own; screens poll while one is showing. */
export function isTransitional(status: MachineStatus): boolean {
  return (
    status === "creating" ||
    status === "suspending" ||
    status === "restoring" ||
    status === "deleting"
  );
}

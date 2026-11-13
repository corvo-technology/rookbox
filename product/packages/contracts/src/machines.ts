import * as z from "zod";

export const MachineId = z.string().min(1).max(64);

/**
 * `seed` is the general Linux template. `desktop` adds Xvfb, noVNC and Chromium. `corvo-computer`
 * is the computer-use image.
 */
export const TEMPLATES = ["seed", "desktop", "corvo-computer"] as const;
export const MachineTemplate = z.enum(TEMPLATES);
export type MachineTemplate = z.infer<typeof MachineTemplate>;

/**
 * Every template Rookbox knows. Which of them a deployment offers is the API's `SPACE_TEMPLATES`
 * setting, served through `config.get`.
 */
export const AVAILABLE_TEMPLATES: readonly MachineTemplate[] = [...TEMPLATES];

/** Templates that serve a VNC desktop on port 6080. */
export const DESKTOP_TEMPLATES: readonly MachineTemplate[] = ["desktop", "corvo-computer"];

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

/** Idle time before a machine suspends itself, in seconds. */
export const IDLE_TIMEOUT_LIMITS = { min: 60, max: 86_400 } as const;
export const IdleTimeoutS = z
  .number()
  .int()
  .min(IDLE_TIMEOUT_LIMITS.min)
  .max(IDLE_TIMEOUT_LIMITS.max);
/** Choices the dashboard offers; the API accepts any value within the limits. */
export const IDLE_TIMEOUT_PRESETS_S = [300, 900, 3_600, 14_400] as const;

export const MACHINE_NAME_MAX_LENGTH = 48;
export const MachineName = z
  .string()
  .trim()
  .min(1)
  .max(MACHINE_NAME_MAX_LENGTH)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "Use lowercase letters, digits and dashes.");

/** How to reach a machine from outside. */
export const MachineAccessSchema = z.object({
  /** Opens the machine's desktop in a browser tab; null unless it is running and has one. */
  desktopUrl: z.string().nullable(),
  /** Public URL of a port on the machine: replace `{port}`. */
  portUrlTemplate: z.string(),
});
export type MachineAccess = z.infer<typeof MachineAccessSchema>;

export const MachineSchema = z.object({
  id: MachineId,
  name: MachineName,
  template: MachineTemplate,
  status: MachineStatus,
  size: MachineSize,
  /** Seconds without activity before the machine suspends itself. */
  idleTimeoutS: IdleTimeoutS,
  createdAt: z.iso.datetime(),
  /** The machine whose disk this one was copied from. */
  forkedFrom: MachineId.nullable(),
  access: MachineAccessSchema,
});
export type Machine = z.infer<typeof MachineSchema>;

export const CreateMachineInput = z.object({
  /** Generated when omitted. */
  name: MachineName.optional(),
  template: MachineTemplate,
  size: MachineSize,
  /** The deployment's default when omitted. */
  idleTimeoutS: IdleTimeoutS.optional(),
});
export type CreateMachineInput = z.infer<typeof CreateMachineInput>;

export const MachineIdInput = z.object({ id: MachineId });

export const ForkMachineInput = z.object({
  id: MachineId,
  name: MachineName.optional(),
});
export type ForkMachineInput = z.infer<typeof ForkMachineInput>;

export const EXEC_LIMITS = {
  commandMaxLength: 8_192,
  timeoutMs: { min: 1_000, max: 120_000, default: 30_000 },
} as const;

export const ExecInput = z.object({
  id: MachineId,
  command: z.string().min(1).max(EXEC_LIMITS.commandMaxLength),
  timeoutMs: z
    .number()
    .int()
    .min(EXEC_LIMITS.timeoutMs.min)
    .max(EXEC_LIMITS.timeoutMs.max)
    .default(EXEC_LIMITS.timeoutMs.default),
});
export type ExecInput = z.infer<typeof ExecInput>;

export const ExecResultSchema = z.object({
  stdout: z.string(),
  stderr: z.string(),
  /** Null when the command was cut off by the timeout. */
  exitCode: z.number().int().nullable(),
  /** True when output was longer than the API keeps. */
  truncated: z.boolean(),
});
export type ExecResult = z.infer<typeof ExecResultSchema>;

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

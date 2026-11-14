export type MachineState = "running" | "suspended";

/** One machine as the sandbox server lists it, reduced to what usage needs. */
export type Machine = {
  id: string;
  /** The `rookbox.owner` tag, when the machine has one. */
  owner: string | null;
  template: string;
  vcpu: number;
  memoryMib: number;
  diskMib: number;
  state: MachineState;
  /** When the machine was created, as reported (RFC 3339), or null if absent. */
  startedAt: string | null;
};

export type EventType = "seen" | "resumed" | "suspended" | "resized" | "gone";

/** An event before it has a sequence number; the outbox assigns that. */
export type EventDraft = {
  key: string;
  type: EventType;
  machineId: string;
  observedAt: string;
  /** The state after the event; null for `gone`. */
  state: MachineState | null;
  owner: string | null;
  template: string;
  vcpu: number;
  memoryMib: number;
  diskMib: number;
  startedAt: string | null;
};

export type SnapshotDraft = {
  key: string;
  takenAt: string;
  machines: (Omit<Machine, "id"> & { machineId: string })[];
};

/** The last thing known about a machine, kept between polls. */
export type Known = Machine & {
  /** The last poll that saw it, in ms since the epoch. */
  lastSeenMs: number;
  /** Consecutive polls that did not list it. */
  missed: number;
};

export type OutboxRow = {
  seq: number;
  key: string;
  kind: "event" | "snapshot";
  payload: string;
  observedMs: number;
};

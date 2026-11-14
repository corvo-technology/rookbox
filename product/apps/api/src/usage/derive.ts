/** A usage event as stored, reduced to what deriving intervals needs. */
export type EventRow = {
  /** Order of arrival; breaks ties between events observed at the same instant. */
  id: number;
  machineId: string;
  type: "seen" | "resumed" | "suspended" | "resized" | "gone";
  observedAt: Date;
  /** The state after the event; null for `gone`. */
  state: "running" | "suspended" | null;
  template: string;
  vcpu: number;
  memoryMib: number;
  diskMib: number;
};

export type IntervalDraft = {
  machineId: string;
  ownerUserId: string | null;
  template: string;
  vcpu: number;
  memoryMib: number;
  diskMib: number;
  state: "running" | "suspended";
  startedAt: Date;
  endedAt: Date | null;
  /** Whole seconds, once the interval is closed. */
  seconds: number | null;
};

const sameShape = (a: IntervalDraft, e: EventRow) =>
  a.state === e.state &&
  a.template === e.template &&
  a.vcpu === e.vcpu &&
  a.memoryMib === e.memoryMib &&
  a.diskMib === e.diskMib;

/**
 * Rebuilds one machine's intervals from all of its events. The result does not depend on the
 * order events arrived in (they are sorted by when they were observed), and an event that
 * repeats what is already true changes nothing, so a late event, a repeated one and a snapshot
 * that restates the state all land on the same answer.
 *
 * A machine is in one state at one size from an event until the next event that changes either,
 * or until a `gone` event. The last interval stays open (`endedAt` null) while the machine lives.
 */
export function deriveIntervals(
  events: readonly EventRow[],
  ownerUserId: string | null,
): IntervalDraft[] {
  const sorted = [...events].sort(
    (a, b) => a.observedAt.getTime() - b.observedAt.getTime() || a.id - b.id,
  );
  const out: IntervalDraft[] = [];
  const cur: { open: IntervalDraft | null } = { open: null };

  const close = (at: Date) => {
    const open = cur.open;
    if (!open) return;
    const ms = at.getTime() - open.startedAt.getTime();
    // An interval that lasted no time is not worth a row.
    if (ms > 0) out.push({ ...open, endedAt: at, seconds: Math.round(ms / 1000) });
    cur.open = null;
  };

  for (const event of sorted) {
    if (event.type === "gone" || event.state === null) {
      close(event.observedAt);
      continue;
    }
    if (cur.open && sameShape(cur.open, event)) continue;
    if (cur.open) close(event.observedAt);
    cur.open = {
      machineId: event.machineId,
      ownerUserId,
      template: event.template,
      vcpu: event.vcpu,
      memoryMib: event.memoryMib,
      diskMib: event.diskMib,
      state: event.state,
      startedAt: event.observedAt,
      endedAt: null,
      seconds: null,
    };
  }
  if (cur.open) out.push(cur.open);
  return out;
}

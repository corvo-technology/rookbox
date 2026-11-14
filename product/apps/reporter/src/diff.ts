import type { EventDraft, EventType, Known, Machine } from "./types.js";

export type DiffOptions = {
  diskResizeMinMib: number;
  missedPollsForGone: number;
};

export type DiffResult = {
  events: EventDraft[];
  /** Rows to write to the machine table. */
  upserts: Known[];
  /** Machines to forget. */
  removals: string[];
};

const iso = (ms: number) => new Date(ms).toISOString();

function draft(type: EventType, machine: Machine, atMs: number): EventDraft {
  return {
    // Stable: the same machine, kind of change and instant always give the same key, so a
    // repeated delivery is recognised and a re-run after a crash cannot add a duplicate.
    key: `${machine.id}:${type}:${atMs}`,
    type,
    machineId: machine.id,
    observedAt: iso(atMs),
    state: type === "gone" ? null : machine.state,
    owner: machine.owner,
    template: machine.template,
    vcpu: machine.vcpu,
    memoryMib: machine.memoryMib,
    diskMib: machine.diskMib,
    startedAt: machine.startedAt,
  };
}

/**
 * Compares the machines just listed with what was known after the last poll and says what
 * happened, as events.
 *
 * - First seen: `seen`.
 * - Running to suspended: `suspended`; back: `resumed`. A change of size in the same poll rides
 *   on that event, since every event carries the machine's full size after it.
 * - Same state, new vCPU, memory or template, or a disk reading that moved by at least the
 *   threshold: `resized`. (A listing may report the disk's use rather than its size, so small
 *   drift is not a resize.)
 * - Missing from the list for `missedPollsForGone` polls in a row: `gone`, stamped at the last
 *   poll that saw it. The delay filters out a list that was briefly incomplete; the stamp means
 *   the time is closed where it was last seen to be true. All timing is only as precise as the
 *   poll interval: a change is stamped with the poll that noticed it.
 */
export function diffMachines(
  known: ReadonlyMap<string, Known>,
  listed: readonly Machine[],
  nowMs: number,
  options: DiffOptions,
): DiffResult {
  const events: EventDraft[] = [];
  const upserts: Known[] = [];
  const removals: string[] = [];
  const seen = new Set<string>();

  for (const machine of listed) {
    seen.add(machine.id);
    const before = known.get(machine.id);
    if (!before) {
      events.push(draft("seen", machine, nowMs));
      upserts.push({ ...machine, lastSeenMs: nowMs, missed: 0 });
      continue;
    }
    const shapeChanged =
      machine.vcpu !== before.vcpu ||
      machine.memoryMib !== before.memoryMib ||
      machine.template !== before.template ||
      Math.abs(machine.diskMib - before.diskMib) >= options.diskResizeMinMib;
    let type: EventType | null = null;
    if (machine.state !== before.state)
      type = machine.state === "suspended" ? "suspended" : "resumed";
    else if (shapeChanged) type = "resized";

    // Below the threshold the disk stays where it was last reported, so drift adds up against
    // the figure the API holds instead of creeping past unnoticed.
    const reported: Machine =
      type || machine.diskMib === before.diskMib
        ? machine
        : { ...machine, diskMib: before.diskMib };
    if (type) events.push(draft(type, machine, nowMs));
    upserts.push({
      ...reported,
      owner: machine.owner ?? before.owner,
      lastSeenMs: nowMs,
      missed: 0,
    });
  }

  for (const [id, before] of known) {
    if (seen.has(id)) continue;
    const missed = before.missed + 1;
    if (missed >= options.missedPollsForGone) {
      events.push(draft("gone", before, before.lastSeenMs));
      removals.push(id);
    } else {
      upserts.push({ ...before, missed });
    }
  }
  return { events, upserts, removals };
}

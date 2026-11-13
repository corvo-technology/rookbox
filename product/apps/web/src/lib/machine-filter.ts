import type { Machine, MachineStatus } from "@rookbox/contracts";

export const STATE_FILTERS = ["all", "running", "suspended"] as const;
export type StateFilter = (typeof STATE_FILTERS)[number];

/** Machines whose name or id contains the query (case-insensitive) and that match the state. */
export function filterMachines(
  machines: readonly Machine[],
  query: string,
  state: StateFilter,
): Machine[] {
  const needle = query.trim().toLowerCase();
  return machines.filter(
    (machine) =>
      (state === "all" || machine.status === state) &&
      (!needle ||
        machine.name.toLowerCase().includes(needle) ||
        machine.id.toLowerCase().includes(needle)),
  );
}

export function countByStatus(machines: readonly Machine[], status: MachineStatus): number {
  return machines.filter((machine) => machine.status === status).length;
}

import type { AdminUsage } from "@rookbox/contracts";

const hours = (seconds: number) => (seconds / 3600).toFixed(2);
const gibHours = (mibSeconds: number) => (mibSeconds / 1024 / 3600).toFixed(2);

function age(seconds: number | null): string {
  if (seconds === null) return "never";
  if (seconds < 120) return `${seconds}s ago`;
  if (seconds < 7200) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
}

/** Plain-text admin report, one line per user. */
export function formatReport(report: AdminUsage): string {
  const lines = [
    `Usage ${report.period}: ${report.from} to ${report.to} (UTC)`,
    `Reporter: last contact ${age(report.reporter.lastContactAgeS)}, last event ${age(report.reporter.lastEventAgeS)}${
      report.reporter.stale ? "  ** QUIET: open machines have stopped accruing **" : ""
    }`,
    "",
    "user                              machines  run-h  vcpu-h  mem-GiB-h  disk-GiB-h  susp-disk-GiB-h",
  ];
  const row = (label: string, t: AdminUsage["unassigned"]) =>
    `${label.padEnd(34)}${String(t.machines).padStart(8)}  ${hours(t.runningSeconds).padStart(5)}  ${hours(
      t.vcpuSeconds,
    ).padStart(
      6,
    )}  ${gibHours(t.memoryMibSeconds).padStart(9)}  ${gibHours(t.diskMibSeconds).padStart(10)}  ${gibHours(
      t.suspendedDiskMibSeconds,
    ).padStart(15)}`;
  for (const user of report.users) lines.push(row(user.email ?? user.userId, user));
  for (const customer of report.customers)
    lines.push(row(`customer:${customer.customerId}`, customer));
  lines.push(row("(unassigned)", report.unassigned));
  return lines.join("\n");
}

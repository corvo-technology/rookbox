import { useEffect, useState } from "react";
import type { Copy } from "../i18n/copy";

type Status = "running" | "suspended" | "starting";

/** One frame per beat: the status of each of the four made-up machines. */
const FRAMES: Status[][] = [
  ["running", "running", "suspended", "starting"],
  ["running", "running", "suspended", "running"],
  ["running", "suspended", "suspended", "running"],
  ["running", "suspended", "starting", "running"],
  ["running", "suspended", "running", "running"],
];
const NAMES = ["research-agent", "browser-worker", "nightly-build", "scratch-fork"];
const SIZES = ["2 vCPU · 4 GB", "4 vCPU · 8 GB", "2 vCPU · 4 GB", "1 vCPU · 2 GB"];

type Props = { copy: Copy["visual"] };

/**
 * A faithful-looking machines list in plain HTML. Every name is made up. Machines suspend, resume
 * and start on a loop; with reduced motion it stays on one still frame.
 */
export function MachinesMock({ copy }: Props) {
  const [frame, setFrame] = useState(1);

  useEffect(() => {
    let reduce = true;
    try {
      reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {}
    if (reduce) return;
    const timer = window.setInterval(() => setFrame((n) => (n + 1) % FRAMES.length), 2200);
    return () => window.clearInterval(timer);
  }, []);

  const statuses = FRAMES[frame]!;
  const label: Record<Status, string> = {
    running: copy.running,
    suspended: copy.suspended,
    starting: copy.starting,
  };
  const count = (s: Status) => statuses.filter((x) => x === s).length;

  return (
    <div className="mm" role="img" aria-label={`${copy.illustration}: ${copy.title}`}>
      <div className="mm__bar">
        <span className="mm__dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="mm__url mono">app.rookbox.run</span>
        <span className="pill">{copy.illustration}</span>
      </div>
      <div className="mm__body" aria-hidden="true">
        <div className="mm__head">
          <strong>{copy.title}</strong>
          <span className="mm__new">+ {copy.newMachine}</span>
        </div>
        <div className="mm__stats">
          <div>
            <span>{copy.running}</span>
            <b>{count("running")}</b>
          </div>
          <div>
            <span>{copy.suspended}</span>
            <b>{count("suspended")}</b>
          </div>
          <div className="mm__hide-sm">
            <span>{copy.starting}</span>
            <b>{count("starting")}</b>
          </div>
        </div>
        <div className="mm__table">
          <div className="mm__row mm__row--head">
            <span>{copy.columns.name}</span>
            <span>{copy.columns.status}</span>
            <span className="mm__hide-sm">{copy.columns.size}</span>
            <span className="mm__hide-sm">{copy.columns.created}</span>
          </div>
          {NAMES.map((name, i) => (
            <div className="mm__row" key={name}>
              <span className="mono mm__name">{name}</span>
              <span className={`chip chip--${statuses[i]}`}>
                <i />
                {label[statuses[i]!]}
              </span>
              <span className="mm__hide-sm mm__mut">{SIZES[i]}</span>
              <span className="mm__hide-sm mm__mut">{copy.ages[i]}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mm__float mm__float--term mono" aria-hidden="true">
        <span className="mm__prompt">$</span> uname -sr
        <br />
        <span className="mm__out">Linux</span>
        <span className="cursor" />
      </div>
      <div className="mm__float mm__float--url" aria-hidden="true">
        <span>{copy.publicUrl}</span>
        <code className="mono">3000-a1b2c3.box.rookbox.run</code>
      </div>
    </div>
  );
}

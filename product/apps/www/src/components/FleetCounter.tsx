import { useEffect, useState } from "react";

const DOTS = 96;
const START = 4208;

/** Deterministic first frame, so the server and the browser draw the same thing. */
const INITIAL = Array.from({ length: DOTS }, (_, i) => (i * 7 + 3) % 5 !== 0);

type Props = {
  locale: string;
  label: string;
  demo: string;
  aria: string;
  note: string;
};

/**
 * The hero's "machines running" counter. It is illustrative: the number and the dots drift on
 * their own and are labeled as demo data. With reduced motion it stays still.
 */
export function FleetCounter({ locale, label, demo, aria, note }: Props) {
  const [lit, setLit] = useState(INITIAL);
  const [count, setCount] = useState(START);

  useEffect(() => {
    let reduce = false;
    try {
      reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {}
    if (reduce) return;
    let tick = 0;
    const timer = window.setInterval(() => {
      tick += 1;
      setLit((current) => {
        const next = current.slice();
        for (let k = 0; k < 2; k += 1) {
          const i = Math.floor(Math.random() * next.length);
          next[i] = !next[i];
        }
        return next;
      });
      if (tick % 3 === 0) setCount((c) => c + (Math.random() < 0.6 ? 1 : -1));
    }, 650);
    return () => window.clearInterval(timer);
  }, []);

  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset cannot be laid out as a centered stack
    <div className="counter" role="group" aria-label={aria}>
      <div className="counter__top">
        <span className="counter__label">{label}</span>
        <span className="badge">{demo}</span>
      </div>
      <div className="counter__big">
        <span className="live" aria-hidden="true" />
        <span>{count.toLocaleString(locale)}</span>
      </div>
      <div className="counter__dots" aria-hidden="true">
        {lit.map((on, i) => (
          <span key={i} className={on ? "dot dot--on" : "dot"} />
        ))}
      </div>
      <p className="fine">{note}</p>
    </div>
  );
}

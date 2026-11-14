/**
 * The demo, told one step at a time. On wide, tall screens the section pins and the page's scroll
 * picks the step; everywhere else (and always for the keyboard) the step buttons pick it. Either
 * way the terminal types that step's lines and a small castle shows the machine's state.
 *
 * Every line is in the markup from the start (hidden, not removed), so nothing here changes the
 * section's height. Without JavaScript or with reduced motion the whole session is just visible.
 */
import { Castle } from "./castle";
import { machineView, progressForStep, stepForKey, stepFromProgress } from "./lifecycle";

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export function initStory(reduce: boolean) {
  const story = document.querySelector<HTMLElement>("[data-story]");
  const pin = story?.querySelector<HTMLElement>("[data-pin]");
  const term = story?.querySelector<HTMLElement>("[data-term]");
  const mini = story?.querySelector<HTMLElement>("[data-mini]");
  const miniSvg = mini?.querySelector<SVGSVGElement>(".mini__svg:not(.mini__svg--fork)");
  const forkSvg = mini?.querySelector<SVGSVGElement>(".mini__svg--fork");
  const forkBox = mini?.querySelector<HTMLElement>("[data-fork-box]");
  const tag = mini?.querySelector<HTMLElement>("[data-mini-tag]");
  if (!story || !pin || !term || !mini || !miniSvg || !forkSvg || !forkBox || !tag) return;

  const buttons = [...story.querySelectorAll<HTMLButtonElement>("[data-step-btn]")];
  const tabs = [...term.querySelectorAll<HTMLButtonElement>("[data-tab]")];
  const panels = [...term.querySelectorAll<HTMLElement>("[data-panel]")];
  const count = buttons.length;
  let stickyTop = 92;

  term.setAttribute("data-js", "");
  mini.setAttribute("data-js", "");
  forkBox.dataset.label = mini.dataset.fork ?? "";
  for (const line of term.querySelectorAll<HTMLElement>(".ln"))
    line.dataset.t = line.textContent ?? "";
  for (const button of buttons) button.disabled = false;

  const castle = new Castle(miniSvg, { idle: !reduce });
  const forkCastle = new Castle(forkSvg);

  let lang = "py";
  let current = -2;
  let run = 0;
  let touched = false;

  const showLang = (id: string) => {
    lang = id;
    for (const tab of tabs) {
      const on = tab.dataset.tab === id;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      tab.classList.toggle("term__tab--sel", on);
    }
    for (const panel of panels) panel.classList.toggle("is-sel", panel.dataset.panel === id);
  };

  /** Show lines up to `step`; type the step's own lines unless `instant`. */
  const renderTerminal = async (step: number, instant: boolean) => {
    const mine = ++run;
    const typed: HTMLElement[] = [];
    for (const panel of panels) {
      const visible = panel.dataset.panel === lang;
      for (const line of panel.querySelectorAll<HTMLElement>(".ln")) {
        const own = Number(line.dataset.step);
        line.classList.remove("is-typing");
        if (own < step || (own === step && (instant || !visible))) {
          line.textContent = line.dataset.t ?? "";
          line.classList.add("is-on");
        } else if (own === step) {
          line.textContent = "";
          line.classList.add("is-on");
          typed.push(line);
        } else {
          line.classList.remove("is-on");
          line.textContent = line.dataset.t ?? "";
        }
      }
    }
    for (const line of typed) {
      if (run !== mine) return;
      const text = line.dataset.t ?? "";
      line.classList.add("is-typing");
      if (line.classList.contains("ln--c")) {
        const gap = Math.max(8, Math.min(26, 700 / Math.max(1, text.length)));
        for (let i = 1; i <= text.length; i++) {
          if (run !== mine) return;
          line.textContent = text.slice(0, i);
          await sleep(gap);
        }
        await sleep(140);
      } else {
        await sleep(120);
        if (run !== mine) return;
        line.textContent = text;
      }
      line.classList.remove("is-typing");
    }
  };

  let forkRun = 0;
  const forkMoment = async () => {
    const mine = ++forkRun;
    forkCastle.setFrac(0);
    forkBox.classList.add("is-on");
    forkBox.animate(
      [
        { opacity: 0, transform: "translateX(-14px)" },
        { opacity: 1, transform: "translateX(0)" },
      ],
      { duration: 320, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" },
    );
    await sleep(240);
    forkCastle.setFrac(1, 700);
    await sleep(1900);
    if (forkRun !== mine) return;
    forkBox
      .animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: "forwards" })
      .finished.then(() => {
        if (forkRun === mine) forkBox.classList.remove("is-on");
      });
  };

  const renderMachine = async (step: number, instant: boolean) => {
    const view = machineView(Math.max(0, step));
    if (step < 0) {
      castle.setFrac(0);
      castle.setDoor(false);
      tag.textContent = mini.dataset.booting ?? "";
      return;
    }
    castle.setFrac(view.frac, instant ? 0 : view.ms);
    castle.setDoor(view.door);
    if (step === 0 && !instant) {
      tag.textContent = mini.dataset.booting ?? "";
      await sleep(view.ms);
      if (current !== 0) return;
    }
    tag.textContent =
      view.tag === "memory" ? (mini.dataset.memory ?? "") : (mini.dataset.ready ?? "");
    mini.classList.toggle("is-suspended", view.tag === "memory");
    if (view.fork && !instant && !reduce) forkMoment();
    else if (!view.fork) {
      forkRun++;
      forkBox.classList.remove("is-on");
    }
  };

  const apply = (step: number, instant = false) => {
    if (step === current) return;
    const forward = step > current;
    current = step;
    buttons.forEach((button, i) => {
      const state = step < 0 ? "" : i < step ? "done" : i === step ? "now" : "";
      button.className = state ? `step step--${state}` : "step";
      if (i === step) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });
    renderTerminal(step, instant || !forward || reduce);
    renderMachine(step, instant || reduce);
  };

  /* ---- Modes ---- */

  const wide = window.matchMedia("(min-width: 961px) and (min-height: 700px)");
  let pinned = false;
  let lockUntil = 0;

  const syncMode = () => {
    const want = !reduce && wide.matches && pin.offsetHeight + 92 + 24 <= window.innerHeight;
    if (want !== pinned) {
      pinned = want;
      story.classList.toggle("is-pinned", want);
    }
    if (pinned) stickyTop = Number.parseFloat(getComputedStyle(pin).top) || 92;
  };

  let frame = 0;
  const onScroll = () => {
    if (!pinned || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (performance.now() < lockUntil || !seen) return;
      const rect = story.getBoundingClientRect();
      const range = rect.height - pin.offsetHeight;
      if (range <= 0) return;
      apply(stepFromProgress((stickyTop - rect.top) / range, count));
    });
  };

  const goTo = (step: number, byUser = true) => {
    if (byUser) touched = true;
    if (pinned) {
      lockUntil = performance.now() + 1100;
      const rect = story.getBoundingClientRect();
      const range = rect.height - pin.offsetHeight;
      const top = window.scrollY + rect.top - stickyTop + progressForStep(step, count) * range;
      window.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
    }
    apply(step);
  };

  /* ---- Wiring ---- */

  showLang("py");
  syncMode();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", () => {
    syncMode();
    onScroll();
  });

  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      showLang(tab.dataset.tab ?? "py");
      touched = true;
      const at = current;
      current = -2;
      apply(at, true);
    });
    tab.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      const next = tabs[(tabs.indexOf(tab) + 1) % tabs.length];
      next?.focus();
      next?.click();
    });
  }

  buttons.forEach((button, i) => {
    button.addEventListener("click", () => goTo(i));
    button.addEventListener("keydown", (event) => {
      const next = stepForKey(event.key, Math.max(0, current), count);
      if (next === null) return;
      event.preventDefault();
      goTo(next);
      buttons[next]?.focus({ preventScroll: true });
    });
  });

  let seen = false;
  if (reduce || !("IntersectionObserver" in window)) {
    seen = true;
    apply(count - 1, true);
  } else {
    apply(-1, true);
    const watcher = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting) || seen) return;
        seen = true;
        watcher.disconnect();
        apply(0);
        if (!pinned) autoplay();
        else onScroll();
      },
      { threshold: 0.4 },
    );
    watcher.observe(pin);
  }

  async function autoplay() {
    for (let i = 1; i < count; i++) {
      await sleep(2600);
      if (touched || pinned) return;
      apply(i);
    }
  }
}

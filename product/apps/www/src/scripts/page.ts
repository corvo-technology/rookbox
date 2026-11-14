/**
 * The page's behaviours: the header, sections that arrive as they scroll in, the pixel castle that
 * boots and reacts to the signup form, the demo, the E2B block, the rolling numbers, and the
 * waitlist forms. Without JavaScript, or with reduced motion, everything is simply visible.
 */
import { Castle } from "./castle";
import { initE2b } from "./e2b";
import { BOOT_MS, BOOT_STAGES, rollDuration, typedFrac } from "./lifecycle";
import { initStory } from "./story";

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

let reduce = true;
try {
  reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
} catch {}

/* Header: a solid edge once the page scrolls, and a hairline that fills as you read. */
const nav = document.querySelector<HTMLElement>("[data-nav]");
let navFrame = 0;
const onScroll = () => {
  if (navFrame) return;
  navFrame = requestAnimationFrame(() => {
    navFrame = 0;
    nav?.toggleAttribute("data-scrolled", window.scrollY > 8);
    const room = document.documentElement.scrollHeight - window.innerHeight;
    if (nav && !reduce && room > 0)
      nav.style.setProperty("--p", String(Math.min(1, window.scrollY / room)));
  });
};
onScroll();
window.addEventListener("scroll", onScroll, { passive: true });

/* Sections arrive with their own direction (see data-reveal in global.css). */
const targets = document.querySelectorAll<HTMLElement>("[data-reveal]");
if (!reduce && "IntersectionObserver" in window) {
  document.documentElement.classList.add("js-reveal");
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        }
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
  );
  for (const el of targets) observer.observe(el);
  // Fail open: anything already on screen after a moment is shown even if the observer never fired.
  window.setTimeout(() => {
    for (const el of targets) {
      if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add("is-in");
    }
  }, 1500);
} else {
  for (const el of targets) el.classList.add("is-in");
}

/* Numbers that move: a stopwatch roll, once, in real time. Transform only, so nothing reflows. */
const rolls = document.querySelectorAll<HTMLElement>("[data-roll]");
if (!reduce && "IntersectionObserver" in window && rolls.length) {
  const counter = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        counter.unobserve(entry.target);
        const el = entry.target as HTMLElement;
        const column = el.querySelector<HTMLElement>(".num__col");
        const value = Number(el.dataset.roll);
        if (!column) continue;
        const final = `translateY(${-1.5 * value}em)`;
        const animation = column.animate([{ transform: "translateY(0)" }, { transform: final }], {
          duration: rollDuration(value),
          easing: "linear",
          fill: "forwards",
        });
        animation.finished.then(() => {
          column.style.transform = final;
          animation.cancel();
        });
      }
    },
    { threshold: 0.9 },
  );
  for (const el of rolls) {
    const column = el.querySelector<HTMLElement>(".num__col");
    if (column) column.style.transform = "translateY(0)";
    counter.observe(el);
  }
}

/** Remember a language picked in the header, so the home page stops guessing from the browser. */
for (const link of document.querySelectorAll<HTMLAnchorElement>("[data-langs] a[hreflang]")) {
  link.addEventListener("click", () => {
    try {
      localStorage.setItem("rb-lang", link.hreflang.slice(0, 2).toLowerCase());
    } catch {}
  });
}

/** The header button goes to the hero form and puts the cursor in it. */
for (const join of document.querySelectorAll<HTMLAnchorElement>("[data-join]")) {
  join.addEventListener("click", (event) => {
    const input = document.querySelector<HTMLInputElement>("#hero-email");
    if (!input) return;
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    input.focus({ preventScroll: true });
  });
}

/**
 * The hero castle is a machine. It boots in about two seconds (kernel, root filesystem, waiting),
 * then idles with a few pixels flickering and brightens near the pointer. Typing lights more of it,
 * a valid address provisions all of it, and a successful signup lights the doorway with a pulse.
 * With reduced motion it is never dimmed: a finished, static picture.
 */
const rook = document.querySelector<HTMLElement>("[data-rook]");
const rookState = rook?.querySelector<HTMLElement>("[data-rook-state]");
const rookSvg = rook?.querySelector<SVGSVGElement>(".rook__svg");
const live = rook?.querySelector<HTMLElement>("[data-rook-state]")?.parentElement ?? null;
const castle =
  rook && rookSvg && rook.hasAttribute("data-js")
    ? new Castle(rookSvg, { idle: true, spotlight: true })
    : null;
let bootRun = 0;

const setRookText = (text: string) => {
  if (rookState) rookState.textContent = text;
};

if (castle && rook) {
  const mine = ++bootRun;
  live?.setAttribute("aria-live", "off");
  (async () => {
    await sleep(250);
    const started = performance.now();
    for (const stage of BOOT_STAGES) {
      await sleep(Math.max(0, stage.at - (performance.now() - started)));
      if (bootRun !== mine) return;
      castle.setFrac(stage.frac, 650);
      setRookText(stage.key === "waiting" ? (rook.dataset.waiting ?? "") : stage.key);
    }
    await sleep(Math.max(0, BOOT_MS - (performance.now() - started)));
    if (bootRun === mine) live?.setAttribute("aria-live", "polite");
  })();
}

const showRook = (state: "idle" | "typed" | "done", length: number) => {
  if (!rook) return;
  bootRun++;
  live?.setAttribute("aria-live", "polite");
  if (state === "done") {
    rook.classList.add("is-ready");
    castle?.setFrac(1, 500);
    castle?.setDoor(true);
    window.setTimeout(() => castle?.pulse(), 380);
    setRookText(rook.dataset.ready ?? "");
    return;
  }
  rook.classList.remove("is-ready");
  castle?.setDoor(false);
  setRookText(rook.dataset.waiting ?? "");
  castle?.setFrac(typedFrac(state === "typed", length), 420);
};

initStory(reduce);
initE2b(reduce);

/**
 * The waitlist forms. They post JSON to the API and show success or a plain error in place; the
 * address is only ever sent to the API the form's `data-waitlist` names.
 */
for (const form of document.querySelectorAll<HTMLFormElement>("form[data-waitlist]")) {
  const root = form.closest<HTMLElement>("[data-waitlist-root]");
  const error = form.querySelector<HTMLElement>("[data-error]");
  const submit = form.querySelector<HTMLButtonElement>("[data-submit]");
  const done = root?.querySelector<HTMLElement>("[data-done]");
  const email = form.elements.namedItem("email") as HTMLInputElement | null;
  if (!root || !error || !submit || !done || !email) continue;
  const label = submit.textContent ?? "";
  const data = form.dataset;
  const mirrors = !form.closest(".cta");

  const fail = (message: string) => {
    error.textContent = message;
    error.hidden = false;
    email.setAttribute("aria-invalid", "true");
  };

  if (mirrors) {
    email.addEventListener("input", () => {
      const value = email.value.trim();
      showRook(value && email.checkValidity() ? "typed" : "idle", value.length);
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.hidden = true;
    email.removeAttribute("aria-invalid");
    const address = email.value.trim();
    if (!address || !email.checkValidity()) {
      fail(data.errorInvalid ?? "");
      email.focus();
      return;
    }
    const website = (form.elements.namedItem("website") as HTMLInputElement | null)?.value ?? "";
    submit.disabled = true;
    submit.setAttribute("aria-busy", "true");
    submit.textContent = data.sending ?? label;
    try {
      const response = await fetch(data.waitlist ?? "", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: address, locale: data.locale, website }),
      });
      if (response.ok) {
        form.hidden = true;
        done.hidden = false;
        done.focus();
        showRook("done", address.length);
        return;
      }
      fail(
        response.status === 429
          ? (data.errorRate ?? "")
          : response.status === 400
            ? (data.errorInvalid ?? "")
            : (data.errorGeneric ?? ""),
      );
    } catch {
      fail(data.errorGeneric ?? "");
    } finally {
      submit.disabled = false;
      submit.removeAttribute("aria-busy");
      submit.textContent = label;
    }
  });
}

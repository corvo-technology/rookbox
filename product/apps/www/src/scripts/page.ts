/**
 * The page's small behaviours: a hairline under the nav once the page scrolls, sections that rise
 * in as they enter the screen, the pixel castle that reacts to the signup form, and the waitlist
 * forms. Without JavaScript, or with reduced motion, everything is simply visible.
 */
const nav = document.querySelector<HTMLElement>("[data-nav]");
const onScroll = () => nav?.toggleAttribute("data-scrolled", window.scrollY > 8);
onScroll();
window.addEventListener("scroll", onScroll, { passive: true });

let reduce = true;
try {
  reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
} catch {}

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
 * The pixel castle. Marked up fully lit; with JavaScript it starts dark, builds itself from the
 * foundation up to about 40%, then lights more pixels as an address is typed. A valid address lights
 * every wall pixel; a successful signup also lights the doorway and says "ready".
 */
const rook = document.querySelector<HTMLElement>("[data-rook]");
const rookState = rook?.querySelector<HTMLElement>("[data-rook-state]");
const pixels = rook
  ? [...rook.querySelectorAll<SVGRectElement>(".px:not(.px--door)")].sort(
      (a, b) => Number(a.dataset.o) - Number(b.dataset.o),
    )
  : [];
const total = pixels.length;
const base = Math.round(total * 0.4);
let shown = 0;
let target = 0;
let ticker: number | undefined;

const paint = () => {
  pixels.forEach((pixel, i) => {
    pixel.classList.toggle("on", i < shown);
  });
};
const tick = () => {
  shown += shown < target ? 1 : -1;
  paint();
  if (shown === target) {
    window.clearInterval(ticker);
    ticker = undefined;
  }
};
const moveTo = (next: number) => {
  target = Math.max(0, Math.min(total, next));
  window.clearInterval(ticker);
  ticker = undefined;
  if (reduce) {
    shown = target;
    paint();
  } else if (shown !== target) {
    ticker = window.setInterval(tick, 14);
  }
};
const setRookText = (key: "booting" | "waiting" | "ready") => {
  if (rook && rookState) rookState.textContent = rook.dataset[key] ?? "";
};

if (rook && total) {
  setRookText("booting");
  window.setTimeout(
    () => {
      moveTo(base);
      window.setTimeout(() => setRookText("waiting"), reduce ? 0 : base * 14 + 200);
    },
    reduce ? 0 : 450,
  );
}

const showRook = (state: "idle" | "typed" | "done", address: string) => {
  if (!rook || !total) return;
  if (state === "done") {
    rook.classList.add("is-ready");
    moveTo(total);
    setRookText("ready");
    return;
  }
  rook.classList.remove("is-ready");
  setRookText("waiting");
  const progress = Math.min(1, address.length / 22);
  moveTo(state === "typed" ? total : base + Math.round((total - base) * progress * 0.9));
};

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
      showRook(value && email.checkValidity() ? "typed" : "idle", value);
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
        showRook("done", address);
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

export {};

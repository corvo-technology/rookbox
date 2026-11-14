/**
 * The page's small behaviours: a hairline under the nav once the page scrolls, and sections that
 * rise in as they enter the screen. Without JavaScript, or with reduced motion, everything is
 * simply visible.
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

/** Remember a language picked in the footer, so the home page stops guessing from the browser. */
for (const link of document.querySelectorAll<HTMLAnchorElement>(".foot__langs a[hreflang]")) {
  link.addEventListener("click", () => {
    try {
      localStorage.setItem("rb-lang", link.hreflang.slice(0, 2).toLowerCase());
    } catch {}
  });
}

/**
 * The sample terminal in the hero mirrors the waitlist form: the address being typed appears on
 * its last line, and the line under it follows the form's state. Without JavaScript it simply
 * shows the idle text.
 */
type LiveState = "idle" | "typed" | "sending" | "done";
const live = document.querySelector<HTMLElement>("[data-live]");
const liveEmail = live?.querySelector<HTMLElement>("[data-live-email]");
const liveState = live?.querySelector<HTMLElement>("[data-live-state]");
const showLive = (state: LiveState, address: string) => {
  if (!live || !liveEmail || !liveState) return;
  live.dataset.state = state;
  liveEmail.textContent = address || (live.dataset.placeholder ?? "");
  liveEmail.classList.toggle("is-empty", !address);
  liveState.textContent = live.dataset[state] ?? "";
};

/**
 * The waitlist forms. They post JSON to the API and show success or a plain error in place; the
 * address is only ever sent to the API the form's `data-waitlist` names. After a successful join,
 * a second, optional post for the same address records what they plan to run.
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
  const mirrors = !!live && !form.closest(".cta");

  const fail = (message: string) => {
    error.textContent = message;
    error.hidden = false;
    email.setAttribute("aria-invalid", "true");
  };

  if (mirrors) {
    email.addEventListener("input", () => {
      const value = email.value.trim();
      showLive(value && email.checkValidity() ? "typed" : "idle", value);
    });
  }

  const post = (body: Record<string, unknown>) =>
    fetch(data.waitlist ?? "", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, locale: data.locale, website: "" }),
    });

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
    if (mirrors) showLive("sending", address);
    try {
      const response = await fetch(data.waitlist ?? "", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: address, locale: data.locale, website }),
      });
      if (response.ok) {
        const body = done.querySelector<HTMLElement>("[data-done-body]");
        if (body) body.textContent = (data.okBody ?? "").replace("{email}", address);
        form.hidden = true;
        root.querySelector<HTMLElement>(".wl__login")?.setAttribute("hidden", "");
        done.hidden = false;
        done.focus();
        showLive("done", address);

        const follow = done.querySelector<HTMLElement>("[data-followup]");
        const thanks = done.querySelector<HTMLElement>("[data-thanks]");
        const picks = done.querySelectorAll<HTMLButtonElement>("[data-pick]");
        for (const pick of picks) {
          pick.addEventListener("click", async () => {
            for (const other of picks) other.disabled = true;
            let saved = false;
            try {
              saved = (await post({ email: address, note: pick.dataset.pick })).ok;
            } catch {}
            if (follow) follow.hidden = true;
            if (thanks) {
              thanks.textContent = (saved ? data.followupThanks : data.followupError) ?? "";
              thanks.hidden = false;
            }
          });
        }
        return;
      }
      if (mirrors) showLive("typed", address);
      fail(
        response.status === 429
          ? (data.errorRate ?? "")
          : response.status === 400
            ? (data.errorInvalid ?? "")
            : (data.errorGeneric ?? ""),
      );
    } catch {
      if (mirrors) showLive("typed", address);
      fail(data.errorGeneric ?? "");
    } finally {
      submit.disabled = false;
      submit.removeAttribute("aria-busy");
      submit.textContent = label;
    }
  });
}

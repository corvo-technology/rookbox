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
} else {
  for (const el of targets) el.classList.add("is-in");
}

// Fail open: if the observer never fires (slow script, odd viewport, headless capture), nothing
// stays hidden.
window.setTimeout(() => {
  for (const el of targets) el.classList.add("is-in");
}, 2500);

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

  const fail = (message: string) => {
    error.textContent = message;
    error.hidden = false;
    email.setAttribute("aria-invalid", "true");
  };

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
    const uses = [...form.querySelectorAll<HTMLInputElement>('input[name="use"]:checked')].map(
      (input) => input.value,
    );
    const website = (form.elements.namedItem("website") as HTMLInputElement | null)?.value ?? "";
    submit.disabled = true;
    submit.setAttribute("aria-busy", "true");
    submit.textContent = data.sending ?? label;
    try {
      const response = await fetch(data.waitlist ?? "", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: address,
          note: uses.length ? uses.join(", ") : undefined,
          locale: data.locale,
          website,
        }),
      });
      if (response.ok) {
        const body = done.querySelector<HTMLElement>("[data-done-body]");
        if (body) body.textContent = (data.okBody ?? "").replace("{email}", address);
        form.hidden = true;
        root.querySelector<HTMLElement>(".wl__login")?.setAttribute("hidden", "");
        done.hidden = false;
        done.focus();
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

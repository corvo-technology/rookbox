/**
 * The E2B block: one env block that morphs between "before" and "with Rookbox" (the key changes,
 * one line is added), copy buttons on both blocks, and the Python / TypeScript toggle. Without
 * JavaScript the page already shows both env blocks and both code samples.
 */
const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** Copies text; falls back to a hidden textarea, then to selecting the text for Ctrl+C. */
export async function copyText(text: string, fallbackSelect?: HTMLElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {}
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    if (ok) return true;
  } catch {}
  if (fallbackSelect) {
    const range = document.createRange();
    range.selectNodeContents(fallbackSelect);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }
  return false;
}

export function initE2b(reduce: boolean) {
  const root = document.querySelector<HTMLElement>("[data-e2b]");
  const env = root?.querySelector<HTMLElement>("[data-env]");
  const code = root?.querySelector<HTMLElement>("[data-code]");
  const status = root?.querySelector<HTMLElement>("[data-copy-status]");
  if (!root || !env || !code || !status) return;

  root.setAttribute("data-js", "");
  for (const bar of root.querySelectorAll<HTMLElement>("[data-env-bar], [data-code-bar]"))
    bar.hidden = false;

  /* The morph */
  const envButtons = [...env.querySelectorAll<HTMLButtonElement>("[data-env-btn]")];
  const setEnv = (state: "before" | "after") => {
    env.dataset.state = state;
    for (const button of envButtons) {
      const on = button.dataset.envBtn === state;
      button.setAttribute("aria-pressed", String(on));
      button.classList.toggle("toggle__btn--sel", on);
    }
  };
  for (const button of envButtons) {
    button.addEventListener("click", () =>
      setEnv(button.dataset.envBtn === "before" ? "before" : "after"),
    );
  }

  if (!reduce && "IntersectionObserver" in window) {
    setEnv("before");
    const watcher = new IntersectionObserver(
      async (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        watcher.disconnect();
        await sleep(900);
        if (env.dataset.state === "before") setEnv("after");
      },
      { threshold: 0.6 },
    );
    watcher.observe(env);
  }

  /* The language toggle */
  const langButtons = [...code.querySelectorAll<HTMLButtonElement>("[data-lang-btn]")];
  const samples = [...code.querySelectorAll<HTMLElement>("pre[data-lang]")];
  const setLang = (id: string) => {
    for (const button of langButtons) {
      const on = button.dataset.langBtn === id;
      button.setAttribute("aria-pressed", String(on));
      button.classList.toggle("toggle__btn--sel", on);
    }
    for (const sample of samples) sample.hidden = sample.dataset.lang !== id;
  };
  for (const button of langButtons) {
    button.addEventListener("click", () => setLang(button.dataset.langBtn ?? "py"));
  }
  setLang("py");

  /* Copy buttons */
  const timers = new WeakMap<HTMLButtonElement, number>();
  for (const button of root.querySelectorAll<HTMLButtonElement>("[data-copy]")) {
    const label = button.textContent ?? "";
    const done = root.dataset.copied ?? "";
    button.addEventListener("click", async () => {
      const block = button.closest<HTMLElement>(".code");
      if (!block) return;
      let text: string;
      let shown: HTMLElement | null = null;
      if (block === env) {
        text =
          env.dataset.state === "before"
            ? (env.dataset.copyBefore ?? "")
            : (env.dataset.copyAfter ?? "");
        shown = env.querySelector("pre");
      } else {
        shown = block.querySelector<HTMLElement>("pre:not([hidden])");
        text = shown?.textContent ?? "";
      }
      const ok = await copyText(text, shown ?? undefined);
      if (!ok) return;
      button.textContent = done;
      button.classList.add("copy--done");
      status.textContent = "";
      // Re-set on the next frame so a second copy is announced again.
      requestAnimationFrame(() => {
        status.textContent = done;
      });
      window.clearTimeout(timers.get(button));
      timers.set(
        button,
        window.setTimeout(() => {
          button.textContent = label;
          button.classList.remove("copy--done");
        }, 1800),
      );
    });
  }
}

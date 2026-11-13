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

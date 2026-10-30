// The theme toggle, and on the case studies, which section the contents list is on.
const root = document.documentElement;
const button = document.querySelector(".theme");
const isDark = () => (root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches);

function show() {
  button.setAttribute("aria-pressed", String(isDark()));
}

if (button) {
  show();
  button.addEventListener("click", () => {
    root.dataset.theme = isDark() ? "light" : "dark";
    try {
      localStorage.setItem("theme", root.dataset.theme);
    } catch {
      // Private windows can refuse storage; the theme still applies to this page.
    }
    show();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", show);
}

const toc = document.querySelector(".toc");
if (toc && "IntersectionObserver" in window) {
  const links = new Map([...toc.querySelectorAll("a[href^='#']")].map((a) => [a.getAttribute("href").slice(1), a]));
  const visible = new Set();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) (e.isIntersecting ? visible.add(e.target.id) : visible.delete(e.target.id));
    const first = [...links.keys()].find((id) => visible.has(id));
    if (!first) return;
    for (const [id, a] of links) (id === first ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current"));
  }, { rootMargin: "-10% 0px -55% 0px" });
  for (const id of links.keys()) {
    const el = document.getElementById(id);
    if (el) io.observe(el);
  }
}

// A table or code block wider than the screen scrolls sideways. While it does, make it a stop in
// the tab order with a name, so the keyboard can scroll it too.
const scrollers = document.querySelectorAll(".table-wrap, pre");
const nameOf = (el) => (el.querySelector("caption")?.textContent.trim().slice(0, 80) || (el.tagName === "PRE" ? "Code" : "Table"));
function sync(el) {
  if (el.scrollWidth > el.clientWidth) {
    el.tabIndex = 0;
    el.setAttribute("role", "region");
    el.setAttribute("aria-label", nameOf(el));
  } else {
    for (const a of ["tabindex", "role", "aria-label"]) el.removeAttribute(a);
  }
}
if ("ResizeObserver" in window) {
  const ro = new ResizeObserver((entries) => entries.forEach((e) => sync(e.target)));
  scrollers.forEach((el) => ro.observe(el));
} else {
  scrollers.forEach(sync);
}

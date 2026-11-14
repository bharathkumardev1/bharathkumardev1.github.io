// Pinned scene: scrubs Hit@10 with scroll. Without this script (or with reduced motion) the section stays static at 0.71.
(() => {
  const climb = document.getElementById("climb");
  if (!climb || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  climb.classList.add("on");
  const wrap = climb.querySelector(".wrap"), num = document.getElementById("cl-num");
  const f2 = document.getElementById("cl-f2"), f3 = document.getElementById("cl-f3");
  const li = [1, 2, 3].map((n) => document.getElementById("cl-" + n));
  const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
  let queued = false;
  function update() {
    queued = false;
    const span = climb.offsetHeight - wrap.offsetHeight;
    const p = span > 0 ? Math.min(1, Math.max(0, -climb.getBoundingClientRect().top / span)) : 1;
    const a = ease((p - 0.12) / 0.28), b = ease((p - 0.55) / 0.28);
    num.textContent = (0.14 + 0.29 * a + 0.28 * b).toFixed(2);
    f2.style.setProperty("--k", a);
    f3.style.setProperty("--k", b);
    const s = p < 0.12 ? 0 : p < 0.55 ? 1 : 2;
    li.forEach((e, i) => e.classList.toggle("act", i === s));
  }
  addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
  addEventListener("resize", update);
  update();
})();

// Hover and keyboard readouts for the charts tools/figures.mjs writes into the page. Every
// value shown here is also in the chart's labels or its table, so nothing depends on this.
const FORMATS = {
  pct0: (x) => `${Math.round(x * 100)}%`,
  pct1: (x) => `${(x * 100).toFixed(1)}%`,
  f2: (x) => x.toFixed(2),
  int: (x) => Math.round(x).toLocaleString("en-US"),
  ms: (x) => `${x < 10 ? x.toFixed(1) : x.toFixed(0)} ms`,
  rps: (x) => `${x.toFixed(0)}/s`,
  clients: (x) => `${x} client${x === 1 ? "" : "s"}`,
  called: (x) => `${Math.round(x * 100)}% called`,
};
const fmt = (name, x) => (FORMATS[name] || String)(x);

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function place(tip, area, xPx, yPx) {
  const w = area.clientWidth;
  const tw = tip.offsetWidth;
  tip.style.left = `${xPx + 14 + tw > w ? Math.max(0, xPx - 14 - tw) : xPx + 14}px`;
  tip.style.top = `${Math.max(0, yPx)}px`;
}

for (const chart of document.querySelectorAll(".chart.live")) {
  const data = JSON.parse(chart.querySelector(".chart-data").textContent);
  const area = chart.querySelector(".area");
  const layer = chart.querySelector(".hover");
  const cross = chart.querySelector(".cross");
  const tip = chart.querySelector(".tip");
  const y = (v) => (1 - (v - data.bottom) / (data.top - data.bottom)) * 100;
  const dots = data.series.map((s) => {
    const d = el("span", `pt ${s.cls}`);
    d.style.display = "none";
    area.append(d);
    return d;
  });
  let index = -1;

  function show(i) {
    index = Math.max(0, Math.min(data.x.length - 1, i));
    const left = data.at[index];
    cross.style.left = `${left}%`;
    cross.style.display = "block";
    tip.replaceChildren(el("div", "tip-h", fmt(data.xfmt, data.x[index])));
    data.series.forEach((s, k) => {
      const row = el("div", "row");
      const name = el("span");
      name.append(el("i", `key ${s.cls}`), document.createTextNode(s.name));
      row.append(el("b", null, fmt(data.yfmt, s.y[index])), name);
      tip.append(row);
      dots[k].style.left = `${left}%`;
      dots[k].style.top = `${y(s.y[index])}%`;
      dots[k].style.display = "block";
    });
    tip.style.display = "block";
    place(tip, area, (left / 100) * area.clientWidth, 0);
    layer.setAttribute("aria-valuenow", String(index));
    layer.setAttribute("aria-valuetext", `${fmt(data.xfmt, data.x[index])}: ${data.series.map((s) => `${s.name} ${fmt(data.yfmt, s.y[index])}`).join(", ")}`);
  }

  function hide() {
    if (document.activeElement === layer) return;
    tip.style.display = cross.style.display = "none";
    for (const d of dots) d.style.display = "none";
  }

  function nearest(ev) {
    const box = layer.getBoundingClientRect();
    const p = ((ev.clientX - box.left) / box.width) * 100;
    let best = 0;
    data.at.forEach((a, i) => {
      if (Math.abs(a - p) < Math.abs(data.at[best] - p)) best = i;
    });
    return best;
  }

  layer.addEventListener("pointermove", (ev) => show(nearest(ev)));
  layer.addEventListener("pointerleave", hide);
  layer.addEventListener("click", (ev) => chart.dispatchEvent(new CustomEvent("pick", { bubbles: true, detail: { x: data.x[nearest(ev)] } })));
  layer.addEventListener("focus", () => show(index < 0 ? 0 : index));
  layer.addEventListener("blur", () => {
    tip.style.display = cross.style.display = "none";
    for (const d of dots) d.style.display = "none";
  });
  layer.addEventListener("keydown", (ev) => {
    const step = { ArrowRight: 1, ArrowLeft: -1, Home: -Infinity, End: Infinity }[ev.key];
    if (step === undefined) return;
    ev.preventDefault();
    show(Number.isFinite(step) ? index + step : step > 0 ? data.x.length - 1 : 0);
  });
}

// Points that carry their own readout: calibration deciles.
for (const area of document.querySelectorAll(".chart.points .area")) {
  const tip = area.querySelector(".tip");
  const open = (pt) => {
    tip.textContent = pt.dataset.tip;
    tip.style.display = "block";
    place(tip, area, pt.offsetLeft, Math.max(0, pt.offsetTop - tip.offsetHeight - 10));
  };
  const close = () => {
    tip.style.display = "none";
  };
  for (const pt of area.querySelectorAll(".pt[data-tip]")) {
    pt.addEventListener("pointerenter", () => open(pt));
    pt.addEventListener("pointerleave", close);
    pt.addEventListener("focus", () => open(pt));
    pt.addEventListener("blur", close);
  }
}

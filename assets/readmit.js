// The readmission case study's controls: capacity slider and chart marker, call list and patient
// scorer. Trees are scored by assets/gbdt.mjs, which the project tests against LightGBM itself;
// the slider uses the real held-out rankings, and the rows come from assets/readmit-view.mjs,
// the same code tools/build.mjs uses to write them into the page.
import { makeScorer, calibrate } from "./gbdt.mjs";
import { capacityView, listRows, patientRow, riskHtml } from "./readmit-view.mjs";

const DATA = new URL("../data/readmit/", import.meta.url);
const $ = (s) => document.querySelector(s);
const slider = $("#capacity");
const capOut = $("#capacity-out");
const table = $("#capacity-table");
const chart = $("#capacity-chart");
const marker = $("#cap-marker");
const list = $("#call-list");
const more = $("#more");
const form = $("#patient");
const riskOut = $("#risk-out");
const XMAX = Number(chart?.dataset.xmax || 0.3);

const load = (name) => fetch(new URL(name, DATA)).then((r) => {
  if (!r.ok) throw new Error(`Couldn't load ${name} (HTTP ${r.status}). The tables on this page still show the 10% list.`);
  return r.json();
});

let view = null;
let cap = null;
let model = null;
let score = null;
let calls = null;
let shown = 5;

async function capacityReady() {
  if (!view) {
    cap = await load("capacity.json");
    view = capacityView(cap);
  }
  return view;
}

async function drawCapacity() {
  const v = await capacityReady();
  const percent = Number(slider.value);
  capOut.textContent = v.out(percent);
  table.innerHTML = v.rows(percent / 100);
  if (marker) {
    marker.style.left = `${(percent / 100 / XMAX) * 100}%`;
    marker.querySelector(".flag").textContent = `${percent}% called`;
  }
}

async function showMore() {
  if (!calls) calls = await load("call_list.json");
  shown = Math.min(shown + 10, calls.length);
  list.innerHTML = listRows(calls.slice(0, shown));
  more.hidden = shown >= calls.length;
}

async function drawRisk() {
  if (!model) {
    model = await load("model.json");
    score = makeScorer(model);
  }
  const f = new FormData(form);
  const row = patientRow(model, (key) => f.get(key));
  if (!row) return; // half-typed input: keep the last answer
  const raw = score(row);
  await capacityReady();
  riskOut.innerHTML = riskHtml(calibrate(model.calibration, raw), raw >= model.call_threshold_raw, cap);
}

function fail(el) {
  return (err) => { el.innerHTML = `<p class="error">${String(err.message || err)}</p>`; };
}

slider.addEventListener("input", () => drawCapacity().catch(fail(capOut)));
chart?.addEventListener("pick", (ev) => {
  slider.value = String(Math.max(1, Math.min(30, Math.round(ev.detail.x * 100))));
  drawCapacity().catch(fail(capOut));
});
more.addEventListener("click", () => showMore().catch(fail(more.parentElement)));
form.addEventListener("input", () => drawRisk().catch(fail(riskOut)));
form.addEventListener("submit", (e) => { e.preventDefault(); drawRisk().catch(fail(riskOut)); });
more.hidden = false;

// The model is the biggest file on the page, so it loads only when the form is close to the screen.
const io = new IntersectionObserver((entries) => {
  if (entries.some((e) => e.isIntersecting)) {
    io.disconnect();
    drawRisk().catch(fail(riskOut));
  }
}, { rootMargin: "200px" });
io.observe(form);

// The readmission section: capacity slider, call list and patient scorer for
// readmission-capacity. Trees are scored by assets/gbdt.mjs, which that repo tests against
// LightGBM itself; the slider uses the real held-out rankings, and the rows come from
// assets/readmit-view.mjs, the same code tools/build.mjs uses to write them into the page.
import { makeScorer, calibrate } from "./gbdt.mjs";
import { capacityView, listRows } from "./readmit-view.mjs";

const DATA = new URL("../data/readmit/", import.meta.url);
const $ = (s) => document.querySelector(s);
const slider = $("#capacity");
const capOut = $("#capacity-out");
const table = $("#capacity-table");
const list = $("#call-list");
const more = $("#more");
const form = $("#patient");
const riskOut = $("#risk-out");

const load = (name) => fetch(new URL(name, DATA)).then((r) => {
  if (!r.ok) throw new Error(`Couldn't load ${name} (HTTP ${r.status}). The tables above still show the 10% list.`);
  return r.json();
});

let view = null;
let cap = null;
let model = null;
let score = null;
let calls = null;
let shown = 10;

async function capacityReady() {
  if (!view) {
    cap = await load("capacity.json");
    view = capacityView(cap);
  }
  return view;
}

async function drawCapacity() {
  const v = await capacityReady();
  capOut.textContent = v.out(Number(slider.value));
  table.innerHTML = v.rows(Number(slider.value) / 100);
}

async function showMore() {
  if (!calls) calls = await load("call_list.json");
  shown = Math.min(shown + 10, calls.length);
  list.innerHTML = listRows(calls.slice(0, shown));
  more.hidden = shown >= calls.length;
}

const ageMid = (band) => Number(band.slice(1, band.indexOf("-"))) + 5;

// Same points as readmit.features.lace. Charlson stays at its default, since the form
// doesn't take diagnosis codes.
function lace(los, admissionType, charlson, emergency) {
  const l = los < 1 ? 0 : los <= 3 ? los : los <= 6 ? 4 : los <= 13 ? 5 : 7;
  const a = admissionType === "1" || admissionType === "7" ? 3 : 0;
  return l + a + (charlson >= 4 ? 5 : charlson) + Math.min(emergency, 4);
}

const NUMBERS = ["time_in_hospital", "number_inpatient", "number_emergency", "number_outpatient", "num_medications", "number_diagnoses"];
const CHOICES = ["diag_1_group", "discharge_disposition_id", "insulin", "A1Cresult", "admission_type_id"];
const pct = (x) => `${(x * 100).toFixed(1)}%`;

async function drawRisk() {
  if (!model) {
    model = await load("model.json");
    score = makeScorer(model);
  }
  const f = new FormData(form);
  const row = { ...model.defaults };
  for (const key of NUMBERS) {
    const text = String(f.get(key)).trim();
    const v = text === "" ? NaN : Number(text);
    if (!Number.isFinite(v) || v < 0) return; // half-typed input: keep the last answer
    row[key] = v;
  }
  for (const key of CHOICES) row[key] = String(f.get(key));
  row.age_years = ageMid(String(f.get("age")));
  row.lace = lace(row.time_in_hospital, row.admission_type_id, row.charlson, row.number_emergency);
  const raw = score(row);
  const risk = calibrate(model.calibration, raw);
  const listed = raw >= model.call_threshold_raw;
  await capacityReady();
  riskOut.innerHTML = `<p><strong>${pct(risk)}</strong> chance of being readmitted within 30 days, against ${pct(cap.positives / cap.n)} across the held-out encounters. ` +
    (listed ? "This patient makes the 10% call list." : "This patient doesn't make the 10% call list.") + "</p>";
}

function fail(el) {
  return (err) => { el.innerHTML = `<p class="error">${String(err.message || err)}</p>`; };
}

slider.addEventListener("input", () => drawCapacity().catch(fail(capOut)));
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

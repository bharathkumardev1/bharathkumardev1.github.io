// Outreach planner and patient scorer for readmission-capacity. The trees are scored by
// assets/gbdt.mjs, which github.com/bharathkumardev1/readmission-capacity tests against
// LightGBM itself; the capacity curves are the real held-out rankings, and tests/site.test.mjs
// checks them against the numbers quoted on the page.
import { makeScorer, calibrate, capacityCurve, roundHalfEven } from "./gbdt.mjs";

const DATA = new URL("../data/readmit/", import.meta.url);
const $ = (s) => document.querySelector(s);
const slider = $("#capacity");
const capOut = $("#capacity-out");
const table = $("#capacity-table");
const form = $("#patient");
const riskOut = $("#risk-out");

const LABELS = {
  LightGBM: "LightGBM",
  "logistic regression": "Logistic regression",
  "prior inpatient visits": "Most prior inpatient stays first",
  LACE: "LACE score",
};

const load = (name) => fetch(new URL(name, DATA)).then((r) => {
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  return r.json();
});

let curves = null;
let model = null;
let score = null;

async function capacityReady() {
  if (curves) return curves;
  const cap = await load("capacity.json");
  curves = { n: cap.n, positives: cap.positives, models: {} };
  for (const name of Object.keys(LABELS)) curves.models[name] = capacityCurve(cap.ranked_labels[name], cap.n);
  return curves;
}

const pct = (x) => `${(x * 100).toFixed(1)}%`;

async function drawCapacity() {
  const share = Number(slider.value) / 100;
  const c = await capacityReady();
  const perThousand = (x) => Math.round((x / c.n) * 1000);
  const k = Math.max(1, roundHalfEven(share * c.n));
  capOut.textContent = `${slider.value}% of discharges, ${perThousand(k)} calls per 1,000 patients sent home`;
  const rows = Object.entries(c.models).map(([name, at]) => {
    const r = at(share);
    return [LABELS[name], r.caught, r.caught / r.positives, r.caught / r.flagged];
  });
  const expected = (k * c.positives) / c.n;
  rows.push(["Calling at random", expected, k / c.n, c.positives / c.n]);
  table.innerHTML = rows.map(([name, caught, recall, precision]) =>
    `<tr><td>${name}</td><td class="n">${perThousand(caught)}</td><td class="n">${pct(recall)}</td><td class="n">${pct(precision)}</td></tr>`).join("");
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
  const c = await capacityReady();
  riskOut.innerHTML = `<p><strong>${pct(risk)}</strong> chance of being readmitted within 30 days, against ${pct(c.positives / c.n)} across the held-out encounters. ` +
    (listed ? "This patient makes the 10% call list." : "This patient doesn't make the 10% call list.") + "</p>";
}

slider.addEventListener("input", () => drawCapacity().catch(fail(capOut)));
form.addEventListener("input", () => drawRisk().catch(fail(riskOut)));
form.addEventListener("submit", (e) => { e.preventDefault(); drawRisk().catch(fail(riskOut)); });

function fail(el) {
  return (err) => { el.textContent = String(err.message || err); };
}

// Load the model only when the section is close to the screen, so the page itself stays light.
const io = new IntersectionObserver((entries) => {
  if (entries.some((e) => e.isIntersecting)) {
    io.disconnect();
    drawCapacity().catch(fail(capOut));
    drawRisk().catch(fail(riskOut));
  }
}, { rootMargin: "200px" });
io.observe($("#readmission"));

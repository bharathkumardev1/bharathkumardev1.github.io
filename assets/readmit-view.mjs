// What the readmission section shows, as plain functions of the exported data. The browser
// renders the slider and the call list with them, and tools/build.mjs writes the same rows into
// index.html, so the page reads the same without JavaScript.
import { capacityCurve, roundHalfEven } from "./gbdt.mjs";

export const RANKINGS = [
  ["LightGBM", "LightGBM"],
  ["XGBoost", "XGBoost"],
  ["logistic regression", "Logistic regression"],
  ["prior inpatient stays", "Most prior inpatient stays first"],
  ["LACE", "LACE score"],
];

const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function capacityView(cap) {
  const curves = Object.fromEntries(RANKINGS.map(([name]) => [name, capacityCurve(cap.ranked_labels[name], cap.n)]));
  const calls = (share) => Math.max(1, roundHalfEven(share * cap.n));
  const perThousand = (x) => Math.round((x / cap.n) * 1000);
  return {
    curves,
    out: (percent) => `${percent}% of discharges, ${perThousand(calls(percent / 100))} calls per 1,000 patients sent home`,
    rows(share) {
      const k = calls(share);
      const rows = RANKINGS.map(([name, label]) => {
        const r = curves[name](share);
        return [label, perThousand(r.caught), pct(r.caught / r.positives), pct(r.caught / r.flagged)];
      });
      rows.push(["Calling at random", perThousand((k * cap.positives) / cap.n), pct(k / cap.n), pct(cap.positives / cap.n)]);
      return rows.map(([a, b, c, d]) => `<tr><td>${a}</td><td class="n">${b}</td><td class="n">${c}</td><td class="n">${d}</td></tr>`).join("\n");
    },
  };
}

// The extract's age bands, "[70-80)", as decades: "70s".
const age = (band) => String(band).replace(/^\[(\d+)-\d+\)$/, (_, a) => (a === "0" ? "under 10" : `${a}s`));

export function listRows(rows) {
  return rows.map((r) => `<tr><td class="n">${r.rank}</td><td class="n">${pct(r.risk, 0)}</td><td>${esc(age(r.age))}</td>` +
    `<td>${r.readmitted ? "yes" : "no"}</td><td>${r.reasons.map(esc).join("; ")}</td></tr>`).join("\n");
}

// The patient form as a model row: what's on the form, and everything else held at the
// held-out set's median or most common value. `get` reads one input by name. Returns null
// while a number is half-typed.
const NUMBERS = ["time_in_hospital", "number_inpatient", "number_emergency", "number_outpatient", "num_medications", "number_diagnoses"];
const CHOICES = ["diag_1_group", "discharge_disposition_id", "insulin", "A1Cresult", "admission_type_id"];
const ageMid = (band) => Number(band.slice(1, band.indexOf("-"))) + 5;

// Same points as readmit.features.lace. Charlson stays at its default, since the form
// doesn't take diagnosis codes.
function lace(los, admissionType, charlson, emergency) {
  const l = los < 1 ? 0 : los <= 3 ? los : los <= 6 ? 4 : los <= 13 ? 5 : 7;
  const a = admissionType === "1" || admissionType === "7" ? 3 : 0;
  return l + a + (charlson >= 4 ? 5 : charlson) + Math.min(emergency, 4);
}

export function patientRow(model, get) {
  const row = { ...model.defaults };
  for (const key of NUMBERS) {
    const text = String(get(key)).trim();
    const v = text === "" ? NaN : Number(text);
    if (!Number.isFinite(v) || v < 0) return null;
    row[key] = v;
  }
  for (const key of CHOICES) row[key] = String(get(key));
  row.age_years = ageMid(String(get("age")));
  row.lace = lace(row.time_in_hospital, row.admission_type_id, row.charlson, row.number_emergency);
  return row;
}

export function riskHtml(risk, listed, cap) {
  return `<p><strong>${pct(risk)}</strong> chance of a readmission within 30 days, against ${pct(cap.positives / cap.n)} across the held-out encounters. ` +
    (listed ? `<span class="listed">This patient makes the 10% call list.</span>` : "This patient doesn't make the 10% call list.") + "</p>";
}

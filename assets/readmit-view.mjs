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

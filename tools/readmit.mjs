// readmission-capacity: the home page's project row and the case study. Every number comes
// from data/readmit/, which `readmit export` copies out of the repo's results and artifacts.
import { RANKINGS, capacityView, listRows, patientRow, riskHtml } from "../assets/readmit-view.mjs";
import { makeScorer, calibrate } from "../assets/gbdt.mjs";
import { json, signed, pct, int, claim, facts, repo } from "./common.mjs";
import * as F from "./figures.mjs";

const M = json("data/readmit/metrics.json");
const LOAD = json("data/readmit/load.json");
const CAP = json("data/readmit/capacity.json");
const LIST = json("data/readmit/call_list.json");
const MODEL = json("data/readmit/model.json");
export const VIEW = capacityView(CAP);
const curve = (name) => VIEW.curves[name];
const sha = M.meta.git_sha.slice(0, 7);
// Alert thresholds from the repo's src/readmit/shift.py (PSI_ALERT, MISSING_ALERT).
const PSI_ALERT = 0.2;

for (const [name] of RANKINGS) {
  const r = curve(name)(0.1), m = M.test[name].top10;
  claim(r.flagged === m.flagged && Math.abs(r.caught / r.positives - m.recall) < 1e-12, `the shipped ${name} ranking gives metrics.json's recall at 10%`);
}
claim(CAP.n === M.meta.splits.test.encounters, "capacity.json is the test split");
claim(M.shipped.model === "LightGBM", "LightGBM is the shipped model");

const at10 = (name) => curve(name)(0.1);
const share10 = (name) => pct(at10(name).caught / at10(name).positives);
const one = () => LOAD.levels.find((x) => x.batch === 1 && x.concurrency === 1);
const XMAX = 0.3;

// Home page ------------------------------------------------------------------------------------

export function card() {
  claim(at10("LightGBM").caught > at10("prior inpatient stays").caught, "the model beats the prior-stays rule");
  return `<p>Readmission models judged the way a care team uses them: at a fixed call capacity, on ${int(M.meta.rows.raw)} public encounters split by patient. Each call on the list comes with its three TreeSHAP reasons, and CI retrains the model and checks the numbers on every push.</p>`;
}

export function metrics() {
  const o = one();
  return F.table({
    caption: "Held-out results", numeric: [1], head: ["Measure", "Value"], cls: "metrics",
    rows: [
      ["Readmissions reached, 10% call list", share10("LightGBM")],
      ["Most prior stays first", share10("prior inpatient stays")],
      ["LACE score", share10("LACE")],
      ["Scoring on one core", `${o.requests_per_s.toFixed(0)} req/s, ${o.p95_ms.toFixed(1)} ms p95`],
    ],
  });
}

// The chart in the project's card: the case study's Figure 1 without the slider, with its numbers
// at a few call-list sizes underneath.
export function cardChart() {
  const series = capacitySeries(["LightGBM", "prior inpatient stays", "LACE"]);
  const sizes = [0.05, 0.1, 0.2, 0.3];
  const chart = F.lineChart({
    x: { domain: [0, XMAX], ticks: [0, 0.1, 0.2, 0.3], fmt: (v) => `${Math.round(v * 100)}%`, title: "share of discharges called" },
    y: { domain: [0, 0.6], ticks: [0, 0.2, 0.4, 0.6], fmt: (v) => `${Math.round(v * 100)}%`, title: "share of readmissions reached" },
    series, height: "mid", xfmt: "called", yfmt: "pct1",
    marker: { x: 0.1, flag: "10% call list" },
    labels: series.map((s) => ({ series: s.name, x: XMAX, text: F.esc(s.name), pos: "right" })), gutter: true,
    aria: `Share of 30-day readmissions reached as the share of discharges called grows to 30%. With a 10% call list: LightGBM ${share10("LightGBM")}, most prior stays first ${share10("prior inpatient stays")}, LACE ${share10("LACE")}, random ${pct(0.1)}.`,
  });
  const at = (s, x) => s.points.find(([a]) => Math.abs(a - x) < 1e-9)[1];
  const twin = F.twin(F.table({
    caption: "Share of readmissions reached", numeric: [1, 2, 3, 4],
    head: ["Ranking", ...sizes.map((x) => `${Math.round(x * 100)}% called`)],
    rows: series.map((s) => [F.esc(s.name), ...sizes.map((x) => pct(at(s, x)))]),
  }));
  return F.figure({
    title: "Readmissions reached, by share of discharges called",
    body: `${F.legend(series.map((s) => ({ cls: s.cls, name: s.name, thin: s.thin })))}${chart}${twin}`,
    caption: `Each line ranks the ${int(CAP.n)} held-out discharges a different way and calls from the top.`,
  });
}

// Case study ------------------------------------------------------------------------------------

export function caseFacts() {
  const test = M.meta.splits.test, o = one();
  return facts([
    ["Data", `<b>${int(M.meta.rows.raw)}</b> diabetic inpatient encounters from 130 US hospitals (UCI, 1999 to 2008)`],
    ["Held out", `<b>${int(test.encounters)}</b> encounters from ${int(test.patients)} patients the models never saw`],
    ["Result", `A 10% call list reaches <b>${share10("LightGBM")}</b> of 30-day readmissions, against ${share10("prior inpatient stays")} for most prior stays first`],
    ["Serving", `<b>${o.requests_per_s.toFixed(0)}</b> single-encounter requests a second on one core, ${o.p95_ms.toFixed(1)} ms p95`],
  ]);
}

export const links = () => `<li><a href="${repo("readmission-capacity")}">Code on GitHub</a></li>
<li><a href="${repo("readmission-capacity")}/blob/main/results/RESULTS.md">Every results table</a></li>`;

export function planAbout() {
  return `<p class="about">Drag the slider or click the chart. Each line ranks the ${int(CAP.n)} held-out encounters a different way and calls from the top.</p>`;
}

function capacitySeries(names) {
  const xs = [0, ...Array.from({ length: Math.round(XMAX * 100) }, (_, i) => (i + 1) / 100)];
  const LABEL = { LightGBM: "LightGBM", "prior inpatient stays": "Most prior stays first", LACE: "LACE score" };
  const CLS = { LightGBM: "s1", "prior inpatient stays": "s2", LACE: "s0" };
  const series = names.map((name) => ({
    name: LABEL[name], cls: CLS[name],
    points: xs.map((x) => {
      if (x === 0) return [0, 0];
      const r = curve(name)(x);
      return [x, r.caught / r.positives];
    }),
  }));
  series.push({ name: "Calling at random", cls: "sx", thin: true, points: xs.map((x) => [x, x]) });
  return series;
}

export function capacityChart() {
  const series = capacitySeries(["LightGBM", "prior inpatient stays", "LACE"]);
  const end = XMAX;
  const chart = F.lineChart({
    x: { domain: [0, XMAX], ticks: [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3], fmt: (v) => `${Math.round(v * 100)}%`, title: "share of discharges called" },
    y: { domain: [0, 0.6], ticks: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6], fmt: (v) => `${Math.round(v * 100)}%`, title: "share of readmissions reached" },
    series, height: "tall", xfmt: "called", yfmt: "pct1",
    marker: { x: 0.1, flag: "10% called", id: "cap-marker" },
    labels: series.map((s) => ({ series: s.name, x: end, text: F.esc(s.name), pos: "right" })), gutter: true,
    aria: `Share of 30-day readmissions reached as the share of discharges called grows from 1% to 30%. At 10% called: LightGBM ${share10("LightGBM")}, most prior stays first ${share10("prior inpatient stays")}, LACE ${share10("LACE")}, random 10.0%. At 30%: LightGBM ${pct(curve("LightGBM")(0.3).caught / CAP.positives)}.`,
  });
  return F.figure({
    id: "fig-capacity", frame: false,
    body: `${F.legend(series.map((s) => ({ cls: s.cls, name: s.name, thin: s.thin })))}<div id="capacity-chart" data-xmax="${XMAX}">${chart}</div>`,
    caption: `<b>Figure 1.</b> Share of the ${int(CAP.positives)} held-out readmissions each ranking reaches as the team calls more of the ${int(CAP.n)} discharges, highest risk first. The vertical line is the slider.`,
  });
}

// The form's starting values, read from the page, scored the way the browser scores them.
export function defaultRisk(html) {
  const form = html.match(/<form id="patient"[\s\S]*?<\/form>/)[0];
  const values = {};
  for (const [, name, value] of form.matchAll(/<input name="([^"]+)"[^>]*value="([^"]*)"/g)) values[name] = value;
  for (const [, name, body] of form.matchAll(/<select name="([^"]+)">([\s\S]*?)<\/select>/g)) {
    const chosen = body.match(/<option value="([^"]*)" selected>/);
    if (!chosen) throw new Error(`no default for ${name}`);
    values[name] = chosen[1];
  }
  const row = patientRow(MODEL, (k) => {
    if (!(k in values)) throw new Error(`the form has no ${k}`);
    return values[k];
  });
  const raw = makeScorer(MODEL)(row);
  return riskHtml(calibrate(MODEL.calibration, raw), raw >= MODEL.call_threshold_raw, CAP);
}

export const capacityOut = () => VIEW.out(10);
export const capacityRows = () => VIEW.rows(0.1);
export const listTop = () => listRows(LIST.slice(0, 5));

export function pipeline() {
  const rows = M.meta.rows, sp = M.meta.splits, dc = M.design_checks;
  claim(rows.raw - rows.after_exclusions === rows.excluded_death_or_hospice, "exclusions add up");
  claim(sp.train.encounters + sp.valid.encounters + sp.test.encounters === rows.after_exclusions, "the splits cover every encounter kept");
  const rg = dc["race and gender as features"], built = dc["as built"];
  claim(rg.recall_at_10 <= built.recall_at_10 + 0.002, "race and gender as features don't help the list");
  const lists = Math.round(0.1 * sp.test.encounters);
  const fig = F.figure({
    id: "fig-pipeline",
    body: F.flow([
      { what: "UCI extract", how: "diabetic inpatient encounters, 130 US hospitals, 1999 to 2008", count: int(rows.raw), unit: "encounters" },
      { what: "Exclusions", how: "deaths and discharges to hospice, who can't be readmitted", count: int(rows.excluded_death_or_hospice), unit: "removed" },
      { what: "Split by patient", how: "60/20/20 by a hash of the patient number", count: int(sp.test.encounters), unit: "held out" },
      { what: "LightGBM", how: `${M.meta.features.length} features, early stopping and isotonic calibration on validation`, count: String(M.meta.trees.LightGBM), unit: "trees" },
      { what: "Call list", how: "the top 10% of discharges by risk, three TreeSHAP reasons each", count: int(at10("LightGBM").flagged), unit: "calls", strong: true },
    ], "From the extract to a call list"),
    caption: `<b>Figure 2.</b> From the public extract to the 10% call list on the held-out split.`,
  });
  claim(at10("LightGBM").flagged === lists || at10("LightGBM").flagged === lists - 1, "the call list is 10% of the held-out discharges");
  return `${fig}
<ul>
<li>Death and hospice discharges are dropped: those patients can't come back, and keeping them lifts AUROC to ${dc["keep death and hospice discharges"].test_auroc.toFixed(3)} for the wrong reason.</li>
<li>Race and gender aren't features; they're kept for the subgroup checks. As features they don't help (${pct(rg.recall_at_10)} on the list).</li>
<li>LACE is approximate here: the extract has three diagnosis codes and counts emergency visits over a year, not six months.</li>
</ul>
<details class="more"><summary>The 25 features</summary><p>Prior-year inpatient, emergency and outpatient visits; length of stay; lab, procedure and medication counts; the three diagnoses grouped as in Strack et al. (2014); a Charlson score from those ICD-9 codes; LACE; admission type and source; discharge disposition; payer; admitting specialty; A1C and glucose results; insulin, metformin and medication changes; age band.</p></details>`;
}

export function reasons() {
  const r = M.reasons_at_10;
  const first = Object.entries(r.first_reason).sort((a, b) => b[1] - a[1]);
  claim(first[0][0] === "number_inpatient" && first[1][0] === "discharge_disposition_id", "prior stays and discharge disposition lead the first reasons");
  return `<p>Every call comes with the three things that raised its score most, from exact TreeSHAP, in words a care coordinator would use; CI checks the code descriptions against the table that ships with the UCI download. Prior inpatient stays lead for ${pct(first[0][1], 0)} of the list and the discharge disposition for ${pct(first[1][1], 0)}. A reason explains the score, not the patient.</p>`;
}

export function trust() {
  const paired = M.bootstrap.paired["LightGBM - XGBoost recall@10"];
  const rule = M.bootstrap.paired["prior inpatient stays - LightGBM recall@10"];
  claim(paired.ci95[0] < 0 && paired.ci95[1] > 0 && paired.mean > 0, "LightGBM and XGBoost tie, LightGBM a hair ahead");
  claim(rule.ci95[1] < 0, "LightGBM beats the prior-stays rule");
  const more = at10("LightGBM").caught - at10("prior inpatient stays").caught;

  const mi = M.misses_at_10;
  claim(Math.abs(mi.expected_on_list - mi.caught) / mi.caught < 0.1, "calibration is within 10% on the list");
  const dec = M.calibration.LightGBM;
  const gaps = dec.map((d) => Math.abs(d.predicted - d.observed));
  const widest = gaps.indexOf(Math.max(...gaps));
  claim(widest === dec.length - 1, "the top decile has the widest calibration gap");
  const calib = F.figure({
    id: "fig-calibration",
    body: `<div class="pair"><div>` + F.scatter({
      points: dec.map((d, i) => ({ x: d.predicted, y: d.observed, tip: `Tenth ${i + 1}: ${pct(d.predicted)} predicted, ${pct(d.observed)} observed, ${int(d.n)} encounters` })),
      domain: [0, 0.3], ticks: [0, 0.1, 0.2, 0.3], fmt: (v) => `${Math.round(v * 100)}%`, xTitle: "predicted", yTitle: "observed", height: "square",
      aria: `Predicted against observed readmission rate for each tenth of the held-out encounters by risk. All ten points sit within ${(Math.max(...gaps) * 100).toFixed(1)} points of the diagonal.`,
    }) + `</div><div>` + F.table({
      head: ["Tenth by risk", "Encounters", "Predicted", "Observed"], numeric: [0, 1, 2, 3],
      rows: dec.map((d, i) => ({ cls: i === dec.length - 1 ? "on" : "", cells: [String(i + 1), int(d.n), pct(d.predicted), pct(d.observed)] })),
    }) + `</div></div>`,
    caption: `<b>Figure 3.</b> Predicted against observed 30-day readmission rate for each tenth of the held-out encounters, ranked by LightGBM's calibrated risk. A point on the diagonal is perfectly calibrated. The highlighted row is the top tenth, the same size as the call list.`,
  });

  const none = mi.readmissions_with_no_prior_visits, withVisits = mi.readmissions - none;
  const caughtWith = mi.caught - mi.caught_with_no_prior_visits;
  claim(mi.caught_with_no_prior_visits / none < caughtWith / withVisits, "the list reaches fewer of the patients with no history");
  const blind = F.figure({
    id: "fig-blind-spot",
    body: F.legend([{ cls: "box s1", name: "On the 10% call list" }, { cls: "box track", name: "Missed" }]) +
      F.partRows({
        rows: [
          { label: `No visit in the prior year (${int(none)} readmissions)`, total: none, part: mi.caught_with_no_prior_visits, value: pct(mi.caught_with_no_prior_visits / none, 0) },
          { label: `At least one visit (${int(withVisits)} readmissions)`, total: withVisits, part: caughtWith, value: pct(caughtWith / withVisits, 0) },
        ],
        domain: [0, 1500], ticks: [0, 500, 1000, 1500], fmt: int, name: "Readmissions",
        aria: `Of ${int(none)} readmitted patients with no visit in the prior year, the list reaches ${mi.caught_with_no_prior_visits}. Of ${int(withVisits)} with at least one visit, it reaches ${int(caughtWith)}.`,
      }),
    caption: `<b>Figure 4.</b> The ${int(mi.readmissions)} held-out readmissions, by whether the patient had an inpatient, emergency or outpatient visit in the year before.`,
  });
  const share = mi.share_with_prior_inpatient;
  return `<p>Against the prior-stays rule the list reaches ${(-rule.mean * 100).toFixed(1)} points more of the readmissions (95% interval ${signed(-rule.ci95[1] * 100, 1)} to ${signed(-rule.ci95[0] * 100, 1)}), ${more} more patients who came back. XGBoost ties LightGBM (${pct(M.test.XGBoost.top10.recall)} against ${pct(M.test.LightGBM.top10.recall)}); LightGBM ships because it led on validation; the held-out split played no part in choosing it.</p>
<p>The probabilities said the list would hold ${mi.expected_on_list.toFixed(0)} readmissions, and it held ${mi.caught}. Every tenth of predicted risk is within ${(Math.max(...gaps) * 100).toFixed(1)} points of what happened.</p>
${calib}
<p>The list has a blind spot: ${pct(none / mi.readmissions, 0)} of readmissions were patients with no visit in the year before, and they're ${int(mi.missed_with_no_prior_visits)} of its ${int(mi.missed)} misses. ${pct(share.on_list, 0)} of the list had a prior inpatient stay, against ${pct(share.all, 0)} of all discharges. The model finds people with a history; it misses people the record says little about.</p>
${blind}
<p>What I'd do next: evaluate the ${int(none)} readmissions among patients with no visit in the prior year as a group of their own, and check how well the features the model still has for them (diagnoses, length of stay, labs, medications, discharge disposition, age) separate those who come back from those who don't. If they separate them poorly, I'd look for data the extract doesn't have, such as admission dates or notes, before assuming a more complex model would help. I haven't run this subgroup study.</p>`;
}

const SHIFT = {
  "none (test as is)": "Nothing",
  older: "Patients 70 and over made 70% of discharges (45% in test)",
  "more prior inpatient stays": "Patients with a prior inpatient stay made 60% (33% in test)",
  "secondary diagnoses missing": "Second and third diagnoses blanked on a random 30%",
};
const ALERT = {
  "PSI age_years": "PSI on age",
  "PSI number_inpatient": "PSI on prior inpatient stays",
  "missing diag_2_group": "missing second diagnoses",
  "missing diag_3_group": "missing third diagnoses",
};
function alerts(list) {
  if (!list.length) return "none";
  if (list.length === 2 && list.every((a) => a.startsWith("missing diag_"))) return "missing-value rate on both";
  return list.map((a) => ALERT[a]).join(", ");
}
const GROUP = { AfricanAmerican: "African American", missing: "Not recorded", Female: "Women", Male: "Men" };

export function checks() {
  const shift = (name) => {
    const s = M.shifts.find((x) => x.shift === name);
    if (!s) throw new Error(`metrics.json has no shift ${name}`);
    return s;
  };
  for (const s of M.shifts) {
    if (!(s.shift in SHIFT)) throw new Error(`no description for shift ${s.shift}`);
    for (const a of s.alerts) if (!(a in ALERT)) throw new Error(`no description for alert ${a}`);
  }
  const older = shift("older"), blank = shift("secondary diagnoses missing");
  claim(older.alerts.includes("PSI age_years"), "PSI on age catches the older population");
  claim(!blank.alerts.some((a) => a.startsWith("PSI")) && blank.alerts.some((a) => a.startsWith("missing")), "only the missing-value check catches blanked diagnoses");
  const [psiName, psiMax] = Object.entries(blank.psi).sort((a, b) => b[1] - a[1])[0];
  claim(psiMax < PSI_ALERT, "no PSI alert on blanked diagnoses");
  const old70 = M.subgroups.age.find((g) => g.group === "70 and over");
  claim(Math.round((old70.n / CAP.n) * 100) === 45, "patients 70 and over are 45% of the test split");
  claim(Math.round(M.misses_at_10.share_with_prior_inpatient.all * 100) === 33, "a third of test discharges had a prior stay");
  const shifts = F.table({
    head: ["What was shifted", "Readmissions on the list", "Expected on list", "Observed", "Alerts"], numeric: [1, 2, 3],
    rows: M.shifts.map((s) => [SHIFT[s.shift], pct(s.recall_at_10), s.expected_on_list.toFixed(0), int(s.observed_on_list), alerts(s.alerts)]),
  });
  const groups = (key, keep = () => true) => M.subgroups[key].filter(keep).map((g) => [GROUP[g.group] || g.group, int(g.n), pct(g.readmit_rate), pct(g.flagged_share), pct(g.recall_at_10)]);
  const ageOrder = ["under 50", "50 to 69", "70 and over"];
  const ages = [...M.subgroups.age].sort((a, b) => ageOrder.indexOf(a.group) - ageOrder.indexOf(b.group));
  const sub = F.table({
    head: ["Group", "Encounters", "Readmitted", "On the list", "Readmissions on the list"], numeric: [1, 2, 3, 4],
    rows: [
      { group: "Age" },
      ...ages.map((g) => [g.group[0].toUpperCase() + g.group.slice(1), int(g.n), pct(g.readmit_rate), pct(g.flagged_share), pct(g.recall_at_10)]),
      { group: "Gender, as recorded" },
      ...groups("gender"),
      { group: "Race, as recorded" },
      ...groups("race"),
    ],
  });
  const miss = M.subgroups.race.find((g) => g.group === "missing");
  const missRe = Math.round(miss.n * miss.readmit_rate), missCaught = Math.round(missRe * miss.recall_at_10);
  const big = M.subgroups.race.filter((g) => g.n > 1000).map((g) => g.group);
  claim(big.length === 2 && big.includes("AfricanAmerican") && big.includes("Caucasian"), "two race groups have more than a thousand encounters");
  const dc = M.design_checks;
  const LABEL = {
    "as built": "As built",
    "split by encounter instead of patient": "Split by encounter instead of patient",
    "keep death and hospice discharges": "Death and hospice discharges kept",
    "class-weighted training (is_unbalance)": "Class-weighted training",
    "race and gender as features": "Race and gender as features",
  };
  for (const k of Object.keys(dc)) if (!(k in LABEL)) throw new Error(`no label for design check ${k}`);
  const design = F.table({
    head: ["LightGBM retrained with", "AUROC", "Readmissions on the 10% list", "Test encounters"], numeric: [1, 2, 3],
    rows: Object.entries(dc).map(([k, v]) => [LABEL[k], v.test_auroc.toFixed(3), pct(v.recall_at_10), int(v.test_n)]),
  });
  const r = (g) => pct(M.subgroups.age.find((x) => x.group === g).recall_at_10);
  const same = Object.entries(dc).filter(([k, v]) => k !== "as built" && v.test_n === dc["as built"].test_n);
  claim(same.length === 2 && same.every(([, v]) => v.recall_at_10 < dc["as built"].recall_at_10), "the variants scored on the same split don't beat the model as built");
  return `<h3>Simulated shifts</h3>
<p>The extract has no admission dates, so I shift the held-out set on purpose and check what the monitoring catches. The first two shifts resample real encounters with their real outcomes.</p>
${shifts}
<p>Calibration slips most for the older population (${older.expected_on_list.toFixed(0)} expected on the list, ${older.observed_on_list} observed). Blanking diagnoses fires no PSI alert, the largest being ${psiMax.toFixed(3)} against a threshold of ${PSI_ALERT}; only the missing-value check catches it, so monitoring needs both.</p>
<h3>Who the list reaches</h3>
<p>The list reaches ${r("under 50")} of readmissions under 50, ${r("50 to 69")} at 50 to 69 and ${r("70 and over")} at 70 and over. The ${int(miss.n)} encounters with no race recorded get ${missCaught} of their ${missRe} readmissions on the list: too few to conclude much from, and the group I'd watch.</p>
${F.twin(sub, "Every subgroup")}
<h3>Choices I tested</h3>
<p>I retrained LightGBM with one decision changed at a time. The two scored on the same held-out split, class weights and race and gender as features, both land below the model as built.</p>
${F.twin(design, "Every variant")}`;
}

export function service() {
  const o = one();
  claim(LOAD.levels.every((x) => x.errors === 0), "no scoring request failed");
  const hundred = LOAD.levels.filter((x) => x.batch === 100);
  const batchRate = hundred.reduce((a, x) => a + x.encounters_per_s, 0) / hundred.length;
  const table = F.table({
    head: ["Encounters per request", "Clients", "Encounters/s", "p50", "p95"], numeric: [0, 1, 2, 3, 4],
    rows: LOAD.levels.map((x) => [x.batch, x.concurrency, x.encounters_per_s.toFixed(0), `${x.p50_ms.toFixed(1)} ms`, `${x.p95_ms.toFixed(1)} ms`]),
  });
  return `<p><code>POST /score</code> returns calibrated risk, whether the encounter makes the call list at the configured capacity, and its three reasons. On one core it answers ${o.requests_per_s.toFixed(1)} single-encounter requests a second (p95 ${o.p95_ms.toFixed(1)} ms) and scores about ${Math.round(batchRate / 5) * 5} encounters a second in batches of 100, most of that time on exact TreeSHAP. No request failed.</p>
${F.twin(table, "Show every load level")}`;
}

export const sources = () => `<p class="sources">Numbers on this page are from the code at commit <a href="${repo("readmission-capacity")}/commit/${sha}"><code>${sha}</code></a>, run on ${M.meta.date} with LightGBM ${M.meta.lightgbm} and XGBoost ${M.meta.xgboost}. Every table <code>readmit run</code> writes is in <a href="${repo("readmission-capacity")}/blob/main/results/RESULTS.md">RESULTS.md</a>.</p>`;

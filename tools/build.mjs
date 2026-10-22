// Writes the generated parts of index.html from the projects' own results files, so no number
// on the page is typed by hand:
//
//   data/finrag/summary.json   finance-rag-eval's results/*.json, via `finrag export-demo`
//   data/readmit/metrics.json  readmission-capacity's results, via `readmit export`
//   data/readmit/load.json     its load test
//
// Claims in the prose are asserted against the numbers. If a rerun changes a conclusion, the
// build fails instead of leaving a sentence on the page that's no longer true.
//
//   node tools/build.mjs          rewrite index.html
//   node tools/build.mjs --check  exit 1 if index.html is out of date (CI runs this)
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import { Engine } from "../assets/finrag.mjs";
import { RANKINGS, capacityView, listRows } from "../assets/readmit-view.mjs";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const json = (p) => JSON.parse(read(p));

const f2 = (x) => x.toFixed(2);
const f3 = (x) => x.toFixed(3);
const ms = (x) => (x < 10 ? x.toFixed(1) : x.toFixed(0));
const signed = (x, d = 2) => (x >= 0 ? "+" : "-") + Math.abs(x).toFixed(d);
const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
const int = (x) => Math.round(x).toLocaleString("en-US");
function claim(ok, what) {
  if (!ok) throw new Error(`claim no longer holds: ${what}`);
}

// finance-rag-eval ----------------------------------------------------------------------------

const S = json("data/finrag/summary.json");
const E = S.eval;
const META = json("data/finrag/meta.json");
const QUESTIONS = json("data/finrag/questions.json");
const PARITY = json("tests/finrag_parity.json");
const rows = (split) => Object.fromEntries(E.table.filter((r) => r.split === split).map((r) => [r.config, r]));
const TEST = rows("test");
const DEV = rows("dev");
const need = (table, k) => {
  if (!(k in table)) throw new Error(`summary.json has no row for ${k}`);
  return table[k];
};
const t = (k) => need(TEST, k);
const cmp = (a, b, metric = "hit@10") => {
  const c = E.comparisons.find((x) => x.a === a && x.b === b && x.metric === metric && x.split === "test");
  if (!c) throw new Error(`summary.json has no comparison ${a} vs ${b} (${metric})`);
  return c;
};
const interval = (c) => `${signed(c.diff)}, 95% interval ${signed(c.ci95[0])} to ${signed(c.ci95[1])}`;
const spansZero = (c) => c.ci95[0] < 0 && c.ci95[1] > 0;

const NONE = "bm25/all-pages";
const FILTER = "bm25/company_year+quarter";
const ROUTE = "bm25/company_year+quarter+route";
const DROP_ALONE = "bm25/company_year+quarter+drop";
const BM = "bm25/company_year+quarter+drop+route";
const DENSE0 = "dense/all-pages";
const DENSE = "dense/company_year+quarter+route";
const HYBRID = E.headline;
claim(HYBRID === "hybrid/company_year+quarter+drop+route", "the dev split picked the full hybrid pipeline");

const LADDER = [
  [NONE, "BM25 over all 53,399 pages", ""],
  ["bm25/company", "Only filings from the company the question names", ""],
  ["bm25/company_year", "Only that company's filings for the year asked about", ""],
  [FILTER, "Narrowed to the quarter's filing when a quarter is asked about", ""],
  [ROUTE, "Statement questions sent to statement pages first", ""],
  [BM, "Company's name left out of the BM25 query", "total"],
  [DENSE, "Same pipeline, MiniLM embeddings instead of BM25", "alt"],
  [HYBRID, "Same pipeline, BM25 and MiniLM fused (my pick on the dev split)", "alt"],
];

function financeTable() {
  const body = LADDER.map(([k, label, cls]) => {
    const r = t(k);
    const [lo, hi] = r["hit@10_ci95"];
    return `<tr${cls ? ` class="${cls}"` : ""} data-config="${k}"><td>${label}</td>` +
      `<td class="n">${f2(r["hit@10"])}<span class="ci-inline">${f2(lo)} to ${f2(hi)}</span></td>` +
      `<td class="n ci">${f2(lo)} to ${f2(hi)}</td><td class="n">${f3(r["mrr@10"])}</td>` +
      `<td class="n">${ms(r.p50_ms)} / ${ms(r.p95_ms)} ms</td></tr>`;
  });
  return `<div class="table-wrap"><table>
<caption>${t(NONE).n} held-out questions. Hit@10: the labeled page is in the top 10.</caption>
<thead><tr><th>Each row adds one step to the row above</th><th class="n">Hit@10</th><th class="n ci">95% interval</th><th class="n">MRR@10</th><th class="n">p50 / p95</th></tr></thead>
<tbody>
${body.join("\n")}
</tbody></table></div>`;
}

// Statement pages among the labeled answers, read from the filings the demo ships (every
// filing a question cites is one of them), and how many held-out questions routing fires on.
function statementCounts() {
  const kindsOf = new Map();
  for (const f of META.filings.filter((x) => x.demo)) {
    const raw = JSON.parse(gunzipSync(readFileSync(new URL(`data/finrag/filings/${f.doc}.json.gz`, root))).toString("utf8"));
    kindsOf.set(f.doc, raw.kinds);
  }
  const statementGold = QUESTIONS.filter((q) => q.gold.some(([d, p]) => kindsOf.get(d)?.[p])).length;
  const engine = new Engine(META, async () => { throw new Error("not needed"); });
  const routed = QUESTIONS.filter((q) => q.split === "test" && engine.questionKinds(q.q).size).length;
  return { statementGold, routed };
}

function financeNotes() {
  const none = t(NONE), filt = t(FILTER), route = t(ROUTE), bm = t(BM), hy = t(HYBRID), dense0 = t(DENSE0);
  const cFilter = cmp(FILTER, NONE), cRoute = cmp(ROUTE, FILTER), cDrop = cmp(BM, ROUTE), cHybrid = cmp(HYBRID, BM);
  const cDense0 = cmp(DENSE0, NONE);
  const devHy = need(DEV, HYBRID), devBm = need(DEV, BM);
  const flt = E.filter.test;
  const { statementGold, routed } = statementCounts();
  claim(cFilter.ci95[0] > 0, "the filter helps");
  claim(cRoute.ci95[0] > 0 && Math.abs(cRoute.diff - cFilter.diff) <= 0.03, "routing is worth about as much as the filter");
  claim(t(DROP_ALONE)["hit@10"] < filt["hit@10"], "dropping the name hurts without routing");
  claim(spansZero(cDrop), "with routing, dropping the name is within noise");
  claim(spansZero(cHybrid) && hy["hit@10"] <= bm["hit@10"], "the hybrid doesn't beat BM25 on test");
  claim(devHy["hit@10"] > devBm["hit@10"], "the hybrid won on dev");
  claim(cDense0.ci95[0] > 0 && dense0["doc_hit@10"] > none["doc_hit@10"], "without the filter, MiniLM beats BM25 by finding the filing");
  claim(hy.p50_ms > 3 * bm.p50_ms, "the hybrid is several times slower");
  const docPct = (r) => `${Math.round(r["doc_hit@10"] * 100)}%`;
  const out = [];
  out.push(`<p>Filings share most of their vocabulary, so BM25 over everything puts a page from the right filing in its top 10 only ${docPct(none)} of the time. The filter reads the company, year and quarter from the question. It recognized the company in ${flt.company_found} of the ${flt.n} held-out questions, kept the filing with the answer for ${flt.gold_filing_kept}, narrowed 360 filings to ${flt.mean_filings_after.toFixed(1)} on average, and took Hit@10 from ${f2(none["hit@10"])} to ${f2(filt["hit@10"])} (${interval(cFilter)}).</p>`);
  out.push(`<p>Routing is worth as much again, and it's a small piece of domain knowledge. For ${statementGold} of the 150 questions the labeled page is a balance sheet, income statement or cash flow statement: a table of numbers that shares almost no words with "what is the FY2019 fixed asset turnover ratio". Questions that name a statement, or a line item or ratio that lives on one, get those pages first. ${routed} of the ${flt.n} held-out questions trigger it, and Hit@10 went from ${f2(filt["hit@10"])} to ${f2(route["hit@10"])} (${interval(cRoute)}).</p>`);
  out.push(`<p>Leaving the company's name out of the query is the step I'm least sure of. Without routing it hurts (${f2(filt["hit@10"])} to ${f2(t(DROP_ALONE)["hit@10"])}), because the name is one of the few words a statement page shares with the question. With routing it adds ${interval(cDrop)}, which is within noise.</p>`);
  out.push(`<p>The embedding model didn't earn its cost. Fused with BM25, MiniLM scored ${f2(hy["hit@10"])} against BM25's ${f2(bm["hit@10"])} on the held-out questions (${interval(cHybrid)}) and takes ${ms(hy.p50_ms)} ms a query instead of ${ms(bm.p50_ms)}. On the ${devHy.n} development questions it looked better (${f2(devHy["hit@10"])} against ${f2(devBm["hit@10"])}), which is why it's the configuration I committed to before testing; a gap that size on ${devHy.n} questions turned out to be noise. Without the filter MiniLM does beat BM25 (${f2(dense0["hit@10"])} against ${f2(none["hit@10"])}), because it finds the right filing more often (${docPct(dense0)} against ${docPct(none)}). The filter makes that redundant.</p>`);
  claim(bm.n_multi_page === hy.n_multi_page, "multi-page counts agree");
  out.push(`<p>${bm.n_multi_page} of the held-out questions need more than one page. The BM25 pipeline gets ${pct(bm["recall@10_multi_page"], 0)} of their labeled pages into the top 10, and the hybrid ${pct(hy["recall@10_multi_page"], 0)}.</p>`);

  const tax = E.taxonomy.test;
  const LABEL = {
    vocabulary_gap: "The answer page shares at most two words with the question",
    other_filing_won: "The filter kept several filings, and pages from the wrong one won",
    outranked: "The answer page shares words with the question, but other pages share more",
    no_company: "The question never names a company the filter knows",
    statement_not_detected: "Needed a statement page, but nothing in the question said so",
    filter_dropped_filing: "The filter dropped the filing with the answer",
    statement_outranked: "Right kind of statement, but another statement page ranked first",
  };
  const counted = Object.keys(LABEL).reduce((a, k) => a + (tax.counts[k] || 0), 0);
  claim(counted === tax.misses, "every miss has a category on the page");
  const order = Object.keys(LABEL).filter((k) => tax.counts[k]).sort((a, b) => tax.counts[b] - tax.counts[a]);
  claim(order[0] === "vocabulary_gap", "vocabulary gaps are the biggest group");
  claim(tax.questions - tax.misses === Math.round(hy["hit@10"] * hy.n), "the misses are the headline system's");
  out.push(`<h3>Where it still misses</h3>
<p>Each held-out question whose answer page didn't make the top 10 goes in the first stage of the pipeline that lost it. The rules run on every evaluation, so the counts change when the code does. The biggest group, narrative pages that share almost no words with the question, is the case a cross-encoder reranker is meant for.</p>
<div class="table-wrap"><table>
<thead><tr><th>${tax.misses} of ${tax.questions} held-out questions missed by the hybrid pipeline</th><th class="n">Questions</th></tr></thead>
<tbody>
${order.map((k) => `<tr><td>${LABEL[k]}</td><td class="n">${tax.counts[k]}</td></tr>`).join("\n")}
</tbody></table></div>`);
  out.push(financeService());
  out.push(financeChecks());
  out.push(`<p>Code, the evaluation, the service and the load test: <a href="https://github.com/bharathkumardev1/finance-rag-eval">github.com/bharathkumardev1/finance-rag-eval</a>. Retrieval numbers from commit <code>${E.git_sha.slice(0, 7)}</code>, ${E.date}.</p>`);
  return out.join("\n");
}

function financeService() {
  const L = S.load;
  claim(L.levels.every((r) => r.errors === 0), "no request failed in the load test");
  const at = (method, c) => {
    const r = L.levels.find((x) => x.method === method && x.concurrency === c);
    if (!r) throw new Error(`load.json has no ${method} level at ${c} clients`);
    return r;
  };
  const peak = (method) => Math.max(...L.levels.filter((x) => x.method === method).map((x) => x.throughput_rps));
  const show = [["bm25", 1], ["bm25", 4], ["bm25", 16], ["hybrid", 1], ["hybrid", 4], ["hybrid", 16]];
  const bm1 = at("bm25", 1), hy1 = at("hybrid", 1);
  claim(peak("bm25") > 2.5 * peak("hybrid"), "BM25 serves several times the hybrid's throughput");
  return `<h3>As a service</h3>
<p>Behind the FastAPI service, with one worker pinned to one CPU core and the load generator on the other, BM25 serves ${bm1.throughput_rps.toFixed(0)} requests a second to a single client (p50 ${ms(bm1.p50_ms)} ms, p95 ${ms(bm1.p95_ms)} ms) and up to ${peak("bm25").toFixed(0)} as clients are added; the hybrid tops out at ${peak("hybrid").toFixed(0)}. No request failed at any load. Pricing one vCPU at half an AWS c7i.large's on-demand rate, that's $${bm1.usd_per_million.toFixed(2)} per million BM25 queries and $${hy1.usd_per_million.toFixed(2)} for the hybrid, if this throughput carries over to that vCPU, which I haven't measured.</p>
<div class="table-wrap"><table>
<thead><tr><th>Retriever</th><th class="n">Clients</th><th class="n">Requests/s</th><th class="n">p50</th><th class="n">p95</th></tr></thead>
<tbody>
${show.map(([m, c]) => { const r = at(m, c); return `<tr><td>${m === "bm25" ? "BM25" : "Hybrid"}</td><td class="n">${c}</td><td class="n">${r.throughput_rps.toFixed(0)}</td><td class="n">${ms(r.p50_ms)} ms</td><td class="n">${ms(r.p95_ms)} ms</td></tr>`; }).join("\n")}
</tbody></table></div>`;
}

function financeChecks() {
  const inc = S.incremental, ch = S.chunks;
  claim(inc.passed && inc.max_abs_score_diff === 0 && inc.same_top100 === inc.queries, "the incremental index is exact");
  const ct = (k) => {
    const r = ch.table.find((x) => x.config === k && x.split === "test");
    if (!r) throw new Error(`chunks.json has no ${k}`);
    return r;
  };
  const pages = ct("bm25-pages/company_year+quarter+drop+route");
  const c650 = ct("bm25-chunks-650-100/company_year+quarter+drop+route");
  const c256 = ct("bm25-chunks-256-64/company_year+quarter+drop+route");
  const c128 = ct("bm25-chunks-128-32/company_year+quarter+drop+route");
  claim(c650["hit@10"] === pages["hit@10"] && c256["hit@10"] < pages["hit@10"] && c128["hit@10"] < pages["hit@10"], "smaller chunks don't beat pages");
  const batches = inc.add_batch_seconds;
  return `<h3>Two smaller checks</h3>
<p>The BM25 index is kept in segments so filings can be added without a rebuild. With ${inc.held_out_filings} filings held out and added back in batches, every score on ${inc.queries} queries matched a one-pass build exactly, and so did every top 100. A full build takes ${inc.full_build_seconds.toFixed(1)} s; each batch took ${Math.min(...batches).toFixed(2)} to ${Math.max(...batches).toFixed(2)} s.</p>
<p>Chunking pages into smaller passages didn't help. 650-token chunks score the same as whole pages (${f2(c650["hit@10"])}), and 256- and 128-token chunks score ${f2(c256["hit@10"])} and ${f2(c128["hit@10"])} while indexing two to four times as many units, so the index stays at one entry per page.</p>`;
}

function financeSizes() {
  const kb = (b) => Math.round(b / 1024);
  const index = ["meta.json", "questions.json"].reduce((a, f) => a + statSync(new URL(`data/finrag/${f}`, root)).size, 0);
  const gz = META.filings.filter((f) => f.demo).map((f) => f.gz_bytes).sort((a, b) => a - b);
  const median = gz[Math.floor(gz.length / 2)];
  return `The first search fetches ${kb(index)} KB of index data, then about ${Math.round(kb(median) / 10) * 10} KB of compressed page text for each filing it opens.`;
}

function financeScope() {
  const demo = META.filings.filter((f) => f.demo);
  const companies = new Set(demo.map((f) => f.company)).size;
  return `The demo holds the ${demo.length} filings that FinanceBench questions cite, from ${companies} companies, out of the benchmark's ${META.filings.length}.`;
}

function financeParity() {
  const questions = new Set(PARITY.map((c) => c.id)).size;
  return `Checked against the Python pipeline on every benchmark question it can search (${questions} of 150, ${PARITY.length} question and setting pairs): same top 10 pages in the same order, same scores to the last bit.`;
}

// readmission-capacity ------------------------------------------------------------------------

const M = json("data/readmit/metrics.json");
const LOAD = json("data/readmit/load.json");
const CAP = json("data/readmit/capacity.json");
const LIST = json("data/readmit/call_list.json");
const VIEW = capacityView(CAP);
const curve = (name) => VIEW.curves[name];

for (const [name] of RANKINGS) {
  const r = curve(name)(0.1), m = M.test[name].top10;
  claim(r.flagged === m.flagged && Math.abs(r.caught / r.positives - m.recall) < 1e-12, `the shipped ${name} ranking gives metrics.json's recall at 10%`);
}
claim(CAP.n === M.meta.splits.test.encounters, "capacity.json is the test split");

function readmitLead() {
  const at10 = (name) => curve(name)(0.1);
  const share = (name) => pct(at10(name).caught / at10(name).positives);
  claim(at10("LightGBM").caught > at10("prior inpatient stays").caught, "the model beats the prior-stays rule");
  return `<p>At Cigna I judged readmission models by how many high-need patients a fixed outreach capacity would reach, alongside AUC. <a href="https://github.com/bharathkumardev1/readmission-capacity">readmission-capacity</a> is the same problem on public data: ${int(M.meta.rows.raw)} diabetic inpatient encounters from 130 US hospitals (UCI, 1999 to 2008), split by patient, with death and hospice discharges removed. On ${int(CAP.n)} held-out encounters, a LightGBM call list the size of 10% of discharges holds ${share("LightGBM")} of the patients who were back within 30 days, against ${share("prior inpatient stays")} when calling whoever had the most inpatient stays in the prior year and ${share("LACE")} with the LACE index.</p>`;
}

function readmitNotes() {
  const paired = M.bootstrap.paired["LightGBM - XGBoost recall@10"];
  const rule = M.bootstrap.paired["prior inpatient stays - LightGBM recall@10"];
  claim(paired.ci95[0] < 0 && paired.ci95[1] > 0 && paired.mean > 0, "LightGBM and XGBoost tie, LightGBM a hair ahead");
  claim(rule.ci95[1] < 0, "LightGBM beats the prior-stays rule");
  const mi = M.misses_at_10;
  claim(Math.abs(mi.expected_on_list - mi.caught) / mi.caught < 0.1, "calibration is within 10% on the list");
  const shift = (name) => {
    const s = M.shifts.find((x) => x.shift === name);
    if (!s) throw new Error(`metrics.json has no shift ${name}`);
    return s;
  };
  const older = shift("older"), blank = shift("secondary diagnoses missing");
  claim(older.alerts.includes("PSI age_years"), "PSI on age catches the older population");
  claim(!blank.alerts.some((a) => a.startsWith("PSI")) && blank.alerts.some((a) => a.startsWith("missing")), "only the missing-value check catches blanked diagnoses");
  const one = LOAD.levels.find((x) => x.batch === 1 && x.concurrency === 1);
  const hundred = LOAD.levels.filter((x) => x.batch === 100);
  claim(LOAD.levels.every((x) => x.errors === 0), "no scoring request failed");
  const batchRate = hundred.reduce((a, x) => a + x.encounters_per_s, 0) / hundred.length;
  const ms0 = (x) => x.toFixed(1);
  const noHistory = mi.readmissions_with_no_prior_visits;
  return `<p>The boosting library doesn't matter here: XGBoost's list holds ${pct(M.test.XGBoost.top10.recall)} of the readmissions to LightGBM's ${pct(M.test.LightGBM.top10.recall)}, and paired over the same patients LightGBM is ahead by ${(paired.mean * 100).toFixed(1)} points (95% interval ${signed(paired.ci95[0] * 100, 1)} to ${signed(paired.ci95[1] * 100, 1)}). LightGBM ships because it led on validation. Against the prior-stays rule it reaches ${(-rule.mean * 100).toFixed(1)} points more of the readmissions (${signed(-rule.ci95[1] * 100, 1)} to ${signed(-rule.ci95[0] * 100, 1)}).</p>
<p>The calibrated probabilities said the 10% list would hold ${mi.expected_on_list.toFixed(0)} readmissions, and it held ${mi.caught}. The list has a blind spot: ${int(noHistory)} of the ${int(mi.readmissions)} readmissions (${pct(noHistory / mi.readmissions, 0)}) were patients with no inpatient, emergency or outpatient visit in the year before, and the list holds ${mi.caught_with_no_prior_visits} of them (${pct(mi.caught_with_no_prior_visits / noHistory, 0)}). They're ${int(mi.missed_with_no_prior_visits)} of its ${int(mi.missed)} misses.</p>
<p>The extract has no admission dates, so drift over time can't be tested with it. Instead I shift the held-out set on purpose. With patients 70 and over made 70% of discharges, the list holds ${pct(older.recall_at_10)} of readmissions, the model expects ${older.expected_on_list.toFixed(0)} on it where ${older.observed_on_list} happen, and the PSI check on age fires. Blanking the second and third diagnoses on 30% of encounters barely moves the list (${pct(blank.recall_at_10)}), no PSI alert fires, and only the missing-value check notices.</p>
<p>The scoring API, on one CPU core with the load generator on another, answers ${one.requests_per_s.toFixed(0)} single-encounter requests a second (p50 ${ms0(one.p50_ms)} ms, p95 ${ms0(one.p95_ms)} ms), and scores about ${Math.round(batchRate / 5) * 5} encounters a second in batches of 100, reasons included. No request failed.</p>
<p>Code, the evaluation, the service and its load test: <a href="https://github.com/bharathkumardev1/readmission-capacity">github.com/bharathkumardev1/readmission-capacity</a>. Numbers from commit <code>${M.meta.git_sha.slice(0, 7)}</code>, ${M.meta.date}.</p>`;
}

// page ----------------------------------------------------------------------------------------

export const SCRIPTS = ["index.html", "assets/site.css", "assets/demo.js", "assets/finrag.mjs", "assets/readmit.js",
  "assets/readmit-view.mjs", "assets/gbdt.mjs", "assets/fonts/public-sans-latin-wght-normal.woff2"];
function footer(html) {
  const files = SCRIPTS.map((f) => [f, f === "index.html" ? Buffer.from(html) : readFileSync(new URL(f, root))]);
  const raw = files.reduce((a, [, b]) => a + b.length, 0);
  const wire = files.reduce((a, [f, b]) => a + (f.endsWith(".woff2") ? b.length : gzipSync(b, { level: 9 }).length), 0);
  return `<p>This page is one HTML file, a stylesheet, five small scripts and one font: ${Math.round(raw / 1024)} KB, about ${Math.round(wire / 1024)} KB compressed, before either demo fetches data. Its numbers are written in by <code>tools/build.mjs</code> from the projects' results files, and the build fails if a sentence stops matching them. No framework and no analytics. <a href="https://github.com/bharathkumardev1/bharathkumardev1.github.io">Source</a>.</p>`;
}

function fill(html, name, content, inline = false) {
  const re = new RegExp(`(<!-- ${name}:start -->)[\\s\\S]*?(<!-- ${name}:end -->)`);
  if (!re.test(html)) throw new Error(`index.html has no ${name} markers`);
  return html.replace(re, inline ? `$1${content}$2` : `$1\n${content}\n$2`);
}

export function build(before) {
  let html = before;
  html = fill(html, "finrag-sizes", financeSizes(), true);
  html = fill(html, "finrag-scope", financeScope(), true);
  html = fill(html, "finrag-parity", financeParity(), true);
  html = fill(html, "finrag-results", financeTable());
  html = fill(html, "finrag-notes", financeNotes());
  html = fill(html, "readmit-lead", readmitLead());
  html = fill(html, "readmit-capacity-out", VIEW.out(10), true);
  html = fill(html, "readmit-capacity", VIEW.rows(0.1));
  html = fill(html, "readmit-list", listRows(LIST.slice(0, 10)));
  html = fill(html, "readmit-notes", readmitNotes());
  for (let i = 0; i < 3; i++) html = fill(html, "footer", footer(html)); // the footer counts its own bytes
  return html;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const before = read("index.html");
  const html = build(before);
  if (process.argv.includes("--check")) {
    if (html !== before) {
      console.error("index.html is out of date: run node tools/build.mjs");
      process.exit(1);
    }
    console.log("index.html is up to date");
  } else {
    writeFileSync(new URL("index.html", root), html);
    console.log(`wrote index.html (${Buffer.byteLength(html)} bytes)`);
  }
}

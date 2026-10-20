// Fills the generated parts of index.html from data/finrag/summary.json, so every number in
// the finance-rag-eval section comes from that repo's results file and can't drift from it.
// Claims in the prose are asserted against the numbers: if a rerun changes the conclusion,
// the build fails instead of printing a sentence that's no longer true.
//
//   node tools/build.mjs          rewrite index.html
//   node tools/build.mjs --check  exit 1 if index.html is out of date (CI)
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const s = JSON.parse(read("data/finrag/summary.json"));
const meta = JSON.parse(read("data/finrag/meta.json"));

const f2 = (x) => x.toFixed(2);
const f3 = (x) => x.toFixed(3);
const ms = (x) => (x < 10 ? x.toFixed(1) : x.toFixed(0));
const signed = (x) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(2);
const row = (split, k) => {
  if (!(k in s[split])) throw new Error(`summary.json has no ${split} row for ${k}`);
  return s[split][k];
};
const need = (k) => row("test", k);
const cmp = (a, b, metric = "hit@10") => {
  const c = s.comparisons.find((x) => x.a === a && x.b === b && x.metric === metric);
  if (!c) throw new Error(`no comparison ${a} vs ${b} (${metric})`);
  return c;
};
const interval = (c) => `${signed(c.diff)}, 95% interval ${signed(c.ci95[0])} to ${signed(c.ci95[1])}`;
const spansZero = (c) => c.ci95[0] < 0 && c.ci95[1] > 0;
function claim(ok, what) {
  if (!ok) throw new Error(`claim no longer holds: ${what}`);
}

const NONE = "bm25/none";
const FILTER = "bm25/company_year+quarter";
const ROUTE = "bm25/company_year+quarter+route";
const DROP_ALONE = "bm25/company_year+quarter+drop";
const BM = "bm25/company_year+quarter+drop+route";
const DENSE = "dense/company_year+quarter+route";
const HYBRID = "hybrid/company_year+quarter+drop+route";

const ROWS = [
  [NONE, "BM25 over all 53,399 pages", ""],
  ["bm25/company", "Only filings from the company the question names", ""],
  ["bm25/company_year", "Only that company's filings for the year asked about", ""],
  [FILTER, "Narrowed to the quarter's filing when a quarter is asked about", ""],
  [ROUTE, "Statement questions sent to statement pages first", ""],
  [BM, "Company's name left out of the BM25 query", "total"],
  [DENSE, "Same pipeline, MiniLM embeddings instead of BM25", "alt"],
  [HYBRID, "Same pipeline, BM25 and MiniLM fused (my pick on the dev split)", "alt"],
];

function resultsTable() {
  const rows = ROWS.map(([k, label, cls]) => {
    const r = need(k);
    return `<tr${cls ? ` class="${cls}"` : ""} data-config="${k}"><td>${label}</td>` +
      `<td class="n">${f2(r["hit@10"])}<span class="ci-inline">${f2(r["hit@10_ci95"][0])}–${f2(r["hit@10_ci95"][1])}</span></td>` +
      `<td class="n ci">${f2(r["hit@10_ci95"][0])} to ${f2(r["hit@10_ci95"][1])}</td>` +
      `<td class="n">${f3(r["mrr@10"])}</td><td class="n">${ms(r.p50_ms)} ms</td></tr>`;
  });
  return `<div class="table-wrap"><table>
<caption>${need(NONE).n} held-out questions. Hit@10: the labeled page is in the top 10.</caption>
<thead><tr><th>Each row adds one step to the row above</th><th class="n">Hit@10</th><th class="n ci">95% interval</th><th class="n">MRR@10</th><th class="n">p50 latency</th></tr></thead>
<tbody>
${rows.join("\n")}
</tbody></table></div>`;
}

function notes() {
  const none = need(NONE), filt = need(FILTER), route = need(ROUTE), bm = need(BM), hy = need(HYBRID);
  const dense0 = need("dense/none");
  const cFilter = cmp(FILTER, NONE), cRoute = cmp(ROUTE, FILTER), cDrop = cmp(BM, ROUTE);
  const cHybrid = cmp(HYBRID, BM), cDense = cmp("dense/none", NONE);
  const devHy = row("dev", HYBRID), devBm = row("dev", BM);
  const corpus = s.corpus, flt = s.filter.test;
  claim(cFilter.ci95[0] > 0, "the filter helps");
  claim(cRoute.ci95[0] > 0 && Math.abs(cRoute.diff - cFilter.diff) <= 0.03, "routing is worth about as much as the filter");
  claim(need(DROP_ALONE)["hit@10"] < filt["hit@10"], "dropping the name hurts without routing");
  claim(spansZero(cDrop), "with routing, the drop is within noise");
  claim(spansZero(cHybrid) && hy["hit@10"] <= bm["hit@10"], "the hybrid doesn't beat BM25 on test");
  claim(devHy["hit@10"] > devBm["hit@10"], "the hybrid won on dev");
  claim(cDense.ci95[0] > 0 && dense0["doc_hit@10"] > none["doc_hit@10"], "MiniLM beats BM25 without the filter by finding the filing");
  const pctDoc = (r) => `${Math.round(r["doc_hit@10"] * 100)}%`;
  const out = [];
  out.push(`<p>Filings share most of their vocabulary, so BM25 over everything finds a page from the right filing only ${pctDoc(none)} of the time. The filter reads the company, year and quarter out of the question. It recognized the company in ${flt.company_found} of the ${flt.n} held-out questions, narrowed 360 filings to ${flt.mean_filings_after.toFixed(1)} on average, and took Hit@10 from ${f2(none["hit@10"])} to ${f2(filt["hit@10"])} (${interval(cFilter)}).</p>`);
  out.push(`<p>Routing is worth as much again, and it's a small piece of domain knowledge. The page detector marks ${corpus.statement_evidence_pages} of the ${corpus.evidence_pages} labeled answer pages as a balance sheet, income statement or cash flow statement: tables of numbers that share almost no words with "what is the FY2019 fixed asset turnover ratio". Questions that name a statement, or a line item or ratio that lives on one, get those pages first. ${corpus.test_questions_routed} of the ${flt.n} held-out questions trigger it, and Hit@10 went from ${f2(filt["hit@10"])} to ${f2(route["hit@10"])} (${interval(cRoute)}).</p>`);
  out.push(`<p>Leaving the company's name out of the query is the step I'm least sure of. Without routing it hurts (${f2(filt["hit@10"])} to ${f2(need(DROP_ALONE)["hit@10"])}), because the name is one of the few words a statement page shares with the question. With routing it adds ${interval(cDrop)}, which is within noise.</p>`);
  out.push(`<p>The embedding model didn't earn its cost. Fused with BM25, MiniLM scored ${f2(hy["hit@10"])} against BM25's ${f2(bm["hit@10"])} on the held-out questions (${interval(cHybrid)}) and takes ${ms(hy.p50_ms)} ms a query instead of ${ms(bm.p50_ms)}. On the ${devHy.n} development questions it looked better (${f2(devHy["hit@10"])} against ${f2(devBm["hit@10"])}), which is why it's the configuration I committed to before testing; a gap that size on ${devHy.n} questions turned out to be noise. Without the filter MiniLM does beat BM25 (${f2(dense0["hit@10"])} against ${f2(none["hit@10"])}), because it finds the right filing more often (${pctDoc(dense0)} against ${pctDoc(none)}). The filter makes that redundant.</p>`);
  const tax = s.taxonomy.test;
  const LABEL = {
    vocabulary_gap: "The answer page shares at most two words with the question",
    other_filing_won: "No year in the question, and pages from other years' filings won",
    outranked: "The answer page shares words with the question, but other pages share more",
    no_company: "The question never names the company",
    statement_not_detected: "Needed a statement page, but nothing in the question said so",
    filter_dropped_filing: "The filter kept the wrong filing",
    statement_outranked: "Right kind of statement, but another statement page ranked first",
  };
  const counted = Object.keys(LABEL).reduce((a, k) => a + (tax[k] || 0), 0);
  claim(counted === tax.misses, "every miss has a category on the page");
  const top = Object.keys(LABEL).sort((a, b) => (tax[b] || 0) - (tax[a] || 0))[0];
  claim(top === "vocabulary_gap", "vocabulary gaps are the biggest group");
  const rows = Object.entries(LABEL).filter(([k]) => tax[k]).sort((a, b) => tax[b[0]] - tax[a[0]])
    .map(([k, label]) => `<tr><td>${label}</td><td class="n">${tax[k]}</td></tr>`);
  out.push(`<h3>Where it still misses</h3>
<p>Each held-out question whose answer page didn't make the top 10 is sorted into the first stage of the pipeline that lost it. The rules run on every evaluation, so the counts change when the code does. The biggest group, narrative pages that share almost no words with the question, is where a cross-encoder reranker would go next.</p>
<div class="table-wrap"><table>
<thead><tr><th>${tax.misses} of ${tax.questions} held-out questions missed by the hybrid pipeline</th><th class="n">Questions</th></tr></thead>
<tbody>
${rows.join("\n")}
</tbody></table></div>`);
  if (s.loadtest) out.push(loadtestText(s.loadtest));
  out.push(`<p>Code, the evaluation, the service and the load test: <a href="https://github.com/bharathkumardev1/finance-rag-eval">github.com/bharathkumardev1/finance-rag-eval</a>. Numbers from commit <code>${s.git_sha}</code>, ${s.date}.</p>`);
  return out.join("\n");
}

function loadtestText(lt) {
  const pick = (m, c) => lt.runs[m].levels.find((r) => r.concurrency === c);
  const show = [["bm25", 1], ["bm25", 4], ["bm25", 32], ["hybrid", 1], ["hybrid", 4], ["hybrid", 16]];
  for (const m of Object.keys(lt.runs)) claim(lt.runs[m].levels.every((r) => r.errors === 0), `${m} load test had no errors`);
  const rows = show.filter(([m, c]) => lt.runs[m] && pick(m, c)).map(([m, c]) => {
    const r = pick(m, c);
    return `<tr><td>${m === "bm25" ? "BM25" : "Hybrid"}</td><td class="n">${c}</td><td class="n">${r.throughput_rps.toFixed(0)}</td><td class="n">${ms(r.p50_ms)} ms</td><td class="n">${ms(r.p95_ms)} ms</td></tr>`;
  });
  const bm = lt.runs.bm25, hy = lt.runs.hybrid;
  return `<h3>As a service</h3>
<p>Behind the FastAPI service, with one worker pinned to one CPU core and the load generator on another, BM25 serves about ${Math.round(bm.peak_rps / 10) * 10} requests a second before queueing sets in, and no request failed at any load. At c5.large on-demand pricing that's about $${bm.usd_per_million_at_peak.toFixed(2)} of compute per million queries, against $${hy.usd_per_million_at_peak.toFixed(2)} for the hybrid.</p>
<div class="table-wrap"><table>
<thead><tr><th>Retriever</th><th class="n">Concurrent clients</th><th class="n">Requests/s</th><th class="n">p50</th><th class="n">p95</th></tr></thead>
<tbody>
${rows.join("\n")}
</tbody></table></div>`;
}

function parity() {
  return `Checked against the Python pipeline on every benchmark question it can search (${s.parity.questions} of 150, ${s.parity.cases} question and setting pairs): same top 10 pages in the same order, same scores to the last bit.`;
}

function sizes() {
  const kb = (b) => Math.round(b / 1024);
  const index = ["meta.json", "questions.json"].reduce((a, f) => a + statSync(new URL(`data/finrag/${f}`, root)).size, 0);
  const gz = meta.filings.filter((f) => f.demo).map((f) => f.gz_bytes).sort((a, b) => a - b);
  const median = gz[Math.floor(gz.length / 2)];
  return `The first search fetches ${kb(index)} KB of index data, then about ${Math.round(kb(median) / 10) * 10} KB of compressed page text for each filing it opens.`;
}

const FILES = ["index.html", "assets/site.css", "assets/demo.js", "assets/finrag.mjs", "assets/readmit.js",
  "assets/gbdt.mjs", "assets/fonts/public-sans-latin-wght-normal.woff2"];
function footer(html) {
  const files = FILES.map((f) => [f, f === "index.html" ? Buffer.from(html) : readFileSync(new URL(f, root))]);
  const raw = files.reduce((a, [, b]) => a + b.length, 0);
  const wire = files.reduce((a, [f, b]) => a + (f.endsWith(".woff2") ? b.length : gzipSync(b, { level: 9 }).length), 0);
  return `<p>This page is one HTML file, a stylesheet, four small scripts and one font: ${Math.round(raw / 1024)} KB, about ${Math.round(wire / 1024)} KB compressed, before either demo fetches data. No framework, no build step for the page itself, no analytics. <a href="https://github.com/bharathkumardev1/bharathkumardev1.github.io">Source</a>.</p>`;
}

function fill(html, name, content, inline = false) {
  const re = new RegExp(`(<!-- ${name}:start -->)[\\s\\S]*?(<!-- ${name}:end -->)`);
  if (!re.test(html)) throw new Error(`index.html has no ${name} markers`);
  return html.replace(re, inline ? `$1${content}$2` : `$1\n${content}\n$2`);
}

const before = read("index.html");
let html = fill(before, "results", resultsTable());
html = fill(html, "results-notes", notes());
html = fill(html, "parity", parity(), true);
html = fill(html, "sizes", sizes(), true);
for (let i = 0; i < 3; i++) html = fill(html, "footer", footer(html)); // the footer counts its own bytes

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

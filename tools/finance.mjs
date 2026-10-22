// finance-rag-eval: the home page's search card and project row, and its case study. Every
// number comes from data/finrag/, which `finrag export-demo` copies out of the repo's results/.
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { Engine } from "../assets/finrag.mjs";
import { filingNames, steps, benchmarkLine, hits as renderHits } from "../assets/finrag-view.mjs";
import { root, json, f2, f3, ms, signed, int, claim, facts, repo, TIMES } from "./common.mjs";
import * as F from "./figures.mjs";

const S = json("data/finrag/summary.json");
const E = S.eval;
const META = json("data/finrag/meta.json");
const QUESTIONS = json("data/finrag/questions.json");
const PARITY = json("tests/finrag_parity.json");
const NAMES = filingNames(META);
const filing = (doc) => JSON.parse(gunzipSync(readFileSync(new URL(`data/finrag/filings/${doc}.json.gz`, root))).toString("utf8"));
const ENGINE = new Engine(META, async (doc) => filing(doc));

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

// [config, row in the table, row in the figure, row in the home page's small figure]
const LADDER = [
  [NONE, "BM25 over all 53,399 pages", "BM25 over every page", "All pages"],
  ["bm25/company", "Only filings from the company the question names", "Company filter", "Company"],
  ["bm25/company_year", "Only that company's filings for the year asked about", "+ fiscal year", "+ year"],
  [FILTER, "Narrowed to the quarter's filing when a quarter is asked about", "+ quarter", "+ quarter"],
  [ROUTE, "Statement questions sent to statement pages first", "+ statement routing", "+ routing"],
  [BM, "Company's name left out of the BM25 query", "+ company name left out", "+ name left out"],
];
const ALTERNATIVES = [
  [DENSE, "Same pipeline, MiniLM embeddings instead of BM25", "MiniLM instead of BM25"],
  [HYBRID, "Same pipeline, BM25 and MiniLM fused (my pick on the dev split)", "BM25 and MiniLM fused"],
];
claim(META.n_pages === 53399, "the page count in the labels");

const bm1 = () => S.load.levels.find((x) => x.method === "bm25" && x.concurrency === 1);
const sha = E.git_sha.slice(0, 7);

// The example the home page and the pipeline figure follow.
export const EXAMPLE = "What was the largest liability in American Express's Balance Sheet in 2022?";
const DEMO_EXAMPLE = "What is Coca Cola's FY2021 COGS % margin? Calculate what was asked by utilizing the line items clearly shown in the income statement.";
const byText = new Map(QUESTIONS.map((q) => [q.q, q]));

async function render(question, k, compact = false) {
  const res = await ENGINE.search(question, { k, route: true, drop: true });
  const q = byText.get(question);
  if (!q) throw new Error(`not a benchmark question: ${question}`);
  const gold = new Set(q.gold.map(([d, p]) => `${d}#${p}`));
  const rank = res.hits.findIndex((h) => gold.has(`${h.doc}#${h.page}`)) + 1;
  return {
    res, q, gold, rank,
    trace: steps(res, META.filings.length, NAMES, k) + benchmarkLine(q, res.hits, NAMES, { compact }),
    hits: renderHits(res, gold, NAMES, { whole: !compact }),
  };
}

// Home page ------------------------------------------------------------------------------------

export async function hero() {
  const r = await render(EXAMPLE, 3, true);
  claim(r.rank === 1, "the home page example finds its answer page first");
  return r;
}

export function scope(link) {
  const demo = META.filings.filter((f) => f.demo);
  return `The retrieval pipeline from ${link}, over the ${demo.length} SEC filings its questions cite.`;
}

export function thumb() {
  const body = F.dotRows({
    rows: LADDER.map(([k, , , short]) => ({ label: short, value: t(k)["hit@10"], cls: "s1" })),
    domain: [0, 1], ticks: [0, 0.5, 1], fmt: f2, name: "Hit@10",
    aria: `Hit@10 rises from ${f2(t(NONE)["hit@10"])} with BM25 over every page to ${f2(t(BM)["hit@10"])} with the filter, routing and the company name left out.`,
  });
  return `<p class="fig-title">Hit@10 on ${t(NONE).n} held-out questions, one step at a time</p>${body}`;
}

export function card() {
  const none = t(NONE), bm = t(BM), hy = t(HYBRID);
  const c = cmp(HYBRID, BM);
  claim(spansZero(c), "the hybrid ties BM25 on test");
  const times = TIMES[Math.round(hy.p50_ms / bm.p50_ms)];
  claim(Boolean(times), "the hybrid's latency is a small multiple of BM25's");
  return `<p>FinanceBench labels the page that answers each of its ${QUESTIONS.length} questions about ${META.filings.length} SEC filings, so retrieval can be measured on its own. Reading the company and period from the question and sending statement questions to statement pages takes Hit@10 from ${f2(none["hit@10"])} to ${f2(bm["hit@10"])} on ${none.n} held-out questions. An embedding hybrid tied BM25 at about ${times} the latency, so the service runs BM25: ${bm1().throughput_rps.toFixed(0)} queries a second on one core.</p>`;
}

// Case study ------------------------------------------------------------------------------------

export function caseFacts() {
  const none = t(NONE), bm = t(BM), b = bm1();
  return facts([
    ["Benchmark", `<b>FinanceBench</b>: ${QUESTIONS.length} analyst questions over ${META.filings.length} SEC filings, ${int(META.n_pages)} pages`],
    ["Held out", `<b>${none.n}</b> questions kept out of all tuning, which used the other ${need(DEV, NONE).n}`],
    ["Result", `Hit@10 from <b>${f2(none["hit@10"])}</b> to <b>${f2(bm["hit@10"])}</b> on the held-out questions`],
    ["Serving", `BM25 on one core: <b>${b.throughput_rps.toFixed(0)}</b> queries a second at ${ms(b.p95_ms)} ms p95`],
  ]);
}

export const links = () => `<li><a href="${repo("finance-rag-eval")}">Code on GitHub</a></li>
<li><a href="${repo("finance-rag-eval")}/blob/main/results/RESULTS.md">Every results table</a></li>`;

export async function demo() {
  const r = await render(DEMO_EXAMPLE, 3);
  const off = await ENGINE.search(DEMO_EXAMPLE, { k: 10, route: false, drop: true });
  const offRank = off.hits.findIndex((h) => r.gold.has(`${h.doc}#${h.page}`)) + 1;
  claim(r.rank === 1 && offRank === 0, "routing is what puts this example's answer page first");
  claim(r.res.wanted.includes("income"), "the demo example is routed to income statements");
  const about = `The repo's BM25 pipeline, ported to JavaScript. The switches turn off the last two steps in Figure 2; turn off the first one on this question and the income statement drops out of the results.`;
  return { ...r, about };
}

export function demoNote() {
  const demoFilings = META.filings.filter((f) => f.demo);
  return `It covers the ${demoFilings.length} filings that FinanceBench questions cite. On all ${PARITY.length} question and setting pairs the tests run, it returns the same top 10 pages as the Python pipeline, with the same scores to the last bit.`;
}

export async function pipeline() {
  const none = t(NONE), flt = E.filter.test;
  const res = await ENGINE.search(EXAMPLE, { k: 10, route: true, drop: true });
  const off = await ENGINE.search(EXAMPLE, { k: 10, route: false, drop: true });
  const q = byText.get(EXAMPLE);
  const goldKey = `${q.gold[0][0]}#${q.gold[0][1]}`;
  const onRank = res.hits.findIndex((h) => `${h.doc}#${h.page}` === goldKey) + 1;
  const offRank = off.hits.findIndex((h) => `${h.doc}#${h.page}` === goldKey) + 1;
  claim(res.loaded.length === 1 && onRank === 1 && offRank === 0, "the pipeline example: one filing, first with routing, out of the top 10 without");
  const kinds = filing(res.loaded[0]).kinds.filter((k) => k === "b").length;
  claim(res.wanted.length === 1 && res.wanted[0] === "balance", "the example is routed to the balance sheet");
  const docPct = (r) => `${Math.round(r["doc_hit@10"] * 100)}%`;
  const fig = F.figure({
    id: "fig-pipeline",
    body: F.flow([
      { what: "Question", how: `“${F.esc(EXAMPLE)}”` },
      { what: "Filter", how: "company, fiscal year and quarter, read from the question", count: "1", unit: `of ${META.filings.length} filings` },
      { what: "BM25", how: "over that filing's pages, the company's name left out of the query", count: res.pages.toLocaleString("en-US"), unit: "pages" },
      { what: "Routing", how: "the question names the balance sheet, so balance sheet pages go first", count: String(kinds), unit: kinds === 1 ? "balance sheet page" : "balance sheet pages" },
      { what: "Result", how: "the page FinanceBench labels as the answer", count: `Page ${q.gold[0][1] + 1}`, unit: "ranked first", strong: true },
    ], "One question through the pipeline"),
    caption: `<b>Figure 1.</b> One held-out question through the pipeline. With routing switched off, the same search doesn't have page ${q.gold[0][1] + 1} in its top 10.`,
  });
  return `<p>Every 10-K has a balance sheet, a risk section and the same accounting terms, so BM25 over all ${int(META.n_pages)} pages finds the right filing for only ${docPct(none)} of held-out questions. The first step isn't ranking: the filter reads the company, fiscal year and quarter from the question and keeps ${flt.mean_filings_after.toFixed(1)} of ${META.filings.length} filings on average. Questions about a financial statement then get that statement's pages first.</p>
${fig}`;
}

function ladderTable() {
  const row = ([k, label], cls) => {
    const r = t(k);
    const [lo, hi] = r["hit@10_ci95"];
    return `<tr${cls ? ` class="${cls}"` : ""} data-config="${k}"><td>${label}</td><td class="n">${f2(r["hit@10"])}</td>` +
      `<td class="n ci">${f2(lo)} to ${f2(hi)}</td><td class="n">${f3(r["mrr@10"])}</td><td class="n">${ms(r.p50_ms)} / ${ms(r.p95_ms)} ms</td></tr>`;
  };
  const body = [...LADDER.map((x, i) => row(x, i === LADDER.length - 1 ? "total" : "")), ...ALTERNATIVES.map((x) => row(x, "alt"))];
  return `<div class="table-wrap"><table>
<caption>${t(NONE).n} held-out questions. Hit@10: the labeled page is in the top 10.</caption>
<thead><tr><th>Each row adds one step to the row above</th><th class="n">Hit@10</th><th class="n">95% interval</th><th class="n">MRR@10</th><th class="n">p50 / p95</th></tr></thead>
<tbody>
${body.join("\n")}
</tbody></table></div>`;
}

export function results() {
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
  claim(bm.n_multi_page === hy.n_multi_page, "multi-page counts agree");
  const docPct = (r) => `${Math.round(r["doc_hit@10"] * 100)}%`;
  const fig = F.figure({
    id: "fig-ladder",
    body: F.dotRows({
      rows: [
        ...LADDER.map(([k, , label]) => ({ label, value: t(k)["hit@10"], lo: t(k)["hit@10_ci95"][0], hi: t(k)["hit@10_ci95"][1], cls: "s1" })),
        { split: true },
        ...ALTERNATIVES.map(([k, , label]) => ({ label, value: t(k)["hit@10"], lo: t(k)["hit@10_ci95"][0], hi: t(k)["hit@10_ci95"][1], cls: "s0", alt: true })),
      ],
      domain: [0, 1], ticks: [0, 0.25, 0.5, 0.75, 1], fmt: f2, name: "Hit@10",
      aria: `Hit@10 on ${none.n} held-out questions: ${LADDER.map(([k, , label]) => `${label} ${f2(t(k)["hit@10"])}`).join(", ")}; with MiniLM instead of BM25 ${f2(t(DENSE)["hit@10"])}, fused ${f2(hy["hit@10"])}.`,
    }) + F.twin(ladderTable(), "Show the table, with MRR and latency"),
    caption: `<b>Figure 2.</b> Hit@10 on the ${none.n} held-out questions. Each blue row adds one step to the row above; the gray rows run the finished pipeline with MiniLM embeddings. Lines are 95% bootstrap intervals.`,
  });
  const short = (c) => `${signed(c.diff)}, ${signed(c.ci95[0])} to ${signed(c.ci95[1])}`;
  return `<p>I tuned on ${devHy.n} questions and kept ${none.n} aside; everything here is the ${none.n}. Hit@10 asks whether the labeled page made the top 10, which is what a model answering from ten pages needs.</p>
${fig}
<p>The filter found the company in ${flt.company_found} of ${flt.n} questions and kept the right filing for ${flt.gold_filing_kept}, taking Hit@10 from ${f2(none["hit@10"])} to ${f2(filt["hit@10"])} (${interval(cFilter)}). Routing added as much again. ${statementGold} of the ${QUESTIONS.length} answer pages are financial statements, tables of numbers that share almost no words with a question like "what is the FY2019 fixed asset turnover ratio". Routing fires on ${routed} held-out questions and took Hit@10 to ${f2(route["hit@10"])} (${short(cRoute)}).</p>
<p>Leaving the company's name out of the query hurts without routing (${f2(filt["hit@10"])} to ${f2(t(DROP_ALONE)["hit@10"])}) and adds ${signed(cDrop.diff)} with it, inside noise (${signed(cDrop.ci95[0])} to ${signed(cDrop.ci95[1])}). It's the step I'm least sure of.</p>
<p>MiniLM didn't earn its cost. Fused with BM25 it scored ${f2(hy["hit@10"])} against ${f2(bm["hit@10"])} (${short(cHybrid)}) at ${ms(hy.p50_ms)} ms a query instead of ${ms(bm.p50_ms)}. It looked better on the ${devHy.n} dev questions (${f2(devHy["hit@10"])} against ${f2(devBm["hit@10"])}), which is why I committed to it before testing; that gap was noise. Without the filter MiniLM does win (${f2(dense0["hit@10"])} against ${f2(none["hit@10"])}) by finding the right filing more often (${docPct(dense0)} against ${docPct(none)}), and the filter makes that redundant.</p>`;
}

// Statement pages among the labeled answers, read from the filings the demo ships (every
// filing a question cites is one of them), and how many held-out questions routing fires on.
function statementCounts() {
  const kindsOf = new Map();
  for (const f of META.filings.filter((x) => x.demo)) kindsOf.set(f.doc, filing(f.doc).kinds);
  const statementGold = QUESTIONS.filter((q) => q.gold.some(([d, p]) => kindsOf.get(d)?.[p])).length;
  const routed = QUESTIONS.filter((q) => q.split === "test" && ENGINE.questionKinds(q.q).size).length;
  return { statementGold, routed };
}

export function misses() {
  const tax = E.taxonomy.test, hy = t(HYBRID);
  const LABEL = {
    vocabulary_gap: "The answer page shares at most two words with the question",
    other_filing_won: "The filter kept several filings, and a page from the wrong one won",
    outranked: "The answer page shares words with the question, but other pages share more",
    no_company: "The question never names a company the filter knows",
    statement_not_detected: "It needed a statement page, but nothing in the question said so",
    filter_dropped_filing: "The filter dropped the filing with the answer",
    statement_outranked: "Right kind of statement, but another statement page ranked first",
  };
  const counted = Object.keys(LABEL).reduce((a, k) => a + (tax.counts[k] || 0), 0);
  claim(counted === tax.misses, "every miss has a category on the page");
  const order = Object.keys(LABEL).filter((k) => tax.counts[k]).sort((a, b) => tax.counts[b] - tax.counts[a]);
  claim(order[0] === "vocabulary_gap", "vocabulary gaps are the biggest group");
  claim(tax.questions - tax.misses === Math.round(hy["hit@10"] * hy.n), "the misses are the headline system's");
  claim(tax.counts.statement_not_detected + tax.counts.statement_outranked <= 5, "routing's own failures are few");
  const top = Math.ceil(tax.counts[order[0]] / 4) * 4;
  const fig = F.figure({
    id: "fig-misses",
    body: F.barRows({
      rows: order.map((k) => ({ label: LABEL[k], value: tax.counts[k] })),
      domain: [0, top], ticks: [0, top / 4, top / 2, (3 * top) / 4, top], fmt: (x) => String(x), name: "Questions",
      aria: `${tax.misses} missed questions by cause: ${order.map((k) => `${LABEL[k]}, ${tax.counts[k]}`).join("; ")}.`,
    }),
    caption: `<b>Figure 3.</b> The ${tax.misses} held-out questions whose answer page missed the top 10, by the first stage of the pipeline that lost it.`,
  });
  return `<p>Each held-out question the hybrid pipeline missed is filed under the first stage that lost it. The rules run on every evaluation, so the counts follow the code.</p>
${fig}
<p>The biggest group, narrative pages that share almost no words with the question, is the case a cross-encoder reranker is meant for. Routing's own failures are few: ${tax.counts.statement_not_detected} questions needed a statement page without saying so, and ${tax.counts.statement_outranked} routed to the right kind of statement but ranked a different statement page first.</p>`;
}

export function service() {
  const L = S.load;
  claim(L.levels.every((r) => r.errors === 0), "no request failed in the load test");
  const lv = (method) => L.levels.filter((x) => x.method === method).sort((a, b) => a.concurrency - b.concurrency);
  const bm = lv("bm25"), hy = lv("hybrid");
  const clients = bm.map((x) => x.concurrency);
  claim(JSON.stringify(clients) === JSON.stringify(hy.map((x) => x.concurrency)), "both retrievers ran the same client counts");
  const peak = (xs) => Math.max(...xs.map((x) => x.throughput_rps));
  const b1 = bm[0], h1 = hy[0];
  claim(peak(bm) > 2.5 * peak(hy), "BM25 serves several times the hybrid's throughput");
  const ceil = (x, step) => Math.ceil(x / step) * step;
  const rpsTop = ceil(peak(bm) * 1.05, 50), latTop = ceil(Math.max(...hy.map((x) => x.p95_ms)) * 1.05, 100);
  const series = (key) => [
    { name: "BM25", cls: "s1", points: bm.map((x) => [x.concurrency, x[key]]) },
    { name: "Hybrid", cls: "s2", points: hy.map((x) => [x.concurrency, x[key]]) },
  ];
  const label = (name, x, text, pos) => ({ series: name, x, text, pos });
  const last = clients.at(-1);
  const rps = F.lineChart({
    x: { domain: [0, clients.length - 1], ticks: clients, fmt: String, title: "concurrent clients" }, xIndex: clients,
    y: { domain: [0, rpsTop], ticks: [0, rpsTop / 2, rpsTop], fmt: (v) => String(v) },
    series: series("throughput_rps"), height: "short", xfmt: "clients", yfmt: "rps",
    labels: [label("BM25", last, "BM25", "left above"), label("Hybrid", last, "Hybrid", "left above")],
    aria: `Requests a second by concurrent clients. BM25 from ${b1.throughput_rps.toFixed(0)} to ${peak(bm).toFixed(0)}, the hybrid from ${h1.throughput_rps.toFixed(0)} to ${peak(hy).toFixed(0)}.`,
  });
  const lat = F.lineChart({
    x: { domain: [0, clients.length - 1], ticks: clients, fmt: String, title: "concurrent clients" }, xIndex: clients,
    y: { domain: [0, latTop], ticks: [0, latTop / 2, latTop], fmt: (v) => `${v}` },
    series: series("p95_ms"), height: "short", xfmt: "clients", yfmt: "ms",
    labels: [label("BM25", last, "BM25", "left above"), label("Hybrid", last, "Hybrid", "left above")],
    aria: `p95 latency by concurrent clients. BM25 from ${ms(b1.p95_ms)} to ${ms(bm.at(-1).p95_ms)} ms, the hybrid from ${ms(h1.p95_ms)} to ${ms(hy.at(-1).p95_ms)} ms.`,
  });
  const table = F.table({
    head: ["Retriever", "Clients", "Requests/s", "p50", "p95"], numeric: [1, 2, 3, 4],
    rows: [...bm, ...hy].map((x) => [x.method === "bm25" ? "BM25" : "Hybrid", x.concurrency, x.throughput_rps.toFixed(0), `${ms(x.p50_ms)} ms`, `${ms(x.p95_ms)} ms`]),
  });
  const fig = F.figure({
    id: "fig-service",
    body: F.legend([{ cls: "s1", name: "BM25" }, { cls: "s2", name: "Hybrid: BM25 and MiniLM fused" }]) +
      `<div class="multiples"><div><p class="fig-title">Requests a second</p>${rps}</div><div><p class="fig-title">p95 latency, ms</p>${lat}</div></div>` + F.twin(table),
    caption: `<b>Figure 4.</b> The FastAPI service with one worker pinned to one CPU core and the load generator on the other, 30 seconds per level.`,
  });
  return `<p>With one FastAPI worker pinned to one core and the load generator on the other, BM25 serves ${b1.throughput_rps.toFixed(0)} requests a second to one client (p95 ${ms(b1.p95_ms)} ms) and up to ${peak(bm).toFixed(0)} with more clients; the hybrid tops out at ${peak(hy).toFixed(0)}. No request failed.</p>
${fig}
<p>At half an AWS c7i.large's on-demand price, one vCPU, that's $${b1.usd_per_million.toFixed(2)} per million BM25 queries and $${h1.usd_per_million.toFixed(2)} for the hybrid, if the throughput carries over to that machine, which I haven't measured.</p>`;
}

export function checks() {
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
  return `<p><b>Adding filings without a rebuild.</b> The index is kept in segments. With ${inc.held_out_filings} filings held out and added back in batches, every score on ${inc.queries} queries matched a one-pass build exactly. A full build takes ${inc.full_build_seconds.toFixed(1)} s; a batch took ${Math.min(...batches).toFixed(2)} to ${Math.max(...batches).toFixed(2)} s.</p>
<p><b>Chunk size.</b> Smaller passages didn't help: 650-token chunks tie whole pages (${f2(c650["hit@10"])}), and 256- and 128-token chunks score ${f2(c256["hit@10"])} and ${f2(c128["hit@10"])} with two to four times as many entries.</p>`;
}

export const sources = () => `<p class="sources">Numbers from the code at commit <a href="${repo("finance-rag-eval")}/commit/${sha}"><code>${sha}</code></a>, run on ${E.date}. Every results file and the command that wrote it: <a href="${repo("finance-rag-eval")}/blob/main/results/RESULTS.md">RESULTS.md</a>.</p>`;

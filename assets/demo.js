// Page wiring for the filing search demo. The search itself is assets/finrag.mjs, a port of
// the Python pipeline in github.com/bharathkumardev1/finance-rag-eval that is tested to
// return the same pages with the same scores.
import { Engine } from "./finrag.mjs";

const DATA = new URL("../data/finrag/", import.meta.url);
const $ = (sel) => document.querySelector(sel);
const form = $("#ask");
const input = $("#q");
const trace = $("#trace");
const hitsEl = $("#hits");

let engine = null;
let questions = [];
let byText = new Map();
let kb = new Map();

async function json(name) {
  const res = await fetch(new URL(name, DATA));
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return res.json();
}

async function loadFiling(doc) {
  const res = await fetch(new URL(`filings/${doc}.json.gz`, DATA));
  if (!res.ok) throw new Error(`${doc}: HTTP ${res.status}`);
  const text = await new Response(res.body.pipeThrough(new DecompressionStream("gzip"))).text();
  return JSON.parse(text);
}

async function ready() {
  if (engine) return engine;
  if (!("DecompressionStream" in window)) throw new Error("This browser can't unpack the filing data (no DecompressionStream).");
  const [meta, qs] = await Promise.all([json("meta.json"), json("questions.json")]);
  engine = new Engine(meta, loadFiling);
  questions = qs;
  byText = new Map(qs.map((q) => [squash(q.q), q]));
  kb = new Map(meta.filings.filter((f) => f.demo).map((f) => [f.doc, Math.round(f.gz_bytes / 1024)]));
  return engine;
}

const squash = (s) => s.trim().replace(/\s+/g, " ");
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const WORD = /[\p{L}\p{N}_]{2,}/gu;

// The window of the page that covers the most distinct query words, with those words marked.
function excerpt(text, tokens, width = 300) {
  const flat = text.replace(/\s+/g, " ").trim();
  const want = new Set(tokens);
  const hits = [...flat.toLowerCase().matchAll(WORD)].filter((m) => want.has(m[0])).map((m) => [m.index, m[0]]);
  let best = 0, bestCount = 0, j = 0;
  const counts = new Map();
  for (const [pos, word] of hits) {
    while (j < hits.length && hits[j][0] < pos + width - 40) {
      counts.set(hits[j][1], (counts.get(hits[j][1]) || 0) + 1);
      j++;
    }
    if (counts.size > bestCount) [best, bestCount] = [pos, counts.size];
    counts.set(word, counts.get(word) - 1);
    if (!counts.get(word)) counts.delete(word);
  }
  const start = Math.max(0, best - 40);
  const piece = flat.slice(start, start + width);
  return (start ? "…" : "") + mark(piece, want) + (start + width < flat.length ? "…" : "");
}

function mark(text, want) {
  let out = "", last = 0;
  for (const m of text.matchAll(WORD)) {
    if (!want.has(m[0].toLowerCase())) continue;
    out += esc(text.slice(last, m.index)) + `<mark>${esc(m[0])}</mark>`;
    last = m.index + m[0].length;
  }
  return out + esc(text.slice(last));
}

const KIND = { balance: "balance sheet", income: "income statement", cashflow: "cash flow statement" };
const list = (xs) => (xs.length <= 2 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

function describe(res, ms) {
  if (!res.allowed) {
    return `<p class="error">No company I know in that question, so there's nothing to narrow down to. The demo holds the 84 filings that FinanceBench questions cite, from 32 companies. Name one, for example 3M, JPMorgan or Pfizer.</p>`;
  }
  const parts = [];
  const pages = res.pages.toLocaleString();
  if (res.loaded.length === res.allowed.length) {
    parts.push(`The filter picked ${list(res.allowed.map((d) => `<code>${d}</code>`))}: ${pages} pages.`);
  } else if (!res.loaded.length) {
    return `<p class="error">The filter picked ${list(res.allowed.map((d) => `<code>${d}</code>`))}, and none of those are in the demo's 84 filings. Ask about a filing a FinanceBench question cites, or try an example below.</p>`;
  } else {
    parts.push(`The filter picked ${res.allowed.length} filings; ${res.loaded.length} of them are in the demo set (${list(res.loaded.map((d) => `<code>${d}</code>`))}, ${pages} pages), so only those were searched.`);
  }
  parts.push(res.wanted.length ? `The question needs the ${list(res.wanted.map((k) => KIND[k]))}, so those pages go first.` : "No financial statement implied, so it's BM25 order.");
  parts.push(`Ranked in ${ms.toFixed(1)} ms in your browser${res.loadMs > 5 ? ` after ${res.loadMs.toFixed(0)} ms loading the filing` : ""}.`);
  return `<p>${parts.join(" ")}</p>`;
}

// Ranks from the benchmark run over all 360 filings: 1-based, null when below 100.
const place = (r) => (r == null ? "below 100" : `at ${r}`);

function benchmarkLine(q, hits) {
  const gold = new Set(q.gold.map(([d, p]) => `${d}#${p}`));
  const at = hits.findIndex((h) => gold.has(`${h.doc}#${h.page}`));
  const where = q.gold.map(([d, p]) => `${d} page ${p + 1}`).join(", ");
  const r = q.ranks || {};
  const split = q.split === "test" ? "one of the 100 held-out questions" : "one of the 50 I tuned on";
  const bench = [];
  if ("none" in r) bench.push(`BM25 over all 53,399 pages put it ${place(r.none)}`);
  if ("bm25" in r) bench.push(`this pipeline with both switches on ${place(r.bm25)}`);
  if ("headline" in r) bench.push(`the hybrid with MiniLM ${place(r.headline)}`);
  return `<p>This is FinanceBench question <code>${q.id.replace("financebench_id_", "")}</code>, ${split}. Labeled answer page: ${where}. ` +
    (at >= 0 ? `Here it's result ${at + 1}.` : `<span class="error">It isn't in the top ${hits.length} here.</span>`) +
    (bench.length ? ` In the benchmark run, ${list(bench)}.` : "") +
    (q.a ? ` Expected answer: ${esc(q.a.length > 200 ? q.a.slice(0, 200) + "…" : q.a)}` : "") + `</p>`;
}

async function run(text) {
  const question = squash(text);
  if (question.length < 3) return;
  trace.innerHTML = "<p>Loading the filter and filing index…</p>";
  hitsEl.innerHTML = "";
  try {
    const e = await ready();
    const allowed = e.filter.allowedDocs(question);
    const toLoad = (allowed || []).filter((d) => e.demo.has(d) && !e.cache.has(d));
    if (toLoad.length) {
      const size = toLoad.reduce((s, d) => s + (kb.get(d) || 0), 0);
      trace.innerHTML = `<p>Loading ${list(toLoad.map((d) => `<code>${d}</code>`))} (${size} KB)…</p>`;
    }
    const t0 = performance.now();
    const res = await e.search(question, { k: 5, route: $("#route").checked, drop: $("#drop").checked });
    const ms = performance.now() - t0 - (res.loadMs || 0);
    const bq = byText.get(question);
    trace.innerHTML = describe(res, ms) + (bq && res.allowed ? benchmarkLine(bq, res.hits) : "");
    const gold = new Set((bq ? bq.gold : []).map(([d, p]) => `${d}#${p}`));
    hitsEl.innerHTML = res.hits.map((h, i) => {
      const isGold = gold.has(`${h.doc}#${h.page}`);
      const kinds = h.kinds.map((k) => KIND[k]).join(", ");
      return `<li>
        <div class="hit-head"><span class="rank">${i + 1}</span><span class="where">${h.doc}, page ${h.page + 1}</span>
          ${kinds ? `<span>${kinds}</span>` : ""}<span class="quiet">BM25 ${h.score.toFixed(3)}</span>
          ${isGold ? `<span class="gold">labeled answer page</span>` : ""}</div>
        <p class="excerpt">${excerpt(h.text, res.tokens)}</p>
        <details class="page"><summary>Whole page</summary><div class="page-text">${mark(h.text, new Set(res.tokens))}</div></details>
      </li>`;
    }).join("");
  } catch (err) {
    trace.innerHTML = `<p class="error">${esc(String(err.message || err))}</p>`;
  }
}

form.addEventListener("submit", (ev) => {
  ev.preventDefault();
  run(input.value);
});
for (const box of ["#route", "#drop"]) $(box).addEventListener("change", () => input.value && run(input.value));
document.querySelectorAll("[data-example]").forEach((b) =>
  b.addEventListener("click", () => {
    input.value = b.dataset.example;
    run(input.value);
  }),
);
$("#random").addEventListener("click", async () => {
  await ready();
  const pool = questions.filter((q) => q.split === "test");
  input.value = pool[Math.floor(Math.random() * pool.length)].q;
  run(input.value);
});

// Page wiring for the filing search. The search is assets/finrag.mjs, a port of the Python
// pipeline in github.com/bharathkumardev1/finance-rag-eval that is tested to return the same
// pages with the same scores; assets/finrag-view.mjs turns a result into HTML, the same way
// the build renders the first example into the page.
import { Engine } from "./finrag.mjs";
import { filingNames, steps, empty, benchmarkLine, hits as renderHits } from "./finrag-view.mjs";

const DATA = new URL("../data/finrag/", import.meta.url);
const $ = (sel) => document.querySelector(sel);
const box = $(".search[data-k]");
const form = $("#ask");
const input = $("#q");
const trace = $("#trace");
const hitsEl = $("#hits");
const K = Number(box.dataset.k) || 5;
const COMPACT = box.dataset.compact === "true"; // the home page's card: shorter notes and quotes

let loading = null;
let questions = [];
let byText = new Map();
let kb = new Map();
let names = new Map();
let scope = "";
let total = 0;

async function json(name) {
  const res = await fetch(new URL(name, DATA));
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return res.json();
}

// Filings ship gzipped. A host that can't serve .gz files sets FINRAG_PLAIN_FILINGS before
// this module loads and ships the same JSON uncompressed.
const PLAIN = Boolean(globalThis.FINRAG_PLAIN_FILINGS);

async function loadFiling(doc) {
  const res = await fetch(new URL(`filings/${doc}.json${PLAIN ? "" : ".gz"}`, DATA));
  if (!res.ok) throw new Error(`${doc}: HTTP ${res.status}`);
  if (PLAIN) return res.json();
  const text = await new Response(res.body.pipeThrough(new DecompressionStream("gzip"))).text();
  return JSON.parse(text);
}

// One load of the index, shared by every caller; a failed load can be retried.
function ready() {
  loading ??= load().catch((err) => {
    loading = null;
    throw err;
  });
  return loading;
}

async function load() {
  if (!PLAIN && !("DecompressionStream" in window)) throw new Error("This browser can't unpack the filing data (no DecompressionStream)");
  const [meta, qs] = await Promise.all([json("meta.json"), json("questions.json")]);
  const engine = new Engine(meta, loadFiling);
  questions = qs;
  byText = new Map(qs.map((q) => [squash(q.q), q]));
  names = filingNames(meta);
  total = meta.filings.length;
  const demo = meta.filings.filter((f) => f.demo);
  kb = new Map(demo.map((f) => [f.doc, Math.round(f.gz_bytes / 1024)]));
  scope = `${demo.length} filings that FinanceBench questions cite, from ${new Set(demo.map((f) => f.company)).size} companies`;
  return engine;
}

const squash = (s) => s.trim().replace(/\s+/g, " ");
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const checked = (sel) => ($(sel) ? $(sel).checked : true);

async function run(text) {
  const question = squash(text);
  if (question.length < 3) return;
  trace.innerHTML = "<p>Loading the filter and the filing index…</p>";
  hitsEl.innerHTML = "";
  try {
    const e = await ready();
    const allowed = e.filter.allowedDocs(question);
    const toLoad = (allowed || []).filter((d) => e.demo.has(d) && !e.cache.has(d));
    if (toLoad.length) {
      const size = toLoad.reduce((s, d) => s + (kb.get(d) || 0), 0);
      trace.innerHTML = `<p>Loading ${esc(toLoad.map((d) => names.get(d) || d).join(", "))} (${size} KB)…</p>`;
    }
    const t0 = performance.now();
    const route = checked("#route");
    const res = await e.search(question, { k: K, route, drop: checked("#drop") });
    const ms = performance.now() - t0 - (res.loadMs || 0);
    const why = empty(res, scope, names);
    if (why) {
      trace.innerHTML = why;
      return;
    }
    const bq = byText.get(question);
    const timing = `<p>Ranked in ${ms.toFixed(1)} ms in your browser${res.loadMs > 5 ? `, after ${res.loadMs.toFixed(0)} ms loading the filing` : ""}.</p>`;
    trace.innerHTML = steps(res, total, names, K, { route, compact: COMPACT }) + timing + (bq ? benchmarkLine(bq, res.hits, names, { compact: COMPACT }) : "");
    const gold = new Set((bq ? bq.gold : []).map(([d, p]) => `${d}#${p}`));
    hitsEl.innerHTML = renderHits(res, gold, names, { compact: COMPACT });
  } catch (err) {
    trace.innerHTML = `<p class="error">${esc(String(err.message || err))}. The measured results on this site don't depend on the demo.</p>`;
  }
}

// A pointer over the search or focus inside it starts loading the index and the filing the
// current question needs, so the first search doesn't wait on the network.
function warm() {
  ready().then((e) => {
    for (const doc of e.filter.allowedDocs(squash(input.value)) || []) {
      if (e.demo.has(doc) && !e.cache.has(doc)) e.filing(doc).catch(() => e.cache.delete(doc));
    }
  }, () => {});
}
box.addEventListener("pointerenter", warm, { once: true });
box.addEventListener("focusin", warm, { once: true });

form.addEventListener("submit", (ev) => {
  ev.preventDefault();
  run(input.value);
});
for (const sel of ["#route", "#drop"]) $(sel)?.addEventListener("change", () => input.value && run(input.value));
document.querySelectorAll("[data-example]").forEach((b) =>
  b.addEventListener("click", () => {
    input.value = b.dataset.example;
    run(input.value);
  }),
);
$("#random")?.addEventListener("click", async () => {
  try {
    await ready();
  } catch (err) {
    trace.innerHTML = `<p class="error">${esc(String(err.message || err))}.</p>`;
    return;
  }
  const pool = questions.filter((q) => q.split === "test");
  input.value = pool[Math.floor(Math.random() * pool.length)].q;
  run(input.value);
});

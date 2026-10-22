// What the filing search shows, as plain functions of a search result. The browser renders
// live searches with them, and tools/build.mjs renders the first example into the page with
// the same code, so the page shows a real result before any script runs.

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const WORD = /[\p{L}\p{N}_]{2,}/gu;
export const KIND = { balance: "balance sheet", income: "income statement", cashflow: "cash flow statement" };
const TAG = { balance: "Balance sheet", income: "Income statement", cashflow: "Cash flow statement" };
export const list = (xs) => (xs.length <= 2 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

// "AMERICANEXPRESS_2022_10K" as "American Express 2022 10-K", from the filing's metadata.
export function filingNames(meta) {
  const names = new Map();
  for (const f of meta.filings) {
    const year = f.periods.length ? f.periods.at(-1) : "";
    const q = f.quarter ? ` Q${f.quarter[1]}` : "";
    const kind = { "10k": "10-K", "10q": "10-Q", "8k": "8-K", earnings: "earnings release", "10k_annualreport": "annual report" }[f.type] || f.type;
    names.set(f.doc, `${f.company} ${year}${q} ${kind}`);
  }
  return names;
}

// The window of the page that covers the most distinct query words, with those words marked.
export function excerpt(text, tokens, width = 300) {
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

export function mark(text, want) {
  let out = "", last = 0;
  for (const m of text.matchAll(WORD)) {
    if (!want.has(m[0].toLowerCase())) continue;
    out += esc(text.slice(last, m.index)) + `<mark>${esc(m[0])}</mark>`;
    last = m.index + m[0].length;
  }
  return out + esc(text.slice(last));
}

// The pipeline's path for this question, one step per stage. Empty when nothing was searched.
export function steps(res, total, names, k, { route = true, compact = false } = {}) {
  if (!res.allowed || !res.loaded.length) return "";
  const companies = [...new Set(res.loaded.map((d) => names.get(d).split(/ \d{4}/)[0]))];
  const kept = res.loaded.length === 1 ? names.get(res.loaded[0])
    : companies.length === 1 ? `${companies[0]} filings` : `filings from ${list(companies)}`;
  const picked = res.allowed.length === res.loaded.length
    ? `<b>${res.loaded.length}</b> ${res.loaded.length === 1 ? "filing" : "filings"}: ${esc(kept)}`
    : `<b>${res.allowed.length}</b> picked, <b>${res.loaded.length}</b> in this demo: ${esc(kept)}`;
  const order = !route ? "statement routing off" : res.wanted.length ? `${esc(list(res.wanted.map((w) => KIND[w])))} first` : "no statement implied";
  const out = [
    `<li><b>${total}</b> filings</li>`,
    `<li>${picked}</li>`,
    `<li><b>${res.pages.toLocaleString("en-US")}</b> pages</li>`,
    `<li>${order}</li>`,
    ...(compact ? [] : [`<li>top ${k} by BM25</li>`]),
  ];
  return `<ol class="steps" aria-label="What the pipeline did">${out.join("")}</ol>`;
}

// Why nothing was searched, when that happens.
export function empty(res, scope, names) {
  if (!res.allowed) {
    return `<p class="error">No company I know in that question, so there's nothing to narrow down to. The demo holds the ${scope}. Name one, for example 3M, JPMorgan or Pfizer.</p>`;
  }
  if (!res.loaded.length) {
    return `<p class="error">The filter picked ${esc(list(res.allowed.map((d) => names.get(d) || d)))}, and none of those are among the demo's ${scope}. Ask about a filing a FinanceBench question cites, or try an example.</p>`;
  }
  return "";
}

// Ranks from the benchmark run over all 360 filings: 1-based, null when below 100.
const place = (r) => (r == null ? "below 100" : `at ${r}`);

export function benchmarkLine(q, hits, names, { compact = false } = {}) {
  const gold = new Set(q.gold.map(([d, p]) => `${d}#${p}`));
  const found = hits.findIndex((h) => gold.has(`${h.doc}#${h.page}`));
  const oneFiling = hits.length && hits.every((h) => h.doc === hits[0].doc) && q.gold.every(([d]) => d === hits[0].doc);
  const where = list(q.gold.map(([d, p]) => (oneFiling ? `page ${p + 1}` : `${names.get(d) || d}, page ${p + 1}`)));
  const r = q.first_gold_rank || {};
  if (compact) {
    const ord = (n) => ["first", "second", "third"][n - 1] || `${n}th`;
    const base = "bm25" in r ? `; BM25 over every page ranked it ${r.bm25 == null ? "below 100" : ord(r.bm25)}` : "";
    return found >= 0
      ? `<p>FinanceBench's answer is ${esc(where)}. This pipeline ranks it ${ord(found + 1)}${base}.</p>`
      : `<p>FinanceBench's answer is ${esc(where)}, and <span class="error">it isn't in the top ${hits.length} here</span>.</p>`;
  }
  const split = q.split === "test" ? "one of the 100 held-out questions" : "one of the 50 I tuned on";
  const bench = [];
  if ("bm25" in r) bench.push(`BM25 over all 53,399 pages put it ${place(r.bm25)}`);
  if ("headline" in r) bench.push(`the hybrid with MiniLM ${place(r.headline)}`);
  const answer = q.a ? ` Expected answer: ${esc(q.a.length > 160 ? q.a.slice(0, 160) + "…" : q.a)}.` : "";
  return `<p>FinanceBench question <code>${esc(q.id.replace("financebench_id_", ""))}</code>, ${split}, labels ${esc(where)} as the answer. ` +
    (found >= 0 ? `Here it's result ${found + 1}.` : `<span class="error">It isn't in the top ${hits.length} here.</span>`) +
    (bench.length ? ` In the benchmark run, ${list(bench)}.` : "") + answer + `</p>`;
}

// One result per item. When every result comes from one filing, the steps above already name
// it, so each result says only its page.
// The compact form, for the card on the home page, quotes one line of each result after the first
// and leaves out the scores.
export function hits(res, gold, names, { compact = false } = {}) {
  const oneFiling = res.hits.every((h) => h.doc === res.hits[0]?.doc);
  return res.hits.map((h, i) => {
    const isGold = gold.has(`${h.doc}#${h.page}`);
    const at = oneFiling ? `Page ${h.page + 1}` : `${esc(names.get(h.doc) || h.doc)}, page ${h.page + 1}`;
    const tags = h.kinds.map((k) => `<span class="tag">${TAG[k]}</span>`).join("") + (isGold ? `<span class="tag answer">Labeled answer</span>` : "");
    const head = `<div class="hit-head"><span class="rank">${i + 1}</span><span class="at">${at}</span>${tags}${compact ? "" : `<span class="score">BM25 ${h.score.toFixed(2)}</span>`}</div>`;
    if (compact) return `<li${i ? ' class="brief"' : ""}>\n${head}\n<p class="excerpt">${excerpt(h.text, res.tokens)}</p>\n</li>`;
    return `<li>
${head}
<p class="excerpt">${excerpt(h.text, res.tokens)}</p>
<details class="page"><summary>Whole page</summary><div class="page-text">${mark(h.text, new Set(res.tokens))}</div></details>
</li>`;
  }).join("\n");
}

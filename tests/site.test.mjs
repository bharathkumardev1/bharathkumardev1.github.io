// Checks that keep the site honest: the generated parts match the results files, both demos
// return what the Python code returned, every page reads without JavaScript, links resolve,
// figures carry their text alternatives, the copy stays clean, and pages stay small.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { Engine } from "../assets/finrag.mjs";
import { makeScorer, calibrate } from "../assets/gbdt.mjs";
import { PAGES, assetsOf } from "../tools/build.mjs";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const json = (p) => JSON.parse(read(p));
const pages = Object.fromEntries(Object.keys(PAGES).map((f) => [f, read(f)]));
const HOME = pages["index.html"];
const FINANCE = pages["projects/finance-rag-eval/index.html"];
const READMIT = pages["projects/readmission-capacity/index.html"];
const ids = (html) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
// Page text from the filings is quoted as it was filed, so the copy rules skip it.
const copyOf = (html) => html.replace(/<!--[\s\S]*?-->/g, "").replace(/<script[\s\S]*?<\/script>/g, "")
  .replace(/<p class="excerpt">[\s\S]*?<\/p>/g, "").replace(/<div class="page-text">[\s\S]*?<\/div>/g, "");

test("every page is up to date with the results files", () => {
  execFileSync("node", ["tools/build.mjs", "--check"], { cwd: root, stdio: "pipe" });
});

test("every number in the retrieval table comes from finance-rag-eval's summary", () => {
  const s = json("data/finrag/summary.json");
  const held = Object.fromEntries(s.eval.table.filter((r) => r.split === "test").map((r) => [r.config, r]));
  const rows = [...FINANCE.matchAll(/<tr[^>]*data-config="([^"]+)"[^>]*>([\s\S]*?)<\/tr>/g)];
  assert.equal(rows.length, 8);
  for (const [, key, cells] of rows) {
    const nums = [...cells.matchAll(/<td class="n[^"]*">([^<]+)/g)].map((m) => m[1]);
    assert.equal(nums[0], held[key]["hit@10"].toFixed(2), key);
    assert.equal(nums[2], held[key]["mrr@10"].toFixed(3), key);
  }
});

test("search demo matches the Python pipeline on every exported case", async () => {
  const dir = new URL("data/finrag/", root);
  const meta = JSON.parse(readFileSync(new URL("meta.json", dir), "utf8"));
  const questions = JSON.parse(readFileSync(new URL("questions.json", dir), "utf8"));
  const parity = json("tests/finrag_parity.json");
  const engine = new Engine(meta, async (doc) =>
    JSON.parse(gunzipSync(readFileSync(new URL(`filings/${doc}.json.gz`, dir))).toString("utf8")));
  assert.ok(parity.length > 400);
  for (const c of parity) {
    const q = questions.find((x) => x.id === c.id);
    const res = await engine.search(q.q, { k: 10, route: c.opts.route, drop: c.opts.drop });
    assert.deepEqual(res.allowed, c.allowed, c.id);
    assert.deepEqual(res.hits.map((h) => [h.doc, h.page]), c.top, c.id);
    res.hits.forEach((h, i) => assert.equal(h.score, c.scores[i], `${c.id} #${i + 1}`));
  }
});

test("example questions are benchmark questions, and the ones marked as misses miss", () => {
  const byText = new Map(json("data/finrag/questions.json").map((q) => [q.q, q]));
  for (const html of [HOME, FINANCE]) {
    const examples = [...html.matchAll(/data-example="([^"]+)"( data-misses)?/g)];
    assert.ok(examples.length >= 3);
    for (const [, text, misses] of examples) {
      const q = byText.get(text.replace(/&#39;|&apos;/g, "'"));
      assert.ok(q, text);
      const rank = q.first_gold_rank.full_bm25; // the demo with both switches on
      if (misses) assert.ok(rank === null || rank > 10, `${text} is supposed to miss`);
      else assert.ok(rank !== null && rank <= 10, `${text} is supposed to hit`);
    }
  }
});

test("readmission scorer matches LightGBM on held-out rows", () => {
  const model = json("data/readmit/model.json");
  const { rows, raw } = json("tests/readmit_parity.json");
  const score = makeScorer(model);
  assert.ok(rows.length >= 300);
  rows.forEach((row, i) => assert.ok(Math.abs(score(row) - raw[i]) < 1e-9, `row ${i}`));
  const p = calibrate(model.calibration, raw[0]);
  assert.ok(p > 0 && p < 1);
});

test("pages read without JavaScript: results, tables and a scored patient are in the HTML", () => {
  const body = (html, id) => html.match(new RegExp(`<(?:tbody|ol) id="${id}"[^>]*>([\\s\\S]*?)</(?:tbody|ol)>`))[1];
  assert.equal((HOME.match(/<ul class="stats"[^>]*>([\s\S]*?)<\/ul>/)[1].match(/<li>/g) || []).length, 4);
  assert.equal((HOME.match(/<table class="metrics">/g) || []).length, 3);
  assert.equal((body(HOME, "hits").match(/<li[ >]/g) || []).length, 3);
  assert.equal((HOME.match(/<div class="chart [^"]*live/g) || []).length, 1);
  assert.equal((body(FINANCE, "hits").match(/<li>/g) || []).length, 3);
  assert.equal((body(READMIT, "capacity-table").match(/<tr>/g) || []).length, 6);
  assert.equal((body(READMIT, "call-list").match(/<tr>/g) || []).length, 5);
  assert.match(READMIT, /<div id="risk-out"[^>]*>\s*<!-- risk:start -->\s*<p><strong>\d+\.\d%<\/strong> chance/);
});

test("links within and between pages resolve, and so do local files", () => {
  for (const [file, html] of Object.entries(pages)) {
    const base = new URL(file, root);
    // The 404 page's links start at the site's root, wherever it's served from.
    const resolve = (ref) => (ref.startsWith("/") ? new URL(ref.slice(1), root) : new URL(ref, base));
    for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
      if (/^(https?:|mailto:|data:)/.test(href)) continue;
      const url = resolve(href);
      const path = url.pathname.endsWith("/") ? `${url.pathname}index.html` : url.pathname;
      const target = new URL(path, root);
      assert.ok(existsSync(target), `${file}: ${href}`);
      if (url.hash) {
        const other = target.href === base.href ? html : readFileSync(target, "utf8");
        assert.ok(ids(other).has(url.hash.slice(1)), `${file}: ${href}`);
      }
    }
    for (const [, src] of html.matchAll(/src="([^"]+)"/g)) assert.ok(existsSync(resolve(src)), `${file}: ${src}`);
  }
  assert.ok(HOME.includes('href="Bharath_Mandha_Resume.pdf"'));
});

test("every page has one h1, a description, and a canonical URL or a noindex", () => {
  for (const [file, html] of Object.entries(pages)) {
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, file);
    assert.match(html, /<meta name="description" content="[^"]{60,}">/, file);
    if (file === "404.html") assert.match(html, /<meta name="robots" content="noindex">/);
    else assert.match(html, /<link rel="canonical" href="https:\/\/bharathkumardev1\.github\.io\/[^"]*">/, file);
    assert.equal(ids(html).size, [...html.matchAll(/\sid="([^"]+)"/g)].length, `${file} repeats an id`);
  }
});

test("figures carry their text: captions, labels and the numbers behind the hover", () => {
  for (const [file, html] of Object.entries(pages)) {
    for (const [, label] of html.matchAll(/role="img" aria-label="([^"]*)"/g)) assert.ok(label.length > 30, `${file}: ${label}`);
    assert.equal((html.match(/role="img"(?! aria-label)/g) || []).length, 0, `${file}: an image role without a label`);
    for (const [, fig] of html.matchAll(/<figure class="fig"[^>]*>([\s\S]*?)<\/figure>/g)) assert.match(fig, /<figcaption>/, file);
    for (const [, data] of html.matchAll(/<script type="application\/json" class="chart-data">([\s\S]*?)<\/script>/g)) {
      const d = JSON.parse(data);
      assert.equal(d.at.length, d.x.length, file);
      for (const s of d.series) assert.equal(s.y.length, d.x.length, `${file}: ${s.name}`);
    }
  }
});

test("copy has no em dashes, banned words or placeholders", () => {
  const copy = [...Object.values(pages).map(copyOf), read("README.md")].join("\n");
  assert.ok(!/[—–]/.test(copy), "dash");
  const banned = copy.match(/\b(seamless|robust|leverage[sd]?|cutting-edge|delve|game-changer|TODO|TBD|lorem)\b/gi);
  assert.equal(banned, null, String(banned));
  assert.ok(!/not just [^.]* but /i.test(copy));
  assert.ok(!/[→·]/.test(copy.replace(/<[^>]+>/g, "")), "arrows or middle dots in the copy");
});

test("each page stays under 160 KB before a demo loads its data", () => {
  for (const [file, html] of Object.entries(pages)) {
    const total = Buffer.byteLength(html) + assetsOf(file, html).reduce((a, u) => a + readFileSync(u).length, 0);
    assert.ok(total < 160 * 1024, `${file}: ${total} bytes`);
  }
});

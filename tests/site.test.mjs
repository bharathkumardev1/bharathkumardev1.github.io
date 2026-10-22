// Checks that keep the page honest: the generated parts match the results files, both demos
// return what the Python code returned, the page reads without JavaScript, links inside it
// resolve, the copy stays clean, and the page stays small.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { Engine } from "../assets/finrag.mjs";
import { makeScorer, calibrate } from "../assets/gbdt.mjs";
import { SCRIPTS } from "../tools/build.mjs";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const json = (p) => JSON.parse(read(p));
const html = read("index.html");

test("generated sections are up to date with the results files", () => {
  execFileSync("node", ["tools/build.mjs", "--check"], { cwd: root, stdio: "pipe" });
});

test("every number in the results table comes from finance-rag-eval's summary", () => {
  const s = json("data/finrag/summary.json");
  const test = Object.fromEntries(s.eval.table.filter((r) => r.split === "test").map((r) => [r.config, r]));
  const rows = [...html.matchAll(/<tr[^>]*data-config="([^"]+)"[^>]*>([\s\S]*?)<\/tr>/g)];
  assert.equal(rows.length, 8);
  for (const [, key, cells] of rows) {
    const nums = [...cells.matchAll(/<td class="n[^"]*">([^<]+)/g)].map((m) => m[1]);
    assert.equal(nums[0], test[key]["hit@10"].toFixed(2), key);
    assert.equal(nums[2], test[key]["mrr@10"].toFixed(3), key);
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

test("example questions are benchmark questions, and the one marked as a miss is one", () => {
  const byText = new Map(json("data/finrag/questions.json").map((q) => [q.q, q]));
  const examples = [...html.matchAll(/data-example="([^"]+)"( data-misses)?/g)];
  assert.ok(examples.length >= 3);
  for (const [, text, misses] of examples) {
    const q = byText.get(text.replace(/&#39;|&apos;/g, "'"));
    assert.ok(q, text);
    const rank = q.first_gold_rank.full_bm25; // the demo with both switches on
    if (misses) assert.ok(rank === null || rank > 10, `${text} is supposed to miss`);
    else assert.ok(rank !== null && rank <= 10, `${text} is supposed to hit`);
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

test("the page reads without JavaScript: tables are in the HTML, not drawn by a script", () => {
  const body = (id) => html.match(new RegExp(`<tbody id="${id}">([\\s\\S]*?)</tbody>`))[1];
  assert.equal((body("capacity-table").match(/<tr>/g) || []).length, 6);
  assert.equal((body("call-list").match(/<tr>/g) || []).length, 10);
  assert.ok(/<noscript>/.test(html));
});

test("in-page anchors and local files resolve", () => {
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const [, href] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.has(href), href);
  const local = [...html.matchAll(/(?:href|src)="((?:assets|data)\/[^"]+|[^":#?]+\.pdf)"/g)].map((m) => m[1]);
  assert.ok(local.includes("Bharath_Mandha_Resume.pdf"));
  for (const src of local) assert.ok(existsSync(new URL(src, root)), src);
});

test("copy has no em dashes, banned words or placeholders", () => {
  const copy = [html, read("README.md")].join("\n").replace(/<!--[\s\S]*?-->/g, "");
  assert.ok(!/[—–]/.test(copy), "dash");
  const banned = copy.match(/\b(seamless|robust|leverage[sd]?|cutting-edge|delve|game-changer|TODO|TBD|lorem)\b/gi);
  assert.equal(banned, null, String(banned));
  assert.ok(!/not just [^.]* but /i.test(copy));
});

test("page weight before the demos load stays under 120 KB", () => {
  const total = SCRIPTS.reduce((a, f) => a + readFileSync(new URL(f, root)).length, 0);
  assert.ok(total < 120 * 1024, `${total} bytes`);
});

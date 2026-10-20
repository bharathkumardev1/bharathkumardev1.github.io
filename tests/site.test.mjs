// Checks that keep the page honest: the generated parts match the results file, both demos
// return what the Python code returned, the numbers quoted in the readmission prose come
// out of the shipped data, links inside the page resolve, and the page stays small.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { Engine } from "../assets/finrag.mjs";
import { makeScorer, calibrate, capacityCurve } from "../assets/gbdt.mjs";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const json = (p) => JSON.parse(read(p));
const html = read("index.html");
const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

test("generated sections are up to date with data/finrag/summary.json", () => {
  execFileSync("node", ["tools/build.mjs", "--check"], { cwd: root, stdio: "pipe" });
});

test("every number in the results table comes from the summary", () => {
  const s = json("data/finrag/summary.json");
  const rows = [...html.matchAll(/<tr[^>]*data-config="([^"]+)"[^>]*>([\s\S]*?)<\/tr>/g)];
  assert.ok(rows.length >= 6);
  for (const [, key, cells] of rows) {
    const nums = [...cells.matchAll(/<td class="n[^"]*">([^<]+)/g)].map((m) => m[1]);
    assert.equal(nums[0], s.test[key]["hit@10"].toFixed(2), key);
    assert.equal(nums[2], s.test[key]["mrr@10"].toFixed(3), key);
  }
});

test("search demo matches the Python pipeline on the exported parity cases", async () => {
  const dir = new URL("data/finrag/", root);
  const meta = JSON.parse(readFileSync(new URL("meta.json", dir), "utf8"));
  const questions = JSON.parse(readFileSync(new URL("questions.json", dir), "utf8"));
  const parity = json("tests/parity.json");
  const engine = new Engine(meta, async (doc) =>
    JSON.parse(gunzipSync(readFileSync(new URL(`filings/${doc}.json.gz`, dir))).toString("utf8")));
  assert.ok(parity.length > 400);
  for (const c of parity) {
    const q = questions.find((x) => x.id === c.id);
    const res = await engine.search(q.q, { k: 10, route: c.opts.route, drop: c.opts.drop });
    assert.deepEqual(res.hits.map((h) => [h.doc, h.page]), c.top, c.id);
    res.hits.forEach((h, i) => assert.equal(h.score, c.scores[i], `${c.id} #${i + 1}`));
  }
});

test("example questions are real benchmark questions with a filing in the demo", () => {
  const questions = json("data/finrag/questions.json");
  const texts = new Set(questions.map((q) => q.q));
  const examples = [...html.matchAll(/data-example="([^"]+)"/g)].map((m) => m[1].replace(/&#39;|&apos;/g, "'"));
  assert.ok(examples.length >= 3);
  for (const e of examples) assert.ok(texts.has(e), e);
});

test("readmission scorer matches LightGBM on held-out rows", () => {
  const model = json("data/readmit/model.json");
  const { rows, raw } = json("tests/readmit_parity.json");
  const score = makeScorer(model);
  assert.ok(rows.length >= 100);
  rows.forEach((row, i) => assert.ok(Math.abs(score(row) - raw[i]) < 1e-9, `row ${i}`));
  const p = calibrate(model.calibration, raw[0]);
  assert.ok(p > 0 && p < 1);
});

test("readmission numbers in the text come from the shipped rankings", () => {
  const cap = json("data/readmit/capacity.json");
  const at10 = (name) => capacityCurve(cap.ranked_labels[name], cap.n)(0.1);
  const pct = (r) => `${((r.caught / r.positives) * 100).toFixed(1)}%`;
  assert.equal(cap.n.toLocaleString("en-US"), "19,745");
  assert.ok(text.includes(`On ${cap.n.toLocaleString("en-US")} held-out encounters`));
  assert.ok(text.includes(`reaches ${pct(at10("LightGBM"))} of the patients`), pct(at10("LightGBM")));
  assert.ok(text.includes(`against ${pct(at10("prior inpatient visits"))} when ranking by prior inpatient visits`));
  assert.ok(text.includes(`${pct(at10("LACE"))} with a LACE score`));
});

test("in-page anchors and local files resolve", () => {
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const [, href] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.has(href), href);
  for (const [, src] of html.matchAll(/(?:href|src)="((?:assets|data)\/[^"]+|[^":#?]+\.pdf)"/g))
    assert.ok(existsSync(new URL(src, root)), src);
});

test("page weight before the demos load stays under 120 KB", () => {
  const files = ["index.html", "assets/site.css", "assets/demo.js", "assets/finrag.mjs", "assets/readmit.js",
    "assets/gbdt.mjs", "assets/fonts/public-sans-latin-wght-normal.woff2"];
  const total = files.reduce((a, f) => a + readFileSync(new URL(f, root)).length, 0);
  assert.ok(total < 120 * 1024, `${total} bytes`);
});

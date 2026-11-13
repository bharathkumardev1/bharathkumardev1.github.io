// Draws the link-preview image for each project page into assets/og/<name>.png.
// Development only: needs Playwright and Chromium, and the site build does not run it.
// Every number below is copied from the project page it belongs to.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const font = readFileSync(new URL("assets/fonts/public-sans-latin-wght-normal.woff2", root)).toString("base64");

export const CARDS = {
  "finance-rag-eval": {
    title: "Finding the page that answers a question about a 10-K",
    metric: "Hit@10 on 100 held-out FinanceBench questions",
    max: 1, digits: 2,
    rows: [["BM25 over every page", 0.14], ["+ company, year, quarter", 0.43], ["+ statement routing", 0.71]],
  },
  "readmission-capacity": {
    title: "Who to call after a hospital discharge",
    metric: "Share of 30-day readmissions reached by calling 10% of discharges",
    note: "101,766 public encounters, split by patient",
    max: 0.3, pct: true, lead: 0,
    rows: [["LightGBM", 0.25], ["Most prior stays first", 0.206], ["LACE", 0.153], ["Random", 0.1]],
  },
  "research-assistant": {
    title: "A research assistant that reviews its own answers",
    metric: "Answers judged correct on 150 QASPER test questions",
    max: 1, pct: true,
    rows: [["Single pass, top 5 passages", 0.56], ["Review loop", 0.587], ["Single pass, top 10 passages", 0.68]],
  },
  "tlc-demand": {
    title: "Forecasting taxi demand, and where the model loses",
    metric: "WAPE over three June 2023 backtest weeks, lower is better",
    max: 0.4, digits: 4, lead: 0,
    rows: [["Poisson LightGBM", 0.2415], ["Best of three baselines", 0.3104]],
  },
  "wiki-retrieval": {
    title: "What each stage of a search stack buys",
    metric: "nDCG@10 on BEIR Natural Questions, 2,681,468 passages",
    max: 0.5, digits: 3,
    rows: [["BM25", 0.29], ["MiniLM bi-encoder, untuned", 0.389], ["MiniLM bi-encoder, LoRA-tuned", 0.402]],
  },
};

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const fmt = (c, v) => (c.pct ? (v * 100).toFixed(1) + "%" : v.toFixed(c.digits));

export function html(c) {
  const last = c.lead ?? c.rows.length - 1; // the row the card is about
  const rows = c.rows.map(([label, v], i) => `
    <div class="row"><div class="label">${esc(label)}</div>
      <div class="track"><div class="bar${i === last ? " lead" : ""}" style="width:${(v / c.max) * 100}%"></div></div>
      <div class="val${i === last ? " lead" : ""}">${fmt(c, v)}</div></div>`).join("");
  return `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:PS;src:url(data:font/woff2;base64,${font}) format("woff2");font-weight:100 900}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;background:#fff;color:#0f1d2e;font-family:PS,sans-serif;padding:64px 80px;position:relative}
.mark{display:inline-block;font-weight:800;font-size:34px;letter-spacing:-.5px;background:linear-gradient(transparent 78%,#ffe066 78%);line-height:1.1}
.url{position:absolute;right:80px;top:70px;font-size:24px;color:#566579}
h1{font-size:58px;line-height:1.08;font-weight:800;letter-spacing:-1.2px;margin-top:34px;max-width:1000px}
.metric{font-size:26px;color:#566579;margin-top:26px;font-weight:500}
.note{font-size:22px;color:#7a8799;margin-top:4px}
.rows{position:absolute;left:80px;right:80px;bottom:56px}
.row{display:grid;grid-template-columns:400px 1fr 120px;align-items:center;height:${c.rows.length > 3 ? 46 : 54}px}
.label{font-size:25px;color:#3a4a5e;font-weight:500;padding-right:16px}
.track{height:22px}
.bar{height:22px;background:#c5cfdb;border-radius:0 4px 4px 0}
.bar.lead{background:#0f1d2e}
.val{font-size:30px;font-weight:700;text-align:right;color:#566579;font-variant-numeric:tabular-nums}
.val.lead{color:#0f1d2e}
</style><span class="mark">BM</span><span class="url">bharathkumardev1.github.io</span>
<h1>${esc(c.title)}</h1><div class="metric">${esc(c.metric)}</div>${c.note ? `<div class="note">${esc(c.note)}</div>` : ""}
<div class="rows">${rows}</div>`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { chromium } = createRequire(import.meta.url)("playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  for (const [name, c] of Object.entries(CARDS)) {
    await page.setContent(html(c));
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: fileURLToPath(new URL(`assets/og/${name}.png`, root)) });
    console.log(`wrote assets/og/${name}.png`);
  }
  await browser.close();
}

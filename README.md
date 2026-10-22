# bharathkumardev1.github.io

My site, at https://bharathkumardev1.github.io. One HTML page, one stylesheet, five small ES modules and one font, with no framework. Two demos run in the browser on data exported from my project repos:

- Filing search ([`assets/finrag.mjs`](assets/finrag.mjs)): the filter, BM25 and statement routing from [finance-rag-eval](https://github.com/bharathkumardev1/finance-rag-eval) over the 84 SEC filings that FinanceBench questions cite, fetching one gzipped filing at a time.
- Readmission call list ([`assets/gbdt.mjs`](assets/gbdt.mjs), [`assets/readmit-view.mjs`](assets/readmit-view.mjs)): the LightGBM trees, calibration, held-out capacity curves and the call list with its reason codes from [readmission-capacity](https://github.com/bharathkumardev1/readmission-capacity).

`finrag.mjs` and `gbdt.mjs` are copied unchanged from those repos' `web/` folders, where their own CI checks them against the Python code.

## Where the numbers come from

Every number on the page is written in by [`tools/build.mjs`](tools/build.mjs) from the projects' results files: `data/finrag/summary.json`, which `finrag export-demo` copies out of finance-rag-eval's `results/`, and `data/readmit/metrics.json` and `load.json`, which `readmit export` copies from readmission-capacity. The build also asserts each claim in the prose against those numbers (that the hybrid's difference from BM25 is inside its interval, that only the missing-value check catches the blanked diagnoses, and so on), so a rerun that changes a conclusion fails the build instead of leaving a wrong sentence on the page.

```bash
# in finance-rag-eval
finrag export-demo --out ../bharathkumardev1.github.io/data/finrag
mv ../bharathkumardev1.github.io/data/finrag/parity.json ../bharathkumardev1.github.io/tests/finrag_parity.json
cp web/finrag.mjs ../bharathkumardev1.github.io/assets/

# in readmission-capacity
readmit export --out ../bharathkumardev1.github.io/data/readmit
cp web/gbdt.mjs ../bharathkumardev1.github.io/assets/
# then keep the first 300 rows of data/readmit/parity.json as tests/readmit_parity.json

# here
npm run build    # rewrite the generated parts of index.html
npm test         # Node 20+, no dependencies
```

## Tests

`npm test` checks that `index.html` is what the build writes from the current results files, that every number in the results table comes from them, that the JavaScript search returns the same pages with the same float64 scores as the Python pipeline on 438 question and setting pairs, that the JavaScript tree walker matches LightGBM on 300 held-out rows, that the example questions do what the page says they do, that the tables are in the HTML so the page reads without JavaScript, that local links resolve, that the copy has no em dashes or filler words, and that the page stays under 120 KB before the demos load. CI runs the same on every push, then Lighthouse on a phone profile.

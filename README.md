# bharathkumardev1.github.io

My site, at https://bharathkumardev1.github.io: a home page and a case study for each project. Plain HTML, one stylesheet, a few small ES modules and one font, with no framework and no tracking.

- [`index.html`](index.html): who I am; the three projects, with a filing search you can try, the call-capacity chart and the review loop; my work history, skills and education.
- [`projects/finance-rag-eval/`](projects/finance-rag-eval/index.html): retrieval over SEC filings, step by step on FinanceBench, with the search demo and its switches.
- [`projects/readmission-capacity/`](projects/readmission-capacity/index.html): the readmission call list, with the capacity planner, the reasons behind each call and a patient scorer.
- [`projects/research-assistant/`](projects/research-assistant/index.html): the review loop and how its evaluation is recorded and replayed.
- [`404.html`](404.html): what GitHub Pages shows at an address with no page, with links to the projects.

Two demos run in the browser on data exported from the project repos:

- Filing search ([`assets/finrag.mjs`](assets/finrag.mjs)): the filter, BM25 and statement routing from [finance-rag-eval](https://github.com/bharathkumardev1/finance-rag-eval) over the 84 SEC filings that FinanceBench questions cite, fetching one gzipped filing at a time.
- Readmission planner ([`assets/gbdt.mjs`](assets/gbdt.mjs)): the LightGBM trees, calibration, held-out capacity curves and call list with reason codes from [readmission-capacity](https://github.com/bharathkumardev1/readmission-capacity).

`finrag.mjs` and `gbdt.mjs` are copied unchanged from those repos' `web/` folders, where their own CI checks them against the Python code. [`assets/finrag-view.mjs`](assets/finrag-view.mjs) and [`assets/readmit-view.mjs`](assets/readmit-view.mjs) turn their output into HTML, and the build uses the same two files, so what the page shows before any script runs is what the scripts would show.

## Where the numbers come from

Every number on the site is written in by [`tools/build.mjs`](tools/build.mjs) from the projects' results files: `data/finrag/summary.json`, which `finrag export-demo` copies out of finance-rag-eval's `results/`, and `data/readmit/metrics.json` and `load.json`, which `readmit export` copies from readmission-capacity. The charts and diagrams are drawn at build time by [`tools/figures.mjs`](tools/figures.mjs) from the same files, as HTML and SVG, so they read without JavaScript and every one has its numbers in a table next to it.

The build also checks each claim in the prose against the numbers (that the hybrid's difference from BM25 is inside its interval, that only the missing-value check catches the blanked diagnoses, and so on), so a rerun that changes a conclusion fails the build instead of leaving a wrong sentence on the page.

It also writes `sitemap.xml` and `robots.txt` from the list of pages, and the schema.org `Person` data in the home page's head from the same links the page shows.

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
npm run build    # rewrite the generated parts of every page, sitemap.xml and robots.txt
npm test         # Node 20+, no dependencies
```

A photo goes in `assets/img/portrait.jpg` (square, at least 208 px); the build puts it on the home page when the file is there. The same goes for GitHub's and LinkedIn's logos on the profile links: `assets/icons/github.svg` and `linkedin.svg`, plus `github-dark.svg` and `linkedin-dark.svg` for the dark theme, unmodified from [github.com/logos](https://github.com/logos) and [brand.linkedin.com](https://brand.linkedin.com/downloads). Without them the links get plain icons.

## Tests

`npm test` checks that every page is what the build writes from the current results files; that every number in the retrieval table comes from them; that the JavaScript search returns the same pages with the same float64 scores as the Python pipeline on 438 question and setting pairs; that the JavaScript tree walker matches LightGBM on 300 held-out rows; that the example questions do what the pages say; that results, tables and a scored patient are in the HTML so the pages read without JavaScript; that links within and between pages resolve; that every chart and diagram has a caption and a text alternative; that the sitemap lists every page and the structured data matches the home page; that the copy has no em dashes or filler words; and that each page stays under 160 KB before a demo loads data. CI runs the same on every push, then Lighthouse on a phone profile against all four pages.

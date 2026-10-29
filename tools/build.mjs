// Writes the generated parts of every page from the projects' own results files, so no number
// on the site is typed by hand:
//
//   data/finrag/summary.json   finance-rag-eval's results/*.json, via `finrag export-demo`
//   data/readmit/metrics.json  readmission-capacity's results, via `readmit export`
//   data/readmit/load.json     its load test
//
// Claims in the prose are asserted against the numbers (tools/common.mjs, claim). If a rerun
// changes a conclusion, the build fails instead of leaving a sentence that's no longer true.
//
//   node tools/build.mjs          rewrite the pages, sitemap.xml and robots.txt
//   node tools/build.mjs --check  exit 1 if any of them is out of date (CI runs this)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { root, read } from "./common.mjs";
import * as F from "./figures.mjs";
import * as finance from "./finance.mjs";
import * as readmit from "./readmit.mjs";

const SITE = "https://bharathkumardev1.github.io/";
const EMAIL = "bharathmandha.200@gmail.com";
const GITHUB = "https://github.com/bharathkumardev1";
const LINKEDIN = "https://www.linkedin.com/in/bharathmandha";
const FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230f1d2e'/%3E%3Crect x='7' y='9' width='18' height='2.5' rx='1.25' fill='%23ffffff' opacity='.55'/%3E%3Crect x='6' y='15' width='20' height='7' rx='2' fill='%23ffe066'/%3E%3C/svg%3E";
const THEME_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M12 3.75a8.25 8.25 0 0 1 0 16.5z" fill="currentColor"/></svg>`;

const attr = (html, re) => (html.match(re) || [])[1];

function head(p, html) {
  const title = attr(html, /<title>([^<]+)<\/title>/);
  const description = attr(html, /<meta name="description" content="([^"]+)">/);
  const url = attr(html, /<link rel="canonical" href="([^"]+)">/);
  const og = existsSync(new URL("assets/og.png", root));
  const icon = existsSync(new URL("assets/icon-180.png", root));
  // Link previews for every page with an address of its own; the 404 page has none.
  const preview = url ? [
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Bharath Mandha">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:url" content="${url}">`,
    og ? `<meta property="og:image" content="${SITE}assets/og.png">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n<meta name="twitter:card" content="summary_large_image">` : "",
  ] : [];
  return [
    `<link rel="preload" href="${p}assets/fonts/public-sans-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>`,
    `<link rel="stylesheet" href="${p}assets/site.css">`,
    `<link rel="icon" href="${FAVICON}">`,
    icon ? `<link rel="apple-touch-icon" href="${p}assets/icon-180.png">` : "",
    `<meta name="author" content="Bharath Mandha">`,
    `<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">`,
    `<meta name="theme-color" content="#0d1420" media="(prefers-color-scheme: dark)">`,
    ...preview,
    `<script>try{var t=localStorage.getItem("theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}</script>`,
  ].filter(Boolean).join("\n");
}

function header(p) {
  return `<header class="site-header"><div class="wrap">
<a class="brand" href="${p || "./"}"><span class="monogram" aria-hidden="true">BM</span><span class="brand-name">Bharath Mandha</span></a>
<nav class="site-nav" aria-label="Site">
<a class="hide-sm" href="${p}#experience">Experience</a>
<a href="${p}#projects">Projects</a>
<a class="hide-sm" href="${p}#skills">Skills</a>
<a class="hide-sm" href="${p}#contact">Contact</a>
<a href="${p}Bharath_Mandha_Resume.pdf">Résumé</a>
<button class="theme" type="button" aria-pressed="false" aria-label="Dark theme" title="Dark theme">${THEME_ICON}</button>
</nav>
</div></header>`;
}

// Every file a page loads before a demo fetches data: its stylesheet, scripts and what they
// import, the font, and images.
function assetsOf(file, html) {
  const base = new URL(file, root);
  const found = new Set();
  const visit = (url) => {
    const key = url.href;
    if (found.has(key)) return;
    found.add(key);
    if (/\.(m?js)$/.test(url.pathname)) {
      const src = readFileSync(url, "utf8");
      for (const [, dep] of src.matchAll(/(?:^|\n)\s*import\s[^"']*["'](\.[^"']+)["']/g)) visit(new URL(dep, url));
    }
  };
  for (const [, ref] of html.matchAll(/<(?:link rel="(?:stylesheet|preload)"|script type="module"|img)[^>]*?(?:href|src)="([^"]+)"/g)) {
    if (!/^(https?:|data:)/.test(ref)) visit(ref.startsWith("/") ? new URL(ref.slice(1), root) : new URL(ref, base));
  }
  return [...found].map((href) => new URL(href));
}

function footer() {
  return `<footer class="site-footer"><div class="wrap">
<p>© 2026 Bharath Mandha</p>
</div></footer>`;
}

function fill(html, name, content, inline = false) {
  const re = new RegExp(`(<!-- ${name}:start -->)[\\s\\S]*?(<!-- ${name}:end -->)`);
  if (!re.test(html)) throw new Error(`no ${name} markers`);
  return html.replace(re, () => (inline ? `<!-- ${name}:start -->${content}<!-- ${name}:end -->` : `<!-- ${name}:start -->\n${content}\n<!-- ${name}:end -->`));
}

// Icons for the profile links. GitHub's Invertocat and LinkedIn's [in] logo come from the files
// each company publishes for linking to a profile (github.com/logos, brand.linkedin.com).
// Neither may be recolored, so the dark theme gets its own file: assets/icons/github.svg on
// light, github-dark.svg on dark. Until the files are there, a plain icon stands in.
const ICON = {
  github: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/></svg>`,
  linkedin: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.2-3.6 4-5.5 7-5.5s5.8 1.9 7 5.5"/></svg>`,
  resume: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6M9 9h2"/></svg>`,
  email: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6 8.5-6"/></svg>`,
};
function icon(name) {
  const file = (suffix) => ["svg", "png"].map((ext) => `assets/icons/${name}${suffix}.${ext}`).find((src) => existsSync(new URL(src, root)));
  const light = file(""), dark = file("-dark");
  if (!light) return ICON[name];
  const img = (src, cls) => `<img class="${cls}" src="${src}" alt="" width="18" height="18">`;
  return dark ? img(light, "logo on-light") + img(dark, "logo on-dark") : img(light, "logo");
}

// The profile links, as pills: under the name, and in the contact section, where the email link
// shows the address.
function profileLinks(where) {
  const link = (href, name, text) => `<li><a href="${href}">${icon(name)}${text}</a></li>`;
  const items = where === "contact"
    ? [link(`mailto:${EMAIL}`, "email", EMAIL), link(LINKEDIN, "linkedin", "LinkedIn"), link(GITHUB, "github", "GitHub")]
    : [link(GITHUB, "github", "GitHub"), link(LINKEDIN, "linkedin", "LinkedIn"), link("Bharath_Mandha_Resume.pdf", "resume", "Résumé"), link(`mailto:${EMAIL}`, "email", "Email")];
  return `<ul class="links">\n${items.join("\n")}\n</ul>`;
}

// What search engines read about me: schema.org Person, from the same facts the page shows.
function person() {
  const data = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: "Bharath Mandha",
    url: SITE,
    jobTitle: "AI/ML Engineer",
    worksFor: { "@type": "Organization", name: "Goldman Sachs" },
    alumniOf: { "@type": "CollegeOrUniversity", name: "University of North Texas" },
    address: { "@type": "PostalAddress", addressLocality: "Dallas", addressRegion: "TX", addressCountry: "US" },
    email: EMAIL,
    sameAs: [GITHUB, LINKEDIN],
  };
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

function portrait() {
  for (const ext of ["webp", "jpg"]) {
    const src = `assets/img/portrait.${ext}`;
    if (existsSync(new URL(src, root))) return `<img class="portrait" src="${src}" width="208" height="208" alt="Bharath Mandha">`;
  }
  return "";
}

const LOOP_ARIA = "The loop: a question goes to retrieve, then answer, then review. Review either accepts the answer, which returns with its cited passages, or writes a refined query that goes back to retrieve, up to three rounds. A single pass skips the review.";
const REPLAY_ARIA = "Recording a run sends model calls to the OpenAI API and writes each reply to calls.jsonl, and writes every search with its scores to runs.jsonl. In CI the same evaluation reads replies from calls.jsonl by request hash, with no key, and recomputes each search, comparing its scores with runs.jsonl.";

export const PAGES = {
  "index.html": async (html) => {
    html = fill(html, "person", person());
    html = fill(html, "portrait", portrait(), true);
    html = fill(html, "links", profileLinks("hero"));
    html = fill(html, "contact", profileLinks("contact"));
    html = fill(html, "stat-finance", finance.stat(), true);
    const search = await finance.search();
    html = fill(html, "card-finance", finance.card());
    html = fill(html, "search-scope", search.scope, true);
    html = fill(html, "search-trace", search.trace);
    html = fill(html, "search-hits", search.hits);
    html = fill(html, "metrics-finance", finance.metrics());
    html = fill(html, "card-readmit", readmit.card());
    html = fill(html, "chart-readmit", readmit.cardChart());
    html = fill(html, "metrics-readmit", readmit.metrics());
    html = fill(html, "loop-ara", F.figure({
      title: "Review until the answer is supported", body: F.loopDiagram(LOOP_ARIA, { card: true }),
      caption: "It stops early at a 120 s deadline, at the spending cap, or when a refined query finds nothing new. The single pass it's measured against skips the review.",
    }));
    return html;
  },
  "projects/finance-rag-eval/index.html": async (html) => {
    const demo = await finance.demo();
    html = fill(html, "facts", finance.caseFacts());
    html = fill(html, "links", finance.links());
    html = fill(html, "demo-about", demo.about, true);
    html = fill(html, "demo-trace", demo.trace);
    html = fill(html, "demo-hits", demo.hits);
    html = fill(html, "demo-note", finance.demoNote(), true);
    html = fill(html, "pipeline", await finance.pipeline());
    html = fill(html, "results", finance.results());
    html = fill(html, "misses", finance.misses());
    html = fill(html, "service", finance.service());
    html = fill(html, "checks", finance.checks());
    html = fill(html, "rerank", finance.rerank());
    html = fill(html, "generation", finance.generation());
    html = fill(html, "sources", finance.sources());
    return html;
  },
  "projects/readmission-capacity/index.html": async (html) => {
    html = fill(html, "facts", readmit.caseFacts());
    html = fill(html, "links", readmit.links());
    html = fill(html, "plan-about", readmit.planAbout());
    html = fill(html, "capacity-out", readmit.capacityOut(), true);
    html = fill(html, "risk", readmit.defaultRisk(html));
    html = fill(html, "capacity-chart", readmit.capacityChart());
    html = fill(html, "capacity", readmit.capacityRows());
    html = fill(html, "pipeline", readmit.pipeline());
    html = fill(html, "reasons", readmit.reasons());
    html = fill(html, "list", readmit.listTop());
    html = fill(html, "trust", readmit.trust());
    html = fill(html, "checks", readmit.checks());
    html = fill(html, "service", readmit.service());
    html = fill(html, "sources", readmit.sources());
    return html;
  },
  "projects/research-assistant/index.html": async (html) => {
    html = fill(html, "loop", F.figure({
      id: "fig-loop", body: F.loopDiagram(LOOP_ARIA),
      caption: "<b>Figure 1.</b> The loop. The single pass it's measured against is the same graph with the review switched off: retrieve once, answer once.",
    }));
    html = fill(html, "replay", F.figure({
      id: "fig-replay", body: F.replayDiagram(REPLAY_ARIA),
      caption: "<b>Figure 2.</b> What changes between recording a run and replaying it. Only the source of model replies is swapped; retrieval runs again and has to agree with the log.",
    }));
    return html;
  },
  // GitHub Pages serves this for any address without a page, from that address, so its links
  // start at the root.
  "404.html": async (html) => html,
};

// Written next to the pages, from the list of them.
const LISTED = Object.keys(PAGES).filter((file) => file !== "404.html");
const FILES = {
  "sitemap.xml": () => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${LISTED.map((file) => `<url><loc>${SITE}${file.replace(/index\.html$/, "")}</loc></url>`).join("\n")}
</urlset>
`,
  "robots.txt": () => `User-agent: *
Allow: /

Sitemap: ${SITE}sitemap.xml
`,
};

export async function build(file, before) {
  const p = file === "404.html" ? "/" : "../".repeat(file.split("/").length - 1);
  let html = await PAGES[file](before);
  html = fill(html, "head", head(p, html));
  html = fill(html, "header", header(p));
  html = fill(html, "footer", footer());
  return html;
}

export { assetsOf };

if (import.meta.url === `file://${process.argv[1]}`) {
  const check = process.argv.includes("--check");
  let stale = 0;
  const outputs = [];
  for (const file of Object.keys(PAGES)) outputs.push([file, await build(file, read(file))]);
  for (const [file, make] of Object.entries(FILES)) outputs.push([file, make()]);
  for (const [file, text] of outputs) {
    const path = new URL(file, root);
    if (check) {
      if (!existsSync(path) || readFileSync(path, "utf8") !== text) {
        console.error(`${file} is out of date: run node tools/build.mjs`);
        stale++;
      }
    } else {
      writeFileSync(path, text);
      console.log(`wrote ${file} (${Buffer.byteLength(text)} bytes)`);
    }
  }
  if (stale) process.exit(1);
  if (check) console.log("everything the build writes is up to date");
}

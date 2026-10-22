// Charts and diagrams for the pages, written as HTML at build time so they read without
// JavaScript. Line charts draw their marks in an SVG that stretches to the box
// (non-scaling strokes) and keep every word as HTML, so text stays legible at any width.
// assets/charts.js adds the hover and keyboard layer on top.

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const r = (x) => Math.round(x * 100) / 100;
const at = (v, [a, b]) => r(((v - a) / (b - a)) * 100);

// Value formats shared with assets/charts.js, which formats the hover readout the same way.
export const FORMATS = {
  pct0: (x) => `${Math.round(x * 100)}%`,
  pct1: (x) => `${(x * 100).toFixed(1)}%`,
  f2: (x) => x.toFixed(2),
  int: (x) => Math.round(x).toLocaleString("en-US"),
  ms: (x) => `${x < 10 ? x.toFixed(1) : x.toFixed(0)} ms`,
  rps: (x) => `${x.toFixed(0)}/s`,
  clients: (x) => `${x} client${x === 1 ? "" : "s"}`,
  called: (x) => `${Math.round(x * 100)}% called`,
};

export function legend(items) {
  return `<ul class="legend">${items.map(({ cls, name, thin }) =>
    `<li><i class="key ${cls}${thin ? " thin" : ""}" aria-hidden="true"></i>${esc(name)}</li>`).join("")}</ul>`;
}

// A line chart. series: [{name, cls, thin, points: [[x, y], ...]}], all on the same x values.
// labels: direct labels at a series' point, [{series, x, text, pos}]. marker: {x, flag, id}.
export function lineChart({ id, x, y, series, labels = [], marker, height = "tall", aria, hover = true, xfmt, yfmt, xIndex, gutter = false }) {
  const X = (v) => at(xIndex ? xIndex.indexOf(v) : v, xIndex ? [0, xIndex.length - 1] : x.domain);
  const Y = (v) => r(100 - at(v, y.domain));
  const grid = y.ticks.filter((t) => t !== y.domain[0]).map((t) =>
    `<line x1="0" x2="100" y1="${Y(t)}" y2="${Y(t)}" vector-effect="non-scaling-stroke"/>`).join("");
  const lines = series.map((s) => `<polyline class="line ${s.cls}${s.thin ? " thin" : ""}" vector-effect="non-scaling-stroke" points="${s.points.map(([a, b]) => `${X(a)},${Y(b)}`).join(" ")}"/>`).join("");
  const yt = y.ticks.map((t) => `<span class="tick y" style="top:${Y(t)}%">${esc(y.fmt(t))}</span>`).join("");
  const xt = x.ticks.map((t) => `<span class="tick x" style="left:${X(t)}%">${esc(x.fmt(t))}</span>`).join("");
  const lab = labels.map((l) => {
    const s = series.find((q) => q.name === l.series);
    const p = s.points.find(([a]) => a === l.x);
    if (!p) throw new Error(`no point at ${l.x} on ${l.series}`);
    return `<span class="end-label${l.pos ? ` ${l.pos}` : ""}" style="left:${X(p[0])}%;top:${Y(p[1])}%">${l.text}</span>`;
  }).join("");
  const dots = labels.filter((l) => l.dot).map((l) => {
    const s = series.find((q) => q.name === l.series);
    const p = s.points.find(([a]) => a === l.x);
    return `<span class="pt ${s.cls}" style="left:${X(p[0])}%;top:${Y(p[1])}%"></span>`;
  }).join("");
  const mk = marker ? `<span class="marker"${marker.id ? ` id="${marker.id}"` : ""} style="left:${X(marker.x)}%"><span class="flag">${esc(marker.flag)}</span></span>` : "";
  const titles = (x.title ? `<span class="axis-title x">${esc(x.title)}</span>` : "") + (y.title ? `<span class="axis-title y">${esc(y.title)}</span>` : "");
  const data = hover ? `<script type="application/json" class="chart-data">${JSON.stringify({
    x: series[0].points.map(([a]) => a), at: series[0].points.map(([a]) => X(a)),
    xfmt, yfmt, top: y.domain[1], bottom: y.domain[0],
    series: series.map((s) => ({ name: s.name, cls: s.cls, y: s.points.map(([, b]) => b) })),
  }).replace(/</g, "\\u003c")}</script>` : "";
  const n = series[0].points.length;
  const readout = (i) => `${FORMATS[xfmt](series[0].points[i][0])}: ${series.map((s) => `${s.name} ${FORMATS[yfmt](s.points[i][1])}`).join(", ")}`;
  const layer = hover ? `<div class="hover" tabindex="0" role="slider" aria-label="Values along the chart" aria-valuemin="0" aria-valuemax="${n - 1}" aria-valuenow="0" aria-valuetext="${esc(readout(0))}"></div><span class="cross" aria-hidden="true"></span><div class="tip" aria-hidden="true"></div>` : "";
  return `<div class="chart ${height}${hover ? " live" : ""}${gutter ? " gutter" : ""}"${id ? ` id="${id}"` : ""}><div class="area">
<div class="plot" role="img" aria-label="${esc(aria)}"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><g class="grid">${grid}</g><line class="base" x1="0" x2="100" y1="100" y2="100" vector-effect="non-scaling-stroke"/>${lines}</svg>
${yt}${xt}${titles}${mk}${dots}${lab}</div>${layer}</div>${data}</div>`;
}

// A scatter of points against the y = x line (calibration). points: [{x, y, tip}].
export function scatter({ points, domain, ticks, fmt, aria, xTitle, yTitle, cls = "s1", height = "mid" }) {
  const P = (v) => at(v, domain);
  const grid = ticks.filter((t) => t !== domain[0]).map((t) =>
    `<line x1="0" x2="100" y1="${r(100 - P(t))}" y2="${r(100 - P(t))}" vector-effect="non-scaling-stroke"/>`).join("");
  const yt = ticks.map((t) => `<span class="tick y" style="top:${r(100 - P(t))}%">${esc(fmt(t))}</span>`).join("");
  const xt = ticks.map((t) => `<span class="tick x" style="left:${P(t)}%">${esc(fmt(t))}</span>`).join("");
  const pts = points.map((p) => `<span class="pt hit ${cls}" tabindex="0" role="img" aria-label="${esc(p.tip)}" data-tip="${esc(p.tip)}" style="left:${P(p.x)}%;top:${r(100 - P(p.y))}%"></span>`).join("");
  return `<div class="chart ${height} points"><div class="area">
<div class="plot" role="img" aria-label="${esc(aria)}"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><g class="grid">${grid}</g><line class="base" x1="0" x2="100" y1="100" y2="100" vector-effect="non-scaling-stroke"/><line class="ref" x1="0" y1="100" x2="100" y2="0" vector-effect="non-scaling-stroke"/></svg>
${yt}${xt}<span class="axis-title x">${esc(xTitle)}</span><span class="axis-title y">${esc(yTitle)}</span></div>${pts}<div class="tip" aria-hidden="true"></div></div></div>`;
}

const scale = (domain, ticks, fmt, name, cls = "") => `<div class="scale${cls ? ` ${cls}` : ""}" aria-hidden="true"><span class="lab-pad"></span><div class="ticks">${ticks.map((t) =>
  `<span style="left:${at(t, domain)}%">${esc(fmt(t))}</span>`).join("")}</div><span></span>${name ? `<span class="name">${esc(name)}</span>` : ""}</div>`;

// A dot per row with its 95% interval. rows: [{label, value, lo, hi, cls, alt}], or {split: true}.
const gridlines = (domain, ticks) => ticks.map((t) => `<span class="g" style="left:${at(t, domain)}%"></span>`).join("");

export function dotRows({ rows, domain, ticks, fmt, aria, name }) {
  const g = gridlines(domain, ticks);
  const body = rows.map((row) => {
    if (row.split) return `<div class="row-split"></div>`;
    const a = row.alt ? " alt" : "";
    const ci = row.lo == null ? "" : `<span class="ci" style="left:${at(row.lo, domain)}%;width:${r(at(row.hi, domain) - at(row.lo, domain))}%"></span>`;
    return `<div class="lab${a}">${esc(row.label)}</div><div class="lane ${row.cls}">${g}${ci}<span class="dot" style="left:${at(row.value, domain)}%"></span></div><div class="val${a}">${esc(fmt(row.value))}</div>`;
  }).join("\n");
  return `<div class="rows" role="img" aria-label="${esc(aria)}">\n${body}\n</div>${scale(domain, ticks, fmt, name)}`;
}

// A bar per row, value at the tip. rows: [{label, value, cls}].
export function barRows({ rows, domain, ticks, fmt, aria, name }) {
  const g = gridlines(domain, ticks);
  const body = rows.map((row) => `<div class="lab">${esc(row.label)}</div><div class="lane ${row.cls || "s1"}">${g}<span class="bar" style="width:${at(row.value, domain)}%"></span><span class="tipval" style="left:${at(row.value, domain)}%">${esc(fmt(row.value))}</span></div><div class="val"></div>`).join("\n");
  return `<div class="rows bars" role="img" aria-label="${esc(aria)}">\n${body}\n</div>${scale(domain, ticks, fmt, name, "bars")}`;
}

// Part of a whole per row: the filled part, a 2px gap, then the rest as a track.
export function partRows({ rows, domain, ticks, fmt, aria, name }) {
  const g = gridlines(domain, ticks);
  const body = rows.map((row) => {
    const p = at(row.part, domain), t = at(row.total, domain);
    return `<div class="lab">${esc(row.label)}</div><div class="lane s1">${g}<span class="bar part" style="width:${p}%"></span><span class="bar track" style="left:calc(${p}% + 2px);width:calc(${r(t - p)}% - 2px)"></span></div><div class="val">${esc(row.value)}</div>`;
  }).join("\n");
  return `<div class="rows" role="img" aria-label="${esc(aria)}">\n${body}\n</div>${scale(domain, ticks, fmt, name)}`;
}

// A pipeline as an ordered list of steps. steps: [{what, how, count, unit, strong}].
export function flow(steps, aria) {
  return `<ol class="flow" aria-label="${esc(aria)}">${steps.map((s) => `<li><div class="box${s.strong ? " key-step" : ""}"><span class="what">${esc(s.what)}</span>` +
    (s.count ? `<span class="count">${esc(s.count)}</span>${s.unit ? `<span class="unit">${esc(s.unit)}</span>` : ""}` : "") +
    (s.how ? `<span class="how">${s.how}</span>` : "") + `</div></li>`).join("")}</ol>`;
}

export function table({ caption, head, rows, numeric = [], cls = "" }) {
  const n = (i) => (numeric.includes(i) ? ' class="n"' : "");
  return `<div class="table-wrap"><table${cls ? ` class="${cls}"` : ""}>${caption ? `<caption>${caption}</caption>` : ""}
<thead><tr>${head.map((h, i) => `<th${n(i)}>${h}</th>`).join("")}</tr></thead>
<tbody>
${rows.map((row) => (row.group ? `<tr class="group"><th colspan="${head.length}" scope="colgroup">${row.group}</th></tr>` :
    `<tr${row.cls ? ` class="${row.cls}"` : ""}>${(row.cells || row).map((c, i) => `<td${n(i)}>${c}</td>`).join("")}</tr>`)).join("\n")}
</tbody></table></div>`;
}

export const twin = (inner, label = "Show the numbers") => `<details class="twin"><summary>${label}</summary>${inner}</details>`;

export function figure({ id, title, body, caption, frame = true }) {
  return `<figure class="fig"${id ? ` id="${id}"` : ""}>${frame ? `<div class="fig-frame">` : ""}${title ? `<p class="fig-title">${title}</p>` : ""}${body}${frame ? `</div>` : ""}${caption ? `<figcaption>${caption}</figcaption>` : ""}</figure>`;
}

// SVG diagrams ----------------------------------------------------------------------------

function node(x, y, w, h, title, sub, cls = "") {
  const lines = Array.isArray(sub) ? sub : sub ? [sub] : [];
  const cx = x + w / 2;
  const top = y + h / 2 - (lines.length * 15) / 2 + 5;
  return `<g class="node ${cls}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/>` +
    `<text class="title" x="${cx}" y="${top}" text-anchor="middle">${esc(title)}</text>` +
    lines.map((l, i) => `<text class="sub" x="${cx}" y="${top + 17 + i * 15}" text-anchor="middle">${esc(l)}</text>`).join("") + `</g>`;
}

// A straight or bent wire with an arrowhead at its last point.
function wire(points, label, { cls = "", lx, ly, anchor = "middle" } = {}) {
  const d = points.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");
  const [x1, y1] = points.at(-2), [x2, y2] = points.at(-1);
  const a = Math.atan2(y2 - y1, x2 - x1), s = 7;
  const p = (t) => [x2 - s * Math.cos(a + t), y2 - s * Math.sin(a + t)].map((v) => r(v)).join(",");
  const head = `<polygon class="head${cls ? ` ${cls}` : ""}" points="${x2},${y2} ${p(0.45)} ${p(-0.45)}"/>`;
  const text = label ? `<text class="edge" x="${lx}" y="${ly}" text-anchor="${anchor}">${esc(label)}</text>` : "";
  return `<path class="wire${cls ? ` ${cls}` : ""}" d="${d}"/>${head}${text}`;
}

const svg = (w, h, aria, inner, cls) => `<svg class="diagram ${cls}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(aria)}">${inner}</svg>`;

export function loopDiagram(aria, { compact = false } = {}) {
  if (compact) {
    // For the project list: the loop and nothing else.
    const n = [
      node(8, 64, 76, 44, "Question"),
      node(112, 64, 84, 44, "Retrieve"),
      node(224, 64, 84, 44, "Answer"),
      node(336, 64, 76, 44, "Review", null, "strong"),
    ].join("");
    const w = [
      wire([[84, 86], [110, 86]]),
      wire([[196, 86], [222, 86]]),
      wire([[308, 86], [334, 86]]),
      wire([[374, 108], [374, 150], [154, 150], [154, 110]], "refined query", { cls: "loop", lx: 264, ly: 168 }),
      wire([[374, 64], [374, 30], [300, 30]], "accepted", { lx: 330, ly: 22 }),
    ].join("");
    const done = `<text x="292" y="34" text-anchor="end" class="title">answer + citations</text>`;
    return svg(420, 182, aria, n + w + done, "compact");
  }
  const wide = svg(760, 300, aria, [
    node(16, 96, 108, 56, "Question"),
    node(176, 96, 128, 56, "Retrieve", "top 5 passages"),
    node(356, 96, 128, 56, "Answer", "cites [1] to [5]"),
    node(536, 96, 128, 56, "Review", "second model call", "strong"),
    node(560, 4, 184, 50, "Result", "answer and cited passages", "ends"),
    wire([[124, 124], [174, 124]]),
    wire([[304, 124], [354, 124]]),
    wire([[484, 124], [534, 124]]),
    wire([[600, 96], [600, 70], [652, 70], [652, 56]], "supported and complete", { lx: 594, ly: 82, anchor: "end" }),
    wire([[600, 152], [600, 200], [240, 200], [240, 154]], "refined query, up to three rounds", { cls: "loop", lx: 420, ly: 222 }),
    wire([[420, 96], [420, 30], [558, 30]], "single pass", { lx: 428, ly: 22, anchor: "start" }),
    `<text class="edge" x="16" y="262">Stops early at a 120 s deadline, at the spending cap,</text>`,
    `<text class="edge" x="16" y="280">or when a refined query finds no passage the last answer didn't have.</text>`,
  ].join(""), "diagram-wide");
  const tall = svg(360, 560, aria, [
    node(110, 8, 140, 48, "Question"),
    node(110, 96, 140, 56, "Retrieve", "top 5 passages"),
    node(110, 192, 140, 56, "Answer", "cites [1] to [5]"),
    node(110, 288, 140, 56, "Review", "second model call", "strong"),
    node(90, 400, 180, 54, "Result", "answer and cited passages", "ends"),
    wire([[180, 56], [180, 94]]),
    wire([[180, 152], [180, 190]]),
    wire([[180, 248], [180, 286]]),
    wire([[180, 344], [180, 398]], "supported and complete", { lx: 188, ly: 376, anchor: "start" }),
    wire([[250, 316], [320, 316], [320, 124], [252, 124]], "refined query", { cls: "loop", lx: 316, ly: 228, anchor: "end" }),
    wire([[110, 220], [40, 220], [40, 427], [88, 427]], "single pass", { lx: 46, ly: 268, anchor: "start" }),
    `<text class="edge" x="16" y="490">Up to three rounds. Stops early at a 120 s</text>`,
    `<text class="edge" x="16" y="508">deadline, at the spending cap, or when a</text>`,
    `<text class="edge" x="16" y="526">refined query finds nothing new.</text>`,
  ].join(""), "diagram-tall");
  return wide + tall;
}

export function replayDiagram(aria) {
  const swap = (x, y, w, h, title, sub) => `<g class="swap"><rect x="${x - 4}" y="${y - 4}" width="${w + 8}" height="${h + 8}" rx="13"/></g>` + node(x, y, w, h, title, sub);
  const lane = (y, title) => `<rect class="lane" x="0" y="${y}" width="760" height="150" rx="12"/><text class="lane-title" x="16" y="${y + 24}">${esc(title)}</text>`;
  const wide = svg(760, 316, aria, [
    lane(0, "Recording a run, with an API key"),
    node(16, 42, 120, 92, "Evaluation", ["QASPER", "questions"]),
    node(186, 42, 132, 40, "LLMClient"),
    node(186, 94, 132, 40, "Retriever"),
    node(372, 42, 172, 40, "OpenAI Responses API"),
    node(372, 94, 172, 40, "MiniLM, exact search"),
    node(596, 42, 148, 40, "calls.jsonl", null, "soft"),
    node(596, 94, 148, 40, "runs.jsonl", null, "soft"),
    wire([[136, 62], [184, 62]]), wire([[136, 114], [184, 114]]),
    wire([[318, 62], [370, 62]]), wire([[318, 114], [370, 114]]),
    wire([[544, 62], [594, 62]], "reply", { lx: 569, ly: 56 }),
    wire([[544, 114], [594, 114]], "scores", { lx: 569, ly: 108 }),
    lane(166, "Replay in CI, no key"),
    node(16, 208, 120, 92, "Evaluation", ["same", "questions"]),
    node(186, 208, 132, 40, "LLMClient"),
    node(186, 260, 132, 40, "Retriever"),
    swap(372, 208, 172, 40, "calls.jsonl", null),
    node(372, 260, 172, 40, "MiniLM, exact search"),
    node(596, 260, 148, 40, "runs.jsonl", "within 1e-4?", "soft"),
    wire([[136, 228], [184, 228]]), wire([[136, 280], [184, 280]]),
    wire([[318, 228], [366, 228]], "by hash", { lx: 342, ly: 222 }),
    wire([[318, 280], [370, 280]]),
    wire([[544, 280], [594, 280]], "compare", { lx: 569, ly: 274 }),
    `<text class="edge" x="560" y="224">same reply, or the</text><text class="edge" x="560" y="240">replay lists the difference</text>`,
  ].join(""), "diagram-wide");
  const tall = svg(360, 600, aria, [
    `<rect class="lane" x="0" y="0" width="360" height="282" rx="12"/><text class="lane-title" x="14" y="24">Recording, with an API key</text>`,
    node(14, 40, 332, 40, "Evaluation over QASPER questions"),
    node(14, 104, 160, 40, "LLMClient"), node(186, 104, 160, 40, "Retriever"),
    node(14, 166, 160, 40, "OpenAI API"), node(186, 166, 160, 40, "MiniLM search"),
    node(14, 228, 160, 40, "calls.jsonl", null, "soft"), node(186, 228, 160, 40, "runs.jsonl", null, "soft"),
    wire([[94, 80], [94, 102]]), wire([[266, 80], [266, 102]]),
    wire([[94, 144], [94, 164]]), wire([[266, 144], [266, 164]]),
    wire([[94, 206], [94, 226]]), wire([[266, 206], [266, 226]]),
    `<rect class="lane" x="0" y="300" width="360" height="296" rx="12"/><text class="lane-title" x="14" y="324">Replay in CI, no key</text>`,
    node(14, 340, 332, 40, "Evaluation, same questions"),
    node(14, 404, 160, 40, "LLMClient"), node(186, 404, 160, 40, "Retriever"),
    swap(14, 470, 160, 40, "calls.jsonl", null), node(186, 466, 160, 40, "MiniLM search"),
    node(186, 528, 160, 48, "runs.jsonl", "within 1e-4?", "soft"),
    wire([[94, 380], [94, 402]]), wire([[266, 380], [266, 402]]),
    wire([[94, 444], [94, 464]]), wire([[266, 444], [266, 464]]),
    wire([[266, 506], [266, 526]]),
    `<text class="edge" x="14" y="540">looked up by</text><text class="edge" x="14" y="556">request hash</text>`,
  ].join(""), "diagram-tall");
  return wide + tall;
}

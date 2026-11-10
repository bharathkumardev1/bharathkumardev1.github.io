// Helpers shared by the build's content modules.
import { readFileSync } from "node:fs";

export const root = new URL("../", import.meta.url);
export const read = (p) => readFileSync(new URL(p, root), "utf8");
export const json = (p) => JSON.parse(read(p));

export const f2 = (x) => x.toFixed(2);
export const f3 = (x) => x.toFixed(3);
export const ms = (x) => (x < 10 ? x.toFixed(1) : x.toFixed(0));
export const signed = (x, d = 2) => (x >= 0 ? "+" : "-") + Math.abs(x).toFixed(d);
export const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
export const int = (x) => Math.round(x).toLocaleString("en-US");
export const TIMES = { 2: "twice", 3: "three times", 4: "four times", 5: "five times", 6: "six times", 7: "seven times" };

// A sentence on the page that depends on a result. If a rerun changes the result, the build
// stops here instead of publishing a sentence that's no longer true.
export function claim(ok, what) {
  if (!ok) throw new Error(`claim no longer holds: ${what}`);
}

export const facts = (rows) => rows.map(([dt, dd]) => `<div><dt>${dt}</dt><dd>${dd}</dd></div>`).join("\n");
export const repo = (name) => `https://github.com/bharathkumardev1/${name}`;

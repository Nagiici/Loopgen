import type { GovernanceSummary } from "./types.js";

const pct = (value: number): string => `${Math.round(value * 100)}%`;

export function renderGovernanceMarkdown(summary: GovernanceSummary): string {
  const loopRows = Object.entries(summary.byLoop)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([loop, stat]) => `| \`${loop}\` | ${stat.total} | ${stat.passed} | ${pct(rate(stat))} |`)
    .join("\n");
  const actorRows = Object.entries(summary.byActor)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([actor, stat]) => `| ${actor} | ${stat.total} | ${stat.passed} | ${pct(rate(stat))} |`)
    .join("\n");
  const sourceRows = summary.sources
    .map((source) => `| ${source.label} | ${source.entries} | ${source.chainValid ? "valid" : "BROKEN"} |`)
    .join("\n");

  return `# loopgen governance report

- Runs: **${summary.total}** (${summary.passed} passed / ${summary.failed} failed) — pass rate **${pct(summary.passRate)}**
- Window: ${summary.firstAt ?? "—"} → ${summary.lastAt ?? "—"}
- Modes: referee ${summary.byMode.referee} · driven ${summary.byMode.driven}
- Trust: local evidence ${summary.byTier.local} · **CI-attested** ${summary.byTier.attested}
- Chain integrity: ${summary.chain.valid ? "**valid**" : `**BROKEN** (entry ${summary.chain.brokenAt})`}
- Forbidden-path violations: **${summary.forbiddenViolationRuns}** run(s)
- Blocked attempts (driven, prevented at apply time): **${summary.blockedAttempts}**

## By loop

| loop | runs | passed | pass rate |
|---|---|---|---|
${loopRows || "| — | 0 | 0 | 0% |"}

## By actor

| actor | runs | passed | pass rate |
|---|---|---|---|
${actorRows || "| — | 0 | 0 | 0% |"}

## Sources

| source | entries | chain |
|---|---|---|
${sourceRows || "| — | 0 | — |"}
`;
}

export function renderGovernanceHtml(summary: GovernanceSummary): string {
  const loopRows = Object.entries(summary.byLoop)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([loop, stat]) => row(loop, stat.total, stat.passed))
    .join("");
  const actorRows = Object.entries(summary.byActor)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([actor, stat]) => row(actor, stat.total, stat.passed))
    .join("");
  const sourceRows = summary.sources
    .map((source) => `<tr><td>${esc(source.label)}</td><td>${source.entries}</td><td>${source.chainValid ? "valid" : '<b class="bad">BROKEN</b>'}</td></tr>`)
    .join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>loopgen governance</title>
<style>
:root{--paper:#f4efe4;--ink:#1a1714;--muted:#7a7064;--line:#d8cfbd;--rule:#b9ad96;--ok:#4a6b3f;--bad:#c2362b;--surface:#fbf7ee}
@media(prefers-color-scheme:dark){:root{--paper:#17150f;--ink:#ece4d4;--muted:#948b78;--line:#322d22;--rule:#4a4334;--ok:#8fb079;--bad:#e0524a;--surface:#221e16}}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.5 ui-sans-serif,system-ui,sans-serif}
.wrap{max-width:920px;margin:0 auto;padding:40px 24px}
h1{font:500 30px/1.1 Georgia,"Times New Roman",serif;margin:0}
.sub{color:var(--muted);font-size:12px;letter-spacing:.16em;text-transform:uppercase;margin-top:6px}
hr{border:0;border-top:2px solid var(--ink);margin:16px 0 28px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:0;border:1px solid var(--line);margin-bottom:28px}
.card{padding:16px 18px;border-right:1px solid var(--line)}
.card:last-child{border-right:0}
.card .k{color:var(--muted);font-size:11px;letter-spacing:.1em;text-transform:uppercase}
.card .v{font:500 26px/1.1 Georgia,serif;margin-top:6px}
.bar{height:6px;background:var(--line);margin-top:10px}
.bar>span{display:block;height:6px;background:var(--ok)}
h2{font:500 18px/1.1 Georgia,serif;margin:28px 0 10px;padding-bottom:8px;border-bottom:1px solid var(--line)}
table{width:100%;border-collapse:collapse;font-size:14px}
th{text-align:left;color:var(--muted);font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:500;padding:8px 6px;border-bottom:1px solid var(--rule)}
td{padding:9px 6px;border-bottom:1px solid var(--line)}
code{font-family:"IBM Plex Mono",monospace;font-size:13px}
.good{color:var(--ok)}.bad{color:var(--bad)}
.note{color:var(--muted);font-size:12px;margin-top:28px;border-top:1px solid var(--line);padding-top:14px}
</style></head>
<body><div class="wrap">
<h1>loopgen governance</h1>
<div class="sub">audit rollup · ${esc(summary.firstAt ?? "—")} → ${esc(summary.lastAt ?? "—")}</div>
<hr>
<div class="cards">
  <div class="card"><div class="k">Runs</div><div class="v">${summary.total}</div></div>
  <div class="card"><div class="k">Pass rate</div><div class="v">${pct(summary.passRate)}</div><div class="bar"><span style="width:${pct(summary.passRate)}"></span></div></div>
  <div class="card"><div class="k">Forbidden violations</div><div class="v ${summary.forbiddenViolationRuns ? "bad" : "good"}">${summary.forbiddenViolationRuns}</div></div>
  <div class="card"><div class="k">Blocked (prevented)</div><div class="v">${summary.blockedAttempts}</div></div>
  <div class="card"><div class="k">Chain</div><div class="v ${summary.chain.valid ? "good" : "bad"}">${summary.chain.valid ? "valid" : "BROKEN"}</div></div>
  <div class="card"><div class="k">CI-attested</div><div class="v">${summary.byTier.attested}/${summary.total}</div></div>
</div>
<h2>By loop</h2>
<table><thead><tr><th>Loop</th><th>Runs</th><th>Passed</th><th>Pass rate</th></tr></thead><tbody>${loopRows || '<tr><td colspan="4">No runs.</td></tr>'}</tbody></table>
<h2>By actor</h2>
<table><thead><tr><th>Actor</th><th>Runs</th><th>Passed</th><th>Pass rate</th></tr></thead><tbody>${actorRows || '<tr><td colspan="4">No runs.</td></tr>'}</tbody></table>
<h2>Sources</h2>
<table><thead><tr><th>Source</th><th>Entries</th><th>Chain</th></tr></thead><tbody>${sourceRows || '<tr><td colspan="3">No sources.</td></tr>'}</tbody></table>
<div class="note">Generated by loopgen from hash-chained <code>.loopgen/audit.jsonl</code> ledgers. Local-first — open this file directly; no server. A broken chain means a ledger was edited in place.</div>
</div></body></html>
`;
}

function row(label: string, total: number, passed: number): string {
  const r = rate({ total, passed });
  return `<tr><td><code>${esc(label)}</code></td><td>${total}</td><td>${passed}</td><td><span class="${r === 1 ? "good" : r < 0.5 ? "bad" : ""}">${pct(r)}</span></td></tr>`;
}

function rate(stat: { total: number; passed: number }): number {
  return stat.total ? stat.passed / stat.total : 0;
}

function esc(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char);
}

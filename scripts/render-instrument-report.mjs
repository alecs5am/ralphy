import { mkdir, writeFile } from "node:fs/promises";
import { dirname, relative } from "node:path";

import { EVIDENCE_MANIFEST, EVIDENCE_REPORT, readEvidenceBundle } from "./instrument-evidence.mjs";

const escapeHtml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const relativeUrl = (path) => relative(dirname(EVIDENCE_REPORT), path).split("/").map(encodeURIComponent).join("/");

export async function renderInstrumentReport(manifestPath = EVIDENCE_MANIFEST, reportPath = EVIDENCE_REPORT) {
  const value = await readEvidenceBundle(manifestPath);
  const captures = value.captures.map((capture) => `<figure><img src="${relativeUrl(capture.path)}" alt="${escapeHtml(capture.label)}"><figcaption>${escapeHtml(capture.label)} · ${escapeHtml(capture.theme)} · ${escapeHtml(capture.viewport)}</figcaption></figure>`).join("");
  const launches = value.launches.map((launch) => `<tr><td>${escapeHtml(launch.id)}</td><td>${escapeHtml(launch.mode)}</td><td>${escapeHtml(launch.dbRecord)}</td><td>${launch.shmChanged ? "observed" : "stable"}</td></tr>`).join("");
  const reviewers = Object.entries(value.reviewers).map(([role, decision]) => `<li><b>${escapeHtml(role)}</b> ${escapeHtml(decision ?? "pending")}</li>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Ralphy Instrument evidence</title><style>body{margin:0;padding:32px;background:#050505;color:#f2f2f0;font:13px system-ui}header,section{max-width:1400px;margin:0 auto 24px}h1{font-size:28px}small,figcaption{color:#a4a4a0}code{color:#fff}table{width:100%;border-collapse:collapse}td,th{padding:8px;text-align:left;border-bottom:1px solid #333}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}figure{margin:0;padding:8px;border-radius:18px;background:#141414}img{display:block;width:100%;border-radius:12px}figcaption{padding:8px 4px 2px}</style></head><body><header><small>RALPHY / NOTHING INSTRUMENT / EVIDENCE</small><h1>Final integration run</h1><p>Phase <code>${escapeHtml(value.phase)}</code> · revision ${value.revision} · ${value.scenarioInventory.scenarios} registered scenarios / ${value.scenarioInventory.expandedCases} expanded cases.</p><p>Core ${escapeHtml(value.core.version)} · <code>${escapeHtml(value.core.sha256)}</code></p></header><section><h2>Contact sheet</h2><div class="grid">${captures}</div></section><section><h2>Launch ledger</h2><table><thead><tr><th>Launch</th><th>Package</th><th>DB evidence</th><th>SHM</th></tr></thead><tbody>${launches}</tbody></table></section><section><h2>Review decisions</h2><ul>${reviewers}</ul></section></body></html>`;
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, html);
  return reportPath;
}

if (import.meta.main) console.log(await renderInstrumentReport());

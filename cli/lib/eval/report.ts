// Render the evaluation report as JSON + Markdown.
//
// JSON is the machine contract for downstream fixer agents.
// Markdown is the same data flattened for human review — same field
// values, just walked into headings and tables.

import fs from "node:fs/promises";
import path from "node:path";
import type { EvalReport } from "./types.js";

export async function writeReport(report: EvalReport, outDir: string): Promise<{ jsonPath: string; mdPath: string }> {
  await fs.mkdir(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "eval.json");
  const mdPath = path.join(outDir, "eval-report.md");
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
  await fs.writeFile(mdPath, renderMarkdown(report));
  return { jsonPath, mdPath };
}

function renderMarkdown(r: EvalReport): string {
  const v = r.scoring.verdict.toUpperCase();
  const lines: string[] = [];

  lines.push(`# Video evaluation — ${r.meta.projectId ?? path.basename(r.meta.video)}`);
  lines.push("");
  lines.push(`**Verdict: ${v} · score ${r.scoring.score}/100** — ${r.findings.length} findings (${r.scoring.penalties.fail} fail, ${r.scoring.penalties.warn / 6 | 0} warn, ${r.scoring.penalties.info} info)`);
  lines.push("");
  lines.push(`Video: \`${r.meta.video}\``);
  lines.push(`Evaluated: ${r.meta.evaluatedAt}`);
  lines.push("");

  lines.push(`## Format`);
  lines.push(`- Duration: **${r.meta.durationSec.toFixed(2)}s**${r.declared?.durationSec ? ` (declared ${r.declared.durationSec}s)` : ""}`);
  lines.push(`- Resolution: ${r.meta.resolution.w}x${r.meta.resolution.h} @ ${r.meta.fps} fps`);
  lines.push(`- Codec: ${r.meta.codec.video} / ${r.meta.codec.audio} · ${r.meta.bitrateKbps} kbps`);
  if (r.meta.template) lines.push(`- Template: \`${r.meta.template}\``);
  lines.push("");

  lines.push(`## Findings`);
  if (r.findings.length === 0) {
    lines.push(`_No findings._`);
  } else {
    lines.push("");
    lines.push(`| ID | Severity | Category | Where | Message |`);
    lines.push(`|----|----------|----------|-------|---------|`);
    for (const f of r.findings) {
      const where = f.timestampSec !== null ? `${f.timestampSec.toFixed(2)}s${f.sceneIndex !== null ? ` (scene ${f.sceneIndex})` : ""}` : f.sceneIndex !== null ? `scene ${f.sceneIndex}` : "—";
      lines.push(`| ${f.id} | ${f.severity} | ${f.category} | ${where} | ${escapeCell(f.message)} |`);
    }
    lines.push("");
    lines.push(`### Fix hints`);
    for (const f of r.findings) {
      lines.push(`- **${f.id}** (${f.severity}, \`${f.category}\`): ${f.fixHint}${f.fixCommand ? `\n  - Command: \`${f.fixCommand}\`` : ""}`);
    }
  }
  lines.push("");

  lines.push(`## Structure`);
  lines.push(`- ${r.structure.sceneCount} scenes, avg ${r.structure.avgSceneDurationSec.toFixed(2)}s (min ${r.structure.minSceneDurationSec.toFixed(2)}s / max ${r.structure.maxSceneDurationSec.toFixed(2)}s)`);
  lines.push(`- Hook zone (0-${r.structure.hookZone.durationSec}s): ${r.structure.hookZone.sceneCount} scene(s), ${r.structure.hookZone.wordCount} words`);
  if (r.structure.hookZone.transcript) {
    lines.push(`  > "${r.structure.hookZone.transcript.trim()}"`);
  }
  lines.push("");
  lines.push(`| # | Start | End | Duration |`);
  lines.push(`|---|-------|-----|----------|`);
  for (const sc of r.structure.scenes) {
    lines.push(`| ${sc.index} | ${sc.startSec.toFixed(2)}s | ${sc.endSec.toFixed(2)}s | ${sc.durationSec.toFixed(2)}s |`);
  }
  lines.push("");

  lines.push(`## Audio`);
  lines.push(`- Integrated loudness: ${fmt(r.audio.integratedLufs)} LUFS (target -16)`);
  lines.push(`- True peak: ${fmt(r.audio.truePeakDb)} dBFS (ceiling -1.5)`);
  lines.push(`- Loudness range: ${fmt(r.audio.loudnessRangeLu)} LU (target ≤11)`);
  lines.push(`- Voice presence: ${(r.audio.voicePresentPct * 100).toFixed(1)}%`);
  if (r.audio.deadAirSegments.length > 0) {
    lines.push(`- Dead-air segments:`);
    for (const seg of r.audio.deadAirSegments) {
      lines.push(`  - ${seg.startSec.toFixed(2)}s → ${seg.endSec.toFixed(2)}s (${seg.durationSec.toFixed(2)}s)`);
    }
  }
  lines.push("");

  lines.push(`## Captions`);
  if (r.captions.available) {
    lines.push(`- ${r.captions.wordCount} words, ${(r.captions.wordsPerSecond ?? 0).toFixed(2)} words/sec${r.captions.densityWarn ? " ⚠️ outside 1.5-4.5 readable band" : ""}`);
  } else {
    lines.push(`_captions.json not available._`);
  }
  lines.push("");

  lines.push(`## Vision`);
  for (const sv of r.vision.sceneFindings) {
    lines.push(`### Scene ${sv.sceneIndex} (${sv.timestampSec.toFixed(2)}s)`);
    if (sv.summary) lines.push(`> ${sv.summary}`);
    if (sv.issues.length === 0) {
      lines.push(`_No issues._`);
    } else {
      for (const iss of sv.issues) {
        lines.push(`- **${iss.severity}** \`${iss.category}\` — ${iss.message}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

function fmt(n: number | null): string {
  return n === null ? "n/a" : n.toFixed(2);
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

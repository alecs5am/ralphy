// Storyboard review (#570) — the self-contained HTML gallery (fallback).
//
// The desktop app is the primary review surface; this page is the fallback for
// a reviewer without it. It is ONE file: frames are inlined as data URIs and
// the styles are inline, so it opens anywhere and can be mailed as-is. It
// renders the same `StoryboardView` the CLI and the bridge return, read-only:
// decisions are recorded with the `ralphy storyboard approve|reject|comment`
// lines it prints per scene.
//
// Append-only (AGENTS.md #14): every render allocates a NEW file —
// `storyboard/storyboard.html`, then `storyboard.v2.html`, `storyboard.v3.html`
// … — with an exclusive create, so a gallery the user already opened or sent
// is never overwritten (the same allocation rule as the #557 digest bundles).

import fs from "node:fs";
import path from "node:path";
import { nextVersionedPath } from "../ref-digest.js";
import type { StoryboardScene, StoryboardView } from "./model.js";

/** Frames larger than this are linked by path instead of inlined. */
export const MAX_INLINE_FRAME_BYTES = 8 * 1024 * 1024;

const STATE_LABEL: Record<StoryboardScene["state"], string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  stale: "Changed since approval",
};

export function renderStoryboardHtml(view: StoryboardView, options: { generatedAt?: string } = {}): string {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const ref = view.project.slug;
  const cards = view.scenes.map((scene) => sceneCard(scene, ref)).join("\n");
  const t = view.totals;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Storyboard ${escapeHtml(ref)}</title>
<style>
:root{--bg:#f6f5f2;--card:#fff;--ink:#1d1d1b;--muted:#6b6a66;--line:#e2e0da;--ok:#1f7a45;--bad:#b3261e;--warn:#9a6700;--pending:#55534e}
@media (prefers-color-scheme: dark){:root{--bg:#141413;--card:#1f1f1d;--ink:#f1efe9;--muted:#a5a39c;--line:#33322f;--ok:#5cc489;--bad:#f2867f;--warn:#e3b341;--pending:#bdbab2}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
header{padding:24px 16px 8px;max-width:1200px;margin:0 auto}h1{margin:0 0 4px;font-size:22px}
.meta{color:var(--muted);font-size:13px}.totals{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 0}
.pill{border:1px solid var(--line);border-radius:999px;padding:2px 10px;font-size:13px}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;padding:16px;max-width:1200px;margin:0 auto}
article{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;display:flex;flex-direction:column}
.frame{aspect-ratio:9/16;max-height:420px;background:var(--line);display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:13px}
.frame img{width:100%;height:100%;object-fit:contain;display:block}
.body{padding:12px 14px 14px;display:flex;flex-direction:column;gap:8px}
.head{display:flex;justify-content:space-between;align-items:center;gap:8px}.id{font-weight:600}
.state{font-size:12px;font-weight:600;border-radius:999px;padding:1px 8px;border:1px solid currentColor}
.state.approved{color:var(--ok)}.state.rejected{color:var(--bad)}.state.stale{color:var(--warn)}.state.pending{color:var(--pending)}
.vo{margin:0;font-style:italic}.facts{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font-size:13px;margin:0}
.facts dt{color:var(--muted)}.facts dd{margin:0;overflow-wrap:anywhere}
.comments{margin:0;padding-left:16px;font-size:13px;color:var(--muted)}
code{display:block;font:12px/1.4 ui-monospace,Menlo,monospace;background:var(--bg);border-radius:6px;padding:6px 8px;overflow-x:auto;white-space:pre}
footer{max-width:1200px;margin:0 auto;padding:0 16px 32px;color:var(--muted);font-size:13px}
</style>
</head>
<body>
<header>
<h1>Storyboard: ${escapeHtml(ref)}</h1>
<div class="meta">${escapeHtml(view.aiProductionReason)} &middot; generated ${escapeHtml(generatedAt)}${view.contentMode ? ` &middot; mode ${escapeHtml(view.contentMode)}` : ""}</div>
<div class="totals">
<span class="pill">${t.scenes} scene(s)</span><span class="pill">${t.approved} approved</span><span class="pill">${t.pending} pending</span><span class="pill">${t.rejected} rejected</span><span class="pill">${t.stale} changed</span><span class="pill">${t.durationSec}s total</span><span class="pill">est. $${t.estimatedCostUsd.toFixed(2)}</span>
</div>
</header>
<main>
${cards || `<p>No scenario scenes yet. Write scenario.json first.</p>`}
</main>
<footer>Approve every scene at once: <code>ralphy storyboard approve ${escapeHtml(ref)} --all</code>This page is read-only; decisions are recorded by the CLI or the Ralphy desktop app.</footer>
</body>
</html>
`;
}

function sceneCard(scene: StoryboardScene, ref: string): string {
  const comments = scene.comments.length
    ? `<ul class="comments">${scene.comments.map((comment) => `<li>${escapeHtml(comment.text)}</li>`).join("")}</ul>`
    : "";
  const models = [scene.models.image && `image ${scene.models.image}`, scene.models.video && `video ${scene.models.video}`]
    .filter(Boolean)
    .join(", ");
  return `<article id="${escapeHtml(scene.id)}">
<div class="frame">${frameMarkup(scene)}</div>
<div class="body">
<div class="head"><span class="id">${escapeHtml(scene.id)}${scene.role ? ` &middot; ${escapeHtml(scene.role)}` : ""}</span><span class="state ${scene.state}">${STATE_LABEL[scene.state]}</span></div>
<p class="vo">${scene.vo ? `&ldquo;${escapeHtml(scene.vo)}&rdquo;` : "No VO line"}</p>
<dl class="facts"><dt>Duration</dt><dd>${scene.durationSec}s</dd><dt>Camera</dt><dd>${escapeHtml(scene.camera || "none")}</dd><dt>Models</dt><dd>${escapeHtml(models || "none")}</dd><dt>Est. cost</dt><dd>$${scene.estimatedCostUsd.toFixed(2)}</dd></dl>
${comments}
<code>ralphy storyboard approve ${escapeHtml(ref)} --scene ${escapeHtml(scene.id)}
ralphy storyboard reject ${escapeHtml(ref)} --scene ${escapeHtml(scene.id)} --comment "..."</code>
</div>
</article>`;
}

function frameMarkup(scene: StoryboardScene): string {
  const frame = scene.frame;
  if (!frame?.path) return "No frame yet";
  try {
    const stat = fs.statSync(frame.path);
    if (stat.size > MAX_INLINE_FRAME_BYTES) return `Frame too large to inline: ${escapeHtml(frame.path)}`;
    const mime = frame.mime ?? "image/png";
    const data = fs.readFileSync(frame.path).toString("base64");
    return `<img alt="${escapeHtml(`${scene.id} frame`)}" src="data:${escapeHtml(mime)};base64,${data}">`;
  } catch {
    return "Frame unavailable";
  }
}

/** Allocate the next gallery file and write it. Never overwrites. */
export function writeStoryboardHtml(projectTreeDir: string, html: string): { path: string; version: number } {
  const dir = path.join(projectTreeDir, "storyboard");
  fs.mkdirSync(dir, { recursive: true });
  const base = path.join(dir, "storyboard");
  for (let attempt = 0; attempt < 10_000; attempt++) {
    // #557's allocator names the version (`storyboard`, `storyboard.v2`, …);
    // the exclusive create makes a concurrent writer move to the next one.
    const stem = nextVersionedPath(base, (candidate) => fs.existsSync(`${candidate}.html`));
    const file = `${stem}.html`;
    try {
      fs.writeFileSync(file, html, { flag: "wx" });
      const version = stem === base ? 1 : Number(stem.slice(base.length + 2));
      return { path: file, version };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  throw new Error(`could not allocate a storyboard gallery file in ${dir}`);
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

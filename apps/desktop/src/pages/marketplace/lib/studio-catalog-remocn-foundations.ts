import type { StudioEntry } from "./studio-catalog";
import foundations from "./generated/remocn-foundations.generated.json";
import { remocnVisualDefinition } from "./studio-remocn-preview";

const escapeHtml = (value: string) => value.replace(/[&<>\"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]!);
const hue = (value: string) => [...value].reduce((total, character) => (total * 31 + character.charCodeAt(0)) % 360, 0);

function sourceSettings(entry: (typeof foundations)[number]) {
  const settings = Object.fromEntries(entry.files.flatMap((file) => [...file.content.matchAll(/\b([a-zA-Z][\w]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\d+(?:\.\d+)?)|(true|false))/g)].map((match) => [match[1], match[2] ?? match[3] ?? match[4] ?? match[5]])).slice(0, 12));
  return Object.keys(settings).length ? settings : { variant: entry.name };
}

function stage(entry: (typeof foundations)[number]) {
  if (entry.group === "typography") return `<div class="remocn-type" aria-label="${escapeHtml(entry.title)}">${entry.title.split(/\s+/).map((word) => `<span class="remocn-letter">${escapeHtml(word)}</span>`).join(" ")}</div>`;
  if (entry.group === "layout") return `<div class="remocn-layout"><i></i><i></i><i></i><i></i></div>`;
  if (entry.group === "ui") return `<div class="remocn-ui"><button>${escapeHtml(entry.title)}</button><span></span><span></span><span></span></div>`;
  return `<div class="remocn-block"><i></i><i></i><i></i><i></i><i></i></div>`;
}

function artifact(entry: (typeof foundations)[number]) {
  const settings = sourceSettings(entry);
  const source = JSON.stringify({
    component: entry.name,
    settings,
    dependencies: entry.dependencies,
    registryDependencies: entry.registryDependencies,
    files: entry.files,
  }).replaceAll("<", "\\u003c");
  const referenceUrl = `https://github.com/Remocn/remocn/blob/${entry.commit}/${entry.referencePath}`;
  const accent = hue(entry.id);

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(entry.title)} · Remocn reference</title><style>
:root{--accent:hsl(${accent} 78% 62%);--ink:#f7f7fb;--surface:#10121b}.remocn-reference{box-sizing:border-box;min-height:100vh;display:grid;place-items:center;overflow:hidden;background:radial-gradient(circle at 76% 12%,color-mix(in srgb,var(--accent) 30%,transparent),transparent 38%),var(--surface);color:var(--ink);font:500 16px/1.45 system-ui,sans-serif}.remocn-card{width:min(860px,88vw);padding:clamp(28px,5vw,64px);border:1px solid color-mix(in srgb,var(--ink) 20%,transparent);border-radius:28px;background:color-mix(in srgb,var(--surface) 74%,var(--accent));box-shadow:0 28px 90px #0008}.remocn-group{margin:0;color:var(--accent);font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}.remocn-title{margin:12px 0;font-size:clamp(36px,8vw,88px);line-height:.92;letter-spacing:-.06em}.remocn-summary{max-width:58ch;margin:0;opacity:.82}.remocn-stage{min-height:170px;display:grid;place-items:center;margin:34px 0;border-radius:16px;background:#0003;overflow:hidden}.remocn-type{font-size:clamp(28px,5vw,58px);font-weight:800;letter-spacing:-.06em}.remocn-letter{display:inline-block}.remocn-layout{width:78%;display:grid;grid-template-columns:1.3fr .7fr;gap:10px}.remocn-layout i{height:52px;border-radius:9px;background:var(--accent)}.remocn-layout i:first-child{grid-row:span 2;height:114px}.remocn-ui{width:min(440px,78%);padding:20px;border-radius:12px;background:#ffffff10}.remocn-ui button{padding:12px 18px;border:0;border-radius:8px;background:var(--accent);font:inherit;font-weight:700}.remocn-ui span,.remocn-block i{display:block;height:12px;margin-top:12px;border-radius:99px;background:#fff3}.remocn-block{width:72%;padding:24px;border-radius:12px;background:#05060acc}.remocn-block i:nth-child(2){width:72%}.remocn-block i:nth-child(3){width:88%}.remocn-block i:nth-child(4){width:54%;background:var(--accent)}.remocn-mark{width:100%;height:8px;margin:18px 0;border-radius:999px;background:var(--accent);transform-origin:left;filter:drop-shadow(0 0 22px var(--accent))}.remocn-meta{display:flex;justify-content:space-between;gap:16px;font:12px/1.3 ui-monospace,monospace;opacity:.7}@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}</style></head>
<body><main class="remocn-reference" data-remocn-component="${escapeHtml(entry.name)}" data-remocn-group="${entry.group}" data-remocn-commit="${entry.commit}" data-license-notice="generated/remocn-foundations.MIT.txt"><section class="remocn-card"><p class="remocn-group">Remocn · ${escapeHtml(entry.group)}</p><h1 class="remocn-title">${escapeHtml(entry.title)}</h1><p class="remocn-summary">${escapeHtml(entry.summary)}</p><div class="remocn-stage">${stage(entry)}</div><div class="remocn-mark"></div><footer class="remocn-meta"><span>${escapeHtml(entry.name)}</span><a href="${referenceUrl}" style="color:inherit">MIT source @ ${entry.commit.slice(0, 7)}</a></footer></section></main>
<template id="remocn-license">${escapeHtml(entry.licenseNotice)}</template><template id="remocn-source">${source}</template><script>
const host=document.querySelector(".remocn-reference");const source=JSON.parse(document.querySelector("#remocn-source").textContent);window.__REMOCN_SETTINGS__=Object.freeze({component:host.dataset.remocnComponent,group:host.dataset.remocnGroup,commit:host.dataset.remocnCommit,settings:source.settings,dependencies:source.dependencies,registryDependencies:source.registryDependencies,sourceFiles:source.files});if(window.gsap){const tl=window.gsap.timeline().from(".remocn-card",{opacity:0,y:36,duration:.55,ease:"power3.out"});const variants={typography:()=>tl.from(".remocn-letter",{opacity:0,y:28,filter:"blur(10px)",stagger:.07,duration:.42,ease:"power3.out"},"-=.2"),layout:()=>tl.from(".remocn-layout i",{opacity:0,scale:.7,stagger:.09,duration:.4,ease:"back.out(1.5)"},"-=.2"),ui:()=>tl.from(".remocn-ui",{opacity:0,scale:.94,duration:.38,ease:"power2.out"},"-=.2").from(".remocn-ui span",{scaleX:0,stagger:.08,duration:.28},"-=.12"),"ui-blocks":()=>tl.from(".remocn-block i",{opacity:0,x:-36,stagger:.07,duration:.3,ease:"power2.out"},"-=.18")};variants[host.dataset.remocnGroup]();tl.from(".remocn-mark",{scaleX:0,duration:.48,ease:"power2.out"},"-=.12");}
</script></body></html>`;
}

/** MIT-licensed Remocn source kept as reference input, never a Remotion dependency. */
export function studioRemocnFoundations(): StudioEntry[] {
  return foundations.map((entry) => ({
    id: entry.id,
    name: entry.title,
    summary: entry.summary,
    tags: ["remocn", entry.group],
    format: "Motion reference",
    duration: "Source reference",
    settings: { ...sourceSettings(entry), title: entry.title, speed: 1, format: "portrait" },
    remocnVisual: remocnVisualDefinition(entry),
    mediaCredit: "Remocn · MIT",
    reference: {
      title: `Remocn ${entry.group}: ${entry.title}`,
      url: `https://github.com/Remocn/remocn/blob/${entry.commit}/${entry.referencePath}`,
    },
    artifact: artifact(entry),
    body: `Use the attached runnable HyperFrames HTML/CSS/GSAP adapter for this Remocn ${entry.group} reference; do not run its Remotion source. Its copied source files and settings are retained in the #remocn-source template, and the full upstream MIT notice is in #remocn-license and generated/remocn-foundations.MIT.txt. Preserve the source behavior: ${entry.summary} Keep the result deterministic, use local assets only, and render a short preview before export.`,
    preview: { kind: "image", url: `${import.meta.env.BASE_URL}explore/remocn/foundations/${entry.previewPath}` },
  }));
}

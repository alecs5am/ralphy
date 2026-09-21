import remocnData from "./generated/remocn-motion-data.json";
import type { StudioEntry } from "./studio-catalog";
import { remocnVisualDefinition } from "./studio-remocn-preview";

type RemocnEntry = {
  id: string;
  slug: string;
  group: string;
  title: string;
  summary: string;
  sourcePath: string;
  dependencies: string[];
  source: string;
};

const repository = "https://github.com/Remocn/remocn";
const upstreamCommit = "3903a46b3438da48c8c63083f0d1222ab814dde2";
const formatLabels: Record<string, string> = { ai: "AI", craft: "craft", social: "social", compositions: "composition" };

const adapters: Record<string, { css: string; markup: string; timeline: string }> = {
  transitions: { css: ".pane { position:absolute; inset:0; background:linear-gradient(110deg,transparent 45%,hsl(var(--h) 90% 70%) 46% 54%,transparent 55%); }", markup: '<i class="pane"></i>', timeline: 'timeline.fromTo(".pane", { xPercent: -110 }, { xPercent: 110, duration: d, ease: "power4.inOut" });' },
  effects: { css: ".orb { width:38%; aspect-ratio:1; border-radius:50%; background:hsl(var(--h) 90% 70%); filter:blur(10px); }", markup: '<i class="orb"></i>', timeline: 'timeline.fromTo(".orb", { scale: .1, opacity: 0 }, { scale: 2.5, opacity: 1, duration: d, ease: "back.out(1.7)" });' },
  shaders: { css: ".field { position:absolute; inset:-20%; background:conic-gradient(from 90deg,hsl(var(--h) 90% 70%),#111,hsl(calc(var(--h) + 100) 80% 65%),#111); filter:blur(28px); }", markup: '<i class="field"></i>', timeline: 'timeline.to(".field", { rotate: 360, duration: d * 4, repeat: -1, ease: "none" });' },
  filters: { css: ".lens { width:72%; aspect-ratio:16/9; border:10px solid hsl(var(--h) 75% 75% / .7); border-radius:50%; filter:contrast(1.5) saturate(1.6); }", markup: '<i class="lens"></i>', timeline: 'timeline.fromTo(".lens", { scale: .4, filter: "blur(24px) contrast(2)" }, { scale: 1, filter: "blur(0px) contrast(1.5)", duration: d });' },
  social: { css: ".profile { width:66%; padding:7%; border-radius:28px; background:#fff; color:#121212; box-shadow:0 30px 80px #0008; } .avatar { float:left; width:54px; height:54px; margin:0 14px 8px 0; border-radius:50%; background:hsl(var(--h) 80% 55%); }", markup: '<section class="profile"><i class="avatar"></i><b>Follow</b><br><small>Live social proof</small></section>', timeline: 'timeline.fromTo(".profile", { yPercent: 120, rotate: 8 }, { yPercent: 0, rotate: 0, duration: d, ease: "elastic.out(1,.6)" });' },
  compositions: { css: ".stage { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; width:74%; } .stage i { aspect-ratio:1; background:hsl(var(--h) 78% 65% / .75); }", markup: '<section class="stage"><i></i><i></i><i></i><i></i><i></i><i></i></section>', timeline: 'timeline.fromTo(".stage i", { opacity: 0, scale: .3 }, { opacity: 1, scale: 1, stagger: d / 8, duration: d });' },
  ai: { css: ".terminal { width:74%; padding:5%; border-radius:18px; background:#111; border:1px solid #fff4; font-family:ui-monospace,monospace; } .cursor { display:inline-block; width:.6em; height:1em; background:hsl(var(--h) 90% 70%); vertical-align:middle; }", markup: '<section class="terminal">&gt; generate motion<span class="cursor"></span></section>', timeline: 'timeline.fromTo(".terminal", { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: d }).to(".cursor", { opacity: 0, repeat: -1, yoyo: true, duration: .45 });' },
  craft: { css: ".paper { width:58%; padding:11%; color:#28231d; background:#f3ead9; box-shadow:12px 16px 0 #0004; transform:rotate(-4deg); }", markup: '<section class="paper">Made by hand</section>', timeline: 'timeline.fromTo(".paper", { yPercent: -130, rotate: -18 }, { yPercent: 0, rotate: -4, duration: d, ease: "bounce.out" });' },
  templates: { css: ".frames { display:flex; width:76%; gap:12px; } .frames i { flex:1; aspect-ratio:9/16; background:linear-gradient(145deg,hsl(var(--h) 78% 65%),#111); }", markup: '<section class="frames"><i></i><i></i><i></i></section>', timeline: 'timeline.fromTo(".frames i", { yPercent: 90, opacity: 0 }, { yPercent: 0, opacity: 1, stagger: d / 5, duration: d });' },
};

function artifact(entry: RemocnEntry, reference: string) {
  const hue = [...entry.slug].reduce((total, character) => total + character.charCodeAt(0), 0) % 360;
  const duration = 0.8 + (entry.slug.length % 5) * 0.18;
  const adapter = adapters[entry.group];
  const title = entry.title.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const summary = entry.summary.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
:root { --h: ${hue}; --remocn-duration: ${duration}s; }
* { box-sizing: border-box; } body { margin: 0; min-height: 100vh; display: grid; place-items: center; overflow: hidden; color: white; background: hsl(var(--h) 38% 10%); font-family: Inter, system-ui, sans-serif; }
[data-remocn-motion] { position:relative; display:grid; place-items:center; width:min(88vw,1100px); aspect-ratio:16/9; overflow:hidden; background:radial-gradient(circle at 25% 20%,hsl(var(--h) 85% 62%/.75),transparent 38%),hsl(var(--h) 46% 16%); } .remocn-title { position:absolute; z-index:2; max-width:80%; margin:0; text-align:center; font-size:clamp(2rem,8vw,7rem); line-height:.9; letter-spacing:-.06em; text-wrap:balance; } .remocn-summary { position:absolute; z-index:2; inset:auto 5% 5%; margin:0; font-size:.75rem; letter-spacing:.08em; text-align:center; } ${adapter.css}
</style></head><body data-remocn-id="${entry.id}"><main data-remocn-motion data-remocn-adapter="${entry.group}" data-editable-copy="${title}" data-source-settings="${entry.dependencies.join(",")}">${adapter.markup}<h1 class="remocn-title">${title}</h1><p class="remocn-summary">${summary}</p></main><script>
const d = ${duration}; if (window.gsap) { const timeline = window.gsap.timeline({ defaults: { ease: "power3.out" } }); ${adapter.timeline} } else { document.querySelector("[data-remocn-motion] > :first-child")?.animate([{ opacity: 0, transform: "translateY(32px) scale(.88)" }, { opacity: 1, transform: "none" }], { duration: d * 1000, easing: "cubic-bezier(.2,.8,.2,1)", fill: "both" }); }
</script><!-- Remocn · MIT — local license: /explore/remocn/motion/LICENSE
Source: ${reference}
Original group: ${entry.group}; source settings: ${entry.dependencies.join(", ") || "none"}
Copied upstream source (${entry.sourcePath}), not executed by this adapter:
${entry.source}
--></body></html>`;
}

/**
 * MIT-licensed Remocn references, bundled as source material rather than runtime code.
 *
 * The upstream `guides` group is excluded: those fourteen entries are `content/docs/guides/*.mdx`
 * prose, not components, so a Visuals card for one could only show motion its source never had.
 */
export function studioRemocnMotion(): StudioEntry[] {
  return (remocnData as RemocnEntry[]).filter((entry) => entry.group !== "guides").map((entry) => {
    const reference = `${repository}/blob/${upstreamCommit}/${entry.sourcePath}`;
    return {
      id: entry.id,
      name: entry.title,
      summary: entry.summary,
      tags: ["remocn", `remocn:${entry.group}`, entry.group],
      format: `Remocn ${formatLabels[entry.group] ?? entry.group.replace(/s$/, "")}`,
      duration: "Source reference",
      settings: { title: entry.title, speed: 1, format: "portrait" },
      remocnVisual: remocnVisualDefinition(entry),
      mediaCredit: "Remocn · MIT",
      reference: { title: `Remocn: ${entry.title}`, url: reference },
      preview: { kind: "image", url: `${import.meta.env.BASE_URL}explore/remocn/motion/${entry.id}.svg` },
      artifact: artifact(entry, reference),
      body: `Use the attached, directly renderable HyperFrames HTML/CSS/GSAP adapter for ${entry.title}. It is deterministic, editable, and has no Remotion runtime dependency. The copied MIT source is reference material only; replace its sample copy or color variables, render a short preview, and preserve reduced-motion behavior when extending it.`,
    };
  });
}

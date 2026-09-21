/**
 * Remocn scenes for the templates-craft-comp shard. Neither upstream family here is an ordinary
 * component: the three `templates` are multi-file packages whose per-shot modules are not in our
 * dataset, so only the letterboxed stage and the exact shot boundaries are reproduced, and the
 * three `craft` entries export no DOM at all, so each draws what that module actually produces.
 */
import { esc } from "./shared";
import { scene, type SceneContext, type SceneSpec } from "./types";

/** Remocn's registry compositions run at 30 fps; the five `templates` run an internal 60 fps clock. */
const FRAME_MS = 1000 / 30;

/** `x y w h kind hue label`, one card per `|`, verbatim from the upstream `CARDS` literal. */
const BENTO_CARDS =
  "80 80 480 280 c 220 Revenue|600 80 280 280 n 280 MRR|920 80 360 180 g 200 |" +
  "1320 80 480 280 d 0 deploy.ts|1840 80 280 280 l 320 |2160 80 380 180 s 160 Uptime|" +
  "2580 80 360 280 b 40 Visits|920 300 360 200 n 180 Users|2160 300 380 200 c 100 Latency|" +
  "80 400 280 280 g 340 |400 400 480 280 d 0 api.ts|1320 420 280 280 s 60 P95|" +
  "1640 420 380 280 b 260 Builds|2580 420 360 280 l 200 |80 720 480 240 c 290 Errors|" +
  "600 720 280 240 s 20 RPS|920 740 380 220 g 240 |1320 740 360 220 n 140 Active|" +
  "1720 740 480 240 d 0 worker.ts|2240 740 360 240 b 320 Queue|80 1000 360 220 l 180 |" +
  "460 1000 380 220 s 80 Cache|880 1000 480 220 c 200 CPU|1400 1000 280 220 n 360 Jobs|" +
  "1720 1020 360 220 g 120 |2120 1020 380 220 d 0 db.sql|2540 1020 400 220 b 280 Tasks|" +
  "80 1280 480 260 d 0 edge.ts|600 1280 360 260 c 240 TTFB|1000 1280 280 260 l 60 |" +
  "1320 1280 380 260 s 200 Hits|1740 1280 360 260 n 300 Bytes|2140 1280 380 260 g 160 |" +
  "2560 1280 380 260 b 0 Errors|80 1600 380 220 s 280 Saved|500 1600 480 220 c 40 Net Out|" +
  "1020 1600 360 220 d 0 auth.ts|1420 1600 280 220 l 220 |1740 1620 380 220 n 100 Hooks|" +
  "2160 1620 360 220 b 340 Runs|2560 1620 380 220 g 200 |80 1880 480 240 b 180 Edges|" +
  "600 1880 380 240 g 320 |1020 1880 360 240 l 80 |1420 1880 480 240 c 260 Tokens|" +
  "1940 1880 280 240 n 20 Calls|2260 1880 380 240 s 140 Score|2680 1880 260 240 d 0 ws.ts";

/** `name seconds`, the 18 explicit `<Sequence>` shots of the workflow-console orchestrator. */
const WORKFLOW_BEATS =
  "intro 2.2|campaign-command 4.2|fetch 1.7|analysis 2.6|launch-command 1.85|geography 4.25|" +
  "tools 3.1|delivery 2.1|launched 2|growth-title 1.6|stats-loading 2.2|stats 3.6|" +
  "change-command 1.45|recommendation 4.5|double-command 1.45|chart 2|closing-title 2.2|mark 3.833";

type Pt = { x: number; y: number };
const fx = (value: number) => value.toFixed(1);
/** `sampleCubic`, verbatim: a uniform-`t` Bezier walk. */
const sampleCubic = (a: Pt, c1: Pt, c2: Pt, b: Pt, points: number): Pt[] =>
  Array.from({ length: Math.max(2, points) }, (_, index) => {
    const t = index / (Math.max(2, points) - 1);
    const u = 1 - t;
    return {
      x: u ** 3 * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * b.x,
      y: u ** 3 * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t ** 3 * b.y,
    };
  });

/** Catmull-Rom to cubic at tension 1/6, exactly as `curveSegments` emits it. */
const curveSegments = (points: Pt[]): string =>
  points.slice(0, -1).map((p1, index) => {
    const p0 = points[index - 1] ?? p1, p2 = points[index + 1], p3 = points[index + 2] ?? p2;
    return `C ${fx(p1.x + (p2.x - p0.x) / 6)} ${fx(p1.y + (p2.y - p0.y) / 6)},` +
      ` ${fx(p2.x - (p3.x - p1.x) / 6)} ${fx(p2.y - (p3.y - p1.y) / 6)}, ${fx(p2.x)} ${fx(p2.y)}`;
  }).join(" ");

/**
 * `brushRibbon`, verbatim: a closed variable-width outline rebuilt from the first `progress` share
 * of the spine. The half width is taken over the FULL spine, so the drawn head already carries the
 * width it will end at — that is why the mark tapers instead of ending in a blunt cap.
 */
const brushRibbon = (spine: Pt[], o: { strokeWidth: number; pressure: number; release: number; progress: number }) => {
  const drawn = Math.min(spine.length, Math.max(2, Math.round(o.progress * (spine.length - 1)) + 1));
  const left: Pt[] = [], right: Pt[] = [];
  for (let index = 0; index < drawn; index += 1) {
    const half = (o.strokeWidth / 2) * (o.pressure + (o.release - o.pressure) * (index / (spine.length - 1)));
    const before = spine[index - 1] ?? spine[index], after = spine[index + 1] ?? spine[index];
    const length = Math.hypot(after.x - before.x, after.y - before.y) || 1;
    const nx = -(after.y - before.y) / length, ny = (after.x - before.x) / length;
    left.push({ x: spine[index].x + nx * half, y: spine[index].y + ny * half });
    right.push({ x: spine[index].x - nx * half, y: spine[index].y - ny * half });
  }
  const back = right.reverse();
  return `M ${fx(left[0].x)} ${fx(left[0].y)} ${curveSegments(left)} L ${fx(back[0].x)} ${fx(back[0].y)}` +
    ` ${curveSegments(back)} Z`;
};

/** `paperJitter` per pose; the keyframe track reads `var(--x0)` … so the rules stay shared. */
const poseVars = (ctx: SceneContext, seed: string, poses: number, amp: number, rotAmp: number) =>
  Array.from({ length: poses }, (_, pose) => {
    const range = (axis: string, span: number) => (-span + ctx.rand(`${seed}:${axis}:${pose}`) * 2 * span).toFixed(2);
    return `--x${pose}:${range("x", amp)}em;--y${pose}:${range("y", amp)}em;--r${pose}:${range("r", rotAmp)}deg`;
  }).join(";");

/** `useTypewriter`'s ledger: which characters of which line are typed between which two frames. */
const typedRows = (fragments: readonly string[], cpf: number, dwell: number, offset: number) => {
  const rows = [{ text: "", a: offset, b: offset }];
  let cursor = offset;
  for (const code of fragments) {
    const start = cursor;
    Array.from(code).forEach((character, index) => {
      const typedAt = start + (index + 1) / cpf;
      if (character === "\n") return void rows.push({ text: "", a: typedAt, b: typedAt });
      const row = rows[rows.length - 1];
      if (!row.text) row.a = typedAt - 1 / cpf;
      row.text += character;
      row.b = typedAt;
    });
    cursor = start + Math.ceil(code.length / cpf) + dwell;
  }
  return rows;
};

const TOKEN = /(\bexport\b|\bfunction\b|\breturn\b)|("[^"]*")|(\b[a-zA-Z_][a-zA-Z0-9_]*)(?=:)|([{}()<>/])|([0-9]+)/g;
const TOKEN_INK = ["kw", "st", "accent", "pn", "nu"];
/** The upstream regex tokenizer, run once at build time because the code is a fixed literal. */
const highlight = (line: string) => {
  let out = "", last = 0;
  for (const match of line.matchAll(TOKEN)) {
    const index = match.index;
    if (index > last) out += `<i>${esc(line.slice(last, index))}</i>`;
    out += `<i style="color:var(--p-${TOKEN_INK[match.slice(1, 6).findIndex(Boolean)]})">${esc(match[0])}</i>`;
    last = index + match[0].length;
  }
  return out + (last < line.length ? `<i>${esc(line.slice(last))}</i>` : "");
};

/** `noise(i, 0)` — the frozen phase of card `i`, which gives every card its own waveform. */
const bentoNoise = (index: number) => Math.sin(index) * 0.5 + 0.5;

/** width %, indent steps, colour key — the seven code pills, verbatim. */
const CODE_PILLS: readonly (readonly [number, number, string])[] =
  [[60, 0, "a"], [80, 1, "b"], [50, 1, "c"], [70, 2, "b"], [40, 2, "d"], [30, 1, "e"], [20, 0, "e"]];

const bentoBody = (kind: string, index: number, hue: number) => {
  const t = bentoNoise(index) * 6.28;
  if (kind === "c") {
    const points = Array.from({ length: 12 }, (_, j) =>
      `${(j / 11 * 100).toFixed(1)},${(50 - (Math.sin(j * 0.7 + t) * 18 + Math.cos(j * 0.4 + t * 0.6) * 8)).toFixed(1)}`).join(" ");
    return `<svg class="cv" viewBox="0 0 100 60" preserveAspectRatio="none">` +
      `<polyline class="ar" points="${points} 100,60 0,60"/><polyline class="ln" points="${points}"/></svg>`;
  }
  if (kind === "b") return Array.from({ length: 10 }, (_, j) => `<i class="br" style="--rv-own:${Math.round((index + 0.8 * j) * 1000) % 6283}ms"></i>`).join("");
  if (kind === "d") return CODE_PILLS.map(([w, indent, key]) => `<i class="pl" style="--c:var(--p-code${key});--w:${w}%;--in:${indent * 14}em"></i>`).join("");
  if (kind === "n") return `<b>${Math.floor(1200 + bentoNoise(index) * 800)}</b><em>+${(bentoNoise(index + 1) * 12).toFixed(1)}%</em>`;
  if (kind === "s") return `<b>${(95 + bentoNoise(index) * 5).toFixed(2)}</b><em>%</em>`;
  if (kind === "l") return `<i class="tile" style="--g1:hsl(${hue} 70% 55%)"></i>`;
  return "";
};

/** One absolutely-positioned card on the 3500x2500 super-canvas, in its literal upstream px. */
const bentoCard = (raw: string, index: number) => {
  const parts = raw.split(" "), hue = Number(parts[5]), label = parts.slice(6).join(" ").trim();
  const tint = parts[4] === "g" ? `;--g1:hsl(${hue} 80% 60%);--g2:hsl(${(hue + 60) % 360} 70% 40%)` : "";
  return `<i class="bc k${parts[4]}" style="--x:${parts[0]}em;--y:${parts[1]}em;--w:${parts[2]}em;--h:${parts[3]}em` +
    `;--rv-own:${(index * 1000) % 6283}ms${tint}">${label ? `<em class="lb">${esc(label)}</em>` : ""}` +
    `<span class="bd">${bentoBody(parts[4], index, hue)}</span></i>`;
};

/** The eight inline brand marks, in upstream order; drawn in one ink so the chip colour carries them. */
const SAT_MARKS = [
  '<circle cx="12" cy="10.4" r="7.6"/><path d="M8.6 17.4h6.8V22L12 19.6z"/>',
  '<path d="M12 3 22 20H2Z"/>',
  '<path d="M16.6 7.4H10a2.2 2.2 0 0 0 0 4.4h4a2.2 2.2 0 0 1 0 4.4H7" fill="none" stroke="currentColor" stroke-width="2.4"/>',
  '<rect x="2" y="10" width="9" height="2.5" rx="1.25"/><rect x="13" y="10" width="9" height="2.5" rx="1.25"/><rect x="10" y="2" width="2.5" height="9" rx="1.25"/><rect x="10" y="13" width="2.5" height="9" rx="1.25"/>',
  '<rect x="4" y="4" width="16" height="16" rx="3.6" transform="rotate(45 12 12)"/>',
  '<circle cx="9" cy="4.5" r="3.4"/><circle cx="15" cy="4.5" r="3.4" opacity=".62"/><circle cx="9" cy="11.5" r="3.4" opacity=".84"/><circle cx="15" cy="11.5" r="3.4" opacity=".5"/><circle cx="9" cy="18.5" r="3.4"/>',
  '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 7v10M8 7l8 10M16 7v10" fill="none" stroke="var(--p-bg)" stroke-width="2"/>',
  '<circle cx="8.6" cy="12" r="2.4"/><circle cx="15.4" cy="12" r="2.4"/><path d="M5 6.5A16 16 0 0 1 19 6.5c2 3.2 2.9 7 2.5 11.2A17 17 0 0 1 16 20.4l-.9-1.5a12 12 0 0 0 1.7-.9 12 12 0 0 1-9.6 0c.5.4 1.1.7 1.7.9L8 20.4a17 17 0 0 1-5.5-2.7C2.1 13.5 3 9.7 5 6.5z" fill-rule="evenodd"/>',
];

/** Satellite `i`: orbit radius, the ellipse squash, its period multiple and its angular phase. */
const satellite = (index: number, count: number) => {
  const rx = 230 + index * 22, omega = 0.012 - index * 0.0008;
  return { rx, sy: (180 + index * 15.4) / rx, k: 0.012 / omega, phase: ((index / count) * Math.PI * 2) / (omega * 30) };
};

/** Upstream `<Sequence name=…>` shot titles; the statement strings themselves are not in our data. */
const TEASER_SHOTS = ["An idea", "Better work", "Every detail", "Together", "A fresh chapter"];
const GUIDE_SHOTS = ["Identity", "Palette", "Typography", "Object collage", "Closing identity"];
const CODE_FRAGMENTS = [
  "export function Button() {\n  return (\n    <button",
  "\n      style={{",
  '\n        background: "#3b82f6",',
  '\n        color: "white",',
  '\n        padding: "12px 28px",',
  '\n        borderRadius: "999px",',
  "\n        fontWeight: 600,",
  '\n      }}\n    >\n      Ship it\n    </button>\n  );\n}',
];

export const templatesCraftComp: readonly SceneSpec[] = [
  /**
   * Six shots in 16 s on a letterboxed 960x540 stage: five statements of 1.73–2.73 s, then a
   * release lockup that holds for 5.83 s — more than a third of the film.
   */
  scene({
    id: "release-teaser",
    group: "templates",
    shard: "templates-craft-comp",
    stage: { w: 960, h: 540 },
    params: { brandName: "Orvio", release: "2", tagline: "Your next chapter starts here.", reducedMotion: false },
    palette: { bg: "#0b0c0e", text: "#f3f5f7", accent: "#9bc8dd", hair: "#f3f5f71f" },
    motion: { kind: "cycle", seconds: 16, hold: 0 },
    still: 0.78,
    fidelity: { level: "stand-in", note: "Only the orchestrator is in our dataset: the shot boundaries and the 960x540 letterbox are upstream, the per-shot typography is ours." },
    markup: (ctx, p) =>
      `<div class="rv-stage"><i class="edge"></i>` +
      TEASER_SHOTS.map((text, index) => `<em class="st s${index + 1}">${ctx.esc(text)}</em>`).join("") +
      `<div class="lock"><i class="mark"></i><b>${ctx.esc(String(p.brandName))}` +
      `<sup>${ctx.esc(String(p.release))}</sup></b><em>${ctx.esc(String(p.tagline))}</em></div></div>`,
  }),
  /**
   * Five shots in 17.87 s, and the two structural facts worth keeping: Typography opens 0.53 s
   * before Palette ends, so that handoff is a dissolve, and the collage is nested inside the
   * specimen's window and exits with it on the same frame.
   */
  scene({
    id: "brand-guidelines",
    group: "templates",
    shard: "templates-craft-comp",
    stage: { w: 960, h: 540 },
    params: { brandName: "Form Study", reducedMotion: false },
    palette: { bg: "#f2ece4", text: "#191512", accent: "#a64b38", sw2: "#d8b08c", sw3: "#2e3a2f", sw4: "#8c8177", hair: "#19151226" },
    motion: { kind: "cycle", seconds: 17.867, hold: 0 },
    still: 0.42,
    fidelity: { level: "stand-in", note: "The five scene modules are not in our dataset; the shot windows and their overlap are upstream, the specimen and collage interiors are ours." },
    markup: (ctx, p) => {
      const name = ctx.esc(String(p.brandName));
      return `<div class="rv-stage"><div class="sh identity"><i class="mark"></i><b>${name}</b></div>` +
        `<div class="sh swatches">${["accent", "sw2", "sw3", "sw4", "text"].map((key, index) =>
          `<i style="--c:var(--p-${key});--rv-own:${index * 90}ms"></i>`).join("")}</div>` +
        `<div class="sh specimen"><b>Aa</b><em>${ctx.esc(GUIDE_SHOTS[2])} 400 / 500 / 800</em></div>` +
        `<div class="sh collage">${["accent", "sw3", "sw4"].map((key, index) =>
          `<i style="--c:var(--p-${key});--rv-own:${index * 140}ms"></i>`).join("")}</div>` +
        `<div class="sh closing"><b>${name}</b><i class="rule"></i><em>${ctx.esc(GUIDE_SHOTS[0])}</em></div></div>`;
    },
  }),
  /** 18 shots in 46.83 s on a quarter-scale 480x270 stage: command beats 1.45–1.85 s, results 2.6–4.5 s. */
  scene({
    id: "workflow-console",
    group: "templates",
    shard: "templates-craft-comp",
    stage: { w: 480, h: 270 },
    params: { productName: "Workflow Console" },
    palette: { bg: "#0e1b2b", text: "#e7e7e7", accent: "#8ed8f8", hair: "#e7e7e71f", dim: "#e7e7e780" },
    motion: { kind: "cycle", seconds: 46.833, hold: 0, extra: { caret: 1 } },
    still: 0.62,
    fidelity: { level: "stand-in", note: "The 12 scene modules and the country outlines are not in our dataset; only the 18 shot boundaries are upstream." },
    markup: (ctx, p) => {
      const beats = WORKFLOW_BEATS.split("|").map((beat) => beat.split(" "));
      const ruler = beats.map(([n, s]) => `<i style="--d:${s}" title="${ctx.esc(n)}"></i>`).join("");
      return `<div class="rv-stage"><div class="win"><div class="tb"><i></i><i></i><i></i>` +
        `<em>${ctx.esc(String(p.productName))}</em></div><div class="tm">` +
        `<p class="cmd"><b>$</b> workflow launch --env prod<i class="cr"></i></p>` +
        `<p class="out">resolved ${beats.length} steps &middot; 4 environments</p>` +
        `<div class="pb">${Array.from({ length: 6 }, (_, index) =>
          `<i style="--lv:${Math.round(28 + ctx.rand(`bar:${index}`) * 64)}%;--rv-own:${index * 70}ms"></i>`).join("")}` +
        `</div></div></div><div class="rail">${ruler}<div class="lit"><div class="inner">${ruler}</div></div></div></div>`;
    },
  }),
  /** A geometry library, not a scene: one grain-filtered variable-width ribbon, no time term at all. */
  scene({
    id: "brush",
    group: "craft",
    shard: "templates-craft-comp",
    stage: { w: 480, h: 270 },
    params: { strokeWidth: 26, pressure: 0.2, release: 1, progress: 1, points: 32, grain: 1 },
    palette: { bg: "#f4efe6", text: "#171412", accent: "#b4472d" },
    motion: { kind: "static" },
    still: 0.5,
    markup: (ctx, p) => {
      const id = `rv-brush-${Math.floor(ctx.rand(`${p.strokeWidth}:${p.grain}`) * 1e9)}`;
      const taper = { pressure: p.pressure, release: p.release, progress: p.progress };
      const stroke = (a: Pt, c1: Pt, c2: Pt, b: Pt, width: number) =>
        `<path d="${brushRibbon(sampleCubic(a, c1, c2, b, p.points), { ...taper, strokeWidth: width })}" filter="url(#${id})"/>`;
      return `<div class="rv-stage"><svg class="ink" viewBox="0 0 480 270"><defs><filter id="${id}" ` +
        `x="-30%" y="-30%" width="160%" height="160%"><feTurbulence type="fractalNoise" baseFrequency="0.7" ` +
        `numOctaves="3" seed="${Math.floor(ctx.rand("grain") * 1000)}" result="g"/><feDisplacementMap in="SourceGraphic" ` +
        `in2="g" scale="${(p.strokeWidth * 0.5 * p.grain).toFixed(1)}" xChannelSelector="R" yChannelSelector="G"/>` +
        `</filter></defs><g class="a">${stroke({ x: 62, y: 196 }, { x: 156, y: 36 }, { x: 292, y: 252 }, { x: 412, y: 88 }, p.strokeWidth)}</g>` +
        `<g class="b">${stroke({ x: 104, y: 232 }, { x: 196, y: 214 }, { x: 284, y: 244 }, { x: 392, y: 222 }, p.strokeWidth * 0.54)}</g>` +
        `</svg></div>`;
    },
  }),
  /** The quantiser: every pose is held for 3 frames, so this reads at 10 fps on a 30 fps clock. */
  scene({
    id: "stop-motion",
    group: "craft",
    shard: "templates-craft-comp",
    stage: { w: 480, h: 270 },
    params: { step: 3, amp: 1.4, rotAmp: 0.35 },
    palette: { bg: "#efe7d8", text: "#1b1a17", accent: "#d8453a", cool: "#2f6fd0", warm: "#f0b429" },
    motion: { kind: "loop", seconds: 1 },
    still: 0.3,
    fidelity: { level: "stand-in", note: "A helper module with no DOM upstream; the 3-frame grid and the jitter amplitudes are its real values, the four paper cuts are ours." },
    markup: (ctx, p) => {
      const poses = Math.round(30 / p.step);
      const cut = (n: string) => `<i class="cut ${n}" style="${poseVars(ctx, n, poses, p.amp, p.rotAmp)}"></i>`;
      return `<div class="rv-stage"><div class="sheet">${["sq", "ci", "tr", "st"].map(cut).join("")}</div>` +
        `<div class="ticks">${Array.from({ length: poses }, (_, pose) =>
          `<i style="--rv-own:${Math.round(pose * (1000 / poses))}ms"></i>`).join("")}</div>` +
        `<em class="rate">${poses} poses &middot; step ${p.step}</em></div>`;
    },
  }),
  /** The registry's motion vocabulary, drawn as the spec sheet it is: five curves and the stagger ruler. */
  scene({
    id: "scene-motion",
    group: "craft",
    shard: "templates-craft-comp",
    stage: { w: 480, h: 270 },
    params: { base: 5, power: 0.8, jitter: 1.5, frames: 7 },
    palette: { bg: "#101014", text: "#e9e9ef", accent: "#7dd3fc", grid: "#e9e9ef1f" },
    motion: { kind: "cycle", seconds: 0.8, hold: 0.9 },
    still: 0.36,
    fidelity: { level: "stand-in", note: "A constants module with no DOM upstream; the curves and the stagger series are its real values, the spec-sheet layout is ours." },
    markup: (ctx, p) =>
      `<div class="rv-stage">` +
      ["EXPO", "FADE", "SETTLE", "SETTLE_SOFT", "SETTLE_MARK"].map((name, index) =>
        `<div class="rail r${index + 1}" style="--rv-own:${Math.round(index * p.frames * FRAME_MS)}ms">` +
        `<em>${name}</em><i class="dot"></i></div>`).join("") +
      `<div class="ruler">${Array.from({ length: 9 }, (_, index) => {
        const at = Math.max(0, index ** p.power * p.base + (ctx.rand(`stagger-${index}`) - 0.5) * 2 * p.jitter);
        return `<i style="--at:${(at / 30 * 100).toFixed(2)}%"></i>`;
      }).join("")}<em>stagger(i, ${p.base}, ${p.power})</em></div></div>`,
  }),
  /** Six chips on elliptical orbits of 17.5–26.2 s, one data line firing per second, a 2.51 s core pulse. */
  scene({
    id: "ecosystem-constellation",
    group: "compositions",
    shard: "templates-craft-comp",
    stage: { w: 1280, h: 720 },
    params: { satelliteCount: 6, centerLabel: "V", speed: 1 },
    palette: {
      bg: "#0b0714", text: "#ffffff", accent: "#a855f7", sheen: "#ffffff2e", shadow: "#00000066",
      sat0: "#1f1f23", sat1: "#0a0a0a", sat2: "#635bff", sat3: "#1a1d21", sat4: "#5e6ad2",
      sat5: "#1e1e1e", sat6: "#1a1a1a", sat7: "#5865f2",
    },
    motion: { kind: "loop", seconds: 6, extra: { orbit: 17.4533, pulse: 2.5133 } },
    still: 0.18,
    fidelity: { level: "approximate", note: "The one-shot assembly spring that flies the chips in from 1200 orbit radii is dropped, because the preview is an endless loop rather than a 0-to-70 frame entrance." },
    markup: (ctx, p) => {
      const count = Math.max(3, Math.min(8, Math.floor(p.satelliteCount)));
      return `<div class="rv-stage"><i class="glow g1"></i><i class="glow g2"></i>` +
        Array.from({ length: count }, (_, index) => {
          const { rx, sy, k, phase } = satellite(index, count);
          return `<i class="orb" style="--rx:${rx}em;--sy:${sy.toFixed(4)};--isy:${(1 / sy).toFixed(4)}` +
            `;--k:${k.toFixed(5)};--ph:${Math.round(phase * 1000)}ms;--pd:${index * 1000}ms` +
            `;--brand:var(--p-sat${index % 8})"><i class="arm"><i class="chip"><i class="face">` +
            `<svg viewBox="0 0 24 24">${SAT_MARKS[index % SAT_MARKS.length]}</svg></i></i></i></i>`;
        }).join("") +
        `<div class="core">${ctx.esc(String(p.centerLabel))}</div></div>`;
    },
  }),
  /** A 3500x2500 wall of 48 cards drifting 2220 px right and 1780 px down at constant velocity. */
  scene({
    id: "infinite-bento-pan",
    group: "compositions",
    shard: "templates-craft-comp",
    stage: { w: 1280, h: 720 },
    params: { panSpeed: 1, SUPER_W: 3500, SUPER_H: 2500, speed: 1 },
    palette: {
      bg: "#08080a", text: "#ffffff", accent: "#7c3aed", cardA: "#131313", cardB: "#0a0a0a", hair: "#ffffff12",
      label: "#ffffff8c", dim: "#ffffff80", wash: "#7c3aed22", fade: "#7c3aed55", cast: "#7c3aed44",
      codea: "#7dd3fc", codeb: "#ffffffcc", codec: "#f9a8d4", coded: "#fde047", codee: "#ffffff99",
      shade: "#000000d9", deep: "#000000",
    },
    motion: { kind: "loop", seconds: 10, extra: { life: 6.2832 } },
    still: 0.34,
    fidelity: { level: "approximate", note: "The counters and stats are frozen at their own frame-zero values; the pan, the 48 card frames and the bar breathing are the upstream arithmetic." },
    markup: (_ctx, p) => {
      const pan = Math.min(1, p.panSpeed);
      return `<div class="rv-stage"><div class="sky" style="--sw:${p.SUPER_W}em;--sh:${p.SUPER_H}em` +
        `;--px:${((p.SUPER_W - 1280) * pan).toFixed(0)}em;--py:${((p.SUPER_H - 720) * pan).toFixed(0)}em">` +
        BENTO_CARDS.split("|").map(bentoCard).join("") + `</div><i class="vg"></i></div>`;
    },
  }),
  /** 1.6 characters a frame, a 5-frame dwell between fragments, and eight hard-cut UI snaps. */
  scene({
    id: "live-code-compilation",
    group: "compositions",
    shard: "templates-craft-comp",
    stage: { w: 1280, h: 720 },
    params: { CHARS_PER_FRAME: 1.6, DWELL_FRAMES: 5, INITIAL_OFFSET: 8, speed: 1 },
    palette: {
      bg: "#070708", text: "#e4e4e7", accent: "#3b82f6", panel: "#0c0c0ed9", hair: "#ffffff10", rim: "#ffffff2e",
      gut: "#ffffff33", kw: "#c084fc", st: "#86efac", pn: "#71717a", nu: "#fbbf24", r1: "#ff5f57",
      r2: "#febc2e", r3: "#28c840", live: "#22c55e", dim: "#ffffff80", btn: "#ffffff0f",
      btnInk: "#ffffff66", glow: "#3b82f655", wash: "#3b82f614", haze: "#a855f70f",
    },
    motion: { kind: "cycle", seconds: 6.867, hold: 1.6, extra: { caret: 0.8 } },
    still: 0.55,
    fidelity: { level: "approximate", note: "The per-line reveal is a continuous clip rather than whole-character steps, so a glyph can be sliced mid-stroke; the frame timings themselves are exact." },
    markup: (_ctx, p) => {
      const run = (6.867 + 1.6) * 30;
      const rows = typedRows(CODE_FRAGMENTS, p.CHARS_PER_FRAME, p.DWELL_FRAMES, p.INITIAL_OFFSET);
      return `<div class="rv-stage"><i class="back"></i><div class="pane code"><div class="win">` +
        `<div class="tb">${["r1", "r2", "r3"].map((k) => `<i style="--c:var(--p-${k})"></i>`).join("")}<em>Button.tsx</em></div>` +
        `<div class="src">${rows.map((row, index) =>
          `<span class="ln"><em>${index + 1}</em><i class="tx" style="--rv-own:${Math.round(row.a * FRAME_MS)}ms` +
          `;--k:${((row.b - row.a) / run).toFixed(5)}">${highlight(row.text)}</i>` +
          (index === rows.length - 1 ? `<i class="cr"></i>` : "") + `</span>`).join("")}` +
        `</div></div></div><div class="pane view"><em class="badge"><i></i>Preview &middot; HMR</em>` +
        `<span class="bt"><em class="l0">Button</em><em class="l1">Ship it</em></span></div></div>`;
    },
  }),
];

// v5 generator for alesha-story-001.
// Fixes vs v4 (user review): fat sticker-outline word style (as in the i11ush
// reference), narration-synced beat remap, bright blur + bottom fade mask on
// the content box (kills the "band" read), livelier alternating ken-burns,
// taiga baked-letterbox pushed out, ralphy_ugc watermark in the blur zone,
// new VO ending ("та самая девочка из тайги").
import fs from "node:fs";
import path from "node:path";

const PROJ = ".ralphy/workspaces/alesha/projects/alesha-story-001";
const caps = JSON.parse(fs.readFileSync(path.join(PROJ, "artifacts/captions/main-vo.json"), "utf8"));
const rawWords: Array<{ text: string; startMs: number; endMs: number }> =
  Array.isArray(caps) ? caps : caps.captions ?? caps.words ?? [];
const words = rawWords
  .map((w) => ({ t: (w.text ?? "").trim().replace(/[.,!?;:]+$/g, ""), a: w.startMs / 1000 }))
  .filter((w) => w.t && !/^[-–—.,!?]+$/.test(w.t));

const norm = (s: string) => s.toLowerCase().replace(/[^а-яёa-z0-9]/gi, "");
function wordStart(text: string, occurrence = 1): number {
  let n = 0;
  for (const w of words) if (norm(w.t) === norm(text) && ++n === occurrence) return w.a;
  throw new Error(`anchor word not found: ${text} #${occurrence}`);
}

const VO_DUR = 52.38;
const TOTAL = Math.round((VO_DUR + 0.15) * 10) / 10;
const V = "artifacts/videos/", I = "artifacts/images/";
// Beat map v5 — narration-synced.
const defs: Array<{ kind: "video" | "img"; file: string; a: number; fgScale?: number }> = [
  { kind: "img",   file: I + "bait-01-tiny-forest.png",  a: 0.0 },                          // hook
  { kind: "img",   file: I + "scene-01-yard-puppy.png",  a: wordStart("глухом") - 0.15 },   // село, двор, щенок
  { kind: "video", file: V + "seg-02-trail.mp4",         a: wordStart("Она", 1) - 0.05 },   // пошла за отцом, тропа
  { kind: "video", file: V + "seg-03-taiga.mp4",         a: wordStart("Так") - 0.05, fgScale: 1.16 }, // одна в тайге
  { kind: "img",   file: I + "bait-01-tiny-forest.png",  a: wordStart("Ей") - 0.05 },       // всего три года (крошечная в лесу)
  { kind: "video", file: V + "seg-04-forest.mp4",        a: wordStart("Впереди") - 0.05 },  // 12 дней, без еды/воды
  { kind: "img",   file: I + "scene-06-den.png",         a: wordStart("Ночью") - 0.05 },    // ночью холод
  { kind: "video", file: V + "seg-05-fire.mp4",          a: wordStart("днем") - 0.05 },     // днём пожар
  { kind: "video", file: V + "seg-06-bear.mp4",          a: wordStart("Однажды") - 0.05 },  // уснула в медвежьей
  { kind: "img",   file: I + "bait-02-bear-loom.png",    a: wordStart("берлоге") - 0.05 },  // берлоге (скример)
  { kind: "video", file: V + "seg-07-storm.mp4",         a: wordStart("Потом", 1) - 0.05 }, // град, пещера
  { kind: "video", file: V + "seg-08-swamp.mp4",         a: wordStart("девятый") - 0.2 },   // болото
  { kind: "img",   file: I + "scene-09-boots.png",       a: wordStart("выбралась") - 0.3 }, // сапоги и куртка
  { kind: "img",   file: I + "scene-10-warmth.png",      a: wordStart("Все") - 0.05 },      // рядом был только щенок
  { kind: "video", file: V + "seg-11-dogrun.mp4",        a: wordStart("потом", 2) - 0.15 }, // сам вернулся в село
  { kind: "img",   file: I + "scene-12-village.png",     a: wordStart("Люди") - 0.05 },     // люди поняли
  { kind: "img",   file: I + "bait-03-searchlight.png",  a: wordStart("Спасатели") - 0.05 },// спасатели ночью
  { kind: "img",   file: I + "scene-13-rescue.png",      a: wordStart("двенадцатый") - 0.3 },// нашли живой
  { kind: "img",   file: I + "scene-14-blanket.png",     a: wordStart("потеряла", 3) - 0.3 },// треть веса, но выжила
  { kind: "img",   file: I + "scene-15-ballet.png",      a: wordStart("спустя") - 0.15 },   // та самая девочка — Большой
];
const beats = defs.map((b, i) => ({
  ...b,
  a: Math.round(b.a * 100) / 100,
  d: Math.round(((i + 1 < defs.length ? defs[i + 1].a : TOTAL) - b.a) * 100) / 100,
}));

let track = 0;
const sceneEls = beats.map((b, idx) => {
  const bg = track++, fg = track++;
  const tag = b.kind === "video" ? "video" : "img";
  const extra = b.kind === "video" ? " muted playsinline" : "";
  const style = b.fgScale ? ` style="transform:scale(${b.fgScale})"` : "";
  return [
    `      <${tag} id="bg${idx}" class="bg" data-start="${b.a}" data-duration="${b.d}" data-track-index="${bg}" src="${b.file}"${extra}></${tag}>`,
    `      <${tag} id="fg${idx}" class="fg" data-start="${b.a}" data-duration="${b.d}" data-track-index="${fg}" src="${b.file}"${extra}${style}></${tag}>`,
  ].join("\n");
});

const stills = beats.map((b, i) => ({ id: i, a: b.a, d: b.d, img: b.kind === "img", s0: b.fgScale ?? 1 }));
const cues = words.map((w, i) => ({
  t: w.t.toUpperCase(),
  a: w.a,
  b: i + 1 < words.length ? words[i + 1].a : TOTAL,
}));

const html = `<!doctype html>
<html lang="ru">
  <body>
    <div data-composition-id="root" data-width="1080" data-height="1920" class="root">
${sceneEls.join("\n")}

      <div class="wm">ralphy_ugc</div>
      <div class="captions" id="caps"></div>

      <audio id="vo" data-start="0" data-duration="${TOTAL}" data-track-index="90" src="artifacts/voiceover/main-vo.mp3" data-volume="1"></audio>
      <audio id="mus" data-start="0" data-duration="${TOTAL}" data-track-index="91" data-media-start="0.3" src="artifacts/music/bed-01.mp3" data-volume="0.2"></audio>

      <style>
        .root { position:relative; width:1080px; height:1920px; background:#000; overflow:hidden;
          font-family:"Montserrat","Arial Black",sans-serif; }
        .bg { position:absolute; inset:0; width:1080px; height:1920px; object-fit:cover;
          transform:scale(1.25); filter:blur(28px) brightness(1.0) saturate(1.15); }
        .fg { position:absolute; top:0; left:0; width:1080px; height:1300px; object-fit:cover;
          -webkit-mask-image:linear-gradient(to bottom, #000 96%, transparent 100%);
          mask-image:linear-gradient(to bottom, #000 96%, transparent 100%); }
        .wm { position:absolute; left:0; width:1080px; top:1560px; z-index:6; text-align:center;
          font-weight:800; font-style:italic; font-size:56px; letter-spacing:3px;
          color:rgba(255,255,255,0.55); text-shadow:0 2px 14px rgba(0,0,0,0.35); }
        .captions { position:absolute; left:0; width:1080px; top:1108px; height:250px; z-index:10;
          display:flex; align-items:center; justify-content:center; padding:0 50px; }
        .wordbox { position:absolute; opacity:0; }
        .wtxt { position:relative; text-align:center; max-width:980px;
          font-weight:900; font-size:116px; line-height:1.0; letter-spacing:2px;
          color:#fff; text-transform:uppercase; z-index:2; }
        .wout { position:absolute; inset:0; text-align:center; max-width:980px;
          font-weight:900; font-size:116px; line-height:1.0; letter-spacing:2px;
          text-transform:uppercase; color:#000; -webkit-text-stroke:26px #000; z-index:1;
          text-shadow:0 12px 0 #000, 0 14px 0 #000, 6px 12px 0 #000, -6px 12px 0 #000; }
      </style>
      <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
      <script>
        const CUES = ${JSON.stringify(cues)};
        const STILLS = ${JSON.stringify(stills)};
        const TOTAL = ${TOTAL};
        window.__timelines = window.__timelines || {};
        const tl = gsap.timeline({ paused: true });

        // livelier ken-burns on stills: alternate push-in / pull-out + tiny pan,
        // each ANCHORED at its own beat start
        STILLS.forEach((s, k) => {
          if (!s.img) return;
          const zin = k % 2 === 0;
          const from = { scale: s.s0 * (zin ? 1.0 : 1.14), xPercent: zin ? 0 : -1.5 };
          const to   = { scale: s.s0 * (zin ? 1.14 : 1.0), xPercent: zin ? 1.5 : 0, duration: s.d, ease: "none" };
          tl.fromTo("#fg" + s.id, from, to, s.a);
        });

        const capsEl = document.getElementById("caps");
        CUES.forEach((c, i) => {
          const box = document.createElement("div");
          box.className = "wordbox"; box.id = "w" + i;
          const out = document.createElement("div"); out.className = "wout"; out.textContent = c.t;
          const txt = document.createElement("div"); txt.className = "wtxt"; txt.textContent = c.t;
          box.appendChild(out); box.appendChild(txt);
          capsEl.appendChild(box);
          const end = Math.min(c.b, TOTAL);
          tl.fromTo("#w" + i, { opacity: 0, scale: 0.68 }, { opacity: 1, scale: 1, duration: 0.09, ease: "back.out(2.6)" }, c.a);
          tl.to("#w" + i, { opacity: 0, duration: 0.05, ease: "power1.in" }, Math.max(c.a + 0.1, end - 0.02));
        });

        window.__timelines["root"] = tl;
      </script>
    </div>
  </body>
</html>
`;
fs.writeFileSync(path.join(PROJ, "index.html"), html);
console.log("wrote index.html  cues=" + cues.length + "  beats=" + beats.map(b=>b.a).join(","));

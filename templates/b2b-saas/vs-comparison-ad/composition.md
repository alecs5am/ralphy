# composition — vs-comparison-ad

The deliverable is a HyperFrames `index.html` (driving AI-generated clips + motion-graphics overlays) rendered to a ~60-70s 9:16 mp4, then a VHS/grade ffmpeg post-pass. This file captures the two-path cut structure and the overlay mechanics, generalized off the source brands.

## Slots

```
{{safe_brand}}    — the SAFE / winning brand (calm accent, no meter)
{{bad_brand}}     — the BAD / losing brand (opposite accent, the gauge drains on it)
{{safe_accent}}   — calm-side accent HEX
{{bad_accent}}    — opposite-side accent HEX
{{meter_label}}   — the draining-gauge label (LIMITS / CREDITS / TOKENS / ...)
{{captions}}      — per-beat kinetic caption lines (the silent narration)
{{endcard}}       — end-card line + the SAFE brand mark
{{source_clip}}   — optional source video to remix the cut blueprint from
{{display_font}}  — overlay display/HUD font (VT323-style retro mono by default)
```

## Two-path cut structure (source: ~12 clips over 68.6s)

```
0  hub / setup       — a "two doors" choice frame (both accents present)
1  SAFE path enters  — {{safe_accent}} door; calm clip(s); caption: "no meter, no countdown"
2  SAFE montage      — the winning experience; ONE held aesthetic; gentle push-ins
3  BAD path enters   — {{bad_accent}} door; the {{meter_label}} gauge appears full
4  BAD descent       — the gauge DRAINS across these scenes; tension rises
5  trigger beat      — the gauge crashes to 0 in 1s; flips danger-red; the "screamer" / punchline
6  end-card          — {{endcard}} + the {{safe_brand}} mark; static hold
```

Adapt the beat count to the comparison — the two-path color split + the draining meter + timeline-gated overlays are the mechanism, not the literal beat list.

## The single-composition pattern (load-bearing)

ONE root composition. Sequential `<video>` / still clips sit on a SINGLE track 0; overlays (countdown, the meter gauge, captions, end-card) are ALWAYS-PRESENT absolutely-positioned divs whose visibility is gated by the one paused GSAP timeline. **No sub-compositions.**

```html
<div id="root" data-composition-id="root" data-width="1080" data-height="1920"
     data-start="0" data-duration="68.6">
  <!-- track 0: sequential clips -->
  <video class="clip" data-start="0"    data-duration="11.9" data-track-index="0" src="assets/videos/hub.mp4" muted playsinline></video>
  <video class="clip" data-start="11.9" data-duration="3.0"  data-track-index="0" src="assets/videos/safe-enter.mp4" muted playsinline></video>
  <!-- ... more clips ... -->
  <!-- always-present overlays, gated by the timeline -->
  <div id="countdown">...</div>
  <div id="limits"><div class="hud-title">// {{meter_label}}</div><div class="gauge"><div class="fill" id="limits-fill"></div></div></div>
  <div class="cap">...</div>
  <div id="endcard">...</div>
</div>
<script>
  window.__timelines = window.__timelines || {};
  window.__timelines["root"] = tl;   // paused GSAP timeline
</script>
```

## The draining meter (the BAD side's core device)

A battery-style gauge: a `scaleX` fill + an `onUpdate` percent counter driven by a proxy `{v}` tween. Slow drain across the bad-side scenes, then a 1s crash on the trigger beat; color green→danger-red near zero.

```js
const proxy = { v: 100 };
tl.to(proxy, { v: 12, duration: 18, ease: "none",          // slow drain
  onUpdate: () => { fill.style.transform = `scaleX(${proxy.v/100})`;
                    pct.textContent = Math.round(proxy.v) + "%"; } }, badStart);
tl.to(proxy, { v: 0, duration: 1.0, ease: "power4.in",     // 1s crash on trigger
  onUpdate: () => { fill.style.transform = `scaleX(${proxy.v/100})`;
                    fill.style.background = "var(--danger)"; } }, triggerBeat);
```

## The film-leader countdown

An SVG ring whose `strokeDashoffset` sweeps per second + a number set via `tl.set` each second + a per-second tick SFX.

## Text is a HyperFrames overlay, NEVER baked into the gen

The image model smudges on-screen text. Door labels, wordmarks, captions, and the HUD all live as a `{{display_font}}` (VT323-style) overlay in HyperFrames. If a source-frame ref has leaked subtitle text, crop the subtitle band OFF the ref before using it.

## The one-aesthetic rule (the source's biggest miss)

Hold ONE visual register end-to-end. The source's door room read as liminal-spaces but the SAFE montage broke into a different "cozy" look — the single biggest post-ship feedback. Lock one register (lighting, grade, lens feel) and validate EVERY generated clip against it before composing.

## Motion + cuts

- Every still gets a slow Ken-Burns push-in (`scale 1.0 → 1.07`, `ease: none`/`sine`).
- Scene changes are 0.5s opacity crossfades, never hard cuts.
- The trigger-beat face/punchline zoom is an INSTANT `tl.set`, not a tween.

## Build workflow

```
1. Blueprint (if remixing {{source_clip}}) — ref pull → ref frames (fps 2) +
   ref analyze-video for the shot-cut map; slice keyframes per shot to reuse as --ref.
2. Anchors first — shared hub plate (the two-door choice) → each brand's character
   master → per-side locations. Pass earlier anchors as extra --ref to lock identity.
3. Generate locations + motion — gemini multi-ref stills; seedance plunges; wan push-ins
   (see model-stack.md). Validate every clip against the ONE locked aesthetic.
4. Compose in HyperFrames — one root composition, clips on track 0, overlays as
   always-present timeline-gated divs. Build the gauge + countdown + captions.
5. Post-process — VHS / grade / mirage as an ffmpeg pass (NOT in-composition);
   then x264 CRF23 slow +faststart compress.
6. QA & render — ralphy render <id>; review against the aesthetic + the meter timing.
```

## Render

`ralphy render <id>` is the only path for the HyperFrames cut. The source ran `bunx hyperframes render` directly because the ralphy wrapper drives Remotion/`UGCVideo`, not the HyperFrames `index.html` (logged in that project's `postmortem/03-cli-issues.md`); use the ralphy verb.

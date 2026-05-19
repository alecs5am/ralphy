# Analog Horror PSA — vibe style

**Genre:** fake government-issued emergency behavioral PSA (Father-Eats-in-the-Basement / Local58 class).
**Length:** 25-35s. Source instance: 30s.
**Format:** YouTube Shorts / TikTok / Reels, 9:16, 30fps, 1080×1920.
**Clip count:** 8-12 scenes at ~3s each. Source instance: 10 scenes.
**Music:** OFF by default. Pure SFX bed.
**Source project:** `workspace/projects/analog-horror-fridge-001/` ("Compliance Bulletin 9-D — Your Dog Is Not Your Dog").

> Why this works: the format hijacks the viewer's PSA reflex (calm civil-defense register = "this is official, attention required") and then weaponizes it by escalating an oddly-precise IF / DO-NOT / BUT / AND scaffold to a reality-break payoff. The flat yellow 1970s civil-defense pictograms read as institutional, not artistic — that's the trick. The cold robo-female monotone never breaks character. The mp4 never plays music. Every audio choice is "this is a real bulletin." The horror is in what the bulletin describes, not how it's performed.

## Vibe anchors

- **EBS-PSA register, always.** The narrator is an emergency broadcast system, not a storyteller. No inflection, no fear, no editorializing. The horror lives in the gap between the calm voice and the impossible content.
- **Yellow pictogram on pure black.** Flat solid `#ffd400` shapes on flat solid `#000000`. Slight stencil-wobble edges (1970s screen-print feel), NO outline, NO internal texture, NO gradient. One subject per icon, ~55-60% of frame, perfectly centered. This is what makes the template the template — replacing it with photoreal or vector-clean kills it.
- **IF / DO-NOT / BUT / AND scaffold.** The narrative spine. 3 IF tells (escalating reality-break) → 3 DO-NOT instructions (concrete, time-bound, callbacks the tells) → 1 BUT reversal (the dread payoff) → 1 AND sting (ominous-present-tense + cuts to color-bar static).
- **Cold robo-female monotone.** Source winner: "Alerter" voice (community), ALL CAPS input text, stability 0.5, style 0.10-0.15. ~250ms pause between sentences. Verify the voice exists before bulk gen — community voices can 404.
- **No music, only SFX.** VHS-hiss bed throughout (-32 LUFS), per-scene static-pop (~120ms) on every scene start, plus per-scene extra SFX. Optional faint sub-bass drone for dread-build at -34 LUFS. Adding actual music breaks the bulletin illusion.
- **Captions ARE the icon's twin.** VT323 word-pop, yellow on black-stroke, red glitch shadow, SAME 5-layer chromatic split and SAME jitter beat as the icons. When the icon jerks, the caption jerks the same way. This sells "one analog signal" instead of "icon + text overlay."
- **Climax = SMPTE blurred color bars + 1kHz signal-lost tone, NEVER confetti dots.** The reference is the analog-TV dead-channel pattern: 3 wide vertical bars (cyan/green/magenta) + narrow bottom strip + `filter: blur(2.5px)` + tracking-band sweep + chromatic-aberration ghost. The blur is non-negotiable — without it, it reads as CSS-generated.

## Key rules (top 7 from POSTMORTEM.md — re-read before iterating)

1. **Lock the visual style on ONE prototype icon before generating the other 9.** Pass `--ref <ref-frame-from-reference-video>` from the FIRST prototype. Iterate ONLY that prototype until the user says "это оно". Then batch the remaining 9 with the locked prototype as `--ref`. Source project spent $1.50 on a wrong-style batch + $1.00 on style-prototype iterations because the style wasn't locked first.

2. **Use sequential bash for-loops, NEVER `ralphy queue` for image batches.** `ralphy queue` triggers an undocumented OpenRouter burst-cap 403 even though `/v1/credits` shows balance. Workaround: `for slot in ...; do ralphy generate image ...; sleep 2; done`. See POSTMORTEM.md open issue #1.

3. **Chroma-key icons to alpha BEFORE Remotion composition.** Generated icons come with a near-black bg that doesn't match Remotion's underlay, producing visible rectangles. Run `ffmpeg -vf "colorkey=0x000000:0.20:0.08,colorkey=0xFFFFFF:0.20:0.05,format=rgba"` on every icon → save to `assets/images-keyed/` → reference THAT path in Remotion.

4. **ElevenLabs CAPS input → flatter PSA delivery.** "DO NOT LOOK IN ITS EYES" reads more monotone than "Do not look in its eyes." Verify the voice ID exists via `/v1/voices/<id>` before bulk gen (community voice IDs disappear between sessions). Run VO sequentially — even 3 parallel calls hit ElevenLabs 429.

5. **Loudnorm AFTER all VOs are final, NEVER during generation.** Mixing regen + loudnorm in the same loop double-norms files when regen fails. Always: gen all 10 → verify durations → separate loudnorm pass.

6. **For climax growls, generate 4 variants and LAYER them at staggered offsets.** Single growl reads as "chihuahua yipping at me". 4 layered (offset 1.5s / 1.8s / 1.9s / 2.1s, volumes 0.55-0.60) reads as "monster."

7. **For analog-horror noise, render at CRF 30 + `-tune grain`.** Default Remotion CRF 18 + canvas-noise produces 190 MB / 30s files (unsharable). CRF 30 + grain produces 28 MB with zero perceptual loss because `-tune grain` deliberately preserves random-noise texture while spending bits on structural content. Use `ralphy video optimize --crf 30 --tune grain --preset veryslow` as a post-render step.

## Workflow (~30 min, ~$1.50 if rules above are followed; source project was ~$4.45 / multiple hours)

```
1. Research                                          (5 min, ~$0.01)
   ├─ ralphy ref pull <reference-shorts-url>
   ├─ ralphy ref frames <slug> --max 16
   ├─ ralphy ref transcribe <slug> --language auto
   ├─ ralphy ref analyze-video <slug>     # better than frames-only for fast-cut refs
   └─ ralphy ref blueprint <slug>

2. Scenario lock                                     (10 min)
   ├─ Write scenario.json with 8-12 scenes × ~3s each, IF/DO-NOT/BUT/AND scaffold
   ├─ angle: "storytime" (passes virality rubric — "analog-horror-psa" doesn't)
   ├─ ralphy project score <id> --strict
   └─ Get explicit user "go" on VO lines BEFORE generating media.

3. Style lock — ONE prototype icon                   (3 min, $0.15)
   ├─ ralphy generate image --slot scene-02-PROTO \
        --model google/gemini-3-pro-image-preview \
        --ref <ref-frame-with-icon.jpg> \
        --prompt "<pictogram brief from prompt-cookbook.md>"
   ├─ Show user the prototype, get explicit yes/no.
   └─ If no → iterate ONLY this slot until yes.

4. Batch 9 sibling icons (SEQUENTIAL, NOT --queue)   (5 min, $0.15 × 9 = $1.35)
   ├─ Reuse prototype as --ref for all 9 siblings.
   ├─ Per-icon prompt: STYLE_BASE (from prompt-cookbook.md) + "Subject for THIS icon: ..."
   └─ Each ~25s on nano-banana.

5. Chroma-key to transparent                         (10 sec)
   └─ for f in assets/images/*.png; do
        ffmpeg -i $f -vf "colorkey=0x000000:0.20:0.08,colorkey=0xFFFFFF:0.20:0.05,format=rgba" \
          assets/images-keyed/$(basename $f)
      done

6. Voiceover (10 lines)                              (3 min, $0 sub)
   ├─ Verify voice exists: xh GET /v1/voices/<id> | jq .voice_id
   ├─ Input text in ALL CAPS for monotone bias
   ├─ Sequential (ElevenLabs 429s on >3 concurrent)
   └─ ralphy audio loudnorm --target -16 per file AFTER all 10 generated

7. SFX (13-17 clips)                                 (3 min, $0 sub)
   ├─ ralphy generate sfx for each: vhs-hiss-bed, static-pop, ebs-alert-tone,
      low-drone-bed, dog-breath-slow (adapt to {{subject_warning}}), mirror-shimmer,
      child-whisper-buried, low-growl-rise, signal-lost-tone, rgb-static-burst,
      wind-through-trees, distant-bark-slowed, collar-jingle-stops + 4× climax-growl variants
   └─ Layer all 4 growl variants for the AND-sting climax.

8. Music                                             (1 min, $0)
   └─ Optional. ralphy ref pull <yt-music-url> --audio-only → cp to assets/music/

9. Composition + render                              (15 min)
   ├─ src/videos/<id>/index.tsx with: keyed icons (transparency), MobiusWobble,
      VcrTrackingCanvas + SnowCanvas + MobiusScanlines, GlitchCaption (5-layer
      RGB-split), GlitchXIcon (5-layer RGB ghost), SignalLostColorBars climax.
   ├─ Register composition in Root.tsx
   ├─ composition-props.json: { "compositionId": "<CompName>" }
   ├─ ralphy render <id>
   └─ ralphy video optimize --crf 30 --tune grain → ~10× smaller, identical look
```

## Required inputs

| Slot | Description | Source example |
|---|---|---|
| `{{subject_warning}}` | Entity being un-trusted. Domestic + taken-for-granted. | "your dog" |
| `{{subject_warning_id}}` | Short alphanumeric bulletin code, shown red in hook card. 1-3 chars. | "9-D" |
| `{{bulletin_id}}` | Spoken form of the bulletin code. | "nine D" |
| `{{tell_1}}` | First oddly-precise behavior. Domestic, slightly off. | "watches you sleep" |
| `{{tell_2}}` | Second tell. Breaks physics / reality slightly. Mirror-class works well. | "its reflection does not blink" |
| `{{tell_3}}` | Third tell. Strongest reality-break, ties to viewer personally. | "whispers your name when you are alone" |
| `{{do_not_1}}` | First instruction. Time-bound (after sunset / at night / when alone). | "look in its eyes after sunset" |
| `{{do_not_2}}` | Second instruction. Identity / name / object-bound. | "say its old name" |
| `{{do_not_3}}` | Third instruction. Callbacks tell_1 or setup. | "let it on your bed" |
| `{{but_reveal}}` | Dread payoff. Flat declarative past-tense. The thing the viewer trusts is gone. | "your dog died three years ago" |
| `{{and_sting}}` | Final sting. Ominous-present + future-implication. mp4 cuts to color-bar static after this line. | "tonight it stops pretending" |
| `{{vo_voice_id}}` | ElevenLabs voice ID. Cold robo-female PSA. | `weA4Q36twV5kwSaTEL0Q` (Ava fallback) or community "Alerter" |
| `{{target_language}}` | VO language. Verify voice handles it flat — multilingual_v2 inflects too human on non-English. | "en" |
| `{{brand_name}}` (optional) | In-universe agency issuing the PSA. Default literal: "Emergency Broadcast System" / "Compliance Bureau". A real consumer brand here ruins the illusion. | "Compliance Bureau" |

## Anti-patterns (DO NOT, because Y)

- **DO NOT iterate the icon style silently across 4+ generations.** Ask "yes or no?" after every prototype. Source spent $1.00 iterating before the first user yes/no check. The cost of a wrong style isn't the $0.20/shot, it's the 5 shots before you notice it's wrong.
- **DO NOT use `ralphy queue` for image batches.** Burst-cap 403 (POSTMORTEM open issue #1). Sequential bash loop with `sleep 2` is the reliable path.
- **DO NOT skip the chroma-key step.** Without it, every icon has a visible black rectangle around it in the final render. Two render iterations wasted to discover this.
- **DO NOT trust a "human-sounding" ElevenLabs voice + monotone prompt to produce PSA delivery.** Switch the voice (community "Alerter"-class) OR generate manually in the 11Labs UI with stability ~0.5. Don't burn 3 regens trying to coax a too-emotional voice into monotone.
- **DO NOT loudnorm during the regen loop.** Separate pass after all VOs are final, OR you'll double-norm files when regen fails.
- **DO NOT use a single growl SFX for the climax.** Single growl = "chihuahua yipping". Layer 4 variants at staggered offsets, volumes 0.55-0.60.
- **DO NOT default to CRF 18 for noise-heavy renders.** 190 MB / 30s is unsharable. CRF 30 + `-tune grain` is the right preset for this whole format.
- **DO NOT improvise random colored confetti for the climax static.** Match the reference: blurred SMPTE color bars + tracking-band sweep + chromatic-aberration ghost. The blur is non-negotiable.
- **DO NOT add captions in a different font / register from the icons.** Captions are the icon's twin — same VT323, same yellow, same chromatic split, same jitter beat. They jerk together.
- **DO NOT add a music bed below 0.30 volume "to be safe."** It'll be inaudible against the VHS-hiss bed. If music is on, 0.35-0.40. If you can't justify 0.35, leave music OFF (the default).
- **DO NOT add the creator's handle / watermark.** It breaks the PSA illusion. The format works because viewers ask "is this real?" in the first 3 seconds. A handle answers that question for them.

## Beat structure (10-scene template, ~30s)

| # | Type | Sec | Beat | Icon role | VO line pattern |
|---|---|---|---|---|---|
| 01 | hook | 0-3 | EBS-style title card | Red `{{subject_warning_id}}` characters + horizontal red bars | "Compliance bulletin {{bulletin_id}}." |
| 02 | setup | 3-5 | Frame the PSA context | Yellow pictogram of {{subject_warning}} in calm/ordinary pose | "This is a residential behavioral alert." |
| 03 | if-1 | 5-8 | First tell — domestic-but-off | Pictogram showing the tell behavior | "If {{subject_warning}} {{tell_1}}." |
| 04 | if-2 | 8-11 | Second tell — physics break | Mirror / reflection class pictogram | "If {{subject_warning}} {{tell_2}}." |
| 05 | if-3 | 11-14 | Third tell — strongest reality break | Speech-bubble-with-glyphs class | "If {{subject_warning}} {{tell_3}}." |
| 06 | do-not | 14-17 | First instruction — time-bound | Pictogram + red prohibition slash | "Do not {{do_not_1}}." |
| 07 | do-not | 17-20 | Second instruction — identity-bound | Identity-object + slash | "Do not {{do_not_2}}." |
| 08 | do-not | 20-23 | Third instruction — callback if-1 | Setup-location + entity-mid-action + slash | "Do not {{do_not_3}}." |
| 09 | but-reversal | 23-27 | Dread payoff | Empty-collar / headstone / mark-of-absence | "But {{but_reveal}}." |
| 10 | climax-sting | 27-30 | Final sting + signal-lost | Entity-face-goes-wrong (0-0.8s), then HARD CUT to blurred color bars | "And {{and_sting}}." |

## When to use this template

- Found-footage / analog-horror channels.
- Hook + escalation experiments where you want the bulletin register to do the audience-grabbing work.
- Brand subversions ONLY if the user explicitly briefs "PSA-style ad for {{product}}" — the format CAN be used for products but the PSA illusion has to be the headline; the product is the un-trusted entity.

## When NOT to use this template

- You want music to do narrative work. Music is OFF here — if it's on, you've made a different format.
- You want photoreal video or selfie UGC. This format is icon-driven and selfie-incompatible.
- The viewer needs to leave the video feeling good. The format always lands in dread — no upbeat reversal lands inside the EBS-PSA register.
- You're trying to ship in <10 minutes. Even at minimum-viable iteration count, this needs ~30 minutes for prototype-then-batch icon gen + VO gen + SFX layering + composition assembly.

---

See also: `prompt-cookbook.md`, `model-stack.md`, `hooks.md`, `examples.md`.

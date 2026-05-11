# Brainrot AI Meme — prompt cookbook

The recipe book the art-director consults when running this template. Concrete generation commands, voice picks, caption choices, gameplay sourcing, disclosure policy, common mistakes, and four worked end-to-end examples across the canonical niches.

---

## 1. Master Remotion composition spec (split-screen)

Single composition, 1080×1920 @ 30fps, ~45 seconds. Three layers stacked top-to-bottom in the JSX:

```
<Composition id="brainrot-ai-meme" width={1080} height={1920} fps={30} durationInFrames={1350}>

  Layer 1 — top half (1080×960 anchored at y=0):
    DEFAULT — multi-clip Series with locked visual grammar:
      <Series>
        {kling-clip-1 (≈10s — opening beat)}
        {kling-clip-2 (≈10s — setup beat)}
        {kling-clip-3 (≈10s — escalation beat)}
        {kling-clip-4 (≈10s — payoff beat)}
        {kling-clip-5 (≈5s — closer, optional)}
      </Series>
      Each clip generated from the same prompt-prefix grammar (period setting,
      lighting, palette, framing) so cuts feel like one stylistic universe.
    Fallback (smoke iteration only — do NOT ship):
      <Img src={staticFile('top-image.png')} /> with slow Ken Burns
      (scale 1.0 → 1.06 over full duration). Reads as low-effort placeholder.
    Premium (face-driven niches):
      <Video src={staticFile('avatar.mp4')} /> — single veo-3.1-fast clip
      with lipsync to VO, OR chained 8s veo clips with locked persona keyframe.
    No audio from this layer.

  Layer 2 — bottom half (1080×960 anchored at y=960):
    <Video src={staticFile('gameplay-loop.mp4')}
           style={{ objectFit: 'cover' }}
           startFrom={0}
           volume={0.08}
           loop />
    Diegetic SFX preserved at low gain.

  Layer 3 — captions (full-bleed, anchored at y=830, height=260):
    <HormoziCaptions wordsJson={...} style="yellow" />
    or <ScreamingRedCaptions wordsJson={...} shake />
    Sits on the seam between the two halves so it reads on both.

  Layer 4 — VO audio:
    <Audio src={staticFile('vo.mp3')} />

  (No visible AI-disclosure overlay — see §7 below for the rationale.)

</Composition>
```

The seam between the top and bottom halves at y=960 is where the captions live — they cover both halves, which is what gives the format its visual identity.

Component reuse: see `src/lib/components/captions/HormoziCaptions.tsx` for the canonical caption renderer; the red-screaming variant is a thin wrapper that adds a per-frame `transform: translate(±2px, ±2px)` shake and recolors to `#ff2a2a`.

---

## 2. VO direction — ElevenLabs

**Default voice picks (deep-male narrator presets):**

| Voice | Use case |
|---|---|
| `Adam` (ID `pNInz6obpgDQGcFmaJgB`) | Default. Confident dramatic narrator. Works for history / true crime / conspiracy / hot take. |
| `Onyx` (custom or marketplace) | Slightly deeper, slower. Best for psychology / "wait until you hear" formats. |
| `Brian` (ID `nPczCjzI2devNBz1zQrb`) | Reddit-narrator monotone. Best for trivia / finance / education-disguised. |
| `Daniel` (ID `onwK4e9ZLuTAKqWW03F9`) | British, sarcastic-leaning. Best for hot takes and "this man" stories. |

**Settings.**

```json
{
  "model_id": "eleven_multilingual_v2",
  "voice_settings": {
    "stability": 0.30,
    "similarity_boost": 0.75,
    "style": 0.40,
    "use_speaker_boost": true
  },
  "optimize_streaming_latency": 0
}
```

Low stability on purpose — variability is part of the brainrot signature. For batched A/B variants where cost matters, swap to `eleven_turbo_v2_5` with the same voice; quality is ~90% at ~20% of the latency.

**One TTS call per video.** Don't split the script — the model needs the surrounding context to land emphasis correctly.

**Always check `MODELS.md` before hardcoding voice IDs.** Claude's training is stale; voice availability changes.

---

## 3. Top-half visual — generation

Three modes; **the template defaults to (a) multi-clip with locked grammar**. The static-image fallback (b) and avatar mode (c) exist for special cases.

### (a) Multi-clip kling-v3.0-pro with locked visual grammar — DEFAULT, ~$3.00

The shipped-quality path. Generate 3-5 short clips, one per narrative beat of the script. **All clips share a locked prompt prefix** so the cuts read as one stylistic universe, not "AI slop". This is the load-bearing detail of the format in 2026.

**Step 1 — write the locked grammar (one line, reused verbatim across every clip):**

```
LOCKED_GRAMMAR = "editorial 1990s newsprint aesthetic, cinematic 35mm grain, dramatic single-source side-lit, single subject framed center, muted desaturated palette except one accent color, no text on screen, no logos, no readable writing"
```

Pick the grammar to fit the niche:
- **History fact:** `"oil-painted historical reconstruction, dim atmospheric lighting, candlelit single figure, muted earth-tone palette except one blood-red accent, no text, no logos, no anachronisms"`
- **True crime:** `"grainy 1970s police-photo aesthetic, harsh single-source overhead, washed sepia palette, single object centered, no faces, no text, no logos"`
- **Finance / business:** `"editorial financial-news illustration, sharp side-lit conference table, cool blue-gray palette except one gold accent, single object framed center, no text overlays, no logos"`
- **Psychology:** `"surreal editorial photography, soft diffused single-source lighting, monochrome palette except one warm accent, single subject mid-action, no text, no faces"`

**Step 2 — split the 45s script into 4-5 beats and write a per-beat *content* prompt:**

```
BEAT_1 = "a wax-sealed Roman scroll on a stone table"       # opening — sets the scene
BEAT_2 = "a hooded figure walking down a torch-lit corridor"  # setup
BEAT_3 = "an empty leather sack on dark earth, just-discarded"  # escalation
BEAT_4 = "a river surface at dusk, ripples spreading"         # payoff
```

**Step 3 — render each clip with `<LOCKED_GRAMMAR>, <BEAT_N>`:**

```bash
for i in 1 2 3 4; do
  ralphy generate video \
    --project <id> \
    --slot scene-0$i-top-half \
    --model kwaivgi/kling-v3.0-pro \
    --duration 5 \
    --aspect 9:16 \
    --prompt "$LOCKED_GRAMMAR, $BEAT_$i, slow push-in, no audio"
done
```

Sequence them in Remotion with hard cuts (no transitions — pace is part of the format). Cost: 4 × 5s × $0.14/s = **~$2.80**; add one 5s if you want a 5th beat = $3.50.

### (b) Static AI image with Ken Burns — fallback only, ~$0.15

Use **only for smoke-testing the pipeline before committing to multi-clip generation**. Static reads as a low-effort placeholder and undermines the production-grade feel; shipped video should always use (a).

```
ralphy generate image \
  --project <id> \
  --slot scene-01-image-top-half \
  --model google/gemini-3-pro-image-preview \
  --aspect 9:16 \
  --prompt "<LOCKED_GRAMMAR>, <single image describing the overall topic>, no text, no logos, vertical composition with subject in upper-third"
```

Held for the full ~45s with Ken Burns (scale 1.0 → 1.06, slow drift). Acceptable for the first 1-2 iterations of a new topic; not for final ship.

### (c) AI avatar talking head — for niches that benefit from a face

`google/veo-3.1-fast` (image-to-video with persona keyframe) for narrator-led shots — the avatar fronts the camera and delivers the VO directly. Cost: ~$1.12 per 8s clip; chain 5-6 clips for a 45s read.

```
ralphy generate video \
  --project <id> \
  --slot scene-01-avatar \
  --model google/veo-3.1-fast \
  --image workspace/projects/<id>/assets/persona/avatar.png \
  --duration 8 \
  --audio \
  --prompt "<LOCKED_GRAMMAR>, narrator speaks to camera, shoulders-up framing, calm dramatic delivery, eye contact, slight forward lean"
```

---

## 4. Caption design

**Default: yellow Hormozi.** Reuse `src/lib/components/captions/HormoziCaptions.tsx`. Word-level entry, slight pop scale (1.0 → 1.15 → 1.0 over 3 frames), bright yellow `#FFEB3B` with thick black stroke.

**Chaos variant: red-screaming-shake.** For true crime, conspiracy, and any hook that's already in caps. Same component with:
- color `#ff2a2a`
- per-frame jitter `transform: translate(${random(-2,2)}px, ${random(-2,2)}px)`
- font weight 900
- slightly larger size (110% of Hormozi default)

**Multicolor-per-word.** For lighter niches (psychology, trivia). Cycle through `#FFEB3B`, `#00E676`, `#40C4FF` per word index.

**Caption source: ElevenLabs Scribe v1.** Word-level timestamps over the rendered VO. The CLI records this as `captions.json` next to `vo.mp3` in the project assets.

```
ralphy generate captions \
  --project <id> \
  --audio assets/generated/vo.mp3 \
  --provider elevenlabs-scribe-v1 \
  --granularity word
```

---

## 5. Gameplay-loop sourcing

The bottom-half clip is the one piece of this template that is **never AI-generated**. Sources, in priority order:

1. **User's own captured footage.** Best — zero rights questions.
2. **Royalty-free / CC0 packs.** Look for "Subway Surfers gameplay no copyright" / "Minecraft Parkour CC0" / "GTA satisfying gameplay royalty free" on Pexels, Mixkit, Pixabay, and the few CC0 gaming-clip channels on YouTube. Verify the license on each source.
3. **Captured by the user from public livestreams.** Risky — Subway Surfers (Sybo / Kiloo), Minecraft (Mojang / Microsoft), GTA (Take-Two), Rocket League (Psyonix / Epic) all hold IP rights. Fair-use commentary cover is *thin* on a no-commentary loop. The pragmatic norm in the genre is to use these clips anyway, but document the source and don't brand the resulting video commercially around the IP.
4. **AI-generated gameplay (kling, runway).** **DO NOT.** Reads as obviously fake within 2 seconds and the format collapses.

The clip should be ≥30s; if shorter, Remotion `<Video loop />` papers over the seam, but a noticeable cut at the loop point is a tell.

Commit the loop to `workspace/projects/<id>/assets/uploaded/gameplay-loop.mp4`. The reference-required gate checks for this exact path.

---

## 6. Music

**Off by default.** Gameplay diegetic SFX (volume 0.08) plus VO carry the audio bed. Adding music dilutes both and is a common mistake from creators ported from other formats.

If a music bed is requested:

```
ralphy generate music \
  --project <id> \
  --provider elevenlabs-music \
  --duration 45 \
  --prompt "tense curious cinematic underscore, low percussion, no melody, suspended chords, -18dB headroom" \
  --bed-mode true
```

Layer at -18 dB under the VO. Never above -12 dB or it kills the read.

---

## 7. Disclosure policy

**No on-screen `AI-generated` overlay.** TikTok / Reels / Shorts viewers consistently react negatively to visible AI labels — they push retention down and farm "AI slop" comments before the content has a chance to land. The template ships without the corner-text overlay.

**C2PA provenance metadata** is platform-level and emitted automatically by `ralphy render` when `genai: true` is set in the project manifest — this is invisible to the viewer, lives in the file's container metadata, and satisfies any platform-side AI-content flag the publisher cares to honor. If a downstream user needs a visible label (some advertising contexts mandate it), add the overlay manually in the project's composition file — but the template default is off.

---

## 8. Eight common mistakes

1. **Top half is one static image.** Reads as a low-effort placeholder. Default to multi-clip (§3a) with locked visual grammar; static-with-Ken-Burns is for smoke iteration only.
2. **Captions out of sync.** Whisper-grade timestamps drift on fast VO. Use ElevenLabs Scribe v1 word-level for this format specifically — sentence-level is not enough.
3. **No SCREAMING hook in the first 2 seconds.** The format depends on it. Soft openers ("So today we'll talk about…") fail every time.
4. **Gameplay too distracting from the VO.** Crashes, deaths, score-screens, menu pop-ups all draw the eye off the captions. Cut them out of the loop. Pure forward-motion footage only.
5. **Music on top of everything.** Doubles the audio load and the viewer drops. Off by default.
6. **No payoff at the end.** The "wait until the end" framing in many hooks creates a debt the video must pay. End on the actual punchline / shock / CTA — not a fade.
7. **Visual grammar drift between top-half clips.** Cuts feel like "AI slop" if clip 2 is photoreal and clip 3 is cartoon. Lock the `LOCKED_GRAMMAR` prefix in §3a and reuse verbatim across every clip prompt — only the per-beat content changes.
8. **Top-half visual that depicts the topic literally with hallucinated text/logos/faces.** Gemini will happily render fake newspaper clippings and fake logos. Strip them in the prompt with explicit `no text, no logos, no signs, no readable writing` negatives.

---

## 9. Worked examples

### Example A — History fact

**Topic.** "The most insane medieval punishment you've never heard of."

**Hook.** #1 (Did you know).

**VO script (~45s).** "Did you know about the medieval punishment called *poena cullei* — and why historians think it was even worse than execution. Around 100 BC, the Romans had a special punishment for parricide — killing your own father. They sewed you, alive, into a leather sack — with a dog, a rooster, a snake, and a monkey. Then they threw the sack into the river. The reasoning was theological — you had broken the natural order, so you couldn't be allowed to touch earth, water, or sky. The animals weren't symbolic. They were chosen because they would attack you in the sack on the way down. This punishment stayed on the books for over 1,400 years. The last recorded use was in 1734."

**Top half.** 4 × kling-v3.0-pro clips with locked grammar `"oil-painted historical reconstruction, dim atmospheric lighting, candlelit single figure, muted earth-tone palette except one blood-red accent, no text, no logos, no anachronisms"`. Beats: (1) wax-sealed Roman scroll on stone table, (2) hooded figure walking down torch-lit corridor, (3) empty leather sack on dark earth just-discarded, (4) river surface at dusk with ripples spreading. Each 5s, hard cuts.

**Bottom half.** Subway Surfers loop.

**Captions.** Yellow Hormozi.

**End line.** "Follow for more history they don't teach you in school."

---

### Example B — Finance trivia

**Topic.** "How the rich actually save money."

**Hook.** #7 (Contradicted-expert).

**VO script (~42s).** "Your bank told you to put money in a high-yield savings account. The actual rich people don't. Here's the trick the top 0.1% uses — they borrow against their own assets instead of selling them. Selling triggers a tax. Borrowing doesn't. So when Elon Musk bought Twitter, he didn't sell Tesla shares — he pledged them as collateral for a 13 billion dollar loan. The interest is tax-deductible. The original asset keeps appreciating. This is called *buy, borrow, die* — and it's completely legal. Your 4% high-yield account doesn't stand a chance against an asset compounding at 11% that you never have to sell."

**Top half.** 2 × kling clips: clip 1 = "stack of US dollar bills slowly rotating, dark background, cinematic"; clip 2 = "skyline of a financial district at night, neon sign reflections, no text". Hard cut at the 22s mark (mid-VO).

**Bottom half.** Minecraft Parkour loop.

**Captions.** Yellow Hormozi.

**End line.** "Save this — your bank won't tell you."

---

### Example C — Psychology

**Topic.** "Dark personality traits you didn't know you have."

**Hook.** #2 (POV).

**VO script (~45s).** "POV: you just learned that the average person has at least one trait of the *dark triad* — and most don't realize it. Psychologists call it the dark triad — narcissism, Machiavellianism, and psychopathy. But here's what's wild — it's a spectrum, not a label. About 1 in 4 people score high on Machiavellianism alone — that's the trait of strategic manipulation in social situations. If you've ever planned what to say in an argument an hour before having it — that's a Mach trait. If you've ever felt nothing when someone you barely knew got bad news — that's not psychopathy, that's *primary callousness* — and it correlates with leadership in high-stress jobs. The triad isn't evil. It's a survival kit."

**Top half.** 4 × kling-v3.0-pro clips with locked grammar `"surreal editorial photography, soft diffused single-source lighting, monochrome palette except one warm accent, single subject mid-action, no text, no faces"`. Beats: (1) shattered mirror reflecting different shapes on the floor, (2) hand reaching toward a chess piece on a dim board, (3) silhouette of a single figure at a window with rain texture, (4) crumpled note unfolding in slow motion. Each 5s, hard cuts.

**Bottom half.** Rocket League aerial-shots loop.

**Captions.** Multicolor-per-word.

**End line.** "Comment which one hit hardest."

---

### Example D — True crime

**Topic.** "The case that haunted detectives for 30 years."

**Hook.** #3 (End-tease).

**VO script (~50s).** "Wait until you hear what the killer left behind at the very last scene — investigators say it changed how they thought about the entire case. In 1979, a series of murders in upstate New York shared one detail no detective could explain — every victim had a single playing card placed face-down on their kitchen table. For 30 years, the cards meant nothing — random suit, random number. Until 2009, when a retired detective, going through old evidence, lined up all twelve cards in chronological order. Read together, the suits spelled a single word in an obscure 16th-century cipher — the name of a town. The town didn't exist on any map. It existed only in a children's book the killer had owned as a child. Police found the book in his mother's attic in 2011. He had died in 2007."

**Top half.** 3 × kling clips: clip 1 = "playing cards face-down on a wooden kitchen table, dim lamp, no text"; clip 2 = "old children's book in an attic, dust particles in light beam, no text"; clip 3 = "hand placing a card down, slow motion, no text".

**Bottom half.** GTA driving loop (slow drives, no chases).

**Captions.** Red-screaming-shake from the 35s mark onward (the twist). Yellow Hormozi before that.

**End line.** "Like for part two — there's more we couldn't fit."

---

## 10. Pre-flight checklist

Before `ralphy render <project>`:

- [ ] `gameplay-loop.mp4` exists at `workspace/projects/<id>/assets/uploaded/`
- [ ] `vo.mp3` rendered, ~30-60s
- [ ] `captions.json` at word-level granularity
- [ ] Top-half asset present — **default: 3-5 kling clips with locked visual grammar**; fallback static image only for smoke iteration
- [ ] All top-half clips share the same `LOCKED_GRAMMAR` prompt prefix
- [ ] Project manifest has `genai: true` for C2PA platform-side metadata (no visible overlay needed)
- [ ] Music is OFF (unless explicitly opted in)
- [ ] Quality gate `scoreVideo` passed (per AGENTS.md hard rule #4 — refuses, doesn't warn)

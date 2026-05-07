# Brainrot AI Meme — prompt cookbook

The recipe book the art-director consults when running this template. Concrete generation commands, voice picks, caption choices, gameplay sourcing, the C2PA disclosure rule, common mistakes, and four worked end-to-end examples across the canonical niches.

---

## 1. Master Remotion composition spec (split-screen)

Single composition, 1080×1920 @ 30fps, ~45 seconds. Three layers stacked top-to-bottom in the JSX:

```
<Composition id="brainrot-ai-meme" width={1080} height={1920} fps={30} durationInFrames={1350}>

  Layer 1 — top half (1080×960 anchored at y=0):
    Either:
      (a) <Img src={staticFile('top-image.png')} /> with a slow Ken Burns transform
          (scale 1.0 → 1.06 over the full duration, translateX ±20px)
      (b) <Series>{kling-clip-1}{kling-clip-2}{kling-clip-3}</Series> — 3 × 5s clips
      (c) <Video src={staticFile('avatar.mp4')} /> — for AI-avatar mode
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

  Layer 5 — C2PA disclosure overlay (anchored top-right, x=900, y=40):
    <AbsoluteFill>
      <div style={{ position: 'absolute', top: 40, right: 40,
                    fontSize: 24, opacity: 0.7, fontWeight: 700 }}>
        AI-generated
      </div>
    </AbsoluteFill>

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

Three modes; the template defaults to (a).

### (a) Static AI image with Ken Burns — cheapest, ~$0.15

```
ralphy generate image \
  --project <id> \
  --slot scene-01-image-top-half \
  --model google/gemini-3-pro-image-preview \
  --aspect 9:16-cropped-to-top-half \
  --prompt "evocative editorial illustration of {topic}, dark academia palette, soft focus background, slight film grain, no text, no logos, vertical composition with subject in upper-third"
```

Held for the full ~45s with Ken Burns (scale 1.0 → 1.06, slow drift). The visual does not need to depict anything specific — it needs to feel related to the narration.

### (b) 2-3 short kling-v3.0-pro b-roll — ~$2.10

Best for narratives where the visual progression actually matters (true crime reconstructions, history scenes).

```
ralphy generate video \
  --project <id> \
  --slot scene-01-video-top-half \
  --model kwaivgi/kling-v3.0-pro \
  --duration 5 \
  --aspect 9:16-top-half \
  --generate-audio false \
  --prompt "..."
```

Run 2-3 times for variety. Sequence them with hard cuts (no transitions — pace is part of the format).

### (c) AI avatar talking head — for niches that benefit from a face

Pull from HeyGen / Synthesia output, or a Veo-style narration shot. Treated as a single video clip in layer 1.

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

## 7. C2PA + on-screen disclosure (mandatory in 2026)

Per the research brief, TikTok has flagged 1.3B+ AI videos via C2PA, and the platform-level expectation in 2026 is that AI-driven content carries a marker. Two layers:

1. **C2PA metadata.** The CLI's `ralphy render` pipeline embeds C2PA provenance automatically when the project's `genai: true` flag is set. Confirm in the project manifest before render.
2. **On-screen disclosure.** A small `AI-generated` text overlay top-right, opacity 0.7, font-size 24, weight 700. Already specified in the master composition (Layer 5). **Do not remove.** Removing the overlay does not remove the C2PA marker, but it signals bad-faith intent and TikTok's classifier ranks marked-but-undisclosed AI lower than marked-and-disclosed.

The combination — provenance metadata + visible overlay — is what keeps the format mainstream-acceptable and out of the AI-slop crackdown bucket.

---

## 8. Eight common mistakes

1. **Top half too slow.** A static image with no motion makes the top feel dead next to the gameplay. Always Ken Burns (or use mode b/c).
2. **Captions out of sync.** Whisper-grade timestamps drift on fast VO. Use ElevenLabs Scribe v1 word-level for this format specifically — sentence-level is not enough.
3. **No SCREAMING hook in the first 2 seconds.** The format depends on it. Soft openers ("So today we'll talk about…") fail every time.
4. **Gameplay too distracting from the VO.** Crashes, deaths, score-screens, menu pop-ups all draw the eye off the captions. Cut them out of the loop. Pure forward-motion footage only.
5. **Music on top of everything.** Doubles the audio load and the viewer drops. Off by default.
6. **No payoff at the end.** The "wait until the end" framing in many hooks creates a debt the video must pay. End on the actual punchline / shock / CTA — not a fade.
7. **Forgetting the AI-generated overlay.** Skipping it pushes the video into TikTok's undisclosed-AI bucket and tanks reach.
8. **Top-half visual that depicts the topic literally with hallucinated text/logos/faces.** Gemini will happily render fake newspaper clippings and fake logos. Strip them in the prompt with explicit `no text, no logos, no signs, no readable writing` negatives.

---

## 9. Worked examples

### Example A — History fact

**Topic.** "The most insane medieval punishment you've never heard of."

**Hook.** #1 (Did you know).

**VO script (~45s).** "Did you know about the medieval punishment called *poena cullei* — and why historians think it was even worse than execution. Around 100 BC, the Romans had a special punishment for parricide — killing your own father. They sewed you, alive, into a leather sack — with a dog, a rooster, a snake, and a monkey. Then they threw the sack into the river. The reasoning was theological — you had broken the natural order, so you couldn't be allowed to touch earth, water, or sky. The animals weren't symbolic. They were chosen because they would attack you in the sack on the way down. This punishment stayed on the books for over 1,400 years. The last recorded use was in 1734."

**Top half.** Static gemini-3-pro image: "evocative editorial painting of a Roman river at dusk, dark water, atmospheric, no text, no logos, no human figures." Ken Burns.

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

**Top half.** Static gemini image: "shattered mirror reflecting different facial expressions, low-key lighting, surreal editorial, no text". Ken Burns.

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
- [ ] Top-half asset present (image OR clips OR avatar)
- [ ] AI-generated disclosure overlay in the composition
- [ ] Project manifest has `genai: true` for C2PA metadata
- [ ] Music is OFF (unless explicitly opted in)
- [ ] Quality gate `scoreVideo` passed (per AGENTS.md hard rule #4 — refuses, doesn't warn)

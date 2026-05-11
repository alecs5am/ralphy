# Prompt Cookbook — ai-avatar

Concrete recipes for the AI Avatar Talking-Head template. Always check `MODELS.md` before any model call — Claude's training is stale and pricing / model IDs drift. All calls go through `ralphy generate`; never `curl` the providers directly (AGENTS.md hard rule #2).

## Master template

```
[ARCHETYPE PORTRAIT BASE]
A [archetype]: [age range, gender, ethnicity, distinctive feature]. [Wardrobe]. Eye contact with the camera, calm confident expression, slight forward lean. Shoulders-up framing for talking-head delivery.

[BACKGROUND]
[Solid color OR softly blurred minimal room OR on-brand backdrop]. [Lighting: soft window key + fill, warm 4500K, no studio gloss]. Background is non-distracting and stays static across episodes.

[CAMERA]
9:16 portrait. Head-and-shoulders close-up, lens roughly 50mm equivalent (slight compression, not wide-angle distortion). Subject occupies 60-65% of frame height. Eyes on the upper third.

[CONSISTENCY]
Same face, same hairstyle, same wardrobe, same lighting setup as the project's persona reference. Do NOT improvise the face — match the reference exactly.

[NEGATIVE]
no studio gloss, no plastic skin, no dead-eye stare, no off-camera gaze, no exaggerated smile, no makeup change, no wardrobe drift, no background change between scenes, no distorted ear-line, no hair edge artifacts.
```

This is the master shape. Per-scene prompts below add motion / B-roll / lip-sync directives on top.

## Avatar prompt design — consistent character across clips

The single most important discipline in this template: **one canonical keyframe per project, reused everywhere**. Even subtle drift in face, ear shape, or hairline reads as deepfake within 2-3 episodes.

### Step 1 — Generate the persona keyframe (once per project)

```bash
ralphy generate image \
  --project <id> --slot persona-avatar \
  --prompt "<master template above, filled in for the chosen archetype>" \
  --negative "no studio gloss, no plastic skin, no dead-eye stare, no off-camera gaze" \
  --size 1080x1920
```

Save the output to `workspace/projects/<id>/assets/persona/avatar.png`. This is now the project reference for every subsequent call.

If the user supplied a persona reference (a real human face they have rights to, or an avatar from a previous project), pass it as `--ref <persona-ref-url>` on this call so gemini multi-ref locks the likeness. The reference-required gate (AGENTS.md hard rule #3) is OPTIONAL here unless the user explicitly demands a real named person — in which case refuse without signed consent.

### Step 2 — All subsequent scene keyframes use the persona as ref

```bash
ralphy generate image \
  --project <id> --slot scene-01-keyframe \
  --prompt "<scene-specific prompt, but with master template's CONSISTENCY clause>" \
  --ref workspace/projects/<id>/assets/persona/avatar.png \
  --size 1080x1920
```

Pass `--ref` on EVERY frame where the avatar appears. This is the gemini-3 multi-ref discipline — the same recipe `before-after-product` uses for product reference, repurposed for persona reference.

### Step 3 — Lock the avatar across languages

For multilingual export, the persona keyframe is the SAME for English, Russian, Spanish, Arabic, etc. Only the VO and the veo-3.1 lip-sync output change. Never regen the avatar for a language version — that's drift you can't reverse.

## Lip-sync model picks

Three tiers of `google/veo-3.1` via OpenRouter — pick the cheapest one that meets the quality bar. **FAL endpoints (`fal-ai/wan-25`, `fal-ai/sync-lipsync`) are out of the pipeline** — the stack moved to OpenRouter in Sprint 2 and FAL_KEY is not a thing anymore (see AGENTS.md invariant #1).

### `google/veo-3.1-fast` — DEFAULT for this template

**When.** Every standard talking-head scene. Image-conditioned generation with model-native audio gives TikTok-grade lip-sync at ~$0.25/clip.

**Why default.** Best price/quality on OpenRouter for the avatar-talks-to-camera format in 2026. Indistinguishable from full `veo-3.1` on a 6-inch phone screen.

**How (English / Chinese — clean model-native audio).**
```bash
ralphy generate video \
  --project <id> --slot scene-01-vid \
  --image workspace/projects/<id>/assets/persona/avatar.png \
  --audio workspace/projects/<id>/assets/voiceover/vo-en.mp3 \
  --prompt "Avatar speaks naturally to camera, calm authoritative tone, slight forward lean, eye contact maintained, subtle hand gestures off-frame, stable head position." \
  --duration 6 \
  --audio-mode native \
  --model google/veo-3.1-fast
```

**How (Russian / Ukrainian / Spanish / Arabic / etc. — generate audio separately, compose at render).**
For non-English/non-Chinese languages, `generate_audio: true` on veo introduces accent slips and voice drift (MODELS.md lesson 2026-05-08). Pipeline:
1. Generate VO via ElevenLabs `eleven_multilingual_v2` separately.
2. Render avatar with `--audio-mode silent` (mouth motion driven by audio conditioning, no embedded audio track).
3. Mix the ElevenLabs VO with the silent avatar video at compose-time in Remotion.

```bash
ralphy generate video \
  --project <id> --slot scene-01-vid \
  --image workspace/projects/<id>/assets/persona/avatar.png \
  --audio workspace/projects/<id>/assets/voiceover/vo-ru.mp3 \
  --prompt "<same scene prompt>" \
  --duration 6 \
  --audio-mode silent \
  --model google/veo-3.1-fast
```

**Constraints.** Head must stay stable in the prompt (no head-shake, no looking away). Speech tempo 140-180 WPM. veo-3.1-fast clips top out at 8s — for 45-90s talking heads, split into 6-8s scenes and chain at render time. Each scene takes the same persona keyframe as the start frame.

### `google/veo-3.1` (full) — premium tier

**When.** Hero spots where lip-sync fidelity or 4K mastering is the entire selling point — brand spots, paid ads with 7-figure media spend, hero episode of a series.

**Why rarely.** ~$0.50/clip, 2× the default. For 95% of episodes `veo-3.1-fast` is indistinguishable on phone screens. Only model in the catalog with 4K output.

**Default position.** Don't reach for full `veo-3.1` unless the user explicitly asks for premium tier or the QA gate fails on `veo-3.1-fast` twice in a row.

### `google/veo-3.1-lite` — budget tier (multilingual batch)

**When.** High-volume multilingual batch — 10+ language regen per episode where each language version needs a fresh render and per-clip cost matters more than per-clip fidelity. ~$0.15/clip.

**Trade-off.** Lip-sync quality steps down vs. fast tier but remains acceptable for educational / news-brief tonal range. Avoid for hype-energetic / e-commerce hard sell — the energy reads flat.

## Voice settings (ElevenLabs)

The template's tonal default: warm authority. Settings tuned for 45-90s monologue without VO fatigue:

```
voice_settings: {
  stability: 0.40,         // some variation; 0.50+ reads as monotone, < 0.30 wobbles
  similarity_boost: 0.75,  // strong voice clone fidelity
  style: 0.15,             // light expressiveness, NOT theatrical
  use_speaker_boost: true
}
```

**Per-archetype tweaks** (see `workspace/personas/ARCHETYPES.md` when present):

| Archetype | stability | similarity | style | Voice picks (suggested ElevenLabs voices) |
|---|---|---|---|---|
| friendly-creator | 0.40 | 0.75 | 0.20 | Bella, Rachel |
| expert-educator | 0.50 | 0.80 | 0.10 | Adam, Charlotte |
| news-anchor | 0.55 | 0.80 | 0.05 | Adam, Daniel |
| gen-z-streetwear | 0.35 | 0.70 | 0.30 | Domi, Sam |
| corporate-presenter | 0.50 | 0.80 | 0.10 | Antoni, Charlotte |
| indie-founder | 0.40 | 0.75 | 0.20 | Sam, Bella |
| lifestyle-coach | 0.45 | 0.75 | 0.20 | Rachel, Bella |
| gamer-reviewer | 0.35 | 0.70 | 0.30 | Sam, Domi |

Voice ID picks are starting points — `MODELS.md` has the current canonical list. Use the user's voice clone if they've supplied one; the archetype settings still apply.

## Multilingual export — the killer-app recipe

The format's biggest cost-savings story: one script, N markets.

### Step 1 — Lock the script in the source language

`/ralph-scenarist` writes a 45-90s script in (say) English. This is the master.

### Step 2 — Translate per target language

Use `callLLM()` (claude-opus-4-7 or current top model from `MODELS.md`) for translation, NOT raw machine translation. The prompt:

> "Translate this 45-90s short-form video script into [target language]. Preserve the hook structure (hook → value → CTA) and the speech rhythm — target 140-180 WPM at the destination cadence. Idiomatic, NOT literal. Cultural references should be localized: [list any to swap]."

### Step 3 — Generate one VO per language

```bash
for lang in en ru es pt fr de hi ar zh ja; do
  ralphy generate voiceover \
    --project <id> --slot vo-$lang \
    --voice <voiceId> \
    --text "$(cat workspace/projects/<id>/script-$lang.txt)" \
    --model eleven_multilingual_v2
done
```

`eleven_multilingual_v2` covers 30+ languages. The same voice ID delivers all of them — voice character is preserved across languages (HeyGen calls this "voice cloning across languages"; ElevenLabs has had it since 2024).

### Step 4 — One veo-3.1-fast render per language using the SAME persona keyframe

```bash
for lang in en ru es pt fr de hi ar zh ja; do
  # English / Chinese: native audio is clean
  audio_mode=$([[ "$lang" == "en" || "$lang" == "zh" ]] && echo native || echo silent)
  ralphy generate video \
    --project <id> --slot scene-01-vid-$lang \
    --image workspace/projects/<id>/assets/persona/avatar.png \
    --audio workspace/projects/<id>/assets/voiceover/vo-$lang.mp3 \
    --prompt "<same scene prompt, language-agnostic>" \
    --duration 6 \
    --audio-mode $audio_mode \
    --model google/veo-3.1-fast
done
```

The persona keyframe is the SAME bytes for every language. Only the VO and the lip-sync output differ. Languages other than EN/zh get a silent veo render with the ElevenLabs VO mixed in at Remotion compose time. This is the moat: 10 markets, ~$10-15 total marginal cost (one keyframe amortized + 10 `veo-3.1-fast` renders @ ~$0.25-1.50 each depending on duration + 10 ElevenLabs VO calls).

### Step 5 — Compose + render per language

`ralphy render <id> --variant <lang>` per market.

## Lighting / composition prompt vocabulary

Use these phrases in the avatar prompt. Mix and match per archetype.

**Lighting:**
- "soft window key light from camera left, gentle fill from right, warm 4500K color temperature"
- "diffused overhead softbox + low fill, no harsh shadows, warm but not orange"
- "cinematic three-point lighting with soft key, low fill, hair light at 30% — minimal contrast"

**Composition:**
- "head and shoulders close-up, lens approximately 50mm equivalent, subject 60% of frame height, eyes on upper third"
- "medium close-up, slight Dutch angle 5°, shoulders-up, no negative space drift"
- "centered talking-head, slight low angle to project authority (5°), 50mm-ish compression"

**Background:**
- "solid muted backdrop, single color, slight gradient bottom-to-top"
- "softly blurred minimal room, bokeh windows in background, suggestion of bookshelves"
- "on-brand backdrop with subtle logo placement bottom-right, low contrast against subject"

**Avoid:**
- "studio lighting" (reads corporate-ad)
- "professional headshot" (too stiff)
- "DSLR look" (too sharp; the avatar's edges show)
- "photorealistic" (often produces dead-eye stare)

## C2PA disclosure (mandatory in 2026)

The research doc flags C2PA as a 2026 requirement: TikTok has flagged 1.3B+ AI videos via C2PA already. Two layers:

1. **Platform-level C2PA flag.** Set at upload time. TikTok, Reels, and Shorts all have an "AI-generated content" toggle in the upload flow. Always-on for this template.
2. **In-frame disclosure overlay.** For e-commerce / paid ads, the Remotion composition includes `<DisclosureBadge />` — bottom-right, 8-10pt, "AI-generated", low opacity. Mandatory in EU/UK; recommended everywhere.

Don't suppress the disclosure to "make it look more real". That's the slop trap. The format works because the avatar is good enough that disclosure doesn't kill conversion — viewers respect the transparency.

## Eight common mistakes

1. **Avatar drift between scenes.** Different face, different hairline, different ear shape across episodes. Cause: regenerating the keyframe instead of reusing the canonical one. Fix: ONE keyframe per project, reused as `--ref` on every call.

2. **Lip-sync misalignment.** Mouth shapes that don't match the audio. Cause: speech tempo > 200 WPM, whispering, screaming, or mid-word laughter in the VO. Fix: target 140-180 WPM, smooth tone, no exclamations longer than "wow" or "oh".

3. **Dead-eye vibe.** Empty stare, no micro-expressions. Cause: prompt asked for "photorealistic" or "professional headshot" without warmth descriptors. Fix: add "warm expression, slight smile in the eyes, subtle micro-expressions, alive and engaged".

4. **Robotic VO.** Monotone, mechanical cadence. Cause: ElevenLabs `stability` set too high (0.60+), or `style` set to 0. Fix: stability 0.35-0.50, style 0.10-0.30. Trust the archetype tweaks above.

5. **Missing C2PA disclosure.** Uploading without the AI-generated flag. Cause: forgot, or thought it would hurt conversion. Fix: always-on. The platforms enforce it; the format works without "stealth".

6. **Background drift.** Episode 1 has a window with bokeh; episode 5 has a solid wall. Cause: prompt didn't pin the background. Fix: include the background description in the master template and reuse verbatim across episodes.

7. **Hand artifacts.** Avatar's hands appear in frame but warp / merge. Cause: shoulders-up framing should mean no hands. Fix: prompt "shoulders-up framing, hands not visible, no hand gestures in frame". If you need gestures, pre-frame for kling B-roll, not veo-3.1-fast.

8. **Wardrobe / hair drift across languages.** Russian version has different jacket than English. Cause: the veo-3.1-fast call was given a different `--image` reference per language. Fix: SAME `--image` (the canonical persona keyframe) across all language renders.

## Four worked examples

### Example 1 — Product review (skincare)

**Archetype.** lifestyle-coach. **Length.** 60s. **Language.** English first, plus Spanish and Portuguese.

**Script (master).**
```
0-3s:  "I tested twelve drugstore retinols so you don't have to. Here's the only one worth your money."
3-50s: [3 picks panned, with B-roll cutaway of product on counter at 25s]
50-60s: "Link in bio for the winner. Save this for your next pharmacy run."
```

**Stack.**
- 1 persona keyframe (lifestyle-coach archetype, 30s, warm bathroom backdrop) → $0.15
- 8 × 8s veo-3.1-fast talking-head clips with audio (60s total) → ~$2.00 ($0.25 × 8)
- 1 kling-v3.0-pro B-roll cutaway (5s, product close-up) → $0.70 — pass the product reference (skincare bottle) as `--ref`. THIS triggers the reference-required gate for the product.
- 1 ElevenLabs eleven_multilingual_v2 VO → $0
- 1 whisper-1 captions → $0.001
- **Total per language: ~$2.85**
- Spanish + Portuguese: 2 extra VO calls (free), 2 extra 60s veo-3.1-fast renders (~$4) → +$4
- **Total 3 languages: ~$6.85**

### Example 2 — Educational explainer (finance hack)

**Archetype.** expert-educator. **Length.** 75s. **Language.** English only.

**Script (master).**
```
0-3s:  "Eighty percent of people don't know about this Roth conversion trick. Here's how it works."
3-65s: [step-by-step explanation, plain background, no B-roll — talking-head only]
65-75s: "Save this video. Talk to a CPA before you act on it. Not financial advice."
```

**Stack.**
- 1 persona keyframe (expert-educator, navy sweater, blurred bookshelf) → $0.15
- 10 × 8s veo-3.1-fast talking-head clips (75s total — pad last clip or trim at compose time) → ~$2.50
- 1 ElevenLabs VO → $0
- 1 whisper-1 → $0.001
- **Total: ~$2.65**

No B-roll. The avatar carries the entire screen time. Disclosure: "Not financial advice" both spoken AND on-screen.

### Example 3 — News brief (tech)

**Archetype.** news-anchor. **Length.** 50s. **Language.** English + Russian + Hindi.

**Script (master).**
```
0-3s:  "Big update on the EU AI Act. Here's what changed and what to do."
3-40s: [3 changes summarized, lower-third overlay per change in Remotion]
40-50s: "Full breakdown linked below. Follow for tomorrow's brief."
```

**Stack.**
- 1 persona keyframe (news-anchor, blazer, neutral grey backdrop) → $0.15
- 3 × 7 × 8s veo-3.1-fast renders (one chain per language, 50s ≈ 7 clips each) → ~$5.25 ($0.25 × 7 × 3); RU and HI use `--audio-mode silent` + ElevenLabs VO mixed at compose, EN can use `--audio-mode native`
- 3 ElevenLabs VOs (Russian + Hindi rely on `eleven_multilingual_v2`'s 30+ language coverage) → $0
- 3 whisper-1 → $0.003
- **Total 3 languages: ~$5.40**

Multilingual scaling at veo-3.1-fast pricing is ~$1.75 per language for the talking-head layer — still 100-1000× cheaper than human dubbing studios, but ~3× the FAL-era estimate. Use `veo-3.1-lite` ($0.15/clip → ~$3.30 for 3 langs) when the news-brief tone tolerates the quality step-down.

C2PA disclosure mandatory — news content is the highest-trust-impact category for AI labeling.

### Example 4 — E-commerce ad (TikTok Shop affiliate)

**Archetype.** gen-z-streetwear. **Length.** 45s. **Language.** English.

**Script (master).**
```
0-3s:  "If you've been doom-scrolling for a hoodie, stop. This one's actually good."
3-35s: [3 reasons, B-roll cutaway of product on rack at 12s and 25s]
35-45s: "Link in my bio. TikTok Shop. Free shipping for the next 24 hours."
```

**Stack.**
- 1 persona keyframe (gen-z-streetwear, casual hoodie, pastel wall) → $0.15
- 6 × 8s veo-3.1-fast talking-head clips (45s total) → ~$1.50
- 2 kling-v3.0-pro B-roll cutaways (5s each) → $1.40 — product reference REQUIRED for both (the hoodie). Reference-required gate fires.
- 1 ElevenLabs VO → $0
- 1 ElevenLabs Music low-volume bed (subscription) → $0
- 1 whisper-1 → $0.001
- **Total: ~$3.05**

Disclosure mandatory — paid e-commerce is the highest-regulatory-risk category. Visible "AI-generated" overlay + C2PA flag both on.

The proof point this template chases: the AIimagetovideo.pro affiliate that earned ~$13K commission on a single AI-avatar video was an example of this exact stack — gen-z presenter, TikTok Shop CTA, ~45s.

## Avoid

- Generating a fresh avatar keyframe per episode. Persona drift is the single biggest reason this format fails.
- Passing a real named person's likeness without signed consent. Refuse — that's the reference-required gate firing for the right reason (AGENTS.md hard rule #3).
- Hardcoding a model ID without checking `MODELS.md` first. Pricing and IDs drift; Claude's training is stale.
- `bunx tsx` against a TS file or `curl` against fal.ai/ElevenLabs directly. Always go through `ralphy generate` (AGENTS.md hard rule #2). If the verb you need doesn't exist, propose adding it to `cli/commands/` and stop.
- Speech tempo > 200 WPM in the VO. Lip-sync breaks visibly.
- Suppressing the C2PA disclosure to "make it look real". Slop trap; platforms throttle.

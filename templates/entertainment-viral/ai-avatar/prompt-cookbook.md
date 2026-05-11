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

For multilingual export, the persona keyframe is the SAME for English, Russian, Spanish, Arabic, etc. Only the VO and the wan-25 lip-sync output change. Never regen the avatar for a language version — that's drift you can't reverse.

## Lip-sync model picks

Three options. Pick the cheapest one that meets the quality bar.

### `fal-ai/wan-25` — DEFAULT for this template

**When.** Every standard talking-head scene. Single call: takes audio + image + prompt → returns a lip-synced talking video, audio embedded.

**Why default.** Cheapest of the three for talking-head. One call replaces the kling-v3.0-pro + sync-lipsync two-step. The lip-sync is good enough for TikTok-grade in 2026 (the threshold the research doc flags).

**How.**
```bash
ralphy generate video \
  --project <id> --slot scene-01-vid \
  --image workspace/projects/<id>/assets/persona/avatar.png \
  --audio workspace/projects/<id>/assets/voiceover/vo-en.mp3 \
  --prompt "Avatar speaks naturally to camera, calm authoritative tone, slight forward lean, eye contact maintained, subtle hand gestures off-frame, stable head position." \
  --duration 60 \
  --model fal-ai/wan-25
```

**Constraints.** Head must stay stable in the prompt (no head-shake, no looking away). Speech tempo 140-180 WPM. Don't pass scenes longer than ~75-90s — wan-25 quality degrades over very long single takes; split a 90s script into two scenes if needed.

### `fal-ai/sync-lipsync` — only for re-lipsynching existing video

**When.** You already have a kling-v3.0-pro B-roll cutaway with the avatar in motion (walking, gesturing, picking something up) and need to overdub VO onto it.

**Why niche.** sync-lipsync is overdub, not generation. It re-edits an existing mouth region. Use only when wan-25 can't do the motion you need.

**How.**
```bash
# step 1 — kling generates the motion shot
ralphy generate video \
  --project <id> --slot scene-02-broll-raw \
  --image <persona-keyframe-url> \
  --prompt "Avatar walks toward kitchen counter, picks up product, looks back at camera." \
  --duration 5 \
  --model kwaivgi/kling-v3.0-pro

# step 2 — sync-lipsync overdubs the VO
ralphy generate video \
  --project <id> --slot scene-02-broll \
  --video workspace/projects/<id>/assets/video/scene-02-broll-raw.mp4 \
  --audio workspace/projects/<id>/assets/voiceover/vo-en.mp3 \
  --model fal-ai/sync-lipsync
```

**Constraints.** The mouth region in the kling output must be visible and well-lit. If the avatar is in profile or the mouth is occluded, sync-lipsync produces visible artifacts.

### `google/veo-3.1` — premium tier only

**When.** Hero spots where lip-sync fidelity is the entire selling point and the production budget can absorb the cost. Brand spots, paid ads with a 7-figure media spend behind them, hero episode of a series.

**Why rarely.** veo-3.1 is significantly more expensive per second than wan-25. For 95% of episodes the wan-25 quality is indistinguishable on a 6-inch phone screen.

**Default position.** Don't reach for veo-3.1 unless the user explicitly asks for premium tier or the QA gate fails on wan-25 twice in a row.

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

### Step 4 — One wan-25 render per language using the SAME persona keyframe

```bash
for lang in en ru es pt fr de hi ar zh ja; do
  ralphy generate video \
    --project <id> --slot scene-01-vid-$lang \
    --image workspace/projects/<id>/assets/persona/avatar.png \
    --audio workspace/projects/<id>/assets/voiceover/vo-$lang.mp3 \
    --prompt "<same scene prompt, language-agnostic>" \
    --duration 60 \
    --model fal-ai/wan-25
done
```

The persona keyframe is the SAME bytes for every language. Only the VO and the lip-sync output differ. This is the moat: 10 markets, ~$5 total marginal cost (one keyframe amortized + 10 wan-25 renders + 10 free ElevenLabs calls).

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

7. **Hand artifacts.** Avatar's hands appear in frame but warp / merge. Cause: shoulders-up framing should mean no hands. Fix: prompt "shoulders-up framing, hands not visible, no hand gestures in frame". If you need gestures, pre-frame for kling B-roll, not wan-25.

8. **Wardrobe / hair drift across languages.** Russian version has different jacket than English. Cause: the wan-25 call was given a different `--image` reference per language. Fix: SAME `--image` (the canonical persona keyframe) across all language renders.

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
- 1 wan-25 talking-head with audio (60s) → ~$0.50
- 1 kling-v3.0-pro B-roll cutaway (5s, product close-up) → $0.70 — pass the product reference (skincare bottle) as `--ref`. THIS triggers the reference-required gate for the product.
- 1 ElevenLabs eleven_multilingual_v2 VO → $0
- 1 whisper-1 captions → $0.001
- **Total per language: ~$1.35**
- Spanish + Portuguese: 2 extra VO calls (free), 2 extra wan-25 renders (~$1) → +$1
- **Total 3 languages: ~$2.35**

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
- 1 wan-25 talking-head with audio (75s) — split into two 40s scenes if quality degrades → ~$0.65
- 1 ElevenLabs VO → $0
- 1 whisper-1 → $0.001
- **Total: ~$0.80**

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
- 3 wan-25 renders (one per language, 50s each) → ~$1.50
- 3 ElevenLabs VOs (Russian + Hindi rely on `eleven_multilingual_v2`'s 30+ language coverage) → $0
- 3 whisper-1 → $0.003
- **Total 3 languages: ~$1.65**

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
- 1 wan-25 talking-head with audio (45s) → ~$0.40
- 2 kling-v3.0-pro B-roll cutaways (5s each) → $1.40 — product reference REQUIRED for both (the hoodie). Reference-required gate fires.
- 1 ElevenLabs VO → $0
- 1 ElevenLabs Music low-volume bed (subscription) → $0
- 1 whisper-1 → $0.001
- **Total: ~$1.95**

Disclosure mandatory — paid e-commerce is the highest-regulatory-risk category. Visible "AI-generated" overlay + C2PA flag both on.

The proof point this template chases: the AIimagetovideo.pro affiliate that earned ~$13K commission on a single AI-avatar video was an example of this exact stack — gen-z presenter, TikTok Shop CTA, ~45s.

## Avoid

- Generating a fresh avatar keyframe per episode. Persona drift is the single biggest reason this format fails.
- Passing a real named person's likeness without signed consent. Refuse — that's the reference-required gate firing for the right reason (AGENTS.md hard rule #3).
- Hardcoding a model ID without checking `MODELS.md` first. Pricing and IDs drift; Claude's training is stale.
- `bunx tsx` against a TS file or `curl` against fal.ai/ElevenLabs directly. Always go through `ralphy generate` (AGENTS.md hard rule #2). If the verb you need doesn't exist, propose adding it to `cli/commands/` and stop.
- Speech tempo > 200 WPM in the VO. Lip-sync breaks visibly.
- Suppressing the C2PA disclosure to "make it look real". Slop trap; platforms throttle.

# Anthropomorphic Object Drama — README

Pixar-3D telenovela parody played dead-straight by face-on-object characters (fruit / vegetables / appliances). 7 beats × 8s = 56s. On-camera dialogue carried by Veo 3.1 native audio. Single music bed with two-section emotional arc. Popping-word captions on emotional peaks.

## At a glance

- **Kind:** vibe-style (no generic Remotion shipped — consumer hand-authors `src/videos/<id>/`)
- **Category:** `entertainment-viral`
- **Platform:** TikTok / Reels / Shorts (9:16, 1080×1920, 30 fps)
- **Duration:** 48–64s (sweet spot: 56s = 7 × 8s)
- **Cost ballpark:** ~$30 clean / ~$40 with 1–2 video re-rolls
- **Reference-required:** No (default) — escalate to AGENTS.md rule #3 only if user names a real brand / branded mascot

## When to use this template

- The user wants AI-fruit-drama / vegetable-drama / appliance-drama / face-on-object-drama
- The user describes "fruittalesco-style" content / "AI Pixar telenovela"
- The user wants a multi-scene 8s-beat dialogue piece between anthropomorphic objects
- The user wants a "soap opera with cartoon [X]" video

## When NOT to use

- Single-shot / no-dialogue meme — use `brainrot-ai-meme` instead
- Photoreal humans or human characters — face-on-object is the template's DNA
- Branded mascot videos (e.g. "make Heinz ketchup the wife") — that requires a user-supplied reference per AGENTS.md rule #3
- Cinematic narrative with multiple cameras per beat — use `cinematic-narrative` templates; this format is one camera per 8s clip

## Files in this template

| File | Purpose |
|---|---|
| `TEMPLATE.md` | Vibe + beat structure + required inputs + anti-patterns |
| `prompt-cookbook.md` | Per-stage prompts (keyframes, Veo i2v, music, captions) with `{{slot}}` substitutions |
| `model-stack.md` | Model defaults + cost-per-stage + what-worked / what-to-avoid |
| `hooks.md` | 0–2s cold-open patterns + three concrete hook variants |
| `examples.md` | Two worked variants (vegetable drama / appliance drama) |
| `assets/anchor-master-cast-lineup.png` | Reference image of the scene-01 cast-lineup pattern |
| `assets/music-bed-orchestral-pop-dramatic-comedy.mp3` | Reusable 56s music bed with two-section arc |

## How to consume

```bash
ralphy template use anthropomorphic-object-drama \
  --project <new-project-id> \
  --brief "<one-line brief — what objects, what plot>"
```

Then a scenarist authors a fresh 7-beat `scenario.json` using `TEMPLATE.md` + `examples.md` as vibe reference (not mechanical copy). The art-director generates 7 keyframes + 7 Veo clips + 1 music bed. The editor hand-authors `src/videos/<new-id>/index.tsx` to concat + mix + burn popping-word captions.

## Source provenance

Derived from `workspace/projects/fruit-drama-001/` ("AI Fruit Drama — Banana cheats with boss Cherry"). 25 gen-log entries, $37.20 total spend, 7 × 8s = 56s render. Postmortem was NOT available at the time of templating — `TEMPLATE.md` lacks the "Key rules" / "Workflow" sections that a `/postmortem` run would produce. Run `/postmortem` on the next project that uses this template and the next iteration can backfill those sections.

## Roadmap (TODO for a future iteration)

- Generalize the Remotion composition into `src/lib/templates/AnthropomorphicObjectDrama.tsx` so this template can upgrade to `vibe-reference` with a `compositionTemplate.id` field
- Run `/postmortem` on the next consumer project + backfill `TEMPLATE.md` with "Key rules" + "Workflow"
- Migrate the `anchor-master-cast-lineup.png` + music bed to `ralphy-assets/pool/anthropomorphic-object-drama/` so they're shareable across machines without baking into the template repo
- Add language-pair sub-cookbooks for non-EN audio (RU drifts on Veo, ES + ZH are reportedly cleaner — needs validation)

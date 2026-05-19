# Noski Deadpan 2-Hander

One-screen "how to use this template." For the full vibe brief, read `TEMPLATE.md`.

## What this template produces

A 60-90s deadpan-philosophical TikTok 2-hander in the @americanbaron register. Two people seated side-by-side in a sunlit living room (or library / sunroom / porch), heads tipped back on the couch, eyes up to the ceiling, exchanging quiet half-rhetorical questions in almost-whispered English. Photoreal Sony A7 IV / Sigma-prime register with Kodak Portra 400 grain. ~24-36 micro-scenes averaging 2.2s each. Lofi cafe music bed at -22 LUFS under the dialog.

**Validated:** `workspace/projects/noski-people-001/final-v4.mp4` — 73.9s, 32 scenes, user-rated 8/10, $23.15 total spend.

## How to use

```bash
# Scaffold a new project from this template
ralphy template use noski-deadpan-2hander \
  --project <new-project-id> \
  --brief "<one-line brief>"
```

The scaffolder:
- Creates `workspace/projects/<new-id>/` with empty subdirs
- Writes `TEMPLATE_ORIGIN.md` pointing at this template's docs
- Copies the canonical example assets (master portraits, location plate, top-down anchor, lofi music bed) from `templates/creator-lifestyle/noski-deadpan-2hander/assets/` into the new project's `assets/uploaded/` as inspiration (NOT as final outputs — they're reference for what the new project's locks should look like)

The agent then reads `TEMPLATE.md` + `prompt-cookbook.md` first, fills the 8 slots from the new brief, and runs the 10-step workflow.

## Required user inputs (the 8 slots)

| Slot | What it is |
|---|---|
| `{{character_a}}` | First speaker visual descriptor |
| `{{character_a_voice}}` | First speaker 7-tag voice profile block |
| `{{character_b}}` | Second speaker visual descriptor |
| `{{character_b_voice}}` | Second speaker 7-tag voice profile block |
| `{{location_master_plate}}` | Room + couch + props + lighting description |
| `{{target_language}}` | Target audience language (EN canonical) |
| `{{topic_seed}}` | The half-rhetorical question that drives the piece |
| `{{reference_style_handle}}` | (Optional) @handle being imitated, for research |

See `TEMPLATE.md` "Required inputs" section for full slot table with example values from the source project.

## Reference-required gate

If the brief names a specific real creator's handle (e.g. `@americanbaron`), a reference (the source video / a photo of the persona) MUST exist at `workspace/projects/<new-id>/assets/uploaded/`. Without it: refuse, or accept `no-ref-consent`. AGENTS.md hard rule #3.

## Cost ballpark

| Run profile | Spend |
|---|---|
| Tight (24 scenes, 60s, no variety regen) | **~$13 - $18** |
| Default (32 scenes, 73-75s, validated shape) | **~$22 - $25** |
| Dense (36 scenes, 90s, 1-2 variety regens) | **~$25 - $35** |

Anything beyond $35 on a 73s deadpan piece means rules 1, 4, or 7 in `TEMPLATE.md` are being ignored.

## Duration ballpark

- **Total wall-clock for a fresh agent:** ~55-75 minutes from "user brief lands" to "final mp4 ready for review."
- **Compute time:** ~30-40 minutes (Kling clips are the bottleneck — 24-36 clips × 5-15s each).
- **Agent decision time:** ~25-35 minutes (scenario drafting + anchor self-review + iteration).

## Files in this template

| File | What it is |
|---|---|
| `template.json` | Machine-readable metadata: slots, stack summary, variation axes, asset map |
| `TEMPLATE.md` | The main human-readable brief: vibe, 7 key rules, 10-step workflow, slot table, anti-patterns, cost ballpark |
| `prompt-cookbook.md` | Verbatim prompt patterns per stage (image / video / music) with `{{slots}}` substituted, plus a worked example |
| `model-stack.md` | Stage-by-stage model picks + params + cost rollup + what worked vs what to avoid |
| `hooks.md` | 5 opening-beat patterns for the 0-3s establishing shot |
| `examples.md` | 2 worked variant briefs (source-project canonical + library-doors variant) |
| `README.md` | This file |
| `assets/master-boy-portrait.png` | Source-project Speaker A master portrait (drop-in reference) |
| `assets/master-girl-portrait.png` | Source-project Speaker B master portrait (drop-in reference) |
| `assets/location-master-plate.png` | Source-project anchor #1 — couch + room (drop-in reference) |
| `assets/top-down-tight.png` | Source-project finale anchor — both heads top-down (drop-in reference) |
| `assets/lofi-bed-v2.mp3` | Source-project music bed — lofi cafe 65 BPM -22 LUFS (drop-in usable) |

## Read also

- `docs/playbooks/art-director.md` — for the prompt + anchor stage
- `docs/playbooks/editor.md` — for the ffmpeg trim + concat stage
- `workspace/projects/noski-people-001/postmortem/` — the source-project postmortem (5 docs) that informed every rule in this template

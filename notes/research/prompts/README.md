# Prompt research dump — for review

Verbatim, copy-pasteable prompts extracted from §1–§3 of [`docs/research/ai-video-pipeline-bibliography.md`](../../../docs/research/ai-video-pipeline-bibliography.md). One YAML per prompt. Nothing wired into Ralphy flow yet — this folder is staging for a human review pass.

## Folder layout

```
prompts/
├── image/
│   ├── nano-banana-pro/   # §1 — Gemini 3 Pro Image
│   ├── gpt-image/         # §1 — gpt-image-1 / gpt-image-2
│   ├── grok-imagine/      # §1 — xAI Aurora (image)
│   └── recraft/           # §1 — Recraft V3 / V4
├── video/
│   ├── kling-3/           # §2 — kwaivgi/kling-v3.0-pro
│   ├── seedance-2/        # §2 — bytedance/seedance-2.0
│   ├── veo-3-1/           # §2 — google/veo-3.1
│   └── grok-imagine-video/ # §2 — xAI Aurora (video)
└── content-form/
    ├── ugc-ads/           # §3 — UGC ad prompts (Atlabs UGC-15, VideoAI UGC)
    ├── cinematic-lifestyle/ # §3 — broader prompt libraries (YouMind 2000, ImagineArt 70)
    ├── wilwaldon-toolkit/  # §3 — wilwaldon Claude-Code-Video-Toolkit
    └── rediumvex-skills/   # §3 — rediumvex 10 Seedance SKILL.md director prompts
```

## YAML schema

```yaml
slug: short-kebab-id
model: model-id (e.g. kwaivgi/kling-v3.0-pro)
provider: replicate | openrouter | native | gemini | xai | ...
use_case: one-line phrase
form_factor: e.g. "vertical 9:16 / 5s" (optional)
is_template: false   # true if has {{slot}} / [SLOT] placeholders
inputs:
  - kind: text_prompt
    role: scene description
    required: true
    constraints: |
      max 2500 chars   # if known
  - kind: image
    role: anchor (start frame)
    required: false
  # ... only the inputs THIS prompt actually depends on
source:
  url: https://...
  author: site or author name
  retrieved: 2026-05-21
notes: |
  Caveats from the source — required flags, common failure modes, etc.
prompt: |
  <verbatim prompt content>
```

## Review checklist

For every prompt before promoting it into a template / playbook:

- [ ] **Verbatim** — matches the source word-for-word. Don't auto-clean.
- [ ] **Model match** — `model:` matches what we actually call via `cli/lib/providers/`. If the source uses a different ID (e.g. Replicate vs fal.ai), normalize to our convention but note both.
- [ ] **Inputs realistic** — does the prompt actually need everything in `inputs:`? Trim spurious entries.
- [ ] **Use-case fit** — does it map to a Ralphy form (talking-head / GRWM / unboxing / cinematic / etc)?
- [ ] **Brand-safety** — does it name real entities (per the reference-required gate in `AGENTS.md`)?
- [ ] **Memory cross-check** — does it conflict with any `feedback_*.md` memory? (e.g. broadcast-realism-square, kling-no-music + 11labs-music-postmix, photoreal-still-register)

## Provenance

Distributed across 10 parallel research agents (2026-05-21). Each agent was scoped to one model/category and instructed to extract *verbatim* author-written prompts, not paraphrase guide prose.

## Run 2026-05-21 — 261 prompts saved

| Folder | Count | Notes |
|---|---:|---|
| `image/nano-banana-pro/` | 24 | All 8 sources fetched; Google Cloud + DEV.to + DeepMind densest. |
| `image/gpt-image/` | 10 | OpenAI platform docs blocked by Cloudflare (3 × 403) — Cookbook carried the prompts. Confirmed: no community awesome-list exists at the gpt-image-1 tier yet. |
| `image/grok-imagine/` | 4 | T2I ×3, I2I ×1. xAI news page 403; grokimagineai.net was advice-only. |
| `image/recraft/` | 19 | 6 named sources thin → followed `llms.txt` into deeper docs pages where the verbatim prompts actually live. |
| `video/kling-3/` | 32 | Densest set. 9 use `--audio` (EN-only flagged). Magnific 403. |
| `video/seedance-2/` | 22 | 4 timeline-prompted, 4 i2v (2 flagged as human-anchor concern → consider Kling). Pollo.ai 403; awesome-seedance-2-prompts README inaccessible via WebFetch. |
| `video/veo-3-1/` | 17 | 5 use multi-image refs, 12 use native audio (8 with verbatim dialogue). |
| `video/grok-imagine-video/` | 10 | T2V ×7, I2V ×3. Replicate model card had labeled examples (unexpected). |
| `content-form/ugc-ads/` | 14 | Atlabs UGC-15 needed `curl + UA spoof` (JS-rendered); VideoAI.me contributed too. All Seedance-tagged; 13 human-anchored → notes recommend Kling routing. |
| `content-form/cinematic-lifestyle/` | 25 | 8 categories spread (horror, action, fantasy, sci-fi, cinematic, nature, sports, asmr). 9 flagged as human-anchor concern. |
| `content-form/rediumvex-skills/` | 84 | 8 of 10 SKILL.md files yielded templates. 83 Seedance + 1 ElevenLabs voice spec. |
| `content-form/wilwaldon-toolkit/` | 0 | Repo had only a README — no committed skills. See `_report.md` for follow-up candidates. |

**Totals:** 57 image prompts + 81 video prompts + 123 content-form prompts = **261 prompts**.

URLs that hard-failed (403 / inaccessible to WebFetch): `x.ai/news/grok-image-generation-release`, `magnific.com/blog/kling-3-0/`, `pollo.ai/hub/seedance-2-0-prompt-guide`, 3 OpenAI platform-docs pages. None are blockers — alternate sources carried equivalent prompts in every case.

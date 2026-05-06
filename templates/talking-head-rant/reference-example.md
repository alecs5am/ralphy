# Reference example — talking-head-rant

**Status: PLACEHOLDER** — fills in after the first real end-to-end run.

## What should live here after the first run

- **Source project:** ID of the first project that shipped through this template.
- **Concrete monologue:** full VO text + word count + duration.
- **Character setup:** archetype + setting + the prompts that actually worked.
- **Hook screenshot:** what was used (Reddit / news / chat / tweet), the actual content, and the path under `assets/uploaded/`.
- **Models used:** veo-3.1 vs kling fallback — which was chosen and why.
- **Cost actuals:** breakdown by stage.
- **Lip-sync notes:** if veo-3.1 — how clean it was; if kling — how well captions hid the desync.

## How to fill it

```bash
ralphy template extract --slug talking-head-rant --from-project <id>
```

This won't overwrite the other docs (`TEMPLATE.md`, `fragments.md`, `model-stack.md`, `composition.md`) — only this file. Or fill it by hand from the project's `BRIEF.md`, `scenario.json`, `prompts.json`, `asset-manifest.json`, and `logs/`.

## Why this is empty for now

The structure ships ready-to-use; filling this reference takes ~$7.65 (veo path) or ~$2.25 (kling path) plus ~10 minutes of wall time on a real run.

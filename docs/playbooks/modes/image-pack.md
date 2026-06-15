# Mode quality playbook — image pack (App Store / Play Store / social / ad-creative)

> A first-class multi-still deliverable (#429) — App Store screenshots, Play Store screenshots, a social image pack, or an FB / Meta ad-creative pack. Not a video. Routes against the existing [`ad-creative-pack`](ad-creative-pack.md) content mode (the closest mode: `fb-creative` format, minMedia 4) and the `image-pack` project KIND (a `selected/` sibling; `cli/lib/contract.ts` relaxes the scenario requirement for it). Backing skill for the ad-creative kind: [`/fb-creatives`](../../../.agents/skills/fb-creatives/SKILL.md).

## Creative objective

Ship a disciplined SET of stills — every slot has a defined ROLE (hero / feature-callout / proof / cta / …) and COMPOSITION CLASS (device-frame / portrait-quote / text-card / …), so the pack reads as one coherent deliverable, not a pile of images. The pack wins the same way a video Unit does: ref intake, slot roles before generation, variants, selection, packaging, provenance, and a quality gate.

## The end-to-end chain (REUSE, don't rebuild)

Each step is an existing `ralphy` verb. The image-pack verb is only the scaffold + the eval rubric; everything else is a documented chain.

1. **Create + scaffold.** `ralphy project create --id <id> --kind image-pack` then `ralphy project image-pack <id> --kind <app-store|play-store|social|ad-creative> [--count N]`. The scaffold writes `pack.json` (the slot-role spec + provenance), a batch-ready `prompts/pack.jsonl` (one `{slot, prompt}` line per slot, prompt = a role-templated stub to fill), and the `artifacts/images/`, `artifacts/refs/`, `selected/`, `prompts/`, `logs/` folders. The `selected/` sibling is what types the project as `image-pack` for the contract probe. Append-only — a prior `pack.json` auto-versions unless `--force`.
2. **Reference pack** (#426). `ralphy ref pack <id>` assembles the typed reference set (brand / product / model / style refs). For a real brand URL, run the site-grounding sub-agent first (AGENTS #15) so the palette + hero ref are real, not invented.
3. **Fill the prompts.** Edit each `prompts/pack.jsonl` line's `prompt` (art-director) — cite real palette hex, name the composition spec per slot, add the slot's ban-negative. The slot stubs carry the role + composition class so the art direction stays on-spec.
4. **Generate** (#024). `ralphy generate image --project <id> --batch prompts/pack.jsonl --aspect <a>` runs the parallel fan-out + the cost rollup. Add `--variants N` (or a per-slot variant batch) to explore A/B options per slot. The scaffold's `batchCommand` field prints the exact invocation.
5. **Select the winners** (#421). `ralphy batch tournament` ranks the variants per slot, picks a champion, and preserves the losers. Copy the chosen winner per slot into `selected/` (append-only — never delete a loser).
6. **Gate** — two passes:
   - `ralphy eval fidelity <id>` (#422) for the model-dependent product / brand fidelity (commercial packs only).
   - `ralphy project image-pack <id> --score` for the deterministic image-pack rubric — role coverage (every spec slot has a generated image), aspect consistency, and selected-set cohesion (the `selected/` count covers the pack). Zero model calls.
7. **Package the deliverable.** `ralphy unit create <id> --slug <s> --format <f> --from "selected/*"` COPIES the curated set into `units/<slug>/` + writes `unit.json`, then `ralphy unit package <id> <slug>` (#423) assembles the distribution bundle. Do NOT build a parallel ZIP verb.

## Required inputs

- The pack kind (`--kind`) — the slot set is seeded from it.
- For a commercial pack: a product / brand reference (the reference gate fires for named real entities — AGENTS #3). Generic / no-name product work proceeds without refs.

## Default slot sets per kind

| kind | aspect | slot spine |
|---|---|---|
| `app-store` / `play-store` | 9:16 | hero → feature-callout(s) → lifestyle → dimensions → comparison → usage → cta (`--count` tunes the feature callouts) |
| `social` | 1:1 | cover → N feed stills (`--count` tunes the feed stills) |
| `ad-creative` | 4:5 | the fb-creatives A-E 5-set: real-people · graphic · proof · meme · niche (`--count` repeats each set) |

## Model recommendations

Verify against `MODELS.md` every run.
- **App Store / Play Store / ad-creative typography** — `openai/gpt-5.4-image-2` for crisp embedded text (headlines, callouts, price stacks, code-cards).
- **Multi-ref cohesion / fast exploration** — `google/gemini-3-pro-image-preview`.

## Evaluation criteria

The deterministic rubric (`--score`) refuses on a missing role (a `fail`) and warns on a short / empty `selected/` set. Beyond it: every still on-spec for its role + composition class, one aspect across the set, palette / product traced to the locked refs (fidelity gate), and the selected set fully covers the pack before packaging.

## Does NOT apply to:

- A single still / hero / drop poster → use [`/poster`](../../../.agents/skills/poster/SKILL.md) or [`hero-banner.md`](hero-banner.md).
- A swipe-through carousel (one narrative across ordered slides) → use [`social-carousel.md`](social-carousel.md).
- A moving video deliverable → match the video mode.
- On-image-text quality / safe-area checks — a model-dependent SEAM to the OCR/text gate (#439), not the deterministic rubric here.

# Object localisation verb + OSS vision-model bench

> **Status:** idea
> **Filed:** 2026-05-24
> **Folder:** ideas

## Context

There is no agent-facing CLI primitive for "give me the pixel bounding
box of <object> in <image>". `cli/lib/providers/llm.ts → callLLM()`
already routes vision through `google/gemini-2.5-flash` for
`scoreImage`, `face-bbox`, `find-viral-moments`, but precise
localisation lives in those internal call sites only.

Without a primitive, any agent task that needs pixel-accurate
positioning — VHS-style mask overlays, sticker / censor blocks,
attention-region crops, scene-anchor verification, kinetic-caption
attach points — falls back to coordinate eyeballing. That's
unreliable on the first try and produces a long retry loop.

A first-cut empirical pass against `google/gemini-2.5-flash` for tight
small-object bboxes (a few dozen pixels on a 1280-wide source) showed
the cloud model can place objects in roughly the right region but
drifts by 30–60px on a tight target. Good enough for smart-crop math
(which already has a 25% safe-zone radius); not good enough for
surgical pixel work like mask overlays on a 20px-tall object.

## What

Two related deliverables, sequenced:

### Phase 1 — `ralphy ref locate` (cloud, ships first)

A thin verb that wraps `callLLM()` with a structured prompt:

```bash
ralphy ref locate \
  --image <path> \
  --object "<plain-text description>" \
  [--model <id>] [--top-k <n>]
```

Returns JSON `{ image, dimensions, object, matches: [{ label, x, y, width, height, score }] }`.

Already prototyped in `cli/commands/ref.ts` and validated end-to-end.
Cheap (~$0.001 / call), no new deps. Coordinate quality is the open
question — see phase 2.

### Phase 2 — OSS local-vision bench (the actual research task)

Stand up a benchmark harness that runs multiple open-source vision
models against a shared fixture of small-object localisation cases
and reports IoU + median pixel-offset + latency on a MacBook
(Apple Silicon, MPS) baseline. Candidates to bench:

- **Grounding DINO Tiny** (~170 MB, Apache 2.0) — open-vocab text→bbox.
- **Florence-2-base** (~232 MB, MIT) — multi-task: detection +
  segmentation + caption + OCR via the same model.
- **OWLv2-base** (~600 MB, Apache 2.0) — open-vocab, historically
  tighter on small objects than DINO.
- **SAM 2 small** (~350 MB, Apache 2.0) — segmentation only, would
  pair with one of the above for pixel-precise masks.
- **Apple Vision framework** — zero-install on macOS, ships
  hands / faces / pose / text / rectangles. Compose with another
  model for arbitrary objects.

Fixture: ~20 images with hand-labelled tight bboxes for small objects
(jewellery, smoking implements, label text, product tabs, individual
fingers, ear / eye landmarks). Compare each model + the existing
`gemini-2.5-flash` cloud baseline.

Output: a written benchmark report under `roadmap/` with a
recommendation for the default local backend, plus an ADR-style
write-up under `roadmap/<NN>-vision-locate/OPEN-QUESTIONS.md` for the
cloud-vs-local-default decision.

## Why it matters

- Unlocks every downstream verb that needs "find X in Y" — censor /
  smart-crop / anchor-verify / region-prompt loops currently can't
  be agent-driven without eyeballing.
- The cloud baseline already proves the primitive is valuable. The
  bench answers whether it's also worth shipping the offline,
  privacy-preserving, zero-marginal-cost path for users who can't or
  won't send personal frames through a third party.
- Composability: every Phase-2 winner plugs in behind the Phase-1
  CLI surface — `--backend cloud|grounding-dino|florence|owl|sam` —
  no schema change, no agent retraining.

## Notes

- AGENTS invariant alignment: this is the "operation not yet covered,
  propose adding the verb" path. The prototype lives in `cli/commands/`
  rather than as ad-hoc tsx scripts.
- Open question: namespace. `ralphy ref locate` clashes a little with
  the existing `ref` meaning ("reference asset for generation"). If
  vision verbs proliferate (`caption`, `read-text`, `segment`), the
  cleaner home is a new `ralphy vision *` namespace, with `ref locate`
  kept as an alias.
- Fixture sourcing: the bench needs hand-labelled ground-truth; can
  bootstrap from a small `tests/fixtures/vision-locate/` directory with
  paired `.jpg` + `.json` (bbox spec). Ten hand-labelled images is
  enough to surface the cloud-vs-OSS gap at the 30px-drift threshold.
- Decision deferred: which OSS model gets shipped as the local
  default — Grounding DINO Tiny is the lightest "just-text→bbox"
  pick, but Florence-2 unlocks more downstream verbs from a single
  install. Worth running both and letting the bench decide.
- Cross-ref: `notes/ideas/003-anti-ai-slop-photoreal-flash.md` lives in
  the same "agent-precision quality" family — that one addresses
  prompt-register-level miscalibration; this one addresses
  pixel-level miscalibration. Both go away once the bench + verb land.
- Cost ceiling: the cloud backend should not stay default if it can't
  hit < 20px median pixel-offset on the fixture. The bench is the
  gate.

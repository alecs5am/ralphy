# Per-workspace custom evaluators

A workspace (= a studio / universe / client) encodes its **own hard quality bar once** and reuses it across every episode it produces. Producing a new episode in a universe should not re-derive the craft rules each time, and quality should not emerge only after many manual review rounds. This framework turns a universe's tribal knowledge into a config-driven, reusable rubric: a set of criteria, the thresholds they read, the runner that scores against them, and the studio gates that refuse to advance a stage until its criteria clear.

It is **complementary, not a replacement.** The built-in gates (`scoreScenario` / `scoreImage` / `scoreVideo`, `/evaluator`, the quality flywheel #457) stay in force everywhere. This framework supplies the per-workspace **CUSTOM** criteria layered on top, scored against the same readiness vocab (#427) so they feed the same repair loop (#409).

> **Routing.** The standalone "score this against the universe rubric" path is the [`/workspace-eval`](../.agents/skills/workspace-eval/SKILL.md) skill; the one-tag, four-approvals staged flow is the [`/universe-studio`](../.agents/skills/universe-studio/SKILL.md) skill. This doc is the concept reference both build on.

## The config

The rubric lives in a workspace, two ways (loader checks them in this order, [`cli/lib/workspace-evaluators.ts`](../cli/lib/workspace-evaluators.ts)):

1. a sibling `<workspace>/evaluators.json` (wins), or
2. an `evaluators` key inside `<workspace>/workspace.json`.

No config → `null`, **zero behavior change** for workspaces without a rubric. A malformed config returns `null` + a `console.warn` (it never crashes an unrelated verb). The Zod schema is [`cli/lib/schemas/workspace-evaluators.ts`](../cli/lib/schemas/workspace-evaluators.ts); the shape:

```jsonc
{
  "version": "1.0",
  "criteria": [
    {
      "id": "string",                  // unique within this config
      "label": "string",               // human-readable, for reports / studio
      "category": "string",            // free-form bucket (captions | pacing | style | ...)
      "check": "deterministic",        // "deterministic" (code) | "vision" (model)
      "severity": "warn",              // info | warn | fail  (default warn)
      "threshold": {},                 // number | string | boolean | object — per criterion
      "validatorId": "string",         // deterministic: the validator that runs the check
      "rubricPrompt": "string",        // vision: inline rubric (optional; wins over rubricFile)
      "rubricFile": "rubrics/x.md",    // vision: path (workspace-relative) to a dedicated prose rubric (#477)
      "benchmarkRef": "string"         // optional ref into `benchmarks`
    }
  ],
  "benchmarks": {},                    // optional named benchmarks (free-form)
  "stageGates": [                      // optional (#472) — see "Stage-gated studio flow"
    { "stage": "string", "phase": "string", "criteria": ["id"], "severity": "block" }
  ]
}
```

Notes that matter when authoring:

- **`check` is the fork.** `deterministic` criteria run in code (no model) — resolved by `validatorId` against the validator registry. Each `vision` criterion runs as its OWN isolated deep-vision pass (#477) so the context stays focused — the mp4 is loaded once and reused across criteria. Its rubric resolves in order: inline `rubricPrompt` → the content of `rubricFile` (workspace-relative prose `.md`) → a canonical builtin fragment by `validatorId` → the label. The shared `STYLE_LOCK.md` is **not** folded into per-criterion eval passes — keep each domain's prose in its own `rubricFile` (a `rubrics/` dir per workspace is the convention).
- **Thresholds are config, never hardcoded.** Each criterion's `threshold` shape is whatever that criterion reads (a number, a string like `"9:16"`, a boolean, or an object of keys). The defaults below are the fallback when a key is absent — the workspace overrides them. NO universe-specific numbers live in the code.
- **`severity` controls the verdict weight.** A criterion left at the default `warn` is advisory; opt it up to `fail` to make it a hard bar. An unscored (`na`) criterion only forces a `needs-user-decision` verdict when its severity is `fail`.
- **The schema is fully generic.** No Silent-Hill (or any universe) fields. The instance lives in the workspace config (see the how-to below).

## The 6 built-in criteria

Six generic check types ship built-in ([`cli/lib/eval/workspace-criteria.ts`](../cli/lib/eval/workspace-criteria.ts)) — three deterministic validators, three vision rubric fragments. A workspace references them by `validatorId`. Each numeric bar comes from `threshold` with the documented default below.

### Deterministic (code, no model)

These parse the HyperFrames `<project>/index.html` (or a metrics file) with linear string scans and **degrade gracefully** — a missing `index.html` / metrics file yields a single `info` finding (criterion `na`), never a crash.

**`material-density`** — composition richness from `index.html` (audio tracks, SFX, captions, editing-technique coverage).

| threshold key | type | default | what it reads |
|---|---|---|---|
| `minAudioTracks` | number | `4` | distinct `data-track-index` count across `<audio>` tags |
| `minSfx` | number | `8` | audio clips whose `id`/`src` match `sfx` |
| `requireCaptions` | boolean | `true` | at least one caption marker present |
| `minCaptions` | number | `2` | caption-marker count when required |
| `requiredTechniques` | string[] | all 6 families | editing-technique coverage (see below) |

The six technique families: `countdown`, `freeze-or-boomerang`, `death-screen`, `flashes`, `selector`, `title-card` (each matched by an OR-list of keyword markers in the HTML).

**`edit-correctness`** — cut hygiene from the parsed composition.

| threshold key | type | default | sub-check |
|---|---|---|---|
| `requireForkHoldsBothChoices` | boolean | `true` | a selector/choice/fork marker is present (idle-hold proxy) |
| `requireDeathBeats` | boolean | `true` | a death-screen beat is present |
| `requireCountdownOnFreeze` | boolean | `true` | a countdown present ⇒ a freeze/boomerang must also be present |
| `sfxToleranceSec` | number | `0.15` | max \|SFX start − nearest technique beat\| — see note |

Always active: **VO no-overlap** (no two voice clips overlap in `[start, start+dur)` on the same track). Degraded to `info`: the **SFX-to-beat timing** check — the composition carries technique keyword markers, not timestamped beats, so there is no beat timeline to diff SFX against (emit a per-technique beat timeline to enable it).

**`insta-metric-fit`** — recorded platform metrics vs the configured ceilings/floor.

| threshold key | type | default | bar |
|---|---|---|---|
| `metricsFile` | string | `metrics.json` (project-relative) | recorded-metrics path; falls back to the workspace `metrics-benchmarks.json` |
| `maxTimeToFirstChoiceSec` | number | `3` | time-to-first-choice ceiling |
| `maxFirstBeatSec` | number | `5` | first-beat length (without a cut) ceiling |
| `minAvgWatchPct` | number | `30` | avg-watch ÷ duration floor (percent) |

Metrics-file keys read (all optional): `timeToFirstChoiceSec`, `firstBeatSec`, `avgWatchSec`, `durationSec`, `avgWatchPct` (used directly if present, else derived from `avgWatchSec / durationSec`). No metrics file → `na` + info (the project simply hasn't recorded metrics yet).

### Vision (one deep-vision model pass)

These are canonical rubric fragments scored against the workspace `STYLE_LOCK.md` + `benchmarks`. They carry no numeric default in code — the numbers come from the criterion's `rubricPrompt` / `threshold` (the built-in fragment reads, e.g., a configured `minConsequenceCoveragePct`, default 90% stated in the prompt itself).

- **`scenario-fidelity`** — branching-narrative structure: consequence-narration coverage (win AND loss branches), genuinely 50/50 choices (no telegraphed traps), a clean binary decision funnel, target duration band.
- **`character-design-cohesion`** — the character render register matches the STYLE LOCK (e.g. crude low-poly, not cinematic/AAA, not voxel/Minecraft) and identity is stable across scenes (same face/build/outfit/silhouette).
- **`location-consistency`** — previous-scene continuity, no hallucinated off-spec geometry/signage, persistent world-state (fog/ash/damage/time-of-day carried forward, not silently reset).

## The runner

```bash
ralphy workspace eval <project>
```

Scores a project against its workspace's rubric and writes two append-only artifacts to the project dir (an existing one is archived to `.vN` first):

- `workspace-eval.json` — the per-criterion scorecard + overall verdict.
- `workspace-eval-report.md` — the human-readable report.

Flags ([`cli/commands/workspace.ts`](../cli/commands/workspace.ts)):

| flag | effect |
|---|---|
| `--no-vision` | skip the vision pass entirely (deterministic criteria only — no model call) |
| `--model <id>` | override the deep-vision model (default `google/gemini-3.1-pro-preview`) |
| `--workspace <slug>` | override the rubric workspace (default: the project's registered workspace) |
| `--video <path>` | override the scored video (default `<project>/render/final.mp4`) |
| `--criterion <id>` | run ONLY this criterion (repeatable). Re-runs **merge** over the prior `workspace-eval.json` so the others aren't re-run / re-spent (#477) |

Each vision criterion runs as its **own** isolated `callLLM()` deep-vision pass against ONLY its own rubric (#477) — focused context, no shared `STYLE_LOCK.md` blob. The mp4 is loaded once and reused across criteria; the model returns strict JSON for that one criterion. The vision pass is skipped when there are no vision criteria, `--no-vision` is passed, or no video is found. A vision failure surfaces as a `warn` on that one criterion — the others still run, and it never crashes the eval.

`--criterion` is the iteration lever: when one rubric fails, re-run just it (`ralphy workspace eval <id> --criterion scenario-fidelity`) — the fresh result is merged over the prior scorecard (other criteria kept, overall verdict recomputed), so you don't re-spend on the passing domains.

Scorecard shape (`workspace-eval.json`):

```jsonc
{
  "schemaVersion": "1.0",
  "workspace": "silent-hill",
  "projectId": "choose-silenthill-002",
  "evaluatedAt": "2026-06-18T00:00:00.000Z",
  "video": "/.../render/final.mp4",
  "criteria": [
    { "id": "...", "label": "...", "category": "...", "check": "deterministic",
      "score": 88, "verdict": "pass", "threshold": {}, "findings": [] }
  ],
  "overall": { "verdict": "ship", "score": 86, "summary": "..." }
}
```

The **overall verdict** uses the #427 readiness vocab so it feeds the repair loop (#409). The mapping ([`cli/lib/eval/workspace-evaluators.ts`](../cli/lib/eval/workspace-evaluators.ts) → `deriveOverallVerdict`):

- any criterion `fail` → `blocked`
- else any `warn` → `repair`
- else any **required** criterion (`severity: "fail"`) left `na`/unscored → `needs-user-decision`
- else → `ship`

## Stage-gated studio flow

A universe rubric can also wire **stage gates** (`stageGates`, #472) — the mechanism behind the one-tag, four-approvals studio. Four production stages map onto production-contract phases, each gated by the criterion(s) it owns. A stage cannot advance until its criteria clear in the latest `workspace-eval.json`.

The four canonical stages (documented, not defaulted — each universe wires its own in `evaluators.json`):

| Stage | Contract phase | Gated criteria |
|---|---|---|
| 1. location / cast | `style-lock` | `character-design-cohesion` + `location-consistency` (candidate pre-screen) |
| 2. scenario | `scenario` | `scenario-fidelity` |
| 3. anchors | `assets` | `character-design-cohesion` + `location-consistency` |
| 4. montage | `eval` | `material-density` + `edit-correctness` + `insta-metric-fit` |

`phase` must be a real `CONTRACT_PHASES[].id` (the schema validates against `CONTRACT_PHASE_IDS`, [`cli/lib/contract.ts`](../cli/lib/contract.ts)). When a gate's owned criterion is `fail` in the latest scorecard, the production contract emits a **`stage-gate-unmet`** stop at the gated phase (`deriveStopConditions`); a `warn` is advisory. A workspace without a rubric or `stageGates` emits no stop — zero behavior change. Check the phase ledger with `ralphy project status <id> --contract`.

The **per-stage repair loop** (#473): each stage auto-assembles → runs `ralphy workspace eval` for its criteria → on a non-pass verdict applies a bounded repair loop, then presents to the user only when the criteria clear. The free-vs-paid split is the hard gate: **FREE editor fixes auto-loop; any PAID regeneration STOPS for the user's approval** (AGENTS.md invariant #1). The [`/universe-studio`](../.agents/skills/universe-studio/SKILL.md) skill sequences all four stages under these gates; the [`/workspace-eval`](../.agents/skills/workspace-eval/SKILL.md) skill is the standalone single-run entry point.

---

# Author a universe rubric

To give a workspace its own quality bar, author **three files** in `<workspace>/` (i.e. `.ralphy/workspaces/<ws>/`). The worked example below is the Silent Hill universe (`silent-hill` workspace) — its episodes are a first-person choose-your-path PS1-horror short format where 002 is the quality benchmark, 001 the reach leader, and 003 the in-progress pivot. The JSON below is **illustrative and copy-pasteable**; authoring the real on-disk files is tracked as #471.

> All three files land on disk in **English only** (translate any non-English source). The Cyrillic CI gate is #465.

## 1. `STYLE_LOCK.md` — the prose register lock

A prose document that freezes the universe's visual register, pacing, hook mechanics, caption/audio style, and a do-not-do list. The deep-vision pass uses it to ground the vision criteria: `discoverStyleLock()` ([`cli/lib/style-lock.ts`](../cli/lib/style-lock.ts)) walks up from the video, then falls back to `<workspace>/STYLE_LOCK.md` (#468), so every project in the workspace inherits it without a per-project copy.

```markdown
# Silent Hill — universe style lock

## Visual register
- Crude PS1 low-poly characters in a volumetric, fog-heavy Chilla's-Art look —
  NOT cinematic/AAA render, NOT blocky voxel/Minecraft.
- Strict first-person POV: the hero IS the camera. Never a third-person figure
  in frame — only his POV hands / lap at the edge.
- Cold desaturated palette, persistent fog/ash, flashlight jitter on every shot.

## Pacing & hook
- First decision within 3s; no static opener longer than 5s without a cut.
- Constant motion — zero dead holds; cut visuals every 3-4.5s.

## Audio & captions
- Continuous ambient bed + a diegetic SFX hit on (nearly) every beat.
- Cloned diegetic guide voice (yellow caps captions) vs old-radio narrator (white).
- At least one caption band layer present at all times.

## Hard do-not-do
- No neon / magenta-cyan grades (reads vulgar).
- Never telegraph the trap branch's villain-tells into the other branch.
- The world must stay alive through a fork (threats twitch from frame 1).

## Benchmark references
- choose-silenthill-002 is the quality benchmark; 001 is the reach leader.
```

## 2. `evaluators.json` — criteria + thresholds + stage gates

Wires the six built-in validator ids to Silent Hill's thresholds, plus a `stageGates` block mapping the four stages. Note `validatorId` reuses the built-in id, and the deterministic thresholds are objects of the keys documented above.

**Separated prose rubrics (recommended, #477):** keep each vision domain's prose in its own file under `<workspace>/rubrics/` (e.g. `rubrics/scenario.md`, `rubrics/characters.md`, `rubrics/locations.md`) and point each vision criterion at it with `"rubricFile": "rubrics/<domain>.md"`. Each gets its own isolated deep-vision pass with that file as the only context — sharper than one shared blob, and you can re-run a single failing domain with `ralphy workspace eval <id> --criterion <id>`. (`rubricPrompt` inline still works and wins over `rubricFile`.) The Silent Hill instance uses this layout.

```json
{
  "version": "1.0",
  "criteria": [
    {
      "id": "scenario-fidelity",
      "label": "Branching scenario fidelity",
      "category": "scenario",
      "check": "vision",
      "severity": "fail",
      "validatorId": "scenario-fidelity",
      "threshold": { "minConsequenceCoveragePct": 90, "targetDurationSec": 65 },
      "benchmarkRef": "silenthill-002"
    },
    {
      "id": "character-design-cohesion",
      "label": "PS1 character spec + identity stability",
      "category": "style",
      "check": "vision",
      "severity": "fail",
      "validatorId": "character-design-cohesion",
      "threshold": "crude-ps1-lowpoly"
    },
    {
      "id": "location-consistency",
      "label": "Prev-ref location continuity",
      "category": "style",
      "check": "vision",
      "severity": "fail",
      "validatorId": "location-consistency",
      "threshold": { "requirePrevSceneRef": true }
    },
    {
      "id": "material-density",
      "label": "Audio / SFX / caption / technique density",
      "category": "production",
      "check": "deterministic",
      "severity": "warn",
      "validatorId": "material-density",
      "threshold": {
        "minAudioTracks": 4,
        "minSfx": 8,
        "requireCaptions": true,
        "minCaptions": 2,
        "requiredTechniques": ["countdown", "freeze-or-boomerang", "death-screen", "flashes", "selector", "title-card"]
      }
    },
    {
      "id": "edit-correctness",
      "label": "Fork / death / countdown / VO-overlap hygiene",
      "category": "edit",
      "check": "deterministic",
      "severity": "warn",
      "validatorId": "edit-correctness",
      "threshold": {
        "requireForkHoldsBothChoices": true,
        "requireDeathBeats": true,
        "requireCountdownOnFreeze": true,
        "sfxToleranceSec": 0.15
      }
    },
    {
      "id": "insta-metric-fit",
      "label": "Instagram retention fit",
      "category": "metrics",
      "check": "deterministic",
      "severity": "warn",
      "validatorId": "insta-metric-fit",
      "threshold": {
        "maxTimeToFirstChoiceSec": 3,
        "maxFirstBeatSec": 5,
        "minAvgWatchPct": 30
      }
    }
  ],
  "benchmarks": {
    "silenthill-002": { "note": "quality benchmark episode", "metricsRef": "002" }
  },
  "stageGates": [
    { "stage": "location/cast", "phase": "style-lock", "criteria": ["character-design-cohesion", "location-consistency"], "severity": "block" },
    { "stage": "scenario", "phase": "scenario", "criteria": ["scenario-fidelity"], "severity": "block" },
    { "stage": "anchors", "phase": "assets", "criteria": ["character-design-cohesion", "location-consistency"], "severity": "block" },
    { "stage": "montage", "phase": "eval", "criteria": ["material-density", "edit-correctness", "insta-metric-fit"], "severity": "block" }
  ]
}
```

## 3. `metrics-benchmarks.json` — recorded metrics

The recorded platform metrics the `insta-metric-fit` criterion scores a project against when the project has no `<project>/metrics.json` of its own. Record one entry per episode; the metrics-file keys the validator reads are `timeToFirstChoiceSec`, `firstBeatSec`, `avgWatchSec`, `durationSec`, `avgWatchPct`.

```json
{
  "002": {
    "views": 3615,
    "skipPct": 31.8,
    "avgWatchSec": 34,
    "durationSec": 105,
    "likePct": 2.9,
    "savePct": 2.4,
    "timeToFirstChoiceSec": 2.4,
    "firstBeatSec": 4.2
  },
  "001": {
    "likes": 1300,
    "skipPct": 30.3
  },
  "003": {
    "note": "in-progress dating-sim pivot — metrics recorded as available"
  }
}
```

With these three files in place, `ralphy workspace eval choose-silenthill-002` clears the benchmark, while `…-003` flags the long hook, missing captions, and low density — and the studio gates refuse to advance a stage whose criteria haven't cleared.

## See also

- [`docs/skills-vs-templates.md`](skills-vs-templates.md) — templates vs skills; the deliverable is a Unit.
- [`docs/playbooks/agent-production-contract.md`](playbooks/agent-production-contract.md) — the canonical phase sequence the stage gates hook into.
- [`/evaluator`](../.agents/skills/evaluator/SKILL.md) — the built-in (non-workspace) quality gates this framework complements.
- [`/workspace-eval`](../.agents/skills/workspace-eval/SKILL.md) · [`/universe-studio`](../.agents/skills/universe-studio/SKILL.md) — the agent-facing skills.

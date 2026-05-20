# `eval.json` schema (v1.0)

The eval pipeline writes this file to either `workspace/projects/<id>/eval.json` (when the mp4 is under a project) or alongside the mp4. It's the contract a fixer agent reads.

## Top-level

```ts
{
  schemaVersion: "1.0",
  meta: VideoMeta,
  declared: DeclaredMeta | null,    // null if no scenario.json
  structure: StructureBlock,
  audio: AudioStats,
  captions: CaptionStats,
  vision: { sceneFindings: SceneVision[] },
  findings: Finding[],              // ← the actionable list
  scoring: ScoringBreakdown
}
```

## VideoMeta

```ts
{
  video: string,                    // absolute path to the mp4
  projectId: string | null,
  template: string | null,
  evaluatedAt: string,              // ISO timestamp
  durationSec: number,
  resolution: { w: number, h: number },
  fps: number,
  codec: { video: string, audio: string },
  bitrateKbps: number
}
```

## DeclaredMeta

Pulled from `scenario.json`. `null` when no project context.

```ts
{
  template: string | null,
  durationSec: number | null,       // scenario.format.durationSec or scenario.duration
  sceneCount: number | null,        // scenario.scenes.length
  hookText: string | null,          // scenario.hook.primary
  angle: string | null,
  captionStyle: string | null
}
```

## StructureBlock

```ts
{
  scenes: Scene[],
  sceneCount: number,
  avgSceneDurationSec: number,
  minSceneDurationSec: number,
  maxSceneDurationSec: number,
  hookZone: {
    durationSec: number,            // typically 3
    sceneCount: number,
    transcript: string,             // captions covering 0..durationSec
    wordCount: number
  }
}

interface Scene {
  index: number,                    // 0-based
  startSec: number,
  endSec: number,
  durationSec: number,
  firstFramePath: string | null     // only set when vision pass ran
}
```

## AudioStats

```ts
{
  integratedLufs: number | null,    // EBU R128, target -16
  truePeakDb: number | null,        // dBFS, ceiling -1.5
  loudnessRangeLu: number | null,   // LU, target ≤11
  deadAirSegments: { startSec, endSec, durationSec }[],
  voicePresentPct: number           // 0..1
}
```

## CaptionStats

`available: false` when no `captions.json` was found in the project.

```ts
{
  available: boolean,
  wordCount: number | null,
  wordsPerSecond: number | null,
  densityWarn: boolean | null       // true when wps outside 1.5..4.5
}
```

## SceneVision

One per scene when the vision pass runs.

```ts
{
  sceneIndex: number,
  timestampSec: number,             // mid-scene frame timestamp
  framePath: string,                // jpg under <outDir>/eval-frames/
  summary: string,                  // one-line description from Gemini
  issues: VisionIssue[]
}

interface VisionIssue {
  category: "ai-artifacts" | "text" | "composition" | "brand" | "quality" | string,
  severity: "info" | "warn" | "fail",
  message: string
}
```

Each `VisionIssue` is also lifted into `findings[]` as a `vision.<category>` finding so the fixer agent only has to walk one list.

## Finding

The unit a fixer agent acts on.

```ts
{
  id: "F1" | "F2" | …,
  category: string,                 // taxonomy below
  severity: "info" | "warn" | "fail",
  sceneIndex: number | null,
  timestampSec: number | null,
  message: string,                  // human-readable, specific
  fixHint: string,                  // conceptual fix
  fixCommand: string | null         // copy-pasteable ralphy / ffmpeg command, when one applies
}
```

### Category taxonomy

| Prefix | Examples | Typical fixer |
|---|---|---|
| `format.*` | `format.aspect-ratio`, `format.resolution`, `format.fps` | editor (re-render) |
| `structure.*` | `structure.duration-drift`, `structure.hook-zone-empty`, `structure.hook-zone-static`, `structure.hook-zone-thin-vo` | scenarist or editor |
| `audio.*` | `audio.loudness`, `audio.true-peak`, `audio.dead-air` | editor |
| `captions.*` | `captions.thin`, `captions.dense`, `captions.missing` | editor |
| `vision.*` | `vision.ai-artifacts`, `vision.text`, `vision.composition`, `vision.brand`, `vision.quality` | art-director (regen) |

Severity ladders are deterministic — see `cli/lib/eval/findings.ts` for thresholds. The fixer can assume:
- `info` is a note, no action required by default
- `warn` is "address before next render"
- `fail` is "do not ship"

## ScoringBreakdown

```ts
{
  weights: { info: 1, warn: 6, fail: 18 },
  penalties: { info: number, warn: number, fail: number },
  score: number,                    // 100 - sum(penalties), clamped to 0..100
  verdict: "pass" | "warn" | "fail"
}
```

Verdict rules:
- any `fail` finding → `fail`
- ≥12 LU of warn-penalty (≥2 warns) **and** score < 70 → `warn`
- otherwise → `pass`

The score is informational. Don't gate on it inside the eval — leave that decision to the user or the producer playbook.

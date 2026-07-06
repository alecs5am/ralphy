// Canonical pretty-mode render shapes, one (or more) per command verb.
//
// SINGLE SOURCE OF TRUTH for two consumers (issue #001 §A + §B):
//   1. tests/unit/output-pretty-snapshot.test.ts — renders every shape here
//      through `out()` in pretty mode and asserts the #001 invariants
//      (no `[object Object]`, no standalone `undefined`, no literal null/
//      undefined, a readable layout).
//   2. scripts/lint-out-coverage.ts — cross-references this registry against
//      the `out(...)` call sites in cli/commands/. Any command file that emits
//      a STRUCTURED shape (an object / array literal, or a spread) but is
//      neither a key here nor in EXEMPT below fails the lint.
//
// When you add a command verb that calls `out({...})` / `out([...])`, add a
// representative canonical shape here keyed by the command file's basename
// (e.g. `cli/commands/foo.ts` -> key `"foo"`). The shape should mirror what the
// verb actually prints — pull it straight from the `out({ ... })` in the
// command. The lint will tell you exactly which key is missing.

export interface VerbShape {
  /** Stable label used in the snapshot test name, e.g. "project.list". */
  label: string;
  /** A canonical value passed to `out()` — mirrors the verb's real output. */
  shape: unknown;
}

// Keyed by command file basename (cli/commands/<key>.ts). Each verb lists one
// or more canonical shapes. Mirrors the real `out(...)` payloads.
export const VERB_SHAPES: Record<string, VerbShape[]> = {
  analytics: [
    {
      label: "analytics.pull",
      shape: {
        project: "spring-2026-001",
        fetched: 1,
        skipped: 1,
        units: [
          {
            slug: "hero-cut",
            appended: 1,
            analyticsPath: ".ralphy/workspaces/default/projects/spring-2026-001/units/hero-cut/analytics.jsonl",
            records: [
              { target: "youtube", postId: "dQw4w9WgXcQ", status: "fetched", source: "youtube-analytics", metrics: { views: 4200, likes: 310, comments: 12 } },
              { target: "tiktok", postId: "post-tt-1", status: "skipped", note: "postiz not configured (POSTIZ_API_KEY + POSTIZ_BASE_URL)" },
            ],
          },
        ],
      },
    },
    {
      label: "analytics.postmortem",
      shape: {
        project: "spring-2026-001",
        workspace: "default",
        model: "anthropic/claude-sonnet-4.6",
        units: ["hero-cut", "b-roll-cut"],
        findings: [
          {
            slug: "pov-hook-outperforms",
            finding: "POV hooks retain: hero-cut pulled 13x the views of b-roll-cut at +7d.",
            evidence: { units: ["hero-cut", "b-roll-cut"], metrics: "hero-cut 4200 views vs b-roll-cut 310 at +7d" },
            recommendation: "Default the next batch's caption hooks to the POV register.",
            type: "client",
          },
        ],
        dropped: 1,
        findingsPath: ".ralphy/workspaces/default/projects/spring-2026-001/postmortem/analytics-findings.json",
        staged: [{ slug: "pov-hook-outperforms", tier: "workspace", file: "pov-hook-outperforms.md", path: "memory/proposed/pov-hook-outperforms.md" }],
        dryRun: false,
      },
    },
  ],
  asset: [
    {
      label: "asset.list",
      shape: [
        { id: "ny22-warrior", kind: "image", path: "shared/refs/ny22.png" },
        { id: "soundtrack", kind: "music", path: "shared/music/sound.mp3" },
      ],
    },
    { label: "asset.cutout", shape: { src: "in.png", dst: "out.png", color: "#00FF00", similarity: 0.3, feather: 2, despill: true } },
  ],
  assets: [
    { label: "assets.pulled", shape: { template: "noski", pulled: ["pool/gameplay-loops/minecraft-parkour.mp4"] } },
    { label: "assets.empty", shape: { template: "noski", pulled: [] } },
    { label: "assets.cacheInfo", shape: { key: "trend-music/phonk-01", cachedPath: ".ralphy/cache/assets/phonk-01.mp3", sizeBytes: 1048576 } },
  ],
  audio: [
    { label: "audio.normalize", shape: { src: "vo.mp3", dst: "vo.norm.mp3", target: -16, truePeak: -1.5, lra: 11 } },
    { label: "audio.concat", shape: { srcs: ["a.mp3", "b.mp3"], dst: "stitched.mp3" } },
  ],
  batch: [
    {
      label: "batch.list",
      shape: [
        { id: "spring-batch-001", name: "spring drop", status: "render" },
        { id: "summer-batch-002", name: "summer teaser", status: "assets" },
      ],
    },
    { label: "batch.review", shape: { batch: "spring-batch-001", total: 5, passed: 4, failed: 1, mean_score: 7.8 } },
    {
      label: "batch.tournament",
      shape: {
        baseId: "musicbed-001",
        scorer: "manual",
        champion: { variantId: "bed-a-001", score: 88, axis: "music-bed", rank: 1 },
        ranked: [
          { variantId: "bed-a-001", score: 88, axis: "music-bed", rank: 1 },
          { variantId: "bed-b-001", score: 70, axis: "music-bed", rank: 2 },
        ],
        losers: [{ variantId: "bed-b-001", score: 70, rationale: "Lost to bed-a-001 (score 70 vs 88)." }],
        cost: { totalUsd: 1.2, byVariant: [{ variantId: "bed-a-001", cost: 0.6 }, { variantId: "bed-b-001", cost: 0.6 }] },
      },
    },
  ],
  blueprint: [
    {
      label: "blueprint.show",
      shape: {
        unitId: "unit-spring-001",
        format: "video",
        template: "ugc-talking-head",
        style: "ellycoffee-warm",
        recipes: ["caption-pop", "vhs-grain"],
        assets: ["product-can", "barista-master"],
      },
    },
  ],
  brand: [
    { label: "brand.show", shape: { id: "ellycoffee", name: "Elly Coffee", palette: ["#3A2A1A", "#D9B382"], voice: "warm, direct" } },
    {
      label: "brand.list",
      shape: [
        { id: "ellycoffee", name: "Elly Coffee" },
        { id: "noski", name: "Noski" },
      ],
    },
    { label: "brand.delete", shape: { deleted: "noski" } },
  ],
  calendar: [
    {
      label: "calendar.show",
      shape: {
        workspace: "my-studio",
        path: ".ralphy/workspaces/my-studio/calendar.json",
        slots: [
          { id: "slot-mon-0900", weekday: "mon", time: "09:00", timezone: "America/New_York", unitType: "ugc-review", targetPlatforms: ["tiktok", "youtube"] },
        ],
        entries: [
          { id: "e-1a2b3c4d", at: "2026-07-13T13:00:00.000Z", slotId: "slot-mon-0900", unitType: "ugc-review", platforms: ["tiktok"], status: "queued", projectId: null },
        ],
        totalEntries: 3,
      },
    },
    {
      label: "calendar.add.slot",
      shape: { workspace: "my-studio", kind: "slot", id: "slot-mon-0900", weekday: "mon", time: "09:00", timezone: "America/New_York", unitType: "ugc-review", targetPlatforms: ["tiktok"] },
    },
    {
      label: "calendar.fill",
      shape: {
        workspace: "my-studio",
        weeks: 2,
        created: 2,
        skipped: 1,
        entries: [
          { id: "e-1a2b3c4d", at: "2026-07-13T13:00:00.000Z", slotId: "slot-mon-0900", unitType: "ugc-review", platforms: ["tiktok"], status: "queued" },
        ],
        eventsLog: ".ralphy/workspaces/my-studio/calendar-events.jsonl",
      },
    },
  ],
  clip: [
    {
      label: "clip.cut",
      shape: { src: "/tmp/stream.mp4", dst: ".ralphy/workspaces/default/projects/demo-001/artifacts/videos/stream-clip-12-45.mp4", startSec: 12, endSec: 45, durationSec: 33, vertical: true, project: "demo-001" },
    },
  ],
  clone: [
    { label: "clone.created", shape: { id: "spring-2026-002", clonedFrom: "spring-2026-001", root: ".ralphy/workspaces/default/projects/spring-2026-002" } },
  ],
  compose: [
    { label: "compose.plan", shape: { project: "demo-001", scenes: 6, durationSec: 32, written: "index.html" } },
  ],
  config: [
    { label: "config.list", shape: { defaultModel: "google/gemini-3-pro-image-preview", workspace: "default", quiet: false } },
    { label: "config.set", shape: { defaultModel: "openai/gpt-5.4-image-2" } },
  ],
  daemon: [
    { label: "daemon.started", shape: { daemon: "started", pid: 40321, pidFile: ".ralphy/daemon.pid", logFile: ".ralphy/daemon.log" } },
    { label: "daemon.notRunning", shape: { daemon: "not-running" } },
  ],
  doctor: [
    {
      label: "doctor.report",
      shape: {
        bun: { ok: true, version: "1.3.14" },
        ffmpeg: { ok: true, version: "7.1" },
        OPENROUTER_API_KEY: { ok: true },
        ELEVENLABS_API_KEY: { ok: false, hint: "set in .envrc" },
      },
    },
  ],
  editor: [
    { label: "editor.payload", shape: { project: "demo-001", clipCount: 6, summaryPath: "render/summary.json", plan: [], results: [] } },
  ],
  eval: [
    {
      label: "eval.video",
      shape: {
        project: "demo-001",
        verdict: "warn",
        score: 6.4,
        findings: [
          { scene: "scene-02", severity: "warn", note: "static hold > 4s" },
          { scene: "scene-05", severity: "info", note: "caption lags VO by 120ms" },
        ],
      },
    },
    {
      label: "eval.ocr",
      shape: {
        verdict: "fail",
        blocksShip: true,
        applicable: true,
        mode: "social-carousel",
        reason: "2 text-legibility failure(s) — unreadable / clipped / garbled copy or markdown artifacts. Blocks ship-ready until fixed.",
        assets: 5,
        findings: 2,
        expectedCopyProvided: false,
        jsonPath: ".ralphy/workspaces/default/projects/demo-001/text-legibility.json",
      },
    },
    {
      label: "eval.hook",
      shape: {
        verdict: "fail",
        blocksShip: true,
        applicable: true,
        mode: "ad-creative-pack",
        reason: '3 first-frame hook failure(s) — the opener is too weak / misleading to scroll-stop for mode "ad-creative-pack". Blocks ship-ready until fixed.',
        hookScore: 42,
        findings: 3,
        jsonPath: ".ralphy/workspaces/default/projects/demo-001/hook.json",
      },
    },
    {
      label: "eval.captions",
      shape: {
        verdict: "fail",
        blocksShip: true,
        applicable: true,
        mode: "ugc-review",
        reason: "2 caption sync/readability failure(s) — desync / too-short / overcrowded / occluding captions. Blocks ship-ready until fixed.",
        captionCount: 24,
        wordTimingsProvided: true,
        findings: 2,
        jsonPath: ".ralphy/workspaces/default/projects/demo-001/captions-gate.json",
      },
    },
    {
      label: "eval.claims",
      shape: {
        verdict: "fail",
        blocksShip: true,
        applicable: true,
        mode: "ugc-review",
        reason: "2 high-risk unsupported claim(s) — health/financial/absolute claims with no substantiation. Blocks ship-ready until proof is supplied or the claim is removed.",
        claims: 7,
        findings: 2,
        proofProvided: false,
        jsonPath: ".ralphy/workspaces/default/projects/demo-001/claims.json",
      },
    },
    {
      label: "eval.platform",
      shape: {
        verdict: "fail",
        blocksShip: true,
        applicable: true,
        platforms: ["tiktok", "reels"],
        reason: "2 platform spec violation(s) — wrong aspect / resolution / duration / codec / file-size. Blocks ship-ready until the media is conformed to the target platform.",
        mediaChecked: 1,
        findings: 2,
        jsonPath: ".ralphy/workspaces/default/projects/demo-001/platform-spec.json",
      },
    },
    {
      label: "eval.calibrate",
      shape: {
        gate: "first-frame-hook",
        offline: true,
        judgeModel: null,
        judgePromptVersion: "hook-v1",
        n: 6,
        confusion: { tp: 3, fp: 1, tn: 1, fn: 1 },
        tpr: 0.75,
        tnr: 0.5,
        precision: 0.75,
        recall: 0.75,
        accuracy: 0.6667,
        cohensKappa: 0.25,
        promotionKappaBar: 0.6,
        recommendation: "keep advisory (Cohen's kappa 0.250 < 0.6 bar).",
        examples: [
          { id: "strong-product-opener", expected: false, predicted: false, agree: true },
          { id: "empty-establishing-shot", expected: true, predicted: true, agree: true },
        ],
        jsonPath: null,
      },
    },
    {
      label: "eval.optimize-prompt",
      shape: {
        kind: "judge",
        gate: "first-frame-hook",
        promptSource: "/tmp/judge.txt",
        datasetSource: "/tmp/hooks.json",
        trainFraction: 0.6,
        seed: 0,
        baseline: { n: 4, cohensKappa: 0.2, accuracy: 0.6, tpr: 0.5, tnr: 0.66 },
        candidate: { n: 4, cohensKappa: 0.8, accuracy: 0.9, tpr: 1, tnr: 0.8 },
        comparison: {
          deltaKappa: 0.6,
          deltaAccuracy: 0.3,
          deltaTpr: 0.5,
          deltaTnr: 0.14,
          improved: true,
          improvementMargin: 0.02,
          summary: "candidate improves Cohen's kappa by 0.600 (>= 0.02 margin) on the held-out split — propose.",
        },
        recommendation: "propose",
        proposalPath: ".ralphy/prompt-proposals/proposal-v1",
      },
    },
    {
      label: "eval.optimize-prompt.dryRun",
      shape: {
        kind: "judge",
        gate: "first-frame-hook",
        promptSource: "/tmp/judge.txt",
        datasetSource: "/tmp/hooks.json",
        trainFraction: 0.6,
        seed: 0,
        trainSize: 6,
        heldOutSize: 4,
        dryRun: true,
        offline: false,
        costBearing: true,
        note: "dry-run — no offline seams; the real run would call the live judge (held-out x2) + the LLM optimizer (paid).",
      },
    },
    {
      label: "eval.metrics.dryRun",
      shape: {
        project: "demo-001",
        mode: "ugc-review",
        dryRun: true,
        adapters: [
          { adapter: "tts-wer", label: "TTS Word Error Rate", capability: "voice", available: true, threshold: 0.15, hint: null },
          { adapter: "image-aesthetic", label: "Image aesthetic / prompt-alignment", capability: "image", available: false, threshold: 0.5, hint: "no aesthetic scorer configured — set metrics.imageAesthetic.scorer (a registered connector) or install a local scorer" },
        ],
        note: "dry-run — availability + thresholds only, no adapters executed (ZERO model calls).",
      },
    },
    {
      label: "eval.metrics.run",
      shape: {
        project: "demo-001",
        mode: "ugc-review",
        dryRun: false,
        metrics: [
          { adapter: "tts-wer", capability: "voice", status: "pass", score: 0.08, threshold: 0.15, reason: "WER 8.0% ≤ 15% — the VO transcribes back to the script intelligibly." },
          { adapter: "image-aesthetic", capability: "image", status: "na", score: null, threshold: 0.5, reason: "no aesthetic scorer configured — set metrics.imageAesthetic.scorer (a registered connector) or install a local scorer" },
        ],
        enrichedEvalJson: true,
        evalPath: ".ralphy/workspaces/default/projects/demo-001/eval.json",
        note: "metric results merged into eval.json under `metrics` (prior version archived).",
      },
    },
    {
      label: "eval.run",
      shape: {
        projectId: "demo-001",
        mode: "ugc-review",
        format: "video",
        platforms: ["tiktok", "reels"],
        dryRun: true,
        plan: [
          { gate: "structure", willRun: true, wouldWrite: "eval.json", costBearing: false },
          { gate: "native-video", willRun: true, wouldWrite: "eval.json", costBearing: true },
          { gate: "first-frame-hook", willRun: false, wouldWrite: "hook.json", costBearing: false, reason: "no render/final.mp4 — render the project before the video gates." },
          { gate: "distribution-pack", willRun: false, wouldWrite: null, costBearing: false, reason: "advisory — produced by `ralphy unit package`, not the flywheel." },
        ],
        gatesAttempted: [],
        gatesSkipped: [],
        costBearingGates: ["native-video"],
        failures: [],
        scorecardVerdict: null,
        scorecardReason: null,
        nextAction: "dry-run — no gates executed. Re-run without --dry-run to run the plan.",
      },
    },
  ],
  example: [
    { label: "example.list", shape: { manifestUpdated: "2026-06-01", examples: ["choose-silenthill-001", "noski-people-001"] } },
    { label: "example.pull", shape: { exampleId: "choose-silenthill-001", localId: "choose-silenthill-001", projDir: ".ralphy/workspaces/default/projects/choose-silenthill-001", source: "https://github.com/alecs5am/ralphy-assets" } },
  ],
  farm: [
    {
      label: "farm.status",
      shape: {
        workspace: "my-studio",
        daemon: { running: true, pid: 4242, pidFile: ".ralphy/farm/my-studio.pid" },
        counts: { running: 1, "parked-approval": 1, "halted-budget": 0, "halted-failure": 0, complete: 3 },
        runs: [
          {
            id: "farm-news-20260706-090000",
            workflow: "news",
            status: "parked-approval",
            completedNodes: 2,
            skippedNodes: 1,
            totalNodes: 6,
            spendUsd: 0.12,
            updatedAt: "2026-07-06T09:00:12.000Z",
            detail: "approval node \"ask\": no run approval is recorded yet",
          },
        ],
      },
    },
    { label: "farm.stop", shape: { workspace: "my-studio", stopped: true, pid: 4242, detail: "the loop exits after the node in flight; runs resume on the next start" } },
    { label: "farm.stop.dead", shape: { workspace: "my-studio", stopped: false, pid: null, detail: "no live farm process (stale pidfile cleared if present)" } },
  ],
  generate: [
    { label: "generate.queued", shape: { queued: true, id: "job-2026-06-15-abc123", kind: "image", project: "demo-001" } },
    {
      label: "generate.dryRun",
      shape: {
        dryRun: true,
        would_call: [
          { stage: "image", model_id: "google/gemini-3-pro-image-preview", slot: "scene-01-bg-image", variants: 1, est_usd: 0.15 },
        ],
        cost_estimate_usd: 0.15,
        would_write: [".ralphy/workspaces/default/projects/demo-001/artifacts/images/scene-01-bg-image.png"],
      },
    },
    {
      label: "generate.result",
      shape: {
        project: "demo-001",
        slot: "scene-01-bg-image",
        model: "google/gemini-3-pro-image-preview",
        variants: [
          { path: "artifacts/images/scene-01-bg-image.png", bytes: 884512, cost_usd: 0.15 },
        ],
      },
    },
  ],
  guideline: [
    {
      label: "guideline.list",
      shape: [
        { slug: "photoreal-humans", kind: "image", models: ["openai/gpt-5.4-image-2"] },
        { slug: "anti-ai-slop", kind: "image", models: ["google/gemini-3-pro-image-preview"] },
      ],
    },
    { label: "guideline.show", shape: { slug: "photoreal-humans", tag: "@guideline:photoreal-humans", name: "Photoreal humans", kind: "image", models: ["openai/gpt-5.4-image-2"], body: "Name the camera + lens; demand skin pores..." } },
  ],
  hyperframes: [
    { label: "hyperframes.lint", shape: { project: "demo-001", exitCode: 0 } },
    { label: "hyperframes.saveVersion", shape: { project: "demo-001", slot: "index.html", source: "index.html", dest: "compositions/v3.html" } },
  ],
  image: [
    { label: "image.resize", shape: { src: "in.png", dst: "out.png", long: 512, trimAlpha: true } },
    { label: "image.crunch", shape: { src: "in.png", dst: "out.png", scale: 0.5, noise: 0.1 } },
  ],
  init: [
    { label: "init.created", shape: { project: "demo-001", root: ".ralphy/workspaces/default/projects/demo-001", workspace: "default", created: true } },
  ],
  library: [
    {
      label: "library.units",
      shape: [
        { id: "unit-spring-001", format: "video", template: "ugc-talking-head" },
        { id: "unit-summer-002", format: "carousel", template: "swipe-deck" },
      ],
    },
    { label: "library.blueprints", shape: [{ unitId: "unit-spring-001", createdAt: "2026-06-01" }, { unitId: "unit-summer-002", createdAt: null }] },
  ],
  memory: [
    { label: "memory.note", shape: { slug: "kling-no-ru-audio", type: "feedback", scope: "global", path: "memory/feedback_kling.md", versioned: false, overwritten: false } },
    {
      label: "memory.recall",
      shape: [
        { slug: "vg-model-picks", type: "feedback", title: "VG model picks" },
        { slug: "photoreal-still-register", type: "feedback", title: "Photoreal still-photo register" },
      ],
    },
  ],
  lessons: [
    {
      label: "lessons.route",
      shape: {
        project: "choose-path-001",
        workspace: "default",
        model: "anthropic/claude-sonnet-4.6",
        sources: ["postmortem/02-lessons.md", "eval.json", "generations.jsonl (error rows)"],
        dry_run: false,
        routes: {
          memory: [
            {
              route: "memory",
              title: "Ban music in Kling prompts",
              detail: "Always ban music explicitly in kling-v3.0-pro prompts.",
              provenance: "choose-path-001 / 02-lessons.md",
              confidence: "high",
              does_not_apply_to: "Models without native audio.",
              tier: "global",
              slug: "kling-no-music",
              existingSlug: "kling-music-ban",
            },
          ],
          "MODELS.md": [
            {
              route: "MODELS.md",
              title: "Seedance blocks photoreal human anchors",
              detail: "Route human i2v to kling.",
              provenance: "choose-path-001 / generations.jsonl error rows",
              confidence: "high",
            },
          ],
        },
        staged: [{ slug: "kling-no-music", tier: "global", file: "kling-no-music.md", path: "memory/proposed/kling-no-music.md" }],
      },
    },
  ],
  migrate: [
    {
      label: "migrate.report",
      shape: {
        dryRun: true,
        from: "workspace/",
        to: ".ralphy/",
        moves: [
          { src: "workspace/projects/demo-001", dst: ".ralphy/workspaces/default/projects/demo-001" },
        ],
      },
    },
  ],
  models: [
    {
      label: "models.list",
      shape: {
        fetchedAt: "2026-06-14T18:55:38Z",
        count: 2,
        models: [
          { id: "kwaivgi/kling-v3.0-pro", durations: "5,10", resolutions: "720p,1080p", aspects: "16:9,9:16,1:1", frames: "first_frame,last_frame", priceUsd5s: 2.0 },
          { id: "bytedance/seedance-2.0", durations: "5,10,15", resolutions: "720p", aspects: "16:9,9:16", frames: "first_frame", priceUsd5s: 1.5 },
        ],
      },
    },
    {
      label: "models.recommend",
      shape: {
        query: { mode: "ugc-review", task: "i2v", kind: "video" },
        recommendation: {
          model: "kwaivgi/kling-v3.0-pro",
          basis: "observed",
          reason: "100% ok over 4 attempts in 2 project(s), eval 88",
          outcome: {
            model: "kwaivgi/kling-v3.0-pro",
            mode: "ugc-review",
            task: "i2v",
            attempts: 4,
            ok: 4,
            okRate: 1,
            failureRate: 0,
            failureByClass: {},
            avgCostUsd: 0.7,
            avgEvalScore: 88,
            recentEvalVerdict: "pass",
            sampleProjects: 2,
          },
          alternatives: [],
        },
        override: null,
        scanned: { projects: 2, rows: 4 },
      },
    },
    {
      label: "models.preflight",
      shape: {
        kind: "video",
        model: "kwaivgi/kling-v3.0-pro",
        ok: false,
        violations: [
          {
            field: "frames",
            severity: "fail",
            message: "kwaivgi/kling-v3.0-pro first_frame AND last_frame together return 400 (#008)",
            hint: "use bytedance/seedance-2.0 for first+last frame anchoring",
          },
          {
            field: "audio",
            severity: "warn",
            message: "kwaivgi/kling-v3.0-pro --audio renders speech EN only",
            hint: "confirm the audience language is English",
          },
        ],
        hints: ["kwaivgi/kling-v3.0-pro --audio renders speech in EN only"],
        recommendedFallbacks: ["bytedance/seedance-2.0"],
      },
    },
  ],
  new: [
    { label: "new.created", shape: { id: "spring-2026-001", root: ".ralphy/workspaces/default/projects/spring-2026-001", brief: "elly coffee spring drop" } },
  ],
  persona: [
    { label: "persona.show", shape: { id: "barista-anna", name: "Anna", age: 27, look: "warm, candid, natural light" } },
    {
      label: "persona.list",
      shape: [
        { id: "barista-anna", name: "Anna" },
        { id: "gymbro-max", name: "Max" },
      ],
    },
  ],
  project: [
    {
      label: "project.list",
      shape: [
        { id: "spring-2026-001", status: "render", brand: "ellycoffee", cost_usd: 2.41 },
        { id: "spring-2026-002", status: "assets", brand: "ellycoffee", cost_usd: 0.85 },
      ],
    },
    { label: "project.status", shape: { id: "demo-001", status: "assets", steps: { scenario: true, prompts: true, assets: false, render: false } } },
    { label: "project.deleted", shape: { deleted: "demo-001" } },
    {
      label: "project.image-pack.scaffold",
      shape: {
        project: "take-a-minute-001",
        kind: "app-store",
        aspect: "9:16",
        slotCount: 10,
        slots: [
          { id: "hero", role: "hero", compositionClass: "device-frame-headline" },
          { id: "cta", role: "cta", compositionClass: "text-card-cta" },
        ],
        packJson: "pack.json",
        promptsJsonl: "prompts/pack.jsonl",
        batchCommand: "ralphy generate image --project take-a-minute-001 --batch prompts/pack.jsonl --aspect 9:16",
      },
    },
    {
      label: "project.image-pack.score",
      shape: {
        project: "take-a-minute-001",
        kind: "app-store",
        expectedSlots: 10,
        coveredSlots: 0,
        selectedCount: 0,
        verdict: "fail",
        score: 75,
        findings: [
          { id: "IP1", category: "image-pack.role-coverage", severity: "fail", sceneIndex: null, timestampSec: null, message: "missing slots", fixHint: "generate them", fixCommand: "ralphy generate image ..." },
        ],
      },
    },
    {
      label: "project.approve",
      shape: {
        project: "spring-001",
        scope: "project",
        capUsd: 10,
        allowedModes: ["ugc-review", "unboxing-ugc"],
        expiry: "2026-06-17T00:00:00.000Z",
        reason: "approved batch run",
        approvedAt: "2026-06-16T00:00:00.000Z",
        approvals: 1,
        artifact: "spend-ledger.json",
      },
    },
    {
      label: "project.budget",
      shape: {
        project: "spring-001",
        hasLedger: true,
        capUsd: 10,
        spentUsd: 6.4,
        remainingUsd: 3.6,
        overBudget: false,
        expired: false,
        activeApproval: {
          scope: "project",
          budgetCapUsd: 10,
          allowedModes: ["ugc-review"],
          expiry: "2026-06-17T00:00:00.000Z",
          reason: "approved batch run",
          approvedAt: "2026-06-16T00:00:00.000Z",
        },
        approvals: [
          {
            scope: "project",
            budgetCapUsd: 10,
            allowedModes: ["ugc-review"],
            expiry: "2026-06-17T00:00:00.000Z",
            reason: "approved batch run",
            approvedAt: "2026-06-16T00:00:00.000Z",
          },
        ],
      },
    },
    {
      label: "project.grade-plan",
      shape: {
        project: "spring-001",
        verdict: "weak",
        reason: "Plan is executable but has fixable gap(s): researchGrounding. Tighten before locking the contract.",
        mode: "unboxing-ugc",
        dimensions: [
          { dimension: "modeFit", status: "pass", score: 95, note: "Confident mode \"unboxing-ugc\" (confidence 0.90)." },
          { dimension: "researchGrounding", status: "warn", score: 70, note: "Mode expects \"quick\" research but the plan cites no benchmarkSource." },
        ],
        artifacts: { json: "plan-grade.json", markdown: "PLAN_GRADE.md" },
      },
    },
  ],
  prompts: [
    {
      label: "prompts.lookup",
      shape: {
        matches: [
          { slug: "saas-hook-01", score: 0.82, goal: "saas hook" },
          { slug: "saas-hook-02", score: 0.71, goal: "saas hook" },
        ],
      },
    },
  ],
  publish: [
    {
      label: "publish.unit",
      shape: {
        project: "spring-2026-001",
        slug: "hero-cut",
        type: "schedule",
        scheduleAt: "2026-07-13T09:00:00.000Z",
        results: [
          { target: "tiktok", integrationId: "int-tt-1", status: "scheduled", postId: "p-01", scheduleAt: "2026-07-13T09:00:00.000Z" },
          { target: "youtube", integrationId: "int-yt-1", status: "failed", postId: null, scheduleAt: "2026-07-13T09:00:00.000Z", error: "postiz POST 500" },
        ],
        unitDir: ".ralphy/workspaces/default/projects/spring-2026-001/units/hero-cut",
        readiness: { verdict: "ship", bypassed: false },
      },
    },
  ],
  provider: [
    { label: "provider.show", shape: { provider: "openrouter", envVar: "OPENROUTER_API_KEY", configured: true, capabilities: ["image", "video", "llm"] } },
    {
      label: "provider.matrix",
      shape: {
        filter: { model: "bytedance/seedance-2.0", capability: null },
        count: 2,
        entries: [
          {
            provider: "openrouter",
            model: "bytedance/seedance-2.0",
            capability: "video",
            family: "seedance-2.0",
            supportedParams: ["prompt", "durationSec", "firstFrame", "lastFrame", "refs"],
            unsupportedParams: ["refVideos"],
            source: "hand-curated",
            notes: "~40% of the native seedance surface: image input_references only.",
          },
          {
            provider: "fal",
            model: "bytedance/seedance-2.0/reference-to-video",
            capability: "video",
            family: "seedance-2.0",
            supportedParams: ["prompt", "durationSec", "firstFrame", "lastFrame", "refs", "refVideos"],
            unsupportedParams: [],
            source: "hand-curated",
            notes: null,
          },
        ],
      },
    },
  ],
  queue: [
    { label: "queue.add", shape: { id: 42, kind: "shell", argv: ["ralphy", "render", "demo-001"], depends_on: [41] } },
    { label: "queue.list", shape: { counts: { pending: 2, running: 1, done: 5 }, jobs: [{ id: 42, status: "failed", kind: "generate.image", priority: 0, deps: "-", argv: "generate image --slot …", slot: "scene-01-image-hero", model: "openai/gpt-5.4-image-2", refCount: 2, promptPreview: "a hero shot", attempts: 1, runtimeMs: 4200, exit: 1, lastError: "OpenRouter 403: Key limit exceeded (total limit)", hint: "OpenRouter burst-cap hit (per-key concurrent-call limit, NOT a $ balance issue).", errorClass: "provider-transient", retryPolicy: "retry-with-backoff", nextAction: "OpenRouter burst-cap hit (per-key concurrent-call limit, NOT a $ balance issue).", tag: "batch-1", project: "demo-001" }] } },
  ],
  ref: [
    { label: "ref.show", shape: { id: "old-spice-bottle", kind: "refs", path: "artifacts/refs/old-spice.png", bytes: 442100 } },
    { label: "ref.check", shape: { project: "demo-001", result: { needs_ref: true, matched: ["Old Spice"], category: "brand-product" }, examples_in_prompts: 2 } },
    { label: "ref.frames", shape: { slug: "tiktok-ref", dir: "artifacts/refs/tiktok-ref/frames", count: 24 } },
    {
      label: "ref.pack",
      shape: {
        project: "demo-001",
        path: "ref-pack.json",
        md: "REF_PACK.md",
        total: 2,
        byType: { product: 1, style: 1 },
        locked: ["artifacts/refs/hero.png"],
        entries: [
          { type: "product", path: "artifacts/refs/hero.png", locked: true, source: "manual --add" },
          { type: "style", path: "artifacts/refs/mood.png", locked: false, source: "project artifacts/refs" },
        ],
        modeReport: { mode: "product-shot", required: ["product"], missing: [], satisfied: true },
      },
    },
    {
      label: "ref.lint",
      shape: {
        project: "demo-001",
        verdict: "warn",
        ok: true,
        total: 3,
        mode: "ad-creative-pack",
        reason: "2 ref warning(s) — tiny resolution / duplicate / temp path / missing provenance. Review before generating.",
        findings: [
          { id: "REF1", category: "ref.tiny-resolution", severity: "warn", message: "benchmark ref `artifacts/refs/thumb.png`: 64x64 — shorter side 64px is below the 256px floor.", fixHint: "Replace it with a full-resolution version (>= 256px on the short side)." },
          { id: "REF2", category: "ref.missing-provenance", severity: "warn", message: "style ref `artifacts/refs/orphan.png`: no provenance (neither source nor note set).", fixHint: "Record where it came from via `ralphy ref pack demo-001 --add ... --note`." },
        ],
        contactSheet: "artifacts/refs/contact-sheet.png",
      },
    },
    {
      label: "ref.contact-sheet",
      shape: {
        project: "demo-001",
        contactSheet: "artifacts/refs/contact-sheet.png",
        cols: 2,
        groups: [
          { type: "product", count: 2 },
          { type: "style", count: 1 },
        ],
      },
    },
  ],
  render: [
    { label: "render.done", shape: { project: "demo-001", out: "render/final.mp4", durationSec: 32, bytes: 8421000 } },
  ],
  research: [
    {
      label: "research.run",
      shape: {
        jobId: "research-2026-06-15-001",
        question: "what is trending in dev-tool UGC",
        sources: [{ url: "https://example.com/a", verified: true }],
        claims: 12,
      },
    },
  ],
  run: [
    {
      label: "run.list",
      shape: [
        { id: "spring-drop-farm-a1b2", title: "Spring drop farm", status: "active", workspace: "default", projects: 3, workflow: "episode" },
        { id: "q3-ads-c3d4", title: "Q3 ads", status: "complete", workspace: "default", projects: 8, workflow: null },
      ],
    },
    {
      label: "run.show",
      shape: {
        version: 1,
        id: "spring-drop-farm-a1b2",
        workspace: "default",
        title: "Spring drop farm",
        brief: "30 cold-traffic creatives",
        status: "active",
        createdAt: "2026-06-24T00:00:00.000Z",
        workflow: "episode",
        projectIds: ["spring-001", "spring-002"],
        batchId: "spring-batch-001",
      },
    },
    {
      label: "run.status",
      shape: {
        id: "spring-drop-farm-a1b2",
        workspace: "default",
        title: "Spring drop farm",
        status: "active",
        projectCount: 2,
        missingProjects: ["spring-003"],
        currentPhase: "assets",
        blockers: [
          { project: "spring-001", id: "user-approval-needed", phase: "production-plan", detail: "production plan written; wait for the user's go." },
        ],
        awaitingApprovals: [{ project: "spring-001", detail: "spring-001: approve to advance the scenario step." }],
        costSummary: {
          spentUsd: 2.4,
          capUsd: 20,
          remainingUsd: 17.6,
          overBudget: false,
          queuedEstimateUsd: 0.6,
          byProject: [
            { project: "spring-001", spentUsd: 1.6, capUsd: 10 },
            { project: "spring-002", spentUsd: 0.8, capUsd: 10 },
          ],
        },
        qualitySummary: [
          { project: "spring-001", verdict: "repair", polished: false, reason: "caption density warn" },
          { project: "spring-002", verdict: "ship", polished: true, reason: "all required dimensions pass" },
        ],
        winners: ["spring-002"],
        failures: [],
        nextAction: "Clear the blocker on \"spring-001\" (user-approval-needed at phase production-plan).",
      },
    },
    { label: "run.add-project", shape: { run: "spring-drop-farm-a1b2", workspace: "default", projectIds: ["spring-001", "spring-002", "spring-003"] } },
    {
      label: "run.approve",
      shape: {
        run: "spring-drop-farm-a1b2",
        scope: "run",
        capUsd: 50,
        allowedModes: ["ugc-review", "unboxing-ugc"],
        expiry: "2026-06-25T00:00:00.000Z",
        reason: "approved farm run",
        approvedAt: "2026-06-24T00:00:00.000Z",
        approvals: 1,
        artifact: "runs/spring-drop-farm-a1b2/spend-ledger.json",
      },
    },
    {
      label: "run.budget",
      shape: {
        run: "spring-drop-farm-a1b2",
        hasLedger: true,
        capUsd: 50,
        spentUsd: 12.4,
        remainingUsd: 37.6,
        overBudget: false,
        queuedEstimateUsd: 3.2,
        expired: false,
        activeApproval: {
          scope: "run",
          budgetCapUsd: 50,
          allowedModes: ["ugc-review"],
          expiry: "2026-06-25T00:00:00.000Z",
          reason: "approved farm run",
          approvedAt: "2026-06-24T00:00:00.000Z",
        },
        byProject: [
          { project: "spring-001", spentUsd: 8.4 },
          { project: "spring-002", spentUsd: 4.0 },
        ],
        approvals: [
          {
            scope: "run",
            budgetCapUsd: 50,
            allowedModes: ["ugc-review"],
            expiry: "2026-06-25T00:00:00.000Z",
            reason: "approved farm run",
            approvedAt: "2026-06-24T00:00:00.000Z",
          },
        ],
      },
    },
  ],
  setup: [
    {
      label: "setup.report",
      shape: {
        OPENROUTER_API_KEY: { ok: true },
        ELEVENLABS_API_KEY: { ok: false, hint: "missing" },
        layout: ".ralphy/",
        ready: false,
      },
    },
  ],
  skill: [
    {
      label: "skill.install",
      shape: {
        installed: [
          { ok: true, agent: "claude", scope: "user", installed: ["/a/path", "/b/path"] },
        ],
      },
    },
    {
      label: "skill.list",
      shape: {
        skills: [
          { name: "evaluator", namespace: "user", description: "score a rendered mp4" },
          { name: "researcher", namespace: "user", description: "URL teardown" },
          { name: "skill-creator", namespace: "maintainer", description: "scaffold a skill" },
        ],
      },
    },
  ],
  status: [
    { label: "status.report", shape: { version: "0.3.0", workspace: "default", projects: 4, lastRender: "demo-001", keys: { openrouter: true, elevenlabs: false } } },
  ],
  template: [
    {
      label: "template.list",
      shape: [
        { slug: "ugc-talking-head", format: "video", category: "creator-lifestyle" },
        { slug: "swipe-deck", format: "carousel", category: "b2b-saas" },
      ],
    },
    { label: "template.suggest", shape: { brief: "unboxing", content_mode: "unboxing-ugc", ambiguous: false, matches: [{ slug: "ugc-unboxing", score: 0.9 }] } },
  ],
  unit: [
    {
      label: "unit.create",
      shape: {
        project: "demo-001",
        slug: "spring-hero",
        format: "video",
        media: [{ path: "units/spring-hero/01.mp4", kind: "video" }],
        provenance: { template: "ugc-talking-head", style: "ellycoffee-warm" },
      },
    },
    {
      label: "unit.package",
      shape: {
        slug: "spring-hero",
        format: "video",
        pack_file: "distribution-pack.json",
        handoff_file: "DISTRIBUTION.md",
        zip_file: "spring-hero-distribution.zip",
        copy_dir: "units/spring-hero/distribution",
        copied: ["01.mp4", "cover.png"],
        platforms: ["tiktok", "reels", "shorts"],
        thumbnail: "cover.png",
        shippable: false,
        readiness_verdict: "needs-user-decision",
        spec_verdict: "pass",
        drafted_caption: false,
        versioned: false,
      },
    },
  ],
  version: [
    { label: "version.info", shape: { version: "0.3.0", channel: "stable", node: "22.10.0", bun: "1.3.14" } },
  ],
  video: [
    { label: "video.trim", shape: { src: "in.mp4", dst: "out.mp4", startSec: 1.2, endSec: 6.4 } },
    { label: "video.concat", shape: { srcs: ["a.mp4", "b.mp4"], dst: "stitched.mp4", crossfadeSec: 0.5 } },
  ],
  voice: [
    {
      label: "voice.list",
      shape: [
        { id: "b3M1tF3Y3IEwGRpq7NN3", name: "ChoosePath narrator", category: "cloned" },
        { id: "Otru0RNflHgPMKdwZWfB", name: "Diana", category: "cloned" },
      ],
    },
  ],
  whoami: [
    {
      label: "whoami.profile",
      shape: {
        is_developer: true,
        skill: { score: 8, band: "experienced" },
        signals: { projects_done: 12, postmortems: 5 },
        recommendation: "terse intake — expert user",
      },
    },
  ],
  studio: [
    {
      label: "studio.inbox.list",
      shape: [
        {
          id: "2026-06-25T07-48-26-123Z-abc-repair",
          scope: "project",
          scopeId: "spring-001",
          workspace: "default",
          action: "repair",
          createdAt: "2026-06-25T07:48:26.123Z",
          selectedCount: 2,
          requestedOutcome: "regenerate scene-01 with a stronger cold open",
          jsonPath: ".ralphy/workspaces/default/projects/spring-001/agent-inbox/2026-06-25T07-48-26-123Z-abc-repair.json",
          mdPath: ".ralphy/workspaces/default/projects/spring-001/agent-inbox/2026-06-25T07-48-26-123Z-abc-repair.md",
        },
      ],
    },
    {
      label: "studio.inbox.show",
      shape: {
        scope: "project",
        scopeId: "spring-001",
        jsonPath: ".ralphy/workspaces/default/projects/spring-001/agent-inbox/x-repair.json",
        mdPath: ".ralphy/workspaces/default/projects/spring-001/agent-inbox/x-repair.md",
        version: 1,
        kind: "agent-inbox",
        id: "2026-06-25T07-48-26-123Z-abc-repair",
        action: "repair",
        createdAt: "2026-06-25T07:48:26.123Z",
        workspace: "default",
        run: null,
        project: "spring-001",
        selected: [
          { type: "artifact", ref: "artifacts/images/scene-01-hub.png", path: ".ralphy/workspaces/default/projects/spring-001/artifacts/images/scene-01-hub.png", tags: ["weak-hook"], note: "soft open" },
        ],
        tags: ["weak-hook"],
        note: "the hook isn't landing",
        requestedOutcome: "regenerate scene-01 with a stronger cold open",
      },
    },
    {
      label: "studio.patch.list",
      shape: {
        patches: [
          { id: "kx12-ab34", field: "variantCount", value: 3, target: null, state: "pending", note: "bump variants", proposedAt: "2026-06-25T08:00:00.000Z" },
          { id: "kx12-cd56", field: "destinationEnabled", value: false, target: "tiktok-main", state: "applied", note: "", proposedAt: "2026-06-25T07:50:00.000Z", decidedAt: "2026-06-25T07:55:00.000Z", reason: "paused while we fix the hook" },
        ],
        effectiveConfig: { destinationEnabled: { value: false, target: "tiktok-main" } },
      },
    },
    {
      label: "studio.patch.show",
      shape: { id: "kx12-ab34", field: "variantCount", value: 3, target: null, state: "pending", note: "bump variants", proposedAt: "2026-06-25T08:00:00.000Z" },
    },
  ],
  workflow: [
    {
      label: "workflow.list",
      shape: [{ name: "episode", path: ".ralphy/workspaces/silent-hill/workflows/episode.json" }],
    },
    {
      label: "workflow.show",
      shape: {
        workspace: "silent-hill",
        name: "episode",
        version: "1.0",
        steps: [
          { id: "scenario", label: "Scenario", phase: "scenario", engine: "llm", model: "google/gemini-3.1-pro-preview", variants: 1, gate: ["scenario-fidelity"], mode: "approve" },
          { id: "assets", label: "Scene generation", phase: "assets", engine: "generate.video", model: null, variants: 2, gate: ["character-design-cohesion", "location-consistency"], mode: "approve" },
          { id: "render", label: "Render", phase: "render", engine: "render", model: null, variants: 1, gate: [], mode: "auto" },
        ],
      },
    },
    {
      label: "workflow.run-node",
      shape: {
        workspace: "tech-news",
        workflow: "pipeline",
        node: "watch",
        type: "trend-watch",
        items: 2,
        artifactPath: ".ralphy/workspaces/tech-news/runs/run-node/pipeline/watch.json",
        costUsd: 0,
        output: [
          {
            url: "https://example.com/posts/a",
            title: "Post A",
            text: "summary of post A",
            ts: "2026-07-01T00:00:00.000Z",
            source: { backend: "rss", feed: "https://example.com/feed.xml" },
          },
          {
            url: "https://example.com/posts/b",
            title: "Post B",
            text: "",
            ts: "2026-07-02T00:00:00.000Z",
            source: { backend: "firecrawl", query: "ai video news" },
            engagement: { views: 1200, likes: 40, shares: null, comments: 3 },
          },
        ],
      },
    },
    {
      label: "workflow.lint",
      shape: {
        workspace: "silent-hill",
        ok: false,
        errorCount: 1,
        warningCount: 1,
        workflows: [
          {
            name: "tech-news",
            path: ".ralphy/workspaces/silent-hill/workflows/tech-news.json",
            format: "json",
            kind: "graph",
            size: 7,
            ok: false,
            errors: [
              {
                level: "error",
                code: "coverage-unsupported-param",
                node: "clip",
                message: 'node "clip" passes param "refs" which provider "openrouter" does NOT support for kwaivgi/kling-v3.0-pro',
                fix: 'use provider "fal" with model "fal-ai/kling-video/o3/pro/reference-to-video", which supports it',
              },
            ],
            warnings: [
              {
                level: "warning",
                code: "coverage-uncovered-param",
                node: "clip",
                message: 'node "clip" param "loop" is outside provider "openrouter" declared coverage for kwaivgi/kling-v3.0-pro',
                fix: 'drop "loop" or pick a (model, provider) pair that covers it (see `ralphy provider matrix --model kwaivgi/kling-v3.0-pro`)',
              },
            ],
          },
          {
            name: "episode",
            path: ".ralphy/workspaces/silent-hill/workflows/episode.json",
            format: "json",
            kind: "linear",
            size: 6,
            ok: true,
            errors: [],
            warnings: [],
          },
        ],
      },
    },
  ],
  workspace: [
    {
      label: "workspace.list",
      shape: [
        { slug: "default", projects: 4, active: true },
        { slug: "ellycoffee", projects: 2, active: false },
      ],
    },
    { label: "workspace.show", shape: { slug: "ellycoffee", projects: 2, shared: { refs: 5, music: 3 }, memory: { entries: 8 } } },
    {
      label: "workspace.update",
      shape: {
        workspace: "silent-hill",
        trust: { level: "L1", autoPublishScore: 85, promotionStreak: 10, demoteOnReject: true },
      },
    },
    {
      label: "workspace.trust",
      shape: {
        workspace: "silent-hill",
        level: "L1",
        autoPublishScore: 85,
        promotionStreak: 10,
        demoteOnReject: true,
        agreement: { samples: 12, matches: 11, rate: 0.9167, streak: 7 },
        promotion: {
          suggested: false,
          nextLevel: "L2",
          rule: "promotion is suggested when the streak of consecutive verdict-matching human decisions reaches 10 (current: 7) AND the overall agreement rate is >= 0.9 (current: 0.9167). Promotion is ALWAYS explicit: ralphy workspace update <ws> --trust-level L2",
        },
        autoPasses: 4,
        agreementLog: ".ralphy/workspaces/silent-hill/trust-agreement.jsonl",
        auditLog: ".ralphy/workspaces/silent-hill/trust-audit.jsonl",
      },
    },
    {
      label: "workspace.trust.empty",
      shape: {
        workspace: "fresh",
        level: "L0",
        autoPublishScore: 80,
        promotionStreak: 10,
        demoteOnReject: true,
        agreement: { samples: 0, matches: 0, rate: null, streak: 0 },
        promotion: { suggested: false, nextLevel: "L1", rule: "promotion is suggested when the streak reaches 10 (current: 0) AND the agreement rate is >= 0.9 (current: n/a)." },
        autoPasses: 0,
        agreementLog: ".ralphy/workspaces/fresh/trust-agreement.jsonl",
        auditLog: ".ralphy/workspaces/fresh/trust-audit.jsonl",
      },
    },
    {
      label: "workspace.export",
      shape: {
        workspace: "tech-news",
        out: "/work/tech-news-bundle-v1.0.0.zip",
        sizeBytes: 20480,
        contents: ["calendar.yaml", "evaluators/evaluators.json", "manifest.yaml", "pipeline.json", "refs/"],
        requiredConnectorKeys: ["ELEVENLABS_API_KEY", "OPENROUTER_API_KEY"],
        requiredCoverage: [{ model: "kwaivgi/kling-v3.0-pro", capability: "video", provider: "openrouter" }],
        version: "1.0.0",
        ralphyVersionFloor: "0.3.0",
        trustDefault: "L0",
      },
    },
    {
      label: "workspace.export.refused",
      shape: {
        workspace: "tech-news",
        exportable: false,
        gaps: [
          {
            id: "missing-evaluators",
            detail: 'no evaluators.json in workspace "tech-news" — the bundle must carry the workspace quality bar',
            fix: "author .ralphy/workspaces/tech-news/evaluators.json (see docs/workspace-evaluators.md)",
          },
        ],
      },
    },
    {
      label: "workspace.import",
      shape: {
        workspace: "my-channel",
        path: ".ralphy/workspaces/my-channel",
        bundle: { name: "tech-news", version: "1.0.0", trustDefault: "L0" },
        workflows: ["pipeline"],
        warnings: [],
      },
    },
    {
      label: "workspace.import.refused",
      shape: {
        imported: false,
        refusals: [
          {
            id: "version-floor",
            detail: "bundle requires ralphy >= 9.0.0, current is 0.3.0",
            fix: "upgrade ralphy (`brew upgrade ralphy` / `npm update -g @alecs5am/ralphy`) and re-run the import",
          },
        ],
      },
    },
    {
      label: "workspace.eval",
      shape: {
        verdict: "needs-user-decision",
        score: null,
        workspace: "fog",
        projectId: "choose-silenthill-001",
        criteria: 3,
        summary: 'Workspace "fog" rubric → needs-user-decision: 0 fail, 0 warn, 3 na across 3 criteria (vision skipped).',
        jsonPath: ".ralphy/workspaces/fog/projects/choose-silenthill-001/workspace-eval.json",
        mdPath: ".ralphy/workspaces/fog/projects/choose-silenthill-001/workspace-eval-report.md",
      },
    },
  ],
};

// Command files that call `out()` but ONLY ever emit a scalar (string / number)
// — those go through the `console.log(c.value(String(data)))` branch and have
// no table/kv structure to assert. Each MUST carry a reason. The lint allows
// these to skip the VERB_SHAPES registry.
export const EXEMPT: Record<string, string> = {
  // (currently none — every command verb that calls out() emits at least one
  // structured object/array shape. Kept as the documented escape hatch.)
};

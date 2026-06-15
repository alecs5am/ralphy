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
  ],
  example: [
    { label: "example.list", shape: { manifestUpdated: "2026-06-01", examples: ["choose-silenthill-001", "noski-people-001"] } },
    { label: "example.pull", shape: { exampleId: "choose-silenthill-001", localId: "choose-silenthill-001", projDir: ".ralphy/workspaces/default/projects/choose-silenthill-001", source: "https://github.com/alecs5am/ralphy-assets" } },
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
  provider: [
    { label: "provider.show", shape: { provider: "openrouter", envVar: "OPENROUTER_API_KEY", configured: true, capabilities: ["image", "video", "llm"] } },
  ],
  queue: [
    { label: "queue.add", shape: { id: 42, kind: "shell", argv: ["ralphy", "render", "demo-001"], depends_on: [41] } },
    { label: "queue.list", shape: { counts: { pending: 2, running: 1, done: 5 }, jobs: [{ id: 42, kind: "shell", status: "pending" }] } },
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
  workspace: [
    {
      label: "workspace.list",
      shape: [
        { slug: "default", projects: 4, active: true },
        { slug: "ellycoffee", projects: 2, active: false },
      ],
    },
    { label: "workspace.show", shape: { slug: "ellycoffee", projects: 2, shared: { refs: 5, music: 3 }, memory: { entries: 8 } } },
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

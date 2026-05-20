// Property-fuzz tests for cli/lib/output.ts pretty mode.
//
// The `installed [object Object]` regression slipped through because no test
// asserted on what the *user actually sees* in pretty mode — only on JSON
// shapes. This file fuzzes `out()` with realistic data shapes and enforces
// hard invariants on the rendered output. Any new printer-layer bug should
// trip one of these invariants without needing a per-verb test.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { out, setPretty } from "../../cli/lib/output.js";
import { setMode } from "../../cli/lib/ui.js";

let captured: string[] = [];
const originalLog = console.log;

beforeEach(() => {
  captured = [];
  console.log = (...args: unknown[]) => {
    captured.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
  setPretty(true);
  setMode("pretty");
});

afterEach(() => {
  console.log = originalLog;
  setPretty(false);
  setMode("auto");
});

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
const rendered = () => captured.map(stripAnsi).join("\n");

// ─── Invariants every pretty-mode render must satisfy ─────────────────────

function assertCleanRender(label: string) {
  const text = rendered();
  // Never the literal `[object Object]` — means the printer ran toString on
  // an object instead of recursing into it. This is the bug class that
  // shipped `installed  [object Object]` before c94960d.
  expect(text, `[${label}] contains [object Object]`).not.toContain("[object Object]");
  // Never bare `undefined` cells — those are uncovered null/undefined paths.
  // Note: an `undefined` token *inside* a longer string is fine; we only
  // catch standalone tokens.
  expect(text, `[${label}] contains a standalone 'undefined' cell`).not.toMatch(/[\s││|]undefined[\s││|]/);
  // Never JSON-escape syntax leaking into pretty output (e.g. `\"key\":`).
  expect(text, `[${label}] contains JSON-escape leakage`).not.toMatch(/\\"[a-z_]+\\":/);
}

// ─── Realistic shapes from cli/commands/ ──────────────────────────────────

const SHAPES: Array<[string, unknown]> = [
  // skill install — the original bug
  [
    "skill.install",
    {
      installed: [
        { ok: true, agent: "claude", scope: "user", installed: ["/a/path", "/b/path"] },
      ],
    },
  ],
  // skill list with multiple skills
  [
    "skill.list",
    {
      skills: [
        { name: "ralphy-evaluator", namespace: "ralphy", description: "score a rendered mp4" },
        { name: "ralphy-researcher", namespace: "ralphy", description: "URL teardown" },
        { name: "skill-creator", namespace: "ralphy-dev", description: "scaffold a skill" },
      ],
    },
  ],
  // project list — typical "list all" shape
  [
    "project.list",
    {
      projects: [
        { id: "spring-2026-001", status: "render", brand: "ellycoffee", cost_usd: 2.41 },
        { id: "spring-2026-002", status: "assets", brand: "ellycoffee", cost_usd: 0.85 },
      ],
    },
  ],
  // models list — wide table
  [
    "models.list",
    {
      models: [
        { id: "kwaivgi/kling-v3.0-pro", kind: "video", price_per_sec_usd: 0.4 },
        { id: "google/gemini-3-pro-image-preview", kind: "image", price_per_image_usd: 0.15 },
      ],
    },
  ],
  // generate dry-run — nested object + array
  [
    "generate.dryRun",
    {
      dryRun: true,
      would_call: [
        { stage: "image", model_id: "google/gemini-3-pro-image-preview", slot: "scene-01-bg-image", variants: 1, est_usd: 0.15 },
      ],
      cost_estimate_usd: 0.15,
      would_write: ["workspace/projects/demo-001/assets/scene-01-bg-image.png"],
    },
  ],
  // doctor — flat key/value
  [
    "doctor",
    {
      bun: { ok: true, version: "1.2.22" },
      ffmpeg: { ok: true, version: "7.1" },
      OPENROUTER_API_KEY: { ok: true },
      ELEVENLABS_API_KEY: { ok: false, hint: "set in .envrc" },
    },
  ],
  // queued / async job
  [
    "generate.queued",
    {
      queued: true,
      job_id: "job-2026-05-20-abc123",
      verb: "generate.video",
      project: "demo-001",
    },
  ],
  // ref check — mixed scalars + nested decision
  [
    "ref.check",
    {
      project: "demo-001",
      result: { needs_ref: true, matched: ["Old Spice"], category: "brand-product" },
      examples_in_prompts: 2,
    },
  ],
  // empty list — assets pulled
  ["assets.empty", { template: "noski", pulled: [] }],
  // scalar array — should render inline
  ["tags", { tags: ["a", "b", "c"], project: "demo-001" }],
  // deeply nested
  [
    "deep",
    {
      root: { mid: { leaf_str: "value", leaf_num: 42, leaf_arr: [1, 2, 3] } },
    },
  ],
  // null + undefined sprinkled (real-world: optional fields)
  [
    "nullish",
    {
      results: [
        { id: "a", status: "ok", error: null },
        { id: "b", status: "ok" }, // missing `error` field — different keys per row
      ],
    },
  ],
];

describe("output pretty fuzz — realistic shapes", () => {
  for (const [label, shape] of SHAPES) {
    test(`renders ${label} without [object Object] / undefined / JSON leaks`, () => {
      out(shape);
      assertCleanRender(label);
    });
  }
});

// ─── Random-shape fuzz (200 iterations) ───────────────────────────────────

function randomLeaf(): unknown {
  const r = Math.random();
  if (r < 0.15) return null;
  if (r < 0.25) return Math.random() < 0.5;
  if (r < 0.55) return Math.floor(Math.random() * 1000);
  return `v${Math.floor(Math.random() * 100)}`;
}

function randomObject(depth: number): Record<string, unknown> {
  const keys = ["id", "status", "name", "kind", "path", "cost_usd", "ts", "ok", "n", "kind", "model"];
  const n = 1 + Math.floor(Math.random() * 5);
  const obj: Record<string, unknown> = {};
  for (let i = 0; i < n; i++) {
    const k = keys[Math.floor(Math.random() * keys.length)]! + (i > 0 ? `_${i}` : "");
    if (depth > 0 && Math.random() < 0.3) {
      obj[k] = randomObject(depth - 1);
    } else if (Math.random() < 0.3 && depth > 0) {
      obj[k] = Array.from({ length: 1 + Math.floor(Math.random() * 3) }, () =>
        Math.random() < 0.5 ? randomObject(0) : randomLeaf(),
      );
    } else {
      obj[k] = randomLeaf();
    }
  }
  return obj;
}

describe("output pretty fuzz — random shapes", () => {
  test("200 random object shapes all render without [object Object]", () => {
    for (let i = 0; i < 200; i++) {
      captured = [];
      const shape = randomObject(3);
      out(shape);
      const text = rendered();
      if (text.includes("[object Object]")) {
        // Fail loudly with the offending shape so the regression is easy to
        // reproduce.
        throw new Error(`Iteration ${i}: rendered [object Object] for shape: ${JSON.stringify(shape)}`);
      }
    }
  });

  test("50 random top-level arrays of objects all render without [object Object]", () => {
    for (let i = 0; i < 50; i++) {
      captured = [];
      const rows = Array.from({ length: 1 + Math.floor(Math.random() * 4) }, () => randomObject(1));
      out(rows);
      const text = rendered();
      if (text.includes("[object Object]")) {
        throw new Error(`Iteration ${i}: rendered [object Object] for array: ${JSON.stringify(rows)}`);
      }
    }
  });
});

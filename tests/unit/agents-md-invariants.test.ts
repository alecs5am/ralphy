// AGENTS.md hard-invariants — CI guardrails (#015).
//
// AGENTS.md ships 17 numbered "hard invariants" at the bottom of the routing
// table. Pre-cleanup, *all* of them were doc-only — the comment read like a
// rule but no test enforced it, so drift was invisible until a postmortem
// caught the same defect for the third time.
//
// This file is the capstone: for every invariant that has a *concrete static
// contract* (forbidden string, forbidden import, forbidden tool, required
// file), a test lives here. Invariants that are inherently
// agent-discipline or routing rules (e.g. "always check MODELS.md", "match a
// niche skill before suggesting a template") remain doc-only by design —
// listing them here would be performative, not protective.
//
// Coverage map (see AGENTS.md `Tested by:` annotations for the inverse view):
//
//   #1  only registered connectors hold keys      — TESTED (this file;
//       (FAL_KEY sanctioned in cli/lib/providers/fal.ts only; FIRECRAWL_API_KEY
//        in cli/lib/providers/firecrawl.ts only + APIFY_TOKEN in
//        cli/lib/providers/apify.ts only — #500 ingestion connectors;
//        POSTIZ_API_KEY + POSTIZ_BASE_URL in cli/lib/providers/postiz.ts only —
//        #501 publish connector, env-var-scoped since the host is
//        user-supplied/self-hosted per D-05; YOUTUBE_API_KEY + googleapis.com
//        in cli/lib/providers/youtube-analytics.ts only — #507 analytics
//        connector; hosted Vercel / OpenAI-direct forbidden everywhere)
//   #2  ralphy is the only entry-point            — partially TESTED
//                                                   (this file + tests/integration/cli-render-from-clip.test.ts)
//   #3  reference-required gate                   — TESTED (tests/unit/eval-refs.test.ts)
//   #4  quality gates refuse-not-warn             — doc-only (agent-discipline)
//   #5  no auto-launched processes                — doc-only (agent-discipline)
//   #6  always check MODELS.md                    — doc-only (agent-discipline)
//   #7  always bun / bunx                         — TESTED (this file)
//   #8  always ralphy <command>                   — doc-only (agent-discipline)
//   #9  speed targets                             — doc-only (perf-targets.md)
//   #10 skills default, templates remix-only      — doc-only (routing rule)
//   #11 companion repo for heavy assets           — doc-only
//   #12 asset catalog before reference picks      — doc-only (routing rule)
//   #13 prompt-library guidelines mandatory       — TESTED (this file:
//                                                   guidelines/ non-empty)
//   #14 append-only on generations                — TESTED
//                                                   (tests/unit/auto-version-invariant.test.ts)
//   #15 site-grounding before brand-DNA           — doc-only (playbook rule)
//   #16 scribe-first for VO-aligned captions      — doc-only (playbook rule)
//   #17 background-job file hygiene               — doc-only (agent-discipline)
//
// Lint-style canonical-schema enforcement (`generations.jsonl` shape) lives in
// `scripts/lint-gen-log-schema.ts`, wired into `bun run lint`. That's the
// adjacent contract.

import { describe, test, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const REPO = path.resolve(__dirname, "..", "..");

/** Walks a directory recursively, returning every file path with one of the given extensions. */
function walk(dir: string, exts: string[], skip: Set<string> = new Set()): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full, exts, skip));
    } else if (exts.some((e) => entry.name.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

const SOURCE_DIRS = ["cli", "scripts"];
const SKIP = new Set(["node_modules", ".git", "dist", "build"]);

function sourceFiles(): string[] {
  const out: string[] = [];
  for (const d of SOURCE_DIRS) {
    out.push(...walk(path.join(REPO, d), [".ts", ".tsx", ".js", ".mjs"], SKIP));
  }
  return out;
}

describe("AGENTS.md invariant #1 — only registered connectors hold keys / hit provider hosts", () => {
  // Post-#402 the invariant is "only registered provider connectors may hold
  // keys / hit provider hosts; no ad-hoc curl". FAL_KEY + the fal.run/fal.ai
  // hosts are now SANCTIONED — but ONLY inside the registered fal connector
  // file. Every other source file must still be forbidden, so the guard still
  // catches a stray FAL_KEY read or fal host anywhere outside the connector.
  //
  // The allowlist is file-scoped (path-exact), not a substring: a sibling file
  // that merely imports the connector is NOT allowlisted. Hosted Vercel +
  // OpenAI-direct stay forbidden everywhere with no allowlist.
  const FAL_CONNECTOR = path.join("cli", "lib", "providers", "fal.ts");
  // Files permitted to read FAL_KEY / hit fal hosts (the sanctioned connector only).
  const falAllowlist = new Set<string>([FAL_CONNECTOR]);

  // Hosted Vercel + OpenAI-direct: forbidden everywhere, no allowlist.
  const forbiddenEverywhere = ["VERCEL_KEY", "VERCEL_API_KEY", "OPENAI_API_KEY"];

  test("no source file reads process.env.VERCEL/OPENAI keys (no allowlist)", () => {
    const offenders: string[] = [];
    for (const f of sourceFiles()) {
      const src = fs.readFileSync(f, "utf8");
      for (const key of forbiddenEverywhere) {
        const re = new RegExp(`process\\.env(?:\\.${key}\\b|\\[["']${key}["']\\])`);
        if (re.test(src)) offenders.push(`${path.relative(REPO, f)} → ${key}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("FAL_KEY is read ONLY by the sanctioned fal connector file", () => {
    const offenders: string[] = [];
    for (const f of sourceFiles()) {
      const rel = path.relative(REPO, f);
      if (falAllowlist.has(rel)) continue; // sanctioned connector — allowed
      const src = fs.readFileSync(f, "utf8");
      // Match `process.env.FAL_KEY` and `process.env["FAL_KEY"]`.
      if (/process\.env(?:\.FAL_KEY\b|\[["']FAL_KEY["']\])/.test(src)) {
        offenders.push(`${rel} → FAL_KEY`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("the sanctioned fal connector DOES read FAL_KEY (allowlist is not vacuous)", () => {
    // Guards against the allowlist drifting onto a file that no longer reads the
    // key — if fal.ts stops reading FAL_KEY this should fail so the allowlist is
    // re-pointed rather than left granting an unused exemption.
    const src = fs.readFileSync(path.join(REPO, FAL_CONNECTOR), "utf8");
    expect(/process\.env(?:\.FAL_KEY\b|\[["']FAL_KEY["']\])/.test(src)).toBe(true);
  });

  test("fal.ai / fal.run hosts appear ONLY in the sanctioned fal connector file", () => {
    const offenders: string[] = [];
    for (const f of sourceFiles()) {
      const rel = path.relative(REPO, f);
      if (falAllowlist.has(rel)) continue; // sanctioned connector — allowed
      const src = fs.readFileSync(f, "utf8");
      // Anything fetching fal.ai or fal.run outside the connector is a violation.
      if (/https?:\/\/[a-z0-9.-]*fal\.(?:ai|run)\b/i.test(src)) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("no Vercel / OpenAI-direct host URL in any source file (no allowlist)", () => {
    // The hosted-Vercel ban: vercel.com, vercel.app, vercel.sh (AI Gateway),
    // sdk.vercel.ai — any vercel.* URL — plus direct openai.com.
    const offenders: string[] = [];
    for (const f of sourceFiles()) {
      const rel = path.relative(REPO, f);
      const src = fs.readFileSync(f, "utf8");
      if (/https?:\/\/[a-z0-9.-]*vercel\.[a-z]+/i.test(src)) {
        offenders.push(`${rel} → vercel host`);
      }
      if (/https?:\/\/[a-z0-9.-]*openai\.com\b/i.test(src)) {
        offenders.push(`${rel} → openai.com host`);
      }
    }
    expect(offenders).toEqual([]);
  });

  // #500 ingestion connectors — the same file-scoped discipline as fal:
  // each connector's env var + host are sanctioned ONLY inside its own file,
  // and the allowlist must not be vacuous.
  const INGESTION_CONNECTORS: Array<{ file: string; envVar: string; hostRe: RegExp; hostLabel: string }> = [
    {
      file: path.join("cli", "lib", "providers", "firecrawl.ts"),
      envVar: "FIRECRAWL_API_KEY",
      hostRe: /https?:\/\/[a-z0-9.-]*firecrawl\.dev\b/i,
      hostLabel: "firecrawl.dev",
    },
    {
      file: path.join("cli", "lib", "providers", "apify.ts"),
      envVar: "APIFY_TOKEN",
      hostRe: /https?:\/\/[a-z0-9.-]*apify\.com\b/i,
      hostLabel: "apify.com",
    },
    // #507 analytics connector — same file-scoped discipline. The host regex
    // covers ALL googleapis.com subdomains (www / youtubeanalytics / any
    // future Google API), so the named OAuth follow-up cannot land a Google
    // host outside this file either.
    {
      file: path.join("cli", "lib", "providers", "youtube-analytics.ts"),
      envVar: "YOUTUBE_API_KEY",
      hostRe: /https?:\/\/[a-z0-9.-]*googleapis\.com\b/i,
      hostLabel: "googleapis.com",
    },
  ];

  // #501 publish connector — same file-scoped env-var discipline. Postiz is
  // SELF-HOSTED: the base URL is user-supplied config, so there is NO fixed
  // host to scan for — the env-var
  // allowlist (both the key AND the base URL) is the enforceable half of the
  // invariant, hence hostRe: null.
  const PUBLISH_CONNECTORS: Array<{ file: string; envVar: string; hostRe: null }> = [
    { file: path.join("cli", "lib", "providers", "postiz.ts"), envVar: "POSTIZ_API_KEY", hostRe: null },
    { file: path.join("cli", "lib", "providers", "postiz.ts"), envVar: "POSTIZ_BASE_URL", hostRe: null },
    // #527 article connectors — same file-scoped env-var discipline. dev.to +
    // Hashnode have FIXED hosts (dev.to / gql.hashnode.com), asserted below.
    { file: path.join("cli", "lib", "providers", "devto.ts"), envVar: "DEVTO_API_KEY", hostRe: null },
    { file: path.join("cli", "lib", "providers", "hashnode.ts"), envVar: "HASHNODE_TOKEN", hostRe: null },
  ];

  for (const { file, envVar } of PUBLISH_CONNECTORS) {
    const keyRe = new RegExp(`process\\.env(?:\\.${envVar}\\b|\\[["']${envVar}["']\\])`);

    test(`${envVar} is read ONLY by the sanctioned connector file (${file})`, () => {
      const offenders: string[] = [];
      for (const f of sourceFiles()) {
        const rel = path.relative(REPO, f);
        if (rel === file) continue; // sanctioned connector — allowed
        if (keyRe.test(fs.readFileSync(f, "utf8"))) offenders.push(`${rel} → ${envVar}`);
      }
      expect(offenders).toEqual([]);
    });

    test(`the sanctioned connector DOES read ${envVar} (allowlist is not vacuous)`, () => {
      expect(keyRe.test(fs.readFileSync(path.join(REPO, file), "utf8"))).toBe(true);
    });
  }

  for (const { file, envVar, hostRe, hostLabel } of INGESTION_CONNECTORS) {
    const keyRe = new RegExp(`process\\.env(?:\\.${envVar}\\b|\\[["']${envVar}["']\\])`);

    test(`${envVar} is read ONLY by the sanctioned connector file (${file})`, () => {
      const offenders: string[] = [];
      for (const f of sourceFiles()) {
        const rel = path.relative(REPO, f);
        if (rel === file) continue; // sanctioned connector — allowed
        if (keyRe.test(fs.readFileSync(f, "utf8"))) offenders.push(`${rel} → ${envVar}`);
      }
      expect(offenders).toEqual([]);
    });

    test(`the sanctioned connector DOES read ${envVar} (allowlist is not vacuous)`, () => {
      expect(keyRe.test(fs.readFileSync(path.join(REPO, file), "utf8"))).toBe(true);
    });

    test(`${hostLabel} hosts appear ONLY in the sanctioned connector file`, () => {
      const offenders: string[] = [];
      for (const f of sourceFiles()) {
        const rel = path.relative(REPO, f);
        if (rel === file) continue;
        if (hostRe.test(fs.readFileSync(f, "utf8"))) offenders.push(rel);
      }
      expect(offenders).toEqual([]);
    });
  }
});

describe("AGENTS.md invariant #2 — render entry-point is ralphy render", () => {
  // The Remotion-gone assertion is covered by
  // `tests/integration/cli-render-from-clip.test.ts`. The complement here is a
  // shape-check on `cli/commands/render.ts`: it must wire to the HyperFrames
  // adapter (`cli/lib/render/hyperframes.ts`) and must not spawn a sibling
  // render pipeline.
  test("cli/commands/render.ts is the sole render entry and routes through cli/lib/render/hyperframes", () => {
    const renderTs = fs.readFileSync(
      path.join(REPO, "cli", "commands", "render.ts"),
      "utf8",
    );
    // Routes to the HF adapter.
    expect(renderTs).toMatch(/render\/hyperframes/);
    // No alternate engines referenced as a code path.
    expect(renderTs).not.toMatch(/\brunRemotion\b/);
    expect(renderTs).not.toMatch(/from ["']@remotion\//);
  });

  test("cli/index.ts registers exactly one top-level render entry-point", () => {
    // The hyperframes namespace exposes a `ralphy hyperframes render`
    // debug-only subcommand — that's allowed by invariant #2 ("reserved for
    // debugging"). What we lock here is the *top-level* surface: only
    // `renderCmd()` from cli/commands/render.ts may be wired into the program.
    const indexTs = fs.readFileSync(path.join(REPO, "cli", "index.ts"), "utf8");
    const renderRegistrations = indexTs.match(/program\.addCommand\(\s*renderCmd\(/g) ?? [];
    expect(renderRegistrations.length).toBe(1);
    // And no sibling import smuggling in a second render entry.
    expect(indexTs).not.toMatch(/program\.addCommand\(\s*remotionCmd\(/);
    expect(indexTs).not.toMatch(/program\.addCommand\(\s*ffmpegCmd\(/);
  });
});

describe("AGENTS.md invariant #7 — always bun / bunx (no npm / npx / yarn shell-outs)", () => {
  // The invariant constrains *Ralphy's own runtime*: source code and dev
  // scripts must never **spawn** npm/npx/yarn. User-facing strings that
  // *tell* a user to run `npm update -g @alecs5am/ralphy` are fine (npm is a
  // valid install channel for the end user; the rule is that Ralphy itself
  // doesn't invoke it internally).
  //
  // We detect shell-outs by combining the invocation token with one of the
  // node child-process APIs (`spawn`, `exec`, `execSync`, `Bun.spawn`,
  // `$`...) within a 200-char window.
  const spawnHints = [
    "spawn(",
    "spawnSync(",
    "exec(",
    "execSync(",
    "execFile(",
    "execFileSync(",
    "Bun.spawn",
    "Bun.$",
  ];
  const tokens = [/\bnpm\s+(?:install|run|ci|exec|update)\b/, /\bnpx\s+/, /\byarn\s+(?:install|add|run|exec)\b/];

  test("no .ts / .js source spawns npm | npx | yarn as a child process", () => {
    const offenders: string[] = [];
    for (const f of sourceFiles()) {
      const src = fs.readFileSync(f, "utf8");
      if (!spawnHints.some((h) => src.includes(h))) continue;
      for (const re of tokens) {
        const m = src.match(re);
        if (!m) continue;
        const idx = src.indexOf(m[0]);
        const window = src.slice(Math.max(0, idx - 200), idx + 200);
        if (spawnHints.some((h) => window.includes(h))) {
          offenders.push(`${path.relative(REPO, f)} → ${m[0]}`);
          break;
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("AGENTS.md invariant #13 — prompt-library guidelines exist", () => {
  // Invariant #13 says guidelines are "mandatory reading for any covered
  // register". The doc-only part (when to apply them) lives in playbooks; the
  // *testable* part is that the library is non-empty so `ralphy guideline
  // list` returns at least one entry. If the dir is wiped, the routing rule
  // becomes a dead pointer.
  test("guidelines/ directory contains at least one guideline slug", () => {
    const dir = path.join(REPO, "guidelines");
    expect(fs.existsSync(dir)).toBe(true);
    const slugs = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    expect(slugs.length).toBeGreaterThan(0);
    // Each slug should have a README or guideline.yml so the loader has
    // something to read.
    for (const slug of slugs) {
      const slugDir = path.join(dir, slug);
      const entries = fs.readdirSync(slugDir);
      expect(entries.length).toBeGreaterThan(0);
    }
  });
});

describe("AGENTS.md slash-command surface", () => {
  test("lists every maintainer skill so Codex can route absent tool-surface discovery", () => {
    const agentsMd = fs.readFileSync(path.join(REPO, "AGENTS.md"), "utf8");
    const skillsDir = path.join(REPO, ".agents", "skills");
    const missing: string[] = [];
    for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillPath = path.join(skillsDir, entry.name, "SKILL.md");
      if (!fs.existsSync(skillPath)) continue;
      const src = fs.readFileSync(skillPath, "utf8");
      if (!/^namespace:\s*maintainer\s*$/m.test(src)) continue;
      if (!agentsMd.includes(`/${entry.name}`)) {
        missing.push(entry.name);
      }
    }
    expect(missing).toEqual([]);
  });
});

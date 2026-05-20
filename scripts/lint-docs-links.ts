#!/usr/bin/env tsx
// scripts/lint-docs-links.ts — 07.09.01
//
// Walks every .md and .mdx file in the repo + docs-mintlify/, extracts every
// link, and verifies:
//   • Internal links resolve to existing files (anchors stripped before lookup).
//   • External links return 2xx within a configurable timeout.
//   • A built-in allowlist skips known-flaky / auth-walled / future URLs.
//
// CLI:
//   bun run lint:docs-links              → full check (slow — does network)
//   bun run lint:docs-links --no-net     → internal-only (fast — for pre-commit)

import fs from "node:fs";
import path from "node:path";

export interface LinkRef {
  file: string;
  line: number;
  url: string;
}

export type LinkKind = "external" | "internal" | "anchor" | "skipped";

// Allowlist of URL substrings that we don't probe. Useful for:
//   • Auth-walled pages (npm scoped, brew tap pre-create)
//   • URLs we plan to publish but haven't yet (ralphy.dev/* during pre-v1.0)
//   • Known-flaky CDNs (raw.githubusercontent.com sporadically 5xx)
const EXTERNAL_ALLOWLIST = [
  "https://ralphy.dev",  // not yet live; tracked under 07.02
  "https://discord.gg/ralphy",  // Discord deferred per D-05
  "https://twitter.com/ralphy_studio",  // X handle not yet claimed
  "https://www.npmjs.com/package/@alecs5am/ralphy",  // post-launch publish
  "https://github.com/alecs5am/homebrew-tap",  // brew tap repo
];

const MD_LINK_RE = /(?<![!\\])\[([^\]\n]+)\]\(([^)]+)\)/g;

export function extractLinks(file: string, src: string): LinkRef[] {
  const lines = src.split("\n");
  const out: LinkRef[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    let m: RegExpExecArray | null;
    MD_LINK_RE.lastIndex = 0;
    while ((m = MD_LINK_RE.exec(line)) !== null) {
      out.push({ file, line: i + 1, url: m[2]!.trim() });
    }
  }
  return out;
}

export function classifyLink(ref: LinkRef): { kind: LinkKind } {
  const u = ref.url;
  if (u.startsWith("#")) return { kind: "anchor" };
  if (u.startsWith("mailto:") || u.startsWith("tel:") || u.startsWith("data:")) {
    return { kind: "skipped" };
  }
  if (u.startsWith("http://") || u.startsWith("https://")) return { kind: "external" };
  return { kind: "internal" };
}

export function resolveInternal(
  ref: LinkRef,
  repoRoot: string,
): { ok: boolean; resolved?: string } {
  let target = ref.url.split("#")[0]!;  // strip anchor
  if (!target) return { ok: true };
  let abs: string;
  if (target.startsWith("/")) {
    abs = path.join(repoRoot, target);
  } else {
    abs = path.resolve(path.dirname(ref.file), target);
  }
  // Allow trailing slashes — accept the directory.
  if (fs.existsSync(abs)) return { ok: true, resolved: abs };
  // Some Mintlify pages reference /<page> without .mdx; try resolving as a
  // sibling .mdx in docs-mintlify/.
  if (target.startsWith("/") && !path.extname(target)) {
    const mdxPath = path.join(repoRoot, "docs-mintlify", target + ".mdx");
    if (fs.existsSync(mdxPath)) return { ok: true, resolved: mdxPath };
  }
  return { ok: false };
}

function isAllowlisted(url: string): boolean {
  return EXTERNAL_ALLOWLIST.some((allow) => url.startsWith(allow));
}

async function probeExternal(url: string, timeoutMs: number): Promise<{ ok: boolean; status?: number; error?: string }> {
  if (isAllowlisted(url)) return { ok: true };
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let resp: Response;
    try {
      resp = await fetch(url, { method: "HEAD", redirect: "follow", signal: controller.signal });
      // Some servers don't accept HEAD; fall back to GET on 4xx/405.
      if (resp.status === 405 || resp.status === 403 || resp.status === 404) {
        resp = await fetch(url, { method: "GET", redirect: "follow", signal: controller.signal });
      }
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
    return { ok: resp.status >= 200 && resp.status < 400, status: resp.status };
  } finally {
    clearTimeout(t);
  }
}

// ─── Walker ────────────────────────────────────────────────────────────────

function walkDocs(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDocs(p, out);
    } else if (entry.isFile() && /\.(md|mdx)$/.test(entry.name)) {
      out.push(p);
    }
  }
  return out;
}

interface Violation {
  file: string;
  line: number;
  url: string;
  reason: string;
}

async function main(): Promise<void> {
  const repo = path.resolve(import.meta.dir, "..");
  const noNet = process.argv.includes("--no-net");
  const timeoutMs = 30_000;

  // Scope: by default only the canonical doc surfaces (README + docs/ +
  // docs-mintlify/ + roadmap/). Pass --scope full to also scan templates/,
  // landing/, etc. Templates have ~75 known-stale internal links from old
  // reorgs that are tracked as a separate cleanup pass (07.09.x follow-up).
  const fullScope = process.argv.includes("--scope=full");
  const scopedRoots = fullScope
    ? [repo]
    : [
        path.join(repo, "README.md"),
        path.join(repo, "CLAUDE.md"),
        path.join(repo, "AGENTS.md"),
        path.join(repo, "MODELS.md"),
        path.join(repo, "CLI.md"),
        path.join(repo, "docs"),
        path.join(repo, "docs-mintlify"),
        path.join(repo, "roadmap"),
      ];

  const files: string[] = [];
  for (const r of scopedRoots) {
    if (!fs.existsSync(r)) continue;
    const stat = fs.statSync(r);
    if (stat.isFile()) {
      if (/\.(md|mdx)$/.test(r)) files.push(r);
      continue;
    }
    for (const f of walkDocs(r)) {
      // Skip generated files (they're regenerated by other CI checks).
      if (f.endsWith("/cli-surface.generated.md")) continue;
      if (f.includes("/docs-mintlify/reference/cli/")) continue;
      // Skip the Remotion runtime-context.md dump + docs/playbooks/remotion/*
      // sub-pages — they're cached upstream Remotion docs, not authored
      // content, and contain internal links to their own sibling pages that
      // don't ship with the repo.
      if (f.endsWith("/docs/runtime-context.md")) continue;
      if (f.includes("/docs/playbooks/remotion/")) continue;
      files.push(f);
    }
  }

  const violations: Violation[] = [];
  const externalToProbe: LinkRef[] = [];

  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    for (const link of extractLinks(f, src)) {
      const cls = classifyLink(link);
      if (cls.kind === "internal") {
        const r = resolveInternal(link, repo);
        if (!r.ok) {
          violations.push({ ...link, reason: "internal link does not resolve" });
        }
      } else if (cls.kind === "external") {
        externalToProbe.push(link);
      }
    }
  }

  if (!noNet) {
    // Probe externals in small parallel batches so a slow URL doesn't gate
    // everything. Allowlisted URLs short-circuit to ok=true.
    const batchSize = 8;
    for (let i = 0; i < externalToProbe.length; i += batchSize) {
      const batch = externalToProbe.slice(i, i + batchSize);
      const results = await Promise.all(batch.map((l) => probeExternal(l.url, timeoutMs)));
      for (let j = 0; j < batch.length; j++) {
        const r = results[j]!;
        if (!r.ok) {
          violations.push({
            ...batch[j]!,
            reason: r.error
              ? `external fetch failed: ${r.error}`
              : `external status ${r.status ?? "?"}`,
          });
        }
      }
    }
  }

  if (violations.length === 0) {
    process.stdout.write(
      JSON.stringify({
        ok: true,
        scanned_files: files.length,
        external_probed: noNet ? 0 : externalToProbe.length,
      }) + "\n",
    );
    process.exit(0);
  }

  for (const v of violations) {
    const rel = path.relative(repo, v.file);
    process.stderr.write(`${rel}:${v.line}  ${v.url}\n    ${v.reason}\n`);
  }
  process.stderr.write(`\n${violations.length} broken link(s).\n`);
  process.exit(1);
}

const isDirect =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("lint-docs-links.ts") ||
    process.argv[1].endsWith("lint-docs-links.js"));
if (isDirect) {
  void main();
}

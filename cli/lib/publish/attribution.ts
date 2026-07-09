// Source attribution (#543) — the DATA + injection-text builder for the
// "Sources:" block a publish step folds into a unit's description / caption
// (media) or frontmatter (article). It is the attribution twin of the campaign
// cross-link module (cli/lib/campaign/crosslink.ts): this module owns the shape
// + the block builders; the actual injection reuses the publish path's
// description/frontmatter hook (the publish node passes the built block through,
// see cli/lib/workflow/executors/publish.ts).
//
// A news farm turns third-party articles into videos/threads/carousels (#500).
// Reputable content credits its sources: an unattributed farm reads as a
// scraper and erodes trust; attribution is also a GEO/SEO linking asset (#526).
// The reference gate (#3) is orthogonal — that guards FABRICATION of named real
// entities; this credits BORROWED material.
//
// POLICY, NOT MORALIZING: the workspace `attribution` block is DATA. Default ON
// when sources exist; OFF only by an explicit opt-out (`enabled: false`). No
// legal judgment is made — the block just credits the source url/outlet/author.

import { z } from "zod";
import fs from "node:fs";
import { workspaceDir, workspaceManifestPath } from "../paths.js";

// ─── Source shape ─────────────────────────────────────────────────────────────

/**
 * One attributable source: a `url` (the only required field — a credit you
 * cannot point back at is useless) plus an optional `outlet` (publication /
 * site name) and `author`. Carried on the unit's provenance (`UnitProvenance.
 * sources`) and, as a fallback, distilled from the project's research-facts
 * `sources[]`. English-only-on-disk.
 */
export const AttributionSourceSchema = z.object({
  /** Source URL — the link the attribution points back at. Required. */
  url: z.string().min(1),
  /** Publication / outlet / site name, when known. */
  outlet: z.string().optional(),
  /** Author / byline, when known. */
  author: z.string().optional(),
});
export type AttributionSource = z.infer<typeof AttributionSourceSchema>;

// ─── Workspace policy (workspace.json `attribution` key) ──────────────────────

/**
 * The workspace attribution policy. `enabled` defaults TRUE — attribution is
 * injected whenever sources exist; the operator opts OUT explicitly by setting
 * `enabled: false`. `heading` is the block label; `requireOnPublish` makes a
 * MISSING attribution (policy on, sources absent) a publish-time `warn` that
 * routes to review (never a hard fail — a clean generated video with no source
 * link should not be nuked). Malformed values degrade to defaults (`.catch`) so
 * a hand-edited workspace.json never crashes the farm.
 */
export const AttributionConfigSchema = z.object({
  /** Inject a Sources block when sources exist. Default true; false = opt-out. */
  enabled: z.boolean().catch(true).default(true),
  /** The block heading. */
  heading: z.string().catch("Sources:").default("Sources:"),
  /**
   * When true, a unit published with NO resolvable source (while the policy is
   * on) is a `warn` routed to review — the farm wants every published piece to
   * carry a credit. Default false: attribution is best-effort, absence is fine.
   */
  requireOnPublish: z.boolean().catch(false).default(false),
});
export type AttributionConfig = z.infer<typeof AttributionConfigSchema>;

/** The disabled policy — the no-op the reader returns when opted out. */
export const DISABLED_ATTRIBUTION_CONFIG: AttributionConfig = AttributionConfigSchema.parse({
  enabled: false,
});

function readManifest(ws: string): Record<string, unknown> {
  try {
    const raw = JSON.parse(fs.readFileSync(workspaceManifestPath(ws), "utf8"));
    return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * The workspace's attribution policy. An ABSENT `attribution` block reads back
 * the DEFAULT (enabled: true) — attribution is on out of the box; a present
 * `{ enabled: false }` is the explicit opt-out. Mirrors readCadenceConfig /
 * readNotificationsConfig / readTrustConfig.
 */
export function readAttributionConfig(ws: string): AttributionConfig {
  const raw = readManifest(ws).attribution;
  if (raw === undefined || raw === null) return AttributionConfigSchema.parse({});
  return AttributionConfigSchema.parse(raw);
}

/** Merge a partial attribution patch into workspace.json's `attribution` key. */
export function writeAttributionConfig(
  ws: string,
  patch: Partial<AttributionConfig>,
): AttributionConfig {
  const manifest = readManifest(ws);
  const merged = AttributionConfigSchema.parse({
    ...(manifest.attribution as object | undefined),
    ...patch,
  });
  fs.mkdirSync(workspaceDir(ws), { recursive: true });
  fs.writeFileSync(
    workspaceManifestPath(ws),
    JSON.stringify({ slug: ws, ...manifest, attribution: merged }, null, 2) + "\n",
  );
  return merged;
}

// ─── Source resolution + de-dup ───────────────────────────────────────────────

/** One credit line: "Outlet — Author: url" / "Outlet: url" / "url" per what's known. */
function creditLine(s: AttributionSource): string {
  const prefixParts = [s.outlet, s.author].filter((p): p is string => !!p && p.trim().length > 0);
  const prefix = prefixParts.join(" — ");
  return prefix ? `${prefix}: ${s.url}` : s.url;
}

/**
 * De-dup sources by URL (first spelling wins), dropping entries with no URL.
 * Order-preserving so the emitted block is deterministic.
 */
export function dedupeSources(sources: AttributionSource[]): AttributionSource[] {
  const seen = new Set<string>();
  const out: AttributionSource[] = [];
  for (const s of sources) {
    const url = (s.url ?? "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, ...(s.outlet ? { outlet: s.outlet } : {}), ...(s.author ? { author: s.author } : {}) });
  }
  return out;
}

// ─── Block builders (mirror crosslink.ts shapes) ──────────────────────────────

/**
 * Build the attribution block injected into a MEDIA unit's description /
 * caption: `<heading>` then one `- credit` line per source. Empty sources →
 * empty string (no dangling header). Mirrors buildDescriptionLinkBlock.
 */
export function buildSourcesBlock(
  sources: AttributionSource[],
  heading = "Sources:",
): string {
  const uniq = dedupeSources(sources);
  if (uniq.length === 0) return "";
  return [heading, ...uniq.map((s) => `- ${creditLine(s)}`)].join("\n");
}

/**
 * Build the attribution frontmatter fragment injected into an ARTICLE unit: a
 * `sources:` YAML list of URLs. Empty sources → empty string. Mirrors
 * buildFrontmatterLinkBlock (JSON-quoted URLs for YAML safety).
 */
export function buildSourcesFrontmatterBlock(sources: AttributionSource[]): string {
  const uniq = dedupeSources(sources);
  if (uniq.length === 0) return "";
  return `sources:\n${uniq.map((s) => `  - ${JSON.stringify(s.url)}`).join("\n")}`;
}

/**
 * Inject the sources block into an existing description string. Idempotent-ish:
 * appends after a blank line. The publish node calls this to enrich the OUTBOUND
 * description; the source unit media is never rewritten (append to a copy only).
 * Mirrors injectDescription in crosslink.ts.
 */
export function injectAttribution(
  description: string,
  sources: AttributionSource[],
  heading = "Sources:",
): string {
  const block = buildSourcesBlock(sources, heading);
  if (!block) return description;
  return description.trim().length > 0 ? `${description.trim()}\n\n${block}` : block;
}

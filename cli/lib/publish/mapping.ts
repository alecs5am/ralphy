// Publish payload mapping (#501) — pure functions: unit.json (ordered media +
// the #403 social-copy caption + title/blurb) → per-target Postiz post
// payloads for youtube / tiktok / instagram / x. No I/O, no network — the
// orchestrator (cli/lib/publish/publish.ts) resolves file paths and uploads
// media through the connector, then feeds the uploaded refs in here.

import type { UnitManifest } from "../schemas/unit.js";
import type { PostizIntegration, PostizPostEntry, PostizPostValue } from "../providers/postiz.js";

export const PUBLISH_TARGETS = ["youtube", "tiktok", "instagram", "x"] as const;
export type PublishTarget = (typeof PUBLISH_TARGETS)[number];

export function isPublishTarget(t: string): t is PublishTarget {
  return (PUBLISH_TARGETS as readonly string[]).includes(t);
}

/** Parse a comma-separated targets list; throws on an unknown target. */
export function parseTargets(raw: string): PublishTarget[] {
  const list = raw.split(",").map((t) => t.trim()).filter(Boolean);
  for (const t of list) {
    if (!isPublishTarget(t)) {
      throw new Error(`'${t}' is not a publish target (${PUBLISH_TARGETS.join(" | ")})`);
    }
  }
  return [...new Set(list)] as PublishTarget[];
}

/** Normalize hashtags into a "#a #b" string (cap optional, '#' enforced). */
export function formatHashtags(tags: string[] | undefined, max?: number): string {
  const list = (tags ?? []).map((t) => (t.startsWith("#") ? t : `#${t}`));
  return (max !== undefined ? list.slice(0, max) : list).join(" ");
}

/** Fallback copy for a unit with no #403 caption: title/blurb/slug grounded. */
function genericCaption(manifest: UnitManifest): string {
  return [manifest.title ?? manifest.slug, manifest.blurb].filter(Boolean).join(" — ");
}

/**
 * The post text for one target, from the unit's per-platform caption (#403):
 *   youtube    — the fuller reels body (the title goes into settings).
 *   tiktok     — the hook line + a short tag set inline.
 *   instagram  — the fuller reels body + the full tag set.
 *   x          — the hook line + up to 3 tags (thread-friendly brevity).
 * A unit with no caption falls back to the generic title/blurb copy.
 */
export function captionForTarget(target: PublishTarget, manifest: UnitManifest): string {
  const c = manifest.caption;
  if (!c) return genericCaption(manifest);
  switch (target) {
    case "youtube":
      return c.platform.reels;
    case "tiktok":
      return [c.platform.tiktok, formatHashtags(c.hashtags, 5)].filter(Boolean).join(" ");
    case "instagram":
      return [c.platform.reels, formatHashtags(c.hashtags)].filter(Boolean).join("\n\n");
    case "x":
      return [c.platform.tiktok, formatHashtags(c.hashtags, 3)].filter(Boolean).join(" ");
  }
}

/**
 * Minimal per-platform Postiz settings. YouTube needs a title — the #403
 * shorts title (≤40 chars) when present, else the unit title, else the slug.
 */
export function settingsForTarget(
  target: PublishTarget,
  manifest: UnitManifest,
): Record<string, unknown> | undefined {
  if (target === "youtube") {
    return { title: manifest.caption?.platform.shorts ?? manifest.title ?? manifest.slug };
  }
  return undefined;
}

/**
 * Bind each target to a Postiz integration (account) id. An explicit
 * `accounts` map wins; otherwise the first enabled integration whose
 * `identifier` matches the target (with the "twitter" alias for x). A target
 * with no binding throws — publishing to an unbound platform is a user error,
 * never a silent skip.
 */
export function bindIntegrations(
  targets: PublishTarget[],
  integrations: PostizIntegration[],
  accounts: Partial<Record<PublishTarget, string>> = {},
): Record<PublishTarget, string> {
  const matches = (target: PublishTarget, ident: string): boolean =>
    ident === target || ident.startsWith(`${target}-`) || (target === "x" && ident === "twitter");
  const bound = {} as Record<PublishTarget, string>;
  const missing: PublishTarget[] = [];
  for (const target of targets) {
    const explicit = accounts[target];
    if (explicit) {
      bound[target] = explicit;
      continue;
    }
    const hit = integrations.find(
      (i) => !i.disabled && typeof i.identifier === "string" && matches(target, i.identifier),
    );
    if (hit) bound[target] = hit.id;
    else missing.push(target);
  }
  if (missing.length) {
    throw new Error(
      `no Postiz integration bound for target(s): ${missing.join(", ")}. Connect the account in Postiz or pass an explicit --account "${missing[0]}=<integration-id>".`,
    );
  }
  return bound;
}

/** Uploaded-media ref, as returned by the connector's upload endpoint. */
export type UploadedMedia = { id?: string; path?: string };

/** Build one target's Postiz post entry (content + media refs + settings). */
export function buildPostEntry(
  target: PublishTarget,
  integrationId: string,
  manifest: UnitManifest,
  media: UploadedMedia[],
): PostizPostEntry {
  const value: PostizPostValue = { content: captionForTarget(target, manifest) };
  if (media.length) value.image = media;
  const settings = settingsForTarget(target, manifest);
  return { integration: { id: integrationId }, value: [value], ...(settings && { settings }) };
}

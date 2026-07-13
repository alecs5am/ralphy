// Publish payload mapping (#501) — pure functions: unit.json (ordered media +
// the #403 social-copy caption + title/blurb) → per-target Postiz post
// payloads for youtube / tiktok / instagram / x. No I/O, no network — the
// orchestrator (cli/lib/publish/publish.ts) resolves file paths and uploads
// media through the connector, then feeds the uploaded refs in here.

import type { UnitManifest } from "../schemas/unit.js";
import type { PostizIntegration, PostizPostEntry, PostizPostValue } from "../providers/postiz.js";

export const PUBLISH_TARGETS = ["youtube", "tiktok", "instagram", "x", "telegram"] as const;
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
export function captionForTarget(
  target: PublishTarget,
  manifest: UnitManifest,
  textBody?: string,
): string {
  if (textBody && (target === "x" || target === "telegram")) return textBody;
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
    case "telegram":
      return c.platform.reels;
  }
}

export type PostizSettingsDefaults = {
  madeWithAi?: boolean;
  youtubeVisibility?: "public" | "unlisted" | "private";
  instagramPostType?: "post" | "story";
};

/**
 * Minimal per-platform Postiz settings. YouTube needs a title — the #403
 * shorts title (≤40 chars) when present, else the unit title, else the slug.
 */
export function settingsForTarget(
  target: PublishTarget,
  manifest: UnitManifest,
  integrationIdentifier: string = target,
  defaults: PostizSettingsDefaults = {},
): Record<string, unknown> | undefined {
  if (target === "tiktok") {
    return {
      __type: "tiktok",
      title: manifest.caption?.platform.shorts ?? manifest.title ?? manifest.slug,
      privacy_level: "PUBLIC_TO_EVERYONE",
      duet: false,
      stitch: false,
      comment: true,
      autoAddMusic: "no",
      brand_content_toggle: false,
      brand_organic_toggle: false,
      video_made_with_ai: defaults.madeWithAi ?? false,
      content_posting_method: "DIRECT_POST",
    };
  }
  if (target === "youtube") {
    const tags = (manifest.caption?.hashtags ?? manifest.tags ?? []).map((tag) => {
      const value = tag.replace(/^#/u, "");
      return { value, label: value };
    });
    return {
      __type: "youtube",
      title: manifest.caption?.platform.shorts ?? manifest.title ?? manifest.slug,
      type: defaults.youtubeVisibility ?? "public",
      selfDeclaredMadeForKids: "no",
      tags,
    };
  }
  if (target === "instagram") {
    return {
      __type: integrationIdentifier.startsWith("instagram-standalone")
        ? "instagram-standalone"
        : "instagram",
      post_type: defaults.instagramPostType ?? "post",
      is_trial_reel: false,
      collaborators: [],
    };
  }
  if (target === "x") {
    return {
      __type: "x",
      who_can_reply_post: "everyone",
      community: "",
      made_with_ai: defaults.madeWithAi ?? false,
      paid_partnership: false,
    };
  }
  if (target === "telegram") return { __type: "telegram" };
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
  integrationIdentifier: string = target,
  textBody?: string,
  defaults: PostizSettingsDefaults = {},
): PostizPostEntry {
  const content = captionForTarget(target, manifest, textBody);
  let parts = [content];
  if (target === "x" && manifest.format === "thread" && textBody) {
    try {
      const parsed = JSON.parse(textBody) as unknown;
      if (Array.isArray(parsed)) {
        const strings = parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
        if (strings.length > 0) parts = strings;
      }
    } catch {
      const split = textBody.split(/\n\s*---\s*\n/u).map((part) => part.trim()).filter(Boolean);
      if (split.length > 1) parts = split;
    }
  }
  const value: PostizPostValue[] = parts.map((part, index) => ({
    content: part,
    image: index === 0 ? media : [],
  }));
  const settings = settingsForTarget(target, manifest, integrationIdentifier, defaults);
  return { integration: { id: integrationId }, value, ...(settings && { settings }) };
}

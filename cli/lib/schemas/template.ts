// Template Zod schema (02.05.01). Every `template.yaml` declares `version: 1`
// per [02-D-03]; the loader matches on the version field and rejects unknown
// values with `E_TEMPLATE_VERSION_UNSUPPORTED`.
//
// Why versioning: when scenes[] eventually gains a required field, the loader
// keeps a v1 reader alive for at least one major release cycle (per D-03).
//
// Slug discipline per [02-D-05]: archetypal slugs only. No real-creator names.
// `DENIED_SLUG_TOKENS` lists the blocked substrings; `validateSlug()` throws
// when a slug embeds one.

import { z } from "zod";

export const TEMPLATE_KINDS = ["vibe-reference", "vibe-style"] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

export const TEMPLATE_CATEGORIES = [
  "b2b-saas",
  "dtc-commerce",
  "creator-lifestyle",
  "entertainment-viral",
  "cinematic-narrative",
] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

/**
 * Maintainer-curated deny list of real-creator / brand tokens that may NOT
 * appear in template slugs (per [02-D-05]). Creator references stay legal as
 * **prose** inside `README.md` / `composition.md`, never in the slug. Add new
 * entries here when a new banned token surfaces.
 */
export const DENIED_SLUG_TOKENS: readonly string[] = [
  "hormozi",
  "mr-beast",
  "mrbeast",
  "oldspice",
  "old-spice",
  "kardashian",
  "rogan",
  "huberman",
  "tornow",
  "codie-sanchez",
  "alex-becker",
];

/**
 * Slug regex — kebab-case only. Numbers + hyphens allowed; no leading hyphen,
 * no underscores, no uppercase. Mirrors the convention used by every existing
 * template directory.
 */
const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/u;

export const TemplateRequiresSchema = z
  .object({
    brand: z.boolean().optional(),
    persona: z.boolean().optional(),
    /** Single int count for v1.0 per [02-D-02]; 3-slot shape lands post-launch. */
    refs: z.number().int().nonnegative().optional(),
    music_style: z.string().optional(),
    voice_style: z.string().optional(),
  })
  .partial()
  .default({});

export type TemplateRequires = z.infer<typeof TemplateRequiresSchema>;

export const SceneTemplateSchema = z.object({
  id: z.string().regex(/^scene-\d{2,3}$/u, "scene id must look like `scene-01`"),
  role: z.enum(["hook", "body", "cta"]),
  duration_s: z.number().positive().max(120),
  /** Free-text per-scene direction the template wants the scenarist to honor. */
  direction: z.string().optional(),
});

export type SceneTemplate = z.infer<typeof SceneTemplateSchema>;

export const TemplateYamlSchema = z.object({
  /** Mandatory per [02-D-03]. Loader rejects missing/unknown values. */
  version: z.literal(1),
  id: z.string().regex(SLUG_RE, "template id must be kebab-case"),
  /** Old slugs the template used to ship as — kept for at least one major-release cycle per [02-D-05]. */
  aliases: z.array(z.string()).default([]),
  kind: z.enum(TEMPLATE_KINDS),
  category: z.enum(TEMPLATE_CATEGORIES),
  name: z.string().min(1),
  description: z.string().min(1),
  tags: z.array(z.string()).default([]),
  requires: TemplateRequiresSchema,
  scenes: z.array(SceneTemplateSchema).default([]),
  estimated_cost_usd: z.number().nonnegative().optional(),
  estimated_duration_s: z.number().positive().optional(),
  references: z.array(z.string()).default([]),
});

export type TemplateYaml = z.infer<typeof TemplateYamlSchema>;

/**
 * Validate a slug against the archetypal-slug discipline.
 * Returns `null` on success; returns the offending token on rejection so the
 * caller can build an `E_TEMPLATE_SLUG_INVALID` payload.
 */
export function validateSlug(slug: string): { ok: true } | { ok: false; reason: string; token?: string } {
  if (!SLUG_RE.test(slug)) {
    return { ok: false, reason: "must be kebab-case (lowercase letters, digits, hyphens)" };
  }
  const lower = slug.toLowerCase();
  for (const token of DENIED_SLUG_TOKENS) {
    // Match as whole-token (delimited by start/end/hyphen) so e.g. "rogan"
    // doesn't trigger on "arogant-pov" — only on "joe-rogan-pod" / "rogan-clip".
    const re = new RegExp(`(^|-)${escapeRe(token)}(-|$)`, "u");
    if (re.test(lower)) {
      return { ok: false, reason: `contains banned creator/brand token \`${token}\``, token };
    }
  }
  return { ok: true };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Supported `version` values for the v1.0 loader. */
export const SUPPORTED_VERSIONS = [1] as const;
export type SupportedVersion = (typeof SUPPORTED_VERSIONS)[number];

export function isSupportedVersion(v: unknown): v is SupportedVersion {
  return typeof v === "number" && (SUPPORTED_VERSIONS as readonly number[]).includes(v);
}

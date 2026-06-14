// Social-copy drafter (#403) — the LLM-backed half of `ralphy unit caption`.
//
// Drafts platform-shaped post copy (TikTok hook / Reels caption / Shorts title)
// in the target-audience language, source-grounded from the unit's
// title/blurb/tags/provenance + an optional brief, then merges the per-niche
// trending-hashtag bank into the result. The copy DRAFT goes through
// `callLLM()` (AGENTS.md invariant #1 — no raw provider calls); the hashtag
// spine is deterministic (the bank).
//
// Testability mirrors the production-plan builder (#407): the draft fn is
// INJECTABLE, so unit tests stub it without `mock.module`-ing a shared lib
// (#072). The CLI smoke path additionally honors a narrowly-scoped
// `RALPHY_FAKE_CAPTION_JSON` env hook (same shape as `RALPHY_FAKE_TRANSCRIBE_JSON`)
// so a subprocess test can short-circuit the live call.

import { callLLM } from "../providers/llm.js";
import { bankTags } from "./hashtag-bank.js";
import { resolveNicheKey } from "./hashtag-bank.js";
import type { UnitCaption } from "../schemas/unit.js";

/** Default copy-draft model. Cheap + fast text model — copy is short. */
export const DEFAULT_CAPTION_MODEL = "google/gemini-2.5-flash";

/** Shorts titles are capped at 40 chars (platform-shaping rule, #403). */
export const SHORTS_TITLE_MAX = 40;

/** The grounding context the drafter reasons over for one unit. */
export interface CaptionContext {
  /** Project id (for the generations.jsonl log line). */
  projectId?: string;
  /** Unit slug. */
  slug: string;
  /** Unit format (video / carousel / …) — shapes the format hashtags. */
  format: string;
  /** Target-audience language for the copy (e.g. "English", "German"). */
  language: string;
  /** Niche / register hint (content-mode, register, or a tag) — picks the voice + tag spine. */
  niche?: string;
  /** Optional human title of the unit. */
  title?: string;
  /** Optional short blurb. */
  blurb?: string;
  /** Unit tags (filter descriptors) — extra grounding for niche + topic. */
  tags?: string[];
  /** Optional free-text brief / on-screen-text / source-reel caption to ground the copy. */
  brief?: string;
}

/** The platform-shaped copy block the drafter returns (pre-hashtag-merge). */
export interface DraftedCopy {
  tiktok: string;
  reels: string;
  shorts: string;
}

/** An injectable draft fn — stubbed in unit tests, real impl in prod. */
export type CaptionDraftFn = (ctx: CaptionContext) => Promise<unknown>;

const DRAFT_PROMPT = `You are a social-media copywriter. Write ready-to-paste post copy for ONE finished piece of content, shaped for three platforms. Match the niche's native VOICE: meme / brainrot register for viral meme niches, professional for a brand ad, etc.

Write ALL copy in this language: {{LANGUAGE}}. Do NOT add hashtags (they are appended separately).

Content:
- slug: {{SLUG}}
- format: {{FORMAT}}
- niche / register: {{NICHE}}
- title: {{TITLE}}
- blurb: {{BLURB}}
- tags: {{TAGS}}
- brief / source notes: {{BRIEF}}

Return STRICT JSON, no prose, no code fences:
{
  "tiktok": "one punchy hook line (1 sentence, scroll-stopping)",
  "reels": "a fuller caption (2-4 sentences, on-voice, ends with a soft CTA)",
  "shorts": "a title of at most 40 characters"
}`;

/** Production draft fn — builds the prompt + calls the LLM in jsonMode. */
export async function llmDraftCopy(
  ctx: CaptionContext,
  opts: { model?: string } = {},
): Promise<unknown> {
  const prompt = DRAFT_PROMPT.replace("{{LANGUAGE}}", ctx.language)
    .replace("{{SLUG}}", ctx.slug)
    .replace("{{FORMAT}}", ctx.format)
    .replace("{{NICHE}}", ctx.niche ?? "(unspecified)")
    .replace("{{TITLE}}", ctx.title ?? "(none)")
    .replace("{{BLURB}}", ctx.blurb ?? "(none)")
    .replace("{{TAGS}}", (ctx.tags ?? []).join(", ") || "(none)")
    .replace("{{BRIEF}}", (ctx.brief ?? "(none)").slice(0, 2000));

  const { text } = await callLLM({
    messages: [{ role: "user", content: prompt }],
    model: opts.model ?? DEFAULT_CAPTION_MODEL,
    temperature: 0.7,
    jsonMode: true,
    projectId: ctx.projectId,
    endpoint: "unit-caption",
    slot: `caption-${ctx.slug}`,
  });

  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  return JSON.parse(cleaned);
}

/**
 * The CLI-default draft fn: reads `RALPHY_FAKE_CAPTION_JSON` (a JSON file with
 * `{ tiktok, reels, shorts }`) when set so subprocess smoke tests skip the live
 * call, otherwise delegates to `llmDraftCopy`. Narrowly scoped — never relied on
 * in a real run.
 */
export async function defaultDraftFn(ctx: CaptionContext): Promise<unknown> {
  const fakePath = process.env.RALPHY_FAKE_CAPTION_JSON;
  if (fakePath) {
    const fs = await import("node:fs/promises");
    return JSON.parse(await fs.readFile(fakePath, "utf8"));
  }
  return llmDraftCopy(ctx);
}

/** Coerce an unknown draft payload into a safe `DraftedCopy`, with fallbacks. */
function coerceDraft(raw: unknown, ctx: CaptionContext): DraftedCopy {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
  // Heuristic fallbacks keep the verb from failing on a malformed LLM reply.
  const fallbackHook = ctx.title ?? ctx.slug;
  const tiktok = str(o.tiktok) || fallbackHook;
  const reels = str(o.reels) || ctx.blurb || fallbackHook;
  let shorts = str(o.shorts) || fallbackHook;
  if (shorts.length > SHORTS_TITLE_MAX) shorts = shorts.slice(0, SHORTS_TITLE_MAX).trim();
  return { tiktok, reels, shorts };
}

export interface BuildCaptionInput {
  ctx: CaptionContext;
  /** Injectable draft fn. Defaults to `defaultDraftFn` (LLM / env hook). */
  draft?: CaptionDraftFn;
  /** Override the hashtag count cap. */
  hashtagLimit?: number;
}

/**
 * Build a full, schema-valid `UnitCaption` for one unit: draft the platform copy
 * (injected fn → LLM), then merge the niche + format hashtag bank in. Pure of
 * filesystem side effects (the command owns the write).
 */
export async function buildUnitCaption(input: BuildCaptionInput): Promise<UnitCaption> {
  const { ctx } = input;
  const draftFn = input.draft ?? defaultDraftFn;

  let raw: unknown;
  try {
    raw = await draftFn(ctx);
  } catch {
    raw = {};
  }
  const copy = coerceDraft(raw, ctx);

  const niche = resolveNicheKey(ctx.niche ?? (ctx.tags ?? []).join(" "));
  const hashtags = bankTags({
    niche,
    format: ctx.format,
    limit: input.hashtagLimit,
  });

  return {
    platform: { tiktok: copy.tiktok, reels: copy.reels, shorts: copy.shorts },
    hashtags,
    language: ctx.language,
    niche,
    created: new Date().toISOString(),
  };
}

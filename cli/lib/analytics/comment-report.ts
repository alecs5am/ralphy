// `ralphy analytics comments report <unit>` (#582) — what viewers said, where
// in the video they said it, and what to do next. Read-only: nothing is
// posted, replied to, or pinned, and no model is called.
//
// From the stored comments of one Unit it derives:
//   • counts per class (spam and the creator's own comments are excluded),
//     and the top comments per class by likes;
//   • a beat-level map: every timestamp / position cue a comment names is
//     placed on a scenario beat (scenario.json scenes, timed by the #571
//     retention facts), joined to the #558 retention curve when one was
//     imported (retention at the beat's start and end, the steepest drop);
//   • iteration proposals, each with evidence (comment ids, distinct
//     commenters, likes): next-video ideas from demand (topic groups of
//     requests and questions, or a plain "part 2"), fixes for the beats that
//     confused viewers (the hook gets a hook proposal), delivery fixes by
//     facet, packaging changes (clickbait objections), and answers to the
//     recurring objection. A proposal needs `minN` distinct commenters;
//     smaller patterns are listed as signals, never as claims.

import fs from "node:fs";
import path from "node:path";
import { contentWords, retentionCheck } from "../eval/retention-check.js";
import {
  findUnitCommentsDocument,
  listUnitOutcomeFacts,
  type OutcomeObservationDto,
  type UnitLocationDto,
} from "../store/outcomes.js";
import type { QueryContext } from "../store/scope-context.js";
import { resolveUnitReference, unitContext } from "../unit-revision.js";
import {
  COMMENT_CLASSES,
  parsePostCommentsBody,
  type CommentClass,
  type CommentMoment,
  type PostCommentsBody,
  type StoredComment,
} from "../schemas/post-comments.js";
import {
  classifyComment,
  clip,
  COMMENT_RULES_VERSION,
  facetsFor,
  formatMoment,
  momentLabel,
  normalizeCommentText,
  type CommentFacet,
} from "./comment-rules.js";
import { gatherStoreSources, resolveProjectDirectory } from "./ledger.js";

export interface CommentReportOptions {
  /** Distinct commenters a pattern needs before it becomes a proposal. */
  minN: number;
  /** Comments listed per class. */
  top: number;
  /** Restrict to one platform's comments. */
  platform?: string;
}

export const DEFAULT_COMMENT_REPORT_OPTIONS: CommentReportOptions = { minN: 2, top: 3 };
/** Minimum analyzed comments before `analytics report` shows a unit's comment signals. */
export const DEFAULT_COMMENT_SIGNAL_MIN_N = 5;

const MAX_EVIDENCE_IDS = 25;

// ─── active comments ─────────────────────────────────────────────────────────

export interface AnalyzedComment {
  comment: StoredComment;
  labels: CommentClass[];
  rules: string[];
  facets: CommentFacet[];
  /** Distinct-commenter key: the author hash, else the comment itself. */
  who: string;
}

/**
 * Split stored comments into analyzed / spam / creator. Rule labels are
 * recomputed with the current rules; agent and LLM labels are kept as stored.
 */
export function analyzeComments(comments: StoredComment[], platform?: string) {
  const analyzed: AnalyzedComment[] = [];
  const spam: AnalyzedComment[] = [];
  let creator = 0;
  let filtered = 0;
  for (const comment of comments) {
    if (platform && comment.platform !== platform) {
      filtered += 1;
      continue;
    }
    if (comment.byCreator) {
      creator += 1;
      continue;
    }
    let labels: CommentClass[];
    let rules: string[] = [];
    if (comment.labelSource === "rules") {
      const classified = classifyComment(comment.text, { hasMoment: comment.moments.length > 0 });
      labels = classified.labels;
      rules = classified.rules;
    } else {
      labels = [...comment.labels];
    }
    const entry: AnalyzedComment = {
      comment,
      labels,
      rules,
      facets: facetsFor(comment.text, labels),
      who: comment.authorHash ?? comment.id,
    };
    if (labels.includes("spam")) spam.push(entry);
    else analyzed.push(entry);
  }
  return { analyzed, spam, creator, filtered };
}

function distinct(entries: AnalyzedComment[]): number {
  return new Set(entries.map((entry) => entry.who)).size;
}

function likes(entries: AnalyzedComment[]): number {
  return entries.reduce((sum, entry) => sum + (entry.comment.likes ?? 0), 0);
}

function byLikes(a: AnalyzedComment, b: AnalyzedComment): number {
  return (b.comment.likes ?? 0) - (a.comment.likes ?? 0) || (a.comment.postedAt ?? 0) - (b.comment.postedAt ?? 0) || a.comment.id.localeCompare(b.comment.id);
}

function commentRow(entry: AnalyzedComment) {
  return {
    id: entry.comment.id,
    platform: entry.comment.platform,
    text: clip(entry.comment.text, 280),
    likes: entry.comment.likes,
    labels: entry.labels,
    moments: entry.comment.moments.map(momentLabel),
  };
}

// ─── beats ───────────────────────────────────────────────────────────────────

export interface Beat {
  sceneId: string;
  role: string;
  startS: number;
  endS: number;
  vo: string | null;
}

/** Scenario beats with start / end seconds (any scenario shape the #571 facts read). */
export function scenarioBeats(scenario: unknown): { beats: Beat[]; runtimeS: number | null; timed: boolean } {
  const facts = retentionCheck(scenario);
  const beats = facts.scenes.map((scene) => ({
    sceneId: scene.id,
    role: scene.role,
    startS: scene.startS,
    endS: scene.endS,
    vo: sceneVo(scenario, scene.id),
  }));
  const timed = beats.some((beat) => beat.endS > beat.startS);
  return { beats, runtimeS: facts.runtime.runtimeS, timed };
}

function sceneVo(scenario: unknown, id: string): string | null {
  if (!scenario || typeof scenario !== "object") return null;
  const scenes = (scenario as Record<string, unknown>).scenes;
  const list = Array.isArray(scenes) ? scenes : scenes && typeof scenes === "object" ? Object.values(scenes as Record<string, unknown>) : [];
  for (const scene of list) {
    if (!scene || typeof scene !== "object") continue;
    const record = scene as Record<string, unknown>;
    if (record.id !== id) continue;
    const voice = record.voiceover && typeof record.voiceover === "object" ? (record.voiceover as Record<string, unknown>).text : undefined;
    const text = [record.vo_text, voice, record.vo].find((value) => typeof value === "string" && value.trim());
    return typeof text === "string" ? clip(text, 120) : null;
  }
  return null;
}

/** Place one moment on a beat; null + reason when it cannot be placed. */
export function beatForMoment(
  moment: CommentMoment,
  beats: Beat[],
  runtimeS: number | null,
): { beat: Beat; reason: null } | { beat: null; reason: string } {
  if (beats.length === 0) return { beat: null, reason: "no scenario beats" };
  if (moment.cue === "start") return { beat: beats[0]!, reason: null };
  if (moment.cue === "end") return { beat: beats[beats.length - 1]!, reason: null };
  const t = moment.t!;
  if (!beats.some((beat) => beat.endS > beat.startS)) return { beat: null, reason: "the scenario has no scene durations" };
  const end = runtimeS ?? beats[beats.length - 1]!.endS;
  if (t > end + 1) return { beat: null, reason: `after the end of the scenario (${formatMoment(end)})` };
  const found = beats.find((beat) => t >= beat.startS && t < beat.endS);
  return { beat: found ?? beats[beats.length - 1]!, reason: null };
}

// ─── retention (#558) ────────────────────────────────────────────────────────

export interface RetentionSeries {
  platform: string;
  points: Array<{ t: number; pct: number }>;
  source: "analytics-import" | "snapshot";
  publicationId: string;
}

/** The newest retention curve among the Unit's observations, preferring `preferPlatform`. */
export function retentionSeries(observations: OutcomeObservationDto[], preferPlatform: string | null): RetentionSeries | null {
  const candidates: RetentionSeries[] = [];
  for (const observation of observations) {
    const imported = observation.importFacts?.retention ?? null;
    const column = Array.isArray(observation.snapshot.retentionCurve)
      ? (observation.snapshot.retentionCurve as unknown[]).flatMap((point) => {
          if (!point || typeof point !== "object" || Array.isArray(point)) return [];
          const { t, pct } = point as Record<string, unknown>;
          return typeof t === "number" && typeof pct === "number" ? [{ t, pct }] : [];
        })
      : [];
    const points = imported && imported.length >= 2 ? imported : column;
    if (points.length < 2) continue;
    candidates.push({
      platform: observation.platform,
      points: [...points].sort((a, b) => a.t - b.t),
      source: imported && imported.length >= 2 ? "analytics-import" : "snapshot",
      publicationId: observation.publicationId,
    });
  }
  return candidates.find((candidate) => candidate.platform === preferPlatform) ?? candidates[0] ?? null;
}

/** Linear interpolation inside the curve; null outside it (never extrapolated). */
export function retentionAt(points: Array<{ t: number; pct: number }>, t: number): number | null {
  if (points.length === 0 || t < points[0]!.t || t > points[points.length - 1]!.t) return null;
  for (let index = 1; index < points.length; index += 1) {
    const left = points[index - 1]!;
    const right = points[index]!;
    if (t <= right.t) {
      if (right.t === left.t) return right.pct;
      return round2(left.pct + ((t - left.t) / (right.t - left.t)) * (right.pct - left.pct));
    }
  }
  return points[points.length - 1]!.pct;
}

// ─── demand topics ───────────────────────────────────────────────────────────

const DEMAND_STOPWORDS = new Set(
  (
    "part parts video videos vid vids please pls plz make made more next one ones another can could would will you your this that " +
    "series need want wanted waiting wait show tell explain how what why where when who thanks thank love great really also guys bro " +
    "sir man lol omg yes yeah okay about review try test compare comparing comparison content follow followup follow-up sequel " +
    "version full longer deep dive tutorial episode two three four five first second third pt ep doing did does done should " +
    "someone anyone anybody know think thing things stuff way ways something everything nothing much many lot lots please " +
    "watch watched watching viewer viewers channel creator post posts today tomorrow soon asap new old good best cool nice"
  ).split(/\s+/u),
);

function topicTokens(text: string): string[] {
  const cleaned = normalizeCommentText(text)
    .replace(/(?:https?:\/\/|www\.)\S+/gu, " ")
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/gu, " ");
  const allowed = new Set(contentWords(cleaned));
  return (cleaned.match(/[a-z][a-z0-9'+-]*/gu) ?? []).map((word) => {
    if (!allowed.has(word) || DEMAND_STOPWORDS.has(word) || word.length < 3) return "";
    return word.length > 4 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;
  });
}

interface TopicGroup {
  topic: string;
  entries: AnalyzedComment[];
}

/**
 * Greedy topic groups over demand comments: the unigram or adjacent bigram
 * shared by the most distinct commenters wins (a bigram beats its unigram on
 * a tie), its comments leave the pool, repeat while a topic has 2+ commenters.
 */
export function demandTopics(entries: AnalyzedComment[]): { groups: TopicGroup[]; rest: AnalyzedComment[] } {
  const keys = new Map<AnalyzedComment, Set<string>>();
  for (const entry of entries) {
    const tokens = topicTokens(entry.comment.text);
    const set = new Set<string>();
    tokens.forEach((token, index) => {
      if (!token) return;
      set.add(token);
      const next = tokens[index + 1];
      if (next) set.add(`${token} ${next}`);
    });
    keys.set(entry, set);
  }
  let pool = [...entries];
  const groups: TopicGroup[] = [];
  for (;;) {
    const support = new Map<string, AnalyzedComment[]>();
    for (const entry of pool) {
      for (const key of keys.get(entry) ?? []) {
        const list = support.get(key) ?? [];
        list.push(entry);
        support.set(key, list);
      }
    }
    let best: { key: string; entries: AnalyzedComment[]; n: number } | null = null;
    for (const [key, list] of support) {
      const n = distinct(list);
      if (n < 2) continue;
      if (
        !best ||
        n > best.n ||
        (n === best.n && key.includes(" ") && !best.key.includes(" ")) ||
        (n === best.n && key.includes(" ") === best.key.includes(" ") && (likes(list) > likes(best.entries) || (likes(list) === likes(best.entries) && key < best.key)))
      ) {
        best = { key, entries: list, n };
      }
    }
    if (!best) break;
    groups.push({ topic: best.key, entries: best.entries });
    const taken = new Set(best.entries);
    pool = pool.filter((entry) => !taken.has(entry));
  }
  return { groups, rest: pool };
}

// ─── proposals ───────────────────────────────────────────────────────────────

export type ProposalType = "hook" | "fix-beat" | "next-video" | "packaging" | "objection" | "delivery" | "clarity";
const TYPE_ORDER: ProposalType[] = ["hook", "fix-beat", "next-video", "packaging", "objection", "delivery", "clarity"];

export interface ProposalEvidence {
  /** Distinct commenters behind the pattern (the minimum-n unit). */
  count: number;
  comments: number;
  likes: number;
  commentIds: string[];
  example: { id: string; text: string; likes: number | null } | null;
  beat?: { sceneId: string; role: string; startS: number; endS: number };
  retention?: { platform: string; startPct: number | null; endPct: number | null; dropPct: number | null; steepest: boolean } | null;
  facet?: string;
}

export interface Proposal {
  id: string;
  type: ProposalType;
  title: string;
  action: string;
  rationale: string;
  evidence: ProposalEvidence;
}

const DELIVERY_ACTIONS: Record<string, { title: string; action: string }> = {
  "pace-fast": {
    title: "Slow the rushed delivery",
    action: "Lengthen the rushed beats or cut words so the VO stays followable; check words per second with `ralphy eval retention-check`.",
  },
  "pace-slow": {
    title: "Tighten the slow parts",
    action: "Cut the stretches viewers call slow or long and bring the payoff earlier; check the longest quiet stretch with `ralphy eval retention-check`.",
  },
  audio: {
    title: "Fix the audio mix",
    action: "Keep the VO intelligible over the music and the loudness consistent; confirm with the `ralphy eval video` audio findings.",
  },
  text: {
    title: "Fix on-screen text legibility",
    action: "Larger text, longer dwell, and placement outside the platform UI zones.",
  },
  visual: {
    title: "Fix the visuals viewers flag",
    action: "Address the named visual problem (quality, flashing, cut rate) on the beats where it shows.",
  },
  synthetic: {
    title: "Reduce the synthetic feel",
    action: "Viewers name the AI voice or look: try a different voice or model, or a more natural take, for the next cut.",
  },
  unspecified: {
    title: "Review the delivery criticism",
    action: "Read the listed comments and fix the delivery problem they share in the next cut.",
  },
};

const OBJECTION_ACTIONS: Record<string, { title: string; action: string }> = {
  accuracy: {
    title: "Back the contested claim",
    action: "Show proof where the claim is made (a source, a demo, the numbers) or soften it; answering it can be the next video.",
  },
  disagree: {
    title: "Address the main counter-argument",
    action: "Name the strongest disagreement and answer it in the next cut or a follow-up video.",
  },
  value: {
    title: "Answer the value doubt",
    action: "Say who it is for and what it beats (a cheaper comparison) before the ask.",
  },
  unspecified: {
    title: "Address the recurring objection",
    action: "Read the listed objections and answer the shared one with evidence in the next cut.",
  },
};

function evidenceOf(entries: AnalyzedComment[]): ProposalEvidence {
  const sorted = [...entries].sort(byLikes);
  const top = sorted[0];
  return {
    count: distinct(entries),
    comments: entries.length,
    likes: likes(entries),
    commentIds: sorted.slice(0, MAX_EVIDENCE_IDS).map((entry) => entry.comment.id),
    example: top ? { id: top.comment.id, text: clip(top.comment.text, 200), likes: top.comment.likes } : null,
  };
}

function beatWindow(beat: Beat): string {
  return `${formatMoment(beat.startS)}-${formatMoment(beat.endS)}`;
}

// ─── the report ──────────────────────────────────────────────────────────────

export function buildCommentReport(input: {
  unit: { id: string; slug: string; format: string; projectId: string | null; projectSlug: string | null };
  body: PostCommentsBody | null;
  scenario: unknown;
  scenarioSource: string | null;
  observations: OutcomeObservationDto[];
  options: CommentReportOptions;
  generatedAt?: string;
}) {
  const options = input.options;
  const stored = input.body?.comments ?? [];
  const { analyzed, spam, creator, filtered } = analyzeComments(stored, options.platform);
  const notes: string[] = [];

  // Classes.
  const classes = COMMENT_CLASSES.map((label) => {
    const group = label === "spam" ? spam : analyzed.filter((entry) => entry.labels.includes(label));
    return {
      class: label,
      comments: group.length,
      commenters: distinct(group),
      likes: likes(group),
      share: analyzed.length > 0 && label !== "spam" ? round4(group.length / analyzed.length) : null,
    };
  });
  const top = Object.fromEntries(
    COMMENT_CLASSES.filter((label) => label !== "spam").map((label) => [
      label,
      analyzed.filter((entry) => entry.labels.includes(label)).sort(byLikes).slice(0, options.top).map(commentRow),
    ]),
  ) as Record<Exclude<CommentClass, "spam">, ReturnType<typeof commentRow>[]>;

  // Beats.
  const withMoments = analyzed.filter((entry) => entry.comment.moments.length > 0);
  const platformCounts = new Map<string, number>();
  for (const entry of analyzed) platformCounts.set(entry.comment.platform, (platformCounts.get(entry.comment.platform) ?? 0) + 1);
  const primaryPlatform = [...platformCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
  const retention = retentionSeries(input.observations, options.platform ?? primaryPlatform);
  const beatModel = input.scenario !== null && input.scenario !== undefined ? scenarioBeats(input.scenario) : null;
  const beatHits = new Map<string, AnalyzedComment[]>();
  const unmapped: Array<{ commentId: string; moment: string; reason: string }> = [];
  for (const entry of withMoments) {
    const placed = new Set<string>();
    for (const moment of entry.comment.moments) {
      if (!beatModel) {
        unmapped.push({ commentId: entry.comment.id, moment: momentLabel(moment), reason: "no scenario for this Unit" });
        continue;
      }
      const result = beatForMoment(moment, beatModel.beats, beatModel.runtimeS);
      if (!result.beat) {
        unmapped.push({ commentId: entry.comment.id, moment: momentLabel(moment), reason: result.reason });
        continue;
      }
      if (placed.has(result.beat.sceneId)) continue;
      placed.add(result.beat.sceneId);
      const list = beatHits.get(result.beat.sceneId) ?? [];
      list.push(entry);
      beatHits.set(result.beat.sceneId, list);
    }
  }
  const beatRows = (beatModel?.beats ?? []).map((beat) => {
    const hits = beatHits.get(beat.sceneId) ?? [];
    const counts: Partial<Record<CommentClass, number>> = {};
    for (const label of COMMENT_CLASSES) {
      const n = hits.filter((entry) => entry.labels.includes(label)).length;
      if (n > 0) counts[label] = n;
    }
    const startPct = retention ? retentionAt(retention.points, beat.startS) : null;
    const endPct = retention ? retentionAt(retention.points, beat.endS) : null;
    const dropPct = startPct !== null && endPct !== null ? round2(startPct - endPct) : null;
    return {
      sceneId: beat.sceneId,
      role: beat.role,
      startS: beat.startS,
      endS: beat.endS,
      window: beatWindow(beat),
      vo: beat.vo,
      mentions: hits.length,
      commenters: distinct(hits),
      confusion: hits.filter((entry) => entry.labels.includes("confusion")).length,
      classes: counts,
      commentIds: [...hits].sort(byLikes).slice(0, 10).map((entry) => entry.comment.id),
      retention: retention
        ? {
            platform: retention.platform,
            startPct,
            endPct,
            dropPct,
            dropPerSec: dropPct !== null && beat.endS > beat.startS ? round2(dropPct / (beat.endS - beat.startS)) : null,
            steepest: false,
          }
        : null,
    };
  });
  const steepest = beatRows
    .filter((row) => row.retention?.dropPerSec !== null && row.retention?.dropPerSec !== undefined)
    .sort((a, b) => (b.retention!.dropPerSec ?? 0) - (a.retention!.dropPerSec ?? 0))[0];
  if (steepest?.retention && (steepest.retention.dropPerSec ?? 0) > 0) steepest.retention.steepest = true;
  const beatStatus = !beatModel
    ? "no-scenario"
    : !beatModel.timed
      ? "no-scene-timing"
      : withMoments.length === 0
        ? "no-moments"
        : "mapped";

  // Proposals.
  const candidates: Array<Omit<Proposal, "id">> = [];
  const signals: Array<{ type: ProposalType; title: string; count: number; commentIds: string[] }> = [];
  const consider = (proposal: Omit<Proposal, "id">) => {
    if (proposal.evidence.count >= options.minN) candidates.push(proposal);
    else if (proposal.evidence.count > 0) {
      signals.push({ type: proposal.type, title: proposal.title, count: proposal.evidence.count, commentIds: proposal.evidence.commentIds.slice(0, 10) });
    }
  };

  // Fix the beats that confused (or lost) viewers.
  for (const row of beatRows) {
    const hits = (beatHits.get(row.sceneId) ?? []).filter((entry) =>
      entry.labels.some((label) => label === "confusion" || label === "delivery-criticism" || label === "objection")
    );
    if (hits.length === 0) continue;
    const beat = beatModel!.beats.find((candidate) => candidate.sceneId === row.sceneId)!;
    const isHook = beat.role === "hook" || beat === beatModel!.beats[0];
    const confused = hits.filter((entry) => entry.labels.includes("confusion"));
    const delivery = hits.filter((entry) => entry.labels.includes("delivery-criticism"));
    const objecting = hits.filter((entry) => entry.labels.includes("objection"));
    const dominant = confused.length >= delivery.length && confused.length >= objecting.length
      ? "confusion"
      : delivery.length >= objecting.length
        ? "delivery"
        : "objection";
    const facet = delivery.length > 0 ? mostCommonFacet(delivery, ["pace-fast", "pace-slow", "audio", "text", "visual", "synthetic"]) : null;
    const kinds = [
      confused.length > 0 ? `${confused.length} confused` : null,
      delivery.length > 0 ? `${delivery.length} on delivery${facet ? ` (${facet})` : ""}` : null,
      objecting.length > 0 ? `${objecting.length} objecting` : null,
    ].filter((value): value is string => value !== null).join(", ");
    const retentionNote = row.retention?.dropPct !== null && row.retention?.dropPct !== undefined
      ? ` Retention on ${row.retention.platform} falls ${row.retention.dropPct} pts across this beat${row.retention.steepest ? " (the steepest drop)" : ""}.`
      : "";
    const action = dominant === "delivery"
      ? DELIVERY_ACTIONS[facet ?? "unspecified"]!.action
      : dominant === "objection"
        ? "Back the claim made in this beat with proof on screen (a source, a demo, the numbers), or soften it."
        : isHook
          ? "Rewrite the opening so the promise reads in one pass: say the topic in the VO and the on-screen text together, then re-run the hook and handoff checks of the retention review."
          : beat.role === "cta"
            ? "Make the ask specific: say what the viewer gets and keep it to one action."
            : "Clarify this beat: add an on-screen label or a one-line explanation, or give it more time so the point lands before the cut.";
    const evidence = evidenceOf(hits);
    consider({
      type: isHook ? "hook" : "fix-beat",
      title: isHook ? `Rework the hook (${row.sceneId}, ${row.window})` : `Fix ${row.sceneId} (${row.role}, ${row.window})`,
      action,
      rationale: `${evidence.count} commenter(s) named this moment (${kinds}).${retentionNote}`,
      evidence: {
        ...evidence,
        beat: { sceneId: row.sceneId, role: row.role, startS: row.startS, endS: row.endS },
        retention: row.retention
          ? { platform: row.retention.platform, startPct: row.retention.startPct, endPct: row.retention.endPct, dropPct: row.retention.dropPct, steepest: row.retention.steepest }
          : null,
        ...(dominant === "delivery" && facet ? { facet } : {}),
      },
    });
  }

  // Confusion that names no moment.
  const looseConfusion = analyzed.filter((entry) => entry.labels.includes("confusion") && entry.comment.moments.length === 0);
  if (looseConfusion.length > 0) {
    consider({
      type: "clarity",
      title: "Make the core point clearer",
      action: "Restate the main claim in one plain sentence early and check the one-idea rule of the retention review; the comments do not name a moment.",
      rationale: `${distinct(looseConfusion)} commenter(s) were confused without naming a moment.`,
      evidence: evidenceOf(looseConfusion),
    });
  }

  // Next videos from demand.
  // Confused questions are fixes, not demand (unless they also ask for more).
  const demand = analyzed.filter((entry) =>
    entry.labels.includes("request-more") || (entry.labels.includes("question") && !entry.labels.includes("confusion"))
  );
  const { groups, rest } = demandTopics(demand);
  for (const group of groups) {
    const requests = group.entries.filter((entry) => entry.labels.includes("request-more")).length;
    const asked = requests * 2 >= group.entries.length;
    const evidence = evidenceOf(group.entries);
    consider({
      type: "next-video",
      title: asked ? `Next video on "${group.topic}"` : `Answer "${group.topic}" in a follow-up`,
      action: asked
        ? `Make a follow-up on ${group.topic}; reuse the decisions that worked for this Unit (\`ralphy unit decisions\`).`
        : `Answer the recurring question about ${group.topic} in a follow-up video (or in a pinned reply the owner writes).`,
      rationale: `${evidence.count} commenter(s) ${asked ? "asked for" : "asked about"} "${group.topic}".`,
      evidence,
    });
  }
  const continuation = rest.filter((entry) => entry.facets.includes("continuation"));
  if (continuation.length > 0) {
    const evidence = evidenceOf(continuation);
    consider({
      type: "next-video",
      title: "Part 2: continue this video",
      action: "Make a part 2 on the same idea and keep what worked here (format, hook type, length).",
      rationale: `${evidence.count} commenter(s) asked for more without naming a topic.`,
      evidence,
    });
  }

  // Packaging and objections.
  const objections = analyzed.filter((entry) => entry.labels.includes("objection"));
  const packaging = objections.filter((entry) => entry.facets.includes("packaging"));
  if (packaging.length > 0) {
    consider({
      type: "packaging",
      title: "Align the title, cover and hook with the payoff",
      action: "Viewers call the packaging misleading: promise only what the cut pays off, or pay off the promise inside the video.",
      rationale: `${distinct(packaging)} commenter(s) objected to the title, cover, or an unanswered promise.`,
      evidence: { ...evidenceOf(packaging), facet: "packaging" },
    });
  }
  const otherObjections = objections.filter((entry) => !entry.facets.includes("packaging"));
  for (const facet of ["accuracy", "disagree", "value", "unspecified"] as const) {
    const group = otherObjections.filter((entry) =>
      facet === "unspecified"
        ? !entry.facets.some((value) => value === "accuracy" || value === "disagree" || value === "value")
        : mostCommonFacet([entry], ["accuracy", "value", "disagree"]) === facet
    );
    if (group.length === 0) continue;
    const spec = OBJECTION_ACTIONS[facet]!;
    consider({
      type: "objection",
      title: spec.title,
      action: spec.action,
      rationale: `${distinct(group)} commenter(s) raised an objection${facet === "unspecified" ? "" : ` (${facet})`}.`,
      evidence: { ...evidenceOf(group), facet },
    });
  }

  // Delivery, across the whole video.
  const deliveryAll = analyzed.filter((entry) => entry.labels.includes("delivery-criticism"));
  for (const facet of ["pace-fast", "pace-slow", "audio", "text", "visual", "synthetic", "unspecified"] as const) {
    const group = deliveryAll.filter((entry) =>
      facet === "unspecified"
        ? !entry.facets.some((value) => value in DELIVERY_ACTIONS)
        : entry.facets.includes(facet)
    );
    if (group.length === 0) continue;
    const spec = DELIVERY_ACTIONS[facet]!;
    consider({
      type: "delivery",
      title: spec.title,
      action: spec.action,
      rationale: `${distinct(group)} commenter(s) criticized the delivery (${facet}).`,
      evidence: { ...evidenceOf(group), facet },
    });
  }

  const proposals: Proposal[] = candidates
    .sort((a, b) =>
      b.evidence.count - a.evidence.count ||
      b.evidence.likes - a.evidence.likes ||
      TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) ||
      a.title.localeCompare(b.title)
    )
    .map((proposal, index) => ({ id: `p${index + 1}`, ...proposal }));

  // Notes.
  if (!input.body) {
    notes.push("No comments imported for this Unit yet: read the comment screenshots (or pull YouTube comments with --from-ytdlp), then `ralphy analytics comments import <unit> --platform <p> --data <json> --dry-run` and re-run with --yes.");
  } else if (analyzed.length === 0) {
    notes.push("Every stored comment is spam or the creator's own; nothing to analyze.");
  }
  if (signals.length > 0) {
    notes.push(`Patterns with fewer than ${options.minN} distinct commenters are listed under signals, not proposals.`);
  }
  if (beatStatus === "no-scenario" && withMoments.length > 0) {
    notes.push("Comments name moments but no scenario was found for this Unit; pass --from <project dir> to map them to beats.");
  }
  if (beatStatus === "no-scene-timing") notes.push("The scenario has no scene durations, so moments cannot be placed on beats.");
  if (retention === null && beatModel) notes.push("No retention curve imported for this Unit (#558 `ralphy analytics import` with `retention`), so beats show no retention.");
  const ruleLabeled = analyzed.filter((entry) => entry.comment.labelSource === "rules").length;
  if (ruleLabeled > 0) {
    notes.push(`${ruleLabeled} comment(s) carry English keyword-rule labels (rules v${COMMENT_RULES_VERSION}); pass labels in the JSON or re-import with --llm to refine the unlabeled ones.`);
  }
  notes.push("Read-only: nothing was posted, replied to, or pinned.");

  const platforms: Record<string, number> = {};
  for (const comment of stored) platforms[comment.platform] = (platforms[comment.platform] ?? 0) + 1;
  const labelSources = { agent: 0, rules: 0, llm: 0 };
  for (const entry of analyzed) labelSources[entry.comment.labelSource] += 1;
  return {
    kind: "comment-report" as const,
    unit: input.unit,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    settings: { minN: options.minN, top: options.top, platform: options.platform ?? null, rulesVersion: COMMENT_RULES_VERSION },
    coverage: {
      stored: stored.length,
      analyzed: analyzed.length,
      commenters: distinct(analyzed),
      spam: spam.length,
      creator,
      otherPlatforms: filtered,
      unclassified: analyzed.filter((entry) => entry.labels.length === 0).length,
      withMoments: withMoments.length,
      platforms,
      labelSources,
      imports: input.body?.imports.length ?? 0,
      lastImportAt: input.body?.imports.at(-1)?.at ?? null,
    },
    classes,
    top,
    beats: {
      status: beatStatus,
      scenarioSource: input.scenarioSource,
      runtimeS: beatModel?.runtimeS ?? null,
      retention: retention ? { platform: retention.platform, points: retention.points.length, source: retention.source } : null,
      rows: beatRows,
      unmapped: unmapped.slice(0, 50),
    },
    proposals,
    signals: signals.sort((a, b) => b.count - a.count || a.title.localeCompare(b.title)).slice(0, 30),
    notes,
  };
}

export type CommentReport = ReturnType<typeof buildCommentReport>;

function mostCommonFacet(entries: AnalyzedComment[], order: readonly string[]): string | null {
  const counts = new Map<string, number>();
  for (const entry of entries) for (const facet of entry.facets) if (order.includes(facet)) counts.set(facet, (counts.get(facet) ?? 0) + 1);
  let best: string | null = null;
  for (const facet of order) {
    const n = counts.get(facet) ?? 0;
    if (n > 0 && (best === null || n > (counts.get(best) ?? 0))) best = facet;
  }
  return best;
}

// ─── loading ─────────────────────────────────────────────────────────────────

/** The Unit's scenario: an explicit --from dir, else the bound store Document, else the project's scenario.json. */
export function loadUnitScenario(
  context: QueryContext,
  location: UnitLocationDto,
  fromDir?: string,
): { scenario: unknown; source: string | null } {
  const readFile = (dir: string) => {
    const file = path.join(dir, "scenario.json");
    if (!fs.existsSync(file)) return undefined;
    try {
      return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    } catch {
      return undefined;
    }
  };
  if (fromDir) {
    const dir = resolveProjectDirectory(location, fromDir);
    const value = dir ? readFile(dir) : undefined;
    if (value !== undefined) return { scenario: value, source: "project:scenario.json (--from)" };
  }
  try {
    const store = gatherStoreSources(context, location);
    if (store.sources.scenario !== undefined) {
      return { scenario: store.sources.scenario, source: store.sources.origins?.scenario ?? "store:document(scenario)" };
    }
  } catch {
    /* bindings are optional evidence */
  }
  const dir = resolveProjectDirectory(location);
  const value = dir ? readFile(dir) : undefined;
  return value !== undefined ? { scenario: value, source: "project:scenario.json" } : { scenario: null, source: null };
}

export function loadCommentReport(
  context: QueryContext,
  ref: string,
  options: CommentReportOptions,
  fromDir?: string,
) {
  const location = resolveUnitReference(context, ref);
  const scoped = unitContext(context, location);
  const document = findUnitCommentsDocument({ context: scoped, unitId: location.unitId });
  const body = document?.body ? parsePostCommentsBody(document.body) : null;
  const { scenario, source } = loadUnitScenario(scoped, location, fromDir);
  let observations: OutcomeObservationDto[] = [];
  try {
    observations = listUnitOutcomeFacts({ context: scoped }).find((unit) => unit.unitId === location.unitId)?.observations ?? [];
  } catch {
    observations = [];
  }
  return buildCommentReport({
    unit: {
      id: location.unitId,
      slug: location.slug,
      format: location.format,
      projectId: location.projectId,
      projectSlug: location.projectSlug,
    },
    body,
    scenario,
    scenarioSource: source,
    observations,
    options,
  });
}

// ─── `analytics report` section ──────────────────────────────────────────────

export interface CommentSignalRow {
  unit: string;
  unitId: string;
  platform: string;
  comments: number;
  commenters: number;
  status: "ok" | "insufficient data";
  question: number | null;
  requestMore: number | null;
  objection: number | null;
  confusion: number | null;
  praise: number | null;
  deliveryCriticism: number | null;
  spam: number;
  momentMentions: number | null;
  target: number | null;
  hit: boolean | null;
}

/**
 * Per Unit + platform comment signals for `analytics report`, joined to the
 * Unit's outcome on the same platform. Below `minN` analyzed comments a row
 * says "insufficient data" and carries no class counts.
 */
export function commentSignalsSection(input: {
  units: Array<{ unitId: string; slug: string }>;
  bodies: Map<string, PostCommentsBody>;
  outcomeFor: (unitId: string, platform: string) => { target: number | null; hit: boolean | null } | null;
  minN: number;
  platform?: string;
}) {
  const rows: CommentSignalRow[] = [];
  for (const unit of input.units) {
    const body = input.bodies.get(unit.unitId);
    if (!body) continue;
    const platforms = [...new Set(body.comments.map((comment) => comment.platform))]
      .filter((platform) => !input.platform || platform === input.platform)
      .sort();
    for (const platform of platforms) {
      const { analyzed, spam } = analyzeComments(body.comments, platform);
      const ok = analyzed.length >= input.minN;
      const count = (label: CommentClass) => (ok ? analyzed.filter((entry) => entry.labels.includes(label)).length : null);
      const outcome = input.outcomeFor(unit.unitId, platform);
      rows.push({
        unit: unit.slug,
        unitId: unit.unitId,
        platform,
        comments: analyzed.length,
        commenters: distinct(analyzed),
        status: ok ? "ok" : "insufficient data",
        question: count("question"),
        requestMore: count("request-more"),
        objection: count("objection"),
        confusion: count("confusion"),
        praise: count("praise"),
        deliveryCriticism: count("delivery-criticism"),
        spam: spam.length,
        momentMentions: ok ? analyzed.filter((entry) => entry.comment.moments.length > 0).length : null,
        target: outcome?.target ?? null,
        hit: outcome?.hit ?? null,
      });
    }
  }
  return {
    minN: input.minN,
    units: new Set(rows.map((row) => row.unitId)).size,
    rows,
    note: rows.length === 0
      ? "No imported comments. `ralphy analytics comments import <unit> --platform <p> --data <json> --dry-run`, then --yes."
      : `Class counts need ${input.minN}+ analyzed comments per unit and platform; \`ralphy analytics comments report <unit>\` maps moments to beats and lists proposals.`,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

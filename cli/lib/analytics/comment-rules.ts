// Deterministic comment classification + moment extraction (#582). Pure: no
// I/O, no model calls. English rules over lowercased text; every match records
// the rule id so a report can show WHY a comment landed in a class.
//
// Classes (a comment can carry several):
//   question           a "?" or an interrogative opening
//   request-more       "part 2", "do one on X", "more of this", "full version"
//   objection          accuracy / disagreement / value / packaging (clickbait)
//   confusion          "confused", "lost me", "what just happened", or a
//                      question that names a specific moment
//   praise             praise words or a positive emoji-only reaction
//   delivery-criticism pace (fast / slow), audio, on-screen text, visuals,
//                      synthetic voice / look
//   spam               links, self-promotion, scams. Spam overrides every
//                      other class and is excluded from all other counts.
//
// Precedence of label sources is applied by the caller: agent labels > LLM
// labels > these rules. The creator's own comments are never classified.

import type { CommentClass, CommentMoment } from "../schemas/post-comments.js";

/** Bump when a rule changes meaning; reports recompute rule labels live. */
export const COMMENT_RULES_VERSION = 1;

export type CommentFacet =
  | "pace-fast"
  | "pace-slow"
  | "audio"
  | "text"
  | "visual"
  | "synthetic"
  | "accuracy"
  | "disagree"
  | "value"
  | "packaging"
  | "continuation";

interface CommentRule {
  id: string;
  class: CommentClass;
  facet?: CommentFacet;
  pattern: RegExp;
}

const RULES: CommentRule[] = [
  // ── spam ──────────────────────────────────────────────────────────────────
  {
    id: "spam:link",
    class: "spam",
    pattern: /(?:https?:\/\/|www\.)\S+|\bt\.me\/\S+|\b[a-z0-9-]+\.(?:com|net|org|io|xyz|link|shop|store|site|online|top|club|info|biz|ly|gg)\/\S+/u,
  },
  {
    id: "spam:self-promo",
    class: "spam",
    pattern: /\b(?:check (?:out )?my (?:page|profile|channel|account|bio|videos?|content|shop|store)|visit my (?:page|profile|channel)|sub(?:scribe)? to (?:me|my channel)|sub ?4 ?sub|follow ?4 ?follow|f4f|l4l|follow me (?:for|back)|follow back)\b/u,
  },
  {
    id: "spam:scam",
    class: "spam",
    pattern: /\b(?:dm me (?:for|to)|text me on|whats ?app|telegram|crypto (?:signals?|investment|trading)|forex|investment (?:manager|advisor|platform)|earn \$?\d+|make \$\d+|giveaway winner|you(?:'ve| have) won|claim (?:your|the) (?:prize|reward)|free (?:followers|likes|views|robux|v-?bucks|gift ?cards?)|onlyfans)\b/u,
  },

  // ── request-more ──────────────────────────────────────────────────────────
  {
    id: "more:part-n",
    class: "request-more",
    facet: "continuation",
    pattern: /\b(?:part|pt\.?|ep(?:isode)?\.?)\s*(?:2|3|4|5|two|three|ii|next)\b|\bnext (?:part|episode|one)\b/u,
  },
  {
    id: "more:sequel",
    class: "request-more",
    facet: "continuation",
    pattern: /\b(?:sequel|follow[- ]?up|continuation|continue (?:this|the series|it)|make (?:this|it) a series|a series on)\b/u,
  },
  {
    id: "more:more-of-this",
    class: "request-more",
    facet: "continuation",
    pattern: /\b(?:more (?:of )?(?:this|these|videos? like this|content like this|please|pls|plz)|need more|want more|make more|do more|keep (?:them|these|it) coming|keep going)\b/u,
  },
  {
    id: "more:do-one-on",
    class: "request-more",
    pattern: /\b(?:(?:can|could|would|will) you (?:please |pls )?(?:do|make|try|review|cover|test|show|compare)|please (?:do|make|review|cover|test|show|compare)|(?:do|make) (?:a|one|another) (?:video |part )?(?:on|about|with|for|comparing)|video (?:on|about) (?:the|how|why)|tutorial (?:on|for)|how about (?:a|one|doing)|you should (?:do|make|try|review|test))\b/u,
  },
  {
    id: "more:waiting",
    class: "request-more",
    facet: "continuation",
    pattern: /\b(?:waiting for (?:the )?(?:next|part|more)|when(?:'s| is| will) (?:the )?(?:next|part)|can't wait for (?:the )?(?:next|part|more))\b/u,
  },
  {
    id: "more:full-version",
    class: "request-more",
    pattern: /\b(?:full (?:video|version|review|tutorial|breakdown)|longer (?:video|version)|in-depth|deep dive)\b/u,
  },

  // ── question ──────────────────────────────────────────────────────────────
  { id: "question:mark", class: "question", pattern: /\?/u },
  {
    id: "question:interrogative",
    class: "question",
    pattern: /^(?:what|why|how|where|when|which|who|whose)\b|^(?:is|are|was|were|does|do|did|can|could|will|would|should|has|have)\s+(?:it|this|that|they|he|she|you|i|we|there|the|anyone|anybody)\b/u,
  },
  {
    id: "question:product",
    class: "question",
    pattern: /\b(?:anyone know|does anyone|where (?:can|do|did) (?:i|you) (?:get|buy|find)|what(?:'s| is) the (?:name|song|brand|model|price|link|app|tool)|name of the (?:song|app|tool|product))\b/u,
  },

  // ── confusion ─────────────────────────────────────────────────────────────
  {
    id: "confusion:explicit",
    class: "confusion",
    pattern: /\b(?:confus(?:ed|ing)|i(?:'m| am) (?:lost|confused)|lost me|i don't (?:get|understand)|don't get it|didn't (?:get|understand|catch)|makes? no sense|doesn't make sense|what (?:just )?happened|what did (?:i|he|she|they|you) just|wait,? what|what am i (?:looking at|watching)|huh\b|unclear|can't tell what|what does .{1,40} mean|what do you mean|explain (?:what|why|how|the|this|that|please)|can't follow|went over my head)/u,
  },

  // ── objection ─────────────────────────────────────────────────────────────
  {
    id: "objection:accuracy",
    class: "objection",
    facet: "accuracy",
    pattern: /\b(?:not true|that's (?:not true|false|wrong|a lie|a myth|misinformation|cap)|this is (?:false|wrong|misinformation|a myth|fake|staged)|it's fake|you're wrong|(?:is|are|was|that's|totally|completely|just) wrong|incorrect|misinformation|misleading|myth|not accurate|inaccurate|sources?\?|citation needed|proof\?|any proof|says who|debunked|(?:doesn't|didn't|does not|did not) work|fake (?:review|news)|staged|scripted)/u,
  },
  {
    id: "objection:disagree",
    class: "objection",
    facet: "disagree",
    pattern: /\b(?:i disagree|disagree|not really|nope\b|i doubt|doubt it|hard to believe|i don't buy (?:it|this)|i don't think so|not convinced|bad advice|terrible advice|don't do this|don't listen)/u,
  },
  {
    id: "objection:value",
    class: "objection",
    facet: "value",
    pattern: /\b(?:overpriced|over priced|too expensive|not worth (?:it|the)|waste of money|rip ?off|scam\b|cheaper (?:alternative|option|one|elsewhere)|you can get .{1,40} for (?:less|cheaper|half))/u,
  },
  {
    id: "objection:packaging",
    class: "objection",
    facet: "packaging",
    pattern: /\b(?:click ?bait|bait\b|(?:title|thumbnail|cover|hook) (?:is|was) (?:misleading|wrong|a lie|fake)|misleading (?:title|thumbnail|cover|hook)|you never (?:showed|said|explained|answered)|never (?:showed|answered|explained) (?:the|it|what|how|why)|so what (?:was|is) the (?:answer|point)|didn't answer)/u,
  },

  // ── delivery-criticism ────────────────────────────────────────────────────
  {
    id: "delivery:pace-fast",
    class: "delivery-criticism",
    facet: "pace-fast",
    pattern: /\b(?:too fast|so fast|too quick|way too quick|slow (?:it )?down|(?:talk|talks|talking|speak|speaks|speaking) (?:too |so )?fast|(?:couldn't|can't) keep up|went by too fast|rushed|rushing)\b/u,
  },
  {
    id: "delivery:pace-slow",
    class: "delivery-criticism",
    facet: "pace-slow",
    pattern: /\b(?:too slow|so slow|dragg(?:ed|ing|s)|boring|bored|get to the point|took (?:too|so) long|too long|skip(?:ped)? to|fast ?forward(?:ed)?|1\.5x|2x speed|filler|could be shorter|long intro|pointless intro)\b/u,
  },
  {
    id: "delivery:audio",
    class: "delivery-criticism",
    facet: "audio",
    pattern: /\b(?:can't hear|couldn't hear|hard to hear|too quiet|too loud|(?:music|audio|sound|volume|background music|bgm) (?:is |was )?(?:too )?(?:loud|quiet|low|bad|annoying|distorted|off)|music drowns|audio quality|sound quality|muffled|echo(?:ey|y)?\b|ear ?rape|monotone|annoying voice|stop yelling|vocal fry|voice (?:is |was )?(?:annoying|grating|monotone|boring))/u,
  },
  {
    id: "delivery:text",
    class: "delivery-criticism",
    facet: "text",
    pattern: /\b(?:captions?|subtitles?|subs|font|text)\b.{0,30}\b(?:small|tiny|too fast|hard to read|annoying|distracting|out of sync|unreadable|blocking|covers?|too much|ugly)\b|\b(?:can't|couldn't|hard to) read\b|\bno (?:captions|subtitles|subs)\b/u,
  },
  {
    id: "delivery:visual",
    class: "delivery-criticism",
    facet: "visual",
    pattern: /\b(?:blurry|pixelated|low (?:quality|res)|bad (?:quality|lighting|editing)|too dark|too bright|shaky|too many cuts|cuts too (?:fast|much)|flashing|hurts? my eyes|headache|editing (?:is |was )?(?:too|bad|annoying|distracting)|transitions? (?:is |are |were )?(?:too|annoying|distracting|bad)|can't see (?:it|anything|the))/u,
  },
  {
    id: "delivery:synthetic",
    class: "delivery-criticism",
    facet: "synthetic",
    pattern: /\b(?:ai (?:voice|generated|slop|video|look|art)|robot(?:ic)? voice|sounds? (?:like a )?robot(?:ic)?|text to speech|tts\b|looks? (?:fake|ai|cgi|generated|weird|uncanny)|uncanny|soulless)/u,
  },

  // ── praise ────────────────────────────────────────────────────────────────
  {
    id: "praise:words",
    class: "praise",
    pattern: /\b(?:love (?:this|it|that|these|the|your|how)|loved (?:this|it)|i love|lovely|great (?:video|content|job|work|tips?|idea|explanation|review|stuff|one)|so (?:good|helpful|useful|cool|satisfying|clean|smooth)|amazing|awesome|incredible|brilliant|fantastic|excellent|beautiful|perfect|genius|legend(?:ary)?|goat(?:ed)?\b|underrated|masterpiece|fire\b|banger|chef's kiss|well (?:done|made|explained|said)|nice (?:one|video|work|job)|good (?:video|job|stuff|content|one)|helpful|useful|needed this|learned (?:something|a lot)|thank(?:s| you)|thx\b|best (?:video|explanation|review|channel|account)|subscribed|instant follow|this is gold|10\/10|keep it up)/u,
  },
];

// Phrases that would trip a rule with the wrong meaning; removed before matching.
const NEUTRALIZE: RegExp[] = [
  /\bno cap\b/gu, // slang for "truly"
  /\b(?:nothing|can't go|never) wrong\b/gu,
  /\b(?:not|never|isn't|wasn't|aren't|don't|doesn't|didn't)\s+(?:\w+\s+)?(?:great|good|helpful|useful|amazing|awesome|perfect|love|loved|nice|the best)\b/gu,
  /\bthe end of the day\b/gu,
];

// Emoji-only reactions (ASCII escapes keep this file plain text).
const POSITIVE_EMOJI = /[\u{1F525}\u{1F60D}\u{2764}\u{1F602}\u{1F923}\u{1F44F}\u{1F64C}\u{1F4AF}\u{2728}\u{1F970}\u{1F92F}\u{1F44D}\u{1F60A}\u{1F601}\u{1F60E}\u{1F64F}\u{1F496}\u{1F497}\u{1F499}\u{1F49C}\u{1F49A}\u{1F9E1}\u{1F49B}\u{1F5A4}\u{1F90D}\u{2665}]/u;
const BORED_EMOJI = /[\u{1F634}\u{1F971}]/u;
const NEGATIVE_EMOJI = /[\u{1F44E}\u{1F92E}\u{1F4A9}\u{1F644}\u{1F612}\u{1F621}\u{1F921}]/u;
const NON_EMOJI = /[\p{L}\p{N}]/u;

export interface CommentClassification {
  labels: CommentClass[];
  /** Rule ids that matched, in rule order. */
  rules: string[];
  /** Sub-kinds used by the proposals (delivery / objection facets, continuation). */
  facets: CommentFacet[];
}

// Left / right single quotes and the modifier-letter apostrophe, built from
// code points so the source stays ASCII.
const CURLY_APOSTROPHES = new RegExp(`[${String.fromCharCode(0x2018, 0x2019, 0x02bc)}]`, "gu");

/** Lowercase, straighten apostrophes, collapse whitespace. */
export function normalizeCommentText(text: string): string {
  return text.normalize("NFKC").replace(CURLY_APOSTROPHES, "'").toLowerCase().replace(/\s+/gu, " ").trim();
}

/**
 * Classify one comment. `hasMoment` (the comment names a timestamp or a
 * position cue) turns a moment-specific question into confusion as well,
 * unless it is a product / song / link question.
 */
export function classifyComment(text: string, options: { hasMoment?: boolean } = {}): CommentClassification {
  let normalized = normalizeCommentText(text);
  for (const pattern of NEUTRALIZE) normalized = normalized.replace(pattern, " ");
  const rules: string[] = [];
  const labels = new Set<CommentClass>();
  const facets = new Set<CommentFacet>();
  for (const rule of RULES) {
    if (!rule.pattern.test(normalized)) continue;
    rules.push(rule.id);
    labels.add(rule.class);
    if (rule.facet) facets.add(rule.facet);
  }
  if (!NON_EMOJI.test(normalized)) {
    if (BORED_EMOJI.test(normalized)) {
      rules.push("delivery:emoji-bored");
      labels.add("delivery-criticism");
      facets.add("pace-slow");
    } else if (NEGATIVE_EMOJI.test(normalized)) {
      rules.push("objection:emoji");
      labels.add("objection");
      facets.add("disagree");
    } else if (POSITIVE_EMOJI.test(normalized)) {
      rules.push("praise:emoji");
      labels.add("praise");
    }
  }
  if (labels.has("spam")) {
    return { labels: ["spam"], rules: rules.filter((id) => id.startsWith("spam:")), facets: [] };
  }
  if (options.hasMoment && labels.has("question") && !rules.includes("question:product") && !labels.has("confusion")) {
    rules.push("confusion:question-at-moment");
    labels.add("confusion");
  }
  return { labels: orderClasses(labels), rules, facets: [...facets].sort() };
}

const CLASS_ORDER: CommentClass[] = [
  "question",
  "request-more",
  "objection",
  "confusion",
  "praise",
  "delivery-criticism",
  "spam",
];

export function orderClasses(labels: Iterable<CommentClass>): CommentClass[] {
  const set = new Set(labels);
  return CLASS_ORDER.filter((label) => set.has(label));
}

/**
 * Facets for a comment whatever its label source: the rules' facets when they
 * agree with the labels, else `unspecified` is implied (no facet).
 */
export function facetsFor(text: string, labels: readonly CommentClass[]): CommentFacet[] {
  const ruled = classifyComment(text);
  const keep = new Set<CommentFacet>();
  for (const facet of ruled.facets) {
    const owner: CommentClass =
      facet === "continuation" ? "request-more" : ["accuracy", "disagree", "value", "packaging"].includes(facet) ? "objection" : "delivery-criticism";
    if (labels.includes(owner)) keep.add(facet);
  }
  return [...keep].sort();
}

// ─── moments ─────────────────────────────────────────────────────────────────

const CLOCK = /(?<![\d:.,])(\d{1,2}):([0-5]\d)(?::([0-5]\d))?(?![\d:])(?!\s*(?:am|pm|a\.m|p\.m)\b)/gu;
const AT_SECONDS = /\b(?:at|around|about|near|@)\s*(\d{1,3}(?:\.\d)?)\s*(?:s|sec|secs|second|seconds)\b/gu;
const SECONDS_IN = /\b(\d{1,3}(?:\.\d)?)\s*(?:s|sec|secs|second|seconds)\s+(?:in|mark)\b/gu;
const START_CUE = /\b(?:the|that|this) (?:beginning|start|intro|opening|first (?:few )?(?:seconds?|part|bit))\b|\bat the (?:beginning|start)\b/u;
const END_CUE = /\b(?:the|that|this) (?:ending|end|last (?:few )?(?:seconds?|part|bit)|outro|final (?:part|bit|seconds?))\b|\bat the end\b/u;

/** Timestamps ("0:12", "1:02:03", "at 12s", "12 sec in") and position cues in a comment. */
export function extractMoments(text: string): CommentMoment[] {
  const normalized = normalizeCommentText(text);
  const out: CommentMoment[] = [];
  const seen = new Set<string>();
  const push = (moment: CommentMoment) => {
    const key = `${moment.t}|${moment.cue}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(moment);
  };
  for (const match of normalized.matchAll(CLOCK)) {
    const [raw, a, b, c] = match;
    const seconds = c !== undefined ? Number(a) * 3600 + Number(b) * 60 + Number(c) : Number(a) * 60 + Number(b);
    push({ t: seconds, cue: null, raw: raw!, source: "text" });
  }
  for (const pattern of [AT_SECONDS, SECONDS_IN]) {
    for (const match of normalized.matchAll(pattern)) {
      push({ t: Number(match[1]), cue: null, raw: match[0]!.trim(), source: "text" });
    }
  }
  const start = START_CUE.exec(normalized);
  if (start) push({ t: null, cue: "start", raw: start[0]!, source: "text" });
  const end = END_CUE.exec(normalized);
  if (end) push({ t: null, cue: "end", raw: end[0]!, source: "text" });
  return out;
}

/** 72 → "1:12". */
export function formatMoment(seconds: number): string {
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

/** Whitespace-collapsed text cut to `max` characters with an ellipsis. */
export function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/gu, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}\u2026`;
}

export function momentLabel(moment: CommentMoment): string {
  return moment.t !== null ? formatMoment(moment.t) : moment.cue === "start" ? "start" : "end";
}

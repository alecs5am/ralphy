// Retention facts pre-check (#571).
//
// A light, deterministic read of a scenario.json that reports FACTS ONLY for
// the course-grounded retention review in
// `.agents/skills/scenarist/references/retention-review.md`. It never fails,
// never blocks, never emits a verdict: the Content Autopilot course treats
// fixed durations, cut intervals, mandatory captions and a CTA on every post
// as context-dependent, so a hard linter would contradict the source. The
// review interprets these numbers against the piece's content job.
//
// Facts reported (all derived from scene boundaries + VO / on-screen word
// counts; no model call, no network, no file writes):
//   • hook length: hook-scene end, the estimated moment the first statement
//     and the first promise-type cue land (uniform word timing within a scene)
//   • the longest single beat, and the longest stretch of consecutive scenes
//     that add no new VO / on-screen words
//   • CTA position as % of runtime, plus ask cues found inside the VO / text
//   • whether the last beat echoes the opening (shared content words or a
//     visual-return cue in the last scene's direction)
//   • words per second per scene and overall
//
// Accepts the canonical ScenarioSchema shape (cli/lib/schemas/scene.ts: a
// `scenes` record + hook/body/cta SceneRefs) AND the legacy shapes seen in
// older projects (scenes array, `durationSec`, `voiceover.text`, top-level
// `cta.startSec`). Anything it cannot read becomes a `notes[]` line, never a
// throw.

import os from "node:os";
import path from "node:path";
import { existsSync, statSync } from "node:fs";
import { loadConfigSync } from "../config.js";

/** Repo-relative path of the review method this pre-check feeds. */
export const RETENTION_REVIEW_DOC = ".agents/skills/scenarist/references/retention-review.md" as const;

/** Env var that overrides the Content Autopilot archive location. */
export const CA_ARCHIVE_ENV = "RALPHY_CA_ARCHIVE" as const;
/** Workspace setting key (`ralphy config set contentAutopilotArchive <path>`). */
export const CA_ARCHIVE_CONFIG_KEY = "contentAutopilotArchive" as const;
/** Default archive location on the owner's machine. */
export const CA_ARCHIVE_DEFAULT = "~/Desktop/Content-Autopilot-Archive" as const;

export interface CaArchiveInfo {
  /** Absolute archive root after `~` expansion. */
  path: string;
  /** Where the path came from. */
  source: "env" | "config" | "default";
  /** True when the directory exists. False is a graceful degrade, not an error. */
  available: boolean;
  /** How a `[CA: <lesson id> @ hh:mm:ss]` anchor resolves under this root. */
  anchorLookup: string;
}

function expandHome(p: string, home: string): string {
  if (p === "~") return home;
  if (p.startsWith("~/")) return path.join(home, p.slice(2));
  return p;
}

function defaultConfigReader(): unknown {
  try {
    // Workspace settings need an explicit Workspace scope; without one
    // loadConfigSync() returns {}. An unopenable store degrades to "no value".
    return loadConfigSync()[CA_ARCHIVE_CONFIG_KEY];
  } catch {
    return undefined;
  }
}

/**
 * Resolve the Content Autopilot archive root: `RALPHY_CA_ARCHIVE` → workspace
 * setting `contentAutopilotArchive` → `~/Desktop/Content-Autopilot-Archive`.
 * Never throws; `available: false` means anchors are unresolvable pointers.
 */
export function resolveCaArchive(opts: {
  env?: Record<string, string | undefined>;
  configValue?: unknown;
  readConfig?: () => unknown;
  home?: string;
} = {}): CaArchiveInfo {
  const env = opts.env ?? process.env;
  const home = opts.home ?? os.homedir();
  let raw: string = CA_ARCHIVE_DEFAULT;
  let source: CaArchiveInfo["source"] = "default";
  const fromEnv = env[CA_ARCHIVE_ENV];
  if (typeof fromEnv === "string" && fromEnv.trim()) {
    raw = fromEnv.trim();
    source = "env";
  } else {
    let fromConfig: unknown;
    try {
      fromConfig = "configValue" in opts ? opts.configValue : (opts.readConfig ?? defaultConfigReader)();
    } catch {
      fromConfig = undefined;
    }
    if (typeof fromConfig === "string" && fromConfig.trim()) {
      raw = fromConfig.trim();
      source = "config";
    }
  }
  const abs = path.resolve(expandHome(raw, home));
  let available = false;
  try {
    available = existsSync(abs) && statSync(abs).isDirectory();
  } catch {
    available = false;
  }
  return {
    path: abs,
    source,
    available,
    anchorLookup: `${abs}/02_distilled/<lesson id>-*.md (notes) or ${abs}/01_transcripts/<lesson id>-*.md (subtitles); titles in ${abs}/index.json`,
  };
}

// ─── Text helpers ──────────────────────────────────────────────────────────

const WORD_RE = /[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu;

const STOPWORDS = new Set(
  (
    "the a an and or but if then than so of to in on at by for with from into onto over under about as is are was were be been being " +
    "it its this that these those there here what which who whom whose when where why how i me my we our us you your he him his she her " +
    "they them their not no yes do does did done have has had can could will would should may might must just also very really " +
    "all any some more most much many one ones get got go goes going make makes made like even still only now out up down off too " +
    "let lets let's it's that's here's there's what's who's i'm i've i'll you're you've you'll we're they're " +
    "don't doesn't didn't can't won't isn't aren't wasn't"
  ).split(/\s+/),
);

/** Count spoken / written words. */
export function countWords(text: string): number {
  return (text.match(WORD_RE) ?? []).length;
}

/** Lowercased content words (≥3 chars, not a stopword). */
export function contentWords(text: string): string[] {
  return (text.toLowerCase().match(WORD_RE) ?? []).filter(
    (w) => w.length >= 3 && !STOPWORDS.has(w),
  );
}

/** Split into sentences on . ! ? (and the ellipsis), keeping non-empty parts. */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+/u)
    .map((s) => s.trim())
    .filter((s) => countWords(s) > 0);
}

/**
 * Promise-type cues: phrasing that tells the viewer what they will get. A
 * lexical heuristic, reported as the matched cue only; the review confirms.
 */
const PROMISE_CUES: Array<[string, RegExp]> = [
  ["question", /\?/u],
  ["how to", /\bhow to\b/iu],
  ["here's how/why/what", /\bhere['’]?s (?:how|why|what|the)\b/iu],
  ["you'll learn/know/see", /\byou['’]?ll (?:learn|know|see|find out|never)\b/iu],
  ["by the end", /\bby the end\b/iu],
  ["the reason/secret/mistake/truth", /\bthe (?:real )?(?:reason|secret|mistake|truth|trick|problem)\b/iu],
  ["why", /\bwhy\b/iu],
  ["what happens", /\bwhat (?:happens|if|nobody|no one)\b/iu],
  [
    "numbered list",
    /\b(?:\d+|two|three|four|five|six|seven|eight|nine|ten)\s+(?:\S+\s+){0,2}(?:ways?|reasons?|things?|mistakes?|tips?|possibilities|steps?|signs?|secrets?|rules?|myths?|options?|types?|lessons?)\b/iu,
  ],
];

function promiseCueOf(sentence: string): string | null {
  for (const [label, re] of PROMISE_CUES) if (re.test(sentence)) return label;
  return null;
}

/** Ask cues: words that request an action from the viewer. */
const ASK_CUES: Array<[string, RegExp]> = [
  ["follow", /\bfollow (?:me|us|for|along)\b/iu],
  ["subscribe", /\bsubscribe\b/iu],
  ["comment", /\b(?:comment (?:below|down|the word|["“'])|(?:drop|leave) (?:a |your )?comment|in the comments below)/iu],
  ["dm", /\b(?:dm|message) (?:me|us)\b/iu],
  ["link", /\blink in (?:the )?(?:bio|description|comments)\b/iu],
  ["save", /\bsave (?:this|it)\b/iu],
  ["share", /\bshare (?:this|it|with)\b/iu],
  ["tag", /\btag (?:a|someone|your)\b/iu],
  ["book", /\bbook (?:a|your|now)\b/iu],
  ["sign up", /\bsign up\b/iu],
  ["download", /\bdownload\b/iu],
  ["click / tap", /\b(?:click|tap)\b/iu],
  ["join", /\bjoin (?:us|the|my|our)\b/iu],
  ["buy / order / shop", /\b(?:buy|order|shop) (?:now|it|yours|here|today)\b/iu],
  ["get yours", /\bget (?:yours|your free|the free|it now)\b/iu],
];

/** A last-scene direction that explicitly returns to the opening. */
const VISUAL_RETURN_RE =
  /\b(?:returns? to|returning to|back to (?:the )?(?:open|start|first|beginning|hook)|loops? (?:back|to)|callback|bookends?|full circle|recursion|recursive|mirrors? the (?:open|first|hook)|same (?:shot|frame|plate|image) as (?:the )?(?:open|first|hook))\b/iu;

/** On-screen text cue inside free-text notes, e.g. `Caption: Your delivery is moving.` */
const NOTES_TEXT_RE =
  /(?:^|[.;]\s*|\n)\s*(?:caption|on-screen text|onscreen text|overlay text|text overlay|title card|card text|headline text|super)\s*:\s*["“]?(.+?)["”]?(?=[.;](?:\s|$)|\n|$)/giu;

// ─── Scenario normalization ────────────────────────────────────────────────

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

interface NormScene {
  id: string;
  role: string;
  durationS: number;
  vo: string;
  voSource: "scene" | "scene-ref" | "none";
  text: string;
  textSource: "overlays" | "field" | "notes" | "none";
  direction: string;
}

function sceneRefVo(scenario: Obj, id: string): string {
  const refs: unknown[] = [scenario.hook, scenario.cta, ...(Array.isArray(scenario.body) ? scenario.body : [])];
  for (const r of refs) {
    if (isObj(r) && r.scene_id === id && typeof r.vo === "string") return r.vo;
  }
  return "";
}

function sameWords(a: string, b: string): boolean {
  const norm = (x: string) => (x.toLowerCase().match(WORD_RE) ?? []).join(" ");
  return norm(a).length > 0 && norm(a) === norm(b);
}

function sceneText(s: Obj): { text: string; source: NormScene["textSource"] } {
  const overlays = Array.isArray(s.text_overlays) ? s.text_overlays : [];
  const fromOverlays = overlays
    .map((o) => (isObj(o) ? str(o.text) : typeof o === "string" ? o : ""))
    .filter(Boolean);
  if (fromOverlays.length) return { text: fromOverlays.join(" / "), source: "overlays" };
  for (const k of ["on_screen_text", "onscreen_text", "overlay_text", "caption", "text", "headline"]) {
    const v = s[k];
    if (typeof v === "string" && v.trim()) return { text: v.trim(), source: "field" };
    if (Array.isArray(v)) {
      const joined = v.filter((x) => typeof x === "string").join(" / ");
      if (joined.trim()) return { text: joined, source: "field" };
    }
  }
  const notes = str(s.notes);
  const hits = [...notes.matchAll(NOTES_TEXT_RE)].map((m) => (m[1] ?? "").trim()).filter(Boolean);
  if (hits.length) return { text: hits.join(" / "), source: "notes" };
  return { text: "", source: "none" };
}

function sceneDuration(s: Obj): number {
  const direct =
    num(s.target_duration_s) ?? num(s.durationSec) ?? num(s.duration_s) ?? num(s.duration) ?? num(s.durationHintSec);
  if (direct !== null) return Math.max(0, direct);
  const tin = num(s.trim_in_s);
  const tout = num(s.trim_out_s);
  if (tin !== null && tout !== null && tout > tin) return tout - tin;
  return 0;
}

function normalizeScenes(scenario: Obj, notes: string[]): NormScene[] {
  const raw = scenario.scenes;
  let entries: Array<[string | null, Obj]> = [];
  if (Array.isArray(raw)) {
    entries = raw.filter(isObj).map((s) => [null, s]);
  } else if (isObj(raw)) {
    entries = Object.entries(raw)
      .filter(([, v]) => isObj(v))
      .map(([k, v]) => [k, v as Obj]);
  } else {
    notes.push("scenario has no scenes container; scene-level facts are unavailable");
    return [];
  }
  const hookId = isObj(scenario.hook) ? str(scenario.hook.scene_id) : "";
  const ctaId = isObj(scenario.cta) ? str(scenario.cta.scene_id) : "";
  return entries.map(([key, s], i) => {
    const id = str(s.id) || key || `scene-${String(i + 1).padStart(2, "0")}`;
    const declaredRole = str(s.role).toLowerCase();
    const role = declaredRole || (id === hookId ? "hook" : id === ctaId ? "cta" : i === 0 ? "hook" : "body");
    let vo = str(s.vo_text) || (isObj(s.voiceover) ? str(s.voiceover.text) : "") || str(s.vo);
    let voSource: NormScene["voSource"] = vo ? "scene" : "none";
    const t = sceneText(s);
    if (t.source === "notes") notes.push(`${id}: on-screen text read from a caption cue in notes`);
    if (!vo && s.silent !== true) {
      const fromRef = sceneRefVo(scenario, id);
      if (fromRef && sameWords(fromRef, t.text)) {
        notes.push(`${id}: the hook/body/cta pointer text matches the on-screen text; counted as text, not VO`);
      } else if (fromRef) {
        vo = fromRef;
        voSource = "scene-ref";
        notes.push(`${id}: VO taken from the scenario hook/body/cta pointer (scene vo_text is empty)`);
      }
    }
    const direction = [str(s.camera), str(s.broll), str(s.notes), str(s.description)].filter(Boolean).join(" | ");
    return {
      id,
      role,
      durationS: sceneDuration(s),
      vo,
      voSource,
      text: t.text,
      textSource: t.source,
      direction,
    };
  });
}

// ─── Facts ─────────────────────────────────────────────────────────────────

export interface RetentionSceneFact {
  id: string;
  role: string;
  startS: number;
  endS: number;
  durationS: number;
  voWords: number;
  /** VO words per second; null for a zero-length scene or a scene with no VO. */
  wps: number | null;
  textWords: number;
  /** Content words (VO + on-screen) not seen earlier in the piece. */
  newWords: number;
  /** True when the scene adds at least one new VO / on-screen content word. */
  newInfo: boolean;
}

export interface RetentionFacts {
  schemaVersion: "1.0";
  factsOnly: true;
  runtime: {
    /** Runtime the percentages use: scene sum, else the declared target. */
    runtimeS: number | null;
    sceneSumS: number;
    declaredS: number | null;
    sceneCount: number;
    voWords: number;
    /** Total VO words / runtime. */
    wpsOverall: number | null;
    /** Highest per-scene VO rate. */
    wpsMax: { sceneId: string; wps: number } | null;
    /** Share of runtime covered by scenes that carry VO or on-screen words. Low = a visual-led piece. */
    wordCoveragePct: number | null;
  };
  hook: {
    sceneIds: string[];
    /** End of the hook scene(s): where the opening beat hands off. */
    endS: number | null;
    endPct: number | null;
    voWords: number;
    wps: number | null;
    /** Estimated end of the first complete VO sentence (or first on-screen text). */
    firstStatementS: number | null;
    /** Estimated end of the first sentence carrying a promise-type cue. */
    promiseCueS: number | null;
    /** The cue label matched (e.g. "how to", "numbered list"); null when none. */
    promiseCue: string | null;
    timing: "uniform-word-timing-within-scene";
  };
  longestBeat: { sceneId: string; seconds: number; startS: number; endS: number } | null;
  longestQuietStretch: {
    seconds: number;
    startS: number;
    endS: number;
    sceneIds: string[];
    /** words: VO/on-screen words present; visual-only: the scenario has none at all. */
    basis: "words" | "visual-only";
  } | null;
  cta: {
    declared: boolean;
    sceneIds: string[];
    startS: number | null;
    startPct: number | null;
    /** Action-request cues found in VO / on-screen text, anywhere in the piece. */
    askCues: Array<{ sceneId: string; atS: number; atPct: number | null; cue: string }>;
  };
  loopBack: {
    /** True when the last scene shares ≥2 content words with the opening, or its direction returns to it. */
    echoesOpening: boolean;
    sharedWords: string[];
    visualReturnCue: boolean;
    lastSceneId: string | null;
    rule: string;
  };
  scenes: RetentionSceneFact[];
  /** Degradations and data-source notes. Never errors. */
  notes: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (n: number, total: number | null) => (total && total > 0 ? Math.round((n / total) * 1000) / 10 : null);

/**
 * Compute retention facts from a parsed scenario object. Pure: no fs, no
 * network, no model call. Never throws; unreadable input yields empty facts
 * plus a note.
 */
export function retentionCheck(input: unknown): RetentionFacts {
  const notes: string[] = [];
  const scenario: Obj = isObj(input) ? input : {};
  if (!isObj(input)) notes.push("input is not a JSON object; no facts available");

  const scenes = normalizeScenes(scenario, notes);
  if (scenes.length === 0 && isObj(input) && (Array.isArray(scenario.scenes) || isObj(scenario.scenes))) {
    notes.push("scenario has zero scenes; review from the transcript or the render instead");
  }

  const declaredS =
    num(scenario.target_duration_s) ??
    num(scenario.durationSec) ??
    num(scenario.duration) ??
    num(scenario.totalDurationSec) ??
    num(scenario.totalDuration);

  // Legacy top-level CTA block ({ startSec, durationSec }) outside scenes[].
  const legacyCta = isObj(scenario.cta) && num(scenario.cta.startSec) !== null ? scenario.cta : null;

  // Timeline (cumulative; scenes play in container order).
  let t = 0;
  const seen = new Set<string>();
  const facts: RetentionSceneFact[] = [];
  const zeroDur: string[] = [];
  for (const s of scenes) {
    const startS = t;
    const endS = t + s.durationS;
    t = endS;
    if (s.durationS === 0) zeroDur.push(s.id);
    const voWords = countWords(s.vo);
    const textWords = countWords(s.text);
    const words = [...contentWords(s.vo), ...contentWords(s.text)];
    let fresh = 0;
    for (const w of words) {
      if (!seen.has(w)) {
        seen.add(w);
        fresh++;
      }
    }
    facts.push({
      id: s.id,
      role: s.role,
      startS: r2(startS),
      endS: r2(endS),
      durationS: r2(s.durationS),
      voWords,
      wps: voWords > 0 && s.durationS > 0 ? r2(voWords / s.durationS) : null,
      textWords,
      newWords: fresh,
      newInfo: fresh > 0,
    });
  }
  if (zeroDur.length) notes.push(`no duration on ${zeroDur.join(", ")}; timings treat them as 0 s`);

  const sceneSumS = r2(t);
  let runtimeS: number | null = sceneSumS > 0 ? sceneSumS : declaredS;
  if (legacyCta) {
    const ctaEnd = (num(legacyCta.startSec) ?? 0) + (num(legacyCta.durationSec) ?? 0);
    if (runtimeS === null || ctaEnd > runtimeS) runtimeS = r2(ctaEnd);
  }
  const voWordsTotal = facts.reduce((a, f) => a + f.voWords, 0);
  const wpsMaxFact = facts.filter((f) => f.wps !== null).sort((a, b) => (b.wps ?? 0) - (a.wps ?? 0))[0];

  // ── Hook ──
  const hookFacts = (() => {
    const declared = facts.filter((f) => f.role === "hook");
    if (declared.length) {
      // Contiguous run of hook scenes from the first one.
      const firstIdx = facts.indexOf(declared[0]!);
      const run: RetentionSceneFact[] = [];
      for (let i = firstIdx; i < facts.length && facts[i]!.role === "hook"; i++) run.push(facts[i]!);
      return run;
    }
    return facts.length ? [facts[0]!] : [];
  })();
  const hookEnd = hookFacts.length ? hookFacts[hookFacts.length - 1]!.endS : null;
  const hookVo = hookFacts.reduce((a, f) => a + f.voWords, 0);
  const hookDur = hookFacts.reduce((a, f) => a + f.durationS, 0);

  // Statement stream: VO sentences (estimated end time, uniform word timing
  // inside the scene) and on-screen text (time = scene start).
  type Unit = { atS: number; text: string; sceneId: string };
  const units: Unit[] = [];
  scenes.forEach((s, i) => {
    const f = facts[i]!;
    if (s.text) units.push({ atS: f.startS, text: s.text, sceneId: s.id });
    if (s.vo) {
      const total = countWords(s.vo);
      let acc = 0;
      for (const sentence of splitSentences(s.vo)) {
        acc += countWords(sentence);
        units.push({ atS: r2(f.startS + (total > 0 ? (acc / total) * f.durationS : 0)), text: sentence, sceneId: s.id });
      }
    }
  });
  units.sort((a, b) => a.atS - b.atS);
  const firstStatement = units[0] ?? null;
  let promiseUnit: Unit | null = null;
  let promiseCue: string | null = null;
  for (const u of units) {
    const cue = promiseCueOf(u.text);
    if (cue) {
      promiseUnit = u;
      promiseCue = cue;
      break;
    }
  }

  // ── Longest beat ──
  const longest = facts.reduce<RetentionSceneFact | null>(
    (best, f) => (!best || f.durationS > best.durationS ? f : best),
    null,
  );

  // ── Longest quiet stretch (no new VO / on-screen words) ──
  let quiet: RetentionFacts["longestQuietStretch"] = null;
  const anyWords = facts.some((f) => f.voWords > 0 || f.textWords > 0);
  if (facts.length && anyWords) {
    let run: RetentionSceneFact[] = [];
    const flush = () => {
      if (!run.length) return;
      const startS = run[0]!.startS;
      const endS = run[run.length - 1]!.endS;
      const seconds = r2(endS - startS);
      if (!quiet || seconds > quiet.seconds) {
        quiet = { seconds, startS, endS, sceneIds: run.map((f) => f.id), basis: "words" };
      }
      run = [];
    };
    for (const f of facts) {
      if (f.newInfo) flush();
      else run.push(f);
    }
    flush();
    if (!quiet) quiet = { seconds: 0, startS: 0, endS: 0, sceneIds: [], basis: "words" };
  } else if (facts.length) {
    // Visual-only piece: every scene boundary is the only marker there is.
    quiet = longest
      ? { seconds: longest.durationS, startS: longest.startS, endS: longest.endS, sceneIds: [longest.id], basis: "visual-only" }
      : null;
    notes.push("no VO or on-screen text in the scenario; quiet-stretch falls back to scene boundaries (visual-only)");
  }

  // ── CTA ──
  const ctaPointer = isObj(scenario.cta) ? str(scenario.cta.scene_id) : "";
  const ctaFacts = facts.filter((f) => f.role === "cta" || (ctaPointer && f.id === ctaPointer));
  let ctaStart: number | null = ctaFacts.length ? Math.min(...ctaFacts.map((f) => f.startS)) : null;
  if (ctaStart === null && legacyCta) {
    const at = num(legacyCta.startSec);
    ctaStart = at !== null ? r2(at) : null;
  }
  const askCues: RetentionFacts["cta"]["askCues"] = [];
  scenes.forEach((s, i) => {
    const f = facts[i]!;
    const hay = `${s.vo} ${s.text}`;
    for (const [label, re] of ASK_CUES) {
      if (re.test(hay)) askCues.push({ sceneId: s.id, atS: f.startS, atPct: pct(f.startS, runtimeS), cue: label });
    }
  });
  if (legacyCta) {
    const hay = Object.values(legacyCta).filter((v) => typeof v === "string").join(" ");
    for (const [label, re] of ASK_CUES) {
      if (re.test(hay)) {
        const at = num(legacyCta.startSec) ?? 0;
        askCues.push({ sceneId: "cta", atS: at, atPct: pct(at, runtimeS), cue: label });
      }
    }
  }

  // ── Loop-back ──
  const first = scenes[0];
  const last = scenes[scenes.length - 1];
  let shared: string[] = [];
  let visualReturn = false;
  if (first && last && scenes.length > 1) {
    const open = new Set([...contentWords(first.vo), ...contentWords(first.text)]);
    shared = [...new Set([...contentWords(last.vo), ...contentWords(last.text)])].filter((w) => open.has(w));
    visualReturn = VISUAL_RETURN_RE.test(last.direction);
  }

  return {
    schemaVersion: "1.0",
    factsOnly: true,
    runtime: {
      runtimeS,
      sceneSumS,
      declaredS: declaredS !== null ? r2(declaredS) : null,
      sceneCount: facts.length,
      voWords: voWordsTotal,
      wpsOverall: runtimeS && voWordsTotal > 0 ? r2(voWordsTotal / runtimeS) : null,
      wpsMax: wpsMaxFact ? { sceneId: wpsMaxFact.id, wps: wpsMaxFact.wps ?? 0 } : null,
      wordCoveragePct: facts.length
        ? pct(
            facts.filter((f) => f.voWords > 0 || f.textWords > 0).reduce((a, f) => a + f.durationS, 0),
            sceneSumS > 0 ? sceneSumS : null,
          )
        : null,
    },
    hook: {
      sceneIds: hookFacts.map((f) => f.id),
      endS: hookEnd,
      endPct: hookEnd !== null ? pct(hookEnd, runtimeS) : null,
      voWords: hookVo,
      wps: hookVo > 0 && hookDur > 0 ? r2(hookVo / hookDur) : null,
      firstStatementS: firstStatement ? firstStatement.atS : null,
      promiseCueS: promiseUnit ? promiseUnit.atS : null,
      promiseCue,
      timing: "uniform-word-timing-within-scene",
    },
    longestBeat: longest
      ? { sceneId: longest.id, seconds: longest.durationS, startS: longest.startS, endS: longest.endS }
      : null,
    longestQuietStretch: quiet,
    cta: {
      declared: ctaFacts.length > 0 || legacyCta !== null,
      sceneIds: ctaFacts.map((f) => f.id),
      startS: ctaStart,
      startPct: ctaStart !== null ? pct(ctaStart, runtimeS) : null,
      askCues,
    },
    loopBack: {
      echoesOpening: shared.length >= 2 || visualReturn,
      sharedWords: shared,
      visualReturnCue: visualReturn,
      lastSceneId: last && scenes.length > 1 ? last.id : null,
      rule: "last scene shares >= 2 content words with the first scene, or its direction says it returns to the opening",
    },
    scenes: facts,
    notes,
  };
}

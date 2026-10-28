// Post comment analysis (#582) — zero-network tests on synthetic English
// fixtures (tests/fixtures/post-comments/).
//
// Covers payload validation (aliases, strict keys, counts, pasted text), the
// deterministic classification rules and moment extraction, timestamp-to-beat
// mapping against the kettle fixture scenario joined to a #558 retention
// curve, proposals with evidence and the minimum-n rule, the store flow
// (dry-run writes nothing; --yes writes the post-comments Document and the
// screenshot provenance; a repeat replays; a later reading merges), the
// yt-dlp path through an injected runner (ownership check included), the
// optional LLM labels through an injected stub, the `analytics report`
// comment-signal section, and a CLI smoke run.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import {
  classifyComment,
  extractMoments,
  formatMoment,
} from "../../cli/lib/analytics/comment-rules";
import {
  hashAuthor,
  importComments,
  mergeComments,
  normalizeComments,
  parseCommentTime,
  parsePastedComments,
  readCommentsData,
  validatePayload,
} from "../../cli/lib/analytics/comment-import";
import {
  beatForMoment,
  buildCommentReport,
  DEFAULT_COMMENT_REPORT_OPTIONS,
  demandTopics,
  analyzeComments,
  retentionAt,
  scenarioBeats,
} from "../../cli/lib/analytics/comment-report";
import { convertYtdlpInfo, youtubeVideoId, type CommentYtdlpRunner } from "../../cli/lib/analytics/comment-ytdlp";
import { importAnalytics } from "../../cli/lib/analytics/import";
import { loadOutcomeReport, DEFAULT_REPORT_OPTIONS } from "../../cli/lib/analytics/report";
import { DomainError } from "../../cli/lib/errors/domain";
import {
  POST_COMMENTS_BODY_KIND,
  type PostCommentsBody,
} from "../../cli/lib/schemas/post-comments";
import { closeDomainDb, domainDbPath, openDomainDb } from "../../cli/lib/store/db";
import { createDocument, reviseDocument } from "../../cli/lib/store/documents";
import { createProject, createWorkspace } from "../../cli/lib/store/scopes";
import { createUnitWithRevision } from "../../cli/lib/store/units";
import { findUnitCommentsDocument, type OutcomeObservationDto } from "../../cli/lib/store/outcomes";
import { verifyDomainStore } from "../../cli/lib/store/verify";

const FIXTURES = path.resolve(import.meta.dir, "../fixtures/post-comments");
const PROJECT_A = path.resolve(import.meta.dir, "../fixtures/decision-ledger/project-a");
const CLI = path.resolve(import.meta.dir, "../../cli/index.ts");
const TIKTOK = JSON.parse(fs.readFileSync(path.join(FIXTURES, "tiktok-comments.json"), "utf8")) as Record<string, any>;
const YTDLP_INFO = JSON.parse(fs.readFileSync(path.join(FIXTURES, "youtube-ytdlp-info.json"), "utf8")) as Record<string, any>;
const SCENARIO = JSON.parse(fs.readFileSync(path.join(PROJECT_A, "scenario.json"), "utf8")) as unknown;
// A valid 1x1 transparent PNG (synthetic, 67 bytes).
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const RETENTION = [
  { t: 0, pct: 100 },
  { t: 3, pct: 92 },
  { t: 6, pct: 60 },
  { t: 10, pct: 52 },
  { t: 17, pct: 47 },
  { t: 23.6, pct: 40 },
];

describe("comment payload validation", () => {
  test("folds aliases, parses abbreviated likes, and keeps agent labels and moments", () => {
    const payload = validatePayload(
      [{ handle: "@a", content: "Nice one", like_count: "1.2K", classes: "praise", moments: "0:12", parent: "x1" }],
      "tiktok",
    );
    expect(payload.comments[0]).toEqual({
      author: "@a",
      text: "Nice one",
      likes: 1200,
      labels: ["praise"],
      timestamps: [12],
      replyTo: "x1",
    });
  });

  test("rejects unknown keys, empty lists, bad labels, and a platform conflict", () => {
    const detail = (run: () => unknown) => {
      try {
        run();
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        return `${(error as DomainError).code} ${String((error as DomainError).details?.detail)}`;
      }
      throw new Error("expected a failure");
    };
    expect(detail(() => validatePayload({ comments: [{ text: "hi", vibe: "good" }] }, "tiktok"))).toContain("vibe");
    expect(detail(() => validatePayload({ comments: [] }, "tiktok"))).toContain("E_VALIDATION_FAILED comments");
    expect(detail(() => validatePayload([{ text: "hi", labels: ["hype"] }], "tiktok"))).toContain("comments.0.labels.0");
    expect(detail(() => validatePayload([{ text: "hi", likes: "12.5" }], "tiktok"))).toContain("comments.0.likes");
    expect(detail(() => validatePayload({ platform: "youtube", comments: [{ text: "hi" }] }, "tiktok"))).toContain("E_INPUT_INVALID --platform tiktok conflicts");
    expect(detail(() => validatePayload([{ text: "hi", handle: "@a", author: "@b" }], "tiktok"))).toContain("duplicates");
  });

  test("--data reads inline JSON, a JSON file, or pasted text; broken JSON is an error", () => {
    expect(readCommentsData('[{"text":"hi"}]')).toEqual({ data: [{ text: "hi" }], format: "json" });
    expect(readCommentsData(path.join(FIXTURES, "tiktok-comments.json")).format).toBe("json");
    const pasted = readCommentsData(path.join(FIXTURES, "pasted.txt"));
    expect(pasted.format).toBe("paste");
    expect(pasted.data).toEqual([
      { author: "brewbuddy", text: "Part 2 please!" },
      { text: "the ending felt rushed" },
      { author: "goodbrew", text: "Love this, so helpful" },
    ]);
    expect(() => readCommentsData("[{nope")).toThrow(DomainError);
    expect(() => parsePastedComments("\n  \n")).toThrow(DomainError);
  });

  test("relative ages resolve against the capture time and are flagged approximate", () => {
    const captured = Date.UTC(2026, 9, 27, 12);
    expect(parseCommentTime("2d", captured)).toEqual({ at: captured - 2 * 86_400_000, approximate: true });
    expect(parseCommentTime("5h ago", captured)).toEqual({ at: captured - 5 * 3_600_000, approximate: true });
    expect(parseCommentTime("3 weeks ago", captured).at).toBe(captured - 21 * 86_400_000);
    expect(parseCommentTime("2026-10-20", captured)).toEqual({ at: Date.UTC(2026, 9, 20), approximate: false });
    expect(() => parseCommentTime("a while back", captured)).toThrow();
  });

  test("handles are hashed per workspace and never stored", () => {
    const one = hashAuthor("ws_a", "tiktok", "@BrewBuddy");
    expect(one).toBe(hashAuthor("ws_a", "tiktok", "brewbuddy"));
    expect(one).not.toBe(hashAuthor("ws_b", "tiktok", "brewbuddy"));
    const { comments } = normalizeComments({
      workspaceId: "ws_a",
      platform: "tiktok",
      entries: validatePayload(TIKTOK, "tiktok").comments.map((input) => ({ input, source: "screenshot" as const })),
      capturedAt: Date.UTC(2026, 9, 27, 12),
      importKey: "k1",
    });
    expect(JSON.stringify(comments)).not.toContain("brewbuddy");
    // Identical anonymous texts in one payload stay distinct comments.
    const twins = normalizeComments({
      workspaceId: "ws_a",
      platform: "tiktok",
      entries: [{ input: { text: "part 2" }, source: "paste" }, { input: { text: "part 2" }, source: "paste" }],
      capturedAt: 0,
      importKey: "k2",
    });
    expect(new Set(twins.comments.map((comment) => comment.id)).size).toBe(2);
  });
});

describe("classification rules", () => {
  const cases: Array<[string, string[]]> = [
    ["Part 2 please!", ["request-more"]],
    ["Can you do one on the milk frother?", ["question", "request-more"]],
    ["Wait what happened at 0:05? I'm lost", ["question", "confusion"]],
    ["The spout bit at 0:06 was confusing", ["confusion"]],
    ["That's not true, the handle gets hot after two boils", ["objection"]],
    ["Clickbait, you never showed the third way", ["objection"]],
    ["You talk way too fast, slow down", ["delivery-criticism"]],
    ["The music is too loud at 0:18", ["delivery-criticism"]],
    ["Love this, so helpful", ["praise"]],
    ["\u{1F525}\u{1F525}\u{1F525}", ["praise"]],
    ["Check out my page for free followers www.example-promo.test/win", ["spam"]],
    ["Love this! www.example-promo.test/deal", ["spam"]],
    ["not great tbh", []],
    ["nothing wrong with it", []],
    ["\u{1F634}", ["delivery-criticism"]],
  ];
  for (const [text, labels] of cases) {
    test(`"${text}" -> ${labels.join(", ") || "(none)"}`, () => {
      const moments = extractMoments(text);
      expect(classifyComment(text, { hasMoment: moments.length > 0 }).labels).toEqual(labels as never);
    });
  }

  test("facets and rule ids explain each match; spam drops every other class", () => {
    expect(classifyComment("Title is misleading, only two ways shown").facets).toEqual(["accuracy", "packaging"]);
    expect(classifyComment("Talking so fast at the start").rules).toContain("delivery:pace-fast");
    expect(classifyComment("Love it, sub4sub?")).toEqual({ labels: ["spam"], rules: ["spam:self-promo"], facets: [] });
  });

  test("a question about a named moment is confusion, a product question is not", () => {
    expect(classifyComment("what is that at 0:12?", { hasMoment: true }).labels).toEqual(["question", "confusion"]);
    expect(classifyComment("what's the song at 0:12?", { hasMoment: true }).labels).toEqual(["question"]);
    expect(classifyComment("what is that at 0:12?", { hasMoment: false }).labels).toEqual(["question"]);
  });

  test("moments: clock times, seconds, position cues; wall-clock times are ignored", () => {
    expect(extractMoments("at 0:12 and again 1:02:03").map((moment) => moment.t)).toEqual([12, 3723]);
    expect(extractMoments("it breaks at 12s").map((moment) => moment.t)).toEqual([12]);
    expect(extractMoments("around 7 seconds in").map((moment) => moment.t)).toEqual([7]);
    expect(extractMoments("the ending felt rushed")).toEqual([{ t: null, cue: "end", raw: "the ending", source: "text" }]);
    expect(extractMoments("loved the intro")[0]!.cue).toBe("start");
    expect(extractMoments("see you at 10:30 am")).toEqual([]);
    expect(formatMoment(72)).toBe("1:12");
    expect(formatMoment(3723)).toBe("1:02:03");
  });
});

describe("timestamp to beat mapping", () => {
  const model = scenarioBeats(SCENARIO);

  test("scenario beats carry start / end seconds from the scene durations", () => {
    expect(model.beats.map((beat) => [beat.sceneId, beat.role, beat.startS, beat.endS])).toEqual([
      ["scene-01", "hook", 0, 3.2],
      ["scene-02", "body", 3.2, 9.6],
      ["scene-03", "body", 9.6, 16.6],
      ["scene-04", "cta", 16.6, 23.6],
    ]);
    expect(model.runtimeS).toBe(23.6);
    expect(model.beats[1]!.vo).toBe("The spout pours a thin, steady stream.");
  });

  test("moments land on the beat that contains them; cues use the first / last beat", () => {
    const at = (t: number) => beatForMoment({ t, cue: null, raw: "", source: "text" }, model.beats, model.runtimeS);
    expect(at(0).beat?.sceneId).toBe("scene-01");
    expect(at(5).beat?.sceneId).toBe("scene-02");
    expect(at(9.6).beat?.sceneId).toBe("scene-03");
    expect(at(23.6).beat?.sceneId).toBe("scene-04");
    expect(at(24.2).beat?.sceneId).toBe("scene-04");
    expect(at(45)).toEqual({ beat: null, reason: "after the end of the scenario (0:23)" });
    expect(beatForMoment({ t: null, cue: "start", raw: "", source: "text" }, model.beats, null).beat?.sceneId).toBe("scene-01");
    expect(beatForMoment({ t: null, cue: "end", raw: "", source: "text" }, model.beats, null).beat?.sceneId).toBe("scene-04");
    const untimed = scenarioBeats({ scenes: [{ id: "a" }, { id: "b" }] });
    expect(beatForMoment({ t: 3, cue: null, raw: "", source: "text" }, untimed.beats, untimed.runtimeS).reason).toBe(
      "the scenario has no scene durations",
    );
  });

  test("retention is interpolated inside the curve and never extrapolated", () => {
    expect(retentionAt(RETENTION, 3)).toBe(92);
    expect(retentionAt(RETENTION, 4.5)).toBe(76);
    expect(retentionAt(RETENTION, 30)).toBeNull();
    expect(retentionAt([], 1)).toBeNull();
  });
});

function fixtureBody(): PostCommentsBody {
  const { comments } = normalizeComments({
    workspaceId: "ws_test",
    platform: "tiktok",
    entries: validatePayload(TIKTOK, "tiktok").comments.map((input) => ({ input, source: "screenshot" as const })),
    capturedAt: Date.UTC(2026, 9, 27, 12),
    importKey: "fixture",
  });
  return {
    kind: POST_COMMENTS_BODY_KIND,
    version: 1,
    unitId: "unit_kettle",
    unitSlug: "coffee-hero",
    projectId: "prj_kettle",
    rulesVersion: 1,
    comments: comments.map(({ rules: _rules, ...comment }) => comment),
    imports: [],
    updatedAt: "2026-10-27T12:00:00.000Z",
  };
}

function observation(retention: Array<{ t: number; pct: number }> | null): OutcomeObservationDto {
  return {
    publicationId: "pub_tiktok",
    platform: "tiktok",
    publicationState: "submitted",
    publishedAt: null,
    url: null,
    snapshotCount: 1,
    snapshot: {
      id: "met_1",
      source: "screenshot",
      asOf: Date.UTC(2026, 9, 27, 12),
      views: 12_300,
      likes: 1204,
      comments: 88,
      shares: 312,
      watchTimeMs: null,
      avgViewDurationSec: 9,
      retentionCurve: null,
      createdAt: Date.UTC(2026, 9, 27, 12),
    },
    importFacts: {
      platform: "tiktok",
      capturedAt: Date.UTC(2026, 9, 27, 12),
      postedAt: Date.UTC(2026, 9, 20),
      reach: null,
      saves: 940,
      follows: 41,
      avgWatchTimeSec: 9,
      totalWatchTimeSec: null,
      avgWatchPct: null,
      completionPct: 31.5,
      videoDurationSec: 23.6,
      retention,
      approximateFields: [],
      extractedBy: "agent",
      screenshotCount: 0,
    },
  };
}

const UNIT = { id: "unit_kettle", slug: "coffee-hero", format: "video", projectId: "prj_kettle", projectSlug: "coffee-review-001" };

describe("comment report", () => {
  const report = buildCommentReport({
    unit: UNIT,
    body: fixtureBody(),
    scenario: SCENARIO,
    scenarioSource: "project:scenario.json",
    observations: [observation(RETENTION)],
    options: DEFAULT_COMMENT_REPORT_OPTIONS,
    generatedAt: "2026-10-28T00:00:00.000Z",
  });

  test("coverage and class counts exclude spam and the creator's own replies", () => {
    expect(report.kind).toBe("comment-report");
    expect(report.coverage).toMatchObject({ stored: 20, analyzed: 18, spam: 1, creator: 1, commenters: 18, withMoments: 5 });
    const count = (label: string) => report.classes.find((row) => row.class === label)!.comments;
    expect(count("request-more")).toBe(4);
    expect(count("confusion")).toBe(3);
    expect(count("objection")).toBe(3);
    expect(count("delivery-criticism")).toBe(3);
    expect(count("praise")).toBe(2);
    expect(count("spam")).toBe(1);
    expect(report.top.praise[0]).toMatchObject({ text: "Love this, so helpful", likes: 1200 });
    expect(report.top.confusion[0]!.moments).toEqual(["0:05"]);
  });

  test("the beat map places moments on beats and marks the steepest retention drop", () => {
    expect(report.beats.status).toBe("mapped");
    expect(report.beats.retention).toEqual({ platform: "tiktok", points: 6, source: "analytics-import" });
    const row = (id: string) => report.beats.rows.find((entry) => entry.sceneId === id)!;
    expect(row("scene-02")).toMatchObject({ mentions: 3, commenters: 3, confusion: 3, window: "0:03-0:09" });
    expect(row("scene-02").retention).toMatchObject({ startPct: 89.87, endPct: 52.8, dropPct: 37.07, steepest: true });
    expect(row("scene-01")).toMatchObject({ mentions: 1, classes: { "delivery-criticism": 1 } });
    expect(row("scene-04")).toMatchObject({ mentions: 1, classes: { "delivery-criticism": 1 } });
    expect(row("scene-03").mentions).toBe(0);
    expect(report.beats.unmapped).toEqual([]);
  });

  test("proposals carry evidence and respect the minimum-n rule", () => {
    const titles = report.proposals.map((proposal) => `${proposal.id}:${proposal.type}:${proposal.title}`);
    expect(titles).toEqual([
      "p1:fix-beat:Fix scene-02 (body, 0:03-0:09)",
      "p2:next-video:Part 2: continue this video",
      "p3:next-video:Next video on \"milk frother\"",
      "p4:packaging:Align the title, cover and hook with the payoff",
      "p5:delivery:Slow the rushed delivery",
      "p6:next-video:Answer \"hard water\" in a follow-up",
    ]);
    const fix = report.proposals[0]!;
    expect(fix.evidence).toMatchObject({
      count: 3,
      comments: 3,
      likes: 62,
      beat: { sceneId: "scene-02", role: "body", startS: 3.2, endS: 9.6 },
      retention: { platform: "tiktok", dropPct: 37.07, steepest: true },
    });
    expect(fix.rationale).toContain("falls 37.07 pts across this beat (the steepest drop)");
    expect(fix.evidence.commentIds).toHaveLength(3);
    const part2 = report.proposals.find((proposal) => proposal.title.startsWith("Part 2"))!;
    expect(part2.evidence).toMatchObject({ count: 2, likes: 128 });
    expect(part2.evidence.example?.text).toBe("Part 2 please!");
    // Every evidence id is a stored comment id.
    const ids = new Set(fixtureBody().comments.map((comment) => comment.id));
    for (const proposal of report.proposals) for (const id of proposal.evidence.commentIds) expect(ids.has(id)).toBe(true);
    // One-commenter patterns are signals, never proposals.
    expect(report.signals.map((signal) => signal.title)).toEqual(
      expect.arrayContaining(["Back the contested claim", "Fix the audio mix", "Rework the hook (scene-01, 0:00-0:03)"]),
    );
    expect(report.signals.every((signal) => signal.count < 2)).toBe(true);
    expect(report.notes.at(-1)).toBe("Read-only: nothing was posted, replied to, or pinned.");
  });

  test("a higher --min-n turns smaller proposals into signals", () => {
    const strict = buildCommentReport({
      unit: UNIT,
      body: fixtureBody(),
      scenario: SCENARIO,
      scenarioSource: null,
      observations: [],
      options: { minN: 3, top: 1 },
    });
    expect(strict.proposals.map((proposal) => proposal.type)).toEqual(["fix-beat"]);
    expect(strict.proposals[0]!.evidence.retention).toBeNull();
    expect(strict.top.praise).toHaveLength(1);
    expect(strict.notes.join("\n")).toContain("No retention curve imported");
  });

  test("without comments or a scenario the report says what to do instead of guessing", () => {
    const empty = buildCommentReport({ unit: UNIT, body: null, scenario: null, scenarioSource: null, observations: [], options: DEFAULT_COMMENT_REPORT_OPTIONS });
    expect(empty.proposals).toEqual([]);
    expect(empty.notes[0]).toContain("ralphy analytics comments import");
    const noScenario = buildCommentReport({ unit: UNIT, body: fixtureBody(), scenario: null, scenarioSource: null, observations: [], options: DEFAULT_COMMENT_REPORT_OPTIONS });
    expect(noScenario.beats.status).toBe("no-scenario");
    expect(noScenario.beats.unmapped[0]!.reason).toBe("no scenario for this Unit");
    expect(noScenario.proposals.some((proposal) => proposal.type === "fix-beat")).toBe(false);
  });

  test("demand topics prefer a shared bigram and exclude confused questions", () => {
    const { analyzed } = analyzeComments(fixtureBody().comments);
    const demand = analyzed.filter((entry) => entry.labels.includes("request-more") || (entry.labels.includes("question") && !entry.labels.includes("confusion")));
    expect(demandTopics(demand).groups.map((group) => group.topic)).toEqual(["milk frother", "hard water"]);
  });
});

describe("merge", () => {
  test("a later reading updates counts, keeps ids, and ranks agent labels over rules", () => {
    const body = fixtureBody();
    const first = body.comments[0]!;
    const later = { ...first, likes: 150, capturedAt: first.capturedAt + 86_400_000, lastImport: "k2" };
    const relabeled = { ...body.comments[1]!, labels: ["praise" as const], labelSource: "agent" as const, lastImport: "k2" };
    const merged = mergeComments(body.comments, [later, relabeled, { ...body.comments[2]!, lastImport: "k2" }]);
    expect(merged).toMatchObject({ added: 0, updated: 2, unchanged: 1 });
    expect(merged.comments[0]!.likes).toBe(150);
    expect(merged.comments[1]!.labelSource).toBe("agent");
    const downgrade = mergeComments(merged.comments, [{ ...body.comments[1]!, labelSource: "rules", labels: [] }]);
    expect(downgrade.comments[1]!.labelSource).toBe("agent");
  });
});

describe("yt-dlp comments for our own video", () => {
  test("only single YouTube video URLs are accepted", () => {
    expect(youtubeVideoId("https://www.youtube.com/watch?v=Ab3dE6gH9jK&t=3")).toBe("Ab3dE6gH9jK");
    expect(youtubeVideoId("https://youtu.be/Ab3dE6gH9jK")).toBe("Ab3dE6gH9jK");
    expect(youtubeVideoId("https://youtube.com/shorts/Ab3dE6gH9jK")).toBe("Ab3dE6gH9jK");
    expect(youtubeVideoId("https://www.youtube.com/playlist?list=PL123")).toBeNull();
    expect(youtubeVideoId("https://www.youtube.com/@somechannel")).toBeNull();
    expect(youtubeVideoId("https://vimeo.com/123")).toBeNull();
  });

  test("the info JSON converts into ordinary comment entries", () => {
    const converted = convertYtdlpInfo(YTDLP_INFO, "Ab3dE6gH9jK");
    expect(converted).toMatchObject({ videoId: "Ab3dE6gH9jK", durationSec: 24, commentCount: 4 });
    expect(converted.comments[0]).toEqual({
      text: "Do a follow-up comparing it to a gooseneck kettle",
      id: "Ugw1",
      author: "UC111",
      likes: 33,
      postedAt: 1_761_400_000_000,
    });
    expect(converted.comments[2]).toMatchObject({ replyTo: "Ugw2", byCreator: true });
    expect(converted.comments[3]).toMatchObject({ pinned: true });
    expect(() => convertYtdlpInfo({ ...YTDLP_INFO, id: "Zz9zZ9zZ9zZ" }, "Ab3dE6gH9jK")).toThrow(DomainError);
  });
});

describe("comments in the domain store", () => {
  let tmp: TmpRoot;

  beforeEach(() => {
    tmp = makeTmpRoot("ralphy-comments-582");
  });

  afterEach(() => {
    closeDomainDb();
    tmp.cleanup();
  });

  function seed() {
    const workspace = createWorkspace({ slug: "kettle-brand", name: "Kettle brand" });
    const project = createProject({ workspaceId: workspace.id, slug: "coffee-review-001", name: "Coffee review" });
    const document = createDocument({ projectId: project.id, kind: "note", slug: "script", title: "Script" });
    const body = reviseDocument({ documentId: document.id, expectedHeadId: null, format: "markdown", body: "# Kettle review" });
    const revision = createUnitWithRevision({
      projectId: project.id,
      slug: "coffee-hero",
      format: "video",
      items: [{ documentRevisionId: body.id, role: "body", position: 0 }],
    });
    return { workspaceId: workspace.id, projectId: project.id, unitId: revision.unitId };
  }

  test("dry-run previews labels, moments, and the merge plan without writing", async () => {
    const seeded = seed();
    const preview = await importComments({
      context: { workspaceId: seeded.workspaceId },
      ref: "coffee-hero",
      platform: "tiktok",
      data: TIKTOK,
      write: false,
    });
    expect(preview.written).toBe(false);
    expect(preview).toMatchObject({
      kind: "comment-import",
      received: 20,
      creatorComments: 1,
      sources: ["manual"],
      capturedAt: "2026-10-27T12:00:00.000Z",
      merge: { storedBefore: 0, added: 20, updated: 0, unchanged: 0, storedAfter: 20 },
      plan: { document: "create", slug: "post-comments-coffee-hero" },
    });
    expect(preview.classes).toMatchObject({ "request-more": 4, confusion: 3, spam: 1 });
    expect(preview.moments.mentions).toEqual(["0:05", "0:07", "0:06", "start", "0:18"]);
    const context = { workspaceId: seeded.workspaceId, projectId: seeded.projectId };
    expect(findUnitCommentsDocument({ context, unitId: seeded.unitId })).toBeNull();
  });

  test("--yes stores the Document and screenshot provenance; a repeat replays; a later reading merges", async () => {
    const seeded = seed();
    const shot = path.join(tmp.dir, "tiktok-comments.png");
    fs.writeFileSync(shot, TINY_PNG);
    const request = {
      context: { workspaceId: seeded.workspaceId },
      ref: seeded.unitId,
      platform: "tiktok" as const,
      data: TIKTOK,
      screenshots: [shot],
      write: true,
    };
    const first = await importComments(request);
    if (!("writes" in first)) throw new Error("expected writes");
    expect(first.replayed).toBe(false);
    expect(first.sources).toEqual(["screenshot"]);
    expect(first.writes.screenshotArtifactRevisions).toHaveLength(1);
    expect(fs.existsSync(shot)).toBe(true);
    const context = { workspaceId: seeded.workspaceId, projectId: seeded.projectId };
    const stored = findUnitCommentsDocument({ context, unitId: seeded.unitId })!;
    const body = stored.body as unknown as PostCommentsBody;
    expect(body.kind).toBe(POST_COMMENTS_BODY_KIND);
    expect(body.comments).toHaveLength(20);
    expect(body.imports).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain("@brewbuddy");
    const reply = body.comments.find((comment) => comment.byCreator)!;
    expect(reply.replyTo).toBe(body.comments[0]!.id);

    const again = await importComments(request);
    if (!("writes" in again)) throw new Error("expected writes");
    expect(again.replayed).toBe(true);
    expect(again.writes.revisionId).toBe(first.writes.revisionId);

    const later = await importComments({
      ...request,
      screenshots: [shot],
      data: {
        capturedAt: "2026-10-28T12:00:00Z",
        comments: [
          { author: "@brewbuddy", text: "Part 2 please!", likes: 180 },
          { author: "@newviewer", text: "What happened at 0:08? lost me", likes: 2 },
        ],
      },
    });
    if (!("writes" in later)) throw new Error("expected writes");
    expect(later.merge).toEqual({ storedBefore: 20, added: 1, updated: 1, unchanged: 0, storedAfter: 21 });
    // The same screenshot bytes reuse their Artifact revision.
    expect(later.writes.screenshotArtifactRevisions).toEqual(first.writes.screenshotArtifactRevisions);
    const revisions = openDomainDb()
      .query<{ n: number }, [string]>("SELECT COUNT(*) AS n FROM document_revisions WHERE document_id = ?")
      .get(later.writes.documentId)!;
    expect(revisions.n).toBe(2);
    const report = verifyDomainStore({ hashObjects: true });
    expect(report.integrity).toBe("ok");
    expect(report.missingObjects).toEqual([]);
  });

  test("--from-ytdlp runs only for our own YouTube post and goes through the same flow", async () => {
    const seeded = seed();
    const calls: string[][] = [];
    const runner: CommentYtdlpRunner = async (args) => {
      calls.push(args);
      return { code: 0, stdout: JSON.stringify(YTDLP_INFO), stderr: "", timedOut: false };
    };
    const base = { context: { workspaceId: seeded.workspaceId }, ref: "coffee-hero", write: false };
    await expect(
      importComments({ ...base, platform: "tiktok", ytdlp: { url: "https://youtu.be/Ab3dE6gH9jK", runner } }),
    ).rejects.toMatchObject({ code: "E_INPUT_INVALID" });
    await expect(
      importComments({ ...base, platform: "youtube", ytdlp: { url: "https://www.youtube.com/playlist?list=PL1", runner } }),
    ).rejects.toMatchObject({ code: "E_INPUT_INVALID" });
    expect(calls).toHaveLength(0);

    // No YouTube Publication recorded yet: allowed, flagged unverified.
    const unverified = await importComments({ ...base, platform: "youtube", ytdlp: { url: "https://youtu.be/Ab3dE6gH9jK", runner } });
    expect(unverified.ytdlp).toMatchObject({ videoId: "Ab3dE6gH9jK", ownership: "unverified", fetched: 4 });
    expect(unverified.sources).toEqual(["ytdlp"]);
    expect(unverified.creatorComments).toBe(1);
    expect(calls[0]).toContain("--write-comments");
    expect(calls[0]).not.toContain("--cookies-from-browser");

    // Record our YouTube post (#558 import with its URL); another video id is refused.
    await importAnalytics({
      context: { workspaceId: seeded.workspaceId },
      ref: "coffee-hero",
      platform: "youtube",
      data: { views: 900, url: "https://www.youtube.com/shorts/Ab3dE6gH9jK", capturedAt: "2026-10-27", postedAt: "2026-10-20" },
      write: true,
    });
    const verified = await importComments({ ...base, platform: "youtube", ytdlp: { url: "https://youtu.be/Ab3dE6gH9jK", runner } });
    expect(verified.ytdlp?.ownership).toBe("verified");
    await expect(
      importComments({ ...base, platform: "youtube", ytdlp: { url: "https://youtu.be/Zz9zZ9zZ9zZ", runner } }),
    ).rejects.toMatchObject({ code: "E_INPUT_INVALID" });
  });

  test("--llm labels only what the rules left unlabeled, and only on --yes", async () => {
    const seeded = seed();
    const seen: unknown[] = [];
    const llmImpl = async (opts: any) => {
      seen.push(opts);
      const batch = JSON.parse(opts.messages[1].content) as Array<{ id: string }>;
      return {
        text: JSON.stringify({ labels: Object.fromEntries(batch.map((entry) => [entry.id, ["question", "made-up"]])) }),
        raw: {},
        provider: "stub",
        model: opts.model,
        latencyMs: 1,
      };
    };
    const data = { comments: [{ text: "Part 2 please!" }, { text: "my grandmother had this exact kettle" }] };
    const base = { context: { workspaceId: seeded.workspaceId }, ref: "coffee-hero", platform: "tiktok" as const, data, llm: true, llmImpl };
    const preview = await importComments({ ...base, write: false });
    expect(seen).toHaveLength(0);
    expect(preview.llm).toMatchObject({ requested: true, candidates: 1, classified: null });
    const written = await importComments({ ...base, write: true });
    expect(seen).toHaveLength(1);
    expect((seen[0] as { model: string }).model).toBe("google/gemini-2.5-flash");
    expect(written.llm).toMatchObject({ classified: 1, calls: 1 });
    expect(written.labelSources).toEqual({ agent: 0, rules: 1, llm: 1 });
    const context = { workspaceId: seeded.workspaceId, projectId: seeded.projectId };
    const body = findUnitCommentsDocument({ context, unitId: seeded.unitId })!.body as unknown as PostCommentsBody;
    expect(body.comments.find((comment) => comment.labelSource === "llm")!.labels).toEqual(["question"]);
  });

  test("analytics report joins comment signals to outcomes with a minimum n", async () => {
    const seeded = seed();
    await importAnalytics({
      context: { workspaceId: seeded.workspaceId },
      ref: "coffee-hero",
      platform: "tiktok",
      data: { views: "12.3K", retention: RETENTION, capturedAt: "2026-10-27T12:00:00Z", postedAt: "2026-10-20" },
      write: true,
    });
    await importComments({ context: { workspaceId: seeded.workspaceId }, ref: "coffee-hero", platform: "tiktok", data: TIKTOK, write: true });
    const scope = { workspaceId: seeded.workspaceId, projectId: null };
    const report = loadOutcomeReport({ workspaceId: seeded.workspaceId }, DEFAULT_REPORT_OPTIONS, scope);
    expect(report.comments.units).toBe(1);
    expect(report.comments.rows[0]).toMatchObject({
      unit: "coffee-hero",
      platform: "tiktok",
      comments: 18,
      status: "ok",
      requestMore: 4,
      confusion: 3,
      spam: 1,
      target: 12_300,
      hit: null,
    });
    const strict = loadOutcomeReport({ workspaceId: seeded.workspaceId }, { ...DEFAULT_REPORT_OPTIONS, commentMinN: 50 }, scope);
    expect(strict.comments.rows[0]).toMatchObject({ status: "insufficient data", comments: 18, requestMore: null, confusion: null });
  });

  test("CLI smoke: comments import --dry-run, --yes, comments report, and analytics report", () => {
    const seeded = seed();
    const dataRoot = path.dirname(domainDbPath());
    closeDomainDb();
    const run = (args: string[]) => {
      const result = spawnSync("bun", ["run", CLI, "--root", dataRoot, "--json", ...args], { cwd: tmp.dir, encoding: "utf8" });
      if (result.status !== 0) throw new Error(`ralphy ${args.join(" ")} failed: ${result.stderr}`);
      return JSON.parse(result.stdout) as Record<string, any>;
    };
    const base = ["analytics", "comments", "import", "coffee-hero", "--workspace", seeded.workspaceId, "--platform", "tiktok", "--data", path.join(FIXTURES, "tiktok-comments.json")];
    expect(run([...base, "--dry-run"]).written).toBe(false);
    const written = run([...base, "--yes"]);
    expect(written.written).toBe(true);
    expect(written.received).toBe(20);
    const report = run(["analytics", "comments", "report", "coffee-hero", "--workspace", seeded.workspaceId, "--from", PROJECT_A]);
    expect(report.kind).toBe("comment-report");
    expect(report.beats.status).toBe("mapped");
    expect(report.beats.scenarioSource).toBe("project:scenario.json (--from)");
    expect(report.proposals[0].title).toBe("Fix scene-02 (body, 0:03-0:09)");
    const outcomes = run(["analytics", "report", "--workspace", seeded.workspaceId]);
    expect(outcomes.comments.rows[0]).toMatchObject({ unit: "coffee-hero", status: "ok", comments: 18 });
  }, 60_000);
});

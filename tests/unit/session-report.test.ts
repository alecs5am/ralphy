// Unit tests for scripts/session-report.ts (#562) — harness speed and token self-eval.
//
// Fixtures under tests/fixtures/session-report/ are synthetic transcripts in both
// supported formats (Claude Code main + subagent, Codex rollout). Their
// timestamps are chosen so phase times can be checked to the second.

import { describe, test, expect, beforeAll } from "bun:test";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { discoverFiles, isRalphyRelated, loadSession, parseRecords } from "../../scripts/lib/session-report/load.js";
import { analyzeSession, DEFAULT_OPTIONS, type ReportOptions, type SessionAnalysis } from "../../scripts/lib/session-report/analyze.js";
import { buildReport, type Report } from "../../scripts/lib/session-report/report.js";
import { classifyOp, phaseForVerb, PHASE_RULES, PHASES } from "../../scripts/lib/session-report/phases.js";
import {
  extractRalphyInvocations,
  extractReads,
  extractWrites,
  isCompoundCommand,
  shellReadRange,
  similarity,
  splitSegments,
} from "../../scripts/lib/session-report/shell.js";
import { displayPath, inputInvalidCategory, usageErrorOf } from "../../scripts/lib/session-report/waste.js";
import { parseArgs } from "../../scripts/session-report.js";
import type { NormSession, Op } from "../../scripts/lib/session-report/types.js";

const REPO = path.resolve(import.meta.dir, "..", "..");
const FIXTURES = path.join(REPO, "tests", "fixtures", "session-report");
const CLAUDE_MAIN = path.join(FIXTURES, "claude", "sess-claude-a.jsonl");
const CLAUDE_SUB = path.join(FIXTURES, "claude", "sess-claude-a", "subagents", "agent-sub1.jsonl");
const CODEX = path.join(FIXTURES, "codex", "rollout-2026-10-21T09-00-00-codex-fixture-1.jsonl");
const OPTS: ReportOptions = { ...DEFAULT_OPTIONS, largeOutputChars: 500 };

let claude: NormSession;
let claudeSub: NormSession;
let codex: NormSession;
let claudeA: SessionAnalysis;
let codexA: SessionAnalysis;
let report: Report;

beforeAll(async () => {
  claude = (await loadSession(CLAUDE_MAIN))!;
  claudeSub = (await loadSession(CLAUDE_SUB))!;
  codex = (await loadSession(CODEX))!;
  claudeA = analyzeSession(claude, OPTS);
  codexA = analyzeSession(codex, OPTS);
  report = buildReport([claude, claudeSub, codex], OPTS, { files: 3, unrecognized: 0 });
});

const op = (partial: Partial<Op>): Op => ({ kind: "shell", tool: "Bash", signature: "", ...partial });

describe("shell helpers", () => {
  test("splitSegments respects quotes and keeps redirections intact", () => {
    expect(splitSegments(`cd /a && echo "x; y" | head -1; ls 2>&1`)).toEqual(["cd /a", `echo "x; y"`, "head -1", "ls 2>&1"]);
  });

  test("extractRalphyInvocations handles every entry form and global value flags", () => {
    expect(extractRalphyInvocations("ralphy generate image --slot a")[0]).toMatchObject({ verb: "generate", sub: "image" });
    expect(extractRalphyInvocations("bun run ralphy -- render demo-001")[0]).toMatchObject({ verb: "render", positional: ["demo-001"] });
    expect(extractRalphyInvocations("mise exec bun@1.4.2 -- bun run cli/index.ts ref pull https://x")[0]).toMatchObject({ verb: "ref", sub: "pull" });
    const g = extractRalphyInvocations("bun run cli/index.ts --root /r/.ralphy --project prj_1 render --json")[0]!;
    expect(g.verb).toBe("render");
    expect(g.positional).toEqual(["prj_1"]);
    expect(extractRalphyInvocations("bun run cli/index.ts 2>&1 | head -50")[0]).toMatchObject({ verb: "" });
  });

  test("ralphy text inside quotes, paths, or heredoc bodies is not an invocation", () => {
    expect(extractRalphyInvocations(`git commit -m "run ralphy render later"`)).toEqual([]);
    expect(extractRalphyInvocations("cd /Users/me/works/ralphy && ls")).toEqual([]);
    expect(extractRalphyInvocations("cat > notes.md <<'EOF'\nralphy render demo\nEOF")).toEqual([]);
  });

  test("extractReads / extractWrites resolve against cd and the session cwd", () => {
    expect(extractReads("cd /repo && sed -n '10,20p' docs/a.md", "/elsewhere")).toEqual(["/repo/docs/a.md"]);
    expect(extractReads("head -n 40 README.md | cat", "/repo")).toEqual(["/repo/README.md"]);
    expect(extractReads("sed -i 's/a/b/' x.ts", "/repo")).toEqual([]);
    expect(extractWrites("echo hi > out/log.txt 2>&1", "/repo")).toEqual(["/repo/out/log.txt"]);
  });

  test("shellReadRange uses the Read tool's offset:limit convention", () => {
    expect(shellReadRange("sed -n '10,20p' a.md")).toBe("10:11");
    expect(shellReadRange("head -n 5 a.md")).toBe("0:5");
    expect(shellReadRange("cat a.md")).toBe("0:all");
  });

  test("compound commands and similarity", () => {
    expect(isCompoundCommand("for i in 1 2; do ralphy generate image --slot $i; done")).toBe(true);
    expect(isCompoundCommand("ralphy render demo 2>&1 | tail -5")).toBe(false);
    expect(similarity("a b c d", "a b c d")).toBe(1);
    expect(similarity("a b c d e", "a b c d")).toBeGreaterThanOrEqual(0.8);
  });
});

describe("phase table", () => {
  test("every rule names a known phase and the table is the single mapping", () => {
    for (const rule of PHASE_RULES) if (rule.phase !== null) expect(PHASES).toContain(rule.phase);
  });

  test("specific verb entries win over the verb default", () => {
    expect(phaseForVerb("generate", "image")).toBe("assets");
    expect(phaseForVerb("generate", "text")).toBe("scenario");
    expect(phaseForVerb("project", "repair-plan")).toBe("repair");
    expect(phaseForVerb("project", "show")).toBeNull();
    expect(phaseForVerb("ref", "check")).toBe("intake");
    expect(phaseForVerb("ref", "pull")).toBe("research");
    expect(phaseForVerb("nonexistent")).toBeUndefined();
  });

  test("project files, repo files and skills classify as expected", () => {
    expect(classifyOp(op({ kind: "edit", tool: "Write", writes: ["/r/.ralphy/workspaces/w/projects/p/scenario.json"] }))?.phase).toBe("scenario");
    expect(classifyOp(op({ kind: "edit", tool: "Edit", writes: ["/r/cli/commands/x.ts"] }))?.phase).toBe("dev");
    expect(classifyOp(op({ kind: "read", tool: "Read", reads: ["/r/.agents/skills/editor/SKILL.md"], skill: "editor" }))).toMatchObject({ phase: "render", strength: "weak" });
    expect(classifyOp(op({ command: "bun test tests/unit/x.test.ts" }))?.phase).toBe("dev");
    expect(classifyOp(op({ command: "ls -la" }))).toBeNull();
  });
});

describe("Claude Code adapter", () => {
  test("detects the format, links the subagent to its parent", () => {
    expect(claude.source).toBe("claude");
    expect(claude.isSubagent).toBe(false);
    expect(claudeSub.isSubagent).toBe(true);
    expect(claudeSub.parentSessionId).toBe("sess-claude-a");
    expect(claude.reportedCostUsd).toBe(1.25);
  });

  test("de-duplicates usage repeated across content blocks of one response", () => {
    const models = claude.events.filter((e) => e.kind === "model");
    expect(models.length).toBe(17);
    // msg_1 is split across two records with the same usage; it must count once.
    expect(claudeA.tokens.input).toBe(10 + 16 * 5);
    expect(claudeA.tokens.cacheWrite).toBe(600);
  });

  test("links a background job to its task notification", () => {
    const bg = claude.events.find((e) => e.kind === "call" && e.id === "tu_7");
    expect(bg && bg.kind === "call" && bg.background).toBe(true);
    expect(bg && bg.kind === "call" && bg.backgroundEndTs).toBe(Date.parse("2026-10-20T10:05:30.000Z"));
  });

  test("keeps no prompt text", () => {
    expect(JSON.stringify(claude.events)).not.toContain("coffee shop pastry videos");
    expect(JSON.stringify(claude.events)).not.toContain("Now fix the render flag");
  });
});

describe("Codex adapter", () => {
  test("normalizes usage to uncached input and counts bad lines", () => {
    expect(codex.source).toBe("codex");
    expect(codex.badLines).toBe(1);
    expect(codexA.tokens.input).toBe(200 + 100 + 100 + 100 + 100 + 3 * 100 + 100);
    expect(codexA.tokens.cacheRead).toBe(800 + 1000 + 1100 + 1200 + 1300 + 3 * 400 + 500);
  });

  test("attaches command completions to the call that was waiting on them", () => {
    const w1 = codex.events.find((e) => e.kind === "call" && e.id === "w1");
    expect(w1 && w1.kind === "call" && w1.ops.map((o) => o.kind)).toEqual(["wait", "shell"]);
    expect(codexA.humanPrompts).toBe(2);
  });

  test("a forked thread takes its fork id from the file name", () => {
    const fork = parseRecords("/x/rollout-2026-10-22T19-36-35-01a1628e-ea76-75b1-90b8-a36796b70c0a_01a1632f-213a-77a2-813b-05e7c1566238.jsonl", [
      { timestamp: "2026-10-22T10:36:35.000Z", type: "session_meta", payload: { id: "01a1628e-ea76-75b1-90b8-a36796b70c0a", cwd: "/repo" } },
    ]);
    expect(fork?.sessionId).toBe("01a1632f-213a-77a2-813b-05e7c1566238");
  });

  test("parseRecords returns null for an unknown format", () => {
    expect(parseRecords("x.jsonl", [{ hello: "world" }])).toBeNull();
  });
});

describe("phase attribution and time", () => {
  test("Claude main session: phase active times to the second", () => {
    const s = (p: keyof typeof claudeA.phases) => Math.round(claudeA.phases[p].activeMs / 1000);
    expect(s("intake")).toBe(21);
    expect(s("assets")).toBe(54);
    expect(s("render")).toBe(271);
    expect(Math.round(claudeA.phases.render.bgWaitMs / 1000)).toBe(240);
    expect(s("eval")).toBe(9);
    expect(s("dev")).toBe(50);
    expect(Math.round(claudeA.activeMs / 1000)).toBe(405);
    expect(Math.round(claudeA.userWaitMs / 1000)).toBe(1445);
    expect(claudeA.activeMs + claudeA.userWaitMs + claudeA.idleMs).toBe(claudeA.spanMs);
  });

  test("a skill read in a dev-only turn is demoted to dev", () => {
    const editor = claudeA.callInfos.find((c) => c.call.id === "tu_13")!;
    expect(editor.demoted).toBe(true);
    expect(editor.phase).toBe("dev");
  });

  test("Codex session: unclassified reads take the first following anchor in the turn", () => {
    expect(Math.round(codexA.phases.scenario.activeMs / 1000)).toBe(10);
    expect(Math.round(codexA.phases.assets.activeMs / 1000)).toBe(215);
    expect(Math.round(codexA.phases.dev.activeMs / 1000)).toBe(31);
    expect(Math.round(codexA.userWaitMs / 1000)).toBe(974);
    const sed = codexA.callInfos.find((c) => c.call.id === "c5")!;
    expect(sed.signal).toBeNull();
    expect(sed.phase).toBe("dev");
  });

  test("idle gaps beyond the threshold are excluded from active time", () => {
    const tight = analyzeSession(claude, { ...OPTS, idleGapMs: 60_000 });
    expect(Math.round(tight.idleMs / 1000)).toBe(240);
    expect(Math.round(tight.activeMs / 1000)).toBe(165);
  });
});

describe("waste detectors", () => {
  const finding = (id: string) => report.waste.find((w) => w.id === id)!;

  test("repeated reads", () => {
    const w = finding("repeated-read");
    expect(w.count).toBe(2);
    expect(w.impact.extraCalls).toBe(4);
  });

  test("failed and retried calls", () => {
    expect(finding("failed-retry").count).toBe(3);
  });

  test("usage errors on ralphy verbs", () => {
    const w = finding("usage-error");
    expect(w.count).toBe(2);
    expect(w.groups.map((g) => g.label).sort()).toEqual(["ralphy generate video: unknown option --fps", "ralphy render: unknown option --fps"]);
    expect(usageErrorOf(op({ outputHead: `{"error":{"code":"E_FLAG_UNKNOWN"}}` }))).toBe("E_FLAG_UNKNOWN");
    // E_INPUT_INVALID messages are reduced to a generic category, never the user's values.
    expect(usageErrorOf(op({ outputHead: `{"error":{"code":"E_INPUT_INVALID","message":"Invalid input for --workspace: Workspace not found: acme"}}` }))).toBe(
      "E_INPUT_INVALID (workspace not found)",
    );
    expect(inputInvalidCategory("Invalid input for --style: nope")).toBe("invalid --style");
  });

  test("background waits: an idle gap ending at a notification and a blocking wait", () => {
    const w = finding("background-wait");
    expect(w.count).toBe(2);
    expect(Math.round((w.impact.ms ?? 0) / 1000)).toBe(240 + 181);
  });

  test("skills loaded without a follow-up action", () => {
    const w = finding("unused-skill");
    expect(w.groups).toEqual([{ label: "evaluator", count: 1 }]);
  });

  test("large outputs, flagged as likely unnecessary when unbounded", () => {
    const w = finding("large-output");
    expect(w.count).toBe(3);
    expect(w.note).toContain("3 of 3");
  });

  test("redaction hides workspace / project ids and home directories", () => {
    expect(displayPath("/Users/someone/x/.ralphy/workspaces/acme/projects/secret-001/index.html", true)).toBe("<project>/index.html");
    expect(displayPath("/Users/someone/Documents/private/notes/file.md", true)).toBe(".../notes/file.md");
    expect(displayPath("/Users/someone/works/ralphy/cli/index.ts", true)).toBe("cli/index.ts");
  });
});

describe("report", () => {
  test("phase table, latency and perf comparison", () => {
    expect(report.inputs).toMatchObject({ sessions: 3, mainSessions: 2, subagentSessions: 1, bySource: { claude: 2, codex: 1 } });
    const research = report.phases.find((p) => p.phase === "research")!;
    expect(research.activeMs).toBe(0);
    expect(Math.round(research.subagentActiveMs / 1000)).toBe(40);
    const lat = Object.fromEntries(report.latency.map((l) => [l.verb, Math.round(l.medianMs / 1000)]));
    expect(lat["generate image"]).toBe(20);
    expect(lat["render"]).toBe(245);
    expect(lat["generate video"]).toBe(195);
    expect(report.perf.productionSessions).toBe(2);
    expect(report.perf.renderingSessions).toBe(1);
  });

  test("ralphy-related filter", () => {
    expect(isRalphyRelated(claude)).toBe(true);
    expect(isRalphyRelated({ ...codex, cwd: "/tmp/other", events: [] })).toBe(false);
  });
});

describe("CLI", () => {
  const run = (...args: string[]) => spawnSync("bun", ["run", path.join(REPO, "scripts", "session-report.ts"), ...args], { cwd: REPO, encoding: "utf8" });

  test("discovers both formats from a directory and prints JSON", () => {
    expect(discoverFiles([FIXTURES]).files.length).toBe(3);
    const r = run(FIXTURES, "--json", "--large-output-chars", "500");
    expect(r.status).toBe(0);
    const json = JSON.parse(r.stdout);
    expect(json.inputs.sessions).toBe(3);
    expect(json.waste.map((w: { id: string }) => w.id)).toEqual(["repeated-read", "failed-retry", "usage-error", "background-wait", "unused-skill", "large-output"]);
  });

  test("--since drops sessions without activity on or after the date", () => {
    const r = run(FIXTURES, "--json", "--since", "2026-10-21");
    expect(r.status).toBe(0);
    const json = JSON.parse(r.stdout);
    expect(json.inputs.bySource).toEqual({ codex: 1 });
    expect(json.skippedBySince).toBe(2);
  });

  test("text mode prints the phase table and waste list", () => {
    const r = run(FIXTURES, "--redact");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Per phase");
    expect(r.stdout).toContain("Waste");
  });

  test("argument errors exit 2", () => {
    expect(() => parseArgs([])).toThrow();
    expect(() => parseArgs(["x", "--bogus"])).toThrow("unknown option --bogus");
    expect(run(FIXTURES, "--bogus").status).toBe(2);
  });
});

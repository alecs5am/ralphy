// Agent user simulator test (issue #431).
//
// Replays the scripted personas (tests/sim/personas.ts) through the
// deterministic simulator (tests/sim/simulator.ts) and asserts the multi-turn
// invariants the issue calls for:
//   • the WELL-BEHAVED personas report ZERO violations on the scripted paths;
//   • the TEETH persona (a deliberate spend-before-approval move) is CAUGHT —
//     the harness has teeth, like the #417 coverage test;
//   • each persona exercises a distinct invariant (asks-only-necessary,
//     no-spend-before-approval, ambiguous→ask, mid-flow style/platform recovery,
//     budget-cap enforcement);
//   • the report shape is well-formed (one record per turn, ok/expected/got).
//
// Fully offline + deterministic: NO network, NO live generation. The plan
// builder's LLM enrichment is STUBBED inside the simulator (cannedEnrichment,
// mirroring tests/unit/mode-coverage.test.ts) and the spend governor reads a
// real on-disk ledger + gen-log under a temp project root (the setRoot pattern
// from tests/unit/spend.test.ts).
//
// English-only on disk.

import { describe, test, expect } from "bun:test";
import {
  PERSONAS,
  WELL_BEHAVED_PERSONAS,
  TEETH_PERSONAS,
} from "../sim/personas.js";
import {
  simulatePersona,
  summarizeReport,
  type SimReport,
} from "../sim/simulator.js";

// ─── Replay every persona once (the runs are independent) ─────────────────────

const reports = new Map<string, SimReport>();
for (const persona of PERSONAS) {
  reports.set(persona.id, await simulatePersona(persona));
}

// Emit the compact report the issue asks for — one block per persona, listing
// failed turns + expected behavior. Visible with `bun test --verbose` / on fail.
const summary = PERSONAS.map((p) => summarizeReport(reports.get(p.id)!)).join("\n\n");
// eslint-disable-next-line no-console
console.log("\n=== Agent user simulator report (#431) ===\n" + summary + "\n");

// ─── (1) Well-behaved personas → zero violations ──────────────────────────────

describe("agent user simulator (#431): well-behaved personas have zero violations", () => {
  for (const persona of WELL_BEHAVED_PERSONAS) {
    test(`${persona.id} (${persona.exercises}) — 0 violations`, () => {
      const report = reports.get(persona.id)!;
      expect(
        report.violations,
        `${persona.id} violations:\n${summarizeReport(report)}`,
      ).toEqual([]);
      // Every turn produced a record, and each is marked ok.
      expect(report.turns.length).toBe(persona.turns.length);
      expect(report.turns.every((t) => t.ok)).toBe(true);
    });
  }
});

// ─── (2) The teeth case — a deliberate bad move MUST be caught ────────────────

describe("agent user simulator (#431): the harness has teeth", () => {
  test("at least one persona scripts a deliberate violation", () => {
    expect(TEETH_PERSONAS.length).toBeGreaterThan(0);
  });

  for (const persona of TEETH_PERSONAS) {
    test(`${persona.id} — deliberate spend-before-approval is CAUGHT`, () => {
      const report = reports.get(persona.id)!;
      expect(report.violations.length).toBeGreaterThan(0);
      // The specific invariant the impatient marketer trips is the
      // no-spend-before-approval gate (the #444 governor).
      expect(report.violations.some((v) => v.invariant === "no-spend-before-approval")).toBe(true);
      // The violation names the turn it fired on + the expected behavior.
      const v = report.violations.find((x) => x.invariant === "no-spend-before-approval")!;
      expect(typeof v.turn).toBe("number");
      expect(v.expected.length).toBeGreaterThan(0);
      expect(v.got.length).toBeGreaterThan(0);
    });
  }
});

// ─── (3) Each invariant is exercised by some persona ──────────────────────────

describe("agent user simulator (#431): invariant coverage", () => {
  test("the five issue invariants are each exercised by a persona", () => {
    const exercised = PERSONAS.map((p) => p.exercises).join(" | ").toLowerCase();
    expect(exercised).toContain("asks-only-necessary");
    expect(exercised).toContain("no-spend-before-approval");
    expect(exercised).toContain("ambiguous");
    expect(exercised).toContain("style-change");
    expect(exercised).toContain("budget-cap");
    expect(exercised).toContain("platform-change");
  });

  test("the budget-sensitive buyer allows the cheap step and blocks the overrun", () => {
    const report = reports.get("budget-sensitive-buyer")!;
    // Turn 2 (cheap image, post-approval, under cap) is allowed; turn 3 (25s
    // video) overruns and is blocked — both via the #444 governor. Zero
    // violations means both verdicts matched the script.
    expect(report.violations).toEqual([]);
    const assetTurns = report.turns.filter((t) => t.phase === "assets");
    expect(assetTurns.length).toBe(2);
    expect(assetTurns[0]!.got).toContain("spend=allowed");
    expect(assetTurns[1]!.got).toContain("spend=blocked");
  });

  test("the vague creator asks twice then proceeds confidently", () => {
    const report = reports.get("vague-creator")!;
    expect(report.violations).toEqual([]);
    expect(report.turns[0]!.action).toContain("clarifying question");
    expect(report.turns[1]!.action).toContain("clarifying question");
    expect(report.turns[2]!.action).toContain('locked mode "unboxing-ugc"');
  });

  test("a mid-flow style/platform change triggers a re-plan", () => {
    for (const id of ["brand-safe-client", "platform-pivot-creator"]) {
      const report = reports.get(id)!;
      expect(report.violations).toEqual([]);
      // The change turn(s) re-built the plan (the action mentions the change).
      expect(report.turns.some((t) => /after .* change/.test(t.action))).toBe(true);
    }
  });
});

// ─── (4) Report shape ─────────────────────────────────────────────────────────

describe("agent user simulator (#431): report shape", () => {
  for (const persona of PERSONAS) {
    test(`${persona.id} report is well-formed`, () => {
      const report = reports.get(persona.id)!;
      expect(report.persona).toBe(persona.id);
      expect(report.exercises.length).toBeGreaterThan(0);
      expect(Array.isArray(report.turns)).toBe(true);
      expect(Array.isArray(report.violations)).toBe(true);
      for (const t of report.turns) {
        expect(typeof t.index).toBe("number");
        expect(t.utterance.length).toBeGreaterThan(0);
        expect(typeof t.ok).toBe("boolean");
        expect(t.expected.length).toBeGreaterThan(0);
        expect(t.got.length).toBeGreaterThan(0);
      }
      for (const v of report.violations) {
        expect(typeof v.turn).toBe("number");
        expect(v.invariant.length).toBeGreaterThan(0);
      }
    });
  }
});

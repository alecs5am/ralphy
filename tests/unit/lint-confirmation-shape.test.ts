// Unit tests for scripts/lint-confirmation-shape.ts (04.03.04).
//
// The lint sweeps playbook + skill markdown for confirmation-shaped phrases
// that the agent must NOT emit on a concrete request.

import { describe, test, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  scanText,
  lintConfirmationShape,
  BANNED_PHRASES,
} from "../../scripts/lint-confirmation-shape.js";

describe("scanText", () => {
  test("flags 'Shall I proceed?'", () => {
    const hits = scanText("Some intro.\nShall I proceed with this?\n", "doc.md");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.line).toBe(2);
    expect(hits[0]!.phrase).toBe("shall i proceed");
  });

  test("flags 'Would you like me to ...'", () => {
    const hits = scanText("Would you like me to start the render?\n", "doc.md");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.phrase).toBe("would you like me to");
  });

  test("flags Russian 'продолжить?'", () => {
    const hits = scanText("Готов рендерить — продолжить?\n", "doc.md");
    expect(hits).toHaveLength(1);
  });

  test("passes a clean playbook line", () => {
    const hits = scanText("Run `ralphy render <id>` next.\n", "doc.md");
    expect(hits).toHaveLength(0);
  });

  test("skips fenced code by default (documenting the anti-pattern)", () => {
    const src = [
      "Bad example:",
      "```",
      "Shall I proceed?",
      "```",
      "End.",
    ].join("\n");
    const hits = scanText(src, "doc.md");
    expect(hits).toHaveLength(0);
  });

  test("honors inline allow marker", () => {
    const src = "Shall I proceed? <!-- confirmation-shape-allow -->\n";
    const hits = scanText(src, "doc.md");
    expect(hits).toHaveLength(0);
  });

  test("honors section allow marker until next heading", () => {
    const src = [
      "## Bad UX patterns <!-- confirmation-shape-allow:section -->",
      "",
      "Shall I proceed?",
      "Should I fix this?",
      "",
      "## Good UX patterns",
      "Shall I continue?",
    ].join("\n");
    const hits = scanText(src, "doc.md");
    // Only the line in the next section should fire.
    expect(hits).toHaveLength(1);
    expect(hits[0]!.line).toBe(7);
  });

  test("at most one hit per line (keeps output legible)", () => {
    const src = "Shall I proceed? Should I fix this?\n";
    const hits = scanText(src, "doc.md");
    expect(hits).toHaveLength(1);
  });
});

describe("BANNED_PHRASES", () => {
  test("covers the canonical English + Russian patterns", () => {
    const lower = BANNED_PHRASES.map((p) => p.toLowerCase());
    expect(lower).toContain("shall i proceed");
    expect(lower).toContain("would you like me to");
    expect(lower).toContain("do you want me to");
    expect(lower).toContain("хочешь чтобы я");
  });
});

describe("lintConfirmationShape (filesystem driver)", () => {
  test("returns ok:true on a clean tmp tree", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lint-cs-"));
    try {
      const f = path.join(tmp, "doc.md");
      fs.writeFileSync(f, "Run `ralphy render <id>` next.\nNo confirmation noise here.\n");
      const r = lintConfirmationShape(tmp, [f]);
      expect(r.ok).toBe(true);
      expect(r.findings).toBe(0);
      expect(r.scanned).toBe(1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("returns ok:false when a banned phrase is present", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lint-cs-"));
    try {
      const f = path.join(tmp, "doc.md");
      fs.writeFileSync(f, "Shall I proceed with the render?\n");
      const r = lintConfirmationShape(tmp, [f]);
      expect(r.ok).toBe(false);
      expect(r.findings).toBe(1);
      expect(r.hits[0]!.phrase).toBe("shall i proceed");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("scans the real repo with zero findings (post-audit)", () => {
    const repo = path.resolve(import.meta.dir, "..", "..");
    const r = lintConfirmationShape(repo);
    // Soft assertion — if the audit fails, the report message in `r.hits`
    // tells us where. Each hit must be either fixed in the playbook or
    // explicitly tagged with the allow marker.
    if (!r.ok) {
      // Surface the offenders so the assertion failure is debuggable.
      const summary = r.hits.map((h) => `${h.file}:${h.line} "${h.phrase}"`).join("\n");
      throw new Error(`confirmation-shape audit found ${r.findings} hit(s):\n${summary}`);
    }
    expect(r.ok).toBe(true);
  });
});

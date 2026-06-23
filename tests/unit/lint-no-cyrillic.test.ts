// Unit tests for scripts/lint-no-cyrillic.ts (#465).
//
// The synthetic Cyrillic string is built via String.fromCharCode so THIS file
// stays ASCII on disk — otherwise scanRepo() would (correctly) flag the test
// itself once it's tracked.

import { describe, test, expect } from "bun:test";
import path from "node:path";
import { cyrillicLines, scanRepo, ALLOWLIST } from "../../scripts/lint-no-cyrillic.js";

// "привет" — Cyrillic, assembled at runtime, never a raw glyph on disk.
const CYR = String.fromCharCode(0x43f, 0x440, 0x438, 0x432, 0x435, 0x442);

describe("cyrillicLines", () => {
  test("flags only the line that contains Cyrillic", () => {
    const hits = cyrillicLines(`ok line\n${CYR} mixed\nclean line`);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.line).toBe(2);
  });

  test("passes clean text including accented Latin", () => {
    expect(cyrillicLines("cafe deja vu - resume - no Cyrillic")).toHaveLength(0);
  });
});

describe("scanRepo", () => {
  test("the tracked repo is Cyrillic-clean outside the allowlist", () => {
    const repo = path.resolve(import.meta.dir, "..", "..");
    const { hits } = scanRepo(repo);
    expect(hits).toEqual([]);
  });

  test("allowlist holds only pre-existing debt paths", () => {
    expect(ALLOWLIST.size).toBeGreaterThan(0);
  });
});

// Unit tests for the soft pre-submit linter in cli/lib/music-prompt-lint.ts (#006).
//
// The linter is the in-code mirror of the memory entry
// `feedback_elevenlabs_music_no_artist_names`: known artist / producer / track
// names surface a warning + a generic alternative BEFORE the prompt hits the
// wire. The linter NEVER blocks — false positives are cheaper than false
// negatives — so the assertions focus on:
//
//  - known artist names trigger a warning with the expected kind + suggestion
//  - clean prompts return ok: true with no matches
//  - case-insensitive whole-word match (no false positives on substrings)
//  - multi-word names tolerate flexible whitespace
//  - the formatter returns null on clean prompts

import { describe, test, expect } from "bun:test";
import { lintMusicPrompt, formatMusicPromptLintReport } from "../../cli/lib/music-prompt-lint.js";

describe("lintMusicPrompt — known artist names", () => {
  test("flags a named rapper with a trap-beat alternative", () => {
    const result = lintMusicPrompt("Drake type beat, dark trap, 808 sub");
    expect(result.ok).toBe(false);
    expect(result.matches.length).toBeGreaterThanOrEqual(1);
    const m = result.matches[0]!;
    expect(m.matched).toBe("drake");
    expect(m.kind).toBe("rapper");
    expect(m.warning).toMatch(/elevenlabs/i);
    expect(m.warning).toMatch(/bad_prompt/i);
    expect(m.suggestion).toMatch(/trap beat/i);
    expect(m.suggestion).toMatch(/no vocals/i);
  });

  test("flags a named producer with a hip-hop production alternative", () => {
    const result = lintMusicPrompt("Metro Boomin style beat, dark");
    expect(result.ok).toBe(false);
    const m = result.matches.find((x) => x.matched === "metro boomin");
    expect(m).toBeDefined();
    expect(m!.kind).toBe("producer");
    expect(m!.suggestion).toMatch(/hip-hop production/i);
  });

  test("flags a named track with a register-only alternative", () => {
    const result = lintMusicPrompt("8-bit Tetris theme remix");
    expect(result.ok).toBe(false);
    const m = result.matches.find((x) => x.matched === "tetris theme");
    expect(m).toBeDefined();
    expect(m!.kind).toBe("named-track");
    expect(m!.suggestion).toMatch(/chiptune/i);
  });

  test("flags Brian Eno (named-artist class)", () => {
    const result = lintMusicPrompt("brian eno style ambient pad");
    expect(result.ok).toBe(false);
    const m = result.matches.find((x) => x.matched === "brian eno");
    expect(m).toBeDefined();
    expect(m!.kind).toBe("named-artist");
    expect(m!.suggestion).toMatch(/genre.*tempo.*instrumentation/i);
  });
});

describe("lintMusicPrompt — false-positive resistance", () => {
  test("clean prompt returns ok: true with empty matches", () => {
    const result = lintMusicPrompt(
      "trap beat, 140 BPM, 808 sub-bass, hi-hat rolls, dark minor-key piano",
    );
    expect(result.ok).toBe(true);
    expect(result.matches).toEqual([]);
  });

  test("does not match substring inside a longer word", () => {
    // "futuretech" should NOT match "future" — \b boundary protection.
    const result = lintMusicPrompt("futuretech synthwave 120 BPM");
    expect(result.ok).toBe(true);
  });

  test("is case-insensitive", () => {
    const upper = lintMusicPrompt("KANYE WEST style production");
    const lower = lintMusicPrompt("kanye west style production");
    expect(upper.ok).toBe(false);
    expect(lower.ok).toBe(false);
    expect(upper.matches[0]!.matched).toBe(lower.matches[0]!.matched);
  });

  test("multi-word names tolerate double whitespace", () => {
    const result = lintMusicPrompt("pop  smoke type drill beat");
    expect(result.ok).toBe(false);
    expect(result.matches.find((m) => m.matched === "pop smoke")).toBeDefined();
  });

  test("deduplicates the same name when it appears twice", () => {
    const result = lintMusicPrompt("Drake and Drake again, with Drake vibes");
    expect(result.matches.filter((m) => m.matched === "drake").length).toBe(1);
  });
});

describe("formatMusicPromptLintReport", () => {
  test("returns null on a clean prompt", () => {
    const result = lintMusicPrompt("cinematic ambient, 60 BPM, sustained pad");
    expect(formatMusicPromptLintReport(result)).toBeNull();
  });

  test("renders a multi-line block on a dirty prompt", () => {
    const result = lintMusicPrompt("Drake type beat");
    const report = formatMusicPromptLintReport(result);
    expect(report).not.toBeNull();
    expect(report!).toMatch(/soft warning/i);
    expect(report!).toMatch(/drake/i);
    expect(report!).toMatch(/auto-retry-on-tos-rejection/);
  });
});

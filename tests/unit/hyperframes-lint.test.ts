// Unit tests for cli/lib/render/hyperframes-lint.ts (#047).
//
// Two HyperFrames edge cases historically only surfaced at render time, after
// a silent freeze:
//
//   1. `<video>` element missing `id` / `data-start` on the element itself —
//      authors hang those attrs on a wrapper <div>.
//   2. Many short (`<3s`) same-track `<video>` clips back-to-back — the runtime
//      cannot reliably switch between same-track video sources during capture.
//
// These tests pin both as author-time gates: rule 1 BLOCKS (errors[]), rule 2
// WARNS with a concat-fix suggestion (warnings[], does not flip `ok`).
// `data-allow-short-stack="true"` is the documented override for rule 2.

import { describe, test, expect } from "bun:test";
import {
  lintHyperframesHtml,
  formatHyperframesLintReport,
} from "../../cli/lib/render/hyperframes-lint.js";

describe("lintHyperframesHtml — rule 1: timed media attrs on the element", () => {
  test("clean <video> with id + data-start passes", () => {
    const html = `
      <video id="el-v" data-start="0" data-duration="6" data-track-index="0"
             src="clip.mp4" muted playsinline></video>
    `;
    const result = lintHyperframesHtml(html);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("flags <video> missing id", () => {
    const html = `<video data-start="0" data-duration="6" data-track-index="0" src="c.mp4" muted playsinline></video>`;
    const result = lintHyperframesHtml(html);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "media_missing_id")).toBe(true);
  });

  test("flags <video> missing data-start", () => {
    const html = `<video id="el-v" data-duration="6" data-track-index="0" src="c.mp4" muted playsinline></video>`;
    const result = lintHyperframesHtml(html);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "media_missing_data_start")).toBe(true);
  });

  test("flags the wrapper-div anti-pattern (data-start on wrapper, not on video)", () => {
    const html = `
      <div data-start="0" data-track-index="0" data-duration="6">
        <video src="c.mp4" muted playsinline></video>
      </div>
    `;
    const result = lintHyperframesHtml(html);
    expect(result.ok).toBe(false);
    // Wrapper itself is flagged
    expect(result.errors.some((e) => e.code === "media_attrs_on_wrapper")).toBe(true);
    // And the inner <video> is also missing id + data-start
    expect(result.errors.some((e) => e.code === "media_missing_id")).toBe(true);
    expect(result.errors.some((e) => e.code === "media_missing_data_start")).toBe(true);
  });

  test("flags wrapper even when inner <video> has the attrs too", () => {
    const html = `
      <div data-start="0" data-track-index="0" data-duration="6">
        <video id="el" data-start="0" data-duration="6" data-track-index="0"
               src="c.mp4" muted playsinline></video>
      </div>
    `;
    const result = lintHyperframesHtml(html);
    expect(result.errors.some((e) => e.code === "media_attrs_on_wrapper")).toBe(true);
  });
});

describe("lintHyperframesHtml — rule 2: many-short-same-track montage", () => {
  function shortClips(n: number, track = 0, extra = ""): string {
    return Array.from({ length: n }, (_, i) =>
      `<video id="el-${i}" data-start="${i * 2}" data-duration="2" data-track-index="${track}" ${extra} src="c${i}.mp4" muted playsinline></video>`,
    ).join("\n");
  }

  test("4 short clips on the same track pass (under threshold)", () => {
    const html = shortClips(4);
    const result = lintHyperframesHtml(html);
    expect(result.ok).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  test("5+ short clips on the same track warn with concat-fix suggestion", () => {
    const html = shortClips(6);
    const result = lintHyperframesHtml(html);
    expect(result.ok).toBe(true); // warning, not error
    expect(result.warnings).toHaveLength(1);
    const w = result.warnings[0]!;
    expect(w.code).toBe("many_short_same_track_video");
    expect(w.trackIndex).toBe(0);
    expect(w.count).toBe(6);
    expect(w.suggestion).toMatch(/concat/i);
    expect(w.suggestion).toMatch(/data-allow-short-stack/);
  });

  test("does not warn when clips are spread across separate tracks", () => {
    const html = Array.from(
      { length: 6 },
      (_, i) =>
        `<video id="el-${i}" data-start="0" data-duration="2" data-track-index="${i}" src="c.mp4" muted playsinline></video>`,
    ).join("\n");
    const result = lintHyperframesHtml(html);
    expect(result.warnings).toHaveLength(0);
  });

  test("does not warn when clips are long (>= 3s)", () => {
    const html = Array.from(
      { length: 6 },
      (_, i) =>
        `<video id="el-${i}" data-start="${i * 4}" data-duration="4" data-track-index="0" src="c.mp4" muted playsinline></video>`,
    ).join("\n");
    const result = lintHyperframesHtml(html);
    expect(result.warnings).toHaveLength(0);
  });

  test("data-allow-short-stack='true' on any clip suppresses the warning", () => {
    const html = shortClips(6, 0, 'data-allow-short-stack="true"');
    const result = lintHyperframesHtml(html);
    expect(result.warnings).toHaveLength(0);
    expect(result.ok).toBe(true);
  });

  test("bare data-allow-short-stack (no value) also suppresses", () => {
    // Mix: 5 plain + 1 with the override flag bare-attr.
    const five = shortClips(5);
    const sixth = `<video id="el-x" data-start="100" data-duration="2" data-track-index="0" data-allow-short-stack src="c.mp4" muted playsinline></video>`;
    const result = lintHyperframesHtml(`${five}\n${sixth}`);
    expect(result.warnings).toHaveLength(0);
  });
});

describe("formatHyperframesLintReport", () => {
  test("returns null on a clean composition", () => {
    const html = `<video id="v" data-start="0" data-duration="6" data-track-index="0" src="c.mp4" muted playsinline></video>`;
    const result = lintHyperframesHtml(html);
    expect(formatHyperframesLintReport(result)).toBeNull();
  });

  test("formats errors + warnings in one report", () => {
    const html = `
      <div data-start="0" data-track-index="0" data-duration="2">
        <video src="c.mp4" muted playsinline></video>
      </div>
    `;
    const result = lintHyperframesHtml(html);
    const report = formatHyperframesLintReport(result);
    expect(report).not.toBeNull();
    expect(report!).toMatch(/error/i);
    expect(report!).toMatch(/media_attrs_on_wrapper/);
  });
});

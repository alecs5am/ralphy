// Unit tests for the help-examples lint script (01.03.02).
//
// The script extracts `ralphy ...` command strings from landing/ and verifies
// each one (filtered to v1.0 verbs) appears in some CLI --help output.

import { describe, test, expect } from "bun:test";
import {
  extractLandingExamples,
  classifyExample,
  type V1HelpIndex,
  lintExamples,
} from "../../scripts/lint-help-examples.js";

describe("extractLandingExamples", () => {
  test("pulls backtick-quoted ralphy ... strings", () => {
    const src = "Lead with `ralphy clone https://x.com/y`. And later, `ralphy render <id>`.";
    const examples = extractLandingExamples(src);
    expect(examples).toContain("ralphy clone https://x.com/y");
    expect(examples).toContain("ralphy render <id>");
  });

  test("pulls template-literal ralphy ... strings", () => {
    const src = `<code>{\`ralphy clone https://tiktok.com/@x/video/72939...\\n\`}</code>`;
    const examples = extractLandingExamples(src);
    expect(examples.some((e) => e.startsWith("ralphy clone"))).toBe(true);
  });

  test("ignores prose mentions of `ralphy` without a verb", () => {
    const src = "The CLI is called `ralphy` and it works.";
    const examples = extractLandingExamples(src);
    expect(examples).toEqual([]);
  });
});

describe("classifyExample", () => {
  test("returns v1.0 verb for clone / render / skill install / ref pull", () => {
    expect(classifyExample("ralphy clone https://x").v1).toBe(true);
    expect(classifyExample("ralphy render proj-001").v1).toBe(true);
    expect(classifyExample("ralphy skill install").v1).toBe(true);
    expect(classifyExample("ralphy ref pull").v1).toBe(true);
  });

  test("flags trend / iterate / make as post-launch (per D-04 / D-03)", () => {
    expect(classifyExample("ralphy trend").v1).toBe(false);
    expect(classifyExample("ralphy iterate").v1).toBe(false);
    expect(classifyExample("ralphy make").v1).toBe(false);
  });
});

describe("lintExamples", () => {
  test("returns no violations when every v1.0 example is in --help", () => {
    const examples = ["ralphy clone https://x", "ralphy render <id>"];
    const helpIndex: V1HelpIndex = {
      "clone": "Usage: ralphy clone <url-or-ref>\nExamples:\n  ralphy clone https://x\n  ralphy clone <ref>\n",
      "render": "Usage: ralphy render <id>\nExamples:\n  ralphy render <id>\n",
    };
    const result = lintExamples(examples, helpIndex);
    expect(result.violations).toEqual([]);
  });

  test("flags an example that has no corresponding --help mention", () => {
    const examples = ["ralphy clone https://specific-missing"];
    const helpIndex: V1HelpIndex = {
      "clone": "Usage: ralphy clone <url-or-ref>\n(no examples)\n",
    };
    const result = lintExamples(examples, helpIndex);
    expect(result.violations.length).toBe(1);
    expect(result.violations[0]!.example).toBe("ralphy clone https://specific-missing");
  });

  test("skips post-launch examples (trend, iterate)", () => {
    const examples = ["ralphy trend @x", "ralphy iterate camp-001"];
    const result = lintExamples(examples, {});
    expect(result.violations).toEqual([]);
    expect(result.skipped.length).toBe(2);
  });
});

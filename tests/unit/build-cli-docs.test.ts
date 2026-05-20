// Unit tests for scripts/build-cli-docs.ts (07.03.01).
//
// The script walks cli/commands/, runs `<verb> --help`, and emits one
// .mdx page per verb under docs-mintlify/reference/ with:
//   • a summary section (signature + 3 common flags + 1 worked example)
//   • a collapsible <Expandable title="Full reference"> block with all flags
//
// Idempotent — re-running produces byte-identical output. CI gate via --check
// fails when committed file diverges from regenerated.

import { describe, test, expect } from "bun:test";
import {
  parseHelpText,
  pickCommonFlags,
  pickExample,
  renderVerbMdx,
  type ParsedHelp,
} from "../../scripts/build-cli-docs.js";

const SAMPLE_HELP = `Usage: ralphy doctor [options]

Env health check — keys, dependencies, project link. JSON for scripts; -p for human view.

Options:
  --refresh         Force-refresh the catalog (ignore TTL cache)
  -v, --verbose     Print detailed diagnostics
  -h, --help        display help for command

Examples:
  ralphy doctor
  ralphy doctor -p
  ralphy doctor --refresh
`;

describe("parseHelpText", () => {
  test("extracts usage, description, options, examples", () => {
    const p = parseHelpText(SAMPLE_HELP);
    expect(p.usage).toContain("ralphy doctor");
    expect(p.description).toContain("Env health check");
    expect(p.flags.length).toBeGreaterThan(0);
    expect(p.examples.length).toBe(3);
  });

  test("parses one flag per line, capturing name + description", () => {
    const p = parseHelpText(SAMPLE_HELP);
    const refresh = p.flags.find((f) => f.name === "--refresh");
    expect(refresh).toBeTruthy();
    expect(refresh!.description).toContain("Force-refresh");
  });

  test("handles missing Examples block", () => {
    const p = parseHelpText("Usage: x\n\nDoes a thing\n\nOptions:\n  --foo  bar\n");
    expect(p.examples).toEqual([]);
  });
});

describe("pickCommonFlags", () => {
  test("returns first 3 non-help flags when no annotations present", () => {
    const flags = [
      { name: "--alpha", description: "a" },
      { name: "--beta", description: "b" },
      { name: "--gamma", description: "c" },
      { name: "--delta", description: "d" },
      { name: "-h, --help", description: "display help" },
    ];
    const picked = pickCommonFlags(flags);
    expect(picked.map((f) => f.name)).toEqual(["--alpha", "--beta", "--gamma"]);
  });

  test("excludes -h/--help even at position < 3", () => {
    const flags = [
      { name: "-h, --help", description: "display help" },
      { name: "--alpha", description: "a" },
      { name: "--beta", description: "b" },
    ];
    expect(pickCommonFlags(flags).map((f) => f.name)).toEqual(["--alpha", "--beta"]);
  });
});

describe("pickExample", () => {
  test("returns the first non-trivial example", () => {
    expect(pickExample(["ralphy doctor", "ralphy doctor -p"])).toBe("ralphy doctor");
  });

  test("returns null when no examples", () => {
    expect(pickExample([])).toBeNull();
  });
});

describe("renderVerbMdx", () => {
  test("emits frontmatter, summary, and Expandable full-reference block", () => {
    const parsed: ParsedHelp = parseHelpText(SAMPLE_HELP);
    const md = renderVerbMdx("doctor", parsed);
    expect(md).toContain("---");
    expect(md).toContain('title: "ralphy doctor"');
    expect(md).toContain("Auto-generated — edit `cli/commands/");
    expect(md).toContain("## Summary");
    expect(md).toContain("<Expandable");
    expect(md).toContain("Full reference");
    expect(md).toContain("ralphy doctor");  // example carried in
  });

  test("is deterministic for the same input", () => {
    const parsed = parseHelpText(SAMPLE_HELP);
    const a = renderVerbMdx("doctor", parsed);
    const b = renderVerbMdx("doctor", parsed);
    expect(a).toBe(b);
  });
});

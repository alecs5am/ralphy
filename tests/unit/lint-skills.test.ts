// Unit tests for scripts/lint-skills.ts (03.01.01-02).
//
// The lint walks .agents/skills/*/SKILL.md and verifies:
//   • Frontmatter parses cleanly
//   • `name` is kebab-case and matches the folder name
//   • `description` is present and ≤ 1536 chars
//   • (warning) Body has the expected section ordering

import { describe, test, expect } from "bun:test";
import {
  parseFrontmatter,
  validateSkill,
  type SkillFrontmatter,
} from "../../scripts/lint-skills.js";

describe("parseFrontmatter", () => {
  test("extracts a simple key:value frontmatter", () => {
    const fm = parseFrontmatter(`---\nname: foo\ndescription: bar\n---\n# Body\n`);
    expect(fm!.name).toBe("foo");
    expect(fm!.description).toBe("bar");
  });

  test("handles YAML multi-line description with `description: >-`", () => {
    const src = `---
name: foo
description: >-
  Line one of the description.
  Line two continues here.
  Line three.
---
# Body`;
    const fm = parseFrontmatter(src);
    expect(fm!.name).toBe("foo");
    expect(fm!.description).toContain("Line one");
    expect(fm!.description).toContain("Line two");
    expect(fm!.description).toContain("Line three");
  });

  test("returns null when no frontmatter block", () => {
    expect(parseFrontmatter("# Just a body\n")).toBeNull();
  });

  test("folded description spans blank-line-separated paragraphs (#405)", () => {
    // Before the #405 fix, a blank line inside a `>-` folded scalar terminated
    // the value early, silently truncating multi-paragraph descriptions to the
    // first paragraph (dropping USE WHEN / DO NOT FIRE blocks).
    const src = `---
name: foo
description: >-
  The pipeline summary paragraph.

  USE WHEN the user asks for X.

  DO NOT FIRE for Y.
---
# Body`;
    const fm = parseFrontmatter(src);
    expect(fm!.description).toContain("pipeline summary");
    expect(fm!.description).toContain("USE WHEN");
    expect(fm!.description).toContain("DO NOT FIRE");
  });

  test("folded description does not absorb the next frontmatter key", () => {
    const src = `---
name: foo
description: >-
  Paragraph one.

  Paragraph two.
namespace: user
---
# Body`;
    const fm = parseFrontmatter(src);
    expect(fm!.namespace).toBe("user");
    expect(fm!.description).toContain("Paragraph two");
    expect(fm!.description).not.toContain("namespace");
  });

  test("handles namespace field", () => {
    const fm = parseFrontmatter(`---\nname: foo\ndescription: bar\nnamespace: maintainer\n---\n`);
    expect(fm!.namespace).toBe("maintainer");
  });
});

describe("validateSkill", () => {
  test("passes a healthy skill", () => {
    const fm: SkillFrontmatter = {
      name: "my-skill",
      description: "A short description that fits well under the cap.",
    };
    const r = validateSkill("my-skill", fm, "# Body\n## Trigger\n## Hard invariants\n## Workflow\n## Outputs\n## Cookbook\n");
    expect(r.errors).toEqual([]);
  });

  test("errors when name is missing", () => {
    const fm = { description: "x" } as SkillFrontmatter;
    const r = validateSkill("dir-name", fm, "# Body");
    expect(r.errors.some((e) => e.includes("name"))).toBe(true);
  });

  test("errors when name doesn't match folder", () => {
    const fm: SkillFrontmatter = { name: "wrong-name", description: "x" };
    const r = validateSkill("expected-name", fm, "# Body");
    expect(r.errors.some((e) => e.includes("doesn't match folder"))).toBe(true);
  });

  test("errors when description is missing", () => {
    const fm = { name: "my-skill" } as SkillFrontmatter;
    const r = validateSkill("my-skill", fm, "# Body");
    expect(r.errors.some((e) => e.includes("description"))).toBe(true);
  });

  test("errors when description > 1536 chars (the agentskills.io cap)", () => {
    const longDesc = "x".repeat(2000);
    const fm: SkillFrontmatter = { name: "my-skill", description: longDesc };
    const r = validateSkill("my-skill", fm, "# Body");
    expect(r.errors.some((e) => e.includes("1536"))).toBe(true);
  });

  test("warns (not errors) on missing body sections", () => {
    const fm: SkillFrontmatter = { name: "my-skill", description: "x" };
    const r = validateSkill("my-skill", fm, "# Body\n(no sections)");
    expect(r.errors).toEqual([]);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  test("validates namespace field when present", () => {
    const fm: SkillFrontmatter = {
      name: "my-skill",
      description: "x",
      namespace: "invalid-namespace",
    };
    const r = validateSkill("my-skill", fm, "# Body");
    expect(r.errors.some((e) => e.includes("namespace"))).toBe(true);
  });

  test("accepts namespace=user or maintainer", () => {
    const fm: SkillFrontmatter = {
      name: "my-skill",
      description: "x",
      namespace: "user",
    };
    const r = validateSkill("my-skill", fm, "# Body");
    expect(r.errors).toEqual([]);
  });
});

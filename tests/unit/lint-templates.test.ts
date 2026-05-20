import { describe, test, expect } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { lintTemplates } from "../../scripts/lint-templates.ts";

describe("lint:templates (02.06.02)", () => {
  test("every shipped template passes the lint", async () => {
    const issues = await lintTemplates();
    if (issues.length > 0) {
      console.error("Lint issues:", issues);
    }
    expect(issues).toEqual([]);
  });

  test("detects a banned slug in an isolated fake repo", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ralphy-lint-tpl-"));
    try {
      const dir = path.join(tmp, "templates", "b2b-saas", "hormozi-yap-rant");
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        path.join(dir, "template.yaml"),
        "version: 1\nid: hormozi-yap-rant\nkind: vibe-style\ncategory: b2b-saas\nname: x\ndescription: x\n",
      );
      const issues = await lintTemplates(tmp);
      expect(issues.some((i) => i.kind === "slug")).toBe(true);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  test("detects a missing template.yaml", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ralphy-lint-tpl-"));
    try {
      const dir = path.join(tmp, "templates", "b2b-saas", "ok-slug");
      await fs.mkdir(dir, { recursive: true });
      // no template.yaml — should be flagged
      const issues = await lintTemplates(tmp);
      expect(issues.some((i) => i.kind === "manifest")).toBe(true);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

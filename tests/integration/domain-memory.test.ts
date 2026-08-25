import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  listEntryHistory,
  memoryQualityFlags,
  parseMemoryBody,
  recall,
  writeEntry,
} from "../../cli/lib/memory/store.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { createWorkspace, listWorkspaces } from "../../cli/lib/store/scopes.js";
import { GLOBAL_MEMORY_WORKSPACE_ID } from "../../cli/lib/store/schema.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

let root: TmpRoot;
let workspace: ReturnType<typeof createWorkspace>;

beforeEach(() => {
  root = makeTmpRoot("ralphy-domain-memory");
  workspace = createWorkspace({ slug: "acme", name: "Acme" });
});

afterEach(() => {
  closeDomainDb();
  root.cleanup();
});

describe("SQLite Memory tiers", () => {
  test("stores global entries in SQLite while a workspace entry overrides the same slug", async () => {
    await writeEntry({
      ref: { tier: "global" },
      status: "active",
      slug: "caption-style",
      type: "style",
      text: "Use sentence case globally.",
    });
    await writeEntry({
      ref: { tier: "workspace", ws: workspace.id },
      status: "active",
      slug: "caption-style",
      type: "style",
      text: "Use flat declarative captions for Acme.",
    });

    const db = openDomainDb();
    expect(
      db.query<{ count: number }, [string, string]>(
        "SELECT COUNT(*) AS count FROM memory_entries WHERE workspace_id = ? AND slug = ?",
      ).get(GLOBAL_MEMORY_WORKSPACE_ID, "caption-style")?.count,
    ).toBe(1);
    expect(
      existsSync(path.join(root.dir, ".ralphy", "memory", "caption-style.md")),
    ).toBe(false);

    const recalled = await recall({ ws: workspace.id, full: true });
    expect(recalled).toMatchObject({
      count: 1,
      workspaceCount: 1,
      globalCount: 0,
      overriddenGlobalSlugs: ["caption-style"],
    });
    expect(recalled.entries[0]).toMatchObject({
      slug: "caption-style",
      tier: "workspace",
      workspace: "acme",
    });
    expect(recalled.entries[0]?.body).toContain(
      "Use flat declarative captions for Acme.",
    );
  });

  test("keeps the reserved global Memory workspace out of workspace listings", () => {
    const ids = listWorkspaces({ limit: 50 }).items.map((item) => item.id);

    expect(ids).toContain(workspace.id);
    expect(ids).not.toContain(GLOBAL_MEMORY_WORKSPACE_ID);
  });

  test("parses structured rule bodies and preserves append-only history", async () => {
    const first = await writeEntry({
      ref: { tier: "workspace", ws: workspace.id },
      status: "active",
      slug: "voice",
      type: "style",
      text: [
        "## Rule",
        "Use plain language.",
        "",
        "## Why",
        "Readers should understand it once.",
        "",
        "## How to apply",
        "- Prefer concrete verbs.",
        "",
        "## Does NOT apply to",
        "- Verbatim customer quotes.",
      ].join("\n"),
    });
    await writeEntry({
      ref: { tier: "workspace", ws: workspace.id },
      status: "proposed",
      slug: "voice",
      type: "style",
      text: "Use shorter sentences.",
    });

    expect(parseMemoryBody(first.entry.body)).toEqual({
      rule: "Use plain language.",
      why: "Readers should understand it once.",
      howToApply: ["Prefer concrete verbs."],
      doesNotApplyTo: ["Verbatim customer quotes."],
    });
    expect(memoryQualityFlags(first.entry.body)).toEqual([]);
    expect(await listEntryHistory(first.entry.id!)).toMatchObject([
      { version: 2, status: "proposed" },
      { version: 1, status: "active" },
    ]);
  });
});

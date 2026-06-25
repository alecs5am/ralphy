// Agent context-inbox (#489) — the CLI read side of the Studio → agent handoff.
//
// Covers:
//   1. InboxPack schema validation (defaults, required fields, reject bad).
//   2. listInbox / loadInbox over a seeded temp .ralphy tree (run + project
//      scopes), newest-first, scope filtering, and a missing id → null.
// NO network, NO model calls.

import { describe, test, expect, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { workspaceDir, runDir } from "../../cli/lib/paths.js";
import { parseInboxPack, AGENT_INBOX_DIR, INBOX_ACTIONS } from "../../cli/lib/schemas/agent-inbox.js";
import { listInbox, loadInbox } from "../../cli/lib/agent-inbox.js";

let tmp: TmpRoot;
afterEach(() => tmp?.cleanup());

function seedWorkspace(slug = "default"): void {
  tmp = makeTmpRoot("ralphy-inbox");
  const dir = workspaceDir(slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "workspace.json"), JSON.stringify({ slug }));
}

function writePack(scopeDir: string, pack: Record<string, unknown>): void {
  const dir = path.join(scopeDir, AGENT_INBOX_DIR);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${pack.id}.json`), JSON.stringify(pack));
  fs.writeFileSync(path.join(dir, `${pack.id}.md`), `# ${pack.action}\n`);
}

const pack = (id: string, over: Record<string, unknown> = {}) => ({
  version: 1,
  kind: "agent-inbox",
  id,
  action: "repair",
  createdAt: `2026-06-25T0${id.length % 9}:00:00.000Z`,
  workspace: "default",
  run: null,
  project: "demo-001",
  selected: [{ type: "artifact", ref: "artifacts/images/hero.png", path: ".ralphy/x/hero.png", tags: ["weak-hook"] }],
  tags: ["weak-hook"],
  note: "soft",
  requestedOutcome: "stronger hook",
  ...over,
});

describe("InboxPack schema", () => {
  test("parses a full pack and applies defaults", () => {
    const p = parseInboxPack({ id: "x-repair", action: "repair", workspace: "default" });
    expect(p.kind).toBe("agent-inbox");
    expect(p.version).toBe(1);
    expect(p.run).toBeNull();
    expect(p.selected).toEqual([]);
    expect(p.tags).toEqual([]);
    expect(typeof p.createdAt).toBe("string");
  });

  test("rejects an unknown action and a missing id", () => {
    expect(() => parseInboxPack({ id: "x", action: "nuke", workspace: "default" })).toThrow();
    expect(() => parseInboxPack({ action: "repair", workspace: "default" })).toThrow();
  });

  test("the action vocabulary matches the documented set", () => {
    expect([...INBOX_ACTIONS].sort()).toEqual(["approve", "compare", "publish", "repair", "use-as-reference"]);
  });
});

describe("listInbox / loadInbox", () => {
  test("lists packs across run + project scopes, newest first", () => {
    seedWorkspace();
    writePack(path.join(workspaceDir("default"), "projects", "demo-001"), pack("2026-01-01T00-00-00-aaa-repair", { createdAt: "2026-01-01T00:00:00.000Z", project: "demo-001", run: null }));
    writePack(runDir("default", "farm-1"), pack("2026-02-02T00-00-00-bbb-approve", { action: "approve", createdAt: "2026-02-02T00:00:00.000Z", project: null, run: "farm-1" }));

    const rows = listInbox({ workspace: "default" });
    expect(rows.length).toBe(2);
    // Newest (Feb) first.
    expect(rows[0].scope).toBe("run");
    expect(rows[0].action).toBe("approve");
    expect(rows[1].scope).toBe("project");
  });

  test("--project scope skips runs; --run scope skips projects", () => {
    seedWorkspace();
    writePack(path.join(workspaceDir("default"), "projects", "demo-001"), pack("p-repair", { project: "demo-001", run: null }));
    writePack(runDir("default", "farm-1"), pack("r-approve", { action: "approve", project: null, run: "farm-1" }));

    expect(listInbox({ workspace: "default", project: "demo-001" }).map((r) => r.scope)).toEqual(["project"]);
    expect(listInbox({ workspace: "default", run: "farm-1" }).map((r) => r.scope)).toEqual(["run"]);
  });

  test("loadInbox finds a pack by id, returns null for an unknown id", () => {
    seedWorkspace();
    writePack(path.join(workspaceDir("default"), "projects", "demo-001"), pack("found-repair", { project: "demo-001", run: null }));
    const found = loadInbox("found-repair", { workspace: "default" });
    expect(found).not.toBeNull();
    expect(found!.pack.action).toBe("repair");
    expect(found!.scope).toBe("project");
    expect(loadInbox("nope", { workspace: "default" })).toBeNull();
  });
});

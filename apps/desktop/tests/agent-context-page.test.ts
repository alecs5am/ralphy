import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { readContextPage, type ContextLayerId, type ContextRowDto } from "../electron/agent/context-page";

async function home(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "ralphy-context-page-"));
}

const layer = (page: Awaited<ReturnType<typeof readContextPage>>, id: ContextLayerId) =>
  page.layers.find((band) => band.id === id)!;
const row = (rows: readonly ContextRowDto[], label: string) =>
  rows.find((candidate) => candidate.label.startsWith(label))!;

describe("the Context page's five layers", () => {
  test("measures the files that are there and calls the rest absent, not broken", async () => {
    const root = await home();
    const cwd = await home();
    await mkdir(join(root, ".codex", "skills", "one"), { recursive: true });
    await symlink(join(root, ".codex", "skills", "one"), join(root, ".codex", "skills", "shared"));
    await writeFile(join(root, ".codex", "AGENTS.md"), "# tools\n");

    const page = await readContextPage({
      provider: "codex",
      rootPath: "/library/.ralphy",
      cwd,
      home: root,
      cli: "/Applications/Ralphy.app/Contents/Resources/bin/ralphy",
    });

    const machine = layer(page, "machine");
    expect(row(machine.rows, "Your Codex instructions")).toMatchObject({ presence: "every-turn", bytes: 8 });
    // Nothing was written in the working directory, and no config file exists.
    expect(row(machine.rows, "AGENTS.md in").presence).toBe("absent");
    expect(row(machine.rows, "Codex configuration").presence).toBe("absent");
    /* The provider's own prompt is in every turn and unreadable, so it carries no figure and no
       action: an estimate here would be the one invented number on the page. */
    expect(row(machine.rows, "Codex's own system prompt")).toMatchObject({
      presence: "sealed",
      bytes: null,
      action: null,
    });
    expect(machine.warning).toContain("every other agent on this Mac");

    // A symlinked skill is shared with every tool that reads its target, and says so.
    const skills = layer(page, "skills");
    expect(skills.count).toBe(2);
    expect(row(skills.rows, "shared").tag).toBe("SYMLINK · SHARED");
    expect(row(skills.rows, "one").tag).toBe("ON DEMAND");
  });

  test("states the missing prompt pack as a defect rather than describing one", async () => {
    const page = await readContextPage({
      provider: "codex",
      rootPath: join(await home(), ".ralphy"),
      cwd: await home(),
      home: await home(),
      cli: "/bin/ralphy",
    });
    const ralphy = layer(page, "ralphy");
    expect(row(ralphy.rows, "Bundled prompt pack")).toMatchObject({ presence: "defect", tag: "NOT SHIPPED", action: null });
    // The preamble is real, so its row carries the bytes of the text this chat actually sends.
    expect(row(ralphy.rows, "Injected preamble").bytes).toBe(Buffer.byteLength(page.preamble));
  });

  test("marks a workspace document shadowed when the project owns its slug", async () => {
    const page = await readContextPage({
      provider: "codex",
      rootPath: "/library/.ralphy",
      cwd: await home(),
      home: await home(),
      projectName: "UX Tester",
      workspaceDocuments: [
        { id: "d1", slug: "style-guide", title: "Style guide", kind: "style-guide", revisions: 2 },
        { id: "d2", slug: "cast", title: "Cast and locations", kind: "note", revisions: 1 },
      ],
      projectDocuments: [{ id: "d3", slug: "cast", title: "Cast and locations", kind: "note", revisions: 1 }],
    });
    const workspace = layer(page, "workspace");
    expect(row(workspace.rows, "Style guide").presence).toBe("on-demand");
    expect(row(workspace.rows, "Cast and locations")).toMatchObject({
      presence: "shadowed",
      action: { label: "See winner", kind: "document", target: "d2" },
    });
    expect(layer(page, "project").note).toContain("UX Tester");
  });

  test("keeps the file-backed layers readable when Core is unreachable", async () => {
    const page = await readContextPage({
      provider: "claude",
      rootPath: "/library/.ralphy",
      cwd: await home(),
      home: await home(),
      workspaceDocuments: null,
      projectDocuments: null,
      coreUnavailable: "the bridge did not answer",
    });
    /* The bands fail separately because their sources differ: Machine and Ralphy are files, and a
       store being down is not a reason to draw them blank. */
    expect(layer(page, "workspace").unavailable).toBe("the bridge did not answer");
    expect(layer(page, "machine").unavailable).toBeNull();
    expect(layer(page, "ralphy").unavailable).toBeNull();
    expect(row(layer(page, "machine").rows, "Claude's own system prompt").presence).toBe("sealed");
  });
});

import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { readContextDocument, references } from "../electron/agent/context-document";

describe("references", () => {
  it("picks the places an instruction file names, and nothing else", () => {
    expect(references("Read `docs/playbooks/render.md` before acting.")).toEqual(["docs/playbooks/render.md"]);
    expect(references("Playbooks live under docs/playbooks/.")).toEqual(["docs/playbooks/"]);
    /* A bare slash, a one-segment folder and a URL are noise: reporting them as places would make
       the page claim broken links the operator never wrote. */
    expect(references("Use / and .codegraph/ and https://example.com/a/b.md")).toEqual([]);
  });
});

/** A home and a working directory with nothing in them but the two files under test. */
async function fixture(block: string): Promise<{ home: string; cwd: string }> {
  const home = await mkdtemp(join(tmpdir(), "ralphy-context-"));
  const cwd = join(home, "repo");
  await mkdir(join(home, ".codex"), { recursive: true });
  await mkdir(cwd, { recursive: true });
  await writeFile(join(home, ".codex", "AGENTS.md"), `Read own/notes.md first.\n\n${block}`);
  return { home, cwd };
}

const read = (input: { home: string; cwd: string }) => readContextDocument({
  provider: "codex",
  home: input.home,
  cwd: input.cwd,
  rootPath: join(input.cwd, "library"),
  preamble: "[Ralphy Media context]\n[/Ralphy Media context]",
});

describe("readContextDocument", () => {
  it("calls an unresolved place a defect only when Ralphy's own block named it", async () => {
    const ours = await read(await fixture(
      "<!-- ralphy:start v=1 -->\nRead `<repo>/AGENTS.md` and docs/playbooks/.\n<!-- ralphy:end -->",
    ));
    const theirs = await read(await fixture("Also read docs/playbooks/."));

    /* Ralphy promised routing that does not exist, so the page says so in the alert tone. */
    expect(ours.filter((block) => block.defect !== null).map((block) => block.title))
      .toEqual(expect.arrayContaining(["<repo>/AGENTS.md", "docs/playbooks/"]));
    /* The operator naming a file they have not written yet is normal, and never red. */
    expect(theirs.every((block) => block.defect === null)).toBe(true);
    expect(theirs.find((block) => block.title === "docs/playbooks/")?.rail.label).toBe("Not written");
  });

  it("opens on the instruction chain, never on the provider's sealed prompt", async () => {
    const blocks = await read(await fixture("Nothing else here."));
    expect(blocks.some((block) => block.id === "sealed")).toBe(false);
    expect(blocks[0]?.title.endsWith(join(".codex", "AGENTS.md"))).toBe(true);
  });
});

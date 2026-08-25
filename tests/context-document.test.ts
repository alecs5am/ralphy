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
    /* A placeholder is a shape, not a place. `<repo>/AGENTS.md` resolved against
       whatever directory named it produced a broken link nobody wrote. */
    expect(references("Read `<repo>/AGENTS.md` and templates/<slug>/TEMPLATE.md")).toEqual([]);
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

/** A home whose instruction file names a directory that exists, with two files in it. */
async function fixture_with_pack(): Promise<{ home: string; cwd: string }> {
  const made = await fixture("Playbooks live under prompts/docs/playbooks/.");
  const dir = join(made.home, ".codex", "prompts", "docs", "playbooks");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "core.md"), "# core\n");
  await writeFile(join(dir, "editor.md"), "# editor\n");
  return made;
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

    /* Ralphy promised routing that does not exist, so the page says so in the alert tone, on the
       block that made the promise -- and it names the place, because a place that is not there is
       not a block of its own. The placeholder is not named: it never claimed to be a path. */
    const flagged = ours.filter((block) => block.defect !== null);
    expect(flagged.map((block) => block.title)).toEqual(["Ralphy's own block, inside the file above"]);
    expect(flagged[0]?.defect).toContain("docs/playbooks/");
    expect(flagged[0]?.defect).not.toContain("<repo>");
    /* The operator naming a file they have not written yet is normal, and never red. */
    expect(theirs.every((block) => block.defect === null)).toBe(true);
  });

  it("keeps only what can be read, and every link it does keep carries a path", async () => {
    const blocks = await read(await fixture_with_pack());
    /* A directory and a missing file cannot be opened, so neither is a block: each was a header
       over a sentence saying there was nothing under it. What a directory holds stays reachable
       where the prose names it. */
    expect(blocks.every((block) => block.body !== null)).toBe(true);
    expect(blocks.some((block) => block.title.endsWith("playbooks/"))).toBe(false);
    const named = blocks.flatMap((block) => block.links);
    expect(named.length).toBeGreaterThan(0);
    expect(named.every((link) => link.path !== null || link.note === "not there")).toBe(true);
  });

  it("opens on the instruction chain, never on the provider's sealed prompt", async () => {
    const blocks = await read(await fixture("Nothing else here."));
    expect(blocks.some((block) => block.id === "sealed")).toBe(false);
    expect(blocks[0]?.title.endsWith(join(".codex", "AGENTS.md"))).toBe(true);
  });
});

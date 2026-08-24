import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { providerHome, ralphyPreamble, readAgentContext } from "../electron/agent/context";

async function home(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "ralphy-context-"));
}

describe("what a chat can reach", () => {
  test("names the provider's own files, not the other one's", () => {
    const codex = providerHome("codex", "/h");
    const claude = providerHome("claude", "/h");
    expect(codex.instructions).toBe("/h/.codex/AGENTS.md");
    expect(codex.projectInstructions).toBe("AGENTS.md");
    expect(claude.instructions).toBe("/h/.claude/CLAUDE.md");
    expect(claude.projectInstructions).toBe("CLAUDE.md");
    // OpenRouter runs through the Codex binary, so it reads Codex's files.
    expect(providerHome("openrouter", "/h").config).toBe("/h/.codex/config.toml");
  });

  test("reports a file as absent rather than as a promise", async () => {
    const root = await home();
    const cwd = await home();
    await mkdir(join(root, ".codex", "skills", "one"), { recursive: true });
    await mkdir(join(root, ".codex", "skills", "two"), { recursive: true });
    await writeFile(join(root, ".codex", "AGENTS.md"), "# tools\n");

    const context = await readAgentContext({
      provider: "codex",
      rootPath: "/library/.ralphy",
      projectPath: "/library/.ralphy/buckets/w/projects/p",
      cwd,
      home: root,
    });
    const by = (label: string) => context.entries.find((entry) => entry.label.startsWith(label))!;
    expect(by("Your instructions").present).toBe(true);
    expect(by("Skills").detail).toBe("2 installed · loaded when one is needed");
    // Nothing was written in the working directory, and no config file exists.
    expect(by("AGENTS.md in").present).toBe(false);
    expect(by("Provider configuration").present).toBe(false);

    // The preamble names what is really there, absolutely -- and never what is not.
    expect(context.preamble).toContain(`Instructions already in your context: ${join(root, ".codex", "AGENTS.md")}`);
    expect(context.preamble).toContain(`Working directory: ${cwd}`);
    expect(context.preamble).not.toContain("this repository");
  });

  test("says nothing about instructions when there are none", () => {
    const preamble = ralphyPreamble({
      rootPath: "/library/.ralphy",
      projectPath: null,
      cwd: "/library",
      instructions: [],
    });
    expect(preamble).toContain("Active project: none selected");
    expect(preamble).not.toContain("Instructions already in your context");
    expect(preamble.startsWith("[Ralphy Media context]")).toBe(true);
    expect(preamble.endsWith("[/Ralphy Media context]")).toBe(true);
  });
});

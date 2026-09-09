import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readMarketplacePackCatalog,
  readMarketplacePackDocument,
} from "../electron/marketplace-pack";

let bundled = "";

async function pack(catalog: unknown, documents: Record<string, string> = {}) {
  await writeFile(join(bundled, "catalog.json"), JSON.stringify(catalog));
  for (const [path, body] of Object.entries(documents)) {
    await mkdir(join(bundled, path, ".."), { recursive: true });
    await writeFile(join(bundled, path), body);
  }
}

const entry = (over: Record<string, unknown> = {}) => ({
  id: "skill:editor",
  category: "skill",
  slug: "editor",
  title: "Editor",
  summary: "Composition and render craft.",
  path: ".agents/skills/editor/SKILL.md",
  tags: ["user"],
  ...over,
});

beforeEach(async () => {
  bundled = await mkdtemp(join(tmpdir(), "ralphy-pack-"));
});

afterEach(async () => {
  await rm(bundled, { recursive: true, force: true });
});

describe("bundled Marketplace catalog", () => {
  test("projects well-formed entries and states its own absence", async () => {
    const missing = await readMarketplacePackCatalog(bundled);
    expect(missing).toMatchObject({ entries: [], cliVersion: null });
    expect(missing.unavailable).toBe("This build carries no bundled catalog");

    await writeFile(join(bundled, "catalog.json"), "{ not json");
    expect((await readMarketplacePackCatalog(bundled)).unavailable).toBe("The bundled catalog could not be read");

    await pack({ catalogVersion: 1, cliVersion: "0.3.0", entries: [entry()] });
    const catalog = await readMarketplacePackCatalog(bundled);
    expect(catalog).toMatchObject({ schemaVersion: 1, cliVersion: "0.3.0", unavailable: null });
    expect(catalog.entries).toEqual([{
      id: "skill:editor",
      category: "skill",
      slug: "editor",
      title: "Editor",
      summary: "Composition and render craft.",
      path: ".agents/skills/editor/SKILL.md",
      tags: ["user"],
    }]);
  });

  test("drops rows that could point outside the pack, and keeps honest bodyless rows", async () => {
    await pack({
      catalogVersion: 1,
      cliVersion: "0.3.0",
      entries: [
        entry(),
        /* A path that leaves the pack, an absolute one, and a Windows-separated
           one are all the same defect: a row that could read someone's disk. */
        entry({ id: "skill:escape", slug: "escape", path: "../../../etc/passwd" }),
        entry({ id: "skill:absolute", slug: "absolute", path: "/etc/passwd" }),
        entry({ id: "skill:backslash", slug: "backslash", path: ".agents\\skills\\x\\SKILL.md" }),
        entry({ id: "skill:dot", slug: "dot", path: "docs/./playbooks/meta.md" }),
        entry({ id: "unknown:thing", category: "shell", slug: "thing", path: null }),
        /* Not a defect: the templates index names rows it has no body for. */
        entry({ id: "template:clean-cut", category: "template", slug: "clean-cut", path: null }),
        /* A duplicate id would give two rows one detail route. */
        entry({ id: "skill:editor", slug: "editor-again" }),
      ],
    });
    const catalog = await readMarketplacePackCatalog(bundled);
    expect(catalog.entries.map(({ id }) => id)).toEqual(["skill:editor", "template:clean-cut"]);
  });

  test("resolves a document by entry id only, never by a path the caller supplies", async () => {
    await pack(
      {
        catalogVersion: 1,
        cliVersion: "0.3.0",
        entries: [entry(), entry({ id: "template:clean-cut", category: "template", slug: "clean-cut", path: null })],
      },
      { ".agents/skills/editor/SKILL.md": "# Editor playbook", "docs/secret.md": "not indexed" },
    );

    expect(await readMarketplacePackDocument(bundled, "skill:editor")).toMatchObject({
      id: "skill:editor",
      path: ".agents/skills/editor/SKILL.md",
      markdown: "# Editor playbook",
      truncated: false,
    });
    /* Indexed but bodyless, unindexed, and outright absent all read the same
       from outside: nothing this catalog named is reachable. */
    expect(await readMarketplacePackDocument(bundled, "template:clean-cut")).toBeNull();
    expect(await readMarketplacePackDocument(bundled, "docs/secret.md")).toBeNull();
    expect(await readMarketplacePackDocument(bundled, "skill:absent")).toBeNull();
  });
});

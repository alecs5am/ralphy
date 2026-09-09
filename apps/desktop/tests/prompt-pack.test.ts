import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { bundledPack, installPack, packRoot, readPackState } from "../electron/agent/prompt-pack";

/** A bundled pack of two files, with the manifest the export verb writes. */
async function bundle(files: Record<string, string>): Promise<string> {
  const { createHash } = await import("node:crypto");
  const dir = await mkdtemp(join(tmpdir(), "ralphy-bundle-"));
  const manifest = { packVersion: 1, cliVersion: "0.3.0", totalBytes: 0, files: [] as unknown[] };
  for (const [path, body] of Object.entries(files)) {
    await mkdir(join(dir, path, ".."), { recursive: true });
    await writeFile(join(dir, path), body);
    manifest.totalBytes += Buffer.byteLength(body);
    manifest.files.push({ path, bytes: Buffer.byteLength(body), sha256: createHash("sha256").update(body).digest("hex") });
  }
  await writeFile(join(dir, "manifest.json"), JSON.stringify(manifest));
  return dir;
}

describe("prompt pack", () => {
  it("installs into the library and reports what it holds", async () => {
    const source = await bundle({ "AGENTS.md": "# router\n", "docs/playbooks/core.md": "# core\n" });
    const library = await mkdtemp(join(tmpdir(), "ralphy-lib-"));

    const state = await installPack(library, source);
    expect(state.installed).toBe(true);
    expect(state.files).toBe(2);
    expect(await readFile(join(packRoot(library), "docs", "playbooks", "core.md"), "utf8")).toBe("# core\n");
  });

  it("leaves an unchanged file alone and drops one the bundle stopped shipping", async () => {
    const library = await mkdtemp(join(tmpdir(), "ralphy-lib-"));
    await installPack(library, await bundle({ "AGENTS.md": "# router\n", "docs/old.md": "# old\n" }));
    const before = await stat(join(packRoot(library), "AGENTS.md"));

    await installPack(library, await bundle({ "AGENTS.md": "# router\n" }));
    /* Same digest, so the file is not rewritten: a reinstall must not move the
       mtime of a playbook nothing changed. */
    expect((await stat(join(packRoot(library), "AGENTS.md"))).mtimeMs).toBe(before.mtimeMs);
    /* A playbook the router no longer names is worse than a missing one -- the
       agent cannot tell it is stale. */
    await expect(stat(join(packRoot(library), "docs", "old.md"))).rejects.toThrow();
  });

  it("says so when the build shipped no pack, instead of installing nothing quietly", async () => {
    const library = await mkdtemp(join(tmpdir(), "ralphy-lib-"));
    const state = await installPack(library, join(library, "no-pack-here"));
    expect(state.installed).toBe(false);
    expect(state.unavailable).toContain("no-pack-here");
  });

  it("reads the pack from resources in development and from the app's resources when packaged", () => {
    expect(bundledPack("/res", "/app", true)).toBe("/res/prompt-pack");
    expect(bundledPack("/res", "/app", false)).toBe("/app/resources/prompt-pack");
  });

  it("finds the pack this build actually ships", async () => {
    /* The vendored copy is committed, so a build that lost it fails here rather
       than on a user's machine with a routing block pointing at nothing. */
    const state = await readPackState(await mkdtemp(join(tmpdir(), "ralphy-lib-")), bundledPack("", process.cwd(), false));
    expect(state.unavailable).toBeNull();
  });
});

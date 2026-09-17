import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { exportWorkspaceFile, importWorkspaceFile } from "../electron/workspace-transfer";
import type { RalphyBridgeClient } from "../electron/ralphy/client";

test("workspace transfer validates its source, saves atomically and fences a changed library", async () => {
  const temp = await mkdtemp(join(tmpdir(), "workspace-transfer-"));
  const root = join(temp, ".ralphy");
  const source = join(root, "archive.tar");
  const destination = join(temp, "My workspace.tar");
  await mkdir(join(root, "workspaces"), { recursive: true });
  await writeFile(source, "complete archive");
  await writeFile(destination, "previous backup");
  let stale = false;
  const request = vi.fn(async (method: string) => {
    if (method === "workspace.show") return { slug: "my-workspace" };
    if (method === "workspace.export") return { packageObjectId: "obj_archive" };
    return { absolutePath: source, bytes: 16, mime: "application/vnd.ralphy.workspace+tar" };
  }) as unknown as RalphyBridgeClient["request"];
  const input = { root, workspaceId: "ws_demo", request, choose: async () => destination,
    assertCurrent: () => { if (stale) throw new Error("Library changed"); } };
  try {
    expect(await exportWorkspaceFile(input)).toEqual({ fileName: "My workspace.tar" });
    expect(await readFile(destination, "utf8")).toBe("complete archive");
    await expect(exportWorkspaceFile({ ...input, choose: async () => join(root, "..hidden.tar") })).rejects.toThrow("outside");
    stale = true;
    await expect(exportWorkspaceFile(input)).rejects.toThrow("Library changed");
    expect(await readFile(destination, "utf8")).toBe("complete archive");
    expect(await exportWorkspaceFile({ ...input, choose: async () => null })).toBeNull();
    const cli = vi.fn(async (_args: string[]) => ({ workspaceId: "ws_imported" }));
    expect(await importWorkspaceFile({ cli, choose: async () => destination, assertCurrent: () => {} })).toEqual({ workspaceId: "ws_imported" });
    expect(cli.mock.calls[0]?.[0]).toEqual(["workspace", "import", "--file", destination, "--idempotency-key", expect.any(String)]);
    await expect(importWorkspaceFile({ cli: async () => ({ workspaceId: "../escape" }), choose: async () => destination, assertCurrent: () => {} })).rejects.toThrow("did not return a workspace");
  } finally { await rm(temp, { recursive: true, force: true }); }
});

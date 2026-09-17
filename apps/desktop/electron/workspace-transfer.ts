import { constants } from "node:fs";
import { copyFile, realpath, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, join, relative, isAbsolute, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { resolveContainedPath } from "./media/catalog";
import type { RalphyBridgeClient } from "./ralphy/client";
import type { CanvasCli } from "./canvas/runtime-cli";

export async function exportWorkspaceFile(input: {
  root: string; workspaceId: string; request: RalphyBridgeClient["request"];
  choose(name: string): Promise<string | null>; assertCurrent(): void;
}) {
  const { root, workspaceId, request, assertCurrent } = input;
  const workspace = await request("workspace.show", { context: { workspaceId }, workspaceId });
  const destination = await input.choose(`${workspace.slug}.workspace.tar`);
  if (!destination) return null;
  assertCurrent();
  const target = join(await realpath(dirname(destination)), basename(destination));
  const rel = relative(await realpath(root), target);
  if (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)) throw Object.assign(new Error("Save the archive outside the active library folder."), { code: "E_VALIDATION_FAILED" });
  const exported = await request("workspace.export", { context: { workspaceId }, workspaceId, idempotencyKey: randomUUID() });
  assertCurrent();
  const locator = await request("locator.resolve", { context: { workspaceId }, target: { type: "object", id: exported.packageObjectId }, purpose: "finder" });
  const source = await resolveContainedPath(root, locator.absolutePath);
  const info = await stat(source);
  if (!info.isFile() || info.size !== locator.bytes || locator.mime !== "application/vnd.ralphy.workspace+tar") throw new Error("Invalid workspace archive");
  const temporary = join(dirname(target), `.${basename(target)}.${randomUUID()}.tmp`);
  try {
    await copyFile(source, temporary, constants.COPYFILE_EXCL);
    assertCurrent();
    await rename(temporary, target);
  } finally { await rm(temporary, { force: true }); }
  return { fileName: basename(target) };
}

export async function importWorkspaceFile(input: { cli: CanvasCli; choose(): Promise<string | null>; assertCurrent(): void }) {
  const file = await input.choose();
  if (!file) return null;
  input.assertCurrent();
  const result = await input.cli(["workspace", "import", "--file", file, "--idempotency-key", randomUUID()]) as { workspaceId?: unknown };
  input.assertCurrent();
  if (typeof result?.workspaceId !== "string" || !/^ws_[\w-]+$/.test(result.workspaceId)) throw new Error("The archive did not return a workspace");
  return { workspaceId: result.workspaceId };
}

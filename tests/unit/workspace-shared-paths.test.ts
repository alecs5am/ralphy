import { afterEach, expect, test } from "bun:test";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import {
  workspaceLogsDir,
  workspaceSharedAssetKindDir,
  workspaceSharedAssetsDir,
  workspaceUnitsDir,
} from "../../cli/lib/paths";

let tmp: TmpRoot;
afterEach(() => tmp?.cleanup());

test("resolves workspace-owned asset, log, and unit paths", () => {
  tmp = makeTmpRoot("workspace-paths");
  const root = path.join(tmp.dir, ".ralphy", "workspaces", "acme");

  expect(workspaceSharedAssetsDir("acme")).toBe(path.join(root, "shared", "assets"));
  expect(workspaceSharedAssetKindDir("acme", "images")).toBe(
    path.join(root, "shared", "assets", "images"),
  );
  expect(workspaceLogsDir("acme")).toBe(path.join(root, "logs"));
  expect(workspaceUnitsDir("acme")).toBe(path.join(root, "units"));
});

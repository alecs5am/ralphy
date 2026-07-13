import { afterEach, expect, test } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import {
  destinationAssetPath,
  destinationInputFields,
  generationDestination,
} from "../../cli/lib/generation-destination";
import { logGeneration } from "../../cli/lib/gen-log";

let tmp: TmpRoot;
afterEach(() => tmp?.cleanup());

test("keeps project output paths unchanged", () => {
  tmp = makeTmpRoot("generation-project-destination");
  const destination = generationDestination({ projectId: "episode-001" });
  expect(destinationAssetPath(destination, "images", "avatar.png")).toBe(
    path.join(
      tmp.dir,
      ".ralphy",
      "workspaces",
      "default",
      "projects",
      "episode-001",
      "artifacts",
      "images",
      "avatar.png",
    ),
  );
  expect(destinationInputFields(destination)).toEqual({ project: "episode-001" });
});

test("routes workspace output into shared assets", () => {
  tmp = makeTmpRoot("generation-workspace-destination");
  const destination = generationDestination({ workspaceId: "acme" });
  expect(destinationAssetPath(destination, "images", "avatar.png")).toBe(
    path.join(
      tmp.dir,
      ".ralphy",
      "workspaces",
      "acme",
      "shared",
      "assets",
      "images",
      "avatar.png",
    ),
  );
  expect(destinationInputFields(destination)).toEqual({ workspace: "acme" });
});

test("requires exactly one generation destination", () => {
  expect(() => generationDestination({})).toThrow("exactly one");
  expect(() => generationDestination({ projectId: "p", workspaceId: "w" })).toThrow(
    "exactly one",
  );
});

test("writes workspace generation logs beside the workspace", async () => {
  tmp = makeTmpRoot("generation-workspace-log");
  await logGeneration(
    { kind: "workspace", id: "acme" },
    {
      provider: "openrouter",
      model: "test/image",
      endpoint: "test/image",
      kind: "image",
      input: { slot: "avatar", workspace: "acme" },
      status: "ok",
    },
  );

  const file = path.join(
    tmp.dir,
    ".ralphy",
    "workspaces",
    "acme",
    "logs",
    "generations.jsonl",
  );
  expect((await fs.readFile(file, "utf8")).trim()).toContain('"workspace":"acme"');
});

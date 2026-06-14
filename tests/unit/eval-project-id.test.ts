// Project-id auto-detection for `ralphy eval` (#411).
//
// The pre-#411 regex keyed on the stale `/workspace/projects/<id>/` layout and
// never matched the current `.ralphy/workspaces/<ws>/projects/<id>/render/...`
// tree. `projectIdFromPath` now:
//   • prefers the registry (longest registered project dir that contains the
//     path — respects `ralphy project move`),
//   • falls back to the CURRENT layout regex,
//   • then the legacy `workspace/projects/<id>/` shape,
//   • returns null for a non-project path.
//
// No live LLM / network / ffmpeg. English-only fixtures.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import { projectIdFromPath, projectDir } from "../../cli/lib/paths";

let tmp: TmpRoot;

function seedRegistry(projects: Record<string, { workspace: string }>) {
  const regPath = path.join(tmp.dir, ".ralphy", "registry.json");
  fs.mkdirSync(path.dirname(regPath), { recursive: true });
  const map: Record<string, unknown> = {};
  for (const [id, v] of Object.entries(projects)) map[id] = { id, workspace: v.workspace };
  fs.writeFileSync(regPath, JSON.stringify({ projects: map }));
}

beforeEach(() => {
  tmp = makeTmpRoot("ralphy-eval-pid-411");
});
afterEach(() => {
  tmp.cleanup();
});

describe("projectIdFromPath — current .ralphy layout (#411)", () => {
  test(".ralphy/workspaces/<ws>/projects/<id>/render/final.mp4 → <id> (via registry)", () => {
    const id = "spring-2026-001";
    seedRegistry({ [id]: { workspace: "default" } });
    const video = path.join(projectDir(id), "render", "final.mp4");
    expect(projectIdFromPath(video)).toBe(id);
  });

  test("current-layout path resolves WITHOUT a registry entry (regex fallback)", () => {
    // No registry seeded — the .ralphy/workspaces/<ws>/projects/<id>/ regex must
    // still extract the id (a stray mp4 in a project tree).
    const video = path.join(
      tmp.dir,
      ".ralphy",
      "workspaces",
      "client-acme",
      "projects",
      "launch-009",
      "render",
      "final.mp4",
    );
    fs.mkdirSync(path.dirname(video), { recursive: true });
    fs.writeFileSync(video, "x");
    expect(projectIdFromPath(video)).toBe("launch-009");
  });

  test("registry respects a moved project (workspace != id's default home)", () => {
    // Registry says the project lives in `studio-b`; the dir is under studio-b.
    const id = "moved-002";
    seedRegistry({ [id]: { workspace: "studio-b" } });
    const moved = path.join(projectDir(id), "render", "final.mp4");
    expect(moved).toContain(path.join("workspaces", "studio-b", "projects", id));
    expect(projectIdFromPath(moved)).toBe(id);
  });
});

describe("projectIdFromPath — legacy + negative", () => {
  test("legacy workspace/projects/<id>/ path still resolves (fallback)", () => {
    const video = path.join(tmp.dir, "workspace", "projects", "old-007", "render", "final.mp4");
    fs.mkdirSync(path.dirname(video), { recursive: true });
    fs.writeFileSync(video, "x");
    expect(projectIdFromPath(video)).toBe("old-007");
  });

  test("non-project path → null", () => {
    const stray = path.join(tmp.dir, "Downloads", "some-clip.mp4");
    fs.mkdirSync(path.dirname(stray), { recursive: true });
    fs.writeFileSync(stray, "x");
    expect(projectIdFromPath(stray)).toBeNull();
  });

  test("a bare directory that isn't a project tree → null", () => {
    expect(projectIdFromPath(path.join(tmp.dir, "nope"))).toBeNull();
  });
});

// Studio API smoke tests (#107) — fixture-backed, no network beyond
// 127.0.0.1, no dependency on the real data root.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { startStudio } from "../server/index.js";
import { listArtifacts, listWorkspaces, safeProjectFile, mediaType } from "../server/lib.js";

let tmpRoot: string;
let studio: ReturnType<typeof startStudio>;
let base: string;

function seed(root: string) {
  const proj = path.join(root, ".ralphy", "workspaces", "default", "projects", "fixture-001");
  fs.mkdirSync(path.join(proj, "artifacts", "images"), { recursive: true });
  fs.mkdirSync(path.join(proj, "artifacts", "voiceover"), { recursive: true });
  fs.mkdirSync(path.join(proj, "artifacts", "refs"), { recursive: true });
  fs.mkdirSync(path.join(proj, "render"), { recursive: true });
  // 1x1 PNG
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg==",
    "base64",
  );
  fs.writeFileSync(path.join(proj, "artifacts", "images", "hero.png"), png);
  fs.writeFileSync(path.join(proj, "artifacts", "images", "hero.v2.png"), png);
  fs.writeFileSync(path.join(proj, "artifacts", "voiceover", "scene-01.mp3"), "not-really-mp3");
  fs.writeFileSync(path.join(proj, "artifacts", "refs", "brand.txt"), "ref note");
  fs.writeFileSync(path.join(proj, "render", "final.mp4"), "not-really-mp4");
  fs.writeFileSync(
    path.join(root, ".ralphy", "workspaces", "default", "workspace.json"),
    JSON.stringify({ name: "Default", slug: "default" }),
  );
}

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "studio-test-"));
  seed(tmpRoot);
  process.env.RALPHY_STUDIO_ROOT = tmpRoot;
  studio = startStudio({ port: 0 });
  base = `http://127.0.0.1:${studio.server.port}`;
});

afterAll(() => {
  studio.stop();
  delete process.env.RALPHY_STUDIO_ROOT;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("lib", () => {
  test("listWorkspaces reads manifest name + project count", () => {
    const ws = listWorkspaces(path.join(tmpRoot, ".ralphy"));
    expect(ws).toEqual([{ slug: "default", name: "Default", projects: 1 }]);
  });

  test("listArtifacts groups by kind incl. render pseudo-kind, versions intact", () => {
    const all = listArtifacts(path.join(tmpRoot, ".ralphy"), "default", "fixture-001");
    const kinds = new Set(all.map((a) => a.kind));
    expect(kinds).toEqual(new Set(["images", "voiceover", "refs", "render"]));
    expect(all.filter((a) => a.kind === "images").map((a) => a.name).sort()).toEqual([
      "hero.png",
      "hero.v2.png",
    ]);
  });

  test("safeProjectFile blocks traversal and out-of-project paths", () => {
    const dr = path.join(tmpRoot, ".ralphy");
    expect(safeProjectFile(dr, "default", "fixture-001", "artifacts/images/hero.png")).toBeTruthy();
    expect(safeProjectFile(dr, "default", "fixture-001", "../../../registry.json")).toBeNull();
    expect(safeProjectFile(dr, "default", "fixture-001", "/etc/hosts")).toBeNull();
  });

  test("mediaType classification", () => {
    expect(mediaType("a.png")).toBe("image");
    expect(mediaType("a.mp4")).toBe("video");
    expect(mediaType("a.mp3")).toBe("audio");
    expect(mediaType("a.srt")).toBe("text");
    expect(mediaType("a.bin")).toBe("other");
  });
});

describe("http api", () => {
  test("GET /api/workspaces", async () => {
    const ws = await fetch(`${base}/api/workspaces`).then((r) => r.json());
    expect(ws[0].slug).toBe("default");
  });

  test("GET /api/projects lists the fixture project", async () => {
    const projects = await fetch(`${base}/api/projects?workspace=default`).then((r) => r.json());
    expect(projects.map((p: { id: string }) => p.id)).toContain("fixture-001");
  });

  test("GET /api/projects/:id/artifacts returns expected kinds", async () => {
    const arts = await fetch(`${base}/api/projects/fixture-001/artifacts?workspace=default`).then((r) => r.json());
    const kinds = new Set(arts.map((a: { kind: string }) => a.kind));
    expect(kinds).toEqual(new Set(["images", "voiceover", "refs", "render"]));
  });

  test("GET file endpoint serves bytes with content-type, blocks traversal", async () => {
    const ok = await fetch(
      `${base}/api/projects/fixture-001/file?workspace=default&path=${encodeURIComponent("artifacts/images/hero.png")}`,
    );
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/png");
    const bad = await fetch(
      `${base}/api/projects/fixture-001/file?workspace=default&path=${encodeURIComponent("../../../registry.json")}`,
    );
    expect(bad.status).toBe(404);
  });

  test("range request returns 206 partial content", async () => {
    const r = await fetch(
      `${base}/api/projects/fixture-001/file?workspace=default&path=${encodeURIComponent("render/final.mp4")}`,
      { headers: { range: "bytes=0-3" } },
    );
    expect(r.status).toBe(206);
    expect(r.headers.get("content-range")).toMatch(/^bytes 0-3\//);
    expect((await r.arrayBuffer()).byteLength).toBe(4);
  });

  test("non-GET refused (read-only server)", async () => {
    const r = await fetch(`${base}/api/workspaces`, { method: "POST" });
    expect(r.status).toBe(405);
  });

  test("static UI served at /", async () => {
    const r = await fetch(`${base}/`);
    expect(r.status).toBe(200);
    expect(await r.text()).toContain("Ralphy Studio");
  });
});

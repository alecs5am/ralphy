// `ralphy stock pull` / `stock credits` for the animated, sticker and
// reference-only sources (#597) on a temp store root.
//
// In process, with the stock fetch injected and a fake yt-dlp runner (zero
// network): a store Workspace + Project and its tree under a fresh temp root,
// the command scope set the way cli/index.ts sets it, then `stock pull` and
// `stock credits` through the real command. Checks that a Noto Lottie lands in
// artifacts/animations/ as a `data` Artifact and a Fluent sticker in
// artifacts/images/, with provenance at $0; that a second pull never
// overwrites; that a Pinterest board needs --license any, is capped by --max,
// and is recorded as reference only; and the credits sections. Then the real
// CLI entry for the validation errors that never reach the network.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { stockCmd } from "../../cli/commands/stock.js";
import { clearCommandContext, setCommandContext } from "../../cli/lib/context-state.js";
import { setRoot } from "../../cli/lib/paths.js";
import { FLUENT_EMOJI_COMMIT, clearFluentEmojiCache } from "../../cli/lib/providers/fluent-emoji.js";
import { clearNotoEmojiCache } from "../../cli/lib/providers/noto-emoji.js";
import { clearPinterestCache, setPinterestPauseForTesting, setPinterestRunnerForTesting } from "../../cli/lib/providers/pinterest.js";
import { listArtifacts } from "../../cli/lib/store/artifacts.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { listRuns } from "../../cli/lib/store/runs.js";
import { createProject, createWorkspace } from "../../cli/lib/store/scopes.js";
import { setStockFetchForTesting } from "../../cli/lib/stock/http.js";
import { setMode } from "../../cli/lib/ui.js";
import { bytesResponse, fakeYtdlp, fixtureFetch, jsonResponse, lottieJson, pngBytes, stockFixture } from "../helpers/stock-fetch.js";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");
const LOTTIE_ID = "noto-emoji:lottie:1f415";
const STICKER_ID = "fluent-emoji:3d:cat";
const BOARD = "https://www.pinterest.com/doodlestudio/sticker-ideas/";

let tmp: string;
let treeDir: string;
let scope: { workspaceId: string; projectId: string };
let lottieBody: string;
let catPng: Uint8Array;

function installFetch() {
  const metadata = stockFixture<Record<string, unknown>>("fluent-metadata.json");
  const fixture = fixtureFetch([
    { match: (u) => u.pathname === "/noto-emoji-animation/data/api.json", respond: () => jsonResponse(stockFixture("noto-emoji-index.json")) },
    { match: (u) => u.host === "fonts.gstatic.com" && u.pathname.endsWith("/1f415/lottie.json"), respond: () => bytesResponse(lottieBody, "application/json") },
    { match: (u) => u.host === "api.github.com", respond: () => jsonResponse(stockFixture("fluent-tree.json")) },
    {
      match: (u) => u.host === "cdn.jsdelivr.net" && u.pathname.endsWith("/metadata.json"),
      respond: (u) => jsonResponse(metadata[decodeURIComponent(u.pathname.split("/").slice(-2)[0]!)] ?? {}),
    },
    { match: (u) => u.host === "cdn.jsdelivr.net" && u.pathname.endsWith("/Cat/3D/cat_3d.png"), respond: () => bytesResponse(catPng, "image/png") },
    { match: (u) => u.host === "i.pinimg.com", respond: (u) => bytesResponse(pngBytes(u.pathname), "image/png") },
  ]);
  setStockFetchForTesting(fixture.fetchImpl);
  return fixture;
}

/** Run `stock <args>` in-process and return the JSON it printed. */
async function stock(args: string[]): Promise<any> {
  const printed: string[] = [];
  const originalLog = console.log;
  console.log = (...parts: unknown[]) => printed.push(parts.map(String).join(" "));
  try {
    await stockCmd().parseAsync(args, { from: "user" });
  } finally {
    console.log = originalLog;
  }
  return JSON.parse(printed.join("\n"));
}

function revisionMetadata(revisionId: string): any {
  const row = openDomainDb()
    .query<{ metadata: string | null }, [string]>("SELECT metadata_json AS metadata FROM artifact_revisions WHERE id = ?")
    .get(revisionId)!;
  return row.metadata === null ? null : JSON.parse(row.metadata);
}

function resetSources() {
  clearNotoEmojiCache();
  clearFluentEmojiCache();
  clearPinterestCache();
}

beforeEach(() => {
  setMode("json");
  resetSources();
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-stock-597-")));
  setRoot(tmp);
  fs.mkdirSync(path.join(tmp, ".ralphy"), { recursive: true });
  openDomainDb();
  const workspace = createWorkspace({ slug: "default", name: "Default" });
  const project = createProject({ workspaceId: workspace.id, slug: "alpha-001", name: "alpha-001" });
  scope = { workspaceId: workspace.id, projectId: project.id };
  treeDir = path.join(tmp, ".ralphy", "workspaces", "default", "projects", "alpha-001");
  fs.mkdirSync(treeDir, { recursive: true });
  fs.writeFileSync(path.join(treeDir, "index.html"), "<!doctype html><div id=\"root\" data-composition-id=\"main\"></div>\n");
  setCommandContext({ kind: "scope", ...scope }, { workspaceSlug: "default", projectSlug: "alpha-001" });
  lottieBody = lottieJson("dog");
  catPng = pngBytes("cat-a");
  setPinterestPauseForTesting(0);
});

afterEach(() => {
  setStockFetchForTesting(null);
  setPinterestRunnerForTesting(null);
  setPinterestPauseForTesting(null);
  clearCommandContext();
  resetSources();
  setMode("auto");
  closeDomainDb();
  setRoot(REPO);
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("stock pull: animations and stickers (#597)", () => {
  test("a Lottie lands in artifacts/animations/ as data, a sticker in artifacts/images/, both with provenance at $0", async () => {
    installFetch();
    const result = await stock(["pull", LOTTIE_ID, STICKER_ID, "--project", "alpha-001"]);
    expect(result).toMatchObject({ project: scope.projectId, count: 2, costUsd: 0, failures: [] });
    const [lottie, sticker] = result.pulled;

    expect(lottie).toMatchObject({ id: LOTTIE_ID, source: "noto-emoji", kind: "data", stockKind: "animation", mime: "application/json", fileAction: "write", revisionNo: 1, license: "CC BY 4.0", attributionRequired: true, referenceOnly: false });
    expect(lottie.path).toMatch(/^artifacts\/animations\/stock-dog-animated-emoji-[0-9a-f]{6}\.json$/);
    expect(JSON.parse(fs.readFileSync(path.join(treeDir, lottie.path), "utf8"))).toMatchObject({ fr: 30, layers: [] });

    expect(sticker).toMatchObject({ id: STICKER_ID, source: "fluent-emoji", kind: "image", stockKind: "sticker", mime: "image/png", license: "MIT", referenceOnly: false });
    expect(sticker.path).toMatch(/^artifacts\/images\/stock-cat-3d-emoji-[0-9a-f]{6}\.png$/);
    expect(fs.readFileSync(path.join(treeDir, sticker.path))).toEqual(Buffer.from(catPng));

    expect(revisionMetadata(lottie.revisionId)).toMatchObject({
      operation: "stock",
      source: "noto-emoji",
      candidateId: LOTTIE_ID,
      stockKind: "animation",
      mediaUrl: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f415/lottie.json",
      license: "CC BY 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      author: "Google",
      referenceOnly: false,
      projectPath: lottie.path,
    });
    expect(revisionMetadata(sticker.revisionId)).toMatchObject({
      source: "fluent-emoji",
      stockKind: "sticker",
      mediaUrl: `https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@${FLUENT_EMOJI_COMMIT}/assets/Cat/3D/cat_3d.png`,
      licenseUrl: `https://github.com/microsoft/fluentui-emoji/blob/${FLUENT_EMOJI_COMMIT}/LICENSE`,
    });
    const artifacts = listArtifacts({ context: scope, limit: 10 }).items;
    expect(artifacts.map((a) => a.kind).sort()).toEqual(["data", "image"]);
    expect(listRuns({ context: scope, limit: 10 }).items.map((run) => [run.kind, run.state])).toEqual([["stock.pull", "succeeded"], ["stock.pull", "succeeded"]]);
    // The Fluent index was built once and cached under the data root.
    expect(fs.readdirSync(path.join(tmp, ".ralphy", "cache", "stock")).sort()).toEqual(["fluent-emoji-index-1ffb34c752ec.json", "noto-emoji-index.json"]);
  });

  test("a second pull never overwrites: same bytes reuse the file, new bytes get <slot>.v2", async () => {
    installFetch();
    const first = (await stock(["pull", LOTTIE_ID, "--project", "alpha-001", "--slot", "emoji-dog"])).pulled[0];
    expect(first).toMatchObject({ path: "artifacts/animations/emoji-dog.json", fileAction: "write", revisionNo: 1 });
    const again = (await stock(["pull", LOTTIE_ID, "--project", "alpha-001", "--slot", "emoji-dog"])).pulled[0];
    expect(again).toMatchObject({ path: "artifacts/animations/emoji-dog.json", fileAction: "reuse", revisionNo: 2 });
    lottieBody = lottieJson("dog-updated-upstream");
    const changed = (await stock(["pull", LOTTIE_ID, "--project", "alpha-001", "--slot", "emoji-dog"])).pulled[0];
    expect(changed).toMatchObject({ path: "artifacts/animations/emoji-dog.v2.json", fileAction: "write", revisionNo: 3 });
    expect(JSON.parse(fs.readFileSync(path.join(treeDir, "artifacts/animations/emoji-dog.json"), "utf8")).nm).toBe("dog");
    expect(JSON.parse(fs.readFileSync(path.join(treeDir, "artifacts/animations/emoji-dog.v2.json"), "utf8")).nm).toBe("dog-updated-upstream");
  });

  test("--dry-run of an animation reports the animations folder and the data kind, and records nothing", async () => {
    installFetch();
    const plan = await stock(["pull", LOTTIE_ID, "--project", "alpha-001", "--dry-run"]);
    expect(plan.plans[0]).toMatchObject({ id: LOTTIE_ID, kind: "data", stockKind: "animation", folder: "artifacts/animations/", referenceOnly: false });
    expect(listRuns({ context: scope, limit: 10 }).items).toHaveLength(0);
  });
});

describe("stock pull: Pinterest boards and reference-only credits (#597)", () => {
  test("a board needs --license any, is capped by --max, and its pins are reference only in the credits", async () => {
    installFetch();
    const fake = fakeYtdlp({ [BOARD]: { stdout: stockFixture("pinterest-ytdlp.json").board } });
    setPinterestRunnerForTesting(fake.run);

    // (Without --license any the command refuses before yt-dlp runs: covered through the CLI entry below.)
    const result = await stock(["pull", `pinterest:${BOARD}`, "--project", "alpha-001", "--license", "any", "--max", "2"]);
    expect(result.count).toBe(2);
    expect(result.pulled.map((p: any) => [p.id, p.kind, p.referenceOnly, p.commercialOk])).toEqual([
      ["pinterest:pin:200000000000000001", "image", true, false],
      ["pinterest:pin:200000000000000002", "image", true, false],
    ]);
    expect(result.pulled[0].path).toMatch(/^artifacts\/images\/stock-star-sticker-[0-9a-f]{6}\.png$/);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]).toContain("--playlist-end");
    expect(revisionMetadata(result.pulled[0].revisionId)).toMatchObject({ source: "pinterest", referenceOnly: true, commercialOk: false, pageUrl: "https://www.pinterest.com/pin/200000000000000001/" });

    await stock(["pull", LOTTIE_ID, STICKER_ID, "--project", "alpha-001"]);
    const credits = await stock(["credits", "--project", "alpha-001"]);
    expect(credits.credits.map((c: any) => [c.candidateId, c.referenceOnly])).toEqual([
      ["pinterest:pin:200000000000000001", true],
      ["pinterest:pin:200000000000000002", true],
      [LOTTIE_ID, false],
      [STICKER_ID, false],
    ]);
    const lines = (credits.markdown as string).trimEnd().split("\n");
    expect(lines[0]).toBe("**Credits**");
    expect(lines[2]).toStartWith("- \"Dog (Noto Animated Emoji)\" by Google, CC BY 4.0");
    expect(lines[3]).toStartWith("- \"Cat (Fluent Emoji)\" by Microsoft, MIT License");
    expect(lines[5]).toBe("Reference only, not cleared for publishing:");
    expect(lines[6]).toBe("- \"Star sticker\" by Doodle Studio, rights belong to the pin's creator (reference only). Source: Pinterest, https://www.pinterest.com/pin/200000000000000001/");
    expect(lines).toHaveLength(8);
  });
});

// ─── real CLI entry ──────────────────────────────────────────────────────────

function ralphy(cwd: string, args: string[]): { exitCode: number; stdout: string; stderr: string; json: any } {
  const r = spawnSync("bun", ["run", CLI, "--json", ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, HOME: cwd, RALPHY_PROJECT_DIR: "", RALPHY_SKIP_LEGACY_HINT: "1", NO_COLOR: "1", PEXELS_API_KEY: "", PIXABAY_API_KEY: "" },
    timeout: 60_000,
  });
  let json: unknown = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* error case */
  }
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr, json };
}

function errorCode(stderr: string): string | undefined {
  for (const line of stderr.trim().split("\n").reverse()) {
    try {
      const parsed = JSON.parse(line) as { error?: { code?: string } };
      if (parsed.error?.code) return parsed.error.code;
    } catch {
      /* diagnostic line */
    }
  }
  return undefined;
}

describe("stock #597 through the CLI entry", () => {
  test("new kinds and sources validate before any request", () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-stock-cli-597-")));
    try {
      expect(ralphy(root, ["new", "--id", "alpha-001"]).exitCode).toBe(0);

      const pinterestSearch = ralphy(root, ["stock", "search", "stickers", "--kind", "image", "--source", "pinterest"]);
      expect(errorCode(pinterestSearch.stderr)).toBe("E_INPUT_INVALID");

      const badPin = ralphy(root, ["stock", "pull", "pinterest:123", "--project", "alpha-001"]);
      expect(errorCode(badPin.stderr)).toBe("E_INPUT_INVALID");

      const noLicense = ralphy(root, ["stock", "pull", `pinterest:${BOARD}`, "--project", "alpha-001"]);
      expect(errorCode(noLicense.stderr)).toBe("E_INPUT_INVALID");
      expect(noLicense.stderr).toContain("--license any");

      const badMax = ralphy(root, ["stock", "pull", `pinterest:${BOARD}`, "--project", "alpha-001", "--license", "any", "--max", "0"]);
      expect(errorCode(badMax.stderr)).toBe("E_INPUT_INVALID");

      const wrongKind = ralphy(root, ["stock", "search", "cat", "--kind", "sticker", "--source", "iconify"]);
      expect(errorCode(wrongKind.stderr)).toBe("E_INPUT_INVALID");

      // Pixabay alone without a key: skipped with a note, an empty result, exit 0, no request.
      const pixabayOnly = ralphy(root, ["stock", "search", "flower", "--kind", "sticker", "--source", "pixabay"]);
      expect(pixabayOnly.exitCode, pixabayOnly.stderr).toBe(0);
      expect(pixabayOnly.json).toMatchObject({ count: 0, kind: "sticker", sources: [{ source: "pixabay", status: "skipped" }] });
      expect(pixabayOnly.stderr).toContain("pixabay skipped: PIXABAY_API_KEY is not set");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 180_000);
});

// `ralphy stock pull` / `stock credits` (#596) on a temp store root.
//
// Two layers:
//   1. In process, with the stock fetch injected (zero network): a store
//      Workspace + Project and its tree under a fresh temp root, the command
//      scope set the way cli/index.ts sets it, then `stock pull` and
//      `stock credits` through the real command. Checks the Artifact revision
//      and its provenance, the Run / Attempt at $0, the file in the Project
//      tree, no overwrite on a second pull, the license refusal, a failed
//      download recorded as a failed Run, and the credits block.
//   2. Through the real CLI entry (HOME isolated, `ralphy new` store root):
//      scope resolution and the validation errors, none of which reach the
//      network.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { stockCmd } from "../../cli/commands/stock.js";
import { clearCommandContext, setCommandContext } from "../../cli/lib/context-state.js";
import { DomainError } from "../../cli/lib/errors/domain.js";
import { setRoot } from "../../cli/lib/paths.js";
import { clearSimpleIconsCache } from "../../cli/lib/providers/simple-icons.js";
import { listArtifactRevisions, listArtifacts, listArtifactUsages } from "../../cli/lib/store/artifacts.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { listRuns } from "../../cli/lib/store/runs.js";
import { createProject, createWorkspace } from "../../cli/lib/store/scopes.js";
import { StockSourceError, setStockFetchForTesting } from "../../cli/lib/stock/http.js";
import { pullStockItem } from "../../cli/lib/stock/pull.js";
import { setMode } from "../../cli/lib/ui.js";
import { NVIDIA_SVG, bytesResponse, fixtureFetch, jpegBytes, jsonResponse, stockFixture } from "../helpers/stock-fetch.js";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");
const NYSE_ID = "commons:File:NYSE_trading_floor.jpg";
const NC_ID = "openverse:image:2d6553a7-7cc7-4bc8-c714-a709f8680ee3";

let tmp: string;
let treeDir: string;
let scope: { workspaceId: string; projectId: string };
let nyseBytes: Uint8Array;
let nyseBody: "jpeg" | "html";

function commonsPage(title: string) {
  const pages = stockFixture("commons-search-image.json").query.pages as Array<{ title: string }>;
  return pages.find((page) => page.title === title)!;
}

function installFetch() {
  const icons = stockFixture("simple-icons.json");
  const openverse = stockFixture("openverse-images.json").results as Array<{ id: string }>;
  const fixture = fixtureFetch([
    { match: (u) => u.pathname.endsWith("/data/simple-icons.json"), respond: () => jsonResponse(icons) },
    { match: (u) => u.pathname.endsWith("/icons/nvidia.svg"), respond: () => bytesResponse(NVIDIA_SVG, "image/svg+xml") },
    {
      match: (u) => u.host === "commons.wikimedia.org" && u.searchParams.get("titles") === "File:NYSE trading floor.jpg",
      respond: () => jsonResponse({ query: { pages: [commonsPage("File:NYSE trading floor.jpg")] } }),
    },
    {
      match: (u) => u.host === "upload.wikimedia.org" && u.pathname.endsWith("/NYSE_trading_floor.jpg"),
      respond: () => (nyseBody === "jpeg" ? bytesResponse(nyseBytes, "image/jpeg") : bytesResponse("<!doctype html><title>Error</title>", "text/html")),
    },
    {
      match: (u) => u.host === "api.openverse.org" && u.pathname.startsWith("/v1/images/"),
      respond: (u) => jsonResponse(openverse.find((item) => u.pathname.includes(item.id)) ?? {}, openverse.some((item) => u.pathname.includes(item.id)) ? 200 : 404),
    },
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

function attempt(runId: string) {
  return openDomainDb()
    .query<{ provider: string | null; cost: number | null; state: string }, [string]>(
      "SELECT provider, cost_usd AS cost, state FROM run_attempts WHERE run_id = ?",
    )
    .get(runId)!;
}

beforeEach(() => {
  setMode("json");
  clearSimpleIconsCache();
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-stock-596-")));
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
  nyseBytes = jpegBytes("nyse-a");
  nyseBody = "jpeg";
});

afterEach(() => {
  setStockFetchForTesting(null);
  clearCommandContext();
  clearSimpleIconsCache();
  setMode("auto");
  closeDomainDb();
  setRoot(REPO);
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("stock pull on a store root (#596)", () => {
  test("registers Artifact revisions with provenance at $0 and writes the files into the Project tree", async () => {
    const { calls } = installFetch();
    const result = await stock(["pull", "simple-icons:nvidia", NYSE_ID, "--project", "alpha-001"]);
    expect(result).toMatchObject({ project: scope.projectId, count: 2, costUsd: 0, failures: [] });
    const [logo, photo] = result.pulled;

    expect(logo).toMatchObject({ id: "simple-icons:nvidia", kind: "image", slot: "logo-nvidia", path: "artifacts/images/logo-nvidia.svg", fileAction: "write", revisionNo: 1, mime: "image/svg+xml", attributionRequired: false });
    const svg = fs.readFileSync(path.join(treeDir, logo.path), "utf8");
    expect(svg).toContain('fill="#76B900"');

    expect(photo).toMatchObject({ id: NYSE_ID, kind: "image", path: `artifacts/images/${photo.slot}.jpg`, fileAction: "write", revisionNo: 1, license: "CC BY-SA 4.0", author: "Jane Doe", attributionRequired: true });
    expect(photo.slot).toMatch(/^stock-nyse-trading-floor-[0-9a-f]{6}$/);
    expect(fs.readFileSync(path.join(treeDir, photo.path))).toEqual(Buffer.from(nyseBytes));

    // Provenance on the revision.
    expect(revisionMetadata(photo.revisionId)).toMatchObject({
      operation: "stock",
      source: "commons",
      candidateId: NYSE_ID,
      title: "NYSE trading floor",
      pageUrl: "https://commons.wikimedia.org/wiki/File:NYSE_trading_floor.jpg",
      mediaUrl: "https://upload.wikimedia.org/wikipedia/commons/a/ab/NYSE_trading_floor.jpg",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      author: "Jane Doe",
      attribution: photo.attribution,
      commercialOk: true,
      attributionRequired: true,
      projectPath: photo.path,
    });
    // Run stock.pull + Attempt with the source as provider at $0; overlay usage on the Project.
    const runs = listRuns({ context: scope, limit: 10 }).items;
    expect(runs.map((run) => [run.kind, run.state])).toEqual([["stock.pull", "succeeded"], ["stock.pull", "succeeded"]]);
    expect(attempt(photo.runId)).toEqual({ provider: "commons", cost: 0, state: "succeeded" });
    expect(attempt(logo.runId)).toEqual({ provider: "simple-icons", cost: 0, state: "succeeded" });
    const usages = listArtifactUsages({ context: scope, revisionId: photo.revisionId, limit: 10 }).items;
    expect(usages.map((usage) => usage.role)).toEqual(["overlay"]);
    // Every request carried the stock User-Agent and stayed on the fixture.
    expect(calls.every((call) => call.headers["user-agent"]?.startsWith("Ralphy/"))).toBe(true);
  });

  test("a second pull never overwrites: same bytes reuse the file, new bytes get <slot>.v2", async () => {
    installFetch();
    const first = (await stock(["pull", NYSE_ID, "--project", "alpha-001", "--slot", "broll-nyse"])).pulled[0];
    expect(first).toMatchObject({ slot: "broll-nyse", path: "artifacts/images/broll-nyse.jpg", fileAction: "write", revisionNo: 1 });

    const again = (await stock(["pull", NYSE_ID, "--project", "alpha-001", "--slot", "broll-nyse"])).pulled[0];
    expect(again).toMatchObject({ path: "artifacts/images/broll-nyse.jpg", fileAction: "reuse", revisionNo: 2 });
    expect(again.artifactId).toBe(first.artifactId);
    expect(again.revisionId).not.toBe(first.revisionId);

    nyseBytes = jpegBytes("nyse-b-updated-upstream");
    const changed = (await stock(["pull", NYSE_ID, "--project", "alpha-001", "--slot", "broll-nyse"])).pulled[0];
    expect(changed).toMatchObject({ path: "artifacts/images/broll-nyse.v2.jpg", fileAction: "write", revisionNo: 3 });
    expect(fs.readFileSync(path.join(treeDir, "artifacts/images/broll-nyse.jpg"))).toEqual(Buffer.from(jpegBytes("nyse-a")));
    expect(fs.readFileSync(path.join(treeDir, "artifacts/images/broll-nyse.v2.jpg"))).toEqual(Buffer.from(nyseBytes));

    const artifacts = listArtifacts({ context: scope, limit: 10 }).items;
    expect(artifacts.map((artifact) => [artifact.slug, artifact.kind])).toEqual([["broll-nyse", "image"]]);
    expect(listArtifactRevisions({ context: scope, artifactId: artifacts[0]!.id, limit: 10 }).items.map((r) => r.revisionNo)).toEqual([1, 2, 3]);
  });

  test("--dry-run resolves the ids and records nothing", async () => {
    installFetch();
    const plan = await stock(["pull", NYSE_ID, "--project", "alpha-001", "--dry-run"]);
    expect(plan).toMatchObject({ dryRun: true, project: scope.projectId, count: 1, cost_estimate_usd: 0 });
    expect(plan.plans[0]).toMatchObject({ id: NYSE_ID, kind: "image", folder: "artifacts/images/", license: "CC BY-SA 4.0" });
    expect(listRuns({ context: scope, limit: 10 }).items).toHaveLength(0);
    expect(fs.existsSync(path.join(treeDir, "artifacts"))).toBe(false);
  });

  test("an item without commercial + modification rights is refused before any Run", async () => {
    const { fetchImpl } = installFetch();
    const project = { id: scope.projectId, dir: treeDir };
    const refused = await pullStockItem({ project, candidateId: NC_ID, license: "commercial", fetchImpl }).catch((e) => e);
    expect(refused).toBeInstanceOf(DomainError);
    expect(refused.code).toBe("E_INPUT_INVALID");
    expect(refused.details.detail).toContain("CC BY-NC 2.0");
    expect(refused.details.detail).toContain("--license any");
    // --license open also refuses ShareAlike (the NYSE photo is CC BY-SA 4.0).
    const shareAlike = await pullStockItem({ project, candidateId: NYSE_ID, license: "open", fetchImpl }).catch((e) => e);
    expect(shareAlike).toBeInstanceOf(DomainError);
    expect(shareAlike.details.detail).toContain("ShareAlike");
    expect(listRuns({ context: scope, limit: 10 }).items).toHaveLength(0);
    // An unknown id at the source is a source error, also before any Run.
    const missing = await pullStockItem({ project, candidateId: "openverse:image:00000000-0000-4000-8000-000000000000", license: "any", fetchImpl }).catch((e) => e);
    expect(missing).toBeInstanceOf(StockSourceError);
    expect(listRuns({ context: scope, limit: 10 }).items).toHaveLength(0);
  });

  test("a download that is not the asked-for media fails its Run and writes nothing to the tree", async () => {
    const { fetchImpl } = installFetch();
    nyseBody = "html";
    const error = await pullStockItem({ project: { id: scope.projectId, dir: treeDir }, candidateId: NYSE_ID, license: "commercial", fetchImpl }).catch((e) => e);
    expect(error).toBeInstanceOf(StockSourceError);
    expect(error.message).toContain("did not download as image");
    expect(listRuns({ context: scope, limit: 10 }).items.map((run) => [run.kind, run.state])).toEqual([["stock.pull", "failed"]]);
    expect(listArtifacts({ context: scope, limit: 10 }).items).toHaveLength(0);
    expect(fs.existsSync(path.join(treeDir, "artifacts", "images"))).toBe(false);
  });

  test("stock credits lists each pulled item once, required credits first", async () => {
    installFetch();
    await stock(["pull", "simple-icons:nvidia", NYSE_ID, "--project", "alpha-001"]);
    await stock(["pull", NYSE_ID, "--project", "alpha-001"]);
    const credits = await stock(["credits", "--project", "alpha-001"]);
    expect(credits).toMatchObject({ project: scope.projectId, count: 2 });
    expect(credits.credits.map((c: any) => [c.candidateId, c.attributionRequired])).toEqual([
      ["simple-icons:nvidia", false],
      [NYSE_ID, true],
    ]);
    const lines = (credits.markdown as string).split("\n");
    expect(lines[0]).toBe("**Credits**");
    expect(lines[2]).toBe(`- "NYSE trading floor" by Jane Doe, CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0). Source: Wikimedia Commons, https://commons.wikimedia.org/wiki/File:NYSE_trading_floor.jpg`);
    expect(credits.markdown).toContain("Also used (no attribution required):\n- \"NVIDIA logo\"");
  });
});

// ─── real CLI entry ──────────────────────────────────────────────────────────

function ralphy(cwd: string, args: string[]): { exitCode: number; stdout: string; stderr: string; json: any } {
  const r = spawnSync("bun", ["run", CLI, "--json", ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, HOME: cwd, RALPHY_PROJECT_DIR: "", RALPHY_SKIP_LEGACY_HINT: "1", NO_COLOR: "1", PEXELS_API_KEY: "" },
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

describe("stock through the CLI entry (#596)", () => {
  test("pull and credits resolve the Project scope; bad input fails before any request", () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-stock-cli-596-")));
    try {
      const created = ralphy(root, ["new", "--id", "alpha-001"]);
      expect(created.exitCode, created.stderr).toBe(0);
      const projectId = created.json.id as string;

      const credits = ralphy(root, ["stock", "credits", "--project", "alpha-001"]);
      expect(credits.exitCode, credits.stderr).toBe(0);
      expect(credits.json).toMatchObject({ project: projectId, count: 0, credits: [], markdown: "" });

      const badId = ralphy(root, ["stock", "pull", "pinterest:123", "--project", "alpha-001"]);
      expect(badId.exitCode).not.toBe(0);
      expect(errorCode(badId.stderr)).toBe("E_INPUT_INVALID");

      const twoSlots = ralphy(root, ["stock", "pull", "simple-icons:nvidia", "simple-icons:visa", "--project", "alpha-001", "--slot", "logo"]);
      expect(errorCode(twoSlots.stderr)).toBe("E_INPUT_INVALID");

      const missingProject = ralphy(root, ["stock", "credits", "--project", "nope-404"]);
      expect(missingProject.exitCode).not.toBe(0);

      const badKind = ralphy(root, ["stock", "search", "nvidia", "--kind", "font"]);
      expect(errorCode(badKind.stderr)).toBe("E_FLAG_UNKNOWN");

      const wrongSource = ralphy(root, ["stock", "search", "whoosh", "--kind", "audio", "--source", "archive"]);
      expect(errorCode(wrongSource.stderr)).toBe("E_INPUT_INVALID");

      // Pexels alone without a key: skipped with a note, an empty result, exit 0, no request.
      const pexelsOnly = ralphy(root, ["stock", "search", "stock market", "--kind", "image", "--source", "pexels"]);
      expect(pexelsOnly.exitCode, pexelsOnly.stderr).toBe(0);
      expect(pexelsOnly.json).toMatchObject({ count: 0, sources: [{ source: "pexels", status: "skipped" }] });
      expect(pexelsOnly.stderr).toContain("pexels skipped: PEXELS_API_KEY is not set");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 180_000);
});

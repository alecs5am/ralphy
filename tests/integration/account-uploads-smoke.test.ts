// External-free morning smoke: real CLI/store/panel, simulated provider boundary.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { claimNextUpload, getUpload, resolveOwnedAccount, setAccountSession, appendUploadMetrics } from "../../cli/lib/store/uploads.js";
import { runClaimedUpload } from "../../cli/lib/uploads/run.js";
import type { BrowserContext, Page } from "../../cli/lib/uploads/browser.js";
import type { PlatformRecipe } from "../../cli/lib/uploads/platforms.js";
import { panelHandler } from "../../cli/lib/panel/server.js";
import { verifyDomainStore } from "../../cli/lib/store/verify.js";

const repo = path.resolve(import.meta.dir, "../..");
let tmp: TmpRoot;
beforeEach(() => { tmp = makeTmpRoot("ralphy-account-morning-smoke"); openDomainDb(); });
afterEach(() => { closeDomainDb(); tmp.cleanup(); });

function cli(...args: string[]): any {
  const prefix = process.env.RALPHY_SMOKE_BIN ? [process.env.RALPHY_SMOKE_BIN] : [process.execPath, path.join(repo, "cli/index.ts")];
  const result = spawnSync(prefix[0]!, [...prefix.slice(1), "--json", "--root", path.join(tmp.dir, ".ralphy"), ...args], { cwd: tmp.dir, encoding: "utf8", timeout: 20_000 });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout);
}

function browserFixture(): BrowserContext {
  const page = { async goto() {}, setDefaultTimeout() {}, url: () => "https://fixture.invalid/profile", async content() { return "<html>local provider fixture</html>"; }, async screenshot() { throw new Error("fixture has no pixels"); } } as unknown as Page;
  return { pages: () => [page], async close() {} } as unknown as BrowserContext;
}

const recipe = (outcome: "success" | "before" | "unknown", userId = "111"): PlatformRecipe => ({
  label: "Fixture", home: "https://fixture.invalid/", loginUrl: "https://fixture.invalid/login", profileUrl: () => "https://fixture.invalid/profile", captionLimit: 2200,
  async session() { return { state: "ok", userId }; },
  async profileStats() { return { followers: null, following: null, posts: null }; },
  async upload({ onSubmit, expectedUserId }) {
    expect(expectedUserId).toBe("111"); // first observed identity is passed to the recipe immediately
    if (outcome === "before") throw new Error("fixture fails before submit");
    onSubmit();
    if (outcome === "unknown") throw new Error("fixture loses confirmation after submit");
    return { postUrl: "https://www.instagram.com/reel/FIXTURE/", postExternalId: "FIXTURE" };
  },
});

describe("account uploads isolated morning smoke", () => {
  test("device accounts hand off to the owner without a browser-open command", async () => {
    const workspace = cli("workspace", "create", "device-fixture");
    const account = cli("--workspace", workspace.id, "account", "add", "instagram", "phone.owner", "--connection", "device").account;
    const video = path.join(tmp.dir, "device.mp4");
    fs.writeFileSync(video, "fixture video bytes");
    const upload = cli("--workspace", workspace.id, "upload", "add", video, "--account", account.id, "--approve").upload;
    const claimed = claimNextUpload({ id: upload.id });
    expect(claimed).not.toBeNull();
    const result = await runClaimedUpload(claimed!, resolveOwnedAccount({ ref: account.id }));
    expect(result.state).toBe("needs_user");
    expect(result.error).toContain("device");
    expect(result.error).toContain(`upload done ${upload.id}`);
    expect(result.error).not.toContain("account open");
  });

  test("CLI approval, provider outcomes, identity binding, metrics and GET-only panel", async () => {
    const workspace = cli("workspace", "create", "morning-fixture");
    cli("skill", "install", "--agent", "codex", "--scope", "project", "--repo", repo);
    expect(fs.existsSync(path.join(tmp.dir, "AGENTS.md"))).toBe(true);
    const installed = path.join(tmp.dir, ".ralphy/prompts/.agents/skills/account-uploads/SKILL.md");
    expect(fs.readFileSync(installed, "utf8")).toBe(fs.readFileSync(path.join(repo, ".agents/skills/account-uploads/SKILL.md"), "utf8"));
    const account = cli("--workspace", workspace.id, "account", "add", "instagram", "fixture", "--purpose", "test").account;
    const video = path.join(tmp.dir, "fixture.mp4");
    const ffmpeg = spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=black:s=32x32:d=0.2", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", video], { encoding: "utf8", timeout: 10_000 });
    expect(ffmpeg.status, ffmpeg.stderr).toBe(0);
    const add = () => cli("--workspace", workspace.id, "upload", "add", video, "--account", account.id, "--caption", "fixture caption").upload;
    const first = add();
    expect(claimNextUpload({ id: first.id })).toBeNull();
    const run = async (id: string, outcome: "success" | "before" | "unknown", userId = "111") => {
      cli("--workspace", workspace.id, "upload", "approve", id);
      const claimed = claimNextUpload({ id }); expect(claimed).not.toBeNull();
      return runClaimedUpload(claimed!, resolveOwnedAccount({ workspaceId: workspace.id, ref: account.id }), { openBrowser: async () => browserFixture(), recipe: recipe(outcome, userId) });
    };
    expect((await run(first.id, "success")).state).toBe("published");
    expect(resolveOwnedAccount({ ref: account.id }).platformUserId).toBe("111");
    appendUploadMetrics({ uploadId: first.id, source: "fixture", views: 12, asOf: 123 });
    expect(cli("--workspace", workspace.id, "upload", "show", first.id).upload.metrics.views).toBe(12);
    expect((await run(add().id, "before")).state).toBe("needs_user");
    const unknown = await run(add().id, "unknown");
    expect(unknown.state).toBe("unknown");
    expect(claimNextUpload({ workspaceId: workspace.id })).toBeNull();
    cli("--workspace", workspace.id, "upload", "cancel", unknown.id);
    expect((await run(add().id, "success", "222")).state).toBe("needs_user");
    expect(resolveOwnedAccount({ ref: account.id }).sessionState).toBe("restricted");
    setAccountSession(account.id, "ok", { platformUserId: "111" });
    expect(getUpload(first.id).postUrl).toBe("https://www.instagram.com/reel/FIXTURE/");
    const handler = panelHandler({ dataRoot: path.join(tmp.dir, ".ralphy"), version: "fixture", trend: null, runCli: async () => ({}) });
    const url = "http://127.0.0.1:4777/api/accounts";
    const res = await handler(new Request(url, { headers: { host: "127.0.0.1:4777" } }));
    expect(res.status).toBe(200);
    expect((await res.json() as any).uploads.published[0].views).toBe(12);
    expect((await handler(new Request(url, { method: "POST", headers: { host: "127.0.0.1:4777" } }))).status).toBe(405);
    const report = verifyDomainStore();
    expect(report.integrity, JSON.stringify(report)).toBe("ok");
    expect(openDomainDb().query("PRAGMA foreign_key_check").all()).toEqual([]);
  }, 30_000);
});

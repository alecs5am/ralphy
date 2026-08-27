import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  mutateMarketplaceInstalls,
  parseMarketplaceInstallMutation,
  readMarketplaceInstalls,
} from "../electron/marketplace-installs";

let dir = "";
let store = "";
const known = new Set(["skill:editor", "prompt:brief"]);
const at = () => 1_700_000_000_000;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ralphy-installs-"));
  store = join(dir, "marketplace-installs.json");
});
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

describe("marketplace installs", () => {
  test("a missing or corrupt record reads as an empty shelf", async () => {
    expect(await readMarketplaceInstalls(store)).toEqual({
      schemaVersion: 1,
      selectedWorkspaceId: null,
      installs: [],
      warning: null,
    });
    await writeFile(store, "{ not json");
    expect((await readMarketplaceInstalls(store)).installs).toEqual([]);
  });

  test("install, disable, and uninstall move one workspace's selection", async () => {
    const installed = await mutateMarketplaceInstalls(store, { action: "install", workspaceId: "ws_a", entryId: "skill:editor" }, known, at);
    expect(installed.installs).toEqual([{ entryId: "skill:editor", workspaceId: "ws_a", installedAt: at(), enabled: true }]);
    expect(installed.selectedWorkspaceId).toBe("ws_a");

    const disabled = await mutateMarketplaceInstalls(store, { action: "disable", workspaceId: "ws_a", entryId: "skill:editor" }, known, at);
    expect(disabled.installs[0]!.enabled).toBe(false);
    /* Disabling is still installed, so the date it was taken must not move. */
    expect(disabled.installs[0]!.installedAt).toBe(at());

    const other = await mutateMarketplaceInstalls(store, { action: "install", workspaceId: "ws_b", entryId: "skill:editor" }, known, at);
    expect(other.installs).toHaveLength(2);

    const gone = await mutateMarketplaceInstalls(store, { action: "uninstall", workspaceId: "ws_a", entryId: "skill:editor" }, known, at);
    expect(gone.installs).toEqual([{ entryId: "skill:editor", workspaceId: "ws_b", installedAt: at(), enabled: true }]);
    expect(JSON.parse(await readFile(store, "utf8")).installs).toHaveLength(1);
  });

  test("an unbundled id, and a toggle of something never installed, change nothing", async () => {
    const foreign = await mutateMarketplaceInstalls(store, { action: "install", workspaceId: "ws_a", entryId: "skill:ghost" }, known, at);
    expect(foreign.installs).toEqual([]);
    expect(foreign.warning).toMatch(/bundled catalog/);

    const toggled = await mutateMarketplaceInstalls(store, { action: "enable", workspaceId: "ws_a", entryId: "prompt:brief" }, known, at);
    expect(toggled.installs).toEqual([]);
    expect(toggled.warning).toMatch(/not installed/);
  });

  test("only a known action with a workspace parses, and select-workspace carries no entry", () => {
    expect(parseMarketplaceInstallMutation({ action: "drop", workspaceId: "ws_a", entryId: "skill:editor" })).toBeNull();
    expect(parseMarketplaceInstallMutation({ action: "install", workspaceId: "ws_a" })).toBeNull();
    expect(parseMarketplaceInstallMutation({ action: "install", workspaceId: "", entryId: "skill:editor" })).toBeNull();
    expect(parseMarketplaceInstallMutation({ action: "select-workspace", workspaceId: "ws_a", entryId: "skill:editor" }))
      .toEqual({ action: "select-workspace", workspaceId: "ws_a", entryId: null });
  });
});

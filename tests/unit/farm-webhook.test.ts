// Webhook-trigger secret store (#520) — cli/lib/farm/webhook.ts.
//
// Tokens are workspace-local ENGINE STATE (farm/webhook-tokens.json), never
// part of the graph file and never staged by the #502 bundle export.

import { describe, test, expect, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { workspaceDir } from "../../cli/lib/paths.js";
import {
  ensureTriggerToken,
  readTriggerToken,
  webhookTokensPath,
} from "../../cli/lib/farm/webhook.js";

let tmp: TmpRoot;
afterEach(() => tmp?.cleanup());

const WS = "test";

function seedWorkspace(): void {
  tmp = makeTmpRoot("ralphy-webhook");
  fs.mkdirSync(workspaceDir(WS), { recursive: true });
}

describe("webhook token store (#520)", () => {
  test("first call generates; second call returns the SAME token; --rotate replaces it", () => {
    seedWorkspace();
    const first = ensureTriggerToken(WS, "on-upload");
    expect(first.created).toBe(true);
    expect(first.rotated).toBe(false);
    expect(first.record.token.length).toBeGreaterThanOrEqual(40); // 32 bytes base64url
    expect(first.record.rotatedAt).toBeNull();

    const again = ensureTriggerToken(WS, "on-upload");
    expect(again.created).toBe(false);
    expect(again.record.token).toBe(first.record.token);

    const rotated = ensureTriggerToken(WS, "on-upload", { rotate: true });
    expect(rotated.rotated).toBe(true);
    expect(rotated.record.token).not.toBe(first.record.token);
    expect(rotated.record.createdAt).toBe(first.record.createdAt);
    expect(rotated.record.rotatedAt).not.toBeNull();

    expect(readTriggerToken(WS, "on-upload")?.token).toBe(rotated.record.token);
    expect(readTriggerToken(WS, "unknown")).toBeNull();
  });

  test("the store lives in workspace-local farm/ state, not the graph tier", () => {
    seedWorkspace();
    ensureTriggerToken(WS, "on-upload");
    const file = webhookTokensPath(WS);
    expect(file).toBe(path.join(workspaceDir(WS), "farm", "webhook-tokens.json"));
    expect(fs.existsSync(file)).toBe(true);
    // Two triggers share one store file.
    ensureTriggerToken(WS, "on-launch");
    const store = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(Object.keys(store).sort()).toEqual(["on-launch", "on-upload"]);
  });
});

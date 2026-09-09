import { describe, expect, test } from "vitest";

import { harnessRow } from "@/pages/settings";

const status = (over: Partial<Parameters<typeof harnessRow>[0]>) => harnessRow({
  id: "claude",
  label: "Claude",
  binaryReady: true,
  accountConnected: false,
  apiKeyConfigured: false,
  inheritedApiKey: false,
  connected: false,
  detail: "Claude login required",
  models: [],
  defaultModel: "sonnet",
  ...over,
});

describe("a provider row in settings", () => {
  test("offers Claude both ways in and leads with the subscription login", () => {
    const row = status({});

    // The key field stays available, but a plan the operator already pays for is the first offer.
    expect({ apiKey: row.apiKey, login: row.login, action: row.action }).toEqual({ apiKey: true, login: true, action: "Sign in" });
  });

  test("offers Codex only its own login and OpenRouter only a key", () => {
    expect(status({ id: "codex", label: "Codex" })).toMatchObject({ apiKey: false, login: true, action: "Sign in" });
    expect(status({ id: "openrouter", label: "OpenRouter" })).toMatchObject({ apiKey: true, login: false, action: "Add key" });
  });

  test("names the missing binary before either credential", () => {
    expect(status({ binaryReady: false }).action).toBe("Install");
  });
});

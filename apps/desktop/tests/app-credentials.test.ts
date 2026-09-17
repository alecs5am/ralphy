import { expect, test } from "vitest";
import { appCredentialEnvironment } from "../electron/canvas/app-credentials";

test("both agent harnesses receive exactly the generation keys shown by app settings", () => {
  const inherited = { OPENROUTER_API_KEY: "old-shell-router", FAL_KEY: "old-shell-fal", ELEVENLABS_API_KEY: "old-shell-voice", HOME: "/home/operator" };
  expect(appCredentialEnvironment(inherited, { OPENROUTER_API_KEY: "selected-app-router" })).toEqual({ HOME: inherited.HOME, OPENROUTER_API_KEY: "selected-app-router", RALPHY_APP_OPENROUTER_API_KEY: "selected-app-router", RALPHY_APP_CREDENTIALS: "openrouter" });
  expect(appCredentialEnvironment(inherited, {})).toEqual({ HOME: inherited.HOME, RALPHY_APP_CREDENTIALS: "" });
  expect(inherited.FAL_KEY).toBe("old-shell-fal");
});

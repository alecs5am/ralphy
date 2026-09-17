import { describe, expect, test } from "vitest";
import { chmod, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { codexCatalog } from "../electron/agent/models";
import { readCodexConfiguredModel, readCodexCatalog, resolveCodexBinary, codexErrorMessage } from "../electron/agent/codex-session";

const catalog = {
  models: [
    { slug: "gpt-5.5", display_name: "GPT-5.5", visibility: "list" },
    { slug: "gpt-5.4", display_name: "GPT-5.4", visibility: "list" },
    { slug: "gpt-5.3-internal", display_name: "Internal", visibility: "hidden" },
  ],
};

describe("the Codex catalogue", () => {
  test("reads configuration and the current installation from CODEX_HOME", async () => {
    const home = await mkdtemp(join(tmpdir(), "codex-config-home-"));
    const codexHome = join(home, "profile");
    try {
      const bin = join(codexHome, "packages", "standalone", "current", "bin", "codex");
      await mkdir(join(home, ".codex"), { recursive: true });
      await mkdir(join(codexHome, "packages", "standalone", "current", "bin"), { recursive: true });
      await writeFile(join(home, ".codex", "config.toml"), 'model = "home-model"\n');
      await writeFile(join(codexHome, "config.toml"), 'model = "profile-model"\n[profiles.other]\nmodel = "ignored"\n');
      await writeFile(bin, "#!/bin/sh\necho codex-cli 999.0.0\n"); await chmod(bin, 0o755);
      expect(await readCodexConfiguredModel(home, { CODEX_HOME: codexHome })).toBe("profile-model");
      expect(await readCodexConfiguredModel(home, {})).toBe("home-model");
      expect(await resolveCodexBinary({ CODEX_HOME: codexHome, PATH: "" }, home)).toBe(await realpath(bin));
      const app = join(home, "Applications", "Codex.app", "Contents", "Resources", "codex");
      await mkdir(join(home, "Applications", "Codex.app", "Contents", "Resources"), { recursive: true });
      await writeFile(app, "#!/bin/sh\necho codex-cli 999.1.0-alpha.1\n"); await chmod(app, 0o755);
      expect(await resolveCodexBinary({ CODEX_HOME: codexHome, PATH: "" }, home)).toBe(await realpath(app));
      const override = join(home, "custom-codex"); await writeFile(override, "#!/bin/sh\nexit 0\n"); await chmod(override, 0o755);
      expect(await resolveCodexBinary({ CODEX_HOME: codexHome, RALPHY_CODEX_PATH: override }, home)).toBe(await realpath(override));
    } finally { await rm(home, { recursive: true, force: true }); }
  });

  test("refreshes models through the chosen binary, caches concurrent reads, and falls back offline", async () => {
    const home = await mkdtemp(join(tmpdir(), "codex-catalog-"));
    try {
      const refreshed = join(home, "refreshed"), offline = join(home, "offline");
      const live = { models: [{ slug: "gpt-6-astra", display_name: "Astra", visibility: "list" }] };
      const bundled = { models: [{ slug: "gpt-5.6-sol", display_name: "Sol", visibility: "list" }] };
      await writeFile(refreshed, `#!/bin/sh\nprintf '%s' '${JSON.stringify(live)}'\n`); await chmod(refreshed, 0o755);
      await writeFile(offline, `#!/bin/sh\nif [ "$3" = "--bundled" ]; then printf '%s' '${JSON.stringify(bundled)}'; else exit 1; fi\n`); await chmod(offline, 0o755);
      const first = readCodexCatalog(refreshed, { CODEX_HOME: home });
      expect(readCodexCatalog(refreshed, { CODEX_HOME: home })).toBe(first);
      expect(await first).toEqual(live);
      expect(codexCatalog(await first, "gpt-6-astra").unsupportedDefault).toBeNull();
      expect(await readCodexCatalog(offline, { CODEX_HOME: home })).toEqual(bundled);
    } finally { await rm(home, { recursive: true, force: true }); }
  });

  test("turn errors show the provider message with an actionable version hint", () => {
    expect(codexErrorMessage('unexpected status 400: {"error":{"message":"gpt-6-astra requires a newer version of Codex"}}, request id: private-id'))
      .toBe("gpt-6-astra requires a newer version of Codex Update Codex in Settings → Agents, or choose another model in the chat.");
    expect(codexErrorMessage('HTTP 401: {"detail":"Session expired"}')).toBe("Session expired");
    expect(codexErrorMessage(null)).toBe("The agent could not finish this request");
  });

  test("offers what the binary ships and keeps the operator's default", () => {
    const result = codexCatalog(catalog, "gpt-5.4");
    expect(result.models.map(({ id }) => id)).toEqual(["default", "gpt-5.5", "gpt-5.4"]);
    expect(result.defaultModel).toBe("default");
    expect(result.unsupportedDefault).toBeNull();
  });

  test("says so when the configured default is not a model this build knows", () => {
    /* Not the same failure as "requires a newer version of Codex": that one comes from the server,
       for a model the build *does* list, and is cured by running the Codex the operator actually
       installed -- see `resolveCodexBinary`, which now follows Codex's own `current` symlink. */
    const result = codexCatalog(catalog, "gpt-5.6-luna");
    expect(result.unsupportedDefault).toBe("gpt-5.6-luna");
    expect(result.defaultModel).toBe("gpt-5.5");
    /* Annotated, never removed: a model can be listed by the build and still be refused by an
       outdated CLI, and this function cannot tell the two apart -- so it states only what it
       knows, that the configured name is not in this build's catalogue. */
    expect(result.models.map(({ id }) => id)).toEqual(["default", "gpt-5.5", "gpt-5.4"]);
    expect(result.models[0]).toMatchObject({
      id: "default",
      description: "Your Codex config asks for gpt-5.6-luna, which the current catalog does not list",
    });
  });

  test("falls back to the bare default when there is no catalogue at all", () => {
    expect(codexCatalog(null, null)).toEqual({
      models: [{ id: "default", label: "Codex default", description: "Uses your Codex configuration" }],
      defaultModel: "default",
      unsupportedDefault: null,
    });
  });
});

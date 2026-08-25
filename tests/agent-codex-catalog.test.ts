import { describe, expect, test } from "vitest";

import { codexCatalog } from "../electron/agent/models";

const catalog = {
  models: [
    { slug: "gpt-5.5", display_name: "GPT-5.5", visibility: "list" },
    { slug: "gpt-5.4", display_name: "GPT-5.4", visibility: "list" },
    { slug: "gpt-5.3-internal", display_name: "Internal", visibility: "hidden" },
  ],
};

describe("the Codex catalogue", () => {
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
      description: "Your Codex config asks for gpt-5.6-luna, which this build does not list",
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

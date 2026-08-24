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

  test("stops sending a configured model the CLI cannot run, and says why", () => {
    /* The live failure: the Codex app writes ~/.codex/models_cache.json stamped with its own
       version, the server gates the catalogue on the client version, and the installed CLI answers
       a 5.6 model with a 400 that reads "requires a newer version of Codex". */
    const result = codexCatalog(catalog, "gpt-5.6-luna");
    expect(result.unsupportedDefault).toBe("gpt-5.6-luna");
    expect(result.defaultModel).toBe("gpt-5.5");
    expect(result.models[0]).toMatchObject({
      id: "default",
      description: "Your Codex config asks for gpt-5.6-luna, which this CLI cannot run",
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

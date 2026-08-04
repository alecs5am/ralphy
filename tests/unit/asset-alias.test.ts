import { describe, expect, test } from "bun:test";
import { assetCmd } from "../../cli/commands/asset.js";
import { artifactCmd } from "../../cli/commands/artifact.js";

describe("singular asset compatibility alias", () => {
  test("exposes the canonical immutable Artifact subcommands", () => {
    expect(assetCmd().commands.map((command) => command.name())).toEqual(
      artifactCmd().commands.map((command) => command.name()),
    );
  });
});

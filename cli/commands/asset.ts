import type { Command } from "commander";
import { artifactCmd } from "./artifact.js";

/** Singular compatibility alias for the canonical immutable Artifact CLI. */
export function assetCmd(): Command {
  return artifactCmd()
    .name("asset")
    .description("Alias for `ralphy artifact`");
}

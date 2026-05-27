// `ralphy provider` — inspect the pluggable-provider connector registry.
//
// First slice of notes/ideas/005 (pluggable provider spec). Today it exposes the
// capability matrix of the two bundled connectors (OpenRouter + ElevenLabs) and
// their availability. The `--provider <id>` flag on `ralphy generate <kind>`
// selects one of these; when omitted, the first available connector that serves
// the capability wins. Future slices add `provider add/remove/test` for
// third-party connectors loaded from `providers.toml`.

import { Command } from "commander";
import { out } from "../lib/output.js";
import { providerMatrix, type Capability } from "../lib/providers/registry.js";

const ALL_CAPS: Capability[] = ["text", "image", "video", "voice", "music", "sfx", "transcribe"];

export function providerCmd() {
  const cmd = new Command("provider").description(
    "Inspect provider connectors and their capability matrix (image / video / voice / music / sfx / text / transcribe).",
  );

  cmd
    .command("list")
    .description("List registered provider connectors, their capabilities, and whether each is configured (key present).")
    .action(() => {
      const rows = providerMatrix();
      out({
        capabilities: ALL_CAPS,
        providers: rows.map((r) => ({
          id: r.id,
          label: r.label,
          envVar: r.envVar,
          available: r.available,
          capabilities: r.capabilities,
          // matrix row: capability -> served?
          matrix: Object.fromEntries(ALL_CAPS.map((c) => [c, r.capabilities.includes(c)])),
        })),
      });
    });

  return cmd;
}

// `ralphy voice <exists|list|show>` — ElevenLabs voice library pre-flight.
//
// Analog-horror-fridge-001 postmortem flagged a 404 mid-batch when an
// ElevenLabs voice ID got deleted between VO v2 and v3 — wasted gen turn
// + reconfigure. Pre-flight `ralphy voice exists <id>` catches it before
// `ralphy generate voiceover` commits a batch.

import { Command } from "commander";
import { out, err } from "../lib/output.js";
import { requireCapability } from "../lib/capabilities.js";

export function voiceCmd(): Command {
  const cmd = new Command("voice").description(
    "ElevenLabs voice library inspection — pre-flight checks before VO batches.",
  );

  cmd
    .command("exists <voiceId>")
    .description(
      "Pre-flight check that an ElevenLabs voice ID resolves. Returns 200 + voice metadata if OK, exits 1 with a clear error if 404. Run before any multi-clip VO batch.",
    )
    .action(async (voiceId: string) => {
      requireCapability("voiceover-elevenlabs");
      const apiKey = process.env.ELEVENLABS_API_KEY!;
      const resp = await fetch(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voiceId)}`, {
        headers: { "xi-api-key": apiKey },
      });
      if (resp.status === 404) {
        err(
          `ElevenLabs voice not found: ${voiceId}. Check the ID at https://elevenlabs.io/app/voice-library, or run \`ralphy voice list\` for your library.`,
        );
      }
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        err(`ElevenLabs voices ${resp.status}: ${text.slice(0, 400)}`);
      }
      const v = (await resp.json()) as Record<string, unknown>;
      out({
        voiceId,
        exists: true,
        name: v.name,
        category: v.category,
        labels: v.labels,
        description: v.description,
      });
    });

  cmd
    .command("list")
    .description("List voices available on the user's ElevenLabs account (custom clones + favorites).")
    .action(async () => {
      requireCapability("voiceover-elevenlabs");
      const apiKey = process.env.ELEVENLABS_API_KEY!;
      const resp = await fetch("https://api.elevenlabs.io/v1/voices", {
        headers: { "xi-api-key": apiKey },
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        err(`ElevenLabs voices ${resp.status}: ${text.slice(0, 400)}`);
      }
      const json = (await resp.json()) as { voices?: Array<Record<string, unknown>> };
      out({
        count: json.voices?.length ?? 0,
        voices: (json.voices ?? []).map((v) => ({
          voice_id: v.voice_id,
          name: v.name,
          category: v.category,
          labels: v.labels,
        })),
      });
    });

  return cmd;
}

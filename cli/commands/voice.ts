// `ralphy voice <exists|list|show>` — ElevenLabs voice library pre-flight.
//
// Analog-horror-fridge-001 postmortem flagged a 404 mid-batch when an
// ElevenLabs voice ID got deleted between VO v2 and v3 — wasted gen turn
// + reconfigure. Pre-flight `ralphy voice exists <id>` catches it before
// `ralphy generate voiceover` commits a batch.

import { Command } from "commander";
import path from "node:path";
import { out, err } from "../lib/output.js";
import { requireCapability } from "../lib/capabilities.js";
import { cloneVoice, designVoice, createVoiceFromPreview } from "../lib/providers/elevenlabs.js";

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
    .command("clone")
    .description(
      "Clone a voice into your ElevenLabs library via Instant Voice Cloning (/v1/voices/add). Optional pre-pass through /v1/audio-isolation strips background music / noise (#030).",
    )
    .requiredOption("--from <path>", "Local audio sample (mp3 / wav / m4a). 30s-2min of clean speech works best.")
    .requiredOption("--name <name>", "Display name for the new voice")
    .option("--description <text>", "Voice description (stored on ElevenLabs)")
    .option("--isolate", "Run the source through /v1/audio-isolation first to strip background music / noise. Off by default — opt-in for hard cases (location recording, footage rip).", false)
    .option("--no-denoise", "Disable the voices/add server-side denoise pass. Default: denoise on (remove_background_noise=true) — tribal-knowledge gotcha #030.")
    .option("--project <id>", "Project id to attach the clone to in the gen-log (optional — without it the clone is a one-off setup action).")
    .action(async (opts) => {
      requireCapability("voiceover-elevenlabs");
      const from = path.resolve(opts.from);
      try {
        const result = await cloneVoice({
          projectId: opts.project,
          fromPath: from,
          name: opts.name,
          description: opts.description,
          isolate: !!opts.isolate,
          denoise: opts.denoise !== false,
        });
        out({
          voice_id: result.voiceId,
          name: result.name,
          isolated_path: result.isolatedPath,
          latency_ms: result.latencyMs,
        });
      } catch (e) {
        err((e as Error).message);
      }
    })
    .addHelpText(
      "after",
      `
Examples:
  ralphy voice clone --from artifacts/refs/narrator.mp3 --name "Alerter"
  ralphy voice clone --from artifacts/refs/podcast-rip.mp3 --name "Host" --isolate
  ralphy voice clone --from artifacts/refs/clean.wav --name "PSA" --project analog-horror-001
`,
    );

  cmd
    .command("design")
    .description(
      "Design a brand-new voice from a text description (POST /v1/text-to-voice/design). Writes ~3 preview mp3s; a human picks one BY EAR, then `ralphy voice create` freezes it into the library. The pick is deliberately human-only.",
    )
    .requiredOption("--description <text>", "Voice description, 20-1000 chars (accent, age, tone, pacing, vibe)")
    .option("--text <text>", "Sample text the previews read (100-1000 chars). Omitted: auto-generated to match the description.")
    .option("--out <dir>", "Directory for the preview mp3s", ".")
    .option("--stem <stem>", "Filename stem for previews (<stem>-1.mp3 ...)", "voice-design-preview")
    .option("--model <model>", "TTV model id", "eleven_multilingual_ttv_v2")
    .option("--project <id>", "Project id for gen-log attribution")
    .action(async (opts) => {
      requireCapability("voiceover-elevenlabs");
      try {
        const result = await designVoice({
          description: opts.description,
          text: opts.text,
          model: opts.model,
          outDir: path.resolve(opts.out),
          stem: opts.stem,
          projectId: opts.project,
        });
        out({
          previews: result.previews.map((p) => ({
            generated_voice_id: p.generatedVoiceId,
            path: p.path,
            duration_secs: p.durationSecs ?? null,
          })),
          text: result.text ?? null,
          next: "Listen, pick one, then: ralphy voice create --preview <generated_voice_id> --name <name> --description \"<same description>\"",
        });
      } catch (e) {
        err((e as Error).message);
      }
    })
    .addHelpText(
      "after",
      `
Examples:
  ralphy voice design --description "Calm, warm male narrator in his 30s, relaxed pace, soft consonants, documentary storyteller" --out artifacts/voiceover
  ralphy voice design --description "Dry sardonic female tech reviewer, quick pace" --text "The first computer program is older than the light bulb." --project my-video-001
`,
    );

  cmd
    .command("create")
    .description(
      "Freeze a designed preview into a permanent library voice (POST /v1/text-to-voice). Takes the generated_voice_id printed by `ralphy voice design`.",
    )
    .requiredOption("--preview <generatedVoiceId>", "generated_voice_id of the picked preview")
    .requiredOption("--name <name>", "Display name for the new library voice")
    .requiredOption("--description <text>", "Voice description (required by ElevenLabs on create)")
    .option("--project <id>", "Project id for gen-log attribution")
    .action(async (opts) => {
      requireCapability("voiceover-elevenlabs");
      try {
        const result = await createVoiceFromPreview({
          generatedVoiceId: opts.preview,
          name: opts.name,
          description: opts.description,
          projectId: opts.project,
        });
        out({ voice_id: result.voiceId, name: result.name, latency_ms: result.latencyMs });
      } catch (e) {
        err((e as Error).message);
      }
    })
    .addHelpText(
      "after",
      `
Examples:
  ralphy voice create --preview 6xVzKcYDblCkVCLchLpV --name "Ada Narrator" --description "Calm, warm male narrator in his 30s, relaxed documentary pace"
`,
    );

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

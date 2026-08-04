// `ralphy voice <exists|list|show>` — ElevenLabs voice library pre-flight.
//
// Analog-horror-fridge-001 postmortem flagged a 404 mid-batch when an
// ElevenLabs voice ID got deleted between VO v2 and v3 — wasted gen turn
// + reconfigure. Pre-flight `ralphy voice exists <id>` catches it before
// `ralphy generate voiceover` commits a batch.

import { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import { out, err } from "../lib/output.js";
import { requireCapability } from "../lib/capabilities.js";
import { cloneVoice, designVoice, createVoiceFromPreview } from "../lib/providers/elevenlabs.js";
import { credentialValue } from "../lib/providers/credentials.js";
import { produceArtifactRevision } from "../lib/artifact-production.js";
import { ralphDir } from "../lib/paths.js";
import {
  completeArtifactRunSet,
  finishRun,
  finishRunAttempt,
  projectRunFailure,
  startRun,
  startRunAttempt,
} from "../lib/store/runs.js";

function voiceArtifactSlug(prefix: string, value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${prefix}-${normalized || "voice"}`;
}

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
      const apiKey = credentialValue("elevenlabs")!;
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
    .requiredOption("--project <id>", "Project ID")
    .action(async (opts) => {
      requireCapability("voiceover-elevenlabs");
      const from = path.resolve(opts.from);
      try {
        const slug = voiceArtifactSlug("voice-clone", opts.name);
        let result: Awaited<ReturnType<typeof cloneVoice>> | undefined;
        const completed = await produceArtifactRevision({
          scope: { projectId: opts.project }, runKind: "voice.clone", requestedOutput: `${slug}.json`,
          artifactKind: "data", mime: "application/json", provider: "elevenlabs", model: "voices/add",
          metadata: { isolate: !!opts.isolate, denoise: opts.denoise !== false },
          produce: async (outputPath) => {
            result = await cloneVoice({ fromPath: from, name: opts.name,
              description: opts.description, isolate: !!opts.isolate,
              denoise: opts.denoise !== false, workDir: path.dirname(outputPath) });
            await fs.writeFile(outputPath, JSON.stringify({ voiceId: result.voiceId, name: result.name }), "utf8");
            return { localPath: outputPath, model: "voices/add", costUsd: result.costUsd,
              latencyMs: result.latencyMs };
          },
        });
        out({
          voice_id: result!.voiceId,
          name: result!.name,
          artifactId: completed.artifact.id,
          revisionId: completed.revision.id,
          runId: completed.run.id,
          latency_ms: result!.latencyMs,
        });
      } catch (e) {
        err(projectRunFailure(e, { provider: "elevenlabs" }).message);
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
    .option("--out <name>", "Artifact-set name for the preview candidates", ".")
    .option("--stem <stem>", "Artifact stem for previews (<stem>-1 ...)", "voice-design-preview")
    .option("--model <model>", "TTV model id", "eleven_multilingual_ttv_v2")
    .requiredOption("--project <id>", "Project ID")
    .action(async (opts) => {
      requireCapability("voiceover-elevenlabs");
      const setName = opts.out === "." ? opts.stem : `${path.basename(opts.out)}-${opts.stem}`;
      const baseSlug = voiceArtifactSlug("voice-design", setName);
      const run = startRun({ projectId: opts.project, kind: "voice.design", label: baseSlug });
      const attempt = startRunAttempt({
        runId: run.id,
        provider: "elevenlabs",
        model: opts.model,
        request: { previewSet: baseSlug },
      });
      try {
        const result = await designVoice({
          description: opts.description,
          text: opts.text,
          model: opts.model,
          outDir: path.join(ralphDir(), "tmp", run.id),
          stem: "preview",
        });
        for (const preview of result.previews) assertGeneratedVoiceId(preview.generatedVoiceId);
        const completed = await completeArtifactRunSet({
          runId: run.id,
          attemptId: attempt.id,
          outputs: result.previews.map((preview, index) => ({
            finishedPath: preview.path,
            originalName: `${baseSlug}-${index + 1}.mp3`,
            mime: "audio/mpeg",
            artifact: {
              slug: `${baseSlug}-${index + 1}`,
              kind: "audio",
              state: "candidate",
              metadata: {
                generatedVoiceId: preview.generatedVoiceId,
                durationSecs: preview.durationSecs ?? null,
              },
            },
            objectMetadata: { provider: "elevenlabs", model: opts.model },
          })),
          response: { model: opts.model, latencyMs: result.latencyMs, previewCount: result.previews.length },
          costUsd: 0,
        });
        out({
          previews: result.previews.map((p, index) => ({
            generated_voice_id: p.generatedVoiceId,
            duration_secs: p.durationSecs ?? null,
            artifactId: completed.outputs[index]!.artifact.id,
            revisionId: completed.outputs[index]!.revision.id,
          })),
          runId: completed.run.id,
          text: result.text ?? null,
          next: "Listen, pick one, then: ralphy voice create --preview <generated_voice_id> --name <name> --description \"<same description>\"",
        });
      } catch (e) {
        const projected = projectRunFailure(e, { provider: "elevenlabs" });
        try {
          finishRunAttempt(attempt.id, { state: "failed", error: projected });
        } catch {
          // Completion may already have terminalized the Attempt.
        }
        try {
          finishRun(run.id, { state: "failed", error: projected });
        } catch {
          // Completion may already have terminalized the Run.
        }
        err(projected.message);
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
    .requiredOption("--project <id>", "Project ID")
    .action(async (opts) => {
      requireCapability("voiceover-elevenlabs");
      try {
        const slug = voiceArtifactSlug("voice", opts.name);
        let result: Awaited<ReturnType<typeof createVoiceFromPreview>> | undefined;
        const completed = await produceArtifactRevision({
          scope: { projectId: opts.project }, runKind: "voice.create", requestedOutput: `${slug}.json`,
          artifactKind: "data", mime: "application/json", provider: "elevenlabs", model: "text-to-voice",
          metadata: { generatedVoiceId: opts.preview },
          produce: async (outputPath) => {
            result = await createVoiceFromPreview({ generatedVoiceId: opts.preview,
              name: opts.name, description: opts.description });
            await fs.writeFile(outputPath, JSON.stringify({ voiceId: result.voiceId, name: result.name }), "utf8");
            return { localPath: outputPath, model: "text-to-voice", costUsd: 0,
              latencyMs: result.latencyMs };
          },
        });
        out({ voice_id: result!.voiceId, name: result!.name, artifactId: completed.artifact.id,
          revisionId: completed.revision.id, runId: completed.run.id, latency_ms: result!.latencyMs });
      } catch (e) {
        err(projectRunFailure(e, { provider: "elevenlabs" }).message);
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
      const apiKey = credentialValue("elevenlabs")!;
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

function assertGeneratedVoiceId(value: string): void {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new Error("ElevenLabs returned an invalid generated_voice_id");
  }
}

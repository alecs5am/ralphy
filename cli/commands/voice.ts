// `ralphy voice <exists|clone|design|create|add|list>` — voice library management.
//
// Analog-horror-fridge-001 postmortem flagged a 404 mid-batch when an
// ElevenLabs voice ID got deleted between VO v2 and v3 — wasted gen turn
// + reconfigure. Pre-flight `ralphy voice exists <id>` catches it before
// `ralphy generate voiceover` commits a batch.
//
// Two providers share the surface (#555): ElevenLabs (default) and HeyGen,
// whose clones are what let a talking head read a line in the performer's own
// voice. `--provider heygen` switches the connector, not the verb — same
// intent, same output shape, one flag. Every clone is persisted into the
// workspace performer store under a local slug so `generate lipsync --voice
// <slug>` and `generate voiceover --voice <slug>` never need a raw id.

import { Command } from "commander";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { out, err, ok } from "../lib/output.js";
import { requireCapability } from "../lib/capabilities.js";
import { slugify } from "../lib/ids.js";
import { currentWorkspace, workspaceDir } from "../lib/paths.js";
import { compressVoiceSample } from "../lib/ffmpeg-recipes.js";
import { loadPerformers, putVoice } from "../lib/avatars.js";
import { cloneVoice, designVoice, createVoiceFromPreview } from "../lib/providers/elevenlabs.js";
import {
  cloneVoice as cloneHeygenVoice,
  getHeygenVoice,
  listHeygenVoices,
  waitForVoice,
} from "../lib/providers/heygen.js";

const VIDEO_EXTS = new Set([".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v"]);

/**
 * HeyGen's clone endpoint wants audio, but the source is usually a clip. Strip
 * the track into a throwaway mono mp3 rather than writing a derived artifact
 * into the project (AGENTS invariant #14 — nothing new lands in artifacts/
 * unless the user asked for it).
 */
async function audioForClone(source: string): Promise<{ path: string; tmpDir?: string }> {
  if (!VIDEO_EXTS.has(path.extname(source).toLowerCase())) return { path: source };
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ralphy-voice-"));
  const dst = path.join(tmpDir, `${path.basename(source, path.extname(source))}.mp3`);
  await compressVoiceSample({ src: source, dst });
  return { path: dst, tmpDir };
}

/**
 * Persist a clone into the workspace performer store. Best-effort: a root with
 * no workspace yet still gets the raw id printed, it just isn't slug-addressable.
 */
async function persistVoice(record: {
  slug: string;
  provider: string;
  name: string;
  voiceId: string;
  language?: string;
  status?: string;
  sourceRef?: string;
}): Promise<{ slug: string; workspace: string } | { warning: string }> {
  const workspace = currentWorkspace();
  if (!existsSync(workspaceDir(workspace))) {
    return { warning: `workspace "${workspace}" does not exist yet — the voice was not stored under a local slug` };
  }
  const stored = await putVoice(workspace, record);
  return { slug: stored.slug, workspace };
}

export function voiceCmd(): Command {
  const cmd = new Command("voice").description(
    "ElevenLabs voice library inspection — pre-flight checks before VO batches.",
  );

  cmd
    .command("exists <voiceId>")
    .description(
      "Pre-flight check that a voice ID resolves. Returns 200 + voice metadata if OK, exits 1 with a clear error if 404. Run before any multi-clip VO batch.",
    )
    .option("--provider <id>", "Provider connector: elevenlabs (default) | heygen", "elevenlabs")
    .action(async (voiceId: string, opts: { provider: string }) => {
      if (opts.provider === "heygen") {
        try {
          const voice = await getHeygenVoice(voiceId);
          out({
            voiceId,
            exists: true,
            provider: "heygen",
            name: voice.name ?? null,
            status: voice.status ?? null,
            language: voice.language ?? null,
            supportedEngines: voice.supported_engines?.length ? voice.supported_engines : null,
          });
        } catch (e) {
          err((e as Error).message);
        }
        return;
      }
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
      "Clone a voice into your provider library — ElevenLabs Instant Voice Cloning (/v1/voices/add) or HeyGen (/v3/voices/clone). Persists the result in the workspace performer store under a local slug.",
    )
    .requiredOption("--from <path>", "Local audio sample (mp3 / wav / m4a) or a video clip — a video source has its track stripped locally first. 30s-2min of clean speech works best.")
    .requiredOption("--name <name>", "Display name for the new voice")
    .option("--provider <id>", "Provider connector: elevenlabs (default) | heygen", "elevenlabs")
    .option("--slug <slug>", "Local slug for the performer store. Default: slugified --name.")
    .option("--language <lang>", "Language hint for the clone (heygen: e.g. English)")
    .option("--wait", "heygen only: poll until the clone leaves `pending`", false)
    .option("--description <text>", "Voice description (elevenlabs only — stored on ElevenLabs)")
    .option("--isolate", "elevenlabs only: run the source through /v1/audio-isolation first to strip background music / noise. Off by default — opt-in for hard cases (location recording, footage rip).", false)
    .option("--no-denoise", "Disable the server-side denoise pass. Default: denoise on (remove_background_noise=true) — tribal-knowledge gotcha #030.")
    .option("--project <id>", "Project id to attach the clone to in the gen-log (optional — without it the clone is a one-off setup action).")
    .action(async (opts) => {
      const from = path.resolve(opts.from);
      if (!existsSync(from)) err(`Source not found: ${from}`);
      const slug = slugify(opts.slug || opts.name);

      if (opts.provider === "heygen") {
        // Account cap is 10 clones; the endpoint answers resource_limit_reached
        // past that, which surfaces verbatim.
        let tmpDir: string | undefined;
        try {
          const sample = await audioForClone(from);
          tmpDir = sample.tmpDir;
          const voiceId = await cloneHeygenVoice({
            source: sample.path,
            name: opts.name,
            language: opts.language,
            removeBackgroundNoise: opts.denoise !== false,
          });
          const settled = opts.wait
            ? await waitForVoice(voiceId)
            : await getHeygenVoice(voiceId).catch(() => ({ voice_id: voiceId, status: "pending" }));
          const persisted = await persistVoice({
            slug,
            provider: "heygen",
            name: opts.name,
            voiceId,
            language: opts.language,
            status: settled.status,
            sourceRef: opts.from,
          });
          ok(`Voice cloned: ${voiceId} (${settled.status ?? "pending"})`);
          out({
            provider: "heygen",
            voice_id: voiceId,
            name: opts.name,
            status: settled.status ?? "pending",
            stripped_from_video: Boolean(sample.tmpDir),
            ...persisted,
            next: `ralphy generate lipsync --avatar <slug> --script "<line>" --voice ${"slug" in persisted ? persisted.slug : voiceId}`,
          });
        } catch (e) {
          err((e as Error).message);
        } finally {
          if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
        }
        return;
      }

      requireCapability("voiceover-elevenlabs");
      try {
        const result = await cloneVoice({
          projectId: opts.project,
          fromPath: from,
          name: opts.name,
          description: opts.description,
          isolate: !!opts.isolate,
          denoise: opts.denoise !== false,
        });
        const persisted = await persistVoice({
          slug,
          provider: "elevenlabs",
          name: result.name,
          voiceId: result.voiceId,
          language: opts.language,
          status: "complete",
          sourceRef: opts.from,
        });
        out({
          provider: "elevenlabs",
          voice_id: result.voiceId,
          name: result.name,
          isolated_path: result.isolatedPath,
          latency_ms: result.latencyMs,
          ...persisted,
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
  ralphy voice clone --from artifacts/refs/presenter.mp4 --name "Marco" --provider heygen --wait
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
    .command("add <publicUserId> <voiceId>")
    .description(
      "Add a shared Voice Library voice to your account so its id resolves for TTS (POST /v1/voices/add/{public_user_id}/{voice_id}). Needs the owner's public_user_id from the voice's share data, not just the voice id. Returns the library voice_id to pass to `generate voiceover --voice`.",
    )
    .option("--name <name>", "Name for the added voice in your library. Default: library-<voiceId prefix>.")
    .action(async (publicUserId: string, voiceId: string, opts: { name?: string }) => {
      requireCapability("voiceover-elevenlabs");
      const apiKey = process.env.ELEVENLABS_API_KEY!;
      const newName = (opts.name && opts.name.trim()) || `library-${voiceId.slice(0, 8)}`;
      const resp = await fetch(
        `https://api.elevenlabs.io/v1/voices/add/${encodeURIComponent(publicUserId)}/${encodeURIComponent(voiceId)}`,
        {
          method: "POST",
          headers: { "xi-api-key": apiKey, "content-type": "application/json" },
          body: JSON.stringify({ new_name: newName }),
        },
      );
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        err(`ElevenLabs voices/add ${resp.status}: ${text.slice(0, 400)}`);
      }
      const json = (await resp.json()) as { voice_id?: string };
      out({
        added: true,
        source_voice_id: voiceId,
        public_user_id: publicUserId,
        library_voice_id: json.voice_id ?? voiceId,
        name: newName,
        next: `Use --voice ${json.voice_id ?? voiceId} in \`ralphy generate voiceover\`.`,
      });
    })
    .addHelpText(
      "after",
      `
Examples:
  ralphy voice add 70b349a6...41f6 WdZjiN0nNcik2LBjOHiv --name "David - Raspy and Soft"
`,
    );

  cmd
    .command("list")
    .description("List voices available on the account (custom clones + favorites), or the workspace's slug-addressable clones with --stored.")
    .option("--provider <id>", "Provider connector: elevenlabs (default) | heygen", "elevenlabs")
    .option("--stored", "List the workspace performer store (local slugs) instead of calling the provider", false)
    .option("--workspace <slug>", "Workspace to read with --stored. Default: active workspace.")
    .action(async (opts: { provider: string; stored?: boolean; workspace?: string }) => {
      if (opts.stored) {
        const workspace = opts.workspace?.trim() || currentWorkspace();
        const store = await loadPerformers(workspace);
        const voices = Object.values(store.voices);
        out({
          workspace,
          count: voices.length,
          voices: voices.map((v) => ({
            slug: v.slug,
            name: v.name,
            provider: v.provider,
            voice_id: v.voiceId,
            status: v.status ?? null,
            language: v.language ?? null,
          })),
        });
        return;
      }

      if (opts.provider === "heygen") {
        try {
          const voices = await listHeygenVoices();
          const stored = await loadPerformers(currentWorkspace());
          const bySlug = new Map(Object.values(stored.voices).map((v) => [v.voiceId, v.slug]));
          out({
            provider: "heygen",
            count: voices.length,
            voices: voices.map((v) => ({
              // The id field is `voice_id`, NOT `id` — a `.data[].id` jq path nulls.
              voice_id: v.voice_id,
              slug: bySlug.get(v.voice_id) ?? null,
              name: v.name ?? null,
              status: v.status ?? null,
              language: v.language ?? null,
            })),
          });
        } catch (e) {
          err((e as Error).message);
        }
        return;
      }

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

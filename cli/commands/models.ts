// `ralphy models <list|show>` — inspect OpenRouter video-model catalog.
//
// Each generate-video request is constrained by the model's
// `supported_durations`, `supported_resolutions`, `supported_aspect_ratios`,
// `supported_frame_images`. Surfacing those before submit lets users avoid
// the $0.70 round-trip + 2-min timeout when a value is rejected.
//
// Catalog data comes from `cli/lib/or-catalog.ts` which caches it for 24h
// at .ralphy/or-catalog.json (auto-refreshed; falls back to stale
// cache if OR is unreachable).

import { Command } from "commander";
import { out } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import {
  getOrCatalog,
  findVideoModel,
  estimateVideoCostUsd,
} from "../lib/or-catalog.js";
import { lookupAlias, aliasesFor, canonicalSlugs } from "../lib/model-aliases.js";
import {
  summarizeModelOutcomes,
  recommendModel,
  logModelOverride,
} from "../lib/models/telemetry.js";
import {
  preflightModelCall,
  type GenerateKind,
} from "../lib/models/constraints.js";

export function modelsCmd() {
  const cmd = new Command("models").description(
    "Inspect available OpenRouter video models and their per-model parameter constraints"
  );

  cmd
    .command("list")
    .description(
      "List all OR video-generation models with their per-model durations / resolutions / aspect-ratios / frame-anchor support"
    )
    .option("--refresh", "Force-refresh the catalog (ignore TTL cache)", false)
    .action(async (opts) => {
      const catalog = await getOrCatalog({ force: opts.refresh });
      const rows = catalog.videoModels.map((m) => ({
        id: m.id,
        durations: (m.supported_durations ?? []).join(","),
        resolutions: (m.supported_resolutions ?? []).join(","),
        aspects: (m.supported_aspect_ratios ?? []).join(","),
        frames: (m.supported_frame_images ?? []).join(","),
        priceUsd5s: estimateVideoCostUsd(m.id, 5),
      }));

      const ui = await import("../lib/ui.js");
      if (!ui.isPrettyMode()) {
        out({ fetchedAt: catalog.fetchedAt, count: rows.length, models: rows });
        return;
      }
      const { c, icons, section, table } = ui;
      section(`OpenRouter video models  ${c.muted(`(${rows.length} total, cached ${new Date(catalog.fetchedAt).toLocaleString()})`)}`);
      table(rows, [
        { key: "id", header: "model id", format: (v) => c.cmd(String(v)) },
        { key: "durations", header: "durations (s)" },
        { key: "resolutions", header: "res" },
        { key: "aspects", header: "aspects" },
        { key: "frames", header: "frame anchors", format: (v) => (String(v).includes("last_frame") ? c.brand(String(v)) : c.muted(String(v))) },
        { key: "priceUsd5s", header: "$/5s", format: (v) => c.value("$" + Number(v).toFixed(2)) },
      ]);
      console.log();
      console.log(`  ${icons.bullet} ${c.cmd("ralphy models show <id>")}    full schema + price tiers`);
      console.log(`  ${icons.bullet} ${c.cmd("ralphy models alias <name>")}  resolve shorthand (kling, nano-banana, ...)`);
      console.log();
    });

  cmd
    .command("show <id>")
    .description(
      "Show full per-model schema (description + params + price estimate) for one model"
    )
    .option("--refresh", "Force-refresh the catalog (ignore TTL cache)", false)
    .action(async (id, opts) => {
      if (opts.refresh) await getOrCatalog({ force: true });
      const m = await findVideoModel(id);
      if (!m) {
        raiseError("E_NOT_FOUND", { kind: "Model", id });
      }
      out({
        id: m.id,
        name: m.name,
        description: m.description,
        supported_durations: m.supported_durations,
        supported_resolutions: m.supported_resolutions,
        supported_aspect_ratios: m.supported_aspect_ratios,
        supported_frame_images: m.supported_frame_images,
        supported_input_references: m.supported_input_references,
        priceUsdPerSec: estimateVideoCostUsd(m.id, 1),
        priceUsd5s: estimateVideoCostUsd(m.id, 5),
        priceUsd10s: estimateVideoCostUsd(m.id, 10),
      });
    });

  cmd
    .command("alias [shorthand]")
    .description(
      "Resolve a model shorthand (`kling`, `nano banana pro`, `gpt image 2`, ...) to its canonical OpenRouter slug. With no argument, prints the full alias map.",
    )
    .action((shorthand?: string) => {
      if (!shorthand) {
        // No argument — dump the full map grouped by canonical slug.
        const map: Record<string, string[]> = {};
        for (const c of canonicalSlugs()) map[c] = aliasesFor(c);
        out(map);
        return;
      }
      const { canonical, matched } = lookupAlias(shorthand);
      out({
        shorthand,
        canonical,
        matched,
        siblings: canonical && matched ? aliasesFor(canonical) : [],
      });
    });

  // `models recommend --mode <m> [--task <t>] [--kind <k>]` — model-router
  // telemetry (#424). Ranks the observed-outcome summary for the query and
  // recommends a model; falls back to the MODELS.md/registry default (and says
  // so) when telemetry is thin. PURE LOG READING — no provider calls, no
  // network. `--chose <model> --reason <why>` logs a manual override against the
  // recommendation so the choice stays auditable.
  cmd
    .command("recommend")
    .description(
      "Recommend a model for a content mode from observed generation telemetry (#424). Ranks the (model, mode, task) outcome summary by ok-rate + eval signal; falls back to the MODELS.md/registry default (and says the basis is the default) when telemetry is thin. PURE log reading — no provider calls. Use --chose <model> --reason <why> to log a manual override against the recommendation (auditable JSONL at .ralphy/model-overrides.jsonl).",
    )
    .requiredOption("--mode <mode>", "Content mode to recommend for (e.g. ugc-review)")
    .option("--task <task>", "Finer task tag to filter by (e.g. scene-anchor, i2v, vo)")
    .option("--kind <kind>", "Media kind to scope the default fallback (image|video|voiceover|music|sfx|text)")
    .option("--project <id>", "Limit telemetry to a single project (default: all registered projects)")
    .option("--chose <model>", "Log a manual override: the model you chose instead of the recommendation")
    .option("--reason <why>", "Reason for the override (required with --chose)")
    .action(async (opts) => {
      const summary = await summarizeModelOutcomes({ projectId: opts.project });
      const query = { mode: opts.mode, task: opts.task, kind: opts.kind };
      const recommendation = recommendModel(summary, query);

      let override = undefined;
      if (opts.chose) {
        if (!opts.reason) {
          raiseError("E_VALIDATION_FAILED", { target: "models recommend", detail: "--chose requires --reason" });
        }
        override = await logModelOverride({
          recommended: recommendation.model,
          chosen: opts.chose,
          reason: opts.reason,
          query,
          projectId: opts.project,
        });
      }

      out({ query, recommendation, override, scanned: { projects: summary.projectCount, rows: summary.rowCount } });
    });

  // `models preflight` — agent-facing dry constraint check (#445). Validates a
  // PLANNED generate call against the per-model constraint table (max prompt
  // chars, kling multiframe base64, ref-count cap, --audio support, ElevenLabs
  // duration range) BEFORE spending. Catalog-backed video limits (durations /
  // resolutions / aspect / frame anchors) are validated by the live `generate
  // video --dry-run` path / `ralphy models show <id>`; this verb is PURE — no
  // network, no provider calls. `ok: false` means a guaranteed provider 400.
  cmd
    .command("preflight")
    .description(
      "Dry-check a planned generation call against known per-model constraints the OR catalog does NOT carry (max prompt chars, kling multiframe base64 bug, ref-count cap, --audio support, ElevenLabs duration range) — #445. PURE: no network, no provider calls, no spend. Returns { ok, violations[], hints[], recommendedFallbacks[] }; ok=false means a guaranteed provider 400.",
    )
    .requiredOption("--kind <kind>", "Generation kind: image | video | voiceover | music | sfx | eval")
    .requiredOption("--model <id>", "Model id (canonical OR slug, or elevenlabs-tts | elevenlabs-music | elevenlabs-sfx)")
    .option("--prompt-chars <n>", "Planned prompt length in characters", (v) => parseInt(v, 10))
    .option("--refs <n>", "Planned reference-image count", (v) => parseInt(v, 10))
    .option("--first-frame", "A first-frame anchor will be supplied", false)
    .option("--last-frame", "A last-frame anchor will be supplied", false)
    .option("--aspect <aspect>", "Planned aspect ratio (e.g. 9:16)")
    .option("--size <size>", "Planned --size (WxH); flagged when the model ignores it in favor of --aspect")
    .option("--audio", "The --audio flag will be passed", false)
    .option("--duration <seconds>", "Planned duration in seconds", parseFloat)
    .option("--concurrency <n>", "Planned in-flight concurrency", (v) => parseInt(v, 10))
    .action((opts) => {
      const result = preflightModelCall({
        kind: opts.kind as GenerateKind,
        modelId: opts.model,
        promptChars: opts.promptChars,
        refCount: opts.refs,
        hasFirstFrame: Boolean(opts.firstFrame),
        hasLastFrame: Boolean(opts.lastFrame),
        aspect: opts.aspect,
        size: opts.size,
        audio: Boolean(opts.audio),
        durationSec: opts.duration,
        concurrency: opts.concurrency,
      });
      out({ kind: opts.kind, model: opts.model, ...result });
    });

  return cmd;
}

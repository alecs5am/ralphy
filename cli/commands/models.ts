// `ralphy models <list|show>` — inspect OpenRouter video-model catalog.
//
// Each generate-video request is constrained by the model's
// `supported_durations`, `supported_resolutions`, `supported_aspect_ratios`,
// `supported_frame_images`. Surfacing those before submit lets users avoid
// the $0.70 round-trip + 2-min timeout when a value is rejected.
//
// Catalog data comes from `cli/lib/or-catalog.ts` which caches it for 24h
// at workspace/.ralph/or-catalog.json (auto-refreshed; falls back to stale
// cache if OR is unreachable).

import { Command } from "commander";
import { out, err, isPretty } from "../lib/output.js";
import {
  getOrCatalog,
  findVideoModel,
  estimateVideoCostUsd,
} from "../lib/or-catalog.js";

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
      if (isPretty()) {
        out({ fetchedAt: catalog.fetchedAt, models: rows });
      } else {
        out({ fetchedAt: catalog.fetchedAt, count: rows.length, models: rows });
      }
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
        err(
          `Model not found in OR video catalog: ${id}. Run \`ralphy models list\` to see what's available.`
        );
        return;
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

  return cmd;
}

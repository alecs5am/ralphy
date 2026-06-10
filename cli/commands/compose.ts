// `ralphy compose <project-id>` — timeline-aware compose verb.
//
// Issue #013. Wraps the new composer library (cli/lib/composer.ts) so the
// agent never has to hand-roll concat+VO+music ffmpeg graphs.
//
// MVP CLI surface:
//   ralphy compose <project-id>
//       Build a Timeline from artifacts/ + scenario.json + scribe captions, then
//       render a single mp4 to render/compose.mp4 (or compose-v2.mp4, ...
//       per AGENTS.md invariant #14 — append-only).
//
//   ralphy compose <project-id> --remove-segment <slot>
//       Same, but drop the named segment first and re-flow VO + caption
//       offsets + music fades. Repeatable.
//
//   ralphy compose <project-id> --dry-run
//       Print the resolved Timeline (and the proposed ffmpeg filter graph)
//       without spawning ffmpeg.
//
//   ralphy compose <project-id> --out <path>
//       Override the output path. Collisions still bump to vN.

import { Command } from "commander";
import path from "node:path";
import fs from "node:fs/promises";

import { projectDir } from "../lib/paths.js";
import { out, err, isPretty } from "../lib/output.js";
import { c, icons, section, kv } from "../lib/ui.js";
import { logGeneration } from "../lib/gen-log.js";
import {
  buildFilterGraph,
  buildTimelineFromProject,
  checkFilterGraph,
  mutateTimelineRemoveSegment,
  pickNonClobberOutPath,
  renderTimeline,
  type Timeline,
} from "../lib/composer.js";

export function composeCmd(): Command {
  return new Command("compose")
    .description(
      "Timeline-aware composer. Reads artifacts/ + scenario.json + scribe captions, builds a Timeline, optionally re-flows after structural edits, and renders a single mp4. Replaces the hand-rolled concat+VO+music+loudnorm ffmpeg cycle (#013).",
    )
    .argument("<projectId>", "Project id under workspace/projects/")
    .option(
      "--remove-segment <slot>",
      "Drop the segment with this slot id and re-flow VO + captions + music. Repeatable.",
      (value: string, prev: string[] | undefined) => {
        const acc = prev ?? [];
        acc.push(value);
        return acc;
      },
    )
    .option(
      "--out <path>",
      "Output path (default: workspace/projects/<id>/render/compose.mp4). Collisions auto-bump to -v2, -v3, ...",
    )
    .option("--dry-run", "Print the resolved timeline + filter graph; do not spawn ffmpeg.")
    .action(
      async (
        projectId: string,
        opts: { removeSegment?: string[]; out?: string; dryRun?: boolean },
      ) => {
        const dir = projectDir(projectId);
        try {
          await fs.access(dir);
        } catch {
          err(`Project not found: ${projectId}`);
        }

        // Log the user-facing invocation up front so the timeline rebuild +
        // any errors land in the canonical gen-log for postmortems.
        await logGeneration(projectId, {
          provider: "ffmpeg",
          model: "ffmpeg/compose-invoke",
          endpoint: "ffmpeg/compose-invoke",
          kind: "other",
          input: {
            project: projectId,
            slot: "compose",
            remove_segments: opts.removeSegment ?? [],
            out: opts.out ?? null,
            dry_run: Boolean(opts.dryRun),
          },
          status: "ok",
          cost_usd: 0,
          note: "compose invocation",
        });

        let timeline: Timeline;
        try {
          timeline = await buildTimelineFromProject(projectId);
        } catch (e) {
          err(`Failed to build timeline: ${(e as Error).message}`);
        }

        // Apply --remove-segment mutations in order.
        const removed: string[] = [];
        const notFound: string[] = [];
        for (const slot of opts.removeSegment ?? []) {
          const before = timeline.segments.length;
          timeline = mutateTimelineRemoveSegment(timeline, slot);
          if (timeline.segments.length === before) notFound.push(slot);
          else removed.push(slot);
        }

        if (timeline.segments.length === 0) {
          err(
            `Timeline has no segments after mutations. Removed: [${removed.join(", ")}], not-found: [${notFound.join(", ")}].`,
          );
        }

        const defaultOut = path.join(dir, "render", "compose.mp4");
        const desiredOut = opts.out ?? defaultOut;
        const outPath = await pickNonClobberOutPath(desiredOut);

        // Build the filter graph eagerly so dry-run can show it AND so a
        // label-collision regression fails fast even on dry-run.
        const graph = buildFilterGraph(timeline);
        const validity = checkFilterGraph(graph.filter);

        const payload = {
          project: projectId,
          dryRun: Boolean(opts.dryRun),
          out: outPath,
          removed_segments: removed,
          not_found_segments: notFound,
          timeline: {
            total_duration_s: timeline.total_duration_s,
            segments: timeline.segments.map((s) => ({
              slot: s.slot,
              duration_s: s.duration_s,
              trim_in_s: s.trim_in_s,
              trim_out_s: s.trim_out_s,
            })),
            vo_clips: timeline.vo_track.clips.length,
            captions: timeline.captions_track.length,
            music: Boolean(timeline.music_track.path),
          },
          filter_graph: {
            inputs: graph.inputOrder,
            video_label: graph.videoLabel,
            audio_label: graph.audioLabel,
            filter: graph.filter,
            valid: validity.ok,
            issues: validity.issues,
          },
        };

        if (opts.dryRun) {
          if (!isPretty()) {
            out(payload);
            return;
          }
          console.log();
          console.log(`${icons.ok} ${c.bold(`compose ${projectId}`)}  ${c.muted("(dry-run)")}`);
          section("Timeline", [
            `${c.label("Segments:")} ${c.value(String(timeline.segments.length))}`,
            `${c.label("Duration:")} ${c.value(`${timeline.total_duration_s}s`)}`,
            `${c.label("VO clips:")} ${c.value(String(timeline.vo_track.clips.length))}`,
            `${c.label("Captions:")} ${c.value(String(timeline.captions_track.length))}`,
            `${c.label("Music:   ")} ${c.value(timeline.music_track.path ? path.basename(timeline.music_track.path) : "—")}`,
          ]);
          if (removed.length || notFound.length) {
            section("Mutations");
            kv({ removed: removed.join(", ") || "—", "not found": notFound.join(", ") || "—" }, { maxKeyWidth: 12 });
          }
          section("Output");
          kv({ path: outPath }, { maxKeyWidth: 8 });
          console.log();
          return;
        }

        if (!validity.ok) {
          err(`Filter graph invalid:\n${validity.issues.join("\n")}`);
        }

        try {
          const written = await renderTimeline(timeline, outPath, {
            projectId,
            note: removed.length ? `compose --remove-segment ${removed.join(",")}` : "compose",
          });
          if (!isPretty()) {
            out({ ...payload, written });
            return;
          }
          console.log();
          console.log(`${icons.ok} ${c.bold(`compose ${projectId}`)}  ${c.ok("rendered")}`);
          section("Output");
          kv({ path: written, "duration (s)": timeline.total_duration_s }, { maxKeyWidth: 14 });
          console.log();
        } catch (e) {
          // Log the failure to gen-log (renderTimeline only logs OK rows).
          await logGeneration(projectId, {
            provider: "ffmpeg",
            model: "ffmpeg/compose-timeline",
            endpoint: "ffmpeg/compose-timeline",
            kind: "video",
            input: {
              project: projectId,
              slot: "compose",
              segments: timeline.segments.length,
              out: outPath,
            },
            status: "error",
            error: (e as Error).message.slice(0, 500),
            cost_usd: 0,
            note: "compose failure",
          });
          err((e as Error).message);
        }
      },
    );
}

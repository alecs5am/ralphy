import { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import { getCommandContext } from "../lib/context-state.js";
import { raiseError } from "../lib/errors/index.js";
import { out } from "../lib/output.js";
import { runCompositionBuild, videoCompositionForProject } from "../lib/composition-build.js";
import { projectDir } from "../lib/paths.js";
import {
  buildFilterGraph,
  buildTimelineFromProject,
  checkFilterGraph,
  mutateTimelineRemoveSegment,
  pickNonClobberOutPath,
  renderTimeline,
} from "../lib/composer.js";

/** Deprecated ffmpeg spelling; Composition owns the lifecycle. */
export function composeCmd(): Command {
  return new Command("compose")
    .description("Deprecated alias for composition build")
    .argument("<projectId>", "Project ID")
    .option("--profile <name>", "Build profile", "default")
    .option("--remove-segment <slot>", "Legacy segment removal", (value, previous: string[] = []) => [...previous, value], [] as string[])
    .option("--out <path>", "Legacy output path")
    .option("--dry-run", "Print the legacy render plan")
    .action(async (projectId: string, opts: { profile: string; removeSegment: string[]; out?: string; dryRun?: boolean }) => {
      const context = getCommandContext();
      if (context === null) {
        let timeline = await buildTimelineFromProject(projectId);
        const removed: string[] = [];
        const notFound: string[] = [];
        for (const slot of opts.removeSegment) {
          const next = mutateTimelineRemoveSegment(timeline, slot);
          if (next.segments.length === timeline.segments.length) notFound.push(slot);
          else removed.push(slot);
          timeline = next;
        }
        const desired = opts.out ?? path.join(projectDir(projectId), "render", "compose.mp4");
        const outputPath = await pickNonClobberOutPath(desired);
        const graph = buildFilterGraph(timeline);
        const validity = checkFilterGraph(graph.filter);
        const payload = {
          project: projectId,
          dryRun: Boolean(opts.dryRun),
          out: outputPath,
          removed_segments: removed,
          not_found_segments: notFound,
          timeline: {
            total_duration_s: timeline.total_duration_s,
            segments: timeline.segments,
            vo_clips: timeline.vo_track.clips.length,
            captions: timeline.captions_track.length,
            music: Boolean(timeline.music_track.path),
          },
          filter_graph: { inputs: graph.inputOrder, video_label: graph.videoLabel, audio_label: graph.audioLabel, filter: graph.filter, valid: validity.ok, issues: validity.issues },
        };
        if (opts.dryRun) { out(payload); return; }
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        const written = await renderTimeline(timeline, outputPath, { projectId, note: "compose" });
        out({ ...payload, written });
        return;
      }
      if (opts.removeSegment.length > 0 || opts.out !== undefined) {
        raiseError("E_INPUT_INVALID", {
          field: opts.removeSegment.length > 0 ? "removeSegment" : "out",
          detail: "--remove-segment and --out are only supported by the legacy compose workflow",
          verb: "compose",
        });
      }
      const query = context.kind === "session" ? { sessionId: context.sessionId } : {
        workspaceId: context.workspaceId, ...(context.projectId ? { projectId: context.projectId } : {}),
      };
      const composition = videoCompositionForProject(query, projectId);
      if (!composition.latestRevisionId) throw new Error(`Composition has no revision: ${composition.id}`);
      if (opts.dryRun) {
        out({
          dryRun: true,
          engine: "composition",
          projectId,
          compositionId: composition.id,
          revisionId: composition.latestRevisionId,
          profile: { name: opts.profile },
        });
        return;
      }
      out(await runCompositionBuild({
        compositionId: composition.id,
        revisionId: composition.latestRevisionId,
        profile: { name: opts.profile },
        ...(context.kind === "session" ? { authoredBySessionId: context.sessionId } : {}),
      }));
    });
}

// Helpers shared across generic-template compositions in this directory.
//
// Each template composition reads paths via `staticFile()` under a per-project
// prefix (public/project-<slug>/). The CLI's `ralphy render` symlinks
// workspace/projects/<id>/assets → public/project-<id>, so any path in props
// is relative to the project's assets/ root.

import type { Caption } from "@remotion/captions";

export const FPS = 30;

export type BaseProps = {
  /** Project slug — `staticFile(${projectPrefix(slug)}/<path>)` resolves to public/project-<slug>/<path>. */
  projectSlug: string;
  /** Total render duration in seconds. Composition's calculateMetadata translates to durationInFrames. */
  durationSec: number;
};

export function projectPrefix(slug: string): string {
  return `project-${slug}`;
}

export function calculateMetadataFromDurationSec({
  props,
}: {
  props: { durationSec?: number };
}) {
  return { durationInFrames: Math.max(1, Math.round((props.durationSec ?? 30) * FPS)) };
}

/**
 * Scribe v1 word tokens have no leading whitespace; HormoziCaptions /
 * KaraokeCaptions concatenate inline. Prepend a space to every non-first token
 * so phrase rendering doesn't run words together.
 */
export function normalizeCaptions(captions: Caption[]): Caption[] {
  return captions.map((c, i) =>
    i === 0 ? c : { ...c, text: c.text.startsWith(" ") ? c.text : ` ${c.text}` },
  );
}

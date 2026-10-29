// Motion catalog paths (#563).
//
// Split by weight, on purpose:
// - Definitions (manifest + HyperFrames fragments, small text) are repo-tracked
//   under `<repo>/catalog/`, next to `guidelines/`: engine-shipped craft that
//   every workspace shares and that reviews in a diff.
// - Binaries (SFX pack, rendered previews, preview builds, the static page)
//   live under the gitignored data root at `.ralphy/catalog/`. They are
//   cross-workspace, so they sit beside the global `references/` tier, not in a
//   single workspace's `shared/`.

import path from "node:path";
import { root, workspace } from "../paths.js";

export function catalogSourceDir(): string {
  return path.join(root(), "catalog");
}

export function catalogManifestPath(): string {
  return path.join(catalogSourceDir(), "manifest.json");
}

export function catalogDataDir(): string {
  return path.join(workspace(), "catalog");
}

export function catalogSfxDir(): string {
  return path.join(catalogDataDir(), "sfx");
}

export function catalogSfxManifestPath(): string {
  return path.join(catalogSfxDir(), "manifest.json");
}

export function catalogPreviewsDir(): string {
  return path.join(catalogDataDir(), "previews");
}

export function catalogBuildDir(): string {
  return path.join(catalogDataDir(), "build");
}

export function catalogPagePath(): string {
  return path.join(catalogDataDir(), "index.html");
}

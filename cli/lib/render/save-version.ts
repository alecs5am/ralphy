// `ralphy hyperframes save-version <project>` helper (issue #028).
//
// Copies the current `index.html` to `compositions/v<N>.html` where `<N>` is
// the next free integer. Numeric increments only — NEVER overwrites an
// existing version (AGENTS.md invariant #14: append-only on generations).
//
// Pure function side: pick the next slot given a directory listing. Tested
// in isolation so the integration test can stub the filesystem.

import { readdir, copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";

const VERSION_RE = /^v(\d+)\.html$/i;

/**
 * Given a list of existing filenames in `compositions/`, return the next
 * version slot. v1 when empty, then v2, v3, ... — gaps are not reused.
 */
export function nextVersionSlot(existing: readonly string[]): string {
  let maxN = 0;
  for (const name of existing) {
    const m = VERSION_RE.exec(name);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > maxN) maxN = n;
  }
  return `v${maxN + 1}.html`;
}

export type SaveVersionResult = {
  /** Absolute path of the source `index.html`. */
  source: string;
  /** Absolute path of the newly written `compositions/v<N>.html`. */
  dest: string;
  /** Bare filename of dest (e.g. "v3.html"). */
  slot: string;
};

/**
 * Snapshot the current `index.html` into `compositions/v<N>.html`. Throws if
 * `index.html` is missing — that's an authoring mistake the caller should
 * surface, not a silent skip.
 */
export async function saveCompositionVersion(projectDir: string): Promise<SaveVersionResult> {
  const source = path.join(projectDir, "index.html");
  await stat(source); // throws ENOENT → caller decides
  const compositionsDir = path.join(projectDir, "compositions");
  await mkdir(compositionsDir, { recursive: true });
  let existing: string[] = [];
  try {
    existing = await readdir(compositionsDir);
  } catch {
    existing = [];
  }
  const slot = nextVersionSlot(existing);
  const dest = path.join(compositionsDir, slot);
  await copyFile(source, dest);
  return { source, dest, slot };
}

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Every TypeScript source under the given paths, concatenated.
 *
 * A source-text contract asserts something about a layer, not about a file: "the app never mounts
 * the workbench hidden" stayed true when the app component split into a route table, two hooks and
 * a set of frames, but an assertion naming `App.tsx` would have read the split as a regression.
 * Reading the layer keeps the contract pointed at the claim.
 */
export function layerSource(...paths: string[]): string {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.tsx?$/.test(entry.name)) files.push(path);
    }
  };
  for (const path of paths) walk(join(process.cwd(), path));
  return files.sort().map((file) => readFileSync(file, "utf8")).join("\n");
}

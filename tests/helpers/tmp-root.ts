// Test helper: create an isolated temp directory and bind the ralphy
// `root()` to it for the duration of one test. Avoids touching real
// workspace/.ralph/jobs.db.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setRoot } from "../../cli/lib/paths.js";

export type TmpRoot = {
  dir: string;
  cleanup: () => void;
};

export function makeTmpRoot(prefix = "ralphy-test"): TmpRoot {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
  fs.mkdirSync(path.join(dir, "workspace", ".ralph"), { recursive: true });
  setRoot(dir);
  return {
    dir,
    cleanup() {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    },
  };
}

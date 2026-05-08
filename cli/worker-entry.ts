// Daemon entry point. Forked detached by `ralphy daemon start` via
// `bun run cli/worker-entry.ts <concurrency> <ralphyBin>`.
//
// All real logic lives in cli/lib/jobs/worker.ts; this file is only a
// thin argv shim so the daemon binary stays a single file with no
// linker step.

import path from "node:path";
import { setRoot } from "./lib/paths.js";
import { runWorkerLoop } from "./lib/jobs/worker.js";
import { pidFilePath } from "./lib/jobs/daemon.js";

const concurrency = Number(process.argv[2] ?? "4");
const ralphyBin = process.argv[3] ?? "";
const cwd = process.cwd();

setRoot(cwd);

if (!ralphyBin) {
  process.stderr.write("worker-entry: missing ralphyBin argv[3]\n");
  process.exit(1);
}

runWorkerLoop({
  concurrency,
  ralphyBin,
  cwd,
  pidFile: pidFilePath(),
});

// Keep the event loop alive — runWorkerLoop schedules a setTimeout chain.
// Nothing else needed here.
void path; // suppress unused-import warning

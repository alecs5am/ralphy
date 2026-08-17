import { chmod } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const helper = join(
  root,
  "node_modules/node-pty/prebuilds",
  `${process.platform}-${process.arch}`,
  "spawn-helper",
);

await chmod(helper, 0o755);

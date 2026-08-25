/* Vendor Ralphy's routing pack into this app's bundle.
 *
 * A user who downloads only the desktop app has no ugc-cli checkout, so the
 * router and its playbooks have to travel inside the app and be installed into
 * `~/.ralphy` on first launch. This script fetches them through the CLI's own
 * `prompts export` contract -- never by reaching into a sibling checkout's file
 * layout -- and writes the result under resources/, which is committed and
 * packaged. Run it when core ships a new pack:
 *
 *   bun scripts/vendor-prompt-pack.mjs [--bin <ralphy>]
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const at = process.argv.indexOf("--bin");
const bin = at > 0 ? process.argv[at + 1] : process.env.RALPHY_BIN ?? "ralphy";
const out = join(process.cwd(), "resources", "prompt-pack");

/* Replaced wholesale rather than merged: the manifest is the pack's own record
   of what it contains, and a file left behind from an older export would be a
   playbook the router no longer names. */
rmSync(out, { recursive: true, force: true });

/* An empty --cwd: the CLI resolves an ambient library for every verb, and the
   user's own library has many workspaces, so it refuses to pick one. Export
   writes only to --out and reads only its own package, so it needs no library. */
const scratch = mkdtempSync(join(tmpdir(), "ralphy-vendor-"));
const run = spawnSync(bin, ["--cwd", scratch, "prompts", "export", "--out", out, "--json"], { encoding: "utf8" });
rmSync(scratch, { recursive: true, force: true });
if (run.status !== 0) {
  console.error(`${bin} prompts export failed (${run.status}): ${run.stderr || run.stdout}`);
  console.error("Point --bin or $RALPHY_BIN at a ralphy that ships `prompts export`.");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
console.log(JSON.stringify({
  out,
  files: manifest.files.length,
  bytes: manifest.totalBytes,
  cliVersion: manifest.cliVersion,
}, null, 2));

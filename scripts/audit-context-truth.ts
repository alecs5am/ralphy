/* Live check: the Context page's document against the machine it describes.
 *
 * Every unit test on this page runs against a temp fixture, which proves the reader's rules and
 * nothing about this Mac. This script points the same reader at the real provider home and then
 * measures the same files itself -- a second instrument, so a wrong number cannot agree with
 * itself -- and resolves every place the instruction chain names against the core checkout.
 *
 * `bun scripts/audit-context-truth.ts [--provider codex|claude]`
 * Exits non-zero when a reported size disagrees with the file, so CI can run it on a real machine.
 */
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import { readContextDocument, references } from "../electron/agent/context-document";
import { providerHome } from "../electron/agent/context";
import { bundledPack, readPackState } from "../electron/agent/prompt-pack";

const flag = (name: string, fallback: string) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? process.argv[at + 1] ?? fallback : fallback;
};
const provider = flag("provider", "codex") === "claude" ? "claude" as const : "codex" as const;
const home = homedir();
const places = providerHome(provider, home);

const bytes = async (path: string) => (await stat(path).then((info) => info.size, () => null));
const blocks = await readContextDocument({
  provider,
  home,
  cwd: home,
  rootPath: join(home, ".ralphy"),
  preamble: "[Ralphy Media context]\n[/Ralphy Media context]",
});

let failed = 0;
const say = (ok: boolean, line: string) => {
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${line}`);
};

/* 1. Every block that names a file on disk states that file's size. */
for (const block of blocks) {
  if (block.bytes === null || !isAbsolute(block.title)) continue;
  const measured = await bytes(block.title);
  say(measured === block.bytes, `${block.title} · page ${block.bytes} B · disk ${measured} B`);
}

/* 2. Ralphy's own injected block is the sentinel span, counted without its sentinels. */
const chain = await readFile(places.instructions, "utf8").catch(() => null);
const ralphy = chain?.match(/<!-- ralphy:start[^>]*-->\n?([\s\S]*?)<!-- ralphy:end -->/);
const injected = blocks.find((block) => block.id.endsWith("#ralphy"));
if (ralphy && injected) {
  const inner = Buffer.byteLength(ralphy[1].trim());
  say(injected.bytes === inner, `Ralphy's block · page ${injected.bytes} B · file ${inner} B`);
} else {
  say(injected === undefined, `no Ralphy block installed in ${places.instructions}`);
}

/* 3. Every place the chain names, resolved from the agent's working directory -- where the page
      judges it, and the only place that matters, because that is where the agent runs. A token
      that is a placeholder rather than a path is reported as such instead of being resolved
      against a directory it was never meant to name. */
for (const token of references(ralphy?.[1] ?? "")) {
  const placeholder = /[<>{}*]/.test(token);
  const fromCwd = token.startsWith("~/") ? join(home, token.slice(2)) : resolve(home, token);
  const here = placeholder ? null : await bytes(fromCwd);
  const child = blocks.find((block) => block.title === token);
  const claimed = child?.defect !== null && child?.defect !== undefined;
  /* The page calls a place a defect exactly when the agent cannot reach it from where it runs. */
  say(claimed === (here === null), `${token} · ${placeholder ? "placeholder, not a path" : here === null ? "missing from cwd" : `found, ${here} B`} · page ${claimed ? "defect" : "fine"}`);
}

/* 4. The routing pack: installed, and every document its router names present inside it. Without
      this the block above names a router that is not there, which is the whole defect the pack
      exists to close. */
const pack = await readPackState(join(home, ".ralphy"), bundledPack("", process.cwd(), false));
say(pack.unavailable === null, `this build ships a pack${pack.unavailable ? ` · ${pack.unavailable}` : ""}`);
say(pack.installed, `pack installed at ${pack.root} · ${pack.files} files · ${pack.bytes} B`);
const router = await readFile(join(pack.root, "AGENTS.md"), "utf8").catch(() => null);
if (router !== null) {
  const named = references(router).filter((token) => token.endsWith(".md"));
  const absent = [];
  for (const token of named) {
    if (await bytes(resolve(pack.root, token)) === null) absent.push(token);
  }
  say(named.length > 0, `the installed router names ${named.length} documents`);
  /* No exemption any more: skills used to arrive through `skill install`, so a
     router naming one the pack lacked was a delivery gap rather than a pack
     defect. The pack carries `.agents/skills/` now, so a name that does not
     resolve is a name that resolves nowhere for the agent reading it. */
  say(absent.length === 0, `every document the router names is in the pack${absent.length ? `: missing ${absent.join(", ")}` : ""}`);
}

console.log(failed === 0 ? "\ncontext truth: agrees with this machine" : `\ncontext truth: ${failed} disagreement(s)`);
process.exit(failed === 0 ? 0 : 1);

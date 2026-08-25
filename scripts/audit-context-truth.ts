/* Live check: the Context page's document against the machine it describes.
 *
 * Every unit test on this page runs against a temp fixture, which proves the reader's rules and
 * nothing about this Mac. This script points the same reader at the real provider home and then
 * measures the same files itself -- a second instrument, so a wrong number cannot agree with
 * itself -- and resolves every place the instruction chain names against the core checkout.
 *
 * `bun scripts/audit-context-truth.ts [--provider codex|claude] [--core <path>]`
 * Exits non-zero when a reported size disagrees with the file, so CI can run it on a real machine.
 */
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import { readContextDocument, references } from "../electron/agent/context-document";
import { providerHome } from "../electron/agent/context";

const flag = (name: string, fallback: string) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? process.argv[at + 1] ?? fallback : fallback;
};
const provider = flag("provider", "codex") === "claude" ? "claude" as const : "codex" as const;
const core = resolve(flag("core", join(homedir(), "github", "ralphy", "ralphy")));
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

/* 3. Every place the chain names, resolved twice: from the agent's working directory, where the
      page judges it, and from the core checkout, where the block's author meant it. */
for (const token of references(ralphy?.[1] ?? "")) {
  const fromCwd = token.startsWith("~/") ? join(home, token.slice(2)) : resolve(home, token);
  const fromCore = token.startsWith("~/") ? join(home, token.slice(2)) : resolve(core, token);
  const here = await bytes(fromCwd);
  const there = await bytes(fromCore);
  const child = blocks.find((block) => block.title === token);
  const claimed = child?.defect !== null && child?.defect !== undefined;
  /* The page calls a place a defect exactly when the agent cannot reach it from where it runs. */
  say(claimed === (here === null), `${token} · from cwd ${here === null ? "missing" : "found"} · page ${claimed ? "defect" : "fine"}`);
  console.log(`     in core: ${there === null ? "MISSING from " + core : "exists"}`);
}

console.log(failed === 0 ? "\ncontext truth: agrees with this machine" : `\ncontext truth: ${failed} disagreement(s)`);
process.exit(failed === 0 ? 0 : 1);

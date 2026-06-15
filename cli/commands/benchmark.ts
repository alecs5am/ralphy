import { Command } from "commander";
import { out, isPretty } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import { listBenchmarkSets, getBenchmarkSet } from "../lib/benchmarks.js";

// Benchmark sets live at <repo>/benchmarks/<slug>/benchmark.json — a curated
// gallery of good/acceptable/bad examples per content-mode + format (#419).
// This verb is the agent-facing load surface, mirroring `ralphy guideline`.
// The loader (cli/lib/benchmarks.ts) is best-effort: a malformed set is skipped,
// so `list` never crashes on one bad file.

export function benchmarkCmd() {
  const cmd = new Command("benchmark").description("Golden benchmark sets — good/acceptable/bad examples per content mode");

  cmd
    .command("list")
    .description("List every benchmark set shipped in the repo")
    .action(async () => {
      const sets = listBenchmarkSets();
      const rows = sets.map((s) => ({
        slug: s.slug,
        name: s.name,
        mode: s.mode,
        format: s.format,
        good: s.examples.filter((e) => e.label === "good").length,
        acceptable: s.examples.filter((e) => e.label === "acceptable").length,
        bad: s.examples.filter((e) => e.label === "bad").length,
      }));

      if (!isPretty()) {
        out(rows);
        return;
      }
      const { c, icons, section, table } = await import("../lib/ui.js");
      section(`Benchmark sets  ${c.muted(`(${rows.length} total)`)}`);
      table(rows, [
        { key: "slug", header: "slug", format: (v) => c.cmd(String(v)) },
        { key: "mode", header: "mode", format: (v) => c.muted(String(v)) },
        { key: "format", header: "format", format: (v) => c.muted(String(v)) },
        { key: "name", header: "name", format: (v) => c.bold(String(v ?? "")) },
        { key: "good", header: "good", format: (v) => c.muted(String(v)) },
        { key: "bad", header: "bad", format: (v) => c.muted(String(v)) },
      ]);
      console.log();
      console.log(`  ${icons.bullet} ${c.cmd("ralphy benchmark show <slug>")}     print the set's examples + features`);
      console.log();
    });

  cmd
    .command("show <slug>")
    .description("Print a benchmark set: its examples, labels, and pass/fail features")
    .action(async (slug: string) => {
      const set = getBenchmarkSet(slug);
      if (!set) raiseError("E_NOT_FOUND", { kind: "Benchmark", id: slug });

      if (!isPretty()) {
        out(set!);
        return;
      }
      const { c, icons, section } = await import("../lib/ui.js");
      section(`${set!.name}  ${c.muted(`(${set!.mode} / ${set!.format})`)}`);
      if (set!.summary) console.log(`  ${c.muted(set!.summary)}`);
      console.log();
      for (const ex of set!.examples) {
        const tint = ex.label === "good" ? c.bold : c.muted;
        console.log(`  ${icons.bullet} ${tint(ex.label.toUpperCase())}${ex.sourceUrl ? c.muted(`  ${ex.sourceUrl}`) : ""}`);
        for (const f of ex.features) console.log(`      - ${f}`);
        if (ex.notes) console.log(`      ${c.muted(ex.notes)}`);
        console.log();
      }
    });

  return cmd;
}

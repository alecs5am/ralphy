// #573: commander usage errors print one example invocation per verb.

import { describe, expect, test } from "bun:test";
import { Command } from "commander";
import { activityCmd } from "../../cli/commands/activity.js";
import { generateCmd } from "../../cli/commands/generate.js";
import { migrateCmd } from "../../cli/commands/migrate.js";
import { projectCmd } from "../../cli/commands/project.js";
import { refCmd } from "../../cli/commands/ref.js";
import {
  commandPath,
  installUsageExamples,
  USAGE_EXAMPLES,
  usageExample,
  withUsageExample,
} from "../../cli/lib/usage-examples.js";

function program(): Command {
  const root = new Command("ralphy");
  for (const command of [activityCmd(), generateCmd(), migrateCmd(), projectCmd(), refCmd()]) {
    root.addCommand(command);
  }
  return root;
}

function find(root: Command, verbPath: string): Command | undefined {
  let current: Command | undefined = root;
  for (const name of verbPath.split(" ")) {
    current = current?.commands.find((command) => command.name() === name);
  }
  return current;
}

describe("usage examples (#573)", () => {
  test("covers the verbs the #562 baseline failed on", () => {
    for (const verb of ["project log-asset", "migrate resume", "migrate status", "ref pull", "generate video", "activity list"]) {
      expect(USAGE_EXAMPLES[verb], verb).toStartWith(`ralphy ${verb} `);
    }
  });

  test("every curated example names its verb's required flags", () => {
    const root = program();
    for (const [verb, example] of Object.entries(USAGE_EXAMPLES)) {
      const command = find(root, verb);
      if (!command) continue; // a verb outside the five factories above
      expect(commandPath(command)).toBe(verb);
      for (const option of command.options.filter((candidate) => candidate.mandatory)) {
        expect(example, `${verb} ${option.long}`).toContain(`${option.long} `);
      }
    }
  });

  test("derives an example from required arguments and options for other verbs", () => {
    const root = new Command("ralphy");
    const leaf = root.command("widget").command("tune <id>");
    leaf.requiredOption("--level <n>", "Level").option("--quiet", "Quiet");
    expect(usageExample(leaf)).toBe("ralphy widget tune <id> --level <n>");
  });

  test("appends exactly one example to usage errors and leaves other errors alone", () => {
    const root = program();
    const iterate = find(root, "project iterate")!;
    expect(withUsageExample("error: required option '--title <title>' not specified\n", iterate)).toBe(
      "error: required option '--title <title>' not specified\nExample:\n  ralphy project iterate <id> --title <title>\n",
    );
    const already = "error: required option '--x <x>' not specified\nExample:\n  ralphy custom\n";
    expect(withUsageExample(already, iterate)).toBe(already);
    expect(withUsageExample("error: unknown option '--nope'\n", iterate)).toBe("error: unknown option '--nope'\n");
  });

  test("installUsageExamples decorates commander's own missing-flag error", () => {
    const root = program();
    let written = "";
    root.exitOverride();
    installUsageExamples(root);
    for (const command of [root, ...root.commands.flatMap((c) => [c, ...c.commands])]) {
      command.exitOverride();
      command.configureOutput({ writeErr: (text) => { written += text; } });
    }
    expect(() => root.parse(["node", "ralphy", "migrate", "status", "--source", "x"])).toThrow();
    expect(written).toContain("error: required option '--run-id <id>' not specified");
    expect(written).toContain(`Example:\n  ${USAGE_EXAMPLES["migrate status"]}`);
  });
});

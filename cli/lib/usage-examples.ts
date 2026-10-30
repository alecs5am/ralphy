// One copy-paste example per verb, printed after a commander usage error (#573).
//
// The #562 baseline counted 19 calls that failed on a required flag the agent
// did not know about (`project log-asset --source`, `migrate --run-id`,
// `activity list --since`, ...). Commander's own message names the missing
// flag but not the shape of a working call, so the agent guessed again. The
// fix is one line of evidence: `Example: ralphy <verb> ...`.
//
// Curated examples cover the verbs seen in the baseline. Every other verb gets
// an example derived from its declared required arguments and options, so a
// new `requiredOption` is covered without touching this file.

import type { Command, Option } from "commander";

/** Curated examples keyed by verb path (no `ralphy` prefix). */
export const USAGE_EXAMPLES: Readonly<Record<string, string>> = Object.freeze({
  "project log-asset":
    "ralphy project log-asset <project> --kind photo --copy-from ~/Downloads/product.png --purpose product-ref",
  "project log-prompt": 'ralphy project log-prompt <project> --text "<what the user asked>" --stage brief',
  "migrate audit": "ralphy migrate audit --source .ralphy",
  "migrate run": "ralphy migrate run --source .ralphy",
  "migrate resume": "ralphy migrate resume --run-id <run-id from migrate run> --source .ralphy",
  "migrate status": "ralphy migrate status --run-id <run-id from migrate run> --source .ralphy",
  "migrate verify":
    "ralphy migrate verify --run-id <run-id> --source .ralphy --verification-dir <dir outside .ralphy>",
  "migrate cutover":
    "ralphy migrate cutover --run-id <run-id> --confirm <run-id> --verification-id <verification-id> --verification-dir <dir> --source .ralphy",
  "migrate recover": "ralphy migrate recover --run-id <run-id> --confirm <run-id> --source .ralphy",
  "migrate rollback": "ralphy migrate rollback --run-id <run-id> --confirm <run-id> --source .ralphy",
  "ref pull": "ralphy ref pull <url> --project <project>",
  "generate image": 'ralphy generate image --project <project> --slot <slot> --prompt "<prompt>"',
  "generate video": 'ralphy generate video --project <project> --slot <slot> --duration 5 --prompt "<prompt>"',
  "activity list": "ralphy activity list --workspace <workspace> --since 0",
  "stock search": 'ralphy stock search "<query>" --kind image|video|audio|logo',
  "stock pull": "ralphy stock pull <candidate-id from stock search> --project <project>",
  "stock credits": "ralphy stock credits --project <project>",
});

const USAGE_ERROR = /^error: (required option '[^']+' not specified|missing required argument '[^']+'|option '[^']+' argument missing)/;

/** Verb path below the root program, e.g. `project log-asset`. */
export function commandPath(command: Command): string {
  const names: string[] = [];
  for (let current: Command | null = command; current?.parent; current = current.parent) {
    names.unshift(current.name());
  }
  return names.join(" ");
}

/** The curated example for a verb, else one derived from its required inputs. */
export function usageExample(command: Command): string {
  const path = commandPath(command);
  const curated = USAGE_EXAMPLES[path];
  if (curated) return curated;
  const args = command.registeredArguments
    .filter((argument) => argument.required)
    .map((argument) => `<${argument.name()}>`);
  const options = command.options
    .filter((option) => option.mandatory)
    .map(optionExample);
  return ["ralphy", path, ...args, ...options].filter(Boolean).join(" ");
}

/** Append `Example: ...` to a commander usage error unless it already has one. */
export function withUsageExample(message: string, command: Command): string {
  if (!USAGE_ERROR.test(message) || message.includes("Example:")) return message;
  const body = message.endsWith("\n") ? message : `${message}\n`;
  return `${body}Example:\n  ${usageExample(command)}\n`;
}

/**
 * Wrap every action command's error output so usage errors carry one example.
 * A command's own `outputError` (if any) still runs, after the example is added.
 */
export function installUsageExamples(root: Command): void {
  const visit = (command: Command) => {
    for (const child of command.commands) {
      const previous = child.configureOutput().outputError;
      child.configureOutput({
        outputError: (message: string, write: (text: string) => void) => {
          const decorated = withUsageExample(message, child);
          if (previous) previous(decorated, write);
          else write(decorated);
        },
      });
      visit(child);
    }
  };
  visit(root);
}

function optionExample(option: Option): string {
  const flag = option.long ?? option.short ?? option.flags;
  if (!option.required && !option.optional) return flag;
  const placeholder = /[<[]([^>\]]+)[>\]]/.exec(option.flags)?.[1] ?? "value";
  return `${flag} <${placeholder}>`;
}

import { Command } from "commander";
import { loadConfig, saveConfig, getNestedValue, setNestedValue } from "../lib/config.js";
import { out } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";

export function configCmd() {
  const cmd = new Command("config").description("Manage configuration");

  cmd
    .command("list")
    .description("Show all settings")
    .action(async () => {
      const config = await loadConfig();
      out(config);
    });

  cmd
    .command("get <key>")
    .description("Get a config value")
    .action(async (key: string) => {
      const config = await loadConfig();
      const val = getNestedValue(config, key);
      if (val === undefined) raiseError("E_NOT_FOUND", { kind: "Key", id: key });
      out(val);
    });

  cmd
    .command("set <key> <value>")
    .description("Set a config value")
    .action(async (key: string, value: string) => {
      const config = await loadConfig();
      // Try to parse as number/boolean
      let parsed: unknown = value;
      if (value === "true") parsed = true;
      else if (value === "false") parsed = false;
      else if (!isNaN(Number(value)) && value !== "") parsed = Number(value);

      setNestedValue(config, key, parsed);
      await saveConfig(config);
      out({ [key]: parsed });
    });

  return cmd;
}

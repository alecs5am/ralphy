import { SETTINGS_COMMANDS } from "./commands";
import type { SettingsContext } from "../model/context";
import type { SettingsPageId } from "./registry";
import type { GenerationProviderStatus } from "../../../../shared/generation-studio";

/**
 * The context rail: machine facts, counters and the rule that governs the page, plus the
 * page's one dangerous action. It is not decoration — it keeps the numbers a setting is
 * about next to the setting, and it stops a wide window from being an empty canvas.
 */
export interface RailAction {
  label: string;
  disabled?: boolean;
  run(): void;
}

export interface RailContent {
  label: string;
  rows: readonly (readonly [string, string])[];
  action?: RailAction;
  note?: { label: string; text: string; danger?: RailAction };
}

export function railFor(page: SettingsPageId, ctx: SettingsContext, providers?: readonly GenerationProviderStatus[] | null): RailContent | null {
  if (page === "providers") return {
    label: "CONNECTIONS", rows: [["Services", providers ? String(providers.length) : "Loading"], ["Keys present", providers ? String(providers.filter((provider) => provider.configured).length) : "—"]],
    note: { label: "CREDENTIALS", text: "Service keys are encrypted on this Mac. Check a connection before generating." },
  };
  if (page === "agents") return {
    label: "AGENTS", rows: [["Connected", String(ctx.harnesses.rows.filter(({ tone }) => tone === "ok").length)], ["Default", ctx.preferences.values["agents.defaultHarness"]]],
    action: { label: "Access for new chats", run: () => ctx.goTo("permissions") },
  };
  if (page === "permissions") return {
    label: "NEW CHATS", rows: [["Access", ctx.preferences.values["permissions.mode"] === "full" ? "Full access" : ctx.preferences.values["permissions.mode"] === "auto" ? "Workspace access" : "Read-only files"]],
    note: { label: "EXISTING CHATS", text: "Each conversation keeps its selected access mode. Full access allows commands without approval prompts." },
  };
  if (page === "keys") return {
    label: "KEYBOARD", rows: [["Commands", String(SETTINGS_COMMANDS.length)], ["Custom bindings", String(Object.keys(ctx.bindings).length)]],
    action: { label: "Reset bindings", disabled: Object.keys(ctx.bindings).length === 0, run: () => ctx.setBindings({}) },
  };
  return null;
}

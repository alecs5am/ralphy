import { SETTINGS_COMMANDS } from "./commands";
import type { SettingsContext } from "./context";
import type { SettingsPageId } from "./registry";

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

export function railFor(page: SettingsPageId, ctx: SettingsContext): RailContent | null {
  const harnesses = ctx.harnesses.rows;
  const connected = harnesses.filter(({ tone }) => tone === "ok").length;
  const changed = Object.keys(ctx.bindings).length;
  const { values } = ctx.preferences;

  if (page === "general") return {
    label: "THIS MAC",
    rows: [
      ["Ralphy Desktop", ctx.version],
      ["Library", ctx.libraryPath ? "WRITABLE" : "NONE"],
      ["Appearance", ctx.resolvedTheme.toLocaleUpperCase()],
      ["Harnesses", String(connected)],
    ],
    action: { label: "Run diagnostics", run: () => ctx.goTo("diagnostics") },
    note: { label: "SCOPE", text: "Application Settings owns the global and the machine only. Workspace rules live in the workspace's own settings." },
  };

  if (page === "profile") return {
    label: "STORAGE",
    rows: [["Profile", "THIS MAC"], ["Sync", "NONE"], ["Account", "NONE"]],
    note: { label: "LOCAL PROFILE", text: "There is no Ralphy account yet: the name and avatar sit next to the library and never leave this machine." },
  };

  if (page === "appearance") return {
    label: "INHERITED FROM MACOS",
    rows: [
      ["Appearance", ctx.resolvedTheme.toLocaleUpperCase()],
      ["Density", String(values["appearance.density"]).toLocaleUpperCase()],
      ["Media columns", String(values["appearance.mediaColumns"])],
    ],
    note: { label: "PREVIEW", text: "Theme and density apply to this same window — there is no separate demo pane to keep in sync." },
  };

  if (page === "keys") return {
    label: "BINDINGS",
    rows: [
      ["Commands", String(SETTINGS_COMMANDS.length)],
      ["Changed", String(changed)],
      ["Scopes", String(new Set(SETTINGS_COMMANDS.map(({ scope }) => scope)).size)],
    ],
    action: { label: "Export keybindings…", disabled: true, run: () => undefined },
    note: {
      label: "MAINTENANCE",
      text: "A reset returns every command to the value the build ships. The action cannot be undone.",
      danger: { label: "Reset all to defaults", disabled: changed === 0, run: () => ctx.setBindings({}) },
    },
  };

  if (page === "agents") return {
    label: "HARNESSES",
    rows: [
      ["Connected", String(connected)],
      ["Need action", String(harnesses.length - connected)],
      ["Default", String(values["agents.defaultHarness"])],
    ],
    note: { label: "RIGHTS", text: "Friendly capability names mean different things per provider. Read the adapter receipt on the harness page." },
  };

  if (page === "providers") return {
    label: "CREDENTIALS",
    rows: [["Services", "5"], ["Configured here", "0"], ["Keychain", "0"]],
    note: { label: "SECURITY", text: "Keys belong in the macOS keychain. The renderer never receives a stored secret in full, so none is entered until that channel exists." },
  };

  if (page === "storage") return {
    label: "DISK",
    rows: [["Reporting", "NO CONTRACT"], ["Cleanup", String(values["storage.cleanup"]).toLocaleUpperCase()]],
    note: { label: "RULE", text: "Generated files never share an action with regenerable cache. One button can only ever remove one of the two." },
  };

  if (page === "permissions") return {
    label: "EFFECTIVE POSTURE",
    rows: [
      ["New chats", String(values["permissions.posture"]).toLocaleUpperCase()],
      ["Shell", values["permissions.shell"] ? "REVIEW" : "ALLOWED"],
      ["Network", values["permissions.network"] ? "REVIEW" : "OFF"],
      ["Publishing", values["permissions.publishing"] ? "REVIEW" : "ALLOWED"],
    ],
    note: { label: "HONESTY", text: "There is no single full-access switch here: the dangerous capabilities are separate rows with separate consequences." },
  };

  if (page === "terminal") return {
    label: "ENVIRONMENT",
    rows: [
      ["Shell probe", "NO CONTRACT"],
      ["Scrollback", String(values["terminal.scrollback"])],
      ["Restart", "REQUIRED"],
    ],
    note: { label: "RESTART", text: "Environment changes are picked up after the app restarts — terminal sessions do not survive a PATH change." },
  };

  if (page === "diagnostics") return {
    label: "LAST RUN",
    rows: [["Checks", "7"], ["Reported", String(ctx.harnesses.state === "ready" ? 4 : 3)], ["Not reported", "3"]],
    action: { label: "Export support bundle…", disabled: true, run: () => undefined },
    note: { label: "REDACTION", text: "Keys, prompts and media paths stay out of the bundle unless you add them by hand." },
  };

  if (page === "updates") return {
    label: "CHANNEL",
    rows: [["Current", ctx.version], ["Channel", String(values["updates.channel"]).toLocaleUpperCase()], ["Rollback", "UNSUPPORTED"]],
    note: { label: "ROLLBACK", text: "The build does not support downgrading yet, so no button promises it." },
  };

  return null;
}

import {
  Activity,
  Bot,
  Contrast,
  Download,
  HardDrive,
  Info,
  Keyboard,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  User,
  type AppIcon,
} from "@/shared/ui/icons";

import type { AppPreferences } from "./preferences";

/**
 * The settings information architecture in one place: which pages exist, how they group
 * in the navigation, what scope each one owns, and which rows the search index can reach.
 * A deferred section is absent here rather than present and disabled — the navigation
 * never offers a page whose contract has not landed.
 */
export const SETTINGS_PAGES = {
  general: { title: "General", scopes: ["GLOBAL", "THIS MAC"] },
  profile: { title: "Profile", scopes: ["THIS MAC"] },
  appearance: { title: "Appearance", scopes: ["THIS MAC"] },
  keys: { title: "Keyboard shortcuts", scopes: ["GLOBAL"] },
  agents: { title: "Agents", scopes: ["GLOBAL", "INHERITED BY WORKSPACES"] },
  providers: { title: "Providers & publishing", scopes: ["SECURE CREDENTIALS"] },
  storage: { title: "Storage & media", scopes: ["THIS MAC"] },
  permissions: { title: "Permissions & privacy", scopes: ["GLOBAL", "THIS MAC"] },
  terminal: { title: "Terminal & environment", scopes: ["THIS MAC"] },
  diagnostics: { title: "Diagnostics", scopes: ["THIS MAC"] },
  updates: { title: "Updates", scopes: ["THIS MAC"] },
  about: { title: "About", scopes: [] },
} as const satisfies Record<string, { title: string; scopes: readonly string[] }>;

export type SettingsPageId = keyof typeof SETTINGS_PAGES;
export const SETTINGS_PAGE_IDS = Object.keys(SETTINGS_PAGES) as SettingsPageId[];

export const SETTINGS_NAV_GROUPS = [
  { label: "PERSONAL", items: ["general", "profile", "appearance", "keys"] },
  { label: "AI & GENERATION", items: ["agents", "providers"] },
  { label: "SYSTEM", items: ["storage", "permissions", "terminal"] },
  { label: "SUPPORT", items: ["diagnostics", "updates", "about"] },
] as const satisfies readonly { label: string; items: readonly SettingsPageId[] }[];

export const SETTINGS_PAGE_ICONS: Record<SettingsPageId, AppIcon> = {
  general: SlidersHorizontal,
  profile: User,
  appearance: Contrast,
  keys: Keyboard,
  agents: Bot,
  providers: Sparkles,
  storage: HardDrive,
  permissions: Shield,
  terminal: Terminal,
  diagnostics: Activity,
  updates: Download,
  about: Info,
};

export interface SettingsIndexEntry {
  /** Deep-link target: `settings/<page>#<id>` is the same path a search result takes. */
  id: string;
  title: string;
  page: SettingsPageId;
  section: string;
  keywords: string;
  state(values: AppPreferences): string;
}

const value = (id: keyof AppPreferences) => (values: AppPreferences) => String(values[id]);
const flag = (id: keyof AppPreferences) => (values: AppPreferences) => values[id] ? "On" : "Off";

export const SETTINGS_INDEX: readonly SettingsIndexEntry[] = [
  { id: "general.sendShortcut", title: "Send shortcut in agent chat", page: "general", section: "Application behaviour", keywords: "send enter shortcut chat submit", state: value("general.sendShortcut") },
  { id: "general.library", title: "Home Ralphy library", page: "general", section: "Library", keywords: "path library store folder root", state: () => "Open storage to check" },
  { id: "appearance.theme", title: "Appearance", page: "appearance", section: "Theme", keywords: "theme dark light system contrast", state: () => "System, Dark or Light" },
  { id: "appearance.motion", title: "Interface motion", page: "appearance", section: "Motion", keywords: "motion animation reduce transitions", state: flag("appearance.motion") },
  { id: "keys.bindings", title: "Command shortcuts", page: "keys", section: "Application", keywords: "shortcut keybinding hotkey chord keyboard", state: () => "Command registry" },
  { id: "agents.default", title: "Default harness for new chats", page: "agents", section: "Defaults", keywords: "agent harness codex claude default model", state: value("agents.defaultHarness") },
  { id: "providers.credential", title: "Provider API key", page: "providers", section: "Generation services", keywords: "api key secret credential token openrouter elevenlabs fal", state: () => "Encrypted on this Mac" },
  { id: "providers.postiz", title: "Postiz publishing connection", page: "providers", section: "Publishing", keywords: "postiz calendar social accounts api key", state: () => "Workspace connection" },
  { id: "generation.costWarningUsd", title: "High cost warning", page: "providers", section: "Generation cost", keywords: "cost price estimate budget generation warning usd", state: (values) => `$${values["generation.costWarningUsd"]}` },
  { id: "storage.cache", title: "Clear browser cache", page: "storage", section: "Cleanup", keywords: "cache clear temp previews cleanup disk", state: () => "Browser cache only" },
  { id: "permissions.microphone", title: "Microphone access", page: "permissions", section: "Device permissions", keywords: "mic microphone voice permission dictation", state: () => "macOS decides" },
  { id: "permissions.mode", title: "Default access for new chats", page: "permissions", section: "Agent defaults", keywords: "approval posture permission review agent", state: value("permissions.mode") },
  { id: "diagnostics.checks", title: "System checks", page: "diagnostics", section: "System checks", keywords: "diagnostics health check repair logs", state: () => "Run on demand" },
  { id: "updates.version", title: "Application updates", page: "updates", section: "Channel", keywords: "update version beta channel release", state: () => "Manual updates" },
  { id: "about.version", title: "Version and runtime", page: "about", section: "Runtime", keywords: "version build electron chromium node about", state: () => "Build facts" },
];

export function searchSettings(query: string): readonly SettingsIndexEntry[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  return SETTINGS_INDEX.filter((entry) => (
    `${entry.title} ${entry.keywords} ${SETTINGS_PAGES[entry.page].title} ${entry.section}`
      .toLocaleLowerCase()
      .includes(needle)
  ));
}

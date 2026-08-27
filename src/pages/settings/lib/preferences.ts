import { useCallback, useState } from "react";

/**
 * Typed application preferences with an honest write path: a value only becomes visible
 * once the store accepted it, and a rejected write keeps the previous value, remembers
 * the attempt and exposes it for retry. One record, one key, one schema — a new setting
 * is one entry here plus one row on a page.
 */
export const SETTINGS_PREFERENCE_KEY = "ralphy.settings.v1";

export const APP_PREFERENCE_DEFAULTS = {
  "general.landing": "Workspace overview",
  "general.reveal": true,
  "general.preventSleep": false,
  "general.menuBar": false,
  "general.sendShortcut": "Enter",
  "general.language": "System",
  "general.openWith": "System default",
  "general.background": "Notify only",
  "appearance.contrast": false,
  "appearance.density": "Comfortable",
  "appearance.mediaColumns": 4,
  "appearance.restorePanels": true,
  "appearance.motion": true,
  "appearance.previews": "On hover",
  "agents.defaultHarness": "codex",
  "permissions.posture": "Ask for writes and shell",
  "permissions.filesystem": true,
  "permissions.shell": true,
  "permissions.network": false,
  "permissions.paid": true,
  "permissions.publishing": true,
  "permissions.analytics": false,
  "permissions.crashReports": true,
  "permissions.logRetention": "30 days",
  "storage.cleanup": "After 30 days",
  "terminal.loginShell": true,
  "terminal.startLocation": "Project folder",
  "terminal.scrollback": 5000,
  "updates.channel": "Stable",
  "updates.autoDownload": true,
  "profile.displayName": "",
  "profile.preferredName": "",
} as const;

export type AppPreferenceId = keyof typeof APP_PREFERENCE_DEFAULTS;
/** Defaults are literals so the table reads as a schema; the values themselves widen,
 *  because a preference is a choice from a set rather than one frozen string. */
type Widen<Value> = Value extends string ? string : Value extends number ? number : Value extends boolean ? boolean : Value;
export type AppPreferences = { -readonly [Id in AppPreferenceId]: Widen<(typeof APP_PREFERENCE_DEFAULTS)[Id]> };

const DEFAULT_IDS = Object.keys(APP_PREFERENCE_DEFAULTS) as AppPreferenceId[];

export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Settings render in hosts without Web Storage (geometry harnesses, unit tests), so the
 *  screen reads one accessor instead of touching a global that may not exist. */
export const settingsStorage: PreferenceStorage = typeof localStorage === "undefined"
  ? (() => {
    const memory = new Map<string, string>();
    return { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => { memory.set(key, value); } };
  })()
  : localStorage;

export function readAppPreferences(storage: PreferenceStorage): AppPreferences {
  const stored = (() => {
    try {
      const value = JSON.parse(storage.getItem(SETTINGS_PREFERENCE_KEY) ?? "null") as unknown;
      return value && typeof value === "object" ? value as Record<string, unknown> : {};
    } catch {
      return {};
    }
  })();
  // A stored value only survives if it still matches the shape of its default: a schema
  // change or a hand-edited store degrades to the default instead of typing a lie.
  return Object.fromEntries(DEFAULT_IDS.map((id) => {
    const fallback = APP_PREFERENCE_DEFAULTS[id];
    const value = stored[id];
    return [id, typeof value === typeof fallback ? value : fallback];
  })) as AppPreferences;
}

export function writeAppPreferences(storage: PreferenceStorage, values: AppPreferences): void {
  storage.setItem(SETTINGS_PREFERENCE_KEY, JSON.stringify(values));
}

export type PreferenceWriteFailures = Partial<Record<AppPreferenceId, AppPreferences[AppPreferenceId]>>;

export interface AppPreferencesController {
  values: AppPreferences;
  failures: PreferenceWriteFailures;
  set<Id extends AppPreferenceId>(id: Id, value: AppPreferences[Id]): void;
  retry(id: AppPreferenceId): void;
}

export function useAppPreferences(storage: PreferenceStorage): AppPreferencesController {
  const [values, setValues] = useState(() => readAppPreferences(storage));
  const [failures, setFailures] = useState<PreferenceWriteFailures>({});

  const set = useCallback(<Id extends AppPreferenceId>(id: Id, value: AppPreferences[Id]) => {
    setValues((current) => {
      const next = { ...current, [id]: value };
      try {
        writeAppPreferences(storage, next);
      } catch {
        setFailures((pending) => ({ ...pending, [id]: value }));
        return current;
      }
      setFailures((pending) => (
        id in pending
          ? Object.fromEntries(Object.entries(pending).filter(([key]) => key !== id)) as PreferenceWriteFailures
          : pending
      ));
      return next;
    });
  }, [storage]);

  const retry = useCallback((id: AppPreferenceId) => {
    const pending = failures[id];
    if (pending !== undefined) set(id, pending as never);
  }, [failures, set]);

  return { values, failures, set, retry };
}

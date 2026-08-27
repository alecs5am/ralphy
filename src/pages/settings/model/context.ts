import type { ResolvedTheme, ThemePreference } from "@/shared/instrument/types";
import type { CommandBindings } from "../lib/commands";
import type { HarnessController } from "../lib/harnesses";
import type { AppPreferencesController } from "../lib/preferences";
import type { SettingsPageId } from "../lib/registry";

/** A nested route inside the content column: the same column, a different heading. */
export interface SettingsDetail {
  kind: "harness" | "provider";
  id: string;
}

/** Everything a settings page is allowed to read or move. Pages own no state of their own. */
export interface SettingsContext {
  preferences: AppPreferencesController;
  harnesses: HarnessController;
  bindings: CommandBindings;
  libraryPath: string | null;
  version: string;
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  /** Row highlighted for one transition after a search result or a repair link. */
  flashId: string | null;
  setBindings(next: CommandBindings): void;
  onThemeChange(value: ThemePreference): void;
  goTo(page: SettingsPageId, flashId?: string): void;
  openDetail(detail: SettingsDetail): void;
}

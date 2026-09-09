/**
 * Settings, as a mode rather than a card.
 *
 * It owns the whole window so the app never peeks around its edges, and its own desk padding
 * lives on the screen. `focus-visible:outline-none` is the landing ring declined: the overlay
 * focuses its own surface on open, which matches `:focus-visible`, and `reset.css` would then
 * trace a 2px ring around the whole viewport, cutting across the window's rounding. The page
 * heading carries the landing focus instead. Measured: with this utility off the surface paints
 * `outline: 2px solid #F2F2F0`.
 *
 * The screen itself arrives on demand -- it is the app's second-heaviest route and is never the
 * first paint.
 */
import { Suspense, lazy } from "react";

import type { SettingsPageId } from "@/pages/settings";
import { InstrumentOverlay } from "@/shared/instrument/overlay-registry";
import type { ResolvedTheme, ThemePreference } from "@/shared/instrument/types";

const loadSettingsScreen = () =>
  import("@/pages/settings").then((module) => ({
    default: module.SettingsScreen,
  }));
const SettingsScreen = lazy(loadSettingsScreen);

export { loadSettingsScreen };

export function AppSettings({ rootPath, theme, resolvedTheme, entryPage, onThemeChange, onClose }: {
  rootPath: string | null;
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  entryPage: SettingsPageId | undefined;
  onThemeChange(value: ThemePreference): void;
  onClose(): void;
}) {
  return <Suspense fallback={null}>
    <InstrumentOverlay id="settings" open label="Settings" description="Application settings" opener={null} onOpenChange={(open) => { if (!open) onClose(); }} localScroll surfaceClassName="fixed inset-0 z-overlay-surface overflow-hidden focus-visible:outline-none">
      <SettingsScreen
        rootPath={rootPath}
        theme={theme}
        resolvedTheme={resolvedTheme}
        entryPage={entryPage}
        onThemeChange={onThemeChange}
        onBack={onClose}
      />
    </InstrumentOverlay>
  </Suspense>;
}

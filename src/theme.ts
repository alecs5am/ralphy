export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = Exclude<ThemePreference, "system">;

export function watchTheme(
  preference: ThemePreference,
  onResolved: (theme: ResolvedTheme) => void,
): () => void {
  if (preference !== "system") {
    onResolved(preference);
    return () => undefined;
  }

  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = (event: MediaQueryListEvent) => onResolved(event.matches ? "dark" : "light");
  onResolved(mediaQuery.matches ? "dark" : "light");
  mediaQuery.addEventListener("change", onChange);
  return () => mediaQuery.removeEventListener("change", onChange);
}

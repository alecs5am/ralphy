import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

import { applyResolvedTheme, resolveTheme } from "./theme";
import type { ResolvedTheme, ThemePreference } from "./types";

export interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference(value: ThemePreference): void;
}

const ThemeContext = createContext<ThemeContextValue>({
  preference: "system",
  resolved: "light",
  setPreference: () => undefined,
});

export function ThemeProvider({
  initialPreference,
  children,
}: {
  initialPreference: ThemePreference;
  children: ReactNode;
}): ReactElement {
  const media = useMemo(
    () => window.matchMedia("(prefers-color-scheme: dark)"),
    [],
  );
  const [preference, setPreference] = useState(initialPreference);
  const [systemDark, setSystemDark] = useState(media.matches);
  const resolved = resolveTheme(preference, systemDark);

  useLayoutEffect(() => {
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener("change", onChange);
    setSystemDark(media.matches);
    return () => media.removeEventListener("change", onChange);
  }, [media]);

  useLayoutEffect(() => {
    applyResolvedTheme(document.documentElement, resolved);
  }, [resolved]);

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

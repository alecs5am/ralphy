import { useEffect } from "react";
import { settingsStorage, useAppPreferences } from "@/shared/model/app-preferences";

export function useInterfaceMotion(): "user" | "always" {
  const { values } = useAppPreferences(settingsStorage);
  const enabled = values["appearance.motion"];
  useEffect(() => {
    if (document.documentElement?.dataset) document.documentElement.dataset.reduceMotion = enabled ? "false" : "true";
  }, [enabled]);
  return enabled ? "user" : "always";
}

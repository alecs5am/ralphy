import { useCallback, useState } from "react";

import type { SettingsPageId } from "@/pages/settings";

export function useSettingsDialog() {
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [settingsEntry, setSettingsEntry] = useState<SettingsPageId | undefined>(undefined);
  const openSettings = useCallback((page?: SettingsPageId) => {
    setSettingsEntry(page);
    setSettingsVisible(true);
  }, []);

  return { settingsVisible, setSettingsVisible, settingsEntry, openSettings };
}

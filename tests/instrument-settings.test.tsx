import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, test } from "vitest";

import { SettingsScreen } from "../src/screens/SettingsScreen";
import type { ThemePreference } from "../src/instrument/types";
import { createReactHost, type HostNode } from "./react-host";

function button(container: HostNode, label: string): HostNode {
  const match = container
    .querySelectorAll("button")
    .find((candidate) => candidate.textContent.trim() === label);
  if (!match) throw new Error(`Missing button: ${label}`);
  return match;
}

describe("instrument settings theme", () => {
  test("shows the controlled three-state value and supports native keyboard activation", async () => {
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    const changes: ThemePreference[] = [];
    const render = (theme: ThemePreference) => root.render(
      <SettingsScreen
        rootPath="/tmp/ux-testing-lab"
        theme={theme}
        onThemeChange={(value) => changes.push(value)}
        onBack={() => undefined}
      />,
    );

    try {
      await act(async () => render("light"));
      await act(async () => button(host.container, "Appearance").dispatchEvent(new Event("click", { bubbles: true })));

      const group = host.container.querySelector('[aria-label="Theme"]');
      expect(group).not.toBeNull();
      expect(group?.getAttribute("role")).toBe("group");
      expect(button(host.container, "Light").getAttribute("aria-pressed")).toBe("true");
      expect(button(host.container, "Dark").getAttribute("aria-pressed")).toBe("false");

      await act(async () => button(host.container, "Dark").dispatchEvent(new Event("click", { bubbles: true })));
      expect(changes).toEqual(["dark"]);

      const enter = Object.assign(new Event("keydown", { bubbles: true }), { key: "Enter" });
      await act(async () => button(host.container, "System").dispatchEvent(enter));
      expect(changes).toEqual(["dark", "system"]);

      await act(async () => render("dark"));
      expect(button(host.container, "Dark").getAttribute("aria-pressed")).toBe("true");
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });
});

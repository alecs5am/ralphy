import { act } from "react";
import { describe, expect, test, vi } from "vitest";

import { ProfileMenu } from "../src/components/ProfileMenu";
import { createReactHost } from "./react-host";

describe("profile menu", () => {
  test("shows the local username with a separate help trigger", async () => {
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);

    try {
      await act(async () => {
        root.render(
          <ProfileMenu
            rootPath="/Users/maximovchinnikov/.ralphy"
            onOpenSettings={() => undefined}
          />,
        );
      });

      const trigger = host.container.querySelector(".profile-menu-trigger");
      const helpTrigger = host.container.querySelectorAll("button")
        .find((button) => button.getAttribute("aria-label") === "Open help menu");
      expect(trigger?.textContent).toBe("maximovchinnikov");
      expect(helpTrigger).toBeDefined();
      expect(host.container.querySelector(".profile-menu-chevron")).toBeNull();
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("opens Settings from the profile menu by pointer and keyboard", async () => {
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    const onOpenSettings = vi.fn();
    try {
      await act(async () => root.render(<ProfileMenu rootPath="/tmp/.ralphy" onOpenSettings={onOpenSettings} />));
      const trigger = host.container.querySelector(".profile-menu-trigger")!;
      await act(async () => trigger.dispatchEvent(new Event("click", { bubbles: true })));
      const settings = [...document.body.querySelectorAll("button")].find((button) => button.textContent?.includes("Settings"));
      expect(settings?.getAttribute("role")).toBe("menuitem");
      await act(async () => settings!.dispatchEvent(new Event("click", { bubbles: true })));
      expect(onOpenSettings).toHaveBeenCalledOnce();
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });
});

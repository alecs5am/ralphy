import { act } from "react";
import { describe, expect, test } from "vitest";

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

      const trigger = host.container.querySelectorAll("button")
        .find((button) => button.getAttribute("aria-label") === "Open profile menu");
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
});

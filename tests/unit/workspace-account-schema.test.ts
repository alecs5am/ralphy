import { describe, expect, test } from "bun:test";
import { parseWorkspaceManifest } from "../../cli/lib/schemas/workspace";

describe("workspace account manifest", () => {
  test("adds account defaults to a legacy manifest", () => {
    expect(parseWorkspaceManifest({ slug: "acme", name: "Acme" })).toMatchObject({
      version: 1,
      slug: "acme",
      name: "Acme",
      description: "",
      profile: {
        displayName: "Acme",
        bio: "",
        language: "English",
        timezone: "UTC",
      },
      channels: {},
    });
  });

  test("preserves public channel identity and legacy extension fields", () => {
    const manifest = parseWorkspaceManifest({
      slug: "acme",
      name: "Acme",
      profile: { displayName: "Acme Labs", timezone: "Europe/Moscow" },
      channels: {
        telegram: { handle: "@acme" },
        x: { handle: "@acme" },
        threads: { handle: "@acme" },
        devto: { handle: "acme" },
        medium: { handle: "@acme" },
      },
      trust: { level: "L0" },
    });

    expect(manifest.profile.displayName).toBe("Acme Labs");
    expect(manifest.profile.language).toBe("English");
    expect(manifest.channels.telegram?.handle).toBe("@acme");
    expect(manifest.trust).toEqual({ level: "L0" });
  });

  test("rejects credentials inside public channel metadata", () => {
    expect(() =>
      parseWorkspaceManifest({
        slug: "acme",
        name: "Acme",
        channels: { telegram: { handle: "@acme", token: "not-allowed" } },
      }),
    ).toThrow();
  });
});

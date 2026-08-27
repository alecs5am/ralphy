import { describe, expect, test } from "vitest";

import { browserLabel, browserUrlFor } from "@/widgets/view-panel/ui/ViewBrowser";

describe("view panel browser", () => {
  test("reads what the operator typed as an address or as a search", () => {
    expect(browserUrlFor("https://ralphy.dev/docs")).toBe("https://ralphy.dev/docs");
    expect(browserUrlFor("http://localhost:5173")).toBe("http://localhost:5173/");
    // A bare host is a host; a host with a path or a port still is.
    expect(browserUrlFor("ralphy.dev")).toBe("https://ralphy.dev/");
    expect(browserUrlFor("ralphy.dev/blocks?q=1")).toBe("https://ralphy.dev/blocks?q=1");
    expect(browserUrlFor("  ralphy.dev  ")).toBe("https://ralphy.dev/");

    // Anything that is not a host is a search, including a scheme main would refuse anyway.
    expect(browserUrlFor("how to render a unit")).toContain("duckduckgo.com/?q=how%20to");
    expect(browserUrlFor("ralphy")).toContain("duckduckgo.com/?q=ralphy");
    expect(browserUrlFor("javascript:alert(1)")).toContain("duckduckgo.com/?q=javascript");
    expect(browserUrlFor("   ")).toBeNull();
  });

  test("names a tab by its page, falling back to the host", () => {
    expect(browserLabel("https://ralphy.dev/docs", "Ralphy Docs")).toBe("Ralphy Docs");
    expect(browserLabel("https://www.ralphy.dev/docs", "  ")).toBe("ralphy.dev");
    expect(browserLabel(null, "")).toBe("Browser");
    expect(browserLabel("not a url", "")).toBe("Browser");
    expect(browserLabel("https://ralphy.dev", "x".repeat(200))).toHaveLength(80);
  });
});

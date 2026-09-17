import { describe, expect, test, vi } from "vitest";
import { createLibraryEntry, libraryName } from "../electron/library-create";

describe("library creation", () => {
  test("passes a name as a separate argument and creates a portable unique slug", async () => {
    const cli = vi.fn(async () => ({ id: "ws-test" }));
    expect(await createLibraryEntry(cli, "workspace", " My Demo ")).toBe("ws-test");
    const args = cli.mock.calls[0] as unknown as [string[]];
    expect(args[0].slice(0, 3)).toEqual(["workspace", "create", "--as"]);
    expect(args[0][3]).toMatch(/^my-demo-[a-z0-9]{8}$/);
    expect(args[0][5]).toBe("My Demo");
    expect(() => libraryName("  ")).toThrow();
    expect(() => libraryName("bad\nname")).toThrow();
  });
});

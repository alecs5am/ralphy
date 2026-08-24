import { describe, expect, test } from "vitest";

import { readTitle, titlePrompt } from "../electron/agent/title";

describe("naming a chat", () => {
  test("asks for a title and nothing else", () => {
    const prompt = titlePrompt("Cut the hero unit down to fifteen seconds and reschedule it");
    expect(prompt).toContain("three to six words");
    expect(prompt).toContain("no explanation");
    expect(prompt).toContain("Cut the hero unit down");
    // A long first message is a source, not a payload: it is bounded.
    expect(titlePrompt("x".repeat(5_000)).length).toBeLessThan(1_600);
  });

  test("takes a title out of whatever came back", () => {
    expect(readTitle("Hero cut for fifteen seconds")).toBe("Hero cut for fifteen seconds");
    expect(readTitle('"Rescheduling the hero unit."')).toBe("Rescheduling the hero unit");
    expect(readTitle("Title: Memory cleanup\n\nLet me know if…")).toBe("Memory cleanup");
    expect(readTitle("  \n  **Weekly ship plan**  \n")).toBe("Weekly ship plan");

    // Not a title: nothing at all, or a model that answered with a paragraph.
    expect(readTitle("")).toBeNull();
    expect(readTitle("   \n  ")).toBeNull();
    expect(readTitle("Sure, I can help you with that and here is what I would suggest first")).toBeNull();
  });
});

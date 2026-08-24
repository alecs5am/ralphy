import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { AgentTaggedText, tagQueryAt } from "../src/components/agent/AgentComposer";

describe("the composer's `@` rule", () => {
  test("opens on a fresh `@` and on one after a space", () => {
    expect(tagQueryAt("@")).toEqual({ start: 0, query: "" });
    expect(tagQueryAt("look at @trail")).toEqual({ start: 8, query: "trail" });
  });

  test("stays shut where an `@` is not a trigger", () => {
    expect(tagQueryAt("nothing to attach")).toBeNull();
    /* An address, a handle: the `@` is inside a word. */
    expect(tagQueryAt("mail me at ops@ralphy.app")).toBeNull();
    /* The caret has moved past the query. */
    expect(tagQueryAt("@trail shoe")).toBeNull();
  });
});

describe("a serialised prompt read back", () => {
  test("renders each tag as a chip and leaves the rest as text", () => {
    const html = renderToStaticMarkup(
      AgentTaggedText({ text: "rerun @project:ux-testing-lab/trail-shoe-002 with @unit:cover-a" }),
    );
    expect(html).toContain("ux-testing-lab/trail-shoe-002");
    expect(html.match(/agent-tag inline-block/g)).toHaveLength(2);
    expect(html).toContain("is-project");
    expect(html).toContain("is-unit");
    expect(html).not.toContain("@project:");
  });

  test("leaves an unknown kind alone", () => {
    expect(renderToStaticMarkup(AgentTaggedText({ text: "ask @render:foo" })))
      .toBe("ask @render:foo");
  });
});

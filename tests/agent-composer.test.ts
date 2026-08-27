import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { AgentTaggedText, tagQueryAt } from "@/features/agent-chat/ui/AgentComposer";

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

describe("the picker's cursor", () => {
  const source = readFileSync(join(process.cwd(), "src/features/agent-chat/ui/AgentComposer.tsx"), "utf8");

  test("survives a keystroke that did not change the query", () => {
    /* `sync` runs on `input`, `keyup` and `mouseup`. It must not touch the highlight: it used to
       set it to 0, so the keyup of the very arrow that moved the cursor put it back on the first
       row and no other row could ever be picked. The reset belongs to a change of query -- a new
       query is a new row set -- which is why it lives in an effect keyed on it. */
    const sync = /const sync = useCallback\(\(\): void => \{([\s\S]*?)\n  \}, \[onChange\]\);/.exec(source)?.[1] ?? "";
    expect(sync).toContain("setQuery(");
    expect(sync).not.toContain("setHighlight");
    expect(source).toContain("useEffect(() => { setHighlight(0); }, [query]);");
  });

  test("is clamped to the rows it can land on, and Enter picks where it stands", () => {
    expect(source).toContain("const cursor = rows.length ? Math.min(highlight, rows.length - 1) : 0;");
    expect(source).toContain("insert(rows[cursor]!)");
    expect(source).toContain('setHighlight((cursor + (event.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length)');
  });

  test("caps the field's growth and reads at the chat's type step", () => {
    expect(source).toContain("max-h-agent-composer");
    expect(source).toContain("overflow-y-auto");
    expect(source).toContain("type-md");
    expect(source).not.toContain("type-body");
  });
});

import { describe, expect, test } from "vitest";
import {
  activateTerminalTab,
  addTerminalTab,
  closeTerminalTab,
  createTerminalLayout,
  moveTerminalTab,
  setSplitRatio,
  splitTerminalTab,
  type TerminalLayoutNode,
  type TerminalLeaf,
  type TerminalSplit,
} from "../src/terminal/layout";

function asLeaf(node: TerminalLayoutNode): TerminalLeaf {
  expect(node.kind).toBe("leaf");
  return node as TerminalLeaf;
}

function asSplit(node: TerminalLayoutNode): TerminalSplit {
  expect(node.kind).toBe("split");
  return node as TerminalSplit;
}

describe("terminal layout", () => {
  test("adds tabs to one leaf and activates the newest terminal", () => {
    const initial = createTerminalLayout();
    const one = addTerminalTab(initial, "one");
    const two = addTerminalTab(one, "two");

    expect(asLeaf(two)).toMatchObject({
      id: "terminal-root",
      tabs: ["one", "two"],
      activeId: "two",
    });
    expect(asLeaf(initial)).toMatchObject({ tabs: [], activeId: null });
  });

  test("splits a tab toward the requested pane edge", () => {
    const initial = addTerminalTab(
      addTerminalTab(createTerminalLayout(), "one"),
      "two",
    );
    const split = asSplit(
      splitTerminalTab(initial, "two", "terminal-root", "right"),
    );

    expect(split.axis).toBe("row");
    expect(split.ratio).toBe(0.5);
    expect(asLeaf(split.first)).toMatchObject({
      tabs: ["one"],
      activeId: "one",
    });
    expect(asLeaf(split.second)).toMatchObject({
      tabs: ["two"],
      activeId: "two",
    });

    const stacked = asSplit(
      splitTerminalTab(
        addTerminalTab(createTerminalLayout(), "three"),
        "four",
        "terminal-root",
        "top",
      ),
    );
    expect(stacked.axis).toBe("column");
    expect(asLeaf(stacked.first).tabs).toEqual(["four"]);
    expect(asLeaf(stacked.second).tabs).toEqual(["three"]);
  });

  test("moves and reorders tabs without duplicating sessions", () => {
    const first = addTerminalTab(
      addTerminalTab(createTerminalLayout(), "one"),
      "two",
    );
    const split = asSplit(
      splitTerminalTab(first, "two", "terminal-root", "right"),
    );
    const leftId = asLeaf(split.first).id;
    const rightId = asLeaf(split.second).id;

    const withThree = addTerminalTab(split, "three", rightId);
    const reordered = moveTerminalTab(withThree, "three", rightId, 0);
    expect(asLeaf(asSplit(reordered).second).tabs).toEqual(["three", "two"]);

    const stillSplit = moveTerminalTab(reordered, "three", leftId);
    expect(asLeaf(asSplit(stillSplit).first).tabs).toEqual(["one", "three"]);
    expect(asLeaf(asSplit(stillSplit).second).tabs).toEqual(["two"]);

    const collapsed = moveTerminalTab(stillSplit, "two", leftId);
    expect(asLeaf(collapsed)).toMatchObject({
      tabs: ["one", "three", "two"],
      activeId: "two",
    });
  });

  test("closing active tabs picks a neighbor and collapses empty panes", () => {
    const initial = addTerminalTab(
      addTerminalTab(createTerminalLayout(), "one"),
      "two",
    );
    const selected = activateTerminalTab(initial, "one");
    expect(asLeaf(selected).activeId).toBe("one");

    const remaining = closeTerminalTab(selected, "one");
    expect(asLeaf(remaining)).toMatchObject({
      tabs: ["two"],
      activeId: "two",
    });

    const split = splitTerminalTab(
      remaining,
      "three",
      "terminal-root",
      "bottom",
    );
    expect(asLeaf(closeTerminalTab(split, "three"))).toMatchObject({
      tabs: ["two"],
      activeId: "two",
    });
  });

  test("clamps split ratios and ignores unknown ids", () => {
    const split = asSplit(
      splitTerminalTab(
        addTerminalTab(createTerminalLayout(), "one"),
        "two",
        "terminal-root",
        "left",
      ),
    );

    expect(asSplit(setSplitRatio(split, split.id, 0.99)).ratio).toBe(0.8);
    expect(asSplit(setSplitRatio(split, split.id, -2)).ratio).toBe(0.2);
    expect(setSplitRatio(split, "missing", 0.4)).toBe(split);
    expect(activateTerminalTab(split, "missing")).toBe(split);
  });
});

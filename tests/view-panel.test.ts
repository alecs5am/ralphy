import { describe, expect, test } from "vitest";

import {
  activeViewTab,
  closeViewTab,
  HOME_TAB_ID,
  openViewTab,
  selectViewTab,
  stepViewTab,
  tabSetFor,
  VIEW_TYPES,
  VIEW_PANEL_DEFAULT,
  VIEW_PANEL_MAX,
  VIEW_PANEL_MIN,
  workspacePageForTab,
} from "../src/state/view-panel";
import {
  EMPTY_VIEW_PANEL,
  normalizeTabSet,
  readViewPanel,
  type ViewTabSet,
} from "../src/state/workbench";

/* Handoff 14's navigation rules are the design, not decoration, so each one is pinned here as a
   fact about the algebra rather than as a claim in a comment. */

const set = (): ViewTabSet => normalizeTabSet(undefined);
const labels = (value: ViewTabSet) => value.tabs.map(({ label }) => label);

describe("view panel tabs", () => {
  test("home is first, permanent, and the fallback active tab", () => {
    const fresh = set();
    expect(fresh.tabs).toHaveLength(1);
    expect(fresh.tabs[0]!.id).toBe(HOME_TAB_ID);
    expect(fresh.activeTabId).toBe(HOME_TAB_ID);

    // However the stored record got there: a set without home, or with home in the middle, or
    // pointing at a tab that no longer exists, still normalizes to home-first and a live active id.
    const wrong = normalizeTabSet({
      tabs: [
        { id: "calendar:self:1", type: "calendar", targetId: null, label: "Calendar" },
        { id: HOME_TAB_ID, type: "home", targetId: null, label: "Workspace" },
      ],
      activeTabId: "gone",
    });
    expect(wrong.tabs.map(({ type }) => type)).toEqual(["home", "calendar"]);
    expect(wrong.activeTabId).toBe(HOME_TAB_ID);

    // Home cannot be closed, and closing it is a no-op rather than an error.
    expect(closeViewTab(wrong, HOME_TAB_ID)).toBe(wrong);
  });

  test("a singleton raises its tab; a document opens one per target", () => {
    let value = openViewTab(set(), { type: "calendar", label: "Calendar" });
    const calendarId = value.activeTabId;
    value = openViewTab(value, { type: "memory", label: "Memory" });
    expect(labels(value)).toEqual(["Workspace", "Calendar", "Memory"]);

    // Opening Calendar again raises the tab it already has instead of appending a second one.
    value = openViewTab(value, { type: "calendar", label: "Calendar" });
    expect(labels(value)).toEqual(["Workspace", "Calendar", "Memory"]);
    expect(value.activeTabId).toBe(calendarId);

    // A document is per target: two projects are two tabs, the same project is one.
    value = openViewTab(value, { type: "project", targetId: "alpha", label: "Alpha" });
    value = openViewTab(value, { type: "project", targetId: "beta", label: "Beta" });
    value = openViewTab(value, { type: "project", targetId: "alpha", label: "Alpha" });
    expect(labels(value)).toEqual(["Workspace", "Calendar", "Memory", "Alpha", "Beta"]);
    expect(activeViewTab(value).label).toBe("Alpha");

    // A raise with nothing to change returns the same object, so a caller can compare by identity
    // and skip the write. This is what keeps the route-follow effect from looping.
    expect(openViewTab(value, { type: "project", targetId: "alpha", label: "Alpha" })).toBe(value);

    // A renamed target keeps its tab and takes the new label.
    const renamed = openViewTab(value, { type: "project", targetId: "alpha", label: "Alpha v2" });
    expect(renamed).not.toBe(value);
    expect(labels(renamed)).toContain("Alpha v2");
    expect(renamed.tabs).toHaveLength(value.tabs.length);
  });

  test("closing hands over to the tab on the left, and stepping wraps", () => {
    let value = openViewTab(set(), { type: "calendar", label: "Calendar" });
    value = openViewTab(value, { type: "memory", label: "Memory" });
    value = openViewTab(value, { type: "shared", label: "Shared library" });

    // Closing the active tab moves to its left-hand neighbour...
    value = closeViewTab(value, value.activeTabId);
    expect(activeViewTab(value).label).toBe("Memory");
    // ...and closing an inactive one leaves the active tab where it was.
    const memoryId = value.activeTabId;
    value = closeViewTab(value, value.tabs[1]!.id);
    expect(value.activeTabId).toBe(memoryId);
    expect(labels(value)).toEqual(["Workspace", "Memory"]);
    // Closing the last view lands on home, which is always there to land on.
    value = closeViewTab(value, memoryId);
    expect(value.activeTabId).toBe(HOME_TAB_ID);

    // ⌥⌘←/→ wraps, so neither end of the strip is a dead stop.
    let wrapping = openViewTab(set(), { type: "calendar", label: "Calendar" });
    wrapping = openViewTab(wrapping, { type: "memory", label: "Memory" });
    expect(activeViewTab(stepViewTab(wrapping, 1)).id).toBe(HOME_TAB_ID);
    expect(activeViewTab(stepViewTab(wrapping, -1)).label).toBe("Calendar");
    expect(activeViewTab(stepViewTab(stepViewTab(wrapping, 1), -1)).label).toBe("Memory");

    // Selecting a tab that is not in the set changes nothing.
    expect(selectViewTab(wrapping, "not-here")).toBe(wrapping);
  });

  test("every openable type routes somewhere, and the home tab does not", () => {
    for (const descriptor of VIEW_TYPES) {
      const tab = { id: "x", type: descriptor.type, targetId: null, label: descriptor.label };
      // A singleton is a workspace page; the one document type is the project, which routes by id.
      expect(workspacePageForTab(tab) === null).toBe(descriptor.type === "project");
    }
    expect(workspacePageForTab({ id: HOME_TAB_ID, type: "home", targetId: null, label: "Workspace" })).toBeNull();
  });

  test("a stored panel is read defensively and remembers tabs per workspace", () => {
    expect(readViewPanel(null)).toEqual(EMPTY_VIEW_PANEL);
    expect(readViewPanel({ width: 9_000 }).width).toBe(VIEW_PANEL_MAX);
    expect(readViewPanel({ width: 10 }).width).toBe(VIEW_PANEL_MIN);
    expect(readViewPanel({ width: "wide" }).width).toBe(VIEW_PANEL_DEFAULT);
    expect(readViewPanel({ open: false }).open).toBe(false);

    // A tab with an unknown type, or no type at all, is dropped rather than trusted.
    const record = readViewPanel({
      tabsByWorkspace: {
        alpha: {
          tabs: [
            { id: "a", type: "calendar", targetId: null, label: "Calendar" },
            { id: "b", type: "browser", targetId: null, label: "Browser" },
            { id: "c", label: "No type" },
          ],
          activeTabId: "a",
        },
        beta: { tabs: [] },
      },
    });
    expect(labels(tabSetFor(record, "alpha"))).toEqual(["Workspace", "Calendar"]);
    expect(tabSetFor(record, "alpha").activeTabId).toBe("a");
    // A workspace with nothing worth storing is not stored, and an unknown one still reads as home.
    expect(record.tabsByWorkspace.beta).toBeUndefined();
    expect(tabSetFor(record, "gamma").tabs).toHaveLength(1);
    expect(tabSetFor(record, null).activeTabId).toBe(HOME_TAB_ID);
  });
});

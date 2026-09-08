import { describe, expect, test } from "vitest";

import type { OverviewPublicationDto, UnitDto } from "../electron/ralphy/types";
import { matchesWorkspaceUnit, publicationOf } from "@/pages/workspace-units";

const unit = { id: "unit-1" } as UnitDto;
const publication = (unitId: string, state: string): OverviewPublicationDto => (
  { unitId, state } as unknown as OverviewPublicationDto
);

describe("what the workspace's Units page can state about a Unit", () => {
  test("combines text and format without excluding matches in a project name", () => {
    const item = { slug: "launch-film", format: "video" };
    expect(matchesWorkspaceUnit(item, "Summer campaign", " SUMMER ", "video")).toBe(true);
    expect(matchesWorkspaceUnit(item, "Summer campaign", "launch", "carousel")).toBe(false);
    expect(matchesWorkspaceUnit(item, "Summer campaign", "missing", "")).toBe(false);
    expect(matchesWorkspaceUnit(item, "Summer campaign", "", "")).toBe(true);
  });
  test("reports a publication, and prefers published over scheduled", () => {
    expect(publicationOf(unit, [publication("unit-1", "scheduled")])).toBe("scheduled");
    expect(publicationOf(unit, [
      publication("unit-1", "scheduled"),
      publication("unit-1", "published"),
    ])).toBe("published");
  });

  test("claims nothing when no publication belongs to the Unit", () => {
    /* The fuller lifecycle -- rendering, render failed, preview ready, selected -- needs the
       Unit's revision and builds, which this list does not read. A row states a publication or
       states nothing; it used to report "Selected" for every Unit with a selected revision, which
       contradicted the project's own panel. */
    expect(publicationOf(unit, [])).toBeNull();
    expect(publicationOf(unit, [publication("unit-2", "published")])).toBeNull();
    expect(publicationOf(unit, [publication("unit-1", "failed")])).toBeNull();
  });
});

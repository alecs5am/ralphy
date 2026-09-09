import type { UnitOutcomePresentation, WorkspaceOverviewPresentation } from "./overview-presentation-types";

function sampleIdentity(value: WorkspaceOverviewPresentation, slug: string, title: string): Omit<UnitOutcomePresentation, "performance"> {
  const upcoming = value.plan?.upcoming;
  const events = upcoming?.status === "ready" || upcoming?.status === "partial" ? upcoming.value : [];
  const matches = new Map(events.filter((event) => event.unit?.slug === slug).map((event) => [event.unitId, event]));
  const event = matches.size === 1 ? [...matches.values()][0] : undefined;
  const unit = event?.unit;
  return {
    id: `demo-${slug}`, unitId: unit?.id ?? "", projectId: unit?.projectId ?? "",
    title: unit?.slug ?? title, projectTitle: event?.project?.name ?? "Sample project",
    revisionLabel: unit ? unit.selectedRevisionId ? "Selected revision" : "No selected revision" : "Sample revision",
  };
}

/** Opt-in, renderer-only sample. Never writes to the workspace or changes real records. */
export function previewWorkspaceOverview(value: WorkspaceOverviewPresentation, selected: boolean): WorkspaceOverviewPresentation {
  if (!selected || value.header.name !== "UX Testing Lab") return value;
  return {
    ...value,
    momentum: {
      periodLabel: "Demo · 7 sample days",
      totals: { publications: 24, views: 128400, likes: 8620, comments: 482, shares: 1240, watchTimeMs: 198000000 },
      trend: { status: "ready", value: [
        { label: "Mon", value: 12400 }, { label: "Tue", value: 15800 },
        { label: "Wed", value: 13200 }, { label: "Thu", value: 19100 },
        { label: "Fri", value: 18400 }, { label: "Sat", value: 22100 }, { label: "Sun", value: 27400 },
      ] },
    },
    outcomes: { status: "ready", value: {
      top: [{
        ...sampleIdentity(value, "morning-ritual", "Morning ritual"),
        performance: {
          sample: true, windowLabel: "Last 7 days", baseline: "Previous 7 days",
          observation: "Instagram leads the gain. YouTube is down despite the overall lift.",
          channels: [
            { platform: "instagram", views: 36400, previousViews: 20000, engagementRate: 9.2, completionRate: 74 },
            { platform: "tiktok", views: 28400, previousViews: 20000, engagementRate: 7.8, completionRate: 68 },
            { platform: "youtube", views: 8400, previousViews: 10000, engagementRate: 4.1, completionRate: 51 },
          ],
        },
      }],
      emerging: [],
      learningOpportunities: [{
        ...sampleIdentity(value, "closer-look", "Closer look"),
        performance: {
          sample: true, windowLabel: "Last 7 days", baseline: "Previous 7 days",
          observation: "Instagram drives the decline. YouTube is the one channel gaining views.",
          channels: [
            { platform: "instagram", views: 8100, previousViews: 15000, engagementRate: 3.1, completionRate: 38 },
            { platform: "tiktok", views: 12300, previousViews: 15000, engagementRate: 4.4, completionRate: 46 },
            { platform: "youtube", views: 8400, previousViews: 7500, engagementRate: 5.8, completionRate: 61 },
          ],
        },
      }],
    } },
  };
}

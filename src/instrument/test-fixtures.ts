import type { InstrumentRouteKey, InstrumentScenarioState } from "./screen-state-registry";

export interface InstrumentTestFixture {
  id: string;
  routeKey: InstrumentRouteKey;
  state: InstrumentScenarioState;
  payload: unknown;
}

export interface InstrumentTestFixtureProvider {
  get(fixtureId: string): InstrumentTestFixture | null;
}

interface FixtureRegistration {
  routeKey: InstrumentRouteKey;
  state: InstrumentScenarioState;
  scenarioId: string;
  overlay: string | null;
  overlayOwner: string | null;
}

const routeStateSource = "startup.welcome=restoring,ready;startup.library=restoring,ready,empty,unavailable,error;startup.migration=unavailable;workspace.overview=loading,ready,partial,error;workspace.projects=ready,empty;workspace.units=loading,ready,empty,partial,error;workspace.shared=loading,ready,empty,partial,error;workspace.memory=loading,ready,empty,unavailable,selected;workspace.calendar=loading,ready,empty,partial,error,selected,scheduling;project.units=loading,ready,empty,partial,error,selected,viewer,conflict;project.documents=loading,ready,empty,partial,error,selected,editing,conflict;project.media=loading,ready,empty,partial,error,selected,viewer;project.activity=loading,ready,empty,partial,error,selected;settings.general=ready;settings.profile=ready;settings.appearance=ready;settings.keys=ready;settings.agents=ready;settings.providers=ready;settings.storage=ready;settings.permissions=ready;settings.terminal=ready;settings.diagnostics=ready;settings.updates=ready;settings.about=ready;marketplace.discover=loading,error,partial,ready;marketplace.results=loading,error,partial,empty,ready;marketplace.collection=loading,error,unavailable;marketplace.detail=loading,ready,unavailable,error;marketplace.category.models=loading,error,partial,empty,ready;marketplace.category.templates=loading,error,partial,empty,ready;marketplace.category.recipes=loading,error,partial,empty,ready;marketplace.category.prompts=loading,error,partial,empty,unavailable;marketplace.category.components=loading,error,partial,empty,unavailable;marketplace.category.skills=loading,error,partial,empty,unavailable;marketplace.library.installed=unavailable,empty,ready;marketplace.library.saved=unavailable;marketplace.library.added=unavailable;marketplace.library.downloads=unavailable;marketplace.library.updates=unavailable;marketplace.library.attention=unavailable;marketplace.unavailable-detail.prompts=unavailable;marketplace.unavailable-detail.components=unavailable;marketplace.unavailable-detail.skills=unavailable";
const localOverlaySource = "root-picker=startup.welcome,ready;migration-recovery=startup.migration,unavailable;app-alert=startup.library,error;profile-menu=startup.library,ready;settings=settings.general,ready;dynamic-island=startup.library,ready;right-rail-sheet=startup.library,ready;workspace-account-detail=workspace.overview,ready;workspace-unit-outcome-detail=workspace.overview,ready;workspace-evidence-detail=workspace.overview,ready;shared-inspector=workspace.shared,ready;shared-viewer=workspace.shared,ready;shared-workflow=workspace.shared,ready;memory-recall=workspace.memory,selected;memory-editor=workspace.memory,selected;memory-history=workspace.memory,selected;memory-confirm=workspace.memory,selected;calendar-filter=workspace.calendar,ready;calendar-drawer=workspace.calendar,ready;calendar-inspector=workspace.calendar,selected;calendar-schedule=workspace.calendar,scheduling;calendar-unit-picker=workspace.calendar,scheduling;calendar-date-popover=workspace.calendar,scheduling;calendar-time-popover=workspace.calendar,scheduling;calendar-platform-settings=workspace.calendar,ready;calendar-account-detail=workspace.calendar,selected;calendar-reconnect=workspace.calendar,selected;document-editor=project.documents,editing;document-viewer=project.documents,selected;document-conflict=project.documents,conflict;media-viewer=project.media,viewer;media-context-menu=project.media,selected;mock-needs-work=project.media,selected;unit-viewer=project.units,viewer;run-inspector=project.activity,selected;marketplace-detail=marketplace.detail,ready;target-chooser=marketplace.detail,ready;view-panel-types=workspace.overview,ready;view-panel-overflow=workspace.overview,ready";

const routeStates = new Map<InstrumentRouteKey, readonly InstrumentScenarioState[]>(routeStateSource.split(";").map((entry) => {
  const [routeKey, states] = entry.split("=");
  return [routeKey as InstrumentRouteKey, states.split(",") as InstrumentScenarioState[]];
}));
const routeKeys = [...routeStates.keys()];
const preferredState = (routeKey: InstrumentRouteKey) => {
  const states = routeStates.get(routeKey)!;
  return states.includes("ready") ? "ready" : states[0]!;
};
const routeScenarioId = (routeKey: InstrumentRouteKey, state: InstrumentScenarioState) => (
  `${routeKey.startsWith("project.") ? routeKey.slice("project.".length) : routeKey}.${state}`
);

const registrations: FixtureRegistration[] = routeKeys.flatMap((routeKey) => routeStates.get(routeKey)!.map((state) => ({
  routeKey,
  state,
  scenarioId: routeScenarioId(routeKey, state),
  overlay: null,
  overlayOwner: null,
})));

for (const entry of localOverlaySource.split(";")) {
  const [overlay, target] = entry.split("=");
  const [routeKey, state] = target.split(",") as [InstrumentRouteKey, InstrumentScenarioState];
  registrations.push({ routeKey, state, scenarioId: `overlay.${overlay}.${routeKey}`, overlay, overlayOwner: null });
}

const sharedOwners: readonly [string, readonly InstrumentRouteKey[]][] = [
  ["settings.rows", routeKeys.filter((routeKey) => routeKey.startsWith("settings."))],
  ["shared.toolbar", ["workspace.shared"]],
  ["shared.workflow", ["workspace.shared"]],
  ["memory.editor", ["workspace.memory"]],
  ["project.media", ["project.media"]],
  ["project.activity", ["project.activity"]],
  ["marketplace.header", routeKeys.filter((routeKey) => routeKey.startsWith("marketplace."))],
];
for (const [overlayOwner, routes] of sharedOwners) {
  for (const routeKey of routes) registrations.push({
    routeKey,
    state: preferredState(routeKey),
    scenarioId: `overlay.shared-select-menu.${overlayOwner}.${routeKey}`,
    overlay: "shared-select-menu",
    overlayOwner,
  });
}

const workspacePickerRoutes = routeKeys.filter((routeKey) => routeKey.startsWith("workspace.") || routeKey.startsWith("project."));
const chatRoutes = routeKeys.filter((routeKey) => routeKey === "startup.library"
  || routeKey.startsWith("workspace.") || routeKey.startsWith("project.") || routeKey.startsWith("marketplace."));
for (const [overlay, routes] of [
  ["workspace-picker", workspacePickerRoutes],
  ["agent-chat-recent-menu", chatRoutes],
  ["agent-chat-provider-menu", chatRoutes],
  ["agent-chat-model-menu", chatRoutes],
  ["agent-chat-mode-menu", chatRoutes],
] as const) {
  for (const routeKey of routes) registrations.push({
    routeKey,
    state: preferredState(routeKey),
    scenarioId: `overlay.${overlay}.${routeKey}`,
    overlay,
    overlayOwner: null,
  });
}

const fixtureId = ({ routeKey, state, scenarioId, overlay, overlayOwner }: FixtureRegistration) => [
  "instrument-test-fixture", encodeURIComponent(routeKey), state, encodeURIComponent(scenarioId), overlay ?? "-", overlayOwner ?? "-",
].join(":");

const fixtures = new Map(registrations.map((registration): [string, InstrumentTestFixture] => {
  const id = fixtureId(registration);
  return [id, {
    id,
    routeKey: registration.routeKey,
    state: registration.state,
    payload: {
      kind: "instrument-test-fixture",
      workspace: { id: "ux-testing-lab", name: "UX Testing Lab" },
      scenarioId: registration.scenarioId,
      overlay: registration.overlay,
      overlayOwner: registration.overlayOwner,
      journey: registration.overlay === null ? null : registration.overlay === "shared-select-menu"
        ? ["open", "select", "escape", "focus-return"]
        : ["open", "escape", "focus-return"],
    },
  }];
}));
if (fixtures.size !== 339 || fixtures.size !== registrations.length) throw new Error("Invalid instrument test fixture inventory");

export const instrumentTestFixtureProvider: InstrumentTestFixtureProvider = {
  get: (id) => fixtures.get(id) ?? null,
};

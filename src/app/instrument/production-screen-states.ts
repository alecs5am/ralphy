import { isChatRailVisible, isWorkspacePickerVisible } from "../App";
import { welcomeInstrumentStates } from "@/widgets/welcome";
import { calendarInstrumentStates } from "@/pages/calendar";
import { contextInstrumentStates } from "@/pages/context";
import { libraryInstrumentStates } from "@/pages/library";
import { marketplaceInstrumentStates } from "@/pages/marketplace";
import { memoryInstrumentStates } from "@/pages/memory";
import { migrationInstrumentStates } from "@/pages/migration-recovery";
import { settingsInstrumentStates } from "@/pages/settings";
import { sharedLibraryInstrumentStates } from "@/pages/shared-library";
import { workspaceOverviewInstrumentStates } from "@/pages/workspace";
import {
  workspaceProjectsInstrumentStates,
} from "@/pages/workspace-projects";
import { workspaceUnitsInstrumentStates } from "@/pages/workspace-units";
import { activityInstrumentStates } from "@/pages/project";
import { documentsInstrumentStates } from "@/pages/project";
import { mediaInstrumentStates } from "@/pages/project";
import { unitsInstrumentStates } from "@/pages/project";
import type {
  InstrumentScenarioState,
  InstrumentScreenStateDescriptor,
} from "@/shared/instrument/screen-state-registry";
import type { InstrumentRouteKey } from "./routes";
import type { InstrumentOverlayId } from "@/shared/instrument/overlay-registry";

/* The catalogue is where a page's route key is checked against the union: every descriptor the
   app collects has to be one of the routes the app declares. A page states a literal and the
   registry keeps it, so a typo fails here rather than going unnoticed. */
export const PRODUCTION_SCREEN_STATES: readonly InstrumentScreenStateDescriptor<InstrumentRouteKey>[] = [
  welcomeInstrumentStates,
  libraryInstrumentStates,
  migrationInstrumentStates,
  workspaceOverviewInstrumentStates,
  workspaceProjectsInstrumentStates,
  workspaceUnitsInstrumentStates,
  sharedLibraryInstrumentStates,
  memoryInstrumentStates,
  contextInstrumentStates,
  calendarInstrumentStates,
  unitsInstrumentStates,
  documentsInstrumentStates,
  mediaInstrumentStates,
  activityInstrumentStates,
  ...settingsInstrumentStates,
  ...marketplaceInstrumentStates,
];

const hasWorkspace = (routeKey: InstrumentRouteKey) => (
  routeKey.startsWith("workspace.") || routeKey.startsWith("project.")
);
const hasWorkbench = (routeKey: InstrumentRouteKey) => (
  routeKey === "startup.library"
  || routeKey.startsWith("workspace.")
  || routeKey.startsWith("project.")
  || routeKey.startsWith("marketplace.")
);

export const WORKSPACE_PICKER_ROUTE_KEYS: readonly InstrumentRouteKey[] = PRODUCTION_SCREEN_STATES
  .filter(({ routeKey }) => isWorkspacePickerVisible({
    mode: routeKey.startsWith("marketplace.") ? "marketplace" : "work",
    sidebarVisible: true,
    workspaceId: hasWorkspace(routeKey) ? "registered-workspace" : null,
  }))
  .map(({ routeKey }) => routeKey);

export const CHAT_RAIL_ROUTE_KEYS: readonly InstrumentRouteKey[] = PRODUCTION_SCREEN_STATES
  .filter(({ routeKey }) => isChatRailVisible({
    workbenchVisible: hasWorkbench(routeKey),
    rightPanelVisible: true,
  }))
  .map(({ routeKey }) => routeKey);

export const PRODUCTION_GLOBAL_OVERLAY_ROUTES = {
  "workspace-picker": WORKSPACE_PICKER_ROUTE_KEYS,
  "agent-chat-recent-menu": CHAT_RAIL_ROUTE_KEYS,
  "agent-chat-provider-menu": CHAT_RAIL_ROUTE_KEYS,
  "agent-chat-model-menu": CHAT_RAIL_ROUTE_KEYS,
  "agent-chat-mode-menu": CHAT_RAIL_ROUTE_KEYS,
  "agent-chat-context": CHAT_RAIL_ROUTE_KEYS,
} as const satisfies Readonly<Partial<Record<InstrumentOverlayId, readonly InstrumentRouteKey[]>>>;

export type ProductionGlobalOverlayId = keyof typeof PRODUCTION_GLOBAL_OVERLAY_ROUTES;

export type ProductionLocalOverlayId = Exclude<InstrumentOverlayId, "shared-select-menu" | ProductionGlobalOverlayId>;

export const PRODUCTION_LOCAL_OVERLAY_TARGETS = {
  "root-picker": { routeKey: "startup.welcome", state: "ready" },
  "migration-recovery": { routeKey: "startup.migration", state: "unavailable" },
  "app-alert": { routeKey: "startup.library", state: "error" },
  "profile-menu": { routeKey: "startup.library", state: "ready" },
  settings: { routeKey: "settings.general", state: "ready" },
  "dynamic-island": { routeKey: "startup.library", state: "ready" },
  "right-rail-sheet": { routeKey: "startup.library", state: "ready" },
  "workspace-account-detail": { routeKey: "workspace.overview", state: "ready" },
  "workspace-unit-outcome-detail": { routeKey: "workspace.overview", state: "ready" },
  "workspace-evidence-detail": { routeKey: "workspace.overview", state: "ready" },
  "shared-inspector": { routeKey: "workspace.shared", state: "ready" },
  "shared-viewer": { routeKey: "workspace.shared", state: "ready" },
  "shared-workflow": { routeKey: "workspace.shared", state: "ready" },
  "memory-recall": { routeKey: "workspace.memory", state: "selected" },
  "memory-editor": { routeKey: "workspace.memory", state: "selected" },
  "memory-history": { routeKey: "workspace.memory", state: "selected" },
  "memory-confirm": { routeKey: "workspace.memory", state: "selected" },
  "calendar-filter": { routeKey: "workspace.calendar", state: "ready" },
  "calendar-drawer": { routeKey: "workspace.calendar", state: "ready" },
  "calendar-inspector": { routeKey: "workspace.calendar", state: "selected" },
  "calendar-schedule": { routeKey: "workspace.calendar", state: "scheduling" },
  "calendar-unit-picker": { routeKey: "workspace.calendar", state: "scheduling" },
  "calendar-date-popover": { routeKey: "workspace.calendar", state: "scheduling" },
  "calendar-time-popover": { routeKey: "workspace.calendar", state: "scheduling" },
  "calendar-platform-settings": { routeKey: "workspace.calendar", state: "ready" },
  "calendar-account-detail": { routeKey: "workspace.calendar", state: "selected" },
  "calendar-reconnect": { routeKey: "workspace.calendar", state: "selected" },
  "document-editor": { routeKey: "project.documents", state: "editing" },
  "document-viewer": { routeKey: "project.documents", state: "selected" },
  "document-conflict": { routeKey: "project.documents", state: "conflict" },
  "media-viewer": { routeKey: "project.media", state: "viewer" },
  "media-context-menu": { routeKey: "project.media", state: "selected" },
  "mock-needs-work": { routeKey: "project.media", state: "selected" },
  "unit-viewer": { routeKey: "project.units", state: "viewer" },
  "run-inspector": { routeKey: "project.activity", state: "selected" },
  "marketplace-detail": { routeKey: "marketplace.detail", state: "ready" },
  "target-chooser": { routeKey: "marketplace.detail", state: "ready" },
  /* The view panel's own menus. They are reachable from every workspace route under the chat lens,
     so the overview -- the route the home tab returns to -- is where they are exercised. */
  "view-panel-types": { routeKey: "workspace.overview", state: "ready" },
  "view-panel-overflow": { routeKey: "workspace.overview", state: "ready" },
  /* The Context page's reader. It opens from a name inside the prompt document, which is the page's
     ready state -- the inventory reaches it too, but through the same loader. */
  "context-reader": { routeKey: "workspace.context", state: "ready" },
} as const satisfies Record<ProductionLocalOverlayId, { routeKey: InstrumentRouteKey; state: InstrumentScenarioState }>;

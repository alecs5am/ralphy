import { isChatRailVisible, isWorkspacePickerVisible } from "../App";
import { welcomeInstrumentStates } from "../components/WelcomeScreen";
import { calendarInstrumentStates } from "../screens/CalendarScreen";
import { libraryInstrumentStates } from "../screens/LibraryScreen";
import { marketplaceInstrumentStates } from "../screens/MarketplaceScreen";
import { memoryInstrumentStates } from "../screens/MemoryScreen";
import { migrationInstrumentStates } from "../screens/MigrationRecoveryScreen";
import { settingsInstrumentStates } from "../screens/SettingsScreen";
import { sharedLibraryInstrumentStates } from "../screens/SharedLibraryScreen";
import { workspaceOverviewInstrumentStates } from "../screens/WorkspaceScreen";
import {
  workspaceProjectsInstrumentStates,
  workspaceUnitsInstrumentStates,
} from "../screens/WorkspaceProjectsScreen";
import { activityInstrumentStates } from "../screens/project/ActivityTimeline";
import { documentsInstrumentStates } from "../screens/project/DocumentsPanel";
import { mediaInstrumentStates } from "../screens/project/MediaPanel";
import { unitsInstrumentStates } from "../screens/project/UnitsPanel";
import type {
  InstrumentRouteKey,
  InstrumentScreenStateDescriptor,
} from "./screen-state-registry";
import type { InstrumentOverlayId } from "./overlay-registry";

export const PRODUCTION_SCREEN_STATES: readonly InstrumentScreenStateDescriptor[] = [
  welcomeInstrumentStates,
  libraryInstrumentStates,
  migrationInstrumentStates,
  workspaceOverviewInstrumentStates,
  workspaceProjectsInstrumentStates,
  workspaceUnitsInstrumentStates,
  sharedLibraryInstrumentStates,
  memoryInstrumentStates,
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
} as const satisfies Readonly<Partial<Record<InstrumentOverlayId, readonly InstrumentRouteKey[]>>>;

export type ProductionGlobalOverlayId = keyof typeof PRODUCTION_GLOBAL_OVERLAY_ROUTES;

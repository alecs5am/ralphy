/**
 * Which bridge the renderer talks to, and the types it talks in.
 *
 * The injected bridge normally wins; the mock beside this file stands in for it only where the
 * environment says mocks are permitted. Nothing else in the app decides this.
 */
import type { MediaWorkbenchBridge } from "../../../electron/media/types";
import { createMockBridge } from "./mock-bridge";

export type {
  AgentChatEnvelope,
  ActivityRefreshEvent,
  AgentChatEvent,
  AgentChatRequest,
  AgentModelOption,
  AgentPermissionMode,
  AgentProvider,
  AgentProviderStatus,
  AnnotationInput,
  AnnotationStore,
  CatalogResult,
  ClaudeAuthMethod,
  ClaudeAuthState,
  ClaudePermissionMode,
  LibraryOpenResult,
  MediaAnnotation,
  MediaEvent,
  MediaWorkbenchBridge,
  MarketplaceBridge,
  MarketplaceInstallDto,
  MarketplaceInstallMutation,
  MarketplaceInstallsDto,
  MarketplaceJsonValue,
  MarketplacePublicCategory,
  MarketplacePublicItemDto,
  MarketplacePublicSnapshotDto,
  MarketplaceRecipeDto,
  MarketplaceRecipeKind,
  MigrationRecovery,
  ProjectReference,
  ProjectCompositionPageRequest,
  ProjectTab,
  ProjectMediaFilter,
  ProjectPage,
  ProjectPreview,
  ProjectSummary,
  ProjectUnitPageRequest,
  RootIdentity,
  SharedLibraryAction,
  SharedLibraryQuery,
  TextReadResult,
  TrashResult,
  WorkspaceSummary,
} from "../../../electron/media/types";

export type RalphyBridge = MediaWorkbenchBridge;

declare global {
  interface Window {
    ralphy?: RalphyBridge;
  }
}

const injectedBridge = typeof window === "undefined" ? undefined : window.ralphy;
const rendererEnvironment = (import.meta as ImportMeta & {
  env: Record<string, string | boolean | undefined>;
}).env;
export function mockBridgeAllowed(
  environment: Record<string, string | boolean | undefined>,
): boolean {
  return environment.MODE === "test"
    || environment.VITE_RALPHY_ENABLE_MOCKS === "true";
}
const mockBridgeEnabled = mockBridgeAllowed(rendererEnvironment);
if (!injectedBridge && !mockBridgeEnabled) {
  throw new Error("Ralphy Desktop IPC bridge is unavailable");
}
/* The injected bridge normally wins: VITE_RALPHY_ENABLE_MOCKS only says mocks are *permitted*,
   and the geometry harnesses build with it while still installing their own `window.ralphy`.
   VITE_RALPHY_MOCK_BRIDGE_ONLY is the separate, stronger statement -- "this renderer is a design
   harness, ignore whatever Electron injected" -- which is what makes the fixtures visible when
   the dev build runs inside the real window instead of a browser tab. It is never set for a
   shipped build, and it means nothing unless mocks are permitted in the first place. */
const mockBridgeOnly = mockBridgeEnabled
  && rendererEnvironment.VITE_RALPHY_MOCK_BRIDGE_ONLY === "true";
export const bridge: RalphyBridge = mockBridgeOnly || !injectedBridge
  ? createMockBridge()
  : injectedBridge;

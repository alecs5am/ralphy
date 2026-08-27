/**
 * What the shell shows, as three decisions the app and its harness answer the same way.
 *
 * The instrument harness renders every route in every state, and it has to know which chrome a
 * route carries without mounting the app. These three used to be exported from `App.tsx` for
 * that reason alone: a screenshot harness importing a component file to ask a question about
 * visibility. They are the questions, so they live apart from the component that asks them.
 */
import type { ActivityRefreshEvent, RootIdentity } from "@/shared/api/ipc";
import type { AppMode } from "@/shared/model/routes";

export function isWorkspacePickerVisible({ mode, sidebarVisible, workspaceId }: {
  mode: AppMode;
  sidebarVisible: boolean;
  workspaceId: string | null;
}): boolean {
  return mode === "work" && sidebarVisible && workspaceId !== null;
}

export function isChatRailVisible({ workbenchVisible, rightPanelVisible }: {
  workbenchVisible: boolean;
  rightPanelVisible: boolean;
}): boolean {
  return workbenchVisible && rightPanelVisible;
}

/**
 * An activity announcement only moves the identity forward, and only for the store and epoch it
 * was announced for: a late event from a replaced root would otherwise reopen a closed library.
 */
export function applyActivityRefresh(
  identity: RootIdentity | null,
  event: ActivityRefreshEvent,
): RootIdentity | null {
  if (
    !identity
    || event.storeId !== identity.storeId
    || event.rootEpoch !== identity.rootEpoch
    || event.sequence <= identity.activitySequence
  ) return identity;
  return { ...identity, activitySequence: event.sequence };
}

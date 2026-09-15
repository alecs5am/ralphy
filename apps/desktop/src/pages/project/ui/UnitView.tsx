import { useEffect, useState, useSyncExternalStore } from "react";
import { bridge, type ProjectSummary } from "@/shared/api/ipc";
import { COMMAND_BUTTON, PROJECT_LOCAL_ERROR, PROJECT_SKELETON } from "@/shared/ui/route-chrome";
import type { ProjectScreenController } from "../model/screen-controller";
import { startProjectScreenController } from "./ProjectScreen";
import { UnitViewer } from "./UnitViewer";

function ConnectedUnitView({ controller, unitId, onClose }: {
  controller: ProjectScreenController; unitId: string; onClose(): void;
}) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => { void controller.openUnit(unitId); }, [controller, unitId]);
  const error = snapshot.unit.error ?? snapshot.inspectedUnitRevision.error;
  if (error) return <div className={PROJECT_LOCAL_ERROR} role="alert"><span>{error}</span><button className={COMMAND_BUTTON} type="button" onClick={() => void controller.openUnit(unitId)}>Retry</button><button className={COMMAND_BUTTON} type="button" onClick={onClose}>Close</button></div>;
  return <UnitViewer embedded open controller={controller} snapshot={snapshot} returnFocus={null} onOpenChange={(open) => { if (!open) onClose(); }} />;
}

/** The existing Unit viewer in a chat's view tab, without a project route or modal overlay. */
export function UnitView({ project, unitId, rootEpoch, onClose }: {
  project: ProjectSummary; unitId: string; rootEpoch: number; onClose(): void;
}) {
  const [controller, setController] = useState<ProjectScreenController | null>(null);
  useEffect(() => startProjectScreenController(bridge, project, 0, setController), [project.projectId, project.workspaceId, rootEpoch]);
  return controller ? <ConnectedUnitView controller={controller} unitId={unitId} onClose={onClose} />
    : <div className={PROJECT_SKELETON} role="status">Loading Unit…</div>;
}

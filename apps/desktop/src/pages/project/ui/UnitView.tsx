import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { bridge, type ProjectReference } from "@/shared/api/ipc";
import { COMMAND_BUTTON, PROJECT_LOCAL_ERROR, PROJECT_SKELETON } from "@/shared/ui/route-chrome";
import { createProjectScreenController, type ProjectScreenController } from "../model/screen-controller";
import { UnitViewer } from "./UnitViewer";
import type { VideoAgentRequest } from "@/features/video-workspace";

const VideoWorkspace = lazy(() => import("@/features/video-workspace").then((module) => ({ default: module.VideoWorkspace })));

function ConnectedUnitView({ controller, unitId, revisionId, rootEpoch, onClose, onRequestAgent }: {
  controller: ProjectScreenController; unitId: string; revisionId?: string; rootEpoch: number; onClose(): void; onRequestAgent?(request: VideoAgentRequest): void;
}) {
  const [video, setVideo] = useState<{ unitId: string; title: string } | null>(null);
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => { let current = true; setVideo(null); void controller.openUnit(unitId).then(() => { if (current && revisionId) return controller.inspectUnitRevision(revisionId); }); return () => { current = false; }; }, [controller, unitId, revisionId]);
  useEffect(() => bridge.onMediaEvent((event) => {
    if (event.type === "activity-refresh" && event.rootEpoch === rootEpoch) void controller.refresh(event.sequence);
  }), [controller, rootEpoch]);
  if (video && snapshot.domain.project.projectId) return <Suspense fallback={<p role="status">Opening video editor…</p>}><VideoWorkspace reference={{ workspaceId: snapshot.domain.project.workspaceId, projectId: snapshot.domain.project.projectId, unitId: video.unitId }} title={video.title} onRequestAgent={onRequestAgent} onClose={() => { setVideo(null); void controller.openUnit(video.unitId); }} /></Suspense>;
  const error = snapshot.unit.error ?? snapshot.inspectedUnitRevision.error;
  if (error) return <div className={PROJECT_LOCAL_ERROR} role="alert"><span>{error}</span><button className={COMMAND_BUTTON} type="button" onClick={() => void controller.openUnit(unitId)}>Retry</button><button className={COMMAND_BUTTON} type="button" onClick={onClose}>Close</button></div>;
  return <UnitViewer embedded open controller={controller} snapshot={snapshot} returnFocus={null} onEditVideo={snapshot.domain.project.projectId ? (id, title) => setVideo({ unitId: id, title }) : undefined} onOpenChange={(open) => { if (!open) onClose(); }} />;
}

/** The existing Unit viewer in a chat's view tab, without a project route or modal overlay. */
export function UnitView({ project, unitId, revisionId, rootEpoch, onClose, onRequestAgent }: {
  project: ProjectReference; unitId: string; revisionId?: string; rootEpoch: number; onClose(): void; onRequestAgent?(request: VideoAgentRequest): void;
}) {
  const [controller, setController] = useState<ProjectScreenController | null>(null);
  useEffect(() => {
    const next = createProjectScreenController(bridge, project);
    setController(next);
    if (project.projectId) void next.start();
    return () => next.dispose();
  }, [project.projectId, project.workspaceId, rootEpoch]);
  return controller ? <ConnectedUnitView controller={controller} unitId={unitId} revisionId={revisionId} rootEpoch={rootEpoch} onClose={onClose} onRequestAgent={onRequestAgent} />
    : <div className={PROJECT_SKELETON} role="status">Loading Unit…</div>;
}

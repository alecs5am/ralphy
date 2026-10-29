import { CheckCheck, RefreshCw, X } from "@/shared/ui/icons";
import type { ProjectReference } from "@/shared/api/ipc";
import { COMMAND_BUTTON, EMPTY_SECTION, PROJECT_LOCAL_ERROR, PROJECT_SKELETON } from "@/shared/ui/route-chrome";
import { storyboardSummary } from "../lib/presentation";
import { useStoryboard } from "../model/use-storyboard";
import { StoryboardCard } from "./StoryboardCard";
import { GALLERY, GALLERY_ERROR, GALLERY_GRID, GALLERY_HEAD, GALLERY_NOTE, GALLERY_SUMMARY, GALLERY_TITLE } from "./storyboard-chrome";

/* The storyboard review before paid AI generation (#570). Every scene the runtime derived from
   the project, as one card each; approve, reject or comment per scene, or approve them all. The
   runtime records each decision and holds paid scene generation until the scene is approved. */
export function StoryboardGallery({ project, onClose }: { project: ProjectReference; onClose(): void }) {
  const { state, saving, reload, decide } = useStoryboard(project);
  const close = <button className={COMMAND_BUTTON} type="button" onClick={onClose}><X size={14} aria-hidden="true" />Close storyboard</button>;
  if (state.status === "loading") {
    return <section className={GALLERY} aria-label="Storyboard"><div className={PROJECT_SKELETON} role="status">Loading storyboard…</div></section>;
  }
  if (state.status === "error") {
    return <section className={GALLERY} aria-label="Storyboard">
      <div className={PROJECT_LOCAL_ERROR} role="alert"><span>{state.error}</span>
        <span className="flex gap-2"><button className={COMMAND_BUTTON} type="button" onClick={reload}><RefreshCw size={14} aria-hidden="true" />Retry</button>{close}</span>
      </div>
    </section>;
  }
  const storyboard = state.storyboard;
  return <section className={GALLERY} aria-label="Storyboard" aria-busy={saving}>
    <header className={GALLERY_HEAD}>
      <div className="min-w-0 flex-1">
        <h2 className={GALLERY_TITLE}>Storyboard</h2>
        <p className={GALLERY_SUMMARY}>{storyboardSummary(storyboard)}</p>
      </div>
      {storyboard.scenes.length > 0 && <button className={COMMAND_BUTTON} type="button" disabled={saving || storyboard.approvedAll} onClick={() => void decide({ action: "approve", all: true })}><CheckCheck size={14} aria-hidden="true" />{storyboard.approvedAll ? "All approved" : "Approve all"}</button>}
      {close}
    </header>
    {!storyboard.aiProduction && storyboard.scenes.length > 0 && <p className={GALLERY_NOTE}>{storyboard.aiProductionReason}</p>}
    {state.error && <p className={GALLERY_ERROR} role="alert">{state.error}</p>}
    {storyboard.scenes.length === 0
      ? <div className={EMPTY_SECTION}>No scenes yet. The storyboard fills in once the project has a scenario.</div>
      : <div className={GALLERY_GRID}>
        {storyboard.scenes.map((scene) => <StoryboardCard key={scene.id} scene={scene} project={project} saving={saving} onDecide={decide} />)}
      </div>}
  </section>;
}

import { useEffect, useState } from "react";
import { bridge, type ProjectReference } from "@/shared/api/ipc";
import { MediaPreview } from "@/shared/ui/MediaPreview";
import { COMMAND_BUTTON_SM } from "@/shared/ui/route-chrome";
import { Check, MessageSquare, X } from "@/shared/ui/icons";
import type { DesktopStoryboardReviewInput, StoryboardSceneDto } from "../../../../electron/ralphy/storyboard-types";
import { formatCostUsd, previewableFrameId, sceneModelLabel, STORYBOARD_STATE_LABELS } from "../lib/presentation";
import {
  CARD, CARD_ACTIONS, CARD_BODY, CARD_COMMENTS, CARD_FACT_LABEL, CARD_FACT_VALUE, CARD_FACTS, CARD_FIELD,
  CARD_FRAME, CARD_HEAD, CARD_ID, CARD_VO, STATE_BADGE, STATE_SKIN,
} from "./storyboard-chrome";

/* One scene of the storyboard: the frame, what is said, how long, how it is shot, what it will
   cost, and the three decisions the operator can make about it. */
export function StoryboardCard({ scene, project, saving, onDecide }: {
  scene: StoryboardSceneDto;
  project: ProjectReference;
  saving: boolean;
  onDecide(input: DesktopStoryboardReviewInput): Promise<boolean>;
}) {
  const [comment, setComment] = useState("");
  const frameUrl = useFrameUrl(project, previewableFrameId(scene));
  const decide = async (action: DesktopStoryboardReviewInput["action"]) => {
    const text = comment.trim();
    if (await onDecide({ action, scenes: [scene.id], ...(text ? { comment: text } : {}) })) setComment("");
  };
  const fieldId = `storyboard-comment-${scene.id}`;
  return <article className={CARD} aria-labelledby={`storyboard-${scene.id}`} data-state={scene.state}>
    <div className={CARD_FRAME}>
      <MediaPreview kind="image" url={frameUrl ?? undefined} label={`${scene.id} frame`} />
    </div>
    <div className={CARD_BODY}>
      <div className={CARD_HEAD}>
        <span className={CARD_ID} id={`storyboard-${scene.id}`}>{scene.id}{scene.role ? ` · ${scene.role}` : ""}</span>
        <span className={`${STATE_BADGE} ${STATE_SKIN[scene.state]}`}>{STORYBOARD_STATE_LABELS[scene.state]}</span>
      </div>
      <p className={CARD_VO}>{scene.vo ? `“${scene.vo}”` : "No VO line"}</p>
      <dl className={CARD_FACTS}>
        <dt className={CARD_FACT_LABEL}>Duration</dt><dd className={CARD_FACT_VALUE}>{scene.durationSec}s</dd>
        <dt className={CARD_FACT_LABEL}>Camera</dt><dd className={CARD_FACT_VALUE}>{scene.camera || "No camera note"}</dd>
        <dt className={CARD_FACT_LABEL}>Model</dt><dd className={CARD_FACT_VALUE}>{sceneModelLabel(scene)}</dd>
        <dt className={CARD_FACT_LABEL}>Est. cost</dt><dd className={CARD_FACT_VALUE}>{formatCostUsd(scene.estimatedCostUsd)}</dd>
      </dl>
      {scene.comments.length > 0 && <ul className={CARD_COMMENTS} aria-label={`${scene.id} comments`}>
        {scene.comments.map((entry, index) => <li key={`${entry.at}-${index}`}>{entry.text}</li>)}
      </ul>}
      <label className="sr-only" htmlFor={fieldId}>Comment on {scene.id}</label>
      <textarea id={fieldId} className={CARD_FIELD} placeholder="Comment (optional for approve and reject)" value={comment} disabled={saving} onChange={(event) => setComment(event.target.value)} />
      <div className={CARD_ACTIONS}>
        <button className={COMMAND_BUTTON_SM} type="button" disabled={saving} onClick={() => void decide("approve")}><Check size={14} aria-hidden="true" />Approve</button>
        <button className={COMMAND_BUTTON_SM} type="button" disabled={saving} onClick={() => void decide("reject")}><X size={14} aria-hidden="true" />Reject</button>
        <button className={COMMAND_BUTTON_SM} type="button" disabled={saving || !comment.trim()} onClick={() => void decide("comment")}><MessageSquare size={14} aria-hidden="true" />Comment</button>
      </div>
    </div>
  </article>;
}

/* A store Artifact frame is minted through the same preview path as the media grid; a frame
   that is only a loose file has no preview and the card says so. */
function useFrameUrl(project: ProjectReference, artifactId: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(null);
    if (!artifactId) return;
    let live = true;
    bridge.resolveProjectPreview(project, { type: "artifact", id: artifactId }).then(
      (preview) => { if (live) setUrl(preview?.url ?? null); },
      () => { if (live) setUrl(null); },
    );
    return () => { live = false; };
  }, [project.workspaceId, project.projectId, artifactId]);
  return url;
}

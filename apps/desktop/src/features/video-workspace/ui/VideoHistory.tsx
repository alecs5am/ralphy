import { useState } from "react";
import { Check, Clock3, Copy, GitCompareArrows, History, MessageSquare, RotateCcw, Sparkles } from "@/shared/ui/icons";
import { Window, WindowBody, WindowTitlebar } from "@/shared/ui/Window";
import { bridge } from "@/shared/api/ipc";
import { VIDEO_HISTORY_LIMIT, type VideoAgentRequest, type VideoWorkspaceRef } from "../../../../shared/video-workspace";
import type { VideoEditor } from "../model/useVideoWorkspace";
import { elementName, timecode } from "../lib/composition";

export function VideoHistory({ editor, onCompare }: { editor: VideoEditor; onCompare(html: string): void }) {
  const result = editor.loaded?.render;
  return <div className="video-inspector-content">
    <Window><WindowTitlebar><History size={14} /><strong>Version history</strong></WindowTitlebar><WindowBody className="video-properties">
      <div className="video-version-current"><span className="video-version-dot" /><div><strong>Current draft</strong><small>{editor.saving ? "Saving…" : editor.dirty ? "Unsaved changes" : "Saved on this Mac"}</small></div><Check size={14} /></div>
      <p className="video-help">The latest {VIDEO_HISTORY_LIMIT} saved drafts include content and frame rate. Restoring preserves your current draft. The Unit’s selected version stays unchanged.</p>
      {editor.loaded?.versions.map((version, index) => <div className="video-history-row" key={`${version.id}-${index}`}><Clock3 size={14} /><div><strong>Saved {new Date(version.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</strong><small>{new Date(version.savedAt).toLocaleDateString([], { month: "short", day: "numeric" })} · {version.fps ? `${version.fps} fps` : "Legacy draft · keeps current fps"}</small></div><button type="button" aria-label={`Compare saved draft ${index + 1}`} title="Compare content with current draft" onClick={() => onCompare(version.html)}><GitCompareArrows size={15} /></button><button type="button" aria-label={`Restore saved draft ${index + 1}`} title="Restore as draft" disabled={editor.rendering || editor.saving} onClick={() => void editor.restore(version)}><RotateCcw size={14} /></button></div>)}
      {!editor.loaded?.versions.length && <p className="video-help">Earlier drafts appear here as you edit.</p>}
    </WindowBody></Window>
    {result && <Window><WindowTitlebar><Check size={14} /><strong>{result.state === "succeeded" ? "Rendered version" : "Render failed"}</strong></WindowTitlebar><WindowBody className="video-properties">
      {result.previewUrl && <video className="video-render-preview" controls src={result.previewUrl} preload="metadata" />}
      <p className="video-help">{result.error ?? (result.state === "succeeded" ? result.unitRevisionId ? "Saved as a new Unit version. Your selected version is unchanged." : "Saved with the composition’s rendered files." : "The render did not finish. Your draft is preserved.")}</p>
      <small className="video-history-id">{result.buildId}</small>
    </WindowBody></Window>}
  </div>;
}
export function VideoAgent({ editor, reference, title, at, onRequest }: { editor: VideoEditor; reference: VideoWorkspaceRef; title: string; at: number; onRequest?(request: VideoAgentRequest): void }) {
  const [prompt, setPrompt] = useState(""), [copied, setCopied] = useState(false);
  const selected = editor.elements.filter((element) => editor.selection.includes(element.scopedId));
  const scope = selected.length ? selected.map(elementName).join(", ") : "Whole video";
  const send = async () => {
    if (!prompt.trim() || !await editor.save()) return;
    const path = editor.loaded?.draftPath;
    const instructions = `Video Unit ${reference.unitId} in project ${reference.projectId}, workspace ${reference.workspaceId}. Scope: ${scope}. Playhead: ${timecode(at, editor.fps)}. Selected HyperFrames IDs: ${selected.map((item) => item.scopedId).join(", ") || "none"}. Edit only draft.html in the attached JSON workspace, preserving its other fields and relative media paths. The HTML is a HyperFrames composition. Preserve unrelated clips, timing, assets and animation targets. Do not overwrite the core checkout or sealed revisions. Report the change and ask the operator to reload the saved draft. Do not render, generate paid media, or change the selected Unit version unless explicitly requested.`;
    if (onRequest && path) onRequest({ prompt, attachment: { kind: "file", ref: path, label: `${title} · Video draft`, instructions } });
    else { await bridge.copyText(`${prompt}\n\n${instructions}${path ? `\nDraft: ${path}` : ""}`); setCopied(true); }
  };
  return <div className="video-inspector-content"><Window><WindowTitlebar><Sparkles size={14} /><strong>Work with your agent</strong></WindowTitlebar><WindowBody className="video-properties">
    <label className="video-agent-scope"><span>SCOPE</span><strong>{scope}</strong><small>AT {timecode(at, editor.fps)}</small></label>
    <textarea className="video-agent-prompt" aria-label="Video editing request" placeholder="Tighten this scene. Keep the voice and title timing…" value={prompt} onChange={(event) => { setPrompt(event.currentTarget.value); setCopied(false); }} />
    <button className="video-agent-send" type="button" disabled={!prompt.trim() || editor.saving || editor.rendering} onClick={() => void send().catch(editor.fail)}>{onRequest ? <MessageSquare size={14} /> : copied ? <Check size={14} /> : <Copy size={14} />}{onRequest ? "Open in chat" : copied ? "Request copied" : "Copy agent request"}</button>
    <p className="video-help">The request includes your selection and saved source. Review it in chat, then reload the draft after the agent finishes.</p>
  </WindowBody></Window></div>;
}

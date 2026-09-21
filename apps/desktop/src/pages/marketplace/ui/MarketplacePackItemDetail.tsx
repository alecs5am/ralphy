import { ArrowLeft, Bookmark, Copy, MessageCircle } from "@/shared/ui/icons";
import { useEffect, useRef, useState } from "react";
import { MarkdownView } from "@/shared/ui/MarkdownView";
import { bridge } from "@/shared/api/ipc";
import type { MarketplaceItemPresentation, MarketplacePackItemPresentation } from "../lib/presentation";
import { EXPLORE_ACTION, EXPLORE_COPY, EXPLORE_DETAIL, EXPLORE_HEADER, EXPLORE_ICON, EXPLORE_INFO, EXPLORE_PRIMARY, EXPLORE_SUMMARY } from "../lib/explore-detail-chrome";
import { MarketplaceDetailFacts, MarketplaceDetailTags } from "./MarketplaceDetailInfo";

const CATEGORY_LABEL: Record<MarketplacePackItemPresentation["category"], string> = {
  skills: "Skills", prompts: "Prompts", templates: "Templates", recipes: "Effects", components: "Visuals",
};

/* Bundled references name local files, not navigable URLs. */
const allowNoUrl = () => false;
type Body =
  | { state: "loading"; id: string }
  | { state: "ready"; id: string; markdown: string; truncated: boolean }
  | { state: "absent"; id: string; reason: string };

export type MarketplacePackInstallAction = "install" | "uninstall" | "enable" | "disable";
export interface MarketplacePackItemDetailProps {
  item: MarketplacePackItemPresentation;
  workspaceName: string | null;
  onBack(): void;
  onInstallAction(action: MarketplacePackInstallAction, entryId: string): void;
  onUse?(item: MarketplaceItemPresentation): void;
  onTag?(tag: string): void;
}

function installLine(item: MarketplacePackItemPresentation, workspaceName: string | null): string {
  const where = workspaceName === null ? "the selected workspace" : `“${workspaceName}”`;
  if (item.install.status === "no-workspace") return "Select a workspace to save this for later.";
  return item.install.status === "available" ? `Save a reference for ${where}.` : `Saved for ${where}.`;
}

export function MarketplacePackItemDetail({ item, workspaceName, onBack, onInstallAction, onUse, onTag }: MarketplacePackItemDetailProps) {
  const entry = item.pack;
  const [body, setBody] = useState<Body>({ state: "loading", id: entry.id });
  const [copyStatus, setCopyStatus] = useState<{ id: string; message: string; failed?: boolean } | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    let current = true;
    generation.current += 1;
    setCopyStatus(null);
    if (entry.path === null) {
      setBody({ state: "absent", id: entry.id, reason: "This catalog entry does not include instructions yet." });
      return;
    }
    setBody({ state: "loading", id: entry.id });
    bridge.loadMarketplacePackDocument(entry.id)
      .then((document) => {
        if (current) setBody({ state: "ready", id: entry.id, markdown: document.markdown, truncated: document.truncated });
      })
      .catch((cause: unknown) => {
        if (current) setBody({ state: "absent", id: entry.id, reason: (cause instanceof Error ? cause.message : String(cause)).slice(0, 512) });
      });
    return () => { current = false; generation.current += 1; };
  }, [entry.id, entry.path]);

  const copyDocument = async () => {
    if (body.state !== "ready" || body.id !== entry.id) return;
    const requestGeneration = ++generation.current;
    try {
      await bridge.copyText(body.markdown);
      if (requestGeneration === generation.current) setCopyStatus({ id: entry.id, message: "Document copied" });
    } catch {
      if (requestGeneration === generation.current) setCopyStatus({ id: entry.id, message: "The document could not be copied. Please try again.", failed: true });
    }
  };

  const ready = body.id === entry.id && body.state === "ready";
  return <article className={`marketplace-pack-detail marketplace-detail-route ${EXPLORE_DETAIL}`} aria-labelledby="marketplace-pack-title">
    <header className={`marketplace-pack-hero ${EXPLORE_HEADER}`}>
      <button className={EXPLORE_ACTION} type="button" aria-label={`Back to ${CATEGORY_LABEL[item.category]}`} title={`Back to ${CATEGORY_LABEL[item.category]}`} onClick={onBack}><ArrowLeft className={EXPLORE_ICON} aria-hidden="true" /></button>
      <h2 className="m-0 min-w-0 flex-1 type-base font-medium wrap-anywhere" id="marketplace-pack-title">{item.name}</h2>
      <button className={EXPLORE_ACTION} type="button" disabled={item.install.status === "no-workspace"} onClick={() => onInstallAction(item.install.status === "installed" ? "uninstall" : "install", entry.id)}><Bookmark className={EXPLORE_ICON} aria-hidden="true" />{item.install.status === "installed" ? "Remove from saved" : "Save to workspace"}</button>
      {onUse && <button className={EXPLORE_PRIMARY} type="button" onClick={() => onUse(item)}><MessageCircle className={EXPLORE_ICON} aria-hidden="true" />Use in chat</button>}
    </header>
    <p className={EXPLORE_COPY}>{item.summary}</p>
    <MarketplaceDetailTags tags={item.tags ?? entry.tags} onTag={onTag} />
    {copyStatus?.id === entry.id && <p className={`${EXPLORE_COPY} [&[role=alert]]:text-alert-bright`} role={copyStatus.failed ? "alert" : "status"}>{copyStatus.message}</p>}
    <details className={EXPLORE_INFO}>
      <summary className={EXPLORE_SUMMARY}>{item.category === "prompts" ? "Read prompt" : "Details & instructions"}</summary>
      <div className="mt-3 flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {ready && <button className={EXPLORE_ACTION} type="button" onClick={() => { void copyDocument(); }}><Copy className={EXPLORE_ICON} aria-hidden="true" />Copy document</button>}
          <p className={EXPLORE_COPY}>{installLine(item, workspaceName)}</p>
        </div>
        {body.id !== entry.id || body.state === "loading" ? <p className={EXPLORE_COPY} role="status" aria-busy="true">Reading instructions…</p>
          : body.state === "absent" ? <p className={EXPLORE_COPY} role="status">{body.reason}</p>
            : <section className="min-w-0"><MarkdownView markdown={body.markdown} allowUrl={allowNoUrl} />{body.truncated && <p className={EXPLORE_COPY}>Showing an excerpt. The complete document is included in the app.</p>}</section>}
        <MarketplaceDetailFacts item={item} />
        {entry.path && <p className="m-0 font-mono type-xs text-muted wrap-anywhere">{entry.path}</p>}
      </div>
    </details>
  </article>;
}

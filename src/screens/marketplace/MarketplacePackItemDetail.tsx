import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { MarkdownView } from "../../components/MarkdownView";
import { bridge } from "../../lib/ipc";
import {
  ASIDE_SECTION,
  DETAIL_ACTIONS,
  DETAIL_BACK,
  DETAIL_COLUMN,
  DETAIL_COPY,
  DETAIL_EYEBROW,
  DETAIL_HEADING,
  DETAIL_HERO,
  DETAIL_LAYOUT,
  DETAIL_LEAD,
  DETAIL_ROUTE,
  DETAIL_SECTION,
  DETAIL_TITLE,
  HERO_ACTION_GLYPH,
  HERO_ACTION_PRIMARY,
  HERO_ACTION_SECONDARY,
  HERO_STATE,
} from "./detail-chrome";
import type { Availability, MarketplacePackItemPresentation } from "./presentation";

const FACT_ROW = "flex min-w-0 items-start gap-2.5 py-1.25";
const FACT_LABEL = "flex-none type-xs text-muted";
const FACT_VALUE = "m-0 ml-auto min-w-0 type-xs leading-snug text-right wrap-anywhere";
const TAG = "inline-flex items-center rounded-control bg-surface-sunken px-2 py-1 font-mono type-meta text-muted";

const CATEGORY_LABEL: Record<MarketplacePackItemPresentation["category"], string> = {
  skills: "Skills",
  prompts: "Prompts",
  templates: "Templates",
  recipes: "Recipes",
  components: "Components & Effects",
};

/* A bundled document is Ralphy's own prose about running Ralphy. It is not a
   web page, and nothing in it should be able to reach one -- no remote image
   loads, no link opens. Every reference it names is a file in the same pack. */
const allowNoUrl = () => false;

type Body =
  | { state: "loading" }
  | { state: "ready"; markdown: string; truncated: boolean }
  | { state: "absent"; reason: string };

export type MarketplacePackInstallAction = "install" | "uninstall" | "enable" | "disable";

export interface MarketplacePackItemDetailProps {
  item: MarketplacePackItemPresentation;
  /** The workspace the install would land in, or null when there is none. */
  workspaceName: string | null;
  onBack(): void;
  onReviewTarget(item: MarketplacePackItemPresentation): void;
  onInstallAction(action: MarketplacePackInstallAction, entryId: string): void;
}

/* The state line says what installing means here: the pack's documents are
   already on disk under the library's prompts tree, so an install records that
   this workspace reaches for this one -- and disabled means it does not. */
function installLine(item: MarketplacePackItemPresentation, workspaceName: string | null): string {
  const where = workspaceName === null ? "the selected workspace" : `“${workspaceName}”`;
  if (item.install.status === "no-workspace") return "Installing needs a workspace in the current home library; there is none to install into.";
  if (item.install.status === "available") return `Not installed in ${where}. Installing records this workspace's choice on this machine; the document itself already ships with the app.`;
  const when = new Date(item.install.installedAt).toISOString().slice(0, 10);
  return item.install.enabled
    ? `Installed in ${where} on ${when} and enabled.`
    : `Installed in ${where} on ${when} but disabled, so its agent does not reach for it.`;
}

function available(value: Availability<string>): string {
  return value.status === "ready" ? value.value : value.reason;
}

const ACTION_LABEL: Record<MarketplacePackItemPresentation["category"], string> = {
  skills: "Review install target",
  prompts: "Review chat target",
  templates: "Review project target",
  recipes: "Review apply target",
  components: "Review project target",
};

export function MarketplacePackItemDetail({ item, workspaceName, onBack, onReviewTarget, onInstallAction }: MarketplacePackItemDetailProps) {
  const entry = item.pack;
  const [body, setBody] = useState<Body>({ state: "loading" });

  useEffect(() => {
    if (entry.path === null) {
      setBody({ state: "absent", reason: "This entry is an index row: the bundled catalog names it, but carries no document for it." });
      return;
    }
    /* A detail the user navigated away from must not land in the new one. */
    let current = true;
    setBody({ state: "loading" });
    bridge.loadMarketplacePackDocument(entry.id)
      .then((document) => {
        if (current) setBody({ state: "ready", markdown: document.markdown, truncated: document.truncated });
      })
      .catch((cause: unknown) => {
        if (!current) return;
        const message = (cause instanceof Error ? cause.message : String(cause)).slice(0, 512);
        setBody({ state: "absent", reason: message });
      });
    return () => { current = false; };
  }, [entry.id, entry.path]);

  const categoryLabel = CATEGORY_LABEL[item.category];
  return <article className={`marketplace-pack-detail marketplace-detail-route ${DETAIL_ROUTE}`} aria-labelledby="marketplace-pack-title">
    <button className={`marketplace-pack-back ${DETAIL_BACK}`} type="button" onClick={onBack}>
      <ArrowLeft className={HERO_ACTION_GLYPH} aria-hidden="true" />Back to {categoryLabel}
    </button>
    <header className={`marketplace-pack-hero ${DETAIL_HERO}`}>
      <span className={DETAIL_EYEBROW}>{categoryLabel} · {item.sourceLabel}</span>
      <h2 className={DETAIL_TITLE} id="marketplace-pack-title">{item.name}</h2>
      <p className={DETAIL_LEAD}>{item.summary}</p>
      <div className={`marketplace-pack-actions ${DETAIL_ACTIONS}`}>
        {item.install.status === "no-workspace"
          ? <button className={HERO_ACTION_PRIMARY} type="button" aria-disabled="true">Install</button>
          : item.install.status === "available"
            ? <button className={HERO_ACTION_PRIMARY} type="button" onClick={() => onInstallAction("install", item.pack.id)}>Install</button>
            : <>
              <button
                className={HERO_ACTION_PRIMARY}
                type="button"
                onClick={() => onInstallAction(item.install.status === "installed" && item.install.enabled ? "disable" : "enable", item.pack.id)}
              >{item.install.status === "installed" && item.install.enabled ? "Disable" : "Enable"}</button>
              <button className={HERO_ACTION_SECONDARY} type="button" onClick={() => onInstallAction("uninstall", item.pack.id)}>Uninstall</button>
            </>}
        <button className={HERO_ACTION_SECONDARY} type="button" onClick={() => onReviewTarget(item)}>{ACTION_LABEL[item.category]}</button>
      </div>
      <p className={`marketplace-pack-install-state ${HERO_STATE}`}>{installLine(item, workspaceName)}</p>
      {body.state === "ready" && body.truncated && <p className={`marketplace-pack-truncated ${HERO_STATE}`}>This document is longer than the reader shows; the full text ships in the pack.</p>}
    </header>

    <div className={`marketplace-pack-detail-layout ${DETAIL_LAYOUT}`}>
      <div className={`marketplace-pack-detail-main ${DETAIL_COLUMN}`}>
        <section className={DETAIL_SECTION}>
          <h3 className={DETAIL_HEADING}>Document</h3>
          {body.state === "loading" && <p className={DETAIL_COPY} role="status" aria-busy="true">Reading the bundled document…</p>}
          {body.state === "absent" && <p className={DETAIL_COPY}>{body.reason}</p>}
          {body.state === "ready" && <MarkdownView markdown={body.markdown} allowUrl={allowNoUrl} />}
        </section>
      </div>

      <aside className={`marketplace-pack-detail-aside ${DETAIL_COLUMN}`}>
        <section className={ASIDE_SECTION}>
          <h3 className={DETAIL_HEADING}>Version and provenance</h3>
          <dl className="m-0 flex flex-col gap-px">
            <div className={FACT_ROW}><dt className={FACT_LABEL}>Source</dt><dd className={FACT_VALUE}>{item.sourceLabel}</dd></div>
            <div className={FACT_ROW}><dt className={FACT_LABEL}>Slug</dt><dd className={`${FACT_VALUE} font-mono`}>{entry.slug}</dd></div>
            <div className={FACT_ROW}><dt className={FACT_LABEL}>Document</dt><dd className={`${FACT_VALUE} font-mono`}>{entry.path ?? "No document in this build"}</dd></div>
            <div className={FACT_ROW}><dt className={FACT_LABEL}>Version</dt><dd className={FACT_VALUE}>{available(item.version)}</dd></div>
            <div className={FACT_ROW}><dt className={FACT_LABEL}>Updated</dt><dd className={FACT_VALUE}>{available(item.updatedAt)}</dd></div>
            <div className={FACT_ROW}><dt className={FACT_LABEL}>License</dt><dd className={FACT_VALUE}>{available(item.license)}</dd></div>
            <div className={FACT_ROW}><dt className={FACT_LABEL}>Publisher identity</dt><dd className={FACT_VALUE}>{available(item.publisherIdentity)}</dd></div>
            <div className={FACT_ROW}><dt className={FACT_LABEL}>Content audit</dt><dd className={FACT_VALUE}>{available(item.contentAudit)}</dd></div>
            <div className={FACT_ROW}><dt className={FACT_LABEL}>Compatibility</dt><dd className={FACT_VALUE}>{available(item.compatibility)}</dd></div>
          </dl>
        </section>
        <section className={ASIDE_SECTION}>
          <h3 className={DETAIL_HEADING}>Tags</h3>
          {entry.tags.length > 0
            ? <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">{entry.tags.map((tag) => <li className={TAG} key={tag}>{tag}</li>)}</ul>
            : <p className={DETAIL_COPY}>This entry declares no tags.</p>}
        </section>
        <section className={ASIDE_SECTION}>
          <h3 className={DETAIL_HEADING}>Used by</h3>
          <p className={DETAIL_COPY}>Usage backlinks are unavailable from the current Desktop contract.</p>
        </section>
      </aside>
    </div>
  </article>;
}

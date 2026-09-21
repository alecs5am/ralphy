import { useEffect, useRef, type KeyboardEvent } from "react";
import type { UnitRevisionDto } from "../../../../electron/ralphy/types";
import type { ProjectReference } from "@/shared/api/ipc";
import { Check } from "@/shared/ui/icons";
import { UnitRevisionPreview, unitRevisionNumber } from "@/entities/unit";

export function UnitRevisionBrowser({
  project, revisions, sourceRevision, sourceRevisionId, sourceLabel,
  inspectedRevisionId, selectedRevisionId, showOriginal, layout, onInspect, onOriginal,
}: {
  project: ProjectReference;
  revisions: UnitRevisionDto[];
  sourceRevision: UnitRevisionDto | undefined;
  sourceRevisionId?: string | null;
  sourceLabel?: string | null;
  inspectedRevisionId?: string | null;
  selectedRevisionId?: string | null;
  showOriginal: boolean;
  layout: "rail" | "grid";
  onInspect(id: string, openGallery: boolean): void;
  onOriginal(openGallery: boolean): void;
}) {
  const browser = useRef<HTMLDivElement>(null);
  const entries = [
    ...(sourceRevisionId ? [{ id: sourceRevisionId, number: 0, original: true, revision: sourceRevision }] : []),
    ...revisions.map((revision) => ({ id: revision.id, number: unitRevisionNumber(revision, sourceRevision), original: false, revision })),
  ];
  const viewedId = showOriginal ? sourceRevisionId : inspectedRevisionId;
  const activeIndex = Math.max(0, entries.findIndex((entry) => entry.id === viewedId));

  useEffect(() => {
    browser.current?.querySelector<HTMLButtonElement>("[aria-selected=true]")?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [viewedId, layout]);

  const inspect = (index: number, openGallery = false) => {
    const entry = entries[index];
    if (!entry) return;
    if (entry.original) onOriginal(openGallery);
    else onInspect(entry.id, openGallery);
  };

  const navigate = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!browser.current || event.altKey || event.ctrlKey || event.metaKey) return;
    const columns = layout === "grid" ? Math.max(1, getComputedStyle(browser.current).gridTemplateColumns.split(" ").filter(Boolean).length) : 1;
    let next: number;
    switch (event.key) {
      case "ArrowLeft": next = index - 1; break;
      case "ArrowRight": next = index + 1; break;
      case "ArrowUp": next = index - columns; break;
      case "ArrowDown": next = index + columns; break;
      case "Home": next = 0; break;
      case "End": next = entries.length - 1; break;
      default: return;
    }
    event.preventDefault();
    next = Math.max(0, Math.min(entries.length - 1, next));
    browser.current.querySelectorAll<HTMLButtonElement>("[role=option]")[next]?.focus({ preventScroll: true });
    inspect(next);
  };

  return <div ref={browser} className={`unit-revision-browser is-${layout}`} role="listbox" aria-label="Unit revisions list" aria-orientation={layout === "rail" ? "vertical" : undefined}>
    {entries.map((entry, index) => {
      const viewed = entry.id === viewedId;
      const saved = entry.id === selectedRevisionId;
      const description = entry.original ? sourceLabel ?? "Original" : entry.revision?.note;
      return <button
        key={entry.id}
        type="button"
        role="option"
        aria-label={`View revision ${entry.number}`}
        aria-selected={viewed}
        tabIndex={index === activeIndex ? 0 : -1}
        title={[`R${entry.number}`, description, saved ? "Selected version" : null].filter(Boolean).join(" · ")}
        className={`unit-revision-option${entry.original ? " unit-original-revision" : ""}${viewed ? " is-viewing" : ""}`}
        onClick={() => inspect(index, true)}
        onKeyDown={(event) => navigate(event, index)}
      >
        <UnitRevisionPreview project={project} revisionId={entry.id} sealedAt={entry.revision?.sealedAt} className="unit-revision-thumb" />
        <span className="unit-revision-label" aria-hidden="true">R{entry.number}</span>
        {saved && <Check className="unit-revision-saved" aria-label="Selected version" />}
      </button>;
    })}
  </div>;
}

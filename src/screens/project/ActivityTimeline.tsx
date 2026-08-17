import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useMemo, useRef, useState } from "react";

import type { ActivityDto } from "../../../electron/ralphy/types";
import type { DomainPage } from "../../state/project-domain";
import type { ProjectScreenController } from "../../state/project-screen-controller";
import { AutoCursorTail } from "./AutoCursorTail";
import { useRememberedScroll } from "./scroll-memory";

type TimelineRow = { type: "day"; key: string; label: string } | { type: "event"; key: string; value: ActivityDto };
const dateValue = (value: number) => new Date(value < 1_000_000_000_000 ? value * 1000 : value);
const humanize = (value: string) => {
  const words = value.replace(/[._-]+/g, " ").trim();
  return words ? `${words[0].toUpperCase()}${words.slice(1)}` : value;
};

export function ActivityTimeline({ page, controller, scrollMemory, resetToken }: {
  page: DomainPage;
  controller: ProjectScreenController;
  scrollMemory: Map<string, number>;
  resetToken: string;
}) {
  const ownerRef = useRef<HTMLDivElement>(null);
  const [owner, setOwner] = useState<HTMLDivElement | null>(null);
  const remembered = useRememberedScroll(scrollMemory, "activity", resetToken);
  const attachOwner = useCallback((node: HTMLDivElement | null) => {
    ownerRef.current = node;
    remembered.ref(node);
    setOwner((current) => current === node ? current : node);
  }, [remembered.ref]);
  const rows = useMemo(() => {
    const result: TimelineRow[] = [];
    let previousDay = "";
    for (const item of [...page.items as ActivityDto[]].sort((left, right) => left.sequence - right.sequence)) {
      const date = dateValue(item.createdAt);
      const day = date.toDateString();
      if (day !== previousDay) {
        result.push({ type: "day", key: `day:${day}:${item.sequence}`, label: new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date) });
        previousDay = day;
      }
      result.push({ type: "event", key: `event:${item.sequence}`, value: item });
    }
    return result;
  }, [page.items]);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => ownerRef.current,
    getItemKey: (index) => rows[index]?.key ?? index,
    estimateSize: (index) => rows[index]?.type === "day" ? 38 : 58,
    initialOffset: () => scrollMemory.get("activity") ?? 0,
    initialRect: { width: 800, height: 600 },
    overscan: 6,
  });

  return <div className="activity-scroll" role="region" aria-label="Activity timeline" tabIndex={0} ref={attachOwner} onScroll={remembered.onScroll}>
    <ol className="activity-virtual-list" style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((row) => {
        const value = rows[row.index];
        if (value.type === "day") return <li className="activity-row activity-day" key={row.key} style={{ height: row.size, transform: `translateY(${row.start}px)` }}><h3>{value.label}</h3></li>;
        const date = dateValue(value.value.createdAt);
        return <li className="activity-row activity-event" key={row.key} style={{ height: row.size, transform: `translateY(${row.start}px)` }}>
          <time dateTime={date.toISOString()}>{new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date)}</time>
          <strong>{humanize(value.value.action)}</strong>
          <span>{humanize(value.value.entityType)} · {value.value.entityId}</span>
        </li>;
      })}
    </ol>
    <AutoCursorTail
      root={owner}
      hasMore={page.nextCursor !== null}
      loading={page.status === "loading" && page.items.length > 0}
      error={page.status === "error" && page.items.length > 0 ? page.error : null}
      onLoadMore={() => { void controller.loadMore("activity"); }}
      onRetry={() => { void controller.retryPage("activity"); }}
    />
  </div>;
}

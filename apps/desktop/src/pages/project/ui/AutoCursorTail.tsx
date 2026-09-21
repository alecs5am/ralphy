import { useCallback, useEffect, useRef, useState } from "react";
import { COMMAND_BUTTON } from "@/shared/ui/route-chrome";

export function AutoCursorTail(props: {
  root: HTMLElement | null;
  hasMore: boolean;
  loading: boolean;
  error: string | null;
  onLoadMore(): void;
  onRetry(): void;
  axis?: "horizontal" | "vertical";
}): React.ReactNode {
  const current = useRef(props);
  const wasIntersecting = useRef(false);
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  current.current = props;
  const attachSentinel = useCallback((node: HTMLDivElement | null) => setSentinel(node), []);

  useEffect(() => {
    if (!props.root || !sentinel) return;
    wasIntersecting.current = false;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries.find(({ target }) => target === sentinel);
      if (!entry) return;
      if (!entry.isIntersecting) {
        wasIntersecting.current = false;
        return;
      }
      if (wasIntersecting.current) return;
      wasIntersecting.current = true;
      const latest = current.current;
      if (latest.hasMore && !latest.loading && !latest.error) latest.onLoadMore();
    }, { root: props.root, rootMargin: props.axis === "horizontal" ? "0px 240px" : "240px 0px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [props.root, sentinel]);

  return <div className={`auto-cursor-tail flex items-center justify-center text-muted ${props.axis === "horizontal" ? "min-w-px self-stretch px-3 empty:px-0" : "min-h-px py-3 empty:py-0"}`} ref={attachSentinel}>
    {props.loading && <span role="status" aria-live="polite">Loading more…</span>}
    {props.error && <div className="flex items-center gap-3" role="alert"><span>{props.error}</span><button className={COMMAND_BUTTON} type="button" onClick={props.onRetry}>Retry</button></div>}
  </div>;
}

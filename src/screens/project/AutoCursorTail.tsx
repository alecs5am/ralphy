import { useCallback, useEffect, useRef, useState } from "react";

export function AutoCursorTail(props: {
  root: HTMLElement | null;
  hasMore: boolean;
  loading: boolean;
  error: string | null;
  onLoadMore(): void;
  onRetry(): void;
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
    }, { root: props.root, rootMargin: "240px 0px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [props.root, sentinel]);

  return <div className="auto-cursor-tail flex min-h-px items-center justify-center py-3 text-muted empty:py-0" ref={attachSentinel}>
    {props.loading && <span role="status" aria-live="polite">Loading more…</span>}
    {props.error && <div className="flex items-center gap-3" role="alert"><span>{props.error}</span><button className="command-button" type="button" onClick={props.onRetry}>Retry</button></div>}
  </div>;
}

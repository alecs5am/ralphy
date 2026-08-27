import { ArrowLeft, ArrowRight, Globe, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * The view panel's browser tab: a real page beside the chat, in a guest process of its own.
 *
 * It is an Electron `<webview>` rather than an iframe because the pages worth opening beside a
 * chat -- a doc, a dashboard, a competitor's post -- all refuse to be framed, and because a guest
 * gets its own process, its own cookie jar and none of this window's origin. `main` decides what
 * the guest may attach with (`hardenWebviewAttach`), so the attributes here are a request, not a
 * grant.
 *
 * The page's own state lives in the guest, and the tab remembers only its URL: reopening a tab
 * reloads the page rather than restoring a scroll position.
 */

/** The partition every browser tab shares. Must match `BROWSER_PARTITION` in main. */
const PARTITION = "persist:view-browser";

interface WebviewElement extends HTMLElement {
  src: string;
  loadURL(url: string): Promise<void>;
  reload(): void;
  goBack(): void;
  goForward(): void;
  canGoBack(): boolean;
  canGoForward(): boolean;
  getURL(): string;
  getTitle(): string;
}

/**
 * What the operator typed, as a URL: a bare host becomes `https`, and anything that is not a
 * host at all becomes a search. A scheme other than `http(s)` is refused by main, so it is
 * treated as a search here rather than sent to be rejected.
 */
export function browserUrlFor(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  const explicit = /^https?:\/\//i.test(text);
  const host = !/\s/.test(text) && /^[^/?#]+\.[a-z]{2,}(?::\d+)?(?:[/?#].*)?$/i.test(text);
  if (explicit || host) {
    try {
      return new URL(explicit ? text : `https://${text}`).toString();
    } catch {
      /* falls through to search */
    }
  }
  return `https://duckduckgo.com/?q=${encodeURIComponent(text)}`;
}

/** The bar's own label for a page, so a tab reads as a place rather than as a URL. */
export function browserLabel(url: string | null, title: string): string {
  if (title.trim()) return title.trim().slice(0, 80);
  if (!url) return "Browser";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Browser";
  }
}

const BAR_BUTTON = "grid size-7 flex-none place-items-center rounded-field text-muted hover:bg-panel hover:text-ink disabled:text-muted-decorative focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink";

export function ViewBrowser({ url, onNavigate }: {
  url: string | null;
  onNavigate(url: string, title: string): void;
}) {
  /* React types `webview` as an empty element, so the guest's methods are named by the ref. */
  const view = useRef<WebviewElement | null>(null);
  const [address, setAddress] = useState(url ?? "");
  const [history, setHistory] = useState({ back: false, forward: false });

  useEffect(() => {
    const guest = view.current;
    if (!guest) return;
    const settled = (): void => {
      setAddress(guest.getURL());
      setHistory({ back: guest.canGoBack(), forward: guest.canGoForward() });
      onNavigate(guest.getURL(), guest.getTitle());
    };
    /* Three events, one handler: an in-page navigation and a late title are the same fact -- where
       this tab now is -- and the tab stores only that. */
    for (const event of ["did-navigate", "did-navigate-in-page", "page-title-updated"]) {
      guest.addEventListener(event, settled);
    }
    return () => {
      for (const event of ["did-navigate", "did-navigate-in-page", "page-title-updated"]) {
        guest.removeEventListener(event, settled);
      }
    };
  }, [onNavigate, url === null]);

  const go = (input: string): void => {
    const next = browserUrlFor(input);
    if (!next) return;
    setAddress(next);
    if (view.current) void view.current.loadURL(next);
    else onNavigate(next, "");
  };

  return <div className="view-browser flex min-h-0 min-w-0 flex-1 flex-col bg-card">
    <div className="view-browser-bar flex h-11 flex-none items-center gap-1 border-b border-hairline px-2">
      <button className={BAR_BUTTON} type="button" aria-label="Back" disabled={!history.back} onClick={() => view.current?.goBack()}>
        <ArrowLeft size={15} strokeWidth={1.8} aria-hidden="true" />
      </button>
      <button className={BAR_BUTTON} type="button" aria-label="Forward" disabled={!history.forward} onClick={() => view.current?.goForward()}>
        <ArrowRight size={15} strokeWidth={1.8} aria-hidden="true" />
      </button>
      <button className={BAR_BUTTON} type="button" aria-label="Reload" disabled={!url} onClick={() => view.current?.reload()}>
        <RotateCw size={14} strokeWidth={1.8} aria-hidden="true" />
      </button>
      <form className="flex min-w-0 flex-1" onSubmit={(event) => { event.preventDefault(); go(address); }}>
        <input
          className="min-w-0 flex-1 rounded-field bg-panel px-2.5 py-1.5 type-sm text-ink placeholder:text-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink"
          value={address}
          spellCheck={false}
          aria-label="Address"
          placeholder="Search or enter a web address"
          onChange={(event) => setAddress(event.target.value)}
        />
      </form>
    </div>
    {url
      ? <webview className="view-browser-guest min-h-0 min-w-0 flex-1" ref={(node) => { view.current = node as WebviewElement | null; }} src={url} partition={PARTITION} />
      : <div className="grid min-h-0 flex-1 place-items-center gap-2 p-6 text-center">
        <Globe className="text-muted-decorative" size={22} strokeWidth={1.6} aria-hidden="true" />
        <p className="m-0 max-w-screen-copy type-sm text-muted">
          A page opens beside the chat. Type an address above, or search.
        </p>
      </div>}
  </div>;
}

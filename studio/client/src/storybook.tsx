import { render } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import "../../src/storybook.css";

type Workspace = { slug: string; name: string; projects: number };
type StoryVariant = { id: string; label: string; params: Record<string, unknown> };
type Story = {
  id: string;
  component: string;
  title: string;
  variant: string | null;
  params: Record<string, unknown>;
  controls: Record<string, any>;
  variants: StoryVariant[];
  animated: boolean;
  note: string | null;
};
type StoryBook = { workspace: string; css: string; stories: Story[] };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed: ${res.status}`) as Error & { status?: number; url?: string };
    err.status = res.status;
    err.url = url;
    throw err;
  }
  return data;
}

function readHash() {
  const raw = location.hash.slice(1);
  if (!raw) return {} as { workspace?: string; storyId?: string };
  const cut = raw.indexOf("/");
  if (cut === -1) return { workspace: decodeURIComponent(raw) };
  return {
    workspace: decodeURIComponent(raw.slice(0, cut)),
    storyId: decodeURIComponent(raw.slice(cut + 1)),
  };
}

function storyDoc(css: string, html: string) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
${css.replaceAll("</style", "<\\/style")}
html,body{width:100%!important;height:100%!important;margin:0!important;overflow:hidden!important;background:#100d0e!important}
body{position:relative!important}
#root{position:absolute!important;left:0!important;top:0!important;width:1920px!important;height:1080px!important;overflow:hidden!important;transform-origin:0 0!important;background:#100d0e!important}
  </style>
</head>
<body>
  <div id="root">${html}</div>
  <script>
    (function(){
      var root = document.getElementById("root");
      function fit(){
        var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
        var x = (window.innerWidth - 1920 * s) / 2;
        var y = (window.innerHeight - 1080 * s) / 2;
        root.style.transform = "translate(" + x + "px," + y + "px) scale(" + s + ")";
      }
      window.addEventListener("resize", fit);
      fit();
    })();
  <\/script>
</body>
</html>`;
}

function pickWorkspace(workspaces: Workspace[]) {
  const hash = readHash();
  const slugs = workspaces.map((w) => w.slug);
  const saved = localStorage.getItem("studio-storybook-workspace");
  if (hash.workspace && slugs.includes(hash.workspace)) return hash.workspace;
  if (saved && slugs.includes(saved)) return saved;
  if (slugs.includes("short-guides")) return "short-guides";
  return slugs[0] || "default";
}

function matchesParams(base: Record<string, unknown>, current: Record<string, unknown>) {
  return Object.entries(base).every(([key, value]) => String(current[key]) === String(value));
}

function controlValue(raw: string, input: HTMLInputElement | HTMLSelectElement) {
  if (input instanceof HTMLInputElement && input.type === "checkbox") return input.checked;
  if (input instanceof HTMLInputElement && input.type === "number") return Number(raw);
  return raw;
}

function StorybookApp() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspace, setWorkspace] = useState("");
  const [book, setBook] = useState<StoryBook | null>(null);
  const [storyId, setStoryId] = useState("");
  const [params, setParams] = useState<Record<string, unknown>>({});
  const [html, setHtml] = useState("");
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  const [copyLabel, setCopyLabel] = useState("Copy ref");
  const [playNonce, setPlayNonce] = useState(0);

  const story = book?.stories.find((s) => s.id === storyId) || null;

  useEffect(() => {
    getJson<Workspace[]>("/api/workspaces")
      .then((rows) => {
        setWorkspaces(rows);
        setWorkspace(pickWorkspace(rows));
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!workspace) return;
    setBook(null);
    setStoryId("");
    setParams({});
    setHtml("");
    setError("");
    getJson<StoryBook>(`/api/workspaces/${encodeURIComponent(workspace)}/components`)
      .then((nextBook) => {
        localStorage.setItem("studio-storybook-workspace", workspace);
        setBook(nextBook);
        const hash = readHash();
        const wanted = hash.workspace === workspace ? hash.storyId : "";
        const first = nextBook.stories[0]?.id || "";
        setStoryId(wanted && nextBook.stories.some((s) => s.id === wanted) ? wanted : first);
      })
      .catch((err) => {
        if (err.status === 404 && String(err.url || "").includes("/components")) {
          setError("Storybook API is not available. Restart Studio so the workspace component routes load.");
        } else {
          setError(err.message);
        }
      });
  }, [workspace]);

  useEffect(() => {
    if (!story) return;
    setParams({ ...(story.params || {}) });
    history.replaceState(null, "", `#${encodeURIComponent(workspace)}/${encodeURIComponent(story.id)}`);
    setCopyLabel("Copy ref");
  }, [storyId]);

  useEffect(() => {
    if (!workspace || !story) return;
    const qs = new URLSearchParams({ id: story.id, params: JSON.stringify(params) });
    getJson<{ html: string }>(`/api/workspaces/${encodeURIComponent(workspace)}/components/render?${qs}`)
      .then((data) => {
        setHtml(data.html || "");
        setError("");
      })
      .catch((err) => setError(err.message));
  }, [workspace, storyId, JSON.stringify(params)]);

  useEffect(() => {
    const onHash = () => {
      const hash = readHash();
      if (hash.workspace && hash.workspace !== workspace) setWorkspace(hash.workspace);
      if (hash.storyId && hash.storyId !== storyId) setStoryId(hash.storyId);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [workspace, storyId]);

  const visibleStories = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const stories = book?.stories || [];
    if (!q) return stories;
    return stories.filter((s) => [s.component, s.title, s.id, s.variant].some((v) => String(v || "").toLowerCase().includes(q)));
  }, [book, filter]);

  const groups = useMemo(() => {
    const by = new Map<string, Story[]>();
    for (const row of visibleStories) by.set(row.component, [...(by.get(row.component) || []), row]);
    return [...by.entries()];
  }, [visibleStories]);

  const copyRef = async () => {
    if (!story) return;
    const ref = `@component:${workspace}/${story.id} ${JSON.stringify({ params })}`;
    try {
      await navigator.clipboard.writeText(ref);
    } catch {
      const box = document.createElement("textarea");
      box.value = ref;
      document.body.appendChild(box);
      box.select();
      document.execCommand("copy");
      box.remove();
    }
    setCopyLabel("Copied");
    window.setTimeout(() => setCopyLabel("Copy ref"), 900);
  };

  const keys = story ? Object.keys({ ...(story.params || {}), ...(story.controls || {}) }) : [];
  const frameDoc = html && book ? storyDoc(book.css || "", html) : "";

  return (
    <div class="sb-shell" data-preact-storybook>
      <aside class="sb-sidebar">
        <header class="sb-brand">
          <div>
            <strong>Storybook</strong>
            <span>Workspace components</span>
          </div>
          <a href="/" title="Back to Studio">Studio</a>
        </header>
        <label class="sb-field">
          <span>Workspace</span>
          <select value={workspace} onChange={(e) => setWorkspace((e.currentTarget as HTMLSelectElement).value)}>
            {workspaces.map((w) => <option value={w.slug}>{w.name || w.slug}</option>)}
          </select>
        </label>
        <label class="sb-field">
          <span>Filter</span>
          <input value={filter} type="search" placeholder="Component or story" autocomplete="off" onInput={(e) => setFilter((e.currentTarget as HTMLInputElement).value)} />
        </label>
        <nav class="sb-tree">
          {groups.length ? groups.map(([component, rows]) => (
            <section class="sb-group">
              <div class="sb-group-title">{component} <span class="sb-count">{rows.length}</span></div>
              {rows.map((row) => (
                <button class={`sb-story${storyId === row.id ? " active" : ""}`} type="button" onClick={() => setStoryId(row.id)}>
                  {row.title}
                </button>
              ))}
            </section>
          )) : <div class="sb-note">{book ? "No matching stories." : ""}</div>}
        </nav>
      </aside>

      <main class="sb-main">
        <header class="sb-topbar">
          <div>
            <div class="sb-title">{story ? story.title : "No component selected"}</div>
            <div class="sb-meta">{story ? `${workspace} / ${story.id}` : ""}</div>
          </div>
          <div class="sb-actions">
            <button type="button" disabled={!story?.animated} onClick={() => setPlayNonce((n) => n + 1)}>Play</button>
            <button id="copy" type="button" disabled={!story} onClick={copyRef}>{copyLabel}</button>
          </div>
        </header>

        <section class="sb-preview">
          {error || !story ? <div class={`sb-empty${error ? " sb-error" : ""}`}>{error || "Select a component story."}</div> : null}
          {story && frameDoc ? <iframe key={`${story.id}-${playNonce}`} class="sb-frame ready" title="Component preview" sandbox="allow-scripts allow-same-origin" srcDoc={frameDoc}></iframe> : null}
        </section>

        <section class="sb-addons" aria-label="Story controls">
          <div class="sb-panel">
            <h2>Variants</h2>
            <div class="sb-variants">
              {story ? (
                <>
                  <button type="button" class={matchesParams(story.params || {}, params) ? "active" : ""} onClick={() => setParams({ ...(story.params || {}) })}>Base</button>
                  {(story.variants || []).map((variant) => (
                    <button
                      type="button"
                      class={matchesParams(variant.params || {}, params) ? "active" : ""}
                      onClick={() => setParams({ ...(story.params || {}), ...(variant.params || {}) })}
                    >
                      {variant.label || variant.id}
                    </button>
                  ))}
                </>
              ) : null}
            </div>
          </div>
          <div class="sb-panel">
            <h2>Controls</h2>
            <form class="sb-controls">
              {story && keys.length ? keys.map((key) => {
                const control = story.controls?.[key] || {};
                const type = String(control.type || (typeof params[key] === "number" ? "number" : "text"));
                const label = control.label || key;
                if (type === "select" && Array.isArray(control.options)) {
                  return (
                    <label class="sb-control">
                      <span>{label}</span>
                      <select value={String(params[key] ?? "")} onInput={(e) => setParams({ ...params, [key]: (e.currentTarget as HTMLSelectElement).value })}>
                        {control.options.map((opt: unknown) => <option value={String(opt)}>{String(opt)}</option>)}
                      </select>
                    </label>
                  );
                }
                if (type === "checkbox" || typeof params[key] === "boolean") {
                  return (
                    <label class="sb-control">
                      <span>{label}</span>
                      <input type="checkbox" checked={Boolean(params[key])} onInput={(e) => setParams({ ...params, [key]: (e.currentTarget as HTMLInputElement).checked })} />
                    </label>
                  );
                }
                return (
                  <label class="sb-control">
                    <span>{label}</span>
                    <input
                      type={type === "number" ? "number" : "text"}
                      value={String(params[key] ?? "")}
                      onInput={(e) => {
                        const input = e.currentTarget as HTMLInputElement;
                        setParams({ ...params, [key]: controlValue(input.value, input) });
                      }}
                    />
                  </label>
                );
              }) : <div class="sb-note">{story ? "This story has no controls." : ""}</div>}
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}

render(<StorybookApp />, document.getElementById("app")!);

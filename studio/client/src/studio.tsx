import { render } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import "../../src/tokens.css";
import "../../src/app.css";

type Workspace = { slug: string; name: string; projects: number };
type Project = { id: string; workspace: string; mtime: number };
type RunRow = { id: string; title: string; status: string; projects: number };
type Artifact = { path: string; kind: string; name: string; size: number; mtime: number; type: "image" | "video" | "audio" | "text" | "other"; fresh?: boolean; _proj?: string };
type WorkflowStep = { id: string; label: string; phase: string; engine: string; model: string | null; variants: number; gate: string[]; mode: string; status: string; gateVerdict: string | null };
type WorkflowLane = { currentStep: string | null; steps: WorkflowStep[] } | null;
type BoardVariant = { path: string; name: string; mtime: number; chosen: boolean };
type BoardScene = { id: string; label: string; order: number; chosen: string | null; variants: BoardVariant[] };
type Board = { scenes: BoardScene[]; other: BoardVariant[]; layout: Record<string, Pos> } | null;
type Pos = { x: number; y: number };
type Annotation = { id: string; target: { type: string; ref: string }; tags: string[]; note?: string };
type Selection = { type: string; ref: string; label: string };
type RunGraphNode = { id: string; type: string; label: string; detail?: string; layer: number; status?: string; verdict?: string; cost?: number; count?: number; approvalNeeded?: boolean; project?: string; ref?: string };
type RunGraph = { title: string; nodes: RunGraphNode[]; edges: Array<{ from: string; to: string }>; layout: Record<string, Pos> } | null;
type RunSummary = any;
type PatchState = { patches: any[]; effectiveConfig: Record<string, any> };
// ── Farm dashboard (#506) — shapes mirror studio/server/control.ts views ──
type FarmStatus = {
  workspace: string;
  daemon: { running: boolean; pid: number | null };
  counts: Record<string, number>;
  runs: Array<{ id: string; workflow: string; status: string; completedNodes: number; skippedNodes: number; totalNodes: number | null; spendUsd: number; updatedAt: string; detail: string | null }>;
};
type TrustStatus = {
  workspace: string;
  level: string;
  autoPublishScore: number;
  promotionStreak: number;
  demoteOnReject: boolean;
  agreement: { samples: number; matches: number; rate: number | null; streak: number };
  promotion: { suggested: boolean; nextLevel: string | null; rule: string };
  autoPasses: number;
};
type CalendarDoc = { workspace: string; slots: any[]; entries: any[] };
type WorkflowRow = { name: string; kind: string; nodes: number; steps: number };
const FARM_RUN_CLS: Record<string, string> = { running: "rs-active", complete: "rs-complete", "parked-approval": "rs-archived", "halted-budget": "rs-archived", "halted-failure": "rs-archived" };
type ModalEntry = Artifact | null;
type TagTarget = { type: string; ref: string; label: string } | null;

const KIND_ORDER = ["images", "videos", "voiceover", "music", "sfx", "captions", "fonts", "refs", "render"];
const GLYPHS: Record<string, string> = { audio: "*", text: "#", other: "." };
const STATUS: Record<string, { glyph: string; cls: string }> = {
  done: { glyph: "ok", cls: "st-done" },
  running: { glyph: "..", cls: "st-running" },
  waiting: { glyph: "!!", cls: "st-waiting" },
  blocked: { glyph: "x", cls: "st-blocked" },
  queued: { glyph: ".", cls: "st-queued" },
};
const RUN_STATUS_CLS: Record<string, string> = { active: "rs-active", complete: "rs-complete", archived: "rs-archived" };
const VERDICT_DOT: Record<string, { glyph: string; cls: string }> = {
  ship: { glyph: "ok", cls: "v-ship" },
  repair: { glyph: "..", cls: "v-repair" },
  "needs-user-decision": { glyph: "?", cls: "v-needs" },
  blocked: { glyph: "x", cls: "v-blocked" },
};
const GVERDICT: Record<string, string> = { ship: "v-ship", repair: "v-repair", "needs-user-decision": "v-needs", blocked: "v-blocked" };
const GSTATUS: Record<string, string> = { pass: "gs-pass", blocked: "gs-blocked", waiting: "gs-waiting", ready: "gs-ready", pending: "gs-pending", running: "gs-running" };
const ANNOTATION_TAGS = ["winner", "reject", "needs-regeneration", "weak-hook", "style-drift", "use-as-reference", "approved", "publish-ready", "template-candidate"];
const INBOX_ACTIONS = ["repair", "approve", "compare", "use-as-reference", "publish"];
const INBOX_SELECTABLE = new Set(["project", "unit", "destination", "artifact", "eval_finding", "run", "workflow_node"]);
const CONFIG_PATCH_FIELDS: Record<string, { label: string; kind: "number" | "bool" | "enum" | "text"; options?: string[]; requiresTarget?: boolean }> = {
  batchSize: { label: "Batch size", kind: "number" },
  variantCount: { label: "Variant count", kind: "number" },
  budgetCapUsd: { label: "Budget cap (USD)", kind: "number" },
  destinationEnabled: { label: "Destination enabled", kind: "bool", requiresTarget: true },
  templateChoice: { label: "Template choice", kind: "text" },
  modelPreference: { label: "Model preference", kind: "text" },
  gateStrictness: { label: "Gate strictness", kind: "enum", options: ["strict", "normal", "lenient", "off"] },
  approvalMode: { label: "Approval mode", kind: "enum", options: ["auto", "approve"] },
  publishTarget: { label: "Publish target", kind: "text" },
};
const PATCH_STATE_CLS: Record<string, string> = { pending: "ps-pending", applied: "ps-applied", rejected: "ps-rejected" };
const GRID_MIN = 150;
const GRID_GAP = 10;
const GRID_OVERSCAN = 700;
const VIRTUAL_GRID_THRESHOLD = 900;

async function api<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(String(res.status));
  return await res.json();
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(String(res.status)), { data });
  return data as T;
}

function money(n: number | null | undefined) {
  return n == null ? "-" : `$${Number(n).toFixed(2)}`;
}

function annKey(type: string, ref: string) {
  return `${type}:${ref}`;
}

function selKey(type: string, ref: string) {
  return `${type}:${ref}`;
}

function parseHash() {
  const raw = location.hash.replace(/^#/, "");
  if (!raw) return {} as { workspace?: string; project?: string };
  const [workspace, project] = raw.split("/").map((s) => {
    try { return decodeURIComponent(s); } catch { return s; }
  });
  return { workspace, project };
}

function versionBadge(name: string) {
  const m = name.match(/\.(v\d+)\./);
  return m ? <span class="badge v">{m[1]}</span> : null;
}

function groupByKind(list: Artifact[]) {
  const groups = new Map<string, Artifact[]>();
  for (const a of list) groups.set(a.kind, [...(groups.get(a.kind) || []), a]);
  return [...groups.entries()].sort(([a], [b]) => {
    const ia = KIND_ORDER.indexOf(a), ib = KIND_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
  });
}

function graphNodeWidth(node: RunGraphNode) {
  return node.type === "project" ? 200 : 180;
}

const NODE_GAP = 56;
const W_COLLAPSED = 248;
const W_ASSETS = 520;
function workflowNodeWidth(step: WorkflowStep, expanded: Set<string>) {
  return step.phase === "assets" && expanded.has(step.id) ? W_ASSETS : W_COLLAPSED;
}

function buildAnnotationIndex(list: Annotation[]) {
  const idx: Record<string, Annotation> = {};
  for (const a of list || []) {
    const key = annKey(a.target.type, a.target.ref);
    if (!idx[key]) idx[key] = a;
  }
  return idx;
}

function StudioApp() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspace, setWorkspace] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [project, setProject] = useState("");
  const [runId, setRunId] = useState("");
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [workflow, setWorkflow] = useState<WorkflowLane>(null);
  const [board, setBoard] = useState<Board>(null);
  const [view, setView] = useState<"board" | "files">("board");
  const [filter, setFilter] = useState<string | null>(null);
  const [run, setRun] = useState<RunSummary>(null);
  const [runGraph, setRunGraph] = useState<RunGraph>(null);
  const [runView, setRunView] = useState<"graph" | "dashboard">("graph");
  const [runPatches, setRunPatches] = useState<PatchState>({ patches: [], effectiveConfig: {} });
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selection, setSelection] = useState<Selection[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<ModalEntry>(null);
  const [drawer, setDrawer] = useState<RunGraphNode | null>(null);
  const [tagTarget, setTagTarget] = useState<TagTarget>(null);
  const [sentInbox, setSentInbox] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [authNeeded, setAuthNeeded] = useState(false);

  const annIndex = useMemo(() => buildAnnotationIndex(annotations), [annotations]);
  const annFor = (type: string, ref: string) => annIndex[annKey(type, ref)] || null;
  const fileUrl = (path: string, proj = project) =>
    `/api/projects/${encodeURIComponent(proj)}/file?workspace=${encodeURIComponent(workspace)}&path=${encodeURIComponent(path)}`;

  async function loadAnnotations(scopeProject = project, scopeRun = runId) {
    try {
      const url = scopeProject
        ? `/api/projects/${encodeURIComponent(scopeProject)}/annotations?workspace=${encodeURIComponent(workspace)}`
        : `/api/runs/${encodeURIComponent(scopeRun)}/annotations?workspace=${encodeURIComponent(workspace)}`;
      const data = await api<{ annotations: Annotation[] }>(url);
      setAnnotations(data.annotations || []);
    } catch {
      setAnnotations([]);
    }
  }

  async function openProject(id: string, ws = workspace, fromHash = false) {
    setProject(id);
    setRunId("");
    setRun(null);
    setFilter(null);
    setSelection([]);
    setSentInbox(null);
    setDrawer(null);
    const [nextArtifacts, nextBoard, nextWorkflow, ann] = await Promise.all([
      api<Artifact[]>(`/api/projects/${encodeURIComponent(id)}/artifacts?workspace=${encodeURIComponent(ws)}`),
      api<Board>(`/api/projects/${encodeURIComponent(id)}/board?workspace=${encodeURIComponent(ws)}`).catch(() => null),
      api<WorkflowLane>(`/api/projects/${encodeURIComponent(id)}/workflow?workspace=${encodeURIComponent(ws)}`).catch(() => null),
      api<{ annotations: Annotation[] }>(`/api/projects/${encodeURIComponent(id)}/annotations?workspace=${encodeURIComponent(ws)}`).catch(() => ({ annotations: [] })),
    ]);
    setArtifacts(nextArtifacts);
    setBoard(nextBoard);
    setWorkflow(nextWorkflow);
    setAnnotations(ann.annotations || []);
    setView(nextWorkflow?.steps?.length ? "board" : "files");
    const assetsStep = nextWorkflow?.steps?.find((s) => s.phase === "assets");
    setExpanded(assetsStep ? new Set([assetsStep.id]) : new Set());
    if (!fromHash) history.replaceState(null, "", `#${encodeURIComponent(ws)}/${encodeURIComponent(id)}`);
  }

  async function openWorkspace(slug: string, fromHash = false, projectFromHash = "") {
    setWorkspace(slug);
    setProject("");
    setRunId("");
    setRun(null);
    setRunGraph(null);
    setSelection([]);
    setSentInbox(null);
    setDrawer(null);
    const [nextProjects, nextRuns] = await Promise.all([
      api<Project[]>(`/api/projects?workspace=${encodeURIComponent(slug)}`),
      api<RunRow[]>(`/api/runs?workspace=${encodeURIComponent(slug)}`).catch(() => []),
    ]);
    setProjects(nextProjects);
    setRuns(nextRuns);
    if (projectFromHash) await openProject(projectFromHash, slug, true);
    else if (!fromHash) history.replaceState(null, "", `#${encodeURIComponent(slug)}`);
  }

  async function openRun(id: string) {
    setRunId(id);
    setProject("");
    setSelection([]);
    setSentInbox(null);
    setDrawer(null);
    const [nextRun, ann, graph, patches] = await Promise.all([
      api<RunSummary>(`/api/runs/${encodeURIComponent(id)}?workspace=${encodeURIComponent(workspace)}`).catch(() => null),
      api<{ annotations: Annotation[] }>(`/api/runs/${encodeURIComponent(id)}/annotations?workspace=${encodeURIComponent(workspace)}`).catch(() => ({ annotations: [] })),
      api<RunGraph>(`/api/runs/${encodeURIComponent(id)}/graph?workspace=${encodeURIComponent(workspace)}`).catch(() => null),
      api<PatchState>(`/api/runs/${encodeURIComponent(id)}/config-patches?workspace=${encodeURIComponent(workspace)}`).catch(() => ({ patches: [], effectiveConfig: {} })),
    ]);
    setRun(nextRun);
    setRunGraph(graph);
    setRunPatches(patches);
    setAnnotations(ann.annotations || []);
  }

  useEffect(() => {
    api<Workspace[]>("/api/workspaces").then(async (rows) => {
      setWorkspaces(rows);
      const hash = parseHash();
      const initial = hash.workspace && rows.some((w) => w.slug === hash.workspace) ? hash.workspace : rows[0]?.slug;
      if (initial) await openWorkspace(initial, !!hash.workspace, hash.project);
    }).catch((e) => { if ((e as Error).message === "401") setAuthNeeded(true); });
  }, []);

  useEffect(() => {
    const onHash = () => {
      const hash = parseHash();
      if (hash.workspace && hash.workspace !== workspace) void openWorkspace(hash.workspace, true, hash.project);
      else if (hash.project && hash.project !== project) void openProject(hash.project, workspace, true);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [workspace, project]);

  useEffect(() => {
    if (!workspace || !project) return;
    const sock = new WebSocket(`ws://${location.host}/ws?workspace=${encodeURIComponent(workspace)}&project=${encodeURIComponent(project)}`);
    sock.onopen = () => setLive(true);
    sock.onclose = () => setLive(false);
    sock.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      setArtifacts((cur) => {
        const idx = cur.findIndex((a) => a.path === msg.path);
        if (msg.type === "unlink") return idx === -1 ? cur : cur.filter((_, i) => i !== idx);
        const entry: Artifact = { path: msg.path, kind: msg.kind, name: msg.name, size: msg.size, mtime: msg.mtime, type: msg.mediaType, fresh: true };
        if (idx === -1) return [entry, ...cur];
        return cur.map((a, i) => i === idx ? entry : a);
      });
    };
    return () => sock.close();
  }, [workspace, project]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setModal(null); setDrawer(null); setTagTarget(null); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  async function chooseVariant(scene: string, path: string) {
    const result = await fetch(`/api/projects/${encodeURIComponent(project)}/board/choose`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspace, scene, path }),
    }).then((r) => r.json()).catch(() => null);
    if (result?.scenes) setBoard(result);
  }

  async function saveAnnotation(target: TagTarget, tags: string[], note: string) {
    if (!target) return;
    const prior = annFor(target.type, target.ref);
    const base = project ? `/api/projects/${encodeURIComponent(project)}/annotations` : `/api/runs/${encodeURIComponent(runId)}/annotations`;
    if (prior) {
      await fetch(`${base}/remove`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspace, id: prior.id }) }).catch(() => {});
    }
    if (tags.length || note) {
      await fetch(base, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspace, target: { type: target.type, ref: target.ref }, tags, note }),
      }).catch(() => {});
    }
    setTagTarget(null);
    await loadAnnotations();
  }

  function toggleSelect(type: string, ref: string, label: string) {
    const key = selKey(type, ref);
    setSelection((cur) => cur.some((s) => selKey(s.type, s.ref) === key)
      ? cur.filter((s) => selKey(s.type, s.ref) !== key)
      : [...cur, { type, ref, label }]);
  }

  function isSelected(type: string, ref: string) {
    return selection.some((s) => selKey(s.type, s.ref) === selKey(type, ref));
  }

  const objectButtons = (type: string, ref: string, label: string) => (
    <>
      <button
        class={`selbtn${isSelected(type, ref) ? " on" : ""}`}
        title="select for the agent inbox"
        aria-label="select"
        onClick={(e) => { e.stopPropagation(); toggleSelect(type, ref, label || ref); }}
      >+</button>
      <button
        class={`tagbtn${annFor(type, ref) ? " on" : ""}`}
        title={`tag this ${type}`}
        aria-label="tag"
        onClick={(e) => { e.stopPropagation(); setTagTarget({ type, ref, label: label || ref }); }}
      >#</button>
    </>
  );

  const chips = (type: string, ref: string) => <TagChips annotation={annFor(type, ref)} />;
  const hasProject = !!project;
  const hasRun = !!runId;
  const hasBoard = !!workflow?.steps?.length;

  if (authNeeded) return <LoginGate />;

  return (
    <div class="layout" data-preact-studio>
      <aside class="side">
        <div class="brand">
          <span class="dot"></span>Studio
          <a class="story-nav" href="/storybook.html">Storybook</a>
          <span class={`live${live ? " on" : ""}`} id="live">{live ? "live" : "offline"}</span>
        </div>
        <div class="ws-pick">
          <label for="ws">Workspace</label>
          <select id="ws" value={workspace} onChange={(e) => void openWorkspace((e.currentTarget as HTMLSelectElement).value)}>
            {workspaces.map((w) => <option value={w.slug}>{w.name} ({w.projects})</option>)}
          </select>
        </div>
        <div class="run-pick" id="runPick" hidden={!runs.length}>
          <label>Runs</label>
          <nav class="run-list" id="runs">
            {runs.map((r) => <button class={`run ${RUN_STATUS_CLS[r.status] || "rs-active"}${r.id === runId ? " active" : ""}`} onClick={() => void openRun(r.id)} title={r.title}>
              <span class="run-dot"></span><span class="run-name">{r.title}</span><span class="run-n">{r.projects}</span>
            </button>)}
          </nav>
        </div>
        <div class="proj-label">Projects</div>
        <nav class="proj-list" id="projects">
          {projects.length ? projects.map((p) => <button class={`proj${p.id === project ? " active" : ""}`} onClick={() => void openProject(p.id)}>{p.id}</button>) : <div class="empty">no projects</div>}
        </nav>
      </aside>

      <main class="main">
        <div class="topbar">
          <h1 id="title">{hasRun ? (run?.title || runId) : hasProject ? project : workspace ? `${workspace} — farm` : "-"}</h1>
          <div class="views" id="views">
            {hasRun ? <>
              <button class={`vtab${runView === "graph" ? " active" : ""}`} onClick={() => setRunView("graph")}>graph</button>
              <button class={`vtab${runView === "dashboard" ? " active" : ""}`} onClick={() => setRunView("dashboard")}>dashboard</button>
            </> : hasProject ? <>
              <button class={`vtab${view === "board" ? " active" : ""}`} disabled={!hasBoard} onClick={() => setView("board")}>board</button>
              <button class={`vtab${view === "files" ? " active" : ""}`} onClick={() => setView("files")}>files</button>
            </> : null}
          </div>
          <span class="count" id="count">{hasRun ? `${runGraph?.nodes?.length || 0} nodes` : hasProject ? (view === "board" ? `${workflow?.steps?.length || 0} nodes` : `${artifacts.length} files`) : ""}</span>
          <span class="obj-tag" id="objTag">
            {hasRun ? <>{objectButtons("run", runId, run?.title || runId)}{chips("run", runId)}</> : hasProject ? <>{objectButtons("project", project, project)}{chips("project", project)}</> : null}
          </span>
          <KindChips artifacts={artifacts} filter={filter} visible={hasProject && view === "files"} onFilter={setFilter} />
        </div>

        <div class="grid-scroll" id="scroll">
          {!hasProject && !hasRun ? (workspace
            ? <FarmPanel workspace={workspace} onNode={setDrawer} annFor={annFor} chips={chips} objectButtons={objectButtons} />
            : <div class="placeholder" id="placeholder">pick a project or run</div>) : null}
          {hasRun ? runView === "graph"
            ? <RunGraphView graph={runGraph} workspace={workspace} runId={runId} annFor={annFor} chips={chips} objectButtons={objectButtons} onNode={setDrawer} />
            : <RunDashboard run={run} runId={runId} runPatches={runPatches} setRunPatches={setRunPatches} workspace={workspace} onProject={(id) => void openProject(id)} />
            : null}
          {hasProject && view === "board" ? <WorkflowCanvas
            workspace={workspace}
            project={project}
            workflow={workflow}
            board={board}
            expanded={expanded}
            setExpanded={setExpanded}
            fileUrl={fileUrl}
            chooseVariant={chooseVariant}
            openModal={setModal}
            objectButtons={objectButtons}
            chips={chips}
          /> : null}
          {hasProject && view === "files" ? <FilesView artifacts={artifacts} filter={filter} fileUrl={fileUrl} openModal={setModal} objectButtons={objectButtons} chips={chips} /> : null}
        </div>
      </main>

      <SelectionTray
        selection={selection}
        setSelection={setSelection}
        sentInbox={sentInbox}
        setSentInbox={setSentInbox}
        workspace={workspace}
        project={project}
        runId={runId}
        annFor={annFor}
      />
      <PreviewModal entry={modal} fileUrl={fileUrl} onClose={() => setModal(null)} />
      <TagEditor target={tagTarget} annotation={tagTarget ? annFor(tagTarget.type, tagTarget.ref) : null} onClose={() => setTagTarget(null)} onSave={saveAnnotation} />
      <NodeDrawer
        node={drawer}
        annFor={annFor}
        chips={chips}
        objectButtons={objectButtons}
        isSelected={isSelected}
        toggleSelect={toggleSelect}
        onClose={() => setDrawer(null)}
        onOpenProject={(id) => { setDrawer(null); void openProject(id); }}
        openModal={setModal}
      />
    </div>
  );
}

// ── Auth gate (#506): STUDIO_AUTH_TOKEN mode — POST /api/auth sets the cookie ──
function LoginGate() {
  const [token, setToken] = useState("");
  const [err, setErr] = useState("");
  const login = async () => {
    setErr("");
    try {
      await postJson("/api/auth", { token });
      location.reload();
    } catch {
      setErr("wrong token");
    }
  };
  return <div class="layout" data-preact-studio>
    <div class="login-gate">
      <div class="brand"><span class="dot"></span>Studio</div>
      <p class="login-hint">This dashboard is protected. Paste the admin token (STUDIO_AUTH_TOKEN).</p>
      <div class="cp-form">
        <input class="cp-value" type="password" value={token} placeholder="admin token"
          onInput={(e) => setToken((e.currentTarget as HTMLInputElement).value)}
          onKeyDown={(e) => { if (e.key === "Enter") void login(); }} />
        <button class="cp-propose" onClick={() => void login()}>log in</button>
      </div>
      {err ? <div class="login-err">{err}</div> : null}
    </div>
  </div>;
}

// ── Farm dashboard (#506) — workspace-level view over the #503 farm plane ──
function FarmPanel({ workspace, onNode, annFor, chips, objectButtons }: {
  workspace: string;
  onNode: (node: RunGraphNode) => void;
  annFor: (type: string, ref: string) => Annotation | null;
  chips: (type: string, ref: string) => any;
  objectButtons: (type: string, ref: string, label: string) => any;
}) {
  const [farm, setFarm] = useState<FarmStatus | null>(null);
  const [trust, setTrust] = useState<TrustStatus | null>(null);
  const [calendar, setCalendar] = useState<CalendarDoc | null>(null);
  const [flows, setFlows] = useState<WorkflowRow[]>([]);
  const [spec, setSpec] = useState<{ name: string; graph: RunGraph; issues: Array<{ level: string; message: string }> } | null>(null);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");

  const ws = encodeURIComponent(workspace);
  const loadFarm = () => api<FarmStatus>(`/api/farm/status?workspace=${ws}`).then(setFarm).catch(() => setFarm(null));
  const loadAll = () => {
    void loadFarm();
    void api<TrustStatus>(`/api/workspaces/${ws}/trust`).then(setTrust).catch(() => setTrust(null));
    void api<CalendarDoc>(`/api/workspaces/${ws}/calendar`).then(setCalendar).catch(() => setCalendar(null));
    void api<{ workflows: WorkflowRow[] } | WorkflowRow[]>(`/api/workspaces/${ws}/workflows`)
      .then((d: any) => setFlows(Array.isArray(d) ? d : d.workflows || [])).catch(() => setFlows([]));
  };
  useEffect(() => { setSpec(null); setNote(""); loadAll(); }, [workspace]);
  useEffect(() => {
    const t = setInterval(() => void loadFarm(), 8000);
    return () => clearInterval(t);
  }, [workspace]);

  const farmAction = async (action: "start" | "stop" | "tick-now") => {
    setBusy(action);
    setNote("");
    try {
      await postJson(`/api/farm/${action}`, { workspace });
      setNote(action === "stop" ? "farm stopped" : action === "start" ? "farm started" : "tick fired");
    } catch (e: any) {
      setNote(e?.data?.error || (e?.message === "409" ? "farm already running" : `failed: ${e?.message}`));
    }
    setBusy("");
    void loadFarm();
  };

  const setTrustLevel = async (level: string) => {
    try {
      await postJson(`/api/workspaces/${ws}/trust`, { level });
      void api<TrustStatus>(`/api/workspaces/${ws}/trust`).then(setTrust).catch(() => {});
    } catch (e: any) {
      setNote(e?.data?.error || "trust update failed");
    }
  };

  if (spec) {
    return <>
      <div class="farm-spec-head">
        <button class="ib-link" onClick={() => setSpec(null)}>&larr; back to farm</button>
        <span class="run-status rs-active">spec: {spec.name}</span>
        {spec.issues.length ? <span class="farm-issues">{spec.issues.map((i) => <span class={`gb ${i.level === "error" ? "v-blocked" : "v-repair"}`}>{i.message}</span>)}</span> : null}
      </div>
      <RunGraphView graph={spec.graph} workspace={workspace} runId={""} annFor={annFor} chips={chips} objectButtons={objectButtons} onNode={onNode} />
    </>;
  }

  const counts = farm?.counts || {};
  const daemon = farm?.daemon;
  return <div class="runboard" id="farmboard">
    {note ? <div class="run-warn">{note}</div> : null}
    <div class="run-stats">
      <div class="stat"><span class="stat-k">daemon</span><span class="stat-v">{daemon ? (daemon.running ? `pid ${daemon.pid}` : "stopped") : "-"}</span></div>
      <div class="stat"><span class="stat-k">running</span><span class="stat-v">{counts["running"] || 0}</span></div>
      <div class="stat"><span class="stat-k">parked</span><span class="stat-v">{counts["parked-approval"] || 0}</span></div>
      <div class={`stat${(counts["halted-budget"] || 0) + (counts["halted-failure"] || 0) ? " stat-bad" : ""}`}><span class="stat-k">halted</span><span class="stat-v">{(counts["halted-budget"] || 0) + (counts["halted-failure"] || 0)}</span></div>
      <div class="stat"><span class="stat-k">complete</span><span class="stat-v">{counts["complete"] || 0}</span></div>
    </div>
    <div class="cp-form">
      <button class="cp-propose" disabled={!!busy || !!daemon?.running} onClick={() => void farmAction("start")}>{busy === "start" ? "starting..." : "start farm"}</button>
      <button class="cp-propose" disabled={!!busy || !daemon?.running} onClick={() => void farmAction("stop")}>{busy === "stop" ? "stopping..." : "stop"}</button>
      <button class="cp-propose" disabled={!!busy} onClick={() => void farmAction("tick-now")}>{busy === "tick-now" ? "firing..." : "tick now"}</button>
      <button class="ib-link" onClick={loadAll}>refresh</button>
    </div>

    <section class="run-card">
      <h2 class="run-card-head">Farm runs<span class="n">{farm?.runs?.length || 0}</span></h2>
      <div class="farm-rows">{farm?.runs?.length ? farm.runs.map((r) => <div class="farm-row">
        <span class={`run-status ${FARM_RUN_CLS[r.status] || "rs-active"}`}>{r.status}</span>
        <span class="farm-cell farm-grow" title={r.detail || ""}>{r.workflow} <code class="cp-id">{r.id}</code></span>
        <span class="farm-cell">{r.completedNodes}{r.totalNodes != null ? `/${r.totalNodes}` : ""} nodes</span>
        <span class="farm-cell">{money(r.spendUsd)}</span>
      </div>) : <div class="inbox-empty">No farm runs yet - start the farm or fire a tick.</div>}</div>
    </section>

    <section class="run-card">
      <h2 class="run-card-head">Trust ladder{trust?.promotion?.suggested ? <span class="gb gb-approve">promotion suggested</span> : null}</h2>
      {trust ? <>
        <div class="cp-form">
          <select class="cp-value" value={trust.level} onChange={(e) => void setTrustLevel((e.currentTarget as HTMLSelectElement).value)}>
            <option value="L0">L0 — every publish needs approval</option>
            <option value="L1">L1 — auto-publish at score &ge; {trust.autoPublishScore}</option>
            <option value="L2">L2 — autopilot (ship verdicts)</option>
          </select>
        </div>
        <div class="cp-eff">
          <span class="cp-effk">agreement {trust.agreement.rate == null ? "—" : `${Math.round(trust.agreement.rate * 100)}%`} ({trust.agreement.samples} samples)</span>
          <span class="cp-effk">streak {trust.agreement.streak}</span>
          <span class="cp-effk">auto-passes {trust.autoPasses}</span>
        </div>
        <div class="cp-hint">{trust.promotion.rule}</div>
      </> : <div class="inbox-empty">No trust data - unknown workspace.</div>}
    </section>

    <section class="run-card">
      <h2 class="run-card-head">Calendar<span class="n">{calendar?.entries?.length || 0}</span></h2>
      {calendar?.slots?.length ? <div class="farm-rows">{calendar.slots.map((s: any) => <div class="farm-row">
        <span class="farm-cell farm-mono">{s.weekday} {s.time} {s.timezone}</span>
        <span class="farm-cell farm-grow">{s.unitType}</span>
        <span class="farm-cell">{(s.targetPlatforms || []).join(", ") || "-"}</span>
      </div>)}</div> : <div class="inbox-empty">No recurring slots - add them with `ralphy calendar add`.</div>}
      {calendar?.entries?.length ? <div class="farm-rows farm-entries">{calendar.entries.slice(0, 10).map((e: any) => <div class="farm-row">
        <span class={`run-status ${e.status === "published" ? "rs-complete" : "rs-active"}`}>{e.status}</span>
        <span class="farm-cell farm-mono">{e.at ? e.at.slice(0, 16).replace("T", " ") : "queued"}</span>
        <span class="farm-cell farm-grow">{e.unitType}</span>
        <span class="farm-cell">{(e.platforms || []).join(", ")}</span>
      </div>)}</div> : null}
    </section>

    <section class="run-card">
      <h2 class="run-card-head">Workflows<span class="n">{flows.length}</span></h2>
      <div class="farm-rows">{flows.length ? flows.map((f) => <div class="farm-row">
        <span class="farm-cell farm-grow">{f.name}</span>
        <span class="farm-cell">{f.kind === "graph" ? `${f.nodes} nodes` : `${f.steps} steps (linear)`}</span>
        {f.kind === "graph" ? <button class="ib-link" onClick={() => void api<any>(`/api/workspaces/${ws}/workflows/${encodeURIComponent(f.name)}/graph`)
          .then((g) => setSpec({ name: f.name, graph: { title: f.name, nodes: g.nodes, edges: g.edges, layout: g.layout || {} }, issues: g.issues || [] }))
          .catch(() => setNote("could not load the workflow graph"))}>view graph</button> : <span class="farm-cell">-</span>}
      </div>) : <div class="inbox-empty">No workflows in this workspace.</div>}</div>
    </section>

    <ImportBundleCard workspace={workspace} onImported={() => location.reload()} />
  </div>;
}

function ImportBundleCard({ workspace, onImported }: { workspace: string; onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [asSlug, setAsSlug] = useState("");
  const [allowKeys, setAllowKeys] = useState(false);
  const [allowCov, setAllowCov] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; lines: string[] } | null>(null);

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    setResult(null);
    const qs = new URLSearchParams();
    if (asSlug) qs.set("as", asSlug);
    if (allowKeys) qs.set("allowMissingKeys", "1");
    if (allowCov) qs.set("allowCoverageGaps", "1");
    try {
      const res = await fetch(`/api/workspaces/import-bundle?${qs}`, { method: "POST", body: await file.arrayBuffer() });
      const data: any = await res.json().catch(() => null);
      if (res.ok && data?.imported !== false) {
        setResult({ ok: true, lines: [`imported as "${data?.workspace || asSlug || "(bundle name)"}"`] });
        setTimeout(onImported, 1200);
      } else {
        // Surface #502 validation refusals verbatim.
        const refusals = data?.refusals || data?.gaps || [];
        setResult({ ok: false, lines: refusals.length ? refusals.map((r: any) => r.detail || r.message || JSON.stringify(r)) : [data?.error || `import failed (${res.status})`] });
      }
    } catch (e: any) {
      setResult({ ok: false, lines: [`upload failed: ${e?.message || e}`] });
    }
    setBusy(false);
  };

  return <section class="run-card">
    <h2 class="run-card-head">Import bundle</h2>
    <div class="cp-form">
      <input class="cp-value" type="file" accept=".zip" onChange={(e) => setFile((e.currentTarget as HTMLInputElement).files?.[0] || null)} />
      <input class="cp-target" value={asSlug} placeholder="as slug (optional)" onInput={(e) => setAsSlug((e.currentTarget as HTMLInputElement).value)} />
      <label class="farm-check"><input type="checkbox" checked={allowKeys} onChange={(e) => setAllowKeys((e.currentTarget as HTMLInputElement).checked)} /> allow missing keys</label>
      <label class="farm-check"><input type="checkbox" checked={allowCov} onChange={(e) => setAllowCov((e.currentTarget as HTMLInputElement).checked)} /> allow coverage gaps</label>
      <button class="cp-propose" disabled={!file || busy} onClick={() => void upload()}>{busy ? "importing..." : "import"}</button>
    </div>
    <div class="cp-hint">Upload a #502 workspace bundle zip. Validation runs before anything is written; refusals appear verbatim below.</div>
    {result ? <div class={`farm-import ${result.ok ? "ok" : "bad"}`}>{result.lines.map((l) => <div>{l}</div>)}</div> : null}
  </section>;
}

function KindChips({ artifacts, filter, visible, onFilter }: { artifacts: Artifact[]; filter: string | null; visible: boolean; onFilter: (value: string | null) => void }) {
  if (!visible) return <div class="kind-chips" id="chips" style={{ display: "none" }}></div>;
  const groups = groupByKind(artifacts);
  return <div class="kind-chips" id="chips">
    <button class={`chip${filter == null ? " active" : ""}`} onClick={() => onFilter(null)}>all</button>
    {groups.map(([kind, items]) => <button class={`chip${filter === kind ? " active" : ""}`} onClick={() => onFilter(kind)}>{kind}<span class="n">{items.length}</span></button>)}
  </div>;
}

function TagChips({ annotation }: { annotation: Annotation | null }) {
  if (!annotation || (!annotation.tags.length && !annotation.note)) return null;
  return <span class="atags" title={annotation.note || ""}>
    {annotation.tags.map((t) => <span class={`atag at-${t}`}>{t}</span>)}
    {annotation.note ? <span class="anote">note</span> : null}
  </span>;
}

function FilesView({ artifacts, filter, fileUrl, openModal, objectButtons, chips }: {
  artifacts: Artifact[];
  filter: string | null;
  fileUrl: (path: string, project?: string) => string;
  openModal: (entry: Artifact) => void;
  objectButtons: (type: string, ref: string, label: string) => any;
  chips: (type: string, ref: string) => any;
}) {
  const [viewport, setViewport] = useState({ top: 0, height: 900, width: 1200 });

  useEffect(() => {
    const el = document.getElementById("scroll");
    if (!el) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setViewport({ top: el.scrollTop, height: el.clientHeight, width: el.clientWidth }));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const groups = groupByKind(artifacts);
  const visible = filter ? groups.filter(([kind]) => kind === filter) : groups;
  if (!visible.length) return <div class="placeholder">no artifacts yet - they appear live as ralphy generates</div>;
  return <div id="sections">
    {visible.map(([kind, items]) => (
      <ArtifactSection
        key={kind}
        kind={kind}
        items={items}
        viewport={viewport}
        fileUrl={fileUrl}
        openModal={openModal}
        objectButtons={objectButtons}
        chips={chips}
      />
    ))}
  </div>;
}

function ArtifactSection(props: {
  kind: string;
  items: Artifact[];
  viewport: { top: number; height: number; width: number };
  fileUrl: (path: string, project?: string) => string;
  openModal: (entry: Artifact) => void;
  objectButtons: (type: string, ref: string, label: string) => any;
  chips: (type: string, ref: string) => any;
}) {
  const { kind, items, viewport } = props;
  const gridRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState({ top: 0, width: 0 });

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const update = () => setMetrics({ top: el.offsetTop, width: el.clientWidth });
    update();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [items.length, viewport.width]);

  if (items.length < VIRTUAL_GRID_THRESHOLD) {
    return <section class="kind-section">
      <h2 class="kind-head">{kind}<span class="n">{items.length}</span></h2>
      <div class="grid" ref={gridRef}>
        {items.map((a) => <ArtifactTile key={a.path} artifact={a} {...props} />)}
      </div>
    </section>;
  }

  const width = Math.max(GRID_MIN, metrics.width || viewport.width - 44);
  const cols = Math.max(1, Math.floor((width + GRID_GAP) / (GRID_MIN + GRID_GAP)));
  const tile = Math.floor((width - GRID_GAP * (cols - 1)) / cols);
  const pitch = tile + GRID_GAP;
  const rows = Math.ceil(items.length / cols);
  const totalHeight = Math.max(tile, rows * pitch - GRID_GAP);
  const relativeTop = viewport.top - metrics.top;
  const rawStartRow = Math.floor((relativeTop - GRID_OVERSCAN) / pitch);
  const rawEndRow = Math.ceil((relativeTop + viewport.height + GRID_OVERSCAN) / pitch);
  const startRow = Math.min(rows, Math.max(0, rawStartRow));
  const endRow = Math.min(rows, Math.max(startRow, rawEndRow));
  const start = startRow * cols;
  const end = Math.min(items.length, endRow * cols);

  return <section class="kind-section">
    <h2 class="kind-head">{kind}<span class="n">{items.length}</span></h2>
    <div class="vgrid" ref={gridRef} style={{ height: `${totalHeight}px` }}>
      {items.slice(start, end).map((artifact, i) => {
        const idx = start + i;
        const row = Math.floor(idx / cols);
        const col = idx % cols;
        return <ArtifactTile
          key={artifact.path}
          artifact={artifact}
          {...props}
          style={{
            width: `${tile}px`,
            height: `${tile}px`,
            transform: `translate(${col * pitch}px, ${row * pitch}px)`,
          }}
        />;
      })}
    </div>
  </section>;
}

function ArtifactTile(props: {
  artifact: Artifact;
  fileUrl: (path: string, project?: string) => string;
  openModal: (entry: Artifact) => void;
  objectButtons: (type: string, ref: string, label: string) => any;
  chips: (type: string, ref: string) => any;
  style?: any;
}) {
  const { artifact: a } = props;
  const tags = props.chips("artifact", a.path);
  return <div class={`tile${a.fresh ? " fresh" : ""}`} style={props.style} title={a.path} onClick={() => props.openModal(a)}>
    {a.type === "image" ? <img loading="lazy" src={props.fileUrl(a.path)} alt="" /> : a.type === "video" ? <video preload="metadata" muted src={props.fileUrl(a.path)} /> : <div class="glyph">{GLYPHS[a.type] ?? GLYPHS.other}</div>}
    {versionBadge(a.name)}
    {props.objectButtons("artifact", a.path, a.name)}
    {tags ? <span class="tile-atags">{tags}</span> : null}
    <div class="cap">{a.name}</div>
  </div>;
}

function WorkflowCanvas(props: {
  workspace: string;
  project: string;
  workflow: WorkflowLane;
  board: Board;
  expanded: Set<string>;
  setExpanded: (next: Set<string>) => void;
  fileUrl: (path: string) => string;
  chooseVariant: (scene: string, path: string) => Promise<void>;
  openModal: (entry: Artifact) => void;
  objectButtons: (type: string, ref: string, label: string) => any;
  chips: (type: string, ref: string) => any;
}) {
  const { workflow, board, expanded, setExpanded } = props;
  const [pan, setPan] = useState({ x: 0, y: 0, scale: 1 });
  const [nodePos, setNodePos] = useState<Record<string, Pos>>({});
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!workflow?.steps?.length) return;
    const saved = board?.layout || {};
    let x = 60;
    const next: Record<string, Pos> = {};
    for (const step of workflow.steps) {
      next[step.id] = saved[step.id] || { x, y: 90 };
      x += workflowNodeWidth(step, expanded) + NODE_GAP;
    }
    setNodePos(next);
    const assets = workflow.steps.find((s) => s.phase === "assets");
    if (assets && next[assets.id]) setPan({ x: -(next[assets.id].x - 60), y: -(next[assets.id].y - 24), scale: 1 });
  }, [workflow, board?.layout, [...expanded].join("|")]);

  if (!workflow?.steps?.length) return <div class="board"><div class="placeholder">no workflow - scaffold one with ralphy workflow init</div></div>;

  const saveLayout = (node: string, pos: Pos) => {
    void fetch(`/api/projects/${encodeURIComponent(props.project)}/board/layout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspace: props.workspace, node, x: Math.round(pos.x), y: Math.round(pos.y) }),
    }).catch(() => {});
  };

  const dragNode = (event: MouseEvent, id: string) => {
    event.preventDefault();
    event.stopPropagation();
    const start = nodePos[id];
    if (!start) return;
    let latest = start;
    const sx = event.clientX, sy = event.clientY;
    const move = (ev: MouseEvent) => {
      latest = { x: start.x + (ev.clientX - sx) / pan.scale, y: start.y + (ev.clientY - sy) / pan.scale };
      setNodePos((cur) => ({ ...cur, [id]: latest }));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      saveLayout(id, latest);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const edges = workflow.steps.slice(0, -1).map((step, i) => {
    const next = workflow.steps[i + 1];
    const a = nodePos[step.id], b = nodePos[next.id];
    if (!a || !b) return null;
    const ax = a.x + workflowNodeWidth(step, expanded), ay = a.y + 34;
    const bx = b.x, by = b.y + 34, mx = (ax + bx) / 2;
    return <path d={`M ${ax} ${ay} C ${mx} ${ay}, ${mx} ${by}, ${bx} ${by}`} class="cv-edge" />;
  });

  return <div class="board" id="board">
    <div
      class="cv-viewport"
      ref={viewportRef}
      onWheel={(e) => {
        if ((e.target as Element).closest(".cv-anchors")) return;
        e.preventDefault();
        const nextScale = Math.min(2, Math.max(0.3, pan.scale * (e.deltaY < 0 ? 1.1 : 0.9)));
        const rect = viewportRef.current!.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        setPan({ x: mx - (mx - pan.x) * (nextScale / pan.scale), y: my - (my - pan.y) * (nextScale / pan.scale), scale: nextScale });
      }}
      onMouseDown={(e) => {
        if ((e.target as Element).closest(".cv-node")) return;
        const sx = e.clientX - pan.x, sy = e.clientY - pan.y;
        const move = (ev: MouseEvent) => setPan((cur) => ({ ...cur, x: ev.clientX - sx, y: ev.clientY - sy }));
        const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);
      }}
    >
      <div class="cv-inner" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${pan.scale})` }}>
        <svg class="cv-edges" width="4000" height="1200">{edges}</svg>
        {workflow.steps.map((step) => <WorkflowNode
          step={step}
          board={board}
          expanded={expanded}
          position={nodePos[step.id] || { x: 0, y: 0 }}
          fileUrl={props.fileUrl}
          dragNode={dragNode}
          toggleExpanded={(id) => {
            const next = new Set(expanded);
            next.has(id) ? next.delete(id) : next.add(id);
            setExpanded(next);
          }}
          chooseVariant={props.chooseVariant}
          openModal={props.openModal}
          objectButtons={props.objectButtons}
          chips={props.chips}
          current={step.id === workflow.currentStep}
        />)}
      </div>
      <div class="cv-hint">drag canvas to pan - scroll to zoom - drag a node to arrange</div>
    </div>
  </div>;
}

function WorkflowNode(props: {
  step: WorkflowStep;
  board: Board;
  expanded: Set<string>;
  position: Pos;
  fileUrl: (path: string) => string;
  dragNode: (event: MouseEvent, id: string) => void;
  toggleExpanded: (id: string) => void;
  chooseVariant: (scene: string, path: string) => Promise<void>;
  openModal: (entry: Artifact) => void;
  objectButtons: (type: string, ref: string, label: string) => any;
  chips: (type: string, ref: string) => any;
  current: boolean;
}) {
  const { step, board, expanded } = props;
  const st = STATUS[step.status] || STATUS.queued;
  const isAssets = step.phase === "assets";
  const isExpanded = expanded.has(step.id);
  const meta = `${step.phase} - ${step.engine}${step.model ? " - " + step.model : ""}${step.variants > 1 ? " - x" + step.variants : ""}`;
  const nScenes = board?.scenes?.length || 0;
  const nChosen = board?.scenes?.filter((s) => s.chosen).length || 0;
  return <div
    class={`cv-node ${st.cls}${isAssets ? " assets" : ""}${isExpanded ? " expanded" : ""}${props.current ? " current" : ""}`}
    style={{ left: props.position.x, top: props.position.y, width: workflowNodeWidth(step, expanded) }}
  >
    <div class="cv-head" onMouseDown={(e) => props.dragNode(e as unknown as MouseEvent, step.id)}><span class="dot">{st.glyph}</span><span class="cv-title">{step.label}</span></div>
    <div class="cv-meta">{meta}</div>
    <div class="cv-tags">
      {step.gate.map((g) => <span class="gate">{g}</span>)}
      {step.gateVerdict ? <span class={`verdict v-${step.gateVerdict}`}>{step.gateVerdict}</span> : null}
      <span class={`mode mode-${step.mode}`}>{step.mode}</span>
      {props.objectButtons("workflow_node", step.id, step.label)}
    </div>
    {props.chips("workflow_node", step.id) ? <div class="cv-atags">{props.chips("workflow_node", step.id)}</div> : null}
    {isAssets ? <button class="cv-expand" onClick={(e) => { e.stopPropagation(); props.toggleExpanded(step.id); }}>
      {isExpanded ? "open" : "closed"} anchors - {nScenes} scene{nScenes === 1 ? "" : "s"}{nChosen ? ` - ${nChosen} chosen` : ""}
    </button> : null}
    {isAssets && isExpanded ? <div class="cv-anchors"><Anchors {...props} /></div> : null}
  </div>;
}

function Anchors(props: {
  board: Board;
  fileUrl: (path: string) => string;
  chooseVariant: (scene: string, path: string) => Promise<void>;
  openModal: (entry: Artifact) => void;
  objectButtons: (type: string, ref: string, label: string) => any;
  chips: (type: string, ref: string) => any;
}) {
  const { board } = props;
  if (!board?.scenes?.length) return <div class="cv-empty">no anchors yet - generate scene-NN images</div>;
  return <>
    {board.scenes.map((scene) => <div class="scene">
      <div class="scene-head"><span class="sid">{scene.id}</span><span class="slabel">{scene.label}</span><span class="sn">{scene.variants.length}</span></div>
      <div class="vrow">{scene.variants.map((v) => <VariantTile variant={v} scene={scene.id} {...props} />)}</div>
    </div>)}
    {board.other.length ? <div class="scene other">
      <div class="scene-head"><span class="sid">props / fx</span><span class="sn">{board.other.length}</span></div>
      <div class="vrow">{board.other.map((v) => <VariantTile variant={v} {...props} />)}</div>
    </div> : null}
  </>;
}

function VariantTile({ variant, scene, fileUrl, chooseVariant, openModal, objectButtons, chips }: {
  variant: BoardVariant;
  scene?: string;
  fileUrl: (path: string) => string;
  chooseVariant: (scene: string, path: string) => Promise<void>;
  openModal: (entry: Artifact) => void;
  objectButtons: (type: string, ref: string, label: string) => any;
  chips: (type: string, ref: string) => any;
}) {
  return <div class={`vtile${variant.chosen ? " chosen" : ""}`} title={variant.name} onClick={(e) => { e.stopPropagation(); scene ? void chooseVariant(scene, variant.path) : openModal({ ...variant, kind: "images", size: 0, type: "image" }); }}>
    <img loading="lazy" src={fileUrl(variant.path)} alt="" />
    {versionBadge(variant.name)}
    {variant.chosen ? <span class="chosen-badge">ok</span> : null}
    {objectButtons("artifact", variant.path, variant.name)}
    {chips("artifact", variant.path) ? <span class="vtags">{chips("artifact", variant.path)}</span> : null}
    <button class="zoom" title="preview" aria-label="preview" onClick={(e) => { e.stopPropagation(); openModal({ ...variant, kind: "images", size: 0, type: "image" }); }}>[]</button>
    <div class="vcap">{variant.name}</div>
  </div>;
}

function RunDashboard({ run, runId, runPatches, setRunPatches, workspace, onProject }: {
  run: RunSummary;
  runId: string;
  runPatches: PatchState;
  setRunPatches: (p: PatchState) => void;
  workspace: string;
  onProject: (id: string) => void;
}) {
  if (!run) return <div class="runboard"><div class="placeholder">run not found - it may have been removed</div></div>;
  const b = run.budget || {};
  const inboxItems = [...(run.blockers || []).map((x: any) => ({ kind: "block", ...x })), ...(run.awaitingApprovals || []).map((x: any) => ({ kind: "wait", ...x }))];
  const verdictByProj = new Map((run.quality || []).map((q: any) => [q.project, q.verdict]));
  const phaseByProj = new Map((run.progress?.byProject || []).map((p: any) => [p.project, p.phase]));
  const spendByProj = new Map((b.byProject || []).map((p: any) => [p.project, p.spentUsd]));
  const unitsByProj = new Map((run.units?.byProject || []).map((u: any) => [u.project, u.slugs]));
  const resolved = (run.progress?.byProject || []).map((p: any) => p.project);
  const pct = b.capUsd && b.capUsd > 0 ? Math.min(100, Math.round((b.spentUsd / b.capUsd) * 100)) : null;
  return <div class="runboard" id="runboard">
    <div class="run-head">
      <span class={`run-status ${RUN_STATUS_CLS[run.status] || "rs-active"}`}>{run.status}</span>
      {run.brief ? <p class="run-brief">{run.brief}</p> : null}
      <div class="run-next">{run.nextAction}</div>
    </div>
    {run.missingProjects?.length ? <div class="run-warn">{run.missingProjects.length} member project(s) do not resolve on disk: {run.missingProjects.join(", ")}</div> : null}
    <div class="run-stats">
      <div class="stat"><span class="stat-k">phase</span><span class="stat-v">{run.progress?.phase || "-"}</span></div>
      <div class="stat"><span class="stat-k">spent</span><span class="stat-v">{money(b.spentUsd)}{b.capUsd != null ? ` / ${money(b.capUsd)}` : ""}</span></div>
      <div class="stat"><span class="stat-k">winners</span><span class="stat-v">{run.winners?.length || 0}/{resolved.length}</span></div>
      <div class={`stat${run.failures?.length ? " stat-bad" : ""}`}><span class="stat-k">failed</span><span class="stat-v">{run.failures?.length || 0}</span></div>
      <div class="stat"><span class="stat-k">units</span><span class="stat-v">{run.units?.count || 0}</span></div>
    </div>
    {pct != null ? <div class={`budget-bar${b.overBudget ? " over" : ""}`}><div class="budget-fill" style={{ width: `${pct}%` }}></div><span class="budget-cap">{pct}% of {money(b.capUsd)}{b.expired ? " - approval expired" : ""}</span></div> : null}
    <section class="run-card">
      <h2 class="run-card-head">Approval inbox<span class="n">{inboxItems.length}</span></h2>
      <div class="inbox">{inboxItems.length ? inboxItems.map((x: any) => <div class={`inbox-item ${x.kind === "block" ? "ib-block" : "ib-wait"}`}>
        <span class="ib-glyph">{x.kind === "block" ? "x" : "!"}</span><div class="ib-body"><div class="ib-detail">{x.detail}</div>{x.project ? <button class="ib-link" onClick={() => onProject(x.project)}>open {x.project} board</button> : null}</div>
      </div>) : <div class="inbox-empty">Nothing needs you - no blockers or pending approvals.</div>}</div>
    </section>
    <section class="run-card">
      <h2 class="run-card-head">Projects<span class="n">{resolved.length}</span></h2>
      <div class="qhead"><span></span><span>project</span><span>phase</span><span>verdict</span><span>spent</span><span>units</span></div>
      <div class="qtable">{resolved.map((pid: string) => {
        const v = verdictByProj.get(pid) as string | null;
        const dot = (v && VERDICT_DOT[v]) || { glyph: ".", cls: "v-na" };
        const units = (unitsByProj.get(pid) as string[]) || [];
        return <button class="qrow" onClick={() => onProject(pid)}>
          <span class={`qdot ${dot.cls}`}>{dot.glyph}</span><span class="qname">{pid}</span><span class="qphase">{String(phaseByProj.get(pid) || "-")}</span><span class="qverdict">{v || "na"}</span><span class="qspend">{money(spendByProj.get(pid) as number)}</span><span class="qunits">{units.length ? `${units.length} unit${units.length === 1 ? "" : "s"}` : "-"}</span>
        </button>;
      })}</div>
    </section>
    <ConfigCard runId={runId} workspace={workspace} runPatches={runPatches} setRunPatches={setRunPatches} />
  </div>;
}

function ConfigCard({ runId, workspace, runPatches, setRunPatches }: { runId: string; workspace: string; runPatches: PatchState; setRunPatches: (p: PatchState) => void }) {
  const [field, setField] = useState(Object.keys(CONFIG_PATCH_FIELDS)[0]);
  const [value, setValue] = useState("");
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");
  const def = CONFIG_PATCH_FIELDS[field];
  const effective = Object.entries(runPatches.effectiveConfig || {});
  const propose = async () => {
    const parsed = def.kind === "number" ? Number(value) : def.kind === "bool" ? value === "true" : value;
    const body: any = { workspace, field, value: parsed, note };
    if (def.requiresTarget) body.target = target;
    const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/config-patches`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => null);
    if (res?.patches) setRunPatches(res);
  };
  return <section class="run-card">
    <h2 class="run-card-head">Config patches<span class="n">{runPatches.patches?.length || 0}</span></h2>
    {effective.length ? <div class="cp-eff">effective: {effective.map(([k, v]: any) => <span class="cp-effk">{k}={JSON.stringify(v.value)}{v.target ? `@${v.target}` : ""}</span>)}</div> : null}
    <div class="cp-form">
      <select class="cp-field-pick" value={field} onChange={(e) => setField((e.currentTarget as HTMLSelectElement).value)}>{Object.entries(CONFIG_PATCH_FIELDS).map(([k, d]) => <option value={k}>{d.label}</option>)}</select>
      {def.kind === "bool" ? <select class="cp-value" value={value} onChange={(e) => setValue((e.currentTarget as HTMLSelectElement).value)}><option value="true">true</option><option value="false">false</option></select>
        : def.kind === "enum" ? <select class="cp-value" value={value} onChange={(e) => setValue((e.currentTarget as HTMLSelectElement).value)}>{def.options?.map((o) => <option value={o}>{o}</option>)}</select>
        : <input class="cp-value" type={def.kind === "number" ? "number" : "text"} step="any" value={value} onInput={(e) => setValue((e.currentTarget as HTMLInputElement).value)} placeholder="value" />}
      {def.requiresTarget ? <input class="cp-target" value={target} onInput={(e) => setTarget((e.currentTarget as HTMLInputElement).value)} placeholder="target" /> : null}
      <input class="cp-note" value={note} onInput={(e) => setNote((e.currentTarget as HTMLInputElement).value)} placeholder="note (optional)" />
      <button class="cp-propose" onClick={propose}>propose</button>
    </div>
    <div class="cp-hint">Studio proposes only - apply from the agent path.</div>
    <div class="cp-list">{runPatches.patches?.length ? runPatches.patches.map((p: any) => <div class="cp-row">
      <span class={`cp-state ${PATCH_STATE_CLS[p.state] || ""}`}>{p.state}</span><span class="cp-field">{p.field}{p.target ? ` - ${p.target}` : ""}</span><span class="cp-val">{JSON.stringify(p.value)}</span><code class="cp-id">{p.id}</code>
    </div>) : <div class="inbox-empty">No proposed patches yet.</div>}</div>
  </section>;
}

function RunGraphView({ graph, workspace, runId, annFor, chips, objectButtons, onNode }: {
  graph: RunGraph;
  workspace: string;
  runId: string;
  annFor: (type: string, ref: string) => Annotation | null;
  chips: (type: string, ref: string) => any;
  objectButtons: (type: string, ref: string, label: string) => any;
  onNode: (node: RunGraphNode) => void;
}) {
  const [pan, setPan] = useState({ x: 20, y: 20, scale: 1 });
  const [pos, setPos] = useState<Record<string, Pos>>({});
  const vpRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!graph) return;
    const perLayer: Record<number, number> = {};
    const next: Record<string, Pos> = {};
    for (const n of graph.nodes) {
      if (graph.layout?.[n.id]) next[n.id] = graph.layout[n.id];
      else {
        const row = perLayer[n.layer] || 0;
        next[n.id] = { x: 40 + n.layer * 230, y: 40 + row * 104 };
        perLayer[n.layer] = row + 1;
      }
    }
    setPos(next);
  }, [graph]);
  if (!graph) return <div class="runboard" id="runboard"><div class="placeholder">run graph unavailable</div></div>;
  if (!graph.nodes.length) return <div class="runboard" id="runboard"><div class="placeholder">empty run - no sources, projects, or units yet</div></div>;
  // Spec-graph reuse (#506): FarmPanel renders workflow SPECS through this
  // same canvas with runId="" — no persisted layout there, so save is a no-op.
  const save = (node: string, p: Pos) => { if (!runId) return; void fetch(`/api/runs/${encodeURIComponent(runId)}/canvas/layout`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspace, node, x: Math.round(p.x), y: Math.round(p.y) }) }).catch(() => {}); };
  const drag = (event: MouseEvent, id: string) => {
    event.preventDefault();
    event.stopPropagation();
    const start = pos[id];
    let latest = start;
    const sx = event.clientX, sy = event.clientY;
    const move = (ev: MouseEvent) => {
      latest = { x: start.x + (ev.clientX - sx) / pan.scale, y: start.y + (ev.clientY - sy) / pan.scale };
      setPos((cur) => ({ ...cur, [id]: latest }));
    };
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); save(id, latest); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };
  const edges = graph.edges.map((e) => {
    const a = graph.nodes.find((n) => n.id === e.from), b = graph.nodes.find((n) => n.id === e.to);
    const pa = pos[e.from], pb = pos[e.to];
    if (!a || !b || !pa || !pb) return null;
    const ax = pa.x + graphNodeWidth(a), ay = pa.y + 40, bx = pb.x, by = pb.y + 40, mx = (ax + bx) / 2;
    return <path d={`M ${ax} ${ay} C ${mx} ${ay}, ${mx} ${by}, ${bx} ${by}`} class="cv-edge" />;
  });
  return <div class="runboard" id="runboard">
    <div class="cv-viewport" ref={vpRef}
      onWheel={(e) => {
        e.preventDefault();
        const nextScale = Math.min(2, Math.max(0.25, pan.scale * (e.deltaY < 0 ? 1.1 : 0.9)));
        const rect = vpRef.current!.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        setPan({ x: mx - (mx - pan.x) * (nextScale / pan.scale), y: my - (my - pan.y) * (nextScale / pan.scale), scale: nextScale });
      }}
      onMouseDown={(e) => {
        if ((e.target as Element).closest(".gnode")) return;
        const sx = e.clientX - pan.x, sy = e.clientY - pan.y;
        const move = (ev: MouseEvent) => setPan((cur) => ({ ...cur, x: ev.clientX - sx, y: ev.clientY - sy }));
        const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
        window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
      }}>
      <div class="cv-inner" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${pan.scale})` }}>
        <svg class="cv-edges" width="4000" height="1600">{edges}</svg>
        {graph.nodes.map((n) => <div class={`gnode gt-${n.type} ${GSTATUS[n.status || ""] || ""}`} style={{ left: pos[n.id]?.x || 0, top: pos[n.id]?.y || 0, width: graphNodeWidth(n) }} onClick={() => onNode(n)}>
          <div class="gn-head" onMouseDown={(e) => drag(e as unknown as MouseEvent, n.id)}><span class="gn-type">{n.type}</span><span class="gn-title">{n.label}</span></div>
          {n.detail ? <div class="gn-detail">{n.detail}</div> : null}
          <div class="gn-badges">
            {n.verdict ? <span class={`gb ${GVERDICT[n.verdict] || ""}`}>{n.verdict}</span> : null}
            {n.count != null && n.type === "project" ? <span class="gb">{n.count} files</span> : null}
            {n.cost != null && n.type === "project" ? <span class="gb">{money(n.cost)}</span> : null}
            {n.approvalNeeded ? <span class="gb gb-approve">approve</span> : null}
          </div>
        </div>)}
      </div>
      <div class="cv-hint">drag canvas to pan - scroll to zoom - click a node for details</div>
    </div>
  </div>;
}

function NodeDrawer(props: {
  node: RunGraphNode | null;
  annFor: (type: string, ref: string) => Annotation | null;
  chips: (type: string, ref: string) => any;
  objectButtons: (type: string, ref: string, label: string) => any;
  isSelected: (type: string, ref: string) => boolean;
  toggleSelect: (type: string, ref: string, label: string) => void;
  onClose: () => void;
  onOpenProject: (id: string) => void;
  openModal: (entry: Artifact) => void;
}) {
  const n = props.node;
  if (!n) return null;
  const ref = n.ref || n.id;
  const stats = [
    n.verdict ? ["verdict", n.verdict] : null,
    n.status ? ["status", n.status] : null,
    n.cost != null && n.type === "project" ? ["spent", money(n.cost)] : null,
    n.count != null && n.type === "project" ? ["artifacts", String(n.count)] : null,
  ].filter(Boolean) as string[][];
  return <div class="drawer">
    <div class="dr-head"><span class={`dr-type gt-${n.type}`}>{n.type}</span><span class="dr-title">{n.label}</span><button class="dr-close" aria-label="close" onClick={props.onClose}>x</button></div>
    {n.detail ? <div class="dr-detail">{n.detail}</div> : null}
    {stats.length ? <div class="dr-stats">{stats.map(([k, v]) => <div class="dr-stat"><span>{k}</span><b>{v}</b></div>)}</div> : null}
    <div class="dr-section"><h4>annotations</h4><div class="dr-ann">{props.chips(n.type, ref) || <span class="dr-muted">none</span>} {props.objectButtons(n.type, ref, n.label)}</div></div>
    <div class="dr-actions">
      {n.project ? <button class="dr-btn" onClick={() => props.onOpenProject(n.project!)}>open project board</button> : null}
      {n.project ? <button class="dr-btn" onClick={() => props.openModal({ path: "eval.json", type: "text", name: "eval.json", kind: "text", size: 0, mtime: 0, _proj: n.project })}>view eval.json</button> : null}
      {n.project ? <button class="dr-btn" onClick={() => props.openModal({ path: "logs/generations.jsonl", type: "text", name: "generations.jsonl", kind: "text", size: 0, mtime: 0, _proj: n.project })}>view gen log</button> : null}
      {INBOX_SELECTABLE.has(n.type) ? <button class="dr-btn dr-sel" onClick={() => { props.toggleSelect(n.type, ref, n.label); props.onClose(); }}>{props.isSelected(n.type, ref) ? "selected for inbox" : "select for inbox"}</button> : null}
    </div>
  </div>;
}

function TagEditor({ target, annotation, onClose, onSave }: { target: TagTarget; annotation: Annotation | null; onClose: () => void; onSave: (target: TagTarget, tags: string[], note: string) => Promise<void> }) {
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState("");
  useEffect(() => {
    setTags(annotation?.tags || []);
    setNote(annotation?.note || "");
  }, [target?.type, target?.ref, annotation?.id]);
  if (!target) return null;
  const toggle = (tag: string) => setTags((cur) => cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag]);
  return <div class="tagpop" style={{ top: 74, left: 280 }}>
    <div class="tp-head">{target.type} - <span class="tp-ref">{target.label}</span></div>
    <div class="tp-tags">{ANNOTATION_TAGS.map((t) => <button class={`tp-tag${tags.includes(t) ? " sel" : ""}`} onClick={() => toggle(t)}>{t}</button>)}</div>
    <textarea class="tp-note" rows={2} value={note} placeholder="note (optional)" onInput={(e) => setNote((e.currentTarget as HTMLTextAreaElement).value)} />
    <div class="tp-actions"><button class="tp-clear" onClick={() => void onSave(target, [], "")}>remove</button><button class="tp-save" onClick={() => void onSave(target, tags, note)}>save</button><button class="tp-clear" onClick={onClose}>close</button></div>
  </div>;
}

function SelectionTray(props: {
  selection: Selection[];
  setSelection: (rows: Selection[]) => void;
  sentInbox: string | null;
  setSentInbox: (id: string | null) => void;
  workspace: string;
  project: string;
  runId: string;
  annFor: (type: string, ref: string) => Annotation | null;
}) {
  const [action, setAction] = useState(INBOX_ACTIONS[0]);
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState("");
  if (props.sentInbox) return <div class="seltray"><div class="st-bar st-sent">sent context pack <code>{props.sentInbox}</code></div></div>;
  if (!props.selection.length) return null;
  const send = async () => {
    const selected = props.selection.map((s) => {
      const ann = props.annFor(s.type, s.ref);
      return { type: s.type, ref: s.ref, tags: ann ? ann.tags : [], note: ann?.note };
    });
    const base = props.project ? `/api/projects/${encodeURIComponent(props.project)}/inbox` : `/api/runs/${encodeURIComponent(props.runId)}/inbox`;
    const res = await fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspace: props.workspace, action, selected, note, requestedOutcome: outcome }) }).then((r) => r.json()).catch(() => null);
    if (res?.id) { props.setSelection([]); props.setSentInbox(res.id); window.setTimeout(() => props.setSentInbox(null), 6000); }
  };
  return <div class="seltray">
    <div class="st-bar">
      <span class="st-count">{props.selection.length} selected</span>
      <div class="st-chips">{props.selection.map((s) => <button class="st-chip" onClick={() => props.setSelection(props.selection.filter((x) => selKey(x.type, x.ref) !== selKey(s.type, s.ref)))}>{s.type}:{s.label} x</button>)}</div>
      <select class="st-action" value={action} onChange={(e) => setAction((e.currentTarget as HTMLSelectElement).value)}>{INBOX_ACTIONS.map((a) => <option value={a}>{a}</option>)}</select>
      <input class="st-outcome" value={outcome} onInput={(e) => setOutcome((e.currentTarget as HTMLInputElement).value)} placeholder="requested outcome (optional)" />
      <input class="st-note" value={note} onInput={(e) => setNote((e.currentTarget as HTMLInputElement).value)} placeholder="note (optional)" />
      <button class="st-send" onClick={send}>send to agent</button>
      <button class="st-clear" onClick={() => props.setSelection([])}>clear</button>
    </div>
  </div>;
}

function PreviewModal({ entry, fileUrl, onClose }: { entry: ModalEntry; fileUrl: (path: string, project?: string) => string; onClose: () => void }) {
  const [text, setText] = useState("");
  useEffect(() => {
    setText("");
    if (entry?.type === "text") {
      fetch(fileUrl(entry.path, entry._proj)).then((r) => r.text()).then((body) => setText(body.slice(0, 200_000))).catch(() => setText("(failed to load)"));
    }
  }, [entry?.path, entry?._proj]);
  if (!entry) return null;
  const url = fileUrl(entry.path, entry._proj);
  return <div class="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <button class="close" aria-label="Close" onClick={onClose}>x</button>
    <div class="stage">
      {entry.type === "image" ? <img src={url} alt="" /> : entry.type === "video" ? <video src={url} controls autoplay loop /> : entry.type === "audio" ? <audio src={url} controls autoplay /> : entry.type === "text" ? <pre>{text}</pre> : <pre>(no preview)</pre>}
      <div class="meta"><span class="name">{entry.path}</span><span>{entry.size ? `${(entry.size / 1024).toFixed(0)} KB` : ""}</span><a class="open" href={url} target="_blank" rel="noopener">open raw</a></div>
    </div>
  </div>;
}

render(<StudioApp />, document.getElementById("app")!);

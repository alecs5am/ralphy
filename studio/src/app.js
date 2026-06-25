// Studio UI (#107, #478) — vanilla, no build step. The project view is a
// ComfyUI-style WORKFLOW BOARD: each workflow step is a node on a pan/zoom
// canvas, connected by edges. The anchor-generation node (phase "assets")
// expands to the scene-variant picker — see all scenes + variants and choose the
// active one, in place. The Files tab keeps the flat artifact grid. Hash routing
// (#<ws>/<project>) remembers the selection across reloads.

const $ = (id) => document.getElementById(id);
const els = {
  ws: $("ws"), projects: $("projects"), title: $("title"), count: $("count"),
  views: $("views"), chips: $("chips"), sections: $("sections"), placeholder: $("placeholder"), objTag: $("objTag"),
  board: $("board"), runboard: $("runboard"), runs: $("runs"), runPick: $("runPick"),
  modal: $("modal"), stage: $("stage"), modalClose: $("modalClose"), live: $("live"),
};

const KIND_ORDER = ["images", "videos", "voiceover", "music", "sfx", "captions", "fonts", "refs", "render"];
const GLYPHS = { audio: "♪", text: "¶", other: "·" };
const ST = {
  done:    { glyph: "✓", cls: "st-done" },
  running: { glyph: "◐", cls: "st-running" },
  waiting: { glyph: "▮", cls: "st-waiting" },
  blocked: { glyph: "✕", cls: "st-blocked" },
  queued:  { glyph: "·", cls: "st-queued" },
};

const state = {
  workspace: null,
  project: null,
  view: "board",          // "board" (workflow canvas) | "files"
  artifacts: [],          // flat ArtifactEntry list (Files tab)
  board: null,            // scene variants + saved node layout
  workflow: null,         // workflow steps + status (the canvas nodes)
  nodePos: {},            // working node positions (canvas space)
  expanded: new Set(),    // expanded node ids (assets node opens the anchors)
  filter: null,
  socket: null,
  runId: null,            // selected run id (run dashboard mode) — clears on project pick
  run: null,              // loaded RunSummary for the dashboard
  annotations: [],        // annotation records for the current scope (#488)
  annIndex: {},           // `${type}:${ref}` → latest annotation record
};

// Annotation tag vocabulary (#488) — mirrors studio/server/annotations.ts.
const ANNOTATION_TAGS = ["winner", "reject", "needs-regeneration", "weak-hook", "style-drift", "use-as-reference", "approved", "publish-ready", "template-candidate"];
const annKey = (type, ref) => `${type}:${ref}`;
function indexAnnotations(list) {
  const idx = {};
  // List is newest-first; keep the newest annotation per target key.
  for (const a of list || []) { const k = annKey(a.target.type, a.target.ref); if (!idx[k]) idx[k] = a; }
  state.annotations = list || [];
  state.annIndex = idx;
}

// Run dashboard status dot styling, keyed off scorecard verdict (#427 vocab).
const VERDICT_DOT = {
  ship: { glyph: "✓", cls: "v-ship" },
  repair: { glyph: "◐", cls: "v-repair" },
  "needs-user-decision": { glyph: "?", cls: "v-needs" },
  blocked: { glyph: "✕", cls: "v-blocked" },
};
const RUN_STATUS_CLS = { active: "rs-active", complete: "rs-complete", archived: "rs-archived" };
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Canvas transform (pan/zoom). Not persisted; node positions are.
let cvX = 0, cvY = 0, cvScale = 1;
let _cvInit = false; // pan-to-anchors once per project load

const api = (p) => fetch(p).then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); });
const fileUrl = (path) =>
  `/api/projects/${encodeURIComponent(state.project)}/file?workspace=${encodeURIComponent(state.workspace)}&path=${encodeURIComponent(path)}`;
const boardUrl = () => `/api/projects/${encodeURIComponent(state.project)}/board?workspace=${encodeURIComponent(state.workspace)}`;
const workflowUrl = () => `/api/projects/${encodeURIComponent(state.project)}/workflow?workspace=${encodeURIComponent(state.workspace)}`;
// Annotations (#488): project scope when a project is open, run scope otherwise.
const annScopeUrl = () => state.project
  ? `/api/projects/${encodeURIComponent(state.project)}/annotations?workspace=${encodeURIComponent(state.workspace)}`
  : `/api/runs/${encodeURIComponent(state.runId)}/annotations?workspace=${encodeURIComponent(state.workspace)}`;
const annPostBase = () => state.project
  ? `/api/projects/${encodeURIComponent(state.project)}/annotations`
  : `/api/runs/${encodeURIComponent(state.runId)}/annotations`;

// ── Routing (#<ws>/<project>) ────────────────────────────────────────
let _applyingHash = false;
function writeHash() {
  if (!state.workspace) return;
  const h = `#${encodeURIComponent(state.workspace)}` + (state.project ? `/${encodeURIComponent(state.project)}` : "");
  if (location.hash !== h) { _applyingHash = true; location.hash = h; _applyingHash = false; }
}
async function applyHash() {
  const raw = location.hash.replace(/^#/, "");
  if (!raw) return false;
  const [ws, proj] = raw.split("/").map((s) => { try { return decodeURIComponent(s); } catch { return s; } });
  if (ws && [...els.ws.options].some((o) => o.value === ws)) {
    els.ws.value = ws;
    if (ws !== state.workspace) await selectWorkspace(ws, true);
    if (proj) await selectProject(proj, true);
    return true;
  }
  return false;
}

// ── Boot ─────────────────────────────────────────────────────────────
async function boot() {
  const workspaces = await api("/api/workspaces");
  els.ws.innerHTML = workspaces.map((w) => `<option value="${w.slug}">${w.name} (${w.projects})</option>`).join("");
  els.ws.onchange = () => selectWorkspace(els.ws.value);
  const fromHash = await applyHash();
  if (!fromHash && workspaces.length) await selectWorkspace(workspaces[0].slug);
}
window.addEventListener("hashchange", () => { if (!_applyingHash) applyHash(); });

async function selectWorkspace(slug, fromHash) {
  state.workspace = slug;
  state.project = null;
  state.runId = null; state.run = null;
  state.board = null; state.workflow = null;
  const [projects, runs] = await Promise.all([
    api(`/api/projects?workspace=${encodeURIComponent(slug)}`),
    api(`/api/runs?workspace=${encodeURIComponent(slug)}`).catch(() => []),
  ]);
  els.projects.innerHTML = projects.length
    ? projects.map((p) => `<button class="proj" data-id="${p.id}">${p.id}</button>`).join("")
    : `<div class="empty">no projects</div>`;
  for (const btn of els.projects.querySelectorAll(".proj")) btn.onclick = () => selectProject(btn.dataset.id);
  renderRuns(runs);
  if (!fromHash) writeHash();
  render();
}

// ── Runs (#482) — content-farm campaign dashboard above the project list ──
function renderRuns(runs) {
  els.runPick.hidden = !runs || runs.length === 0;
  if (!runs || runs.length === 0) { els.runs.innerHTML = ""; return; }
  els.runs.innerHTML = runs.map((r) => {
    const cls = RUN_STATUS_CLS[r.status] || "rs-active";
    return `<button class="run ${cls}${r.id === state.runId ? " active" : ""}" data-id="${esc(r.id)}" title="${esc(r.title)}">
      <span class="run-dot"></span><span class="run-name">${esc(r.title)}</span><span class="run-n">${r.projects}</span>
    </button>`;
  }).join("");
  for (const btn of els.runs.querySelectorAll(".run")) btn.onclick = () => selectRun(btn.dataset.id);
}

async function selectRun(runId) {
  state.runId = runId;
  state.project = null;
  const [run, ann] = await Promise.all([
    api(`/api/runs/${encodeURIComponent(runId)}?workspace=${encodeURIComponent(state.workspace)}`).catch(() => null),
    api(`/api/runs/${encodeURIComponent(runId)}/annotations?workspace=${encodeURIComponent(state.workspace)}`).catch(() => ({ annotations: [] })),
  ]);
  state.run = run;
  indexAnnotations(ann.annotations);
  for (const btn of els.runs.querySelectorAll(".run")) btn.classList.toggle("active", btn.dataset.id === runId);
  for (const btn of els.projects.querySelectorAll(".proj")) btn.classList.remove("active");
  if (state.socket) { state.socket.close(); state.socket = null; }
  render();
}

async function selectProject(id, fromHash) {
  state.project = id;
  state.runId = null; state.run = null;
  state.filter = null;
  state.nodePos = {};
  state.expanded = new Set();
  cvX = 0; cvY = 0; cvScale = 1; _cvInit = false;
  for (const btn of els.runs.querySelectorAll(".run")) btn.classList.remove("active");
  for (const btn of els.projects.querySelectorAll(".proj")) btn.classList.toggle("active", btn.dataset.id === id);
  const [artifacts, board, workflow, ann] = await Promise.all([
    api(`/api/projects/${encodeURIComponent(id)}/artifacts?workspace=${encodeURIComponent(state.workspace)}`),
    api(boardUrl()).catch(() => null),
    api(workflowUrl()).catch(() => null),
    api(annScopeUrl()).catch(() => ({ annotations: [] })),
  ]);
  state.artifacts = artifacts;
  state.board = board;
  state.workflow = workflow;
  indexAnnotations(ann.annotations);
  state.view = workflow && workflow.steps && workflow.steps.length ? "board" : "files";
  // Land on the material: open the anchor node by default so variants are
  // visible without a click (the board's job is to review material).
  const assetsStep = workflow && workflow.steps ? workflow.steps.find((s) => s.phase === "assets") : null;
  if (assetsStep) state.expanded.add(assetsStep.id);
  connectWs();
  if (!fromHash) writeHash();
  render();
}

// ── Live watch ───────────────────────────────────────────────────────
function connectWs() {
  if (state.socket) { state.socket.close(); state.socket = null; }
  const url = `ws://${location.host}/ws?workspace=${encodeURIComponent(state.workspace)}&project=${encodeURIComponent(state.project)}`;
  const sock = new WebSocket(url);
  sock.onopen = () => { els.live.textContent = "live"; els.live.classList.add("on"); };
  sock.onclose = () => { els.live.textContent = "offline"; els.live.classList.remove("on"); };
  sock.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    const i = state.artifacts.findIndex((a) => a.path === msg.path);
    if (msg.type === "unlink") { if (i !== -1) state.artifacts.splice(i, 1); }
    else {
      const entry = { path: msg.path, kind: msg.kind, name: msg.name, size: msg.size, mtime: msg.mtime, type: msg.mediaType, fresh: true };
      if (i !== -1) state.artifacts[i] = entry; else state.artifacts.unshift(entry);
    }
    if (state.view === "files") renderFiles();
    // The board does NOT auto-rebuild on file events — a rebuild mid-review would
    // reset pan/zoom/scroll and feels like a random jump. New anchors show on the
    // next explicit action (re-select the project, toggle the node, or reload).
  };
  state.socket = sock;
}

// ── Top-level render dispatch ─────────────────────────────────────────
function render() {
  // Run dashboard mode (#482) — takes precedence over the per-project views.
  if (state.runId) {
    els.placeholder.hidden = true;
    els.board.hidden = true; els.board.innerHTML = "";
    els.sections.hidden = true; els.sections.innerHTML = "";
    els.views.innerHTML = ""; els.chips.innerHTML = "";
    els.runboard.hidden = false;
    els.objTag.innerHTML = "";
    renderRunDashboard();
    return;
  }
  els.runboard.hidden = true; els.runboard.innerHTML = "";
  if (!state.project) {
    els.placeholder.hidden = false; els.placeholder.textContent = "pick a project or run";
    els.board.hidden = true; els.board.innerHTML = "";
    els.sections.hidden = true; els.sections.innerHTML = "";
    els.views.innerHTML = ""; els.chips.innerHTML = ""; els.objTag.innerHTML = "";
    els.title.textContent = "—"; els.count.textContent = "";
    return;
  }
  els.title.textContent = state.project;
  // Project-level tag affordance (#488) in the topbar.
  els.objTag.innerHTML = tagBtnHtml("project", state.project, state.project) + tagChipsHtml("project", state.project);
  wireTagButtons(els.objTag);
  renderViews();
  const showBoard = state.view === "board";
  els.board.hidden = !showBoard;
  els.sections.hidden = showBoard;
  els.chips.style.display = showBoard ? "none" : "";
  els.placeholder.hidden = true;
  if (showBoard) {
    const n = state.workflow && state.workflow.steps ? state.workflow.steps.length : 0;
    els.count.textContent = `${n} node${n === 1 ? "" : "s"}`;
    renderCanvas();
  } else {
    els.count.textContent = `${state.artifacts.length} files`;
    renderFiles();
  }
}

// ── Run dashboard (#482) — read-only operator board + approval inbox ──────
function renderRunDashboard() {
  const r = state.run;
  if (!r) {
    els.title.textContent = state.runId;
    els.count.textContent = "";
    els.runboard.innerHTML = `<div class="placeholder">run not found — it may have been removed</div>`;
    return;
  }
  els.title.textContent = r.title;
  els.count.textContent = `run · ${r.projectCount} project${r.projectCount === 1 ? "" : "s"}`;
  const b = r.budget;
  const money = (n) => (n == null ? "—" : `$${Number(n).toFixed(2)}`);
  const pct = b.capUsd && b.capUsd > 0 ? Math.min(100, Math.round((b.spentUsd / b.capUsd) * 100)) : null;

  // Approval inbox: blockers first (hard), then awaiting decisions.
  const inboxItems = [
    ...r.blockers.map((x) => ({ kind: "block", project: x.project, detail: x.detail })),
    ...r.awaitingApprovals.map((x) => ({ kind: "wait", project: x.project, detail: x.detail })),
  ];
  const inbox = inboxItems.length
    ? inboxItems.map((x) => `
        <div class="inbox-item ${x.kind === "block" ? "ib-block" : "ib-wait"}">
          <span class="ib-glyph">${x.kind === "block" ? "✕" : "▮"}</span>
          <div class="ib-body">
            <div class="ib-detail">${esc(x.detail)}</div>
            ${x.project ? `<button class="ib-link" data-proj="${esc(x.project)}">open ${esc(x.project)} board →</button>` : ""}
          </div>
        </div>`).join("")
    : `<div class="inbox-empty">Nothing needs you — no blockers or pending approvals.</div>`;

  // Quality roll-up: a verdict chip + board link per member project.
  const verdictByProj = new Map(r.quality.map((q) => [q.project, q.verdict]));
  const phaseByProj = new Map(r.progress.byProject.map((p) => [p.project, p.phase]));
  const spendByProj = new Map(b.byProject.map((p) => [p.project, p.spentUsd]));
  const unitsByProj = new Map(r.units.byProject.map((u) => [u.project, u.slugs]));
  const resolvedProjects = r.progress.byProject.map((p) => p.project);
  const qualityRows = resolvedProjects.length
    ? resolvedProjects.map((pid) => {
        const v = verdictByProj.get(pid) ?? null;
        const dot = (v && VERDICT_DOT[v]) || { glyph: "·", cls: "v-na" };
        const slugs = unitsByProj.get(pid) ?? [];
        return `<button class="qrow" data-proj="${esc(pid)}">
          <span class="qdot ${dot.cls}">${dot.glyph}</span>
          <span class="qname">${esc(pid)}</span>
          <span class="qphase">${esc(phaseByProj.get(pid) ?? "—")}</span>
          <span class="qverdict">${esc(v ?? "na")}</span>
          <span class="qspend">${money(spendByProj.get(pid) ?? 0)}</span>
          <span class="qunits">${slugs.length ? `${slugs.length} unit${slugs.length === 1 ? "" : "s"}` : "—"}</span>
        </button>`;
      }).join("")
    : `<div class="inbox-empty">No resolved member projects.</div>`;

  const missing = r.missingProjects.length
    ? `<div class="run-warn">⚠ ${r.missingProjects.length} member project(s) do not resolve on disk: ${esc(r.missingProjects.join(", "))}</div>`
    : "";

  els.runboard.innerHTML = `
    <div class="run-head">
      <span class="run-status ${RUN_STATUS_CLS[r.status] || "rs-active"}">${esc(r.status)}</span>
      <span class="obj-tag run-objtag">${tagBtnHtml("run", state.runId, r.title)}${tagChipsHtml("run", state.runId)}</span>
      ${r.brief ? `<p class="run-brief">${esc(r.brief)}</p>` : ""}
      <div class="run-next">${esc(r.nextAction)}</div>
    </div>
    ${missing}
    <div class="run-stats">
      <div class="stat"><span class="stat-k">phase</span><span class="stat-v">${esc(r.progress.phase ?? "—")}</span></div>
      <div class="stat"><span class="stat-k">spent</span><span class="stat-v">${money(b.spentUsd)}${b.capUsd != null ? ` / ${money(b.capUsd)}` : ""}</span></div>
      <div class="stat"><span class="stat-k">winners</span><span class="stat-v">${r.winners.length}/${resolvedProjects.length}</span></div>
      <div class="stat ${r.failures.length ? "stat-bad" : ""}"><span class="stat-k">failed</span><span class="stat-v">${r.failures.length}</span></div>
      <div class="stat"><span class="stat-k">units</span><span class="stat-v">${r.units.count}</span></div>
    </div>
    ${pct != null ? `<div class="budget-bar ${b.overBudget ? "over" : ""}"><div class="budget-fill" style="width:${pct}%"></div><span class="budget-cap">${pct}% of ${money(b.capUsd)}${b.expired ? " · approval expired" : ""}</span></div>` : ""}
    <section class="run-card">
      <h2 class="run-card-head">Approval inbox<span class="n">${inboxItems.length}</span></h2>
      <div class="inbox">${inbox}</div>
    </section>
    <section class="run-card">
      <h2 class="run-card-head">Projects<span class="n">${resolvedProjects.length}</span></h2>
      <div class="qhead"><span></span><span>project</span><span>phase</span><span>verdict</span><span>spent</span><span>units</span></div>
      <div class="qtable">${qualityRows}</div>
    </section>`;

  for (const el of els.runboard.querySelectorAll("[data-proj]")) {
    el.onclick = () => selectProject(el.dataset.proj);
  }
  wireTagButtons(els.runboard);
}

function renderViews() {
  const hasBoard = !!(state.workflow && state.workflow.steps && state.workflow.steps.length);
  els.views.innerHTML = ["board", "files"]
    .map((v) => `<button class="vtab ${state.view === v ? "active" : ""}" data-v="${v}"${v === "board" && !hasBoard ? " disabled" : ""}>${v}</button>`)
    .join("");
  for (const t of els.views.querySelectorAll(".vtab")) {
    t.onclick = () => { if (t.hasAttribute("disabled")) return; state.view = t.dataset.v; render(); };
  }
}

// ── Workflow canvas (#478) ────────────────────────────────────────────
function applyTransform() {
  const inner = $("cvInner");
  if (inner) inner.style.transform = `translate(${cvX}px, ${cvY}px) scale(${cvScale})`;
}

function vtile(v, sceneId) {
  return `
    <div class="vtile ${v.chosen ? "chosen" : ""}"${sceneId ? ` data-scene="${sceneId}"` : ""} data-path="${v.path}" title="${v.name}">
      <img loading="lazy" src="${fileUrl(v.path)}" alt="" />
      ${versionBadge(v.name)}
      ${v.chosen ? '<span class="chosen-badge">✓</span>' : ""}
      ${tagBtnHtml("artifact", v.path, v.name)}
      ${tagChipsHtml("artifact", v.path) ? `<span class="vtags">${tagChipsHtml("artifact", v.path)}</span>` : ""}
      <button class="zoom" data-zoom="${v.path}" title="preview" aria-label="preview">⤢</button>
      <div class="vcap">${v.name}</div>
    </div>`;
}

function anchorsHtml() {
  const b = state.board;
  if (!b || !b.scenes.length) return `<div class="cv-empty">no anchors yet — generate <code>scene-NN-…</code> images</div>`;
  const scenes = b.scenes.map((s) => `
    <div class="scene">
      <div class="scene-head"><span class="sid">${s.id}</span><span class="slabel">${s.label}</span><span class="sn">${s.variants.length}</span></div>
      <div class="vrow">${s.variants.map((v) => vtile(v, s.id)).join("")}</div>
    </div>`).join("");
  const other = b.other.length
    ? `<div class="scene other"><div class="scene-head"><span class="sid">props / fx</span><span class="sn">${b.other.length}</span></div><div class="vrow">${b.other.map((v) => vtile(v, null)).join("")}</div></div>`
    : "";
  return scenes + other;
}

function nodeHtml(s) {
  const st = ST[s.status] || ST.queued;
  const meta = `${s.phase} · ${s.engine}${s.model ? " · " + s.model : ""}${s.variants > 1 ? " · ×" + s.variants : ""}`;
  const gate = s.gate.map((g) => `<span class="gate">${g}</span>`).join("");
  const verdict = s.gateVerdict ? `<span class="verdict v-${s.gateVerdict}">${s.gateVerdict}</span>` : "";
  const isAssets = s.phase === "assets";
  const expanded = state.expanded.has(s.id);
  let body = `
    <div class="cv-meta">${meta}</div>
    <div class="cv-tags">${gate}${verdict}<span class="mode mode-${s.mode}">${s.mode}</span>${tagBtnHtml("workflow_node", s.id, s.label)}</div>
    ${tagChipsHtml("workflow_node", s.id) ? `<div class="cv-atags">${tagChipsHtml("workflow_node", s.id)}</div>` : ""}`;
  if (isAssets) {
    const b = state.board;
    const nScenes = b ? b.scenes.length : 0;
    const nChosen = b ? b.scenes.filter((x) => x.chosen).length : 0;
    body += `<button class="cv-expand" data-id="${s.id}">${expanded ? "▾" : "▸"} anchors — ${nScenes} scene${nScenes === 1 ? "" : "s"}${nChosen ? ` · ${nChosen} chosen` : ""}</button>`;
    if (expanded) body += `<div class="cv-anchors">${anchorsHtml()}</div>`;
  }
  return `
    <div class="cv-node ${st.cls}${isAssets ? " assets" : ""}${expanded ? " expanded" : ""}${s.id === (state.workflow.currentStep) ? " current" : ""}" data-id="${s.id}">
      <div class="cv-head"><span class="dot" aria-hidden="true">${st.glyph}</span><span class="cv-title">${s.label}</span></div>
      ${body}
    </div>`;
}

const NODE_GAP = 56, W_COLLAPSED = 248, W_ASSETS = 520;
function nodeWidth(s) { return s.phase === "assets" && state.expanded.has(s.id) ? W_ASSETS : W_COLLAPSED; }

// Left-to-right flow layout: each node sits after the previous one (accounting
// for an expanded anchor node's extra width) so auto-placed nodes never overlap.
// A node the user dragged (saved in board.layout) keeps its own position.
function layoutNodes() {
  const saved = (state.board && state.board.layout) || {};
  let x = 60;
  for (const s of state.workflow.steps) {
    state.nodePos[s.id] = saved[s.id] ? { x: saved[s.id].x, y: saved[s.id].y } : { x, y: 90 };
    x += nodeWidth(s) + NODE_GAP;
  }
}

function renderCanvas() {
  const wf = state.workflow;
  if (!wf || !wf.steps || !wf.steps.length) {
    els.board.innerHTML = `<div class="placeholder">no workflow — scaffold one with <code>ralphy workflow init &lt;ws&gt;</code></div>`;
    return;
  }
  layoutNodes();
  if (!_cvInit) {
    const a = wf.steps.find((s) => s.phase === "assets");
    if (a && state.nodePos[a.id]) { cvX = -(state.nodePos[a.id].x - 60); cvY = -(state.nodePos[a.id].y - 24); }
    _cvInit = true;
  }

  els.board.innerHTML = `<div class="cv-viewport" id="cvVp"><div class="cv-inner" id="cvInner"><svg class="cv-edges" id="cvEdges"></svg>${wf.steps.map(nodeHtml).join("")}</div><div class="cv-hint">drag canvas to pan · scroll to zoom · drag a node to arrange</div></div>`;

  const inner = $("cvInner");
  for (const s of wf.steps) {
    const el = inner.querySelector(`.cv-node[data-id="${s.id}"]`);
    const p = state.nodePos[s.id];
    el.style.left = p.x + "px"; el.style.top = p.y + "px";
  }
  applyTransform();
  drawEdges();
  wireCanvas();
  wireNodes();
}

function drawEdges() {
  const inner = $("cvInner"); const svg = $("cvEdges");
  if (!inner || !svg) return;
  const steps = state.workflow.steps;
  let maxX = 0, maxY = 0, lines = "";
  for (const s of steps) {
    const el = inner.querySelector(`.cv-node[data-id="${s.id}"]`); const p = state.nodePos[s.id];
    if (el) { maxX = Math.max(maxX, p.x + el.offsetWidth); maxY = Math.max(maxY, p.y + el.offsetHeight); }
  }
  svg.setAttribute("width", maxX + 200); svg.setAttribute("height", maxY + 200);
  for (let i = 0; i < steps.length - 1; i++) {
    const a = inner.querySelector(`.cv-node[data-id="${steps[i].id}"]`);
    const pa = state.nodePos[steps[i].id], pb = state.nodePos[steps[i + 1].id];
    const ax = pa.x + (a ? a.offsetWidth : 240), ay = pa.y + 34;
    const bx = pb.x, by = pb.y + 34;
    const mx = (ax + bx) / 2;
    lines += `<path d="M ${ax} ${ay} C ${mx} ${ay}, ${mx} ${by}, ${bx} ${by}" class="cv-edge" />`;
  }
  svg.innerHTML = lines;
}

function wireCanvas() {
  const vp = $("cvVp");
  vp.onwheel = (e) => {
    // Don't hijack scroll happening inside a node's scrollable content (the
    // anchor list / variant rows) — that was the "random zoom-out".
    if (e.target.closest(".cv-anchors")) return;
    e.preventDefault();
    const next = Math.min(2, Math.max(0.3, cvScale * (e.deltaY < 0 ? 1.1 : 0.9)));
    if (next === cvScale) return;
    // Zoom toward the cursor: keep the content point under the pointer fixed.
    const rect = vp.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    cvX = mx - (mx - cvX) * (next / cvScale);
    cvY = my - (my - cvY) * (next / cvScale);
    cvScale = next;
    applyTransform();
  };
  vp.onmousedown = (e) => {
    if (e.target.closest(".cv-node")) return;
    const sx = e.clientX - cvX, sy = e.clientY - cvY;
    const mv = (ev) => { cvX = ev.clientX - sx; cvY = ev.clientY - sy; applyTransform(); };
    const up = () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
  };
}

let _layoutTimer = null;
function saveLayout(node, x, y) {
  clearTimeout(_layoutTimer);
  _layoutTimer = setTimeout(() => {
    fetch(`/api/projects/${encodeURIComponent(state.project)}/board/layout`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspace: state.workspace, node, x: Math.round(x), y: Math.round(y) }),
    }).catch(() => {});
  }, 300);
}

function wireNodes() {
  const inner = $("cvInner");
  for (const el of inner.querySelectorAll(".cv-node")) {
    const id = el.dataset.id;
    el.querySelector(".cv-head").onmousedown = (e) => {
      e.stopPropagation(); e.preventDefault(); // preventDefault stops text selection
      const p = state.nodePos[id]; const sx = e.clientX, sy = e.clientY; const ox = p.x, oy = p.y;
      el.classList.add("dragging");
      const mv = (ev) => { p.x = ox + (ev.clientX - sx) / cvScale; p.y = oy + (ev.clientY - sy) / cvScale; el.style.left = p.x + "px"; el.style.top = p.y + "px"; drawEdges(); };
      const up = () => {
        window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up);
        el.classList.remove("dragging");
        // Pin locally so a later re-render (expand/choose) keeps this position,
        // then persist (debounced) to board.json.
        if (state.board) { state.board.layout = state.board.layout || {}; state.board.layout[id] = { x: Math.round(p.x), y: Math.round(p.y) }; }
        saveLayout(id, p.x, p.y);
      };
      window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    };
  }
  for (const t of inner.querySelectorAll(".cv-expand")) {
    t.onclick = (e) => { e.stopPropagation(); const id = t.dataset.id; state.expanded.has(id) ? state.expanded.delete(id) : state.expanded.add(id); renderCanvas(); };
  }
  for (const z of inner.querySelectorAll(".zoom")) {
    z.onclick = (e) => { e.stopPropagation(); openModal({ path: z.dataset.zoom, type: "image", name: z.dataset.zoom.split("/").pop() }); };
  }
  for (const v of inner.querySelectorAll(".vtile[data-scene]")) {
    v.onclick = (e) => { e.stopPropagation(); chooseVariant(v.dataset.scene, v.dataset.path); };
  }
  for (const v of inner.querySelectorAll(".scene.other .vtile")) {
    v.onclick = (e) => { e.stopPropagation(); openModal({ path: v.dataset.path, type: "image", name: v.dataset.path.split("/").pop() }); };
  }
  wireTagButtons(inner);
}

async function chooseVariant(scene, path) {
  try {
    const b = await fetch(`/api/projects/${encodeURIComponent(state.project)}/board/choose`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspace: state.workspace, scene, path }),
    }).then((r) => r.json());
    if (b && b.scenes) state.board = b;
  } catch { /* keep prior */ }
  renderCanvas();
}

// ── Files tab (flat artifact grid) ────────────────────────────────────
function groupByKind(list) {
  const groups = new Map();
  for (const a of list) { if (!groups.has(a.kind)) groups.set(a.kind, []); groups.get(a.kind).push(a); }
  const keys = [...groups.keys()].sort((a, b) => {
    const ia = KIND_ORDER.indexOf(a), ib = KIND_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
  });
  return keys.map((k) => [k, groups.get(k)]);
}

function versionBadge(name) {
  const m = name.match(/\.(v\d+)\./);
  return m ? `<span class="badge v">${m[1]}</span>` : "";
}

function tileMedia(a) {
  if (a.type === "image") return `<img loading="lazy" src="${fileUrl(a.path)}" alt="" />`;
  if (a.type === "video") return `<video preload="metadata" muted src="${fileUrl(a.path)}"></video>`;
  return `<div class="glyph">${GLYPHS[a.type] ?? GLYPHS.other}</div>`;
}

function renderFiles() {
  const groups = groupByKind(state.artifacts);
  els.chips.innerHTML = [
    `<button class="chip ${state.filter === null ? "active" : ""}" data-k="">all</button>`,
    ...groups.map(([k, items]) => `<button class="chip ${state.filter === k ? "active" : ""}" data-k="${k}">${k}<span class="n">${items.length}</span></button>`),
  ].join("");
  for (const chip of els.chips.querySelectorAll(".chip")) chip.onclick = () => { state.filter = chip.dataset.k || null; renderFiles(); };

  const visible = state.filter ? groups.filter(([k]) => k === state.filter) : groups;
  els.placeholder.hidden = visible.length > 0;
  if (!visible.length) els.placeholder.textContent = "no artifacts yet — they appear live as ralphy generates";

  els.sections.innerHTML = visible.map(([kind, items]) => `
    <section class="kind-section">
      <h2 class="kind-head">${kind}<span class="n">${items.length}</span></h2>
      <div class="grid">
        ${items.map((a) => `
          <div class="tile ${a.fresh ? "fresh" : ""}" data-path="${a.path}" title="${a.path}">
            ${tileMedia(a)}${versionBadge(a.name)}${tagBtnHtml("artifact", a.path, a.name)}${tagChipsHtml("artifact", a.path) ? `<span class="tile-atags">${tagChipsHtml("artifact", a.path)}</span>` : ""}<div class="cap">${a.name}</div>
          </div>`).join("")}
      </div>
    </section>`).join("");
  for (const a of state.artifacts) a.fresh = false;
  for (const tile of els.sections.querySelectorAll(".tile")) {
    tile.onclick = () => { const entry = state.artifacts.find((x) => x.path === tile.dataset.path); if (entry) openModal(entry); };
  }
  wireTagButtons(els.sections);
}

// ── Object annotations (#488) — tag chips + a tag popover ─────────────
// Read-only display of an object's tags, plus a 🏷 button that opens a popover
// to set the controlled-vocab tags + a free note. Writes go to the append-only
// annotations.jsonl via the annotations API (metadata only, never media).
function annFor(type, ref) { return state.annIndex[annKey(type, ref)] || null; }

function tagChipsHtml(type, ref) {
  const a = annFor(type, ref);
  if (!a || (!a.tags.length && !a.note)) return "";
  const chips = a.tags.map((t) => `<span class="atag at-${t}">${t}</span>`).join("");
  return `<span class="atags" title="${esc(a.note || "")}">${chips}${a.note ? '<span class="anote">✎</span>' : ""}</span>`;
}

function tagBtnHtml(type, ref, label) {
  const on = annFor(type, ref) ? " on" : "";
  return `<button class="tagbtn${on}" data-atype="${esc(type)}" data-aref="${esc(ref)}" data-alabel="${esc(label || ref)}" title="tag this ${type}" aria-label="tag">🏷</button>`;
}

function wireTagButtons(container) {
  for (const b of container.querySelectorAll(".tagbtn")) {
    b.onclick = (e) => {
      e.stopPropagation(); e.preventDefault();
      openTagPopover(b, { type: b.dataset.atype, ref: b.dataset.aref, label: b.dataset.alabel });
    };
  }
}

let _pop = null;
function closeTagPopover() { if (_pop) { _pop.remove(); _pop = null; document.removeEventListener("mousedown", _popOutside, true); } }
function _popOutside(e) { if (_pop && !_pop.contains(e.target) && !e.target.classList.contains("tagbtn")) closeTagPopover(); }

function openTagPopover(anchor, target) {
  closeTagPopover();
  const cur = annFor(target.type, target.ref);
  const selected = new Set(cur ? cur.tags : []);
  const pop = document.createElement("div");
  pop.className = "tagpop";
  pop.innerHTML = `
    <div class="tp-head">${esc(target.type)} · <span class="tp-ref">${esc(target.label)}</span></div>
    <div class="tp-tags">${ANNOTATION_TAGS.map((t) => `<button class="tp-tag${selected.has(t) ? " sel" : ""}" data-t="${t}">${t}</button>`).join("")}</div>
    <textarea class="tp-note" placeholder="note (optional)" rows="2">${esc(cur ? cur.note : "")}</textarea>
    <div class="tp-actions">
      ${cur ? '<button class="tp-clear">remove</button>' : "<span></span>"}
      <button class="tp-save">save</button>
    </div>`;
  document.body.appendChild(pop);
  // Position under the anchor, clamped to the viewport.
  const r = anchor.getBoundingClientRect();
  pop.style.top = `${Math.min(window.innerHeight - pop.offsetHeight - 12, r.bottom + 6)}px`;
  pop.style.left = `${Math.min(window.innerWidth - pop.offsetWidth - 12, r.left)}px`;
  _pop = pop;
  setTimeout(() => document.addEventListener("mousedown", _popOutside, true), 0);

  for (const t of pop.querySelectorAll(".tp-tag")) {
    t.onclick = () => { const k = t.dataset.t; selected.has(k) ? selected.delete(k) : selected.add(k); t.classList.toggle("sel"); };
  }
  const saveBtn = pop.querySelector(".tp-save");
  saveBtn.onclick = async () => {
    saveBtn.disabled = true;
    await saveAnnotation(target.type, target.ref, [...selected], pop.querySelector(".tp-note").value.trim());
    closeTagPopover();
  };
  const clear = pop.querySelector(".tp-clear");
  if (clear) clear.onclick = async () => { await removeAnnotationFor(target.type, target.ref); closeTagPopover(); };
}

// Replace-on-save: drop the prior annotation for this target (if any), then add
// the new one. Both go through the append-only API (the server tombstones).
async function saveAnnotation(type, ref, tags, note) {
  if (!tags.length && !note) { await removeAnnotationFor(type, ref); return; }
  const prior = annFor(type, ref);
  try {
    if (prior) await fetch(`${annPostBase()}/remove`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspace: state.workspace, id: prior.id }) });
    await fetch(annPostBase(), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspace: state.workspace, target: { type, ref }, tags, note }) });
  } catch { /* keep prior on failure */ }
  await reloadAnnotations();
}

async function removeAnnotationFor(type, ref) {
  const prior = annFor(type, ref);
  if (!prior) return;
  try { await fetch(`${annPostBase()}/remove`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspace: state.workspace, id: prior.id }) }); } catch { /* noop */ }
  await reloadAnnotations();
}

async function reloadAnnotations() {
  try { const ann = await api(annScopeUrl()); indexAnnotations(ann.annotations); } catch { /* keep */ }
  // Re-render the active surface so chips refresh.
  if (state.runId) renderRunDashboard();
  else if (state.view === "board") renderCanvas();
  else renderFiles();
}

// ── Modal preview ────────────────────────────────────────────────────
async function openModal(a) {
  const url = fileUrl(a.path);
  let media;
  if (a.type === "image") media = `<img src="${url}" alt="" />`;
  else if (a.type === "video") media = `<video src="${url}" controls autoplay loop></video>`;
  else if (a.type === "audio") media = `<audio src="${url}" controls autoplay></audio>`;
  else if (a.type === "text") {
    const body = await fetch(url).then((r) => r.text()).catch(() => "(failed to load)");
    media = `<pre>${body.slice(0, 200_000).replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`;
  } else media = `<pre>(no preview)</pre>`;
  const kb = a.size != null ? `${(a.size / 1024).toFixed(0)} KB` : "";
  els.stage.innerHTML = `${media}
    <div class="meta"><span class="name">${a.path}</span><span>${kb}</span>
      <a class="open" href="${url}" target="_blank" rel="noopener">open raw ↗</a></div>`;
  els.modal.hidden = false;
}
function closeModal() { els.modal.hidden = true; els.stage.innerHTML = ""; }
els.modalClose.onclick = closeModal;
els.modal.onclick = (e) => { if (e.target === els.modal) closeModal(); };
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

boot().catch((e) => { els.placeholder.textContent = `failed to load: ${e.message}`; });

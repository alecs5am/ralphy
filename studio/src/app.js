// Studio UI (#107, #478) — vanilla, no build step. The project view is a
// ComfyUI-style WORKFLOW BOARD: each workflow step is a node on a pan/zoom
// canvas, connected by edges. The anchor-generation node (phase "assets")
// expands to the scene-variant picker — see all scenes + variants and choose the
// active one, in place. The Files tab keeps the flat artifact grid. Hash routing
// (#<ws>/<project>) remembers the selection across reloads.

const $ = (id) => document.getElementById(id);
const els = {
  ws: $("ws"), projects: $("projects"), title: $("title"), count: $("count"),
  views: $("views"), chips: $("chips"), sections: $("sections"), placeholder: $("placeholder"),
  board: $("board"),
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
};

// Canvas transform (pan/zoom). Not persisted; node positions are.
let cvX = 0, cvY = 0, cvScale = 1;
let _cvInit = false; // pan-to-anchors once per project load

const api = (p) => fetch(p).then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); });
const fileUrl = (path) =>
  `/api/projects/${encodeURIComponent(state.project)}/file?workspace=${encodeURIComponent(state.workspace)}&path=${encodeURIComponent(path)}`;
const boardUrl = () => `/api/projects/${encodeURIComponent(state.project)}/board?workspace=${encodeURIComponent(state.workspace)}`;
const workflowUrl = () => `/api/projects/${encodeURIComponent(state.project)}/workflow?workspace=${encodeURIComponent(state.workspace)}`;

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
  state.board = null; state.workflow = null;
  const projects = await api(`/api/projects?workspace=${encodeURIComponent(slug)}`);
  els.projects.innerHTML = projects.length
    ? projects.map((p) => `<button class="proj" data-id="${p.id}">${p.id}</button>`).join("")
    : `<div class="empty">no projects</div>`;
  for (const btn of els.projects.querySelectorAll(".proj")) btn.onclick = () => selectProject(btn.dataset.id);
  if (!fromHash) writeHash();
  render();
}

async function selectProject(id, fromHash) {
  state.project = id;
  state.filter = null;
  state.nodePos = {};
  state.expanded = new Set();
  cvX = 0; cvY = 0; cvScale = 1; _cvInit = false;
  for (const btn of els.projects.querySelectorAll(".proj")) btn.classList.toggle("active", btn.dataset.id === id);
  const [artifacts, board, workflow] = await Promise.all([
    api(`/api/projects/${encodeURIComponent(id)}/artifacts?workspace=${encodeURIComponent(state.workspace)}`),
    api(boardUrl()).catch(() => null),
    api(workflowUrl()).catch(() => null),
  ]);
  state.artifacts = artifacts;
  state.board = board;
  state.workflow = workflow;
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
  if (!state.project) {
    els.placeholder.hidden = false; els.placeholder.textContent = "pick a project";
    els.board.hidden = true; els.board.innerHTML = "";
    els.sections.hidden = true; els.sections.innerHTML = "";
    els.views.innerHTML = ""; els.chips.innerHTML = "";
    els.title.textContent = "—"; els.count.textContent = "";
    return;
  }
  els.title.textContent = state.project;
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
    <div class="cv-tags">${gate}${verdict}<span class="mode mode-${s.mode}">${s.mode}</span></div>`;
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
            ${tileMedia(a)}${versionBadge(a.name)}<div class="cap">${a.name}</div>
          </div>`).join("")}
      </div>
    </section>`).join("");
  for (const a of state.artifacts) a.fresh = false;
  for (const tile of els.sections.querySelectorAll(".tile")) {
    tile.onclick = () => { const entry = state.artifacts.find((x) => x.path === tile.dataset.path); if (entry) openModal(entry); };
  }
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

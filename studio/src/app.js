// Studio UI (#107) — vanilla, no build step. State: one workspace, one
// project, a flat artifact list re-grouped by kind, one WS subscription.

const $ = (id) => document.getElementById(id);
const els = {
  ws: $("ws"), projects: $("projects"), title: $("title"), count: $("count"),
  chips: $("chips"), sections: $("sections"), placeholder: $("placeholder"),
  modal: $("modal"), stage: $("stage"), modalClose: $("modalClose"), live: $("live"),
};

const KIND_ORDER = ["images", "videos", "voiceover", "music", "sfx", "captions", "fonts", "refs", "render"];
const GLYPHS = { audio: "♪", text: "¶", other: "·" };

const state = {
  workspace: null,
  project: null,
  artifacts: [],          // flat ArtifactEntry list
  filter: null,           // active kind chip or null = all
  socket: null,
};

const api = (p) => fetch(p).then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); });
const fileUrl = (path) =>
  `/api/projects/${encodeURIComponent(state.project)}/file?workspace=${encodeURIComponent(state.workspace)}&path=${encodeURIComponent(path)}`;

// ── Boot ─────────────────────────────────────────────────────────────
async function boot() {
  const workspaces = await api("/api/workspaces");
  els.ws.innerHTML = workspaces
    .map((w) => `<option value="${w.slug}">${w.name} (${w.projects})</option>`)
    .join("");
  els.ws.onchange = () => selectWorkspace(els.ws.value);
  if (workspaces.length) await selectWorkspace(workspaces[0].slug);
}

async function selectWorkspace(slug) {
  state.workspace = slug;
  state.project = null;
  const projects = await api(`/api/projects?workspace=${encodeURIComponent(slug)}`);
  els.projects.innerHTML = projects.length
    ? projects.map((p) => `<button class="proj" data-id="${p.id}">${p.id}</button>`).join("")
    : `<div class="empty">no projects</div>`;
  for (const btn of els.projects.querySelectorAll(".proj")) {
    btn.onclick = () => selectProject(btn.dataset.id);
  }
  renderGrid();
}

async function selectProject(id) {
  state.project = id;
  state.filter = null;
  for (const btn of els.projects.querySelectorAll(".proj")) {
    btn.classList.toggle("active", btn.dataset.id === id);
  }
  state.artifacts = await api(
    `/api/projects/${encodeURIComponent(id)}/artifacts?workspace=${encodeURIComponent(state.workspace)}`,
  );
  connectWs();
  renderGrid();
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
    if (msg.type === "unlink") {
      if (i !== -1) state.artifacts.splice(i, 1);
    } else {
      const entry = { path: msg.path, kind: msg.kind, name: msg.name, size: msg.size, mtime: msg.mtime, type: msg.mediaType, fresh: true };
      if (i !== -1) state.artifacts[i] = entry;
      else state.artifacts.unshift(entry);
    }
    renderGrid();
  };
  state.socket = sock;
}

// ── Render ───────────────────────────────────────────────────────────
function groupByKind(list) {
  const groups = new Map();
  for (const a of list) {
    if (!groups.has(a.kind)) groups.set(a.kind, []);
    groups.get(a.kind).push(a);
  }
  const keys = [...groups.keys()].sort((a, b) => {
    const ia = KIND_ORDER.indexOf(a), ib = KIND_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
  });
  return keys.map((k) => [k, groups.get(k)]);
}

function versionBadge(name) {
  const m = name.match(/\.v(\d+)\./);
  return m ? `<span class="badge v">v${m[1]}</span>` : "";
}

function tileMedia(a) {
  if (a.type === "image") return `<img loading="lazy" src="${fileUrl(a.path)}" alt="" />`;
  if (a.type === "video") return `<video preload="metadata" muted src="${fileUrl(a.path)}"></video>`;
  return `<div class="glyph">${GLYPHS[a.type] ?? GLYPHS.other}</div>`;
}

function renderGrid() {
  if (!state.project) {
    els.placeholder.hidden = false;
    els.placeholder.textContent = "pick a project";
    els.sections.innerHTML = "";
    els.title.textContent = "—";
    els.count.textContent = "";
    els.chips.innerHTML = "";
    return;
  }
  els.title.textContent = state.project;
  els.count.textContent = `${state.artifacts.length} files`;

  const groups = groupByKind(state.artifacts);
  els.chips.innerHTML = [
    `<button class="chip ${state.filter === null ? "active" : ""}" data-k="">all</button>`,
    ...groups.map(([k, items]) =>
      `<button class="chip ${state.filter === k ? "active" : ""}" data-k="${k}">${k}<span class="n">${items.length}</span></button>`),
  ].join("");
  for (const chip of els.chips.querySelectorAll(".chip")) {
    chip.onclick = () => { state.filter = chip.dataset.k || null; renderGrid(); };
  }

  const visible = state.filter ? groups.filter(([k]) => k === state.filter) : groups;
  els.placeholder.hidden = visible.length > 0;
  if (!visible.length) els.placeholder.textContent = "no artifacts yet — they appear live as ralphy generates";

  els.sections.innerHTML = visible
    .map(([kind, items]) => `
      <section class="kind-section">
        <h2 class="kind-head">${kind}<span class="n">${items.length}</span></h2>
        <div class="grid">
          ${items.map((a) => `
            <div class="tile ${a.fresh ? "fresh" : ""}" data-path="${a.path}" title="${a.path}">
              ${tileMedia(a)}
              ${versionBadge(a.name)}
              <div class="cap">${a.name}</div>
            </div>`).join("")}
        </div>
      </section>`)
    .join("");
  for (const a of state.artifacts) a.fresh = false;

  for (const tile of els.sections.querySelectorAll(".tile")) {
    tile.onclick = () => {
      const entry = state.artifacts.find((x) => x.path === tile.dataset.path);
      if (entry) openModal(entry);
    };
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
    const esc = body.slice(0, 200_000).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    media = `<pre>${esc}</pre>`;
  } else {
    media = `<pre>(no preview)</pre>`;
  }
  const kb = a.size != null ? `${(a.size / 1024).toFixed(0)} KB` : "";
  els.stage.innerHTML = `${media}
    <div class="meta">
      <span class="name">${a.path}</span><span>${kb}</span>
      <a class="open" href="${url}" target="_blank" rel="noopener">open raw ↗</a>
    </div>`;
  els.modal.hidden = false;
}
function closeModal() {
  els.modal.hidden = true;
  els.stage.innerHTML = "";
}
els.modalClose.onclick = closeModal;
els.modal.onclick = (e) => { if (e.target === els.modal) closeModal(); };
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

boot().catch((e) => {
  els.placeholder.textContent = `failed to load: ${e.message}`;
});

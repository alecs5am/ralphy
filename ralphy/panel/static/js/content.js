/* Ralphy panel: Content. Every video as a poster and a title; the account is a filter, never a label. */
(function () {
  "use strict";
  const RP = window.RP, { esc, icon } = RP, state = RP.state, data = RP.data, UI = RP.ui, V = RP.views, A = RP.actions;
  const c = state.content;

  const POSTS = [["any", "Any"], ["planned", "Planned"], ["published", "Published"], ["none", "Not posted"]];
  const SORTS = [["newest", "Newest"], ["title", "Title"], ["number", "Number"]];

  const inScope = (item) => state.scope === "all" || item.account === state.scope;
  const postMatch = (item) => c.posts === "any" || (c.posts === "planned" ? item.posts.planned > 0
    : c.posts === "published" ? item.posts.published > 0 : !item.posts.planned && !item.posts.published && !item.posts.attention);
  const queryMatch = (item) => { const q = state.query.trim().toLowerCase(); return !q || `${item.title} ${item.id}`.toLowerCase().includes(q); };
  const byNewest = (a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")) || b.number - a.number;
  const SORT = { newest: byNewest, title: (a, b) => UI.shortTitle(a.title).localeCompare(UI.shortTitle(b.title)), number: (a, b) => a.account.localeCompare(b.account) || a.number - b.number };

  RP.visibleItems = () => {
    const base = (data.content || []).filter((item) => inScope(item) && postMatch(item) && queryMatch(item));
    const list = c.view === "all" ? base : base.filter((item) => item.state === c.view);
    return [...list].sort(SORT[c.sort] ?? byNewest);
  };
  const counts = () => {
    const base = (data.content || []).filter((item) => inScope(item) && postMatch(item) && queryMatch(item));
    return { all: base.length, ready: base.filter((i) => i.state === "ready").length, work: base.filter((i) => i.state === "work").length };
  };

  V.content = () => {
    if (!data.content) return data.errors.content ? UI.empty({ iconName: "exclaim", title: "Can't read the library", text: data.errors.content.message }) : '<div class="skeleton grid">' + '<div class="card"><div class="poster"></div></div>'.repeat(10) + "</div>";
    const n = counts(), list = RP.visibleItems();
    const ctl = `<div class="ctl" id="ctl">${UI.seg({ key: "view", label: "Show", act: "content-view", value: c.view, options: [["all", "All", n.all], ["ready", "Ready", n.ready], ["work", "In work", n.work]] })}
      <div class="ctl-actions">
        <button class="ibtn" data-act="content-filter" aria-haspopup="menu" aria-label="Sort and filter" ${filtered() ? 'aria-pressed="true"' : ""} ${UI.tip("Sort and filter")}>${icon("sliders")}</button>
      </div></div>`;
    const chips = chipsHtml();
    if (!data.content.length) return ctl + UI.empty({ iconName: "film", title: "No videos yet", text: "Ask the agent to copy a reference into a new video", actions: `<button class="btn btn-tint" data-act="ask" data-text="Find a trending reference for my account and reverse it into a new Ralphy video: ralphy trends --list, then ralphy content new.">${icon("send", "ic-s")}Copy for the agent</button>` });
    if (!list.length) return ctl + chips + UI.empty({ iconName: "search", title: "Nothing here", text: "", actions: `<button class="btn" data-act="content-reset">Show all</button>` });
    const body = c.layout === "list" ? `<div class="list">${list.map(UI.row).join("")}</div>` : `<div class="grid" id="grid">${list.map(UI.card).join("")}</div>`;
    return ctl + chips + body;
  };
  const filtered = () => state.scope !== "all" || c.posts !== "any";
  const chipsHtml = () => {
    const chips = [];
    if (state.scope !== "all") chips.push(`<span class="chip">${UI.dot(state.scope, false)}${esc(RP.face(state.scope).name)}<button data-act="scope" data-scope="all" aria-label="Show every account">${icon("x", "ic-s")}</button></span>`);
    if (c.posts !== "any") chips.push(`<span class="chip">${esc(POSTS.find((p) => p[0] === c.posts)[1])}<button data-act="content-posts" data-v="any" aria-label="Any posts">${icon("x", "ic-s")}</button></span>`);
    if (state.query) chips.push(`<span class="chip">${icon("search", "ic-s")}${esc(state.query)}<button data-act="search-clear" aria-label="Clear search">${icon("x", "ic-s")}</button></span>`);
    return chips.length ? `<div class="chips">${chips.join("")}</div>` : "";
  };

  /* ---------- the filter menu: drill-in pages instead of a row of chips ---------- */
  const scopes = () => [["all", "All accounts"], ...(data.accounts || []).map((a) => [a.slug, a.name]), ...(data.inbox?.videos ? [["inbox", "Inbox"]] : [])];
  const page = {
    root: () => `
      <button class="mi" data-act="filter-page" data-page="sort">${icon("updown", "ic-s")}<span class="mi-l">Sort</span><span class="mi-r">${esc(SORTS.find((s) => s[0] === c.sort)?.[1])}${icon("right", "ic-s")}</span></button>
      <button class="mi" data-act="filter-page" data-page="account"><span>${state.scope === "all" ? icon("user", "ic-s") : UI.dot(state.scope, false)}</span><span class="mi-l">Account</span><span class="mi-r"><span class="ell">${esc(state.scope === "all" ? "All" : RP.face(state.scope).name)}</span>${icon("right", "ic-s")}</span></button>
      <button class="mi" data-act="filter-page" data-page="posts">${icon("publish", "ic-s")}<span class="mi-l">Posts</span><span class="mi-r">${esc(POSTS.find((p) => p[0] === c.posts)[1])}${icon("right", "ic-s")}</span></button>
      <hr class="sep">
      <button class="mi" role="menuitemradio" aria-checked="${c.layout === "grid"}" data-act="content-layout" data-v="grid">${icon("grid", "ic-s")}<span class="mi-l">Grid</span><span class="mi-r">${c.layout === "grid" ? icon("check", "ic-s") : ""}</span></button>
      <button class="mi" role="menuitemradio" aria-checked="${c.layout === "list"}" data-act="content-layout" data-v="list">${icon("list", "ic-s")}<span class="mi-l">List</span><span class="mi-r">${c.layout === "list" ? icon("check", "ic-s") : ""}</span></button>`,
    sort: () => back("Sort") + SORTS.map(([v, l]) => radio("content-sort", v, l, c.sort === v)).join(""),
    account: () => back("Account") + scopes().map(([v, l]) => `<button class="mi" role="menuitemradio" aria-checked="${state.scope === v}" data-act="scope" data-scope="${esc(v)}"><span>${v === "all" ? "" : UI.dot(v, false)}</span><span class="mi-l">${esc(l)}</span><span class="mi-r">${state.scope === v ? icon("check", "ic-s") : ""}</span></button>`).join(""),
    posts: () => back("Posts") + POSTS.map(([v, l]) => radio("content-posts", v, l, c.posts === v)).join(""),
  };
  const back = (title) => `<button class="mi mi-back" data-act="filter-page" data-page="root">${icon("left", "ic-s")}<span class="mi-l">${esc(title)}</span></button><hr class="sep">`;
  const radio = (act, v, label, on) => `<button class="mi" role="menuitemradio" aria-checked="${on}" data-act="${act}" data-v="${esc(v)}"><span>${on ? icon("check", "ic-s") : ""}</span><span class="mi-l">${esc(label)}</span></button>`;
  A["content-filter"] = (el) => RP.openMenu(el, page.root(), { align: "right", cls: "menu-filter" });
  A["filter-page"] = (el) => RP.refreshMenu(page[el.dataset.page]());

  /* ---------- actions ---------- */
  const rerender = () => { RP.closeMenu(); RP.render(); };
  A["content-view"] = (el) => { c.view = el.dataset.v; rerender(); };
  A["content-sort"] = (el) => { c.sort = el.dataset.v; RP.remember("sort", c.sort); rerender(); };
  A["content-posts"] = (el) => { c.posts = el.dataset.v; rerender(); };
  A["content-layout"] = (el) => { c.layout = el.dataset.v; RP.remember("layout", c.layout); rerender(); };
  A["content-reset"] = () => { c.view = "all"; c.posts = "any"; state.scope = "all"; state.query = ""; RP.remember("scope", "all"); rerender(); };
  A["scope"] = (el) => { state.scope = el.dataset.scope; RP.remember("scope", state.scope); rerender(); };
  A["open-item"] = (el) => { RP.stopPreview(); RP.openViewer(el.dataset.id, { tab: el.dataset.tab }); };

  /* ---------- hover preview: one muted clip at a time, after a short hover ---------- */
  let hoverTimer = null, previewing = null;
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  RP.stopPreview = () => { clearTimeout(hoverTimer); if (previewing) { previewing.querySelector("video.pv")?.remove(); previewing = null; } };
  const startPreview = (poster) => {
    const src = poster.dataset.media; if (!src || RP.dragging) return;
    RP.stopPreview(); previewing = poster;
    const v = document.createElement("video");
    Object.assign(v, { muted: true, loop: true, playsInline: true, autoplay: true, preload: "auto" });
    v.className = "pv"; v.src = src; v.setAttribute("aria-hidden", "true");
    v.addEventListener("error", () => v.remove());
    poster.append(v); v.play().catch(() => {});
  };
  document.addEventListener("pointerover", (e) => {
    const poster = e.target.closest?.(".card .poster");
    if (!poster || poster === previewing || e.pointerType === "touch" || reduced()) return;
    clearTimeout(hoverTimer); hoverTimer = setTimeout(() => startPreview(poster), 380);
  });
  document.addEventListener("pointerout", (e) => {
    const poster = e.target.closest?.(".card .poster"); if (!poster) return;
    if (poster.contains(e.relatedTarget)) return;
    clearTimeout(hoverTimer); if (previewing === poster) RP.stopPreview();
  });

  /* ---------- live first frame: a poster or thumb with data-live shows that composition, paused near 1 s, while on screen ---------- */
  const watchers = new Map();
  /* every live frame is a whole composition with its media: keep only a few at once, the rest wait their turn */
  const LIVE_MAX = 3;
  const live = new Set(), waiting = new Set();
  const attach = (box) => {
    if (box.querySelector("hyperframes-player")) return;
    if (live.size >= LIVE_MAX) { waiting.add(box); return; }
    live.add(box);
    const player = document.createElement("hyperframes-player");
    player.className = "p-live"; player.setAttribute("muted", ""); player.setAttribute("aria-hidden", "true");
    player.addEventListener("ready", () => {
      const d = Number(player.duration) || 0;
      try { player.currentTime = Math.min(1, d / 2); } catch {}
      box.classList.add("has-live");
    }, { once: true });
    player.addEventListener("error", () => player.remove(), { once: true });
    player.setAttribute("src", box.dataset.live);
    box.prepend(player);
  };
  const detach = (box) => {
    waiting.delete(box);
    if (!live.delete(box)) return;
    box.querySelector("hyperframes-player")?.remove(); box.classList.remove("has-live");
    const next = [...waiting].find((b) => b.isConnected); waiting.delete(next);
    if (next) attach(next);
  };
  /* scope: the selector whose [data-live] boxes to watch; root: the scrolling element they sit in (null = the window) */
  RP.mountLive = (scope = "#main", root = null) => {
    watchers.get(scope)?.disconnect(); watchers.delete(scope);
    for (const box of [...live, ...waiting]) if (!box.isConnected) { live.delete(box); waiting.delete(box); }
    const boxes = document.querySelectorAll(`${scope} [data-live]`);
    if (!boxes.length || !window.IntersectionObserver) return;
    const seen = new IntersectionObserver((entries) => entries.forEach((e) => (e.isIntersecting ? attach(e.target) : detach(e.target))),
      { root, rootMargin: root ? "0px 120px" : "240px 0px" });
    boxes.forEach((b) => seen.observe(b));
    watchers.set(scope, seen);
  };
})();

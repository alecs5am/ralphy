/* Ralphy panel: the shell (two sections as the title), rendering, routing, events, keyboard, bootstrap. */
(function () {
  "use strict";
  const RP = window.RP, { esc, icon } = RP, state = RP.state, data = RP.data, UI = RP.ui, V = RP.views, A = RP.actions;
  const $ = (s) => document.querySelector(s);
  const tip = UI.tip;
  const section = () => (state.route.tab === "schedule" ? "accounts" : state.route.tab === "trends" ? "content" : state.route.tab);

  /* ---------- title bar ---------- */
  V.header = () => {
    if (state.searchOpen) {
      return `<div class="search" role="search">${icon("search")}<input id="q" type="text" inputmode="search" placeholder="Search" value="${esc(state.query)}" aria-label="Search" data-on="query" autocomplete="off" spellcheck="false">
        ${state.query ? `<button class="ibtn ibtn-xs" data-act="search-clear" aria-label="Clear">${icon("x", "ic-s")}</button>` : ""}</div>
        <button class="btn btn-plain" data-act="search-close">Done</button>`;
    }
    const lead = state.route.tab === "trends"
      ? `<button class="ibtn hd-back" data-act="tab" data-tab="content" aria-label="Back to Content" ${tip("Content")}>${icon("left")}</button><h1 class="bar-title">Trends</h1>`
      : `<nav class="tabs" role="tablist" aria-label="Sections">${[["content", "Content"], ["accounts", "Accounts"]].map(([id, label]) => `<button role="tab" aria-selected="${section() === id}" data-act="tab" data-tab="${id}">${label}</button>`).join("")}</nav>`;
    return `${lead}<div class="hd-actions">
        ${state.route.tab === "content" ? `<button class="ibtn" data-act="tab" data-tab="trends" aria-label="Trends" ${tip("Trends")}>${icon("trend")}</button>` : ""}
        <button class="ibtn" data-act="search-open" aria-label="Search" ${state.query ? 'aria-pressed="true"' : ""} ${tip("Search  /")}>${icon("search")}</button>
        <button class="ibtn" data-act="more-menu" aria-label="More" aria-haspopup="menu">${icon("more")}</button>
      </div>`;
  };
  V.main = () => ({ content: V.content, accounts: V.accounts, schedule: V.schedule, trends: V.trends }[state.route.tab] ?? V.content)();

  /* ---------- render ---------- */
  let lastTab = null;
  RP.render = ({ keepScroll = false } = {}) => {
    const main = $("#main"), sameTab = lastTab === state.route.tab, top = main.scrollTop;
    if (!state.searchOpen || !$("#q")) $("#hd").innerHTML = V.header();
    main.innerHTML = V.main();
    main.scrollTop = keepScroll || sameTab ? top : 0;
    lastTab = state.route.tab;
    stuck();
    RP.renderOverlay();
    RP.mountLive?.();
  };
  RP.repaint = () => { RP.render({ keepScroll: true }); };
  const stuck = () => $("#ctl")?.classList.toggle("is-stuck", $("#main").scrollTop > 2);

  /* ---------- sheets ---------- */
  RP.renderOverlay = () => {
    const root = $("#overlay"), o = state.overlay;
    const html = !o ? "" : o.type === "account" ? V.accountSheet(o.slug) : o.type === "trend" ? V.trendSheet(o.index) : "";
    const had = root.querySelector(".sheet"), scroll = had?.querySelector(".sheet-b")?.scrollTop ?? 0;
    root.innerHTML = html;
    const sheet = root.querySelector(".sheet");
    if (sheet && had) { root.querySelector(".ov")?.classList.add("is-steady"); sheet.querySelector(".sheet-b").scrollTop = scroll; }
    else if (sheet) { RP.overlayReturn = document.activeElement; sheet.focus({ preventScroll: true }); }
  };
  RP.closeOverlay = () => {
    const o = state.overlay; state.overlay = null;
    if (o?.type === "account") { RP.go({ tab: "accounts" }); }
    else RP.renderOverlay();
    RP.overlayReturn?.focus?.({ preventScroll: true });
  };

  /* ---------- routing ---------- */
  RP.onRoute = () => {
    const route = RP.parse(location.hash);
    state.route = route;
    if (route.view) { state.overlay = null; RP.closeMenu(); RP.render({ keepScroll: true }); RP.showViewer(route.view); return; }
    if (state.viewer) { state.viewer = null; $("#viewer-root").innerHTML = ""; document.querySelectorAll("#main, #hd").forEach((el) => { el.inert = false; }); }
    if (route.tab === "accounts" && route.account) state.overlay = { type: "account", slug: route.account };
    else if (state.overlay?.type === "account") state.overlay = null;
    if (route.tab !== "trends" && state.overlay?.type === "trend") state.overlay = null;
    RP.closeMenu();
    RP.render();
    if (route.tab === "trends") RP.ensureTrends();
  };
  window.addEventListener("hashchange", RP.onRoute);

  /* ---------- shared actions ---------- */
  A["tab"] = (el) => { RP.closeMenu(); state.searchOpen = false; RP.go({ tab: el.dataset.tab }); };
  A["copy"] = (el) => RP.copy(el.dataset.text, el.dataset.toast || "Copied");
  A["ask"] = (el, e) => { e?.stopPropagation(); RP.closeMenu(); RP.ask(el.dataset.text); };
  A["close"] = () => RP.closeOverlay();
  A["search-open"] = () => { state.searchOpen = true; $("#hd").innerHTML = V.header(); const q = $("#q"); q?.focus(); q?.select(); };
  A["search-close"] = () => { state.searchOpen = false; RP.render(); };
  A["search-clear"] = () => { state.query = ""; state.searchOpen = false; RP.render(); };
  RP.inputs["query"] = (el) => { state.query = el.value; $("#main").innerHTML = V.main(); RP.mountLive?.(); };
  A["more-menu"] = (el) => {
    RP.openMenu(el, `${section() === "content" && state.route.tab !== "trends" ? `<button class="mi" data-act="tab" data-tab="trends">${icon("trend", "ic-s")}<span class="mi-l">Trends</span></button>` : ""}
      <button class="mi" data-act="copy" data-text="${esc(data.home)}" data-toast="Folder path copied">${icon("folder", "ic-s")}<span class="mi-l">Copy folder path</span></button>
      <button class="mi" data-act="reload">${icon("refresh", "ic-s")}<span class="mi-l">Reload</span></button>`, { align: "right" });
  };
  A["reload"] = async () => { RP.closeMenu(); data.details = {}; data.niches = {}; data.trends = null; delete data.errors.trends; await Promise.all([RP.loadContent(), RP.loadAccounts()]); RP.render({ keepScroll: true }); if (state.route.tab === "trends") RP.ensureTrends(); RP.toast("Up to date"); };
  /* the custom select: the menu calls the handler with the picked value */
  A["select-open"] = (el) => {
    const options = JSON.parse(el.dataset.options), value = el.dataset.value;
    RP.selectAnchor = el;
    RP.openMenu(el, options.map(([v, text, hint]) => `<button class="mi" role="menuitemradio" aria-checked="${String(v) === value}" data-act="select-pick" data-v="${esc(v)}"><span>${String(v) === value ? icon("check", "ic-s") : ""}</span><span class="mi-l">${esc(text)}${hint ? `<small>${esc(hint)}</small>` : ""}</span></button>`).join(""), { align: el.dataset.align, cls: "menu-select" });
  };
  A["select-pick"] = (el) => { const anchor = RP.selectAnchor; RP.selectAnchor = null; RP.closeMenu(); if (anchor) A[anchor.dataset.then]?.({ value: el.dataset.v }); };

  /* ---------- events ---------- */
  document.addEventListener("click", (e) => {
    const menu = $("#menus .menu");
    if (menu && !menu.contains(e.target) && !RP.menuAnchor?.contains?.(e.target)) RP.closeMenu();
    const el = e.target.closest("[data-act]");
    if (!el || el.disabled) return;
    if (e.target.closest("a[href]") && !e.target.closest("a[href]").dataset.act) return;
    const act = A[el.dataset.act]; if (!act) return;
    if (el.tagName === "A") e.preventDefault();
    act(el, e);
  });
  document.addEventListener("input", (e) => { const el = e.target.closest("[data-on]"); if (el) RP.inputs[el.dataset.on]?.(el); });
  document.addEventListener("scroll", (e) => { if (e.target === $("#main")) stuck(); }, true);

  const typing = (e) => e.target.closest?.("input, textarea, [contenteditable]") && e.target.type !== "range";
  document.addEventListener("keydown", (e) => {
    const menu = $("#menus .menu");
    if (e.key === "Escape") {
      if (menu) { RP.closeMenu(); return; }
      if (state.overlay) { RP.closeOverlay(); return; }
      if (state.viewer) { RP.closeViewer(); return; }
      if (state.searchOpen) { A["search-close"](); return; }
      return;
    }
    if (menu && ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
      const items = [...menu.querySelectorAll("button.mi, a.mi")], i = items.indexOf(document.activeElement);
      const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[next]?.focus(); e.preventDefault(); return;
    }
    if (typing(e)) { if (e.key === "Enter" && e.target.id === "q") e.target.blur(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c" && !String(window.getSelection())) {
      const holder = state.viewer ? null : document.activeElement?.closest?.("[data-drag-path]");
      if (state.viewer) { RP.viewerCopyPath(); e.preventDefault(); return; }
      if (holder) { RP.copy(holder.dataset.dragPath, "Path copied"); e.preventDefault(); return; }
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if ((e.key === "Enter" || e.key === " ") && document.activeElement?.matches?.('[role="button"][data-act]')) { e.preventDefault(); document.activeElement.click(); return; }
    if (state.viewer) {
      const k = e.key.toLowerCase();
      const map = { " ": "viewer-play", k: "viewer-play", m: "viewer-mute", f: "viewer-full", c: "viewer-compare" };
      if (map[k] && !(k === " " && e.target.closest("button"))) { A[map[k]](); e.preventDefault(); return; }
      if (k === "arrowleft" || k === "arrowright") { if (e.target.type === "range") return; A["viewer-step"]({ dataset: { d: k === "arrowleft" ? "-1" : "1" } }); e.preventDefault(); return; }
      if (k === "j" || k === "l") { RP.viewerSeekBy(k === "j" ? -2 : 2); return; }
      if (k === "," || k === ".") { RP.viewerSeekBy(k === "," ? -1 / 30 : 1 / 30); return; }
      return;
    }
    if (state.overlay) return;
    if (e.key === "/") { A["search-open"](); e.preventDefault(); return; }
    if (e.key === "1") { RP.go({ tab: "content" }); return; }
    if (e.key === "2") { RP.go({ tab: "accounts" }); return; }
    if (state.route.tab === "content" && ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) moveFocus(e);
  });
  /* arrows move between cards by their place on screen */
  function moveFocus(e) {
    const cards = [...document.querySelectorAll("#main [data-act='open-item']")]; if (!cards.length) return;
    const cur = document.activeElement, i = cards.indexOf(cur);
    if (i < 0) { cards[0].focus(); e.preventDefault(); return; }
    const r = cur.getBoundingClientRect();
    let best = null, bestScore = Infinity;
    for (const c of cards) {
      if (c === cur) continue;
      const q = c.getBoundingClientRect(), dx = q.left - r.left, dy = q.top - r.top;
      const ok = e.key === "ArrowRight" ? dx > 4 && Math.abs(dy) < r.height / 2 : e.key === "ArrowLeft" ? dx < -4 && Math.abs(dy) < r.height / 2 : e.key === "ArrowDown" ? dy > 4 : dy < -4;
      if (!ok) continue;
      const score = e.key.includes("Right") || e.key.includes("Left") ? Math.abs(dx) : Math.abs(dy) * 4 + Math.abs(dx);
      if (score < bestScore) { bestScore = score; best = c; }
    }
    if (best) { best.focus(); best.scrollIntoView({ block: "nearest" }); e.preventDefault(); }
  }

  /* ---------- bootstrap ---------- */
  (async () => {
    state.route = RP.parse(location.hash);
    RP.render();
    await Promise.all([RP.loadContent(), RP.loadAccounts()]);
    RP.onRoute();
    RP.listen();
  })();
})();

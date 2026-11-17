/* Ralphy panel: core. Formatting, icons, state, the JSON API, routing, menus, tooltips, toasts, drag, live updates. */
(function () {
  "use strict";
  const BOOT = window.RALPHY || {};
  const RP = (window.RP = { boot: BOOT, actions: {}, views: {}, inputs: {} });

  /* ---------- formatting ---------- */
  const esc = (RP.esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]));
  RP.dur = (s) => { if (s == null) return ""; const t = Math.max(0, Math.round(s)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };
  RP.tc = (s) => { const t = Math.max(0, s || 0); return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}.${Math.floor((t * 10) % 10)}`; };
  const fixed = (x, digits) => x.toFixed(digits).replace(/\.0$/, "");
  RP.bytes = (n) => (n == null ? "–" : n >= 1e9 ? `${fixed(n / 1e9, 1)} GB` : n >= 1e6 ? `${fixed(n / 1e6, n >= 1e8 ? 0 : 1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
  RP.compact = (n) => (n == null ? "–" : Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n));
  RP.mult = (m) => (m == null ? "–" : `${m >= 100 ? RP.compact(Math.round(m)) : m >= 10 ? Math.round(m) : m.toFixed(1)}×`);
  RP.plural = (n, one, many) => `${n} ${n === 1 ? one : many ?? one + "s"}`;
  const fmt = (opts) => new Intl.DateTimeFormat("en-GB", opts);
  RP.time = (iso) => fmt({ hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
  RP.day = (iso) => fmt({ weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));
  RP.date = (iso) => fmt({ day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
  RP.longDay = (iso) => fmt({ weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
  RP.dayKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
  RP.stamp = (iso) => `${RP.day(iso)} · ${RP.time(iso)}`;
  RP.ago = (iso) => {
    const s = Math.max(0, (Date.now() - new Date(iso)) / 1000);
    if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    if (s < 86400 * 60) return `${Math.floor(s / 86400)} d ago`;
    if (s < 86400 * 730) return `${Math.floor(s / (86400 * 30))} mo ago`;
    return `${Math.floor(s / (86400 * 365))} y ago`;
  };
  RP.fileUrl = (path) => `file://${String(path).split("/").map(encodeURIComponent).join("/")}`;

  /* ---------- icons (16 px grid) ---------- */
  const I = {
    search: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/>',
    down: '<path d="m4 6 4 4 4-4"/>', right: '<path d="m6 4 4 4-4 4"/>', left: '<path d="M10 4 6 8l4 4"/>',
    x: '<path d="m4 4 8 8M12 4l-8 8"/>',
    check: '<path d="m3 8.5 3 3 7-7"/>',
    circle: '<circle cx="8" cy="8" r="5.5"/>',
    play: '<path d="M5 3.2v9.6l7.5-4.8z" fill="currentColor" stroke="none"/>',
    pause: '<path d="M5.5 3.5v9M10.5 3.5v9" stroke-width="2.2"/>',
    volume: '<path d="M2.5 6v4H5l3 2.5v-9L5 6z"/><path d="M10.5 6a3 3 0 0 1 0 4M12.3 4.2a5.5 5.5 0 0 1 0 7.6"/>',
    mute: '<path d="M2.5 6v4H5l3 2.5v-9L5 6z"/><path d="m10.5 6.5 3 3m0-3-3 3"/>',
    full: '<path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/>',
    ext: '<path d="M9 2.5h4.5V7M13.5 2.5l-6 6M11.5 9.5v4h-9v-9h4"/>',
    copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5V3.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/>',
    note: '<path d="m2.5 13.5.7-3 7.3-7.3a1.4 1.4 0 0 1 2 0l.3.3a1.4 1.4 0 0 1 0 2l-7.3 7.3zM9.5 4.2l2.3 2.3"/>',
    calendar: '<rect x="2" y="3" width="12" height="11" rx="1.5"/><path d="M2 6.5h12M5 1.5v3M11 1.5v3"/>',
    clock: '<circle cx="8" cy="8" r="5.5"/><path d="M8 5v3l2 1.5"/>',
    more: '<path d="M3.5 8h.01M8 8h.01M12.5 8h.01" stroke-width="2.2"/>',
    send: '<path d="m2 8 11.5-5.5-4 11.5-2-4.5z"/><path d="m7.5 9.5 2.5-2.5"/>',
    plus: '<path d="M8 3v10M3 8h10"/>',
    exclaim: '<path d="M8 3.5v5.5"/><path d="M8 12h.01" stroke-width="2.2"/>',
    lock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>',
    help: '<circle cx="8" cy="8" r="5.5"/><path d="M6.3 6.3a1.8 1.8 0 1 1 2.5 1.7c-.5.3-.8.7-.8 1.3"/><path d="M8 11.2h.01" stroke-width="2"/>',
    refresh: '<path d="M13 8a5 5 0 1 1-1.5-3.5"/><path d="M13 2.5v3h-3"/>',
    eye: '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="1.8"/>',
    publish: '<path d="M8 10.5V3m0 0L5 6m3-3 3 3M2.5 11v2.5h11V11"/>',
    film: '<rect x="3" y="2" width="10" height="12" rx="1.5"/><path d="M6.8 6v4L10 8z" fill="currentColor" stroke="none"/>',
    trend: '<path d="m2 12 4-4 3 2.5 5-6"/><path d="M10.5 4.5H14V8"/>',
    stack: '<rect x="2.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M5.5 5.5V3.5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2"/>',
    sliders: '<path d="M2.5 5h5M11.5 5h2M2.5 11h2M8.5 11h5"/><circle cx="9.5" cy="5" r="1.7"/><circle cx="6.5" cy="11" r="1.7"/>',
    flag: '<path d="M4 14V2.5M4 3h8l-1.8 2.7L12 8.5H4"/>',
    folder: '<path d="M2 4.5v8h12v-7H8l-1.5-2H2z"/>',
    grid: '<path d="M2.5 2.5H7V7H2.5zM9 2.5h4.5V7H9zM2.5 9H7v4.5H2.5zM9 9h4.5v4.5H9z"/>',
    list: '<path d="M5.5 4h8M5.5 8h8M5.5 12h8"/><path d="M2.5 4h.01M2.5 8h.01M2.5 12h.01" stroke-width="2"/>',
    updown: '<path d="m5 6.2 3-3 3 3M5 9.8l3 3 3-3"/>',
    hourglass: '<path d="M4.5 2.5h7M4.5 13.5h7M5 2.5c0 3 3 3.5 3 5.5s-3 2.5-3 5.5M11 2.5c0 3-3 3.5-3 5.5s3 2.5 3 5.5"/>',
    pulse: '<circle cx="8" cy="8" r="2.2" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r="5.5"/>',
    bookmark: '<path d="M4 2.5h8v11l-4-3-4 3z"/>',
    link: '<path d="M6.5 9.5a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-.8.8M9.5 6.5a3 3 0 0 0-4.2 0l-2 2a3 3 0 0 0 4.2 4.2l.8-.8"/>',
    user: '<circle cx="8" cy="5.5" r="2.5"/><path d="M3 13.5a5 5 0 0 1 10 0"/>',
    compare: '<rect x="1.75" y="2.5" width="5.5" height="11" rx="1.5"/><rect x="8.75" y="2.5" width="5.5" height="11" rx="1.5"/>',
    restore: '<path d="M3 8a5 5 0 1 0 1.5-3.5"/><path d="M3 2.5v3h3"/>',
    library: '<rect x="2" y="3.5" width="8.5" height="10" rx="1.8"/><path d="M5.5 3.5V3a1 1 0 0 1 1-1H13a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-.5"/><path d="M5.3 6.7v3.6l3-1.8z" fill="currentColor" stroke="none"/>',
  };
  RP.icon = (name, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[name] ?? I.circle}</svg>`;

  /* ---------- state ---------- */
  const store = (key, fallback) => { try { const v = localStorage.getItem(`ralphy-panel:${key}`); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } };
  RP.remember = (key, value) => { try { localStorage.setItem(`ralphy-panel:${key}`, JSON.stringify(value)); } catch {} };
  const state = (RP.state = {
    route: { tab: "content" },
    scope: store("scope", "all"),
    query: "", searchOpen: false,
    content: { view: "all", sort: store("sort", "newest"), layout: store("layout", "grid"), posts: "any", scroll: 0 },
    accounts: { detail: null },
    schedule: { anchor: RP.dayKey(new Date()), day: RP.dayKey(new Date()), mode: store("schedule-mode", "week") },
    trends: { niche: store("niche", null), sort: "outliers", limit: 60 },
    viewer: null,
    overlay: null,
    busy: {},
  });
  const data = (RP.data = { content: null, accounts: null, inbox: null, home: BOOT.home || "", details: {}, trends: null, niches: {}, errors: {} });

  /* ---------- JSON API ---------- */
  RP.get = async (url) => {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const body = await res.json().catch(() => ({ ok: false, error: { code: "E_BAD_RESPONSE", message: `HTTP ${res.status}` } }));
    if (!body.ok) { const err = new Error(body.error?.message || `HTTP ${res.status}`); err.code = body.error?.code; err.hint = body.error?.hint; throw err; }
    return body;
  };
  RP.post = async (url, payload = {}) => {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-Ralphy-Token": BOOT.token || "" }, body: JSON.stringify(payload) });
    const body = await res.json().catch(() => ({ ok: false, error: { message: `HTTP ${res.status}` } }));
    if (!body.ok) { const err = new Error(body.error?.message || `HTTP ${res.status}`); err.code = body.error?.code; err.hint = body.error?.hint; throw err; }
    return body;
  };
  RP.loadContent = async () => { try { const body = await RP.get("/api/content"); data.content = body.content; data.home = body.home; delete data.errors.content; } catch (e) { data.errors.content = e; } };
  RP.loadAccounts = async () => { try { const body = await RP.get("/api/accounts"); data.accounts = body.accounts; data.inbox = body.inbox; delete data.errors.accounts; } catch (e) { data.errors.accounts = e; } };
  RP.loadDetail = async (id) => { try { data.details[id] = (await RP.get(`/api/content/${id.split("/").map(encodeURIComponent).join("/")}`)).content; } catch (e) { data.details[id] = { error: e }; } return data.details[id]; };
  RP.loadTrends = async () => { try { data.trends = await RP.get("/api/trends"); delete data.errors.trends; } catch (e) { data.errors.trends = e; } };
  RP.loadNiche = async (slug) => { try { data.niches[slug] = await RP.get(`/api/trends/${encodeURIComponent(slug)}`); } catch (e) { data.niches[slug] = { error: e }; } return data.niches[slug]; };

  /* ---------- lookups ---------- */
  RP.item = (id) => (data.content || []).find((c) => c.id === id) || null;
  RP.account = (slug) => (data.accounts || []).find((a) => a.slug === slug) || null;
  RP.face = (slug) => RP.account(slug) || (slug === "inbox" ? { slug: "inbox", name: "Inbox", monogram: "IN", color: "df" } : { slug, name: slug, monogram: "?", color: "df" });
  RP.allPosts = () => (data.accounts || []).flatMap((a) => a.posts || []);
  RP.postWhen = (post) => post.scheduled_at || post.posted_at || null;
  RP.ATTENTION = ["unknown", "failed", "needs_login"];
  RP.UPCOMING = ["planned", "approved", "uploading"];

  /* ---------- routing: #/content, #/view/<account>/<folder>, #/accounts[/<slug>], #/schedule, #/trends[/<niche>] ---------- */
  RP.parse = (hash) => {
    const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
    const [head, a, b] = parts;
    if (head === "view" && a && b) return { tab: "content", view: `${a}/${b}` };
    if (head === "accounts") return { tab: "accounts", account: a || null };
    if (head === "schedule") return { tab: "schedule" };
    if (head === "trends") return { tab: "trends", niche: a || null };
    return { tab: "content" };
  };
  RP.href = (route) => {
    if (route.view) return `#/view/${route.view.split("/").map(encodeURIComponent).join("/")}`;
    if (route.tab === "accounts") return route.account ? `#/accounts/${encodeURIComponent(route.account)}` : "#/accounts";
    if (route.tab === "schedule") return "#/schedule";
    if (route.tab === "trends") return route.niche ? `#/trends/${encodeURIComponent(route.niche)}` : "#/trends";
    return "#/content";
  };
  RP.go = (route, replace = false) => {
    const href = RP.href(route);
    if (location.hash === href) { RP.onRoute(); return; }
    if (replace) { history.replaceState(null, "", href); RP.onRoute(); } else location.hash = href;
  };

  /* ---------- clipboard, toast ---------- */
  RP.copy = async (text, label = "Copied") => {
    try { await navigator.clipboard.writeText(text); }
    catch { const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.append(ta); ta.select(); try { document.execCommand("copy"); } catch {} ta.remove(); }
    RP.toast(label);
  };
  let toastTimer;
  RP.toast = (text, glyph = "check", tone = "") => {
    const root = document.querySelector("#toasts"); if (!root) return;
    root.innerHTML = `<div class="toast ${tone}" role="status">${glyph ? RP.icon(glyph, "ic-s") : ""}<span>${esc(text)}</span></div>`;
    RP.hideTip();
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { root.innerHTML = ""; }, 2800);
  };
  /* Work the panel does not do itself is a short instruction the person pastes into the agent chat. */
  RP.ask = (text) => RP.copy(text, "Copied for the agent");

  /* ---------- menus ---------- */
  RP.closeMenu = () => { document.querySelector("#menus").innerHTML = ""; RP.menuAnchor?.setAttribute?.("aria-expanded", "false"); RP.menuAnchor = null; };
  RP.openMenu = (anchor, html, opts = {}) => {
    const same = RP.menuAnchor === anchor; RP.closeMenu(); if (same && !opts.force) return;
    const root = document.querySelector("#menus"), panel = document.querySelector("#panel");
    root.innerHTML = `<div class="menu ${opts.cls ?? ""}" role="menu">${html}</div>`;
    const menu = root.firstElementChild, p = panel.getBoundingClientRect(), a = anchor.getBoundingClientRect();
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    let left = opts.align === "right" ? a.right - p.left - mw : a.left - p.left;
    left = Math.max(8, Math.min(left, p.width - mw - 8));
    let top = a.bottom - p.top + 6, above = false;
    if (top + mh > p.height - 8) { top = a.top - p.top - mh - 6; above = true; }
    top = Math.max(8, Math.min(top, p.height - mh - 8));
    menu.style.left = `${left}px`; menu.style.top = `${top}px`;
    menu.style.setProperty("--origin", `${above ? "bottom" : "top"} ${opts.align === "right" ? "right" : "left"}`);
    RP.menuAnchor = anchor; anchor.setAttribute?.("aria-expanded", "true");
    (menu.querySelector('[aria-checked="true"]') ?? menu.querySelector("button, a"))?.focus({ preventScroll: true });
    RP.hideTip();
  };
  RP.refreshMenu = (html) => { const menu = document.querySelector("#menus .menu"); if (menu) { menu.innerHTML = html; menu.querySelector("button")?.focus({ preventScroll: true }); } };

  /* ---------- tooltips: data-tip, never title ---------- */
  let tipTimer, tipShownAt = 0, tipFor = null;
  RP.hideTip = () => { clearTimeout(tipTimer); tipFor = null; const t = document.querySelector("#tips"); if (t) t.innerHTML = ""; };
  RP.showTip = (el) => {
    const text = el.dataset.tip; if (!text) return;
    const root = document.querySelector("#tips"), panel = document.querySelector("#panel");
    root.innerHTML = `<div class="tip" role="tooltip">${esc(text)}</div>`;
    const tip = root.firstElementChild, p = panel.getBoundingClientRect(), r = el.getBoundingClientRect();
    let left = r.left + r.width / 2 - tip.offsetWidth / 2 - p.left; left = Math.max(6, Math.min(left, p.width - tip.offsetWidth - 6));
    let top = r.bottom - p.top + 6; if (top + tip.offsetHeight > p.height - 6) top = r.top - p.top - tip.offsetHeight - 6;
    tip.style.left = `${left}px`; tip.style.top = `${top}px`; tipShownAt = Date.now();
  };
  document.addEventListener("pointerover", (e) => {
    const el = e.target.closest?.("[data-tip]");
    if (el === tipFor) return;
    RP.hideTip(); if (!el || e.pointerType === "touch") return;
    tipFor = el; tipTimer = setTimeout(() => RP.showTip(el), Date.now() - tipShownAt < 600 ? 60 : 520);
  });
  ["pointerdown", "keydown", "scroll", "dragstart"].forEach((type) => document.addEventListener(type, () => RP.hideTip(), true));

  /* ---------- drag to chat: an element with data-drag-path leaves the panel as its absolute path ---------- */
  document.addEventListener("dragstart", (e) => {
    const el = e.target.closest?.("[data-drag-path]"); if (!el) return;
    const path = el.dataset.dragPath;
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("text/plain", path);
    e.dataTransfer.setData("text/uri-list", RP.fileUrl(path));
    const ghost = document.createElement("div");
    ghost.className = "dragghost";
    const img = el.querySelector("img")?.getAttribute("src");
    ghost.innerHTML = `${img ? `<span class="thumb"><img src="${esc(img)}" alt=""></span>` : RP.icon("film")}<span class="ell">${esc(el.dataset.dragLabel || path.split("/").pop())}</span>`;
    document.body.append(ghost);
    try { e.dataTransfer.setDragImage(ghost, 18, 23); } catch {}
    setTimeout(() => ghost.remove(), 0);
    el.classList.add("is-dragging");
    RP.dragging = true; RP.stopPreview?.();
  });
  document.addEventListener("dragend", (e) => { e.target.closest?.("[data-drag-path]")?.classList.remove("is-dragging"); RP.dragging = false; });

  /* ---------- live updates: the server watches the files and says what changed ---------- */
  RP.listen = () => {
    if (!window.EventSource) return;
    let pending = [], timer = null;
    const source = new EventSource("/api/events");
    source.addEventListener("change", (e) => {
      try { pending.push(JSON.parse(e.data)); } catch { return; }
      clearTimeout(timer); timer = setTimeout(() => { const batch = pending; pending = []; RP.onChanges(batch); }, 250);
    });
    source.onopen = () => { if (RP.offline) { RP.offline = false; RP.onChanges([{ type: "library" }]); } };
    source.onerror = () => { RP.offline = true; };
  };
  /* render, versions and notes change what the card and the viewer show; work (the working tree) can make the
     render stale and reloads the live preview */
  RP.onChanges = async (events) => {
    const ids = new Set(), work = new Set();
    let content = false, accounts = false;
    for (const ev of events) {
      if (ev.type === "library") { content = true; accounts = true; }
      if (ev.type === "account") { accounts = true; if (ev.what?.some((w) => w !== "stats")) content = true; }
      if (ev.type === "content") { content = true; ids.add(ev.id); if ((ev.what || []).includes("work")) work.add(ev.id); }
    }
    await Promise.all([content && RP.loadContent(), accounts && RP.loadAccounts()]);
    const open = state.viewer?.id;
    if (open && (ids.has(open) || accounts)) await RP.loadDetail(open);
    for (const id of ids) if (id !== open) delete data.details[id];
    if (content || accounts) RP.render({ keepScroll: true });
    if (open && (ids.has(open) || accounts)) RP.viewerRefresh?.();
    if (open && work.has(open)) RP.viewerWorkChanged?.();
  };
})();

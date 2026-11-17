/* Ralphy panel: Schedule, the second view of Accounts. Posts by `scheduled_at` (or `posted_at`), a week or a list. */
(function () {
  "use strict";
  const RP = window.RP, { esc, icon } = RP, state = RP.state, data = RP.data, UI = RP.ui, V = RP.views, A = RP.actions;
  const s = state.schedule;
  const tip = UI.tip;

  const keyOf = (iso) => RP.dayKey(new Date(iso));
  const fromKey = (key) => { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (key, n) => { const d = fromKey(key); d.setDate(d.getDate() + n); return RP.dayKey(d); };
  const monday = (key) => { const d = fromKey(key), wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return RP.dayKey(d); };
  const today = () => RP.dayKey(new Date());

  const posts = () => RP.allPosts()
    .filter((p) => p.status !== "cancelled" && (state.scope === "all" || p.account === state.scope))
    .sort((a, b) => String(RP.postWhen(a) || "").localeCompare(String(RP.postWhen(b) || "")));
  const onDay = (list, key) => list.filter((p) => RP.postWhen(p) && keyOf(RP.postWhen(p)) === key);
  const dots = (list) => list.slice(0, 3).map((p) => `<i class="dot ${RP.ATTENTION.includes(p.status) ? "dot-bad" : `dot-${RP.face(p.account).color}`}"></i>`).join("");

  const ctl = () => `<div class="ctl" id="ctl">${UI.acctSeg()}<div class="ctl-actions">
      <button class="ibtn" data-act="schedule-filter" aria-haspopup="menu" aria-label="View and filters" ${state.scope !== "all" ? 'aria-pressed="true"' : ""} ${tip("View and filters")}>${icon("sliders")}</button>
      <button class="ibtn cal-add" data-act="ask" data-text="${esc("Plan a post: ralphy post plan <content-id> --to <account>:<platform> --at <ISO time> --caption \"<caption>\"")}" aria-label="Plan a post" ${tip("Plan a post")}>${icon("plus")}</button>
    </div></div>`;
  const chips = () => (state.scope !== "all" ? `<div class="chips"><span class="chip">${UI.dot(state.scope, false)}${esc(RP.face(state.scope).name)}<button data-act="scope" data-scope="all" aria-label="Every account">${icon("x", "ic-s")}</button></span></div>` : "");
  const row = (p) => `<div class="post-wrap"><span class="post-time t-num">${RP.postWhen(p) ? RP.time(RP.postWhen(p)) : "–"}</span>${UI.postRow(p, { when: false })}</div>`;
  const dated = (p) => `<div class="post-wrap">${UI.postRow(p)}</div>`;
  const nothing = (text) => `<div class="cal-none">${icon("calendar", "ic-l")}<span>${esc(text)}</span></div>`;

  V.schedule = () => {
    if (!data.accounts) return ctl() + (data.errors.accounts ? UI.empty({ iconName: "exclaim", title: "Can't read the posts", text: data.errors.accounts.message }) : "");
    const list = posts(), attention = list.filter((p) => RP.ATTENTION.includes(p.status));
    const alert = attention.length && s.mode !== "list" ? `<button class="cal-alert" data-act="schedule-mode" data-v="list">${UI.glyph("bad", "exclaim", "glyph-s")}${attention.length} to check${icon("right", "ic-s")}</button>` : "";
    return ctl() + chips() + (s.mode === "list" ? listView(list) : weekView(list, alert));
  };

  function weekView(list, alert) {
    const start = monday(s.anchor), days = [...Array(7)].map((_, i) => addDays(start, i)), now = today();
    if (!days.includes(s.day)) s.day = days.includes(now) ? now : start;
    const first = fromKey(start);
    const title = `${first.toLocaleString("en-GB", { month: "long" })} <span>${first.getFullYear()}</span>`;
    const head = `<div class="cal-head"><h2 class="cal-title">${title}</h2>
      ${days.includes(now) ? "" : `<button class="btn btn-plain btn-sm" data-act="schedule-today">Today</button>`}
      <button class="ibtn" data-act="schedule-week" data-d="-7" aria-label="Previous week" ${tip("Previous week")}>${icon("left")}</button>
      <button class="ibtn" data-act="schedule-week" data-d="7" aria-label="Next week" ${tip("Next week")}>${icon("right")}</button></div>`;
    const strip = `<div class="cal-week cal-narrow" role="tablist" aria-label="Days">${days.map((k) => { const d = fromKey(k), on = onDay(list, k); return `<button class="cal-day ${k === now ? "is-today" : ""}" role="tab" aria-pressed="${k === s.day}" data-act="schedule-day" data-v="${k}" aria-label="${esc(RP.longDay(d))}${on.length ? `, ${RP.plural(on.length, "post")}` : ""}">
        <span class="cal-wd">${d.toLocaleString("en-GB", { weekday: "narrow" })}</span><span class="cal-n t-num">${d.getDate()}</span><span class="cal-dots">${dots(on)}</span></button>`; }).join("")}</div>`;
    const day = onDay(list, s.day);
    const dayList = `<div class="cal-narrow"><div class="sect cal-sect">${esc(RP.longDay(fromKey(s.day)))}</div>${day.length ? `<div class="cal-list">${day.map(row).join("")}</div>` : nothing("Nothing on this day")}</div>`;
    const grid = `<div class="wk cal-wide">${days.map((k) => { const d = fromKey(k), on = onDay(list, k); return `<div class="wk-col ${k === now ? "is-today" : ""}">
        <div class="wk-h"><span>${d.toLocaleString("en-GB", { weekday: "short" })}</span><b class="t-num">${d.getDate()}</b></div>
        ${on.map((p) => { const item = RP.item(p.content); return `<button class="wpost" ${item ? `data-act="open-item" data-id="${esc(item.id)}" data-tab="posts" draggable="true" data-drag-path="${esc(item.drag_path)}" data-drag-label="${esc(item.title)}"` : ""} ${tip(`${item ? UI.shortTitle(item.title) : p.content} · ${UI.post(p.status).label}`)}>
          ${UI.thumb(item?.poster, "thumb-s")}<span class="wpost-b"><b class="t-num">${RP.time(RP.postWhen(p))}</b><span class="wpost-d">${UI.dot(p.account, false)}${UI.plat(p.platform)}</span><span class="wpost-t ell">${esc(item ? UI.shortTitle(item.title) : p.content)}</span></span>${UI.postGlyph(p.status, "glyph-s")}</button>`; }).join("")}
      </div>`; }).join("")}</div>`;
    const empty = !list.length ? `<div class="cal-wide">${nothing("Nothing planned yet")}</div>` : "";
    return head + strip + (alert ? `<div>${alert}</div>` : "") + dayList + grid + empty;
  }

  function listView(list) {
    const now = today(), attention = list.filter((p) => RP.ATTENTION.includes(p.status));
    const ahead = list.filter((p) => !RP.ATTENTION.includes(p.status) && RP.postWhen(p) && keyOf(RP.postWhen(p)) >= now);
    const unscheduled = list.filter((p) => !RP.postWhen(p) && !RP.ATTENTION.includes(p.status));
    const recent = list.filter((p) => p.status === "published" && RP.postWhen(p) && keyOf(RP.postWhen(p)) < now).reverse().slice(0, 20);
    const groups = {};
    for (const p of ahead) (groups[keyOf(RP.postWhen(p))] ??= []).push(p);
    let html = "";
    if (attention.length) html += `<div class="sect cal-sect is-bad">Needs a look<span class="n">${attention.length}</span></div><div class="cal-list">${attention.map(dated).join("")}</div>`;
    for (const [k, items] of Object.entries(groups)) html += `<div class="sect cal-sect">${esc(k === now ? "Today" : RP.longDay(fromKey(k)))}</div><div class="cal-list">${items.map(row).join("")}</div>`;
    if (unscheduled.length) html += `<div class="sect cal-sect">No time yet<span class="n">${unscheduled.length}</span></div><div class="cal-list">${unscheduled.map(dated).join("")}</div>`;
    if (recent.length) html += `<div class="sect cal-sect">Posted<span class="n">${recent.length}</span></div><div class="cal-list">${recent.map(dated).join("")}</div>`;
    return html || nothing("Nothing planned yet");
  }

  /* ---------- actions ---------- */
  A["schedule-day"] = (el) => { s.day = el.dataset.v; RP.render({ keepScroll: true }); };
  A["schedule-week"] = (el) => { s.anchor = addDays(monday(s.anchor), Number(el.dataset.d)); s.day = s.anchor; RP.render({ keepScroll: true }); };
  A["schedule-today"] = () => { s.anchor = s.day = today(); RP.render({ keepScroll: true }); };
  A["schedule-mode"] = (el) => { s.mode = el.dataset.v; RP.remember("schedule-mode", s.mode); RP.closeMenu(); RP.render(); };
  A["schedule-filter"] = (el) => {
    const accounts = [["all", "All accounts"], ...(data.accounts || []).map((a) => [a.slug, a.name])];
    RP.openMenu(el, `<div class="menu-h">View</div>
      ${[["week", "Week", "calendar"], ["list", "List", "list"]].map(([v, l, ic]) => `<button class="mi" role="menuitemradio" aria-checked="${s.mode === v}" data-act="schedule-mode" data-v="${v}">${icon(ic, "ic-s")}<span class="mi-l">${l}</span><span class="mi-r">${s.mode === v ? icon("check", "ic-s") : ""}</span></button>`).join("")}
      <hr class="sep"><div class="menu-h">Account</div>
      ${accounts.map(([v, l]) => `<button class="mi" role="menuitemradio" aria-checked="${state.scope === v}" data-act="scope" data-scope="${esc(v)}"><span>${v === "all" ? "" : UI.dot(v, false)}</span><span class="mi-l">${esc(l)}</span><span class="mi-r">${state.scope === v ? icon("check", "ic-s") : ""}</span></button>`).join("")}`, { align: "right" });
  };
})();

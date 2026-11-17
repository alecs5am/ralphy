/* Ralphy panel: Trends, a page under Content. The hosted trend base by niche, led by the outlier multiplier. */
(function () {
  "use strict";
  const RP = window.RP, { esc, icon } = RP, state = RP.state, data = RP.data, UI = RP.ui, V = RP.views, A = RP.actions;
  const t = state.trends;
  const tip = UI.tip;
  const SORTS = { outliers: (a, b) => (b.multiplier ?? -1) - (a.multiplier ?? -1), views: (a, b) => (b.views ?? -1) - (a.views ?? -1), newest: (a, b) => String(b.published_at || "").localeCompare(String(a.published_at || "")) };

  RP.trendNiche = () => {
    const niches = data.trends?.niches || [], slugs = niches.map((n) => n.slug);
    const wanted = [state.route.niche, t.niche, ...(data.accounts || []).map((a) => a.niche)].find((s) => s && slugs.includes(s));
    return wanted || slugs[0] || null;
  };
  const offline = (err) => UI.empty({ iconName: "trend", title: "Trends are offline", text: err?.message || "", actions: `<div class="row"><button class="btn" data-act="trends-retry">${icon("refresh", "ic-s")}Retry</button><button class="btn btn-plain" data-act="copy" data-text="ralphy doctor" data-toast="Check command copied">Copy check</button></div>` });

  V.trends = () => {
    if (data.errors.trends) return offline(data.errors.trends);
    if (!data.trends) return '<div class="tr-list skeleton">' + '<div class="trow"><span class="thumb thumb-l"></span></div>'.repeat(6) + "</div>";
    const niche = RP.trendNiche();
    if (!niche) return UI.empty({ iconName: "trend", title: "No niches yet" });
    const info = data.trends.niches.find((n) => n.slug === niche), feed = data.niches[niche];
    const old = info?.updated_at && Date.now() - new Date(info.updated_at) > 7 * 86400e3;
    const ctl = `<div class="ctl tr-ctl" id="ctl">${UI.seg({ key: "tsort", label: "Order", act: "trends-sort", value: t.sort, options: [["outliers", "Outliers"], ["views", "Views"], ["newest", "Newest"]] })}
      <div class="ctl-actions"><span class="tr-niche">${UI.select({ value: niche, act: "trends-niche", label: "Niche", align: "right", options: data.trends.niches.map((n) => [n.slug, n.name, `${RP.compact(n.videos)} videos`]) })}${old ? `<span class="glyph glyph-s g-warn tr-old" ${tip(`Updated ${RP.ago(info.updated_at)}`)}>${icon("clock")}</span>` : ""}</span></div></div>`;
    if (!feed) return ctl + '<div class="tr-list skeleton">' + '<div class="trow"><span class="thumb thumb-l"></span></div>'.repeat(6) + "</div>";
    if (feed.error) return ctl + offline(feed.error);
    const q = state.query.trim().toLowerCase();
    const items = feed.items.map((it, i) => ({ ...it, i })).filter((it) => !q || `${it.title} ${it.author}`.toLowerCase().includes(q)).sort(SORTS[t.sort]);
    if (!items.length) return ctl + UI.empty({ iconName: "search", title: "Nothing here" });
    const shown = items.slice(0, t.limit);
    return ctl + `<div class="tr-list">${shown.map(row).join("")}</div>${items.length > shown.length ? `<div class="tr-more"><button class="btn btn-plain" data-act="trends-more">Show all ${items.length}</button></div>` : ""}`;
  };
  const row = (it) => `<div class="trow" role="button" tabindex="0" data-act="trend-open" data-i="${it.i}">
      <span class="thumb thumb-l">${icon("film")}${it.thumbnail ? `<img src="${esc(it.thumbnail)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}</span>
      <div class="lrow-b"><div class="trow-t">${esc(it.title || it.url)}</div>
        <div class="lrow-m">${UI.plat(it.platform)}<span class="ell">${esc(it.author || "")}</span>${it.published_at ? `<span class="nowrap">${esc(RP.ago(it.published_at))}</span>` : ""}</div></div>
      <div class="trow-x"><b class="t-num" ${tip("Views against the creator's usual")}>${RP.mult(it.multiplier)}</b><span class="t-foot t-num">${RP.compact(it.views)}</span></div>
    </div>`;

  V.trendSheet = (index) => {
    const niche = RP.trendNiche(), it = data.niches[niche]?.items?.[index]; if (!it) return "";
    const account = state.scope !== "all" && state.scope !== "inbox" ? RP.face(state.scope) : null;
    const ask = `Reverse this reference into a new video${account ? ` for the ${account.name} account (${account.slug})` : ""}: ${it.url}\nPull it with ralphy tool pull ${it.url}, then follow the reverse skill.`;
    const body = `<div class="ref-stage">${it.thumbnail ? `<img class="ref-amb" src="${esc(it.thumbnail)}" alt="" referrerpolicy="no-referrer">` : ""}
        <a class="ref-screen" href="${esc(it.url)}" target="_blank" rel="noopener" aria-label="Open the source">${icon("film", "ic-l")}${it.thumbnail ? `<img src="${esc(it.thumbnail)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}<span class="ref-play"><i>${icon("ext")}</i></span></a></div>
      <div class="ref-b">
        <div><div class="ref-t">${esc(it.title || it.url)}</div>
          <div class="row ref-m">${UI.plat(it.platform)}<span class="ell muted">${esc(it.author || "")}</span>${it.published_at ? `<span class="muted nowrap">${esc(RP.date(it.published_at))}</span>` : ""}</div></div>
        <div class="stats"><div class="stat"><b class="t-num">${RP.mult(it.multiplier)}</b><span>vs usual</span></div><div class="stat"><b class="t-num">${RP.compact(it.views)}</b><span>views</span></div><div class="stat"><b class="t-num">${RP.compact(it.likes)}</b><span>likes</span></div></div>
        ${it.hook ? `<div class="group"><div class="cell"><span class="muted">Hook</span><span class="cell-v">${esc(it.hook)}</span></div>${it.format ? `<div class="cell"><span class="muted">Format</span><span class="cell-v">${esc(it.format)}</span></div>` : ""}</div>` : ""}
      </div>`;
    const foot = `<a class="btn" href="${esc(it.url)}" target="_blank" rel="noopener">${icon("ext", "ic-s")}Open</a><button class="btn btn-primary" data-act="ask" data-text="${esc(ask)}">${icon("send", "ic-s")}Copy for the agent</button>`;
    return UI.sheet({ title: esc(it.title || "Reference"), body, foot, cls: "sheet-media" });
  };

  /* ---------- actions ---------- */
  A["trends-sort"] = (el) => { t.sort = el.dataset.v; RP.render(); };
  A["trends-niche"] = ({ value }) => { t.niche = value; RP.remember("niche", value); t.limit = 60; RP.go({ tab: "trends", niche: value }, true); };
  A["trends-more"] = () => { t.limit = Infinity; RP.render({ keepScroll: true }); };
  A["trends-retry"] = async () => { delete data.errors.trends; const n = RP.trendNiche(); if (n) delete data.niches[n]; RP.render(); await RP.ensureTrends(); };
  A["trend-open"] = (el) => { state.overlay = { type: "trend", index: Number(el.dataset.i) }; RP.renderOverlay(); };
  RP.ensureTrends = async () => {
    if (!data.trends && !data.errors.trends) { await RP.loadTrends(); RP.render(); }
    const niche = RP.trendNiche();
    if (niche && !data.niches[niche]) { await RP.loadNiche(niche); if (state.route.tab === "trends") RP.render(); }
  };
})();

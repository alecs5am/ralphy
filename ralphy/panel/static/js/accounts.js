/* Ralphy panel: Accounts. One card per media persona with its platforms; the account sheet holds its posts. */
(function () {
  "use strict";
  const RP = window.RP, { esc, icon } = RP, state = RP.state, data = RP.data, UI = RP.ui, V = RP.views, A = RP.actions;
  const tip = UI.tip;

  UI.acctSeg = () => UI.seg({ key: "acct-view", label: "View", act: "tab", attr: "tab", value: state.route.tab === "schedule" ? "schedule" : "accounts", options: [["accounts", "Accounts"], ["schedule", "Schedule"]] });

  const fact = (a) => {
    const posts = a.posts || [], attention = posts.filter((p) => RP.ATTENTION.includes(p.status)).length;
    if (attention) return `<span class="acct-f is-warn">${attention} to check</span>`;
    const planned = posts.filter((p) => RP.UPCOMING.includes(p.status)).length, posted = posts.filter((p) => p.status === "published").length;
    const parts = [planned ? `${planned} planned` : "", posted ? `${posted} posted` : ""].filter(Boolean);
    if (parts.length) return `<span class="acct-f">${parts.join(" · ")}</span>`;
    return `<span class="acct-f">${RP.plural(a.videos, "video")}${(a.platforms || []).length ? "" : " · No platforms yet"}</span>`;
  };
  const badges = (a) => (a.platforms || []).map((p) => { const s = UI.session(p.status); return `<span class="pbadge" ${tip(`${UI.platName(p.platform)} ${UI.handle(p.handle)} · ${s.label}`)}>${UI.plat(p.platform).replace(/data-tip="[^"]*"/, "")}<i class="dot dot-${s.dot}"></i></span>`; }).join("");

  V.accounts = () => {
    const ctl = `<div class="ctl" id="ctl">${UI.acctSeg()}</div>`;
    if (!data.accounts) return ctl + (data.errors.accounts ? UI.empty({ iconName: "exclaim", title: "Can't read the accounts", text: data.errors.accounts.message }) : "");
    if (!data.accounts.length) return ctl + UI.empty({ iconName: "user", title: "No accounts yet", actions: `<button class="btn btn-tint" data-act="ask" data-text="${esc('Create my first Ralphy account: ralphy account new "<name>" --niche <niche>')}">${icon("send", "ic-s")}Copy for the agent</button>` });
    const q = state.query.trim().toLowerCase();
    const list = data.accounts.filter((a) => !q || `${a.name} ${a.slug}`.toLowerCase().includes(q));
    return ctl + `<div class="acct-list">${list.map((a) => `<button class="acct" data-act="account-open" data-slug="${esc(a.slug)}" aria-label="${esc(a.name)}">
        ${UI.avatar(a.slug)}
        <span class="lrow-b"><span class="lrow-t ell">${esc(a.name)}</span>${fact(a)}</span>
        <span class="acct-plats">${badges(a)}</span>${icon("right")}
      </button>`).join("")}</div>`;
  };

  /* ---------- the account sheet ---------- */
  const SESSION_FIX = { needs_login: ["Reconnect", "login"], unknown: ["Check", "check"], paused: ["Check", "check"] };
  const platformRows = (a) => {
    const rows = (a.platforms || []).map((p) => {
      const s = UI.session(p.status), fix = SESSION_FIX[p.status];
      const cmd = fix ? `ralphy account ${fix[1]} ${a.slug} ${p.platform}` : "";
      return `<div class="cell">${UI.plat(p.platform)}<span class="grow"><span class="ell">${esc(UI.handle(p.handle) || UI.platName(p.platform))}</span>${p.status !== "ok" ? `<span class="t-foot">${esc(s.label)}${p.checked_at ? ` · ${esc(RP.ago(p.checked_at))}` : ""}</span>` : ""}</span>
        ${fix ? `<button class="btn btn-sm btn-tint" data-act="ask" data-text="${esc(cmd)}" ${tip("Copies the command for the agent")}>${icon("send", "ic-s")}${fix[0]}</button>` : UI.glyph(s.tone, s.icon, "", s.label)}</div>`;
    });
    rows.push(`<button class="cell acct-off" data-act="ask" data-text="${esc(`Connect a platform to the ${a.name} account: ralphy account login ${a.slug} <tiktok|youtube|instagram|x>`)}">${icon("plus")}<span class="grow">Connect a platform</span>${icon("send", "ic-s")}</button>`);
    return `<div class="group">${rows.join("")}</div>`;
  };
  const numerals = (a) => {
    const t = a.totals || {};
    const stat = (n, label) => `<div class="stat"><b class="t-num">${n == null ? "–" : RP.compact(n)}</b><span>${label}</span></div>`;
    const latest = (a.latest_stats || [])[0];
    if (!latest) return "";
    return `<div class="stats acct-stats" ${tip(`As of ${RP.stamp(latest.fetched_at)}`)}>${stat(t.views, "views")}${stat(t.likes, "likes")}${stat(t.comments, "comments")}</div>`;
  };
  const viewsFor = (a, post) => {
    const s = (a.latest_stats || []).find((r) => (post.url && r.url === post.url) || (r.content === post.content && r.platform === post.platform));
    return s?.views;
  };
  V.accountSheet = (slug) => {
    const a = RP.account(slug); if (!a) return "";
    const posts = (a.posts || []).map((p) => ({ ...p, views: p.status === "published" ? viewsFor(a, p) : null }));
    const attention = posts.filter((p) => RP.ATTENTION.includes(p.status));
    const upcoming = posts.filter((p) => RP.UPCOMING.includes(p.status));
    const posted = posts.filter((p) => p.status === "published").reverse();
    const cancelled = posts.filter((p) => p.status === "cancelled");
    const section = (title, list, cls = "") => (list.length ? `<div class="sect ${cls}">${title}<span class="n">${list.length}</span></div><div class="list acct-posts">${list.map((p) => UI.postRow(p, { dest: "plat" })).join("")}</div>` : "");
    const plan = `<div class="group"><button class="cell" data-act="ask" data-text="${esc(`Plan a post for the ${a.name} account: ralphy post plan <content-id> --to ${a.slug}:<platform> --at <ISO time> --caption "<caption>"`)}">${icon("plus")}<span class="grow">Plan a post</span>${icon("send", "ic-s")}</button></div>`;
    const lead = UI.avatar(a.slug);
    const title = `<span class="ell">${esc(a.name)}</span><div class="t-sub ell">${esc([a.niche, a.schedule].filter(Boolean).join(" · ") || RP.plural(a.videos, "video"))}</div>`;
    const videos = `<div class="group"><button class="cell" data-act="account-videos" data-slug="${esc(a.slug)}">${icon("film")}<span class="grow">Videos</span><span class="cell-v t-num">${a.videos}</span>${icon("right", "ic-s")}</button></div>`;
    const body = `<div class="sect">Platforms</div>${platformRows(a)}
      ${numerals(a)}
      ${videos}
      ${section("Needs a look", attention, "is-bad")}
      ${section("Upcoming", upcoming)}
      ${plan}
      ${section("Posted", posted)}
      ${section("Cancelled", cancelled)}
      `;
    return UI.sheet({ title, label: a.name, body, cls: "acct-sheet", lead });
  };

  /* ---------- actions ---------- */
  A["account-open"] = (el) => RP.go({ tab: "accounts", account: el.dataset.slug });
  A["account-videos"] = (el) => { state.scope = el.dataset.slug; RP.remember("scope", state.scope); state.overlay = null; RP.go({ tab: "content" }); };
  A["post-menu"] = (el) => {
    const post = RP.allPosts().find((p) => p.id === el.dataset.post); if (!post) return;
    const ask = (text, label, ic = "send") => `<button class="mi" data-act="ask" data-text="${esc(text)}">${icon(ic, "ic-s")}<span class="mi-l">${label}</span></button>`;
    const items = [
      post.status === "planned" ? `<button class="mi" data-act="post-approve" data-post="${esc(post.id)}">${icon("check", "ic-s")}<span class="mi-l">Approve</span></button>` : "",
      ["failed", "needs_login"].includes(post.status) ? ask(`Retry post ${post.id} after checking the ${UI.platName(post.platform)} session: ralphy account check ${post.account} ${post.platform}, then ralphy post run ${post.id}`, "Retry") : "",
      post.status === "unknown" ? ask(`Check whether post ${post.id} went live on ${UI.platName(post.platform)} ${UI.handle(post.handle)}, then record it: ralphy post resolve ${post.id} --url <post url> (or --failed)`, "Resolve") : "",
      ["planned", "approved", "failed", "needs_login"].includes(post.status) ? `<button class="mi is-danger" data-act="post-cancel" data-post="${esc(post.id)}">${icon("x", "ic-s")}<span class="mi-l">Cancel post</span></button>` : "",
    ].filter(Boolean).join("");
    RP.openMenu(el, `${items}<hr class="sep"><button class="mi" data-act="copy" data-text="${esc(post.id)}" data-toast="Post id copied">${icon("copy", "ic-s")}<span class="mi-l">Copy id</span></button>`, { align: "right" });
  };
  const postAction = async (id, action, done) => {
    RP.closeMenu();
    const key = `post:${id}`; state.busy[key] = true; RP.repaint();
    try {
      await RP.post(`/api/posts/${encodeURIComponent(id)}/${action}`);
      await Promise.all([RP.loadAccounts(), RP.loadContent()]);
      const open = state.viewer?.id; if (open) await RP.loadDetail(open);
      RP.toast(done);
    } catch (e) { RP.toast(e.message, "exclaim", "is-bad"); }
    delete state.busy[key];
    RP.repaint(); RP.viewerRefresh?.();
  };
  A["post-approve"] = (el, e) => { e?.stopPropagation(); postAction(el.dataset.post, "approve", "Approved"); };
  A["post-cancel"] = (el, e) => { e?.stopPropagation(); postAction(el.dataset.post, "cancel", "Post cancelled"); };
})();

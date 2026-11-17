/* Ralphy panel: Accounts. One card per media persona with its platforms; the account sheet holds its posts. */
(function () {
  "use strict";
  const RP = window.RP, { esc, icon } = RP, state = RP.state, data = RP.data, UI = RP.ui, V = RP.views, A = RP.actions;
  const tip = UI.tip;

  UI.acctSeg = () => UI.seg({ key: "acct-view", label: "View", act: "tab", attr: "tab", value: state.route.tab === "schedule" ? "schedule" : "accounts", options: [["accounts", "Accounts"], ["schedule", "Schedule"]] });

  const videosOf = (posts) => new Set(posts.map((p) => p.content)).size;
  const fact = (a) => {
    const posts = a.posts || [], attention = posts.filter((p) => RP.ATTENTION.includes(p.status)).length;
    if (attention) return `<span class="acct-f is-warn">${attention} to check</span>`;
    const live = videosOf(posts.filter((p) => p.status === "published")), planned = videosOf(posts.filter((p) => RP.UPCOMING.includes(p.status)));
    const parts = [live ? `${live} live` : "", planned ? `${planned} planned` : ""].filter(Boolean);
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
  /* the numbers of the posts Ralphy made here, newest snapshot of each */
  const numerals = (a) => {
    const t = a.totals || {};
    if (!t.posts) return "";
    const stat = (n, label) => `<div class="stat"><b class="t-num">${n == null ? "–" : RP.compact(n)}</b><span>${label}</span></div>`;
    return `<div class="sect">Results<span class="n">${t.at ? esc(RP.ago(t.at)) : ""}</span><button class="ibtn sect-x" data-act="ask" data-text="${esc(`ralphy stats fetch ${a.slug}`)}" aria-label="Update the numbers" ${tip("Update the numbers: copies the command for the agent")}>${icon("refresh")}</button></div>
      <div class="stats acct-stats">${stat(t.views, "views")}${stat(t.likes, "likes")}${stat(t.comments, "comments")}</div>`;
  };
  /* one row per video: its posts side by side, one platform mark each */
  const groupBy = (posts, key) => { const out = new Map(); for (const p of posts) { const k = key(p); if (!out.has(k)) out.set(k, []); out.get(k).push(p); } return [...out.values()]; };
  const byPlatform = UI.byPlatform;
  const head = (posts) => {
    const item = RP.item(posts[0].content);
    return { item, title: item ? UI.shortTitle(item.title) : posts[0].content };
  };
  const postedRow = (posts) => {
    const { item, title } = head(posts), when = posts.map((p) => p.posted_at || "").sort()[0];
    const marks = [...posts].sort(byPlatform).map((p) => UI.plat(p.platform)).join("");
    const sum = (name) => { const v = posts.map((p) => p.stats?.[name]).filter((n) => n != null); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
    return `<div class="lrow prow" ${item ? `role="button" tabindex="0" data-act="open-item" data-id="${esc(item.id)}" data-tab="posts"` : ""} aria-label="${esc(title)}: open its numbers">
      ${UI.thumb(item?.poster)}
      <div class="lrow-b"><div class="lrow-t ell">${esc(title)}</div>
        <div class="lrow-m"><span class="marks">${marks}</span>${UI.metrics({ views: sum("views"), likes: sum("likes"), comments: sum("comments") })}${when ? `<span class="t-num nowrap">${esc(RP.day(when))}</span>` : ""}</div></div>
      <div class="prow-x">${icon("right", "ic-s muted")}</div>
    </div>`;
  };
  const upcomingRow = (posts) => {
    const { item, title } = head(posts), when = RP.postWhen(posts[0]);
    const ids = posts.map((p) => p.id).join(","), planned = posts.filter((p) => p.status === "planned");
    const busy = posts.some((p) => state.busy[`post:${p.id}`]);
    const marks = [...posts].sort(byPlatform).map((p) => UI.plat(p.platform)).join("");
    const trail = planned.length
      ? `<button class="btn btn-sm btn-tint" data-act="post-approve" data-post="${esc(planned.map((p) => p.id).join(","))}" ${busy ? "disabled" : ""} ${tip("Allow the agent to upload it")}>${busy ? '<i class="spin"></i>' : icon("check", "ic-s")}Approve</button>`
      : posts[0].status === "approved" ? "" : UI.postGlyph(posts[0].status);  // approved is what Upcoming means
    return `<div class="lrow prow" ${item ? `role="button" tabindex="0" data-act="open-item" data-id="${esc(item.id)}" data-tab="posts"` : ""}>
      ${UI.thumb(item?.poster)}
      <div class="lrow-b"><div class="lrow-t ell">${esc(title)}</div>
        <div class="lrow-m"><span class="marks">${marks}</span>${when ? `<span class="t-num nowrap">${esc(RP.stamp(when))}</span>` : "<span>On the next run</span>"}</div></div>
      <div class="prow-x">${trail}<button class="ibtn" data-act="post-menu" data-post="${esc(ids)}" aria-haspopup="menu" aria-label="More">${icon("more")}</button></div>
    </div>`;
  };
  V.accountSheet = (slug) => {
    const a = RP.account(slug); if (!a) return "";
    const posts = a.posts || [];
    const attention = posts.filter((p) => RP.ATTENTION.includes(p.status));
    const upcoming = groupBy(posts.filter((p) => RP.UPCOMING.includes(p.status)), (p) => `${p.content}|${p.scheduled_at || ""}`);
    const posted = groupBy(posts.filter((p) => p.status === "published"), (p) => p.content)
      .sort((x, y) => String(y.map((p) => p.posted_at).sort().pop()).localeCompare(String(x.map((p) => p.posted_at).sort().pop())));
    const section = (title, n, rows, cls = "") => (n ? `<div class="sect ${cls}">${title}<span class="n">${n}</span></div><div class="list acct-posts">${rows}</div>` : "");
    const plan = `<button class="cell" data-act="ask" data-text="${esc(`Plan a post for the ${a.name} account: ralphy post plan <content-id> --to ${a.slug}:<platform> --at <ISO time> --caption "<caption>"`)}">${icon("plus")}<span class="grow">Plan a post</span>${icon("send", "ic-s")}</button>`;
    const lead = UI.avatar(a.slug);
    const live = posted.length, planned = upcoming.length;
    const sub = [live ? `${live} live` : "", planned ? `${planned} planned` : "", !live && !planned ? RP.plural(a.videos, "video") : ""].filter(Boolean).join(" · ");
    const title = `<span class="ell">${esc(a.name)}</span><div class="t-sub ell">${esc(sub)}</div>`;
    const videos = `<button class="cell" data-act="account-videos" data-slug="${esc(a.slug)}">${icon("film")}<span class="grow">Videos</span><span class="cell-v t-num">${a.videos}</span>${icon("right", "ic-s")}</button>`;
    const body = `<div class="sect">Platforms</div>${platformRows(a)}
      ${section("Needs a look", attention.length, attention.map((p) => UI.postRow(p, { dest: "plat" })).join(""), "is-bad")}
      ${numerals(a)}
      ${section("Posted", live, posted.map(postedRow).join(""))}
      ${section("Upcoming", planned, upcoming.map(upcomingRow).join(""))}
      <div class="group mt">${plan}${videos}</div>`;
    return UI.sheet({ title, label: a.name, body, cls: "acct-sheet", lead });
  };

  /* ---------- actions ---------- */
  A["account-open"] = (el) => RP.go({ tab: "accounts", account: el.dataset.slug });
  A["account-videos"] = (el) => { state.scope = el.dataset.slug; RP.remember("scope", state.scope); state.overlay = null; RP.go({ tab: "content" }); };
  A["post-menu"] = (el) => {
    const ids = el.dataset.post.split(","), group = RP.allPosts().filter((p) => ids.includes(p.id)); if (!group.length) return;
    const post = group[0], many = group.length > 1;
    const ask = (text, label, ic = "send") => `<button class="mi" data-act="ask" data-text="${esc(text)}">${icon(ic, "ic-s")}<span class="mi-l">${label}</span></button>`;
    const planned = group.filter((p) => p.status === "planned").map((p) => p.id);
    const cancellable = group.filter((p) => ["planned", "approved", "failed", "needs_login"].includes(p.status)).map((p) => p.id);
    const items = [
      planned.length ? `<button class="mi" data-act="post-approve" data-post="${esc(planned.join(","))}">${icon("check", "ic-s")}<span class="mi-l">Approve</span></button>` : "",
      !many && ["failed", "needs_login"].includes(post.status) ? ask(`Retry post ${post.id} after checking the ${UI.platName(post.platform)} session: ralphy account check ${post.account} ${post.platform}, then ralphy post run ${post.id}`, "Retry") : "",
      !many && post.status === "unknown" ? ask(`Check whether post ${post.id} went live on ${UI.platName(post.platform)} ${UI.handle(post.handle)}, then record it: ralphy post resolve ${post.id} --url <post url> (or --failed)`, "Resolve") : "",
      cancellable.length ? `<button class="mi is-danger" data-act="post-cancel" data-post="${esc(cancellable.join(","))}">${icon("x", "ic-s")}<span class="mi-l">${many ? "Cancel these posts" : "Cancel post"}</span></button>` : "",
    ].filter(Boolean).join("");
    RP.openMenu(el, `${items}<hr class="sep"><button class="mi" data-act="copy" data-text="${esc(ids.join(" "))}" data-toast="${many ? "Post ids copied" : "Post id copied"}">${icon("copy", "ic-s")}<span class="mi-l">${many ? "Copy ids" : "Copy id"}</span></button>`, { align: "right" });
  };
  const postAction = async (ids, action, done) => {
    RP.closeMenu();
    const list = ids.split(",").filter(Boolean);
    for (const id of list) state.busy[`post:${id}`] = true;
    RP.repaint();
    try {
      for (const id of list) await RP.post(`/api/posts/${encodeURIComponent(id)}/${action}`);
      await Promise.all([RP.loadAccounts(), RP.loadContent()]);
      const open = state.viewer?.id; if (open) await RP.loadDetail(open);
      RP.toast(done);
    } catch (e) { RP.toast(e.message, "exclaim", "is-bad"); }
    for (const id of list) delete state.busy[`post:${id}`];
    RP.repaint(); RP.viewerRefresh?.();
  };
  A["post-approve"] = (el, e) => { e?.stopPropagation(); postAction(el.dataset.post, "approve", "Approved"); };
  A["post-cancel"] = (el, e) => { e?.stopPropagation(); postAction(el.dataset.post, "cancel", "Post cancelled"); };
})();

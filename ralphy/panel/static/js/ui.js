/* Ralphy panel: component markup. A state is one glyph, an account is a dot, an explanation is a tooltip. */
(function () {
  "use strict";
  const RP = window.RP, { esc, icon } = RP, state = RP.state;
  const UI = (RP.ui = {});
  const tip = (UI.tip = (text) => (text ? `data-tip="${esc(text)}"` : ""));

  /* ---------- states ---------- */
  const POST = {
    planned: { label: "Planned", icon: "calendar", tone: "soft" },
    approved: { label: "Approved", icon: "clock", tone: "accent" },
    uploading: { label: "Uploading", icon: "publish", tone: "accent", spin: true },
    published: { label: "Published", icon: "check", tone: "ok" },
    unknown: { label: "Check the post", icon: "eye", tone: "warn" },
    failed: { label: "Failed", icon: "exclaim", tone: "bad" },
    needs_login: { label: "Needs login", icon: "lock", tone: "bad" },
    cancelled: { label: "Cancelled", icon: "x", tone: "soft" },
  };
  const SESSION = {
    ok: { label: "Signed in", icon: "check", tone: "ok", dot: "ok" },
    needs_login: { label: "Needs login", icon: "lock", tone: "bad", dot: "bad" },
    paused: { label: "Paused", icon: "pause", tone: "warn", dot: "warn" },
    unknown: { label: "Not checked", icon: "help", tone: "soft", dot: "none" },
  };
  UI.post = (status) => POST[status] ?? { label: status || "Unknown", icon: "circle", tone: "soft" };
  UI.session = (status) => SESSION[status] ?? SESSION.unknown;
  UI.glyph = (tone, name, cls = "", hint = "") => `<span class="glyph g-${tone} ${cls}" ${tip(hint)} role="img" aria-label="${esc(hint)}">${icon(name)}</span>`;
  UI.postGlyph = (status, cls = "") => { const d = UI.post(status); return d.spin ? `<i class="spin ${cls}" ${tip(d.label)} role="img" aria-label="${esc(d.label)}"></i>` : UI.glyph(d.tone, d.icon, cls, d.label); };
  UI.postBadge = (status) => { const d = UI.post(status); return `<span class="st st-${d.tone}">${d.spin ? '<i class="spin"></i>' : icon(d.icon, "ic-s")}<span>${esc(d.label)}</span></span>`; };

  const PLATFORM = { instagram: ["IG", "Instagram"], tiktok: ["TT", "TikTok"], youtube: ["YT", "YouTube"], x: ["X", "X"] };
  UI.platName = (p) => (PLATFORM[String(p || "").toLowerCase()] ?? [null, p || "Platform"])[1];
  UI.plat = (p) => { const d = PLATFORM[String(p || "").toLowerCase()] ?? [String(p || "?").slice(0, 2).toUpperCase(), p]; return `<span class="plat" ${tip(d[1])}>${d[0]}</span>`; };
  UI.dot = (slug, hint = true) => { const f = RP.face(slug); return `<i class="dot dot-${f.color}" ${hint ? tip(f.name) : ""}></i>`; };
  UI.avatar = (slug, cls = "") => { const f = RP.face(slug); return `<span class="avatar ${cls}" style="--c: var(--${f.color})" aria-hidden="true">${esc(f.monogram)}</span>`; };
  UI.handle = (h) => (h ? (String(h).startsWith("@") ? String(h) : `@${h}`) : "");
  UI.dest = (post) => `${UI.dot(post.account)}${UI.plat(post.platform)}<span class="ell">${esc(UI.handle(post.handle) || UI.platName(post.platform))}</span>`;

  /* ---------- small parts ---------- */
  UI.empty = ({ title, text = "", actions = "", iconName = "library" }) => `<div class="empty">${icon(iconName)}<h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ""}${actions}</div>`;
  UI.thumb = (src, cls = "", empty = "film") => `<span class="thumb ${cls}">${src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async">` : icon(empty)}</span>`;
  UI.pathline = (path, label = "Copy path") => `<div class="pathline"><bdi class="mono ell" ${tip(path)}>&lrm;${esc(path)}</bdi><button class="ibtn" data-act="copy" data-text="${esc(path)}" data-toast="Path copied" aria-label="${esc(label)}" ${tip(label)}>${icon("copy")}</button></div>`;
  UI.seg = ({ key, options, value, act, attr = "v", cls = "", label = "" }) => `<div class="seg ${cls}" data-seg="${key}" role="tablist" aria-label="${esc(label)}">${options.map(([v, text, n]) =>
    `<button role="tab" aria-selected="${v === value}" data-act="${act}" data-${attr}="${esc(v)}">${text}${n != null && n !== "" ? `<span class="n">${n}</span>` : ""}</button>`).join("")}</div>`;
  /* the custom select: a pop-up button and a menu of choices */
  UI.select = ({ value, options, act, label = "", cls = "", align = "" }) => {
    const current = options.find((o) => String(o[0]) === String(value)) ?? options[0];
    return `<button class="popbtn ${cls}" data-act="select-open" data-then="${act}" data-value="${esc(value)}" data-align="${align}" data-options="${esc(JSON.stringify(options))}" aria-haspopup="menu" aria-expanded="false" aria-label="${esc(label)}: ${esc(current?.[1] ?? "")}"><span class="ell">${esc(current?.[1] ?? "")}</span>${icon("updown", "ic-s")}</button>`;
  };
  UI.sheet = ({ title, body, foot = "", cls = "", label, head = "", lead = "" }) => `<div class="ov"><button class="ov-scrim" data-act="close" aria-label="Close" tabindex="-1"></button>
    <div class="sheet ${cls}" role="dialog" aria-modal="true" aria-label="${esc(label ?? title)}" tabindex="-1">
      <div class="sheet-h">${lead}<h2>${title}</h2>${head}<button class="ibtn ibtn-fill" data-act="close" aria-label="Close" ${tip("Close  Esc")}>${icon("x")}</button></div>
      <div class="sheet-b">${body}</div>${foot ? `<div class="sheet-f">${foot}</div>` : ""}</div></div>`;

  /* ---------- content card: a poster and a title ---------- */
  UI.cardState = (item) => {
    const p = item.posts || {};
    if (p.attention) return UI.glyph("bad", "exclaim", "p-state", "A post needs a look");
    if (p.planned) return UI.glyph("accent", "clock", "p-state", `${RP.plural(p.planned, "post")} planned`);
    if (p.published) return UI.glyph("ok", "check", "p-state", `Published ${p.published > 1 ? `${p.published} times` : ""}`.trim());
    return "";
  };
  /* the render's state in words: fresh, older than the code it was made from, or none yet */
  UI.renderState = (item) => (!item.render ? "Not rendered" : item.render_stale ? "Render is older than the code" : "Rendered");
  UI.cardLabel = (item) => [item.title, UI.renderState(item).toLowerCase(),
    item.duration ? RP.dur(item.duration) : "", item.versions.length > 1 ? `${item.versions.length} versions` : "",
    item.posts?.published ? "published" : "", item.posts?.planned ? "planned" : ""].filter(Boolean).join(". ");
  /* no render yet: the quiet placeholder, and the working tree's frame at 1 s on top once it is on screen */
  UI.placeholder = (item) => `<div class="p-empty">${icon(item.live ? "note" : "film", "ic-l")}<span>${esc(item.live ? "Not rendered" : "Brief")}</span></div>`;
  UI.card = (item) => {
    const n = item.versions.length;
    const caps = `${n > 1 ? `${icon("stack")}${n}` : ""}${item.audio === false ? icon("mute") : ""}`;
    const live = !item.poster && item.live_url;
    return `<article class="card" tabindex="0" role="button" draggable="true" data-drag-path="${esc(item.drag_path)}" data-drag-label="${esc(item.title)}" data-act="open-item" data-id="${esc(item.id)}" aria-label="${esc(UI.cardLabel(item))}">
      <div class="poster ${item.poster ? "" : "is-empty"}" data-media="${esc(item.media_url || "")}" ${live ? `data-live="${esc(item.live_url)}"` : ""}>
        ${item.poster ? `<img src="${esc(item.poster)}" alt="" loading="lazy" decoding="async">` : UI.placeholder(item)}
        ${UI.cardState(item)}
        <div class="p-meta">${item.render_stale ? `<span class="p-cap p-stale" aria-hidden="true">${icon("refresh")}</span>` : ""}${caps ? `<span class="p-cap">${caps}</span>` : ""}${item.duration ? `<span class="p-cap p-dur">${RP.dur(item.duration)}</span>` : ""}</div>
      </div>
      <div class="card-t">${esc(UI.shortTitle(item.title))}</div>
    </article>`;
  };
  UI.row = (item) => `<div class="lrow" tabindex="0" role="button" draggable="true" data-drag-path="${esc(item.drag_path)}" data-drag-label="${esc(item.title)}" data-act="open-item" data-id="${esc(item.id)}" aria-label="${esc(UI.cardLabel(item))}">
      ${UI.thumb(item.poster)}
      <div class="lrow-b"><div class="lrow-t ell">${esc(UI.shortTitle(item.title))}</div>
        <div class="lrow-m">${UI.dot(item.account)}<span>${esc(UI.renderState(item))}</span>${item.duration ? `<span class="t-num">${RP.dur(item.duration)}</span>` : ""}${item.versions.length > 1 ? `<span class="row" style="gap:3px">${icon("stack", "ic-s")}${item.versions.length}</span>` : ""}</div></div>
      ${UI.cardState(item).replace("p-state", "")}
    </div>`;
  /* Titles carry a long tail after a dash ("TYPE CLOCK — minimalist motion component"); a card shows the name. */
  UI.shortTitle = (title) => String(title || "").split(/\s+[—–-]\s+/)[0];
  UI.subtitle = (title) => { const parts = String(title || "").split(/\s+[—–-]\s+/); return parts.length > 1 ? parts.slice(1).join(" — ") : ""; };

  /* ---------- a post as a row ---------- */
  /* options: `when` shows the date and time, `lead` is the video thumb or the account face, `dest` drops the
     account dot where the account is already known (its own sheet) */
  UI.postRow = (post, { actions = true, showTitle = true, when: showWhen = true, lead = "thumb", dest = "full" } = {}) => {
    const item = RP.item(post.content), when = RP.postWhen(post);
    const title = item ? UI.shortTitle(item.title) : post.content;
    const busy = state.busy[`post:${post.id}`];
    const trail = !actions ? UI.postGlyph(post.status)
      : post.status === "planned" ? `<button class="btn btn-sm btn-tint" data-act="post-approve" data-post="${esc(post.id)}" ${busy ? "disabled" : ""} ${tip("Allow the agent to upload it")}>${busy ? '<i class="spin"></i>' : icon("check", "ic-s")}Approve</button><button class="ibtn" data-act="post-menu" data-post="${esc(post.id)}" aria-haspopup="menu" aria-label="More">${icon("more")}</button>`
      : ["approved", "failed", "needs_login", "unknown"].includes(post.status) ? `${UI.postGlyph(post.status)}<button class="ibtn" data-act="post-menu" data-post="${esc(post.id)}" aria-haspopup="menu" aria-label="More">${icon("more")}</button>`
      : post.url ? `${UI.postGlyph(post.status)}<a class="ibtn" href="${esc(post.url)}" target="_blank" rel="noopener" aria-label="Open the post" ${tip("Open the post")}>${icon("ext")}</a>`
      : UI.postGlyph(post.status);
    const where = dest === "plat" ? `${UI.plat(post.platform)}<span class="ell">${esc(UI.handle(post.handle))}</span>` : UI.dest(post);
    const head = lead === "avatar" ? esc(RP.face(post.account).name) : esc(title);
    return `<div class="lrow prow" ${item ? `role="button" tabindex="0" data-act="open-item" data-id="${esc(item.id)}" data-tab="posts" draggable="true" data-drag-path="${esc(item.drag_path)}" data-drag-label="${esc(title)}"` : ""}>
      ${lead === "avatar" ? UI.avatar(post.account, "avatar-s") : UI.thumb(item?.poster)}
      <div class="lrow-b">${showTitle ? `<div class="lrow-t ell">${head}</div>` : ""}
        <div class="lrow-m">${where}${when && showWhen ? `<span class="t-num nowrap">${esc(RP.stamp(when))}</span>` : ""}${post.views != null ? `<span class="nowrap">${RP.compact(post.views)} views</span>` : ""}</div>
        ${post.error && RP.ATTENTION.includes(post.status) ? `<div class="prow-e ell" ${tip(post.error)}>${esc(post.error)}</div>` : ""}</div>
      <div class="prow-x">${trail}</div>
    </div>`;
  };

  /* ---------- markdown, small and safe: headings, lists, quotes, code, links, emphasis ---------- */
  const inline = (text) => esc(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, "$1<i>$2</i>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  UI.markdown = (src) => {
    const lines = String(src || "").replace(/\r/g, "").split("\n"), out = [];
    let list = null, para = [], code = null;
    const flush = () => { if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para = []; } if (list) { out.push(`</${list}>`); list = null; } };
    for (const line of lines) {
      if (code !== null) { if (/^```/.test(line)) { out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`); code = null; } else code.push(line); continue; }
      if (/^```/.test(line)) { flush(); code = []; continue; }
      const h = /^(#{1,6})\s+(.*)$/.exec(line);
      if (h) { flush(); const level = Math.min(4, Math.max(3, h[1].length + 1)); out.push(`<h${level}>${inline(h[2])}</h${level}>`); continue; }
      const li = /^\s*(?:[-*+]|(\d+)[.)])\s+(.*)$/.exec(line);
      if (li) { if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para = []; } const tag = li[1] ? "ol" : "ul"; if (list !== tag) { if (list) out.push(`</${list}>`); out.push(`<${tag}>`); list = tag; } out.push(`<li>${inline(li[2])}</li>`); continue; }
      if (/^\s*>\s?/.test(line)) { flush(); out.push(`<blockquote>${inline(line.replace(/^\s*>\s?/, ""))}</blockquote>`); continue; }
      if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { flush(); continue; }
      if (!line.trim()) { flush(); continue; }
      if (list && /^\s{2,}\S/.test(line)) { out[out.length - 1] = out[out.length - 1].replace(/<\/li>$/, ` ${inline(line.trim())}</li>`); continue; }
      if (list) { out.push(`</${list}>`); list = null; }
      para.push(line.trim());
    }
    if (code !== null) out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
    flush();
    return `<div class="md">${out.join("")}</div>`;
  };
})();

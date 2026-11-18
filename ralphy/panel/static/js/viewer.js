/* Ralphy panel: the viewer. A dark stage for the render (or the code played live), a sheet for the facts.
   Sources: Render (render.mp4), Current (the working tree, live) and each saved version (live). Compare puts
   two of them side by side under one transport. */
(function () {
  "use strict";
  const RP = window.RP, { esc, icon } = RP, state = RP.state, data = RP.data, UI = RP.ui, A = RP.actions;
  const $ = (s) => document.querySelector(s);
  const tip = UI.tip;
  const vw = () => state.viewer;
  const detail = () => data.details[vw()?.id];

  /* ---------- sources ---------- */
  const sources = (d) => {
    const out = [];
    if (d.media_url) out.push({ key: "render", label: "Render", kind: "video", src: d.media_url, poster: d.poster, path: d.render, dur: d.duration, audio: d.audio, stale: d.render_stale, at: d.rendered_at });
    if (d.live_url) out.push({ key: "current", label: "Current", kind: "player", src: d.live_url, path: d.path });
    for (const v of [...(d.versions || [])].reverse()) out.push({ key: v.name, label: v.name, kind: v.preview_url ? "player" : "none", src: v.preview_url, path: v.path, note: v.note, at: v.saved_at, version: true });
    return out;
  };
  const source = (key) => sources(detail()).find((s) => s.key === key) || null;
  const defaultOn = (d) => { const first = sources(d)[0]; return first ? { kind: "src", key: first.key } : { kind: "none" }; };
  const onRef = () => { const d = detail(), on = vw().on; return on.kind === "ref" ? (d.refs || [])[on.index] : null; };
  /* what one screen plays: a file in <video>, code in the HyperFrames player, or nothing */
  const screenOf = (on = vw().on) => {
    const d = detail();
    if (on.kind === "src") { const s = source(on.key); return s && s.kind !== "none" ? s : { kind: "none", key: on.key, path: s?.path || d.path }; }
    if (on.kind === "ref") { const r = onRef(); return r?.media_url ? { kind: "video", src: r.media_url, poster: r.poster, path: r.video, label: "Reference" } : { kind: "none", path: r?.path }; }
    return { kind: "none", path: d.path };
  };
  const canCompare = () => sources(detail()).filter((s) => s.kind !== "none").length >= 2;
  const pairFor = (d, keep) => {
    const list = sources(d).filter((s) => s.kind !== "none").map((s) => s.key);
    const a = list.includes("render") ? "render" : list[0];
    const b = keep && keep !== a && list.includes(keep) ? keep : list.find((k) => k !== a && k === "current") || list.find((k) => k !== a);
    return { a, b, heard: "a" };
  };

  RP.openViewer = (id, opts = {}) => {
    const fromContent = state.route.tab === "content";
    state.viewer = { id, list: fromContent ? RP.visibleItems().map((i) => i.id) : [id], on: null, compare: null, tab: opts.tab || "notes", back: location.hash };
    RP.go({ view: id });
  };
  RP.closeViewer = () => {
    const id = vw()?.id, back = vw()?.back; stopMedia(); state.viewer = null;
    $("#viewer-root").innerHTML = "";
    document.querySelectorAll("#main, #hd").forEach((el) => { el.inert = false; });
    if (location.hash.startsWith("#/view/")) history.replaceState(null, "", back && !back.startsWith("#/view/") ? back : "#/content");
    RP.onRoute();
    if (id) requestAnimationFrame(() => { const card = document.querySelector(`[data-act="open-item"][data-id="${CSS.escape(id)}"]`); card?.focus({ preventScroll: true }); card?.scrollIntoView({ block: "nearest" }); });
  };
  RP.showViewer = async (id) => {
    if (!vw() || vw().id !== id) state.viewer = { id, list: RP.visibleItems().map((i) => i.id), on: null, compare: null, tab: "notes" };
    if (!data.details[id] || data.details[id].error) await RP.loadDetail(id);
    if (vw()?.id !== id) return;
    const d = detail();
    if (d.error) { $("#viewer-root").innerHTML = `<section class="viewer" id="viewer" role="dialog" aria-modal="true"><div class="v-stage"><div class="v-top"><button class="ibtn" data-act="viewer-close" aria-label="Back">${icon("left")}</button></div></div><div class="v-sheet">${UI.empty({ iconName: "exclaim", title: "Can't open this video", text: d.error.message })}</div></section>`; return; }
    if (!vw().on) vw().on = defaultOn(d);
    build();
  };

  /* ---------- build ---------- */
  function build() {
    const d = detail(), v = vw(), i = v.list.indexOf(v.id);
    document.querySelectorAll("#main, #hd").forEach((el) => { el.inert = true; });
    $("#viewer-root").innerHTML = `<section class="viewer" id="viewer" role="dialog" aria-modal="true" aria-label="${esc(d.title)}">
      <div class="v-stage">
        ${d.poster ? `<img class="v-ambient" src="${esc(d.poster)}" alt="">` : ""}
        <div class="v-top" id="v-top"></div>
        <div class="v-player">
          <button class="v-nav" data-act="viewer-step" data-d="-1" ${i <= 0 ? "disabled" : ""} aria-label="Previous video" ${tip("Previous  ←")}>${icon("left")}</button>
          <div class="v-frame" id="v-frame"></div>
          <button class="v-nav" data-act="viewer-step" data-d="1" ${i < 0 || i >= v.list.length - 1 ? "disabled" : ""} aria-label="Next video" ${tip("Next  →")}>${icon("right")}</button>
        </div>
        <div class="v-transport" id="v-transport"></div>
      </div>
      <div class="v-sheet" id="v-sheet">
        <div class="v-head" id="v-head"></div>
        <div class="v-details"><div id="v-tabs"></div><div class="v-body" id="v-body"></div></div>
      </div>
    </section>`;
    paintTop(); paintStage(true); paintHead(); paintTabs();
  }
  function paintTop() {
    const v = vw(), i = v.list.indexOf(v.id), el = $("#v-top"); if (!el) return;
    el.innerHTML = `<button class="ibtn" data-act="viewer-close" aria-label="Back to Content" ${tip("Back  Esc")}>${icon("left")}</button>
      <span class="v-pos grow">${v.list.length > 1 && i >= 0 ? `${i + 1} of ${v.list.length}` : ""}</span>
      ${canCompare() ? `<button class="ibtn" data-act="viewer-compare" aria-pressed="${!!v.compare}" aria-label="Compare" ${tip("Compare  C")}>${icon("compare")}</button>` : ""}
      <button class="ibtn" data-act="viewer-menu" aria-haspopup="menu" aria-label="More">${icon("more")}</button>`;
  }

  /* ---------- stage: one screen, or two under one clock ---------- */
  let screens = [];
  const stopMedia = () => { for (const el of screens) { try { el.pause?.(); } catch {} } screens = []; };
  const WHY = { 1: "Loading was stopped", 2: "The file could not be loaded", 3: "This browser can't decode the file", 4: "This browser can't open the file" };
  const ready = (el, fn) => { if (el.tagName === "VIDEO" || el.ready) fn(); else el.addEventListener("ready", fn, { once: true }); };
  const durOf = (el) => Number(el?.duration) || 0;
  /* the clock: the longer of the two, so the seek bar covers both */
  const master = () => screens.reduce((best, el) => (durOf(el) > durOf(best) ? el : best), screens[0]);
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const screenHtml = (s, pick) => {
    const label = pick ? pick : s.label ? `<span class="v-label">${s.kind === "player" ? icon("pulse", "ic-s") : ""}${esc(s.label)}</span>` : "";
    if (s.kind === "none") return `<div class="v-screen v-none">${icon("film", "ic-l")}<b>${s.key && s.key !== "render" ? "Nothing to play" : "Nothing rendered yet"}</b></div>${pick || ""}`;
    const media = s.kind === "video"
      ? `<video class="v-media" src="${esc(s.src)}" ${s.poster ? `poster="${esc(s.poster)}"` : ""} playsinline preload="auto"></video>`
      : `<hyperframes-player class="v-media" src="${esc(s.src)}"></hyperframes-player>`;
    return `<div class="v-screen is-paused ${s.kind === "player" ? "is-live" : ""}">${media}${label}
      <button class="bigplay" data-act="viewer-play" aria-label="Play" tabindex="-1"><i>${icon("play")}</i></button></div>`;
  };
  function paintStage(autoplay) {
    stopMedia();
    const frame = $("#v-frame"); if (!frame) return;
    const v = vw(), d = detail();
    frame.parentElement.classList.toggle("is-pair", !!v.compare);
    if (v.compare) {
      const side = (which) => {
        const key = v.compare[which], s = screenOf({ kind: "src", key });
        const options = sources(d).filter((x) => x.kind !== "none").map((x) => [x.key, x.label, x.key === "current" ? "Working tree, live" : x.version ? x.note || "Saved version, live" : x.stale ? "Older than the code" : ""]);
        const pick = `<button class="v-pick" data-act="select-open" data-then="viewer-pick-${which}" data-value="${esc(key)}" data-options="${esc(JSON.stringify(options))}" aria-haspopup="menu" aria-label="${which === "a" ? "Left" : "Right"}: ${esc(s.label || key)}">${s.kind === "player" ? icon("pulse", "ic-s") : ""}<span>${esc(source(key)?.label || key)}</span>${icon("down", "ic-s")}</button>`;
        const ear = s.kind === "none" || s.audio === false ? "" : `<button class="v-ear" data-act="viewer-ear" data-side="${which}" aria-pressed="${v.compare.heard === which}" aria-label="${v.compare.heard === which ? "Heard" : "Listen to this side"}" ${tip(v.compare.heard === which ? "Heard" : "Listen to this side")}>${icon(v.compare.heard === which ? "volume" : "mute", "ic-s")}</button>`;
        return `<div class="v-side" data-side="${which}"><div class="v-screens" draggable="true" data-drag-path="${esc(s.path || d.drag_path)}" data-drag-label="${esc(`${d.title} ${s.label || key}`)}">${screenHtml(s, pick)}${ear}</div></div>`;
      };
      frame.className = "v-frame is-pair";
      frame.innerHTML = `<div class="v-pair">${side("a")}${side("b")}</div>`;
    } else {
      const s = screenOf();
      frame.className = "v-frame";
      frame.innerHTML = `<div class="v-screens" id="v-screens" draggable="true" data-drag-path="${esc(s.path || d.drag_path)}" data-drag-label="${esc(d.title)}">${screenHtml(s.kind === "none" ? { ...s, key: v.on.key } : { ...s, label: s.kind === "player" ? s.label : s.label === "Render" ? "" : s.label })}</div>`;
      if (s.kind === "none" && v.on.kind !== "ref") {
        frame.querySelector(".v-none").insertAdjacentHTML("beforeend", `<button class="btn btn-sm" data-act="ask" data-text="${esc(d.live_url ? `ralphy render ${d.id}` : `Build the first version of ${d.id} in ${d.path}, then ralphy content save ${d.id} and ralphy render ${d.id}.`)}">${icon("send", "ic-s")}${d.live_url ? "Copy render command" : "Ask the agent"}</button>`);
      }
    }
    screens = [...frame.querySelectorAll(".v-media")];
    screens.forEach((el) => wire(el));
    if (!screens.length) { $("#v-transport").innerHTML = ""; return; }
    applyMute(); paintTransport();
    if (autoplay && !v.compare && !reduced()) ready(screens[0], () => { const p = screens[0]?.play?.(); p?.catch?.(() => {}); });
  }
  function wire(el) {
    const scr = el.closest(".v-screen"), s = vw().compare ? null : screenOf();
    const time = () => { sync(el); paintTime(); };
    el.addEventListener("loadedmetadata", time);
    /* a live player drops a mute sent before its runtime loads, so say it again once it is ready */
    el.addEventListener("ready", () => { el.muted = silenced(el); time(); });
    el.addEventListener("timeupdate", time);
    el.addEventListener("play", () => { scr.classList.remove("is-paused"); paintPlay(); });
    el.addEventListener("pause", () => { scr.classList.add("is-paused"); paintPlay(); });
    el.addEventListener("ended", () => { scr.classList.add("is-paused"); if (el === master()) pauseAll(); paintPlay(); });
    el.addEventListener("error", (e) => {
      if (scr.querySelector(".fail")) return;
      const live = el.tagName !== "VIDEO";
      const why = live ? (e.detail?.message || "The composition did not load") : WHY[el.error?.code] ?? WHY[4];
      scr.insertAdjacentHTML("beforeend", `<div class="fail">${UI.glyph("bad", "exclaim", "glyph-l")}<b>${live ? "Can't play this code" : "Can't play this video"}</b><span>${esc(why)}</span>
        ${s?.path ? `<div class="row"><button class="btn btn-sm" data-act="copy" data-text="${esc(s.path)}" data-toast="Path copied">Copy path</button></div>` : ""}</div>`);
    });
  }
  /* keep the second screen on the clock: nudge it only when it drifts, so playback stays smooth */
  function sync(from) {
    if (screens.length < 2 || from !== master() || from.paused) return;
    const t = Number(from.currentTime) || 0;
    for (const el of screens) {
      if (el === from || t >= durOf(el)) continue;
      if (Math.abs((Number(el.currentTime) || 0) - t) > 0.15) { try { el.currentTime = t; } catch {} }
      if (el.paused) { const p = el.play?.(); p?.catch?.(() => {}); }
    }
  }
  const playing = () => screens.some((el) => !el.paused);
  function playAll() {
    const m = master(); if (!m) return;
    if (durOf(m) && (Number(m.currentTime) || 0) >= durOf(m) - 0.05) seekAll(0);
    const t = Number(m.currentTime) || 0, pair = screens.length > 1;
    for (const el of screens) ready(el, () => {
      const d = durOf(el);
      if (pair && d && t >= d - 0.05) return; // the shorter one holds its last frame
      if (pair && Math.abs((Number(el.currentTime) || 0) - t) > 0.15) { try { el.currentTime = t; } catch {} }
      const p = el.play?.(); p?.catch?.(() => {});
    });
  }
  function pauseAll() { for (const el of screens) { try { el.pause(); } catch {} } }
  function seekAll(t) { for (const el of screens) { const d = durOf(el); try { el.currentTime = d ? Math.min(t, Math.max(0, d - 0.04)) : t; } catch {} } paintTime(); }
  const silenced = (el) => { const c = vw().compare; return state.muted === true || (c ? el.closest(".v-side")?.dataset.side !== c.heard : false); };
  function applyMute() { screens.forEach((el) => { el.muted = silenced(el); }); }
  function paintTransport() {
    const el = $("#v-transport"); if (!el) return;
    const muted = state.muted === true, c = vw().compare;
    const s = c ? null : screenOf();
    const dur = c ? Math.max(...screens.map(durOf)) : s?.dur;
    const silent = !c && s?.audio === false;
    el.innerHTML = `<button class="ibtn" data-act="viewer-play" aria-label="Play or pause" id="v-playbtn" ${tip("Play  Space")}>${icon("play")}</button>
      <span class="v-time t-num" id="v-time">0:00.0</span>
      <div class="seek"><input type="range" min="0" max="1000" value="0" step="1" aria-label="Seek" data-on="viewer-seek" id="v-seek"><div class="track"><div class="fill" id="v-fill"></div><div class="knob" id="v-knob"></div></div></div>
      <span class="v-time t-num" id="v-dur">${dur ? RP.dur(dur) : ""}</span>
      ${silent ? `<span class="ibtn is-off" role="img" aria-label="No audio track" ${tip("No audio track")}>${icon("mute")}</span>`
        : `<button class="ibtn" data-act="viewer-mute" aria-pressed="${muted}" aria-label="${muted ? "Unmute" : "Mute"}" ${tip("Mute  M")}>${icon(muted ? "mute" : "volume")}</button>`}
      <button class="ibtn" data-act="viewer-full" aria-label="Fullscreen" ${tip("Fullscreen  F")}>${icon("full")}</button>`;
    paintPlay(); paintTime();
  }
  function paintPlay() { const btn = $("#v-playbtn"); if (btn) btn.innerHTML = icon(playing() ? "pause" : "play"); }
  /* ---------- the retention chart follows the player: its head is now, the readout is the share still watching ---------- */
  let retCurves = [], retHover = null;
  function paintRet() {
    const read = $("#ret-read"); if (!read || !retCurves.length) return;
    const el = master(), d = durOf(el), now = d ? Math.min(1, (Number(el.currentTime) || 0) / d) : 0, x = retHover ?? now;
    const head = $("#ret-head"), hover = $("#ret-hover");
    if (head) head.style.left = `${now * 100}%`;
    if (hover) { hover.style.left = `${x * 100}%`; hover.hidden = retHover == null; }
    const vals = retCurves.map((c) => [c.platform, UI.retAt(c.pts, x)]).filter(([, v]) => v != null);
    read.innerHTML = `${d ? `<span>${RP.tc(x * d)}</span>` : ""}${vals.map(([p, v]) => `<span class="ret-v p-${esc(p)}">${UI.plat(p)}${UI.pct(v)}</span>`).join("")}`;
  }
  document.addEventListener("pointermove", (e) => {
    const plot = e.target.closest?.(".ret-plot");
    const next = plot ? (() => { const r = plot.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); })() : null;
    if (next === retHover) return;
    retHover = next; paintRet();
  });
  function paintTime() {
    const el = master(); if (!el) return;
    const d = durOf(el), t = Number(el.currentTime) || 0, ratio = d ? Math.min(1, t / d) : 0;
    const time = $("#v-time"); if (time) time.textContent = RP.tc(t);
    const dur = $("#v-dur"); if (dur && d) dur.textContent = RP.dur(d);
    const fill = $("#v-fill"), knob = $("#v-knob"), seek = $("#v-seek");
    if (fill) fill.style.width = `${ratio * 100}%`; if (knob) knob.style.left = `${ratio * 100}%`;
    if (seek && document.activeElement !== seek) seek.value = Math.round(ratio * 1000);
    paintRet();
  }

  /* ---------- head: title, the source strip, facts and the one action ---------- */
  const isOn = (key) => { const v = vw(); return v.compare ? v.compare.a === key || v.compare.b === key : v.on.kind === "src" && v.on.key === key; };
  /* the strip is rebuilt only when its sources change. Its tiles are static on purpose: a live player per
     version loads the whole composition with its media, and a long history (40+ versions of a film edit)
     crashed the tab. Only the stage plays a composition (two in compare). */
  function paintHead() {
    const d = detail(), el = $("#v-head"); if (!el) return;
    const list = sources(d), compare = Boolean(vw().compare);
    const sig = [d.id, d.title, ...list.map((s) => `${s.key}:${s.src || ""}:${s.poster || ""}:${s.stale ? 1 : 0}`)].join("|");
    if (el.dataset.sig !== sig) {
      const strip = list.length > 1 ? `<div class="v-vers" role="listbox" aria-label="Render, current code and versions">
          ${list.map((s) => `<button class="vthumb ${s.kind === "video" ? "" : "is-work"}" role="option" aria-selected="false" data-act="viewer-source" data-k="${esc(s.key)}" draggable="true" data-drag-path="${esc(s.path || d.path)}" data-drag-label="${esc(`${d.title} ${s.label}`)}" ${tip(thumbTip(s))}>
            <span class="thumb">${s.kind === "video" && s.poster ? `<img src="${esc(s.poster)}" alt="" loading="lazy">` : icon(s.key === "current" ? "pulse" : "stack")}${s.stale ? `<span class="glyph glyph-s g-soft">${icon("refresh")}</span>` : ""}</span><span>${esc(s.label)}</span></button>`).join("")}</div>` : "";
      el.innerHTML = `<h1 class="v-title">${esc(UI.shortTitle(d.title))}</h1>
        ${UI.subtitle(d.title) ? `<div class="v-sub"><span class="ell">${esc(UI.subtitle(d.title))}</span></div>` : ""}
        ${strip}
        <div class="v-facts"></div>`;
      el.dataset.sig = sig;
    }
    el.querySelector(".v-vers")?.setAttribute("aria-multiselectable", String(compare));
    el.querySelectorAll(".vthumb").forEach((b) => b.setAttribute("aria-selected", String(isOn(b.dataset.k))));
    el.querySelector(".v-facts").innerHTML = facts(list.length > 1);
    el.querySelector('.vthumb[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  const thumbTip = (s) => s.key === "render" ? `Render${s.dur ? ` · ${RP.dur(s.dur)}` : ""}${s.stale ? " · older than the code" : ""}`
    : s.key === "current" ? "Current code, live" : `${s.label}${s.note ? ` · ${s.note}` : ""} · live`;
  function facts(strip) {
    const d = detail(), v = vw(), on = v.on;
    if (v.compare) return `<span class="grow"></span><button class="btn btn-sm" data-act="viewer-compare">Done</button>`;
    if (on.kind === "ref") { const r = onRef(); return `<span class="tag">Reference</span>${r?.platform ? UI.plat(r.platform) : ""}<span class="ell muted">${esc(r?.author || r?.ref || "")}</span><span class="grow"></span>${r?.url ? `<a class="btn btn-sm btn-tint" href="${esc(r.url)}" target="_blank" rel="noopener">${icon("ext", "ic-s")}Open</a>` : ""}`; }
    if (on.kind !== "src") return `<span class="muted">Nothing saved yet</span>`;
    const s = source(on.key); if (!s) return "";
    const name = strip ? "" : `<span class="tag">${esc(s.label)}</span>`;
    const ask = (label, text, hint, glyph = "send") => `<button class="btn btn-sm btn-tint" data-act="ask" data-text="${esc(text)}" ${tip(hint)}>${icon(glyph, "ic-s")}${label}</button>`;
    if (s.key === "render") {
      return `${name}${s.dur ? `<span class="t-foot t-num">${RP.dur(s.dur)}</span>` : ""}${s.audio === false ? `<span class="st" role="img" aria-label="No audio track" ${tip("No audio track")}>${icon("mute", "ic-s")}</span>` : ""}
        ${s.stale ? `<span class="st" ${tip(`Rendered ${RP.ago(s.at)}; the code changed since`)}>${icon("refresh", "ic-s")}<span>Older than the code</span></span>` : s.at ? `<span class="t-foot">${esc(RP.ago(s.at))}</span>` : ""}
        <span class="grow"></span>${s.stale ? ask("Render", `ralphy render ${d.id}`, "Copies the render command for the agent") : ""}`;
    }
    if (s.key === "current") {
      return `${name}<span class="st">${icon("pulse", "ic-s")}<span>Live</span></span><span class="grow"></span>
        ${ask("Save version", `ralphy content save ${d.id} -m "<what changed>"`, "Copies the save command for the agent")}`;
    }
    return `${name}${s.note ? `<span class="ell muted t-foot">${esc(s.note)}</span>` : s.at ? `<span class="t-foot">${esc(RP.ago(s.at))}</span>` : ""}<span class="grow"></span>
      ${ask("Restore", `ralphy content restore ${d.id} ${s.key}`, "Copies the restore command for the agent; the current code is saved first", "restore")}`;
  }

  /* ---------- tabs ---------- */
  const TABS = () => { const d = detail(); return [["notes", "Notes"], ["versions", "Versions", (d.versions || []).length || ""], ["refs", "Refs", (d.refs || []).length || ""], ["posts", "Posts", (d.posts || []).length || ""], ["info", "Info"]]; };
  function paintTabs() {
    const el = $("#v-tabs"); if (!el) return;
    el.innerHTML = UI.seg({ key: "vtab", label: "Details", act: "viewer-tab", value: vw().tab, options: TABS(), cls: "seg-block" });
    paintBody();
  }
  function paintBody() {
    const el = $("#v-body"); if (!el) return;
    retCurves = [];
    el.innerHTML = BODY[vw().tab]?.() ?? "";
    paintRet();
  }
  /* notes without the title line and without the headings nobody filled in yet (a new video's Brief, Reference, Decisions) */
  const level = (line) => (/^(#{1,6})\s/.exec(line) || [])[1]?.length || 0;
  function filled(md) {
    const lines = md.replace(/^\s*#\s+.*\n/, "").split("\n"), out = [];
    let fence = false;
    lines.forEach((line, i) => {
      if (/^\s*(```|~~~)/.test(line)) fence = !fence;
      const h = fence ? 0 : level(line);
      if (h) {
        let j = i + 1; while (j < lines.length && !lines[j].trim()) j++;
        if (j >= lines.length || (level(lines[j]) && level(lines[j]) <= h)) return;
      }
      out.push(line);
    });
    return out.join("\n");
  }
  const BODY = {
    notes: () => { const body = filled(detail().body || ""); return body.trim() ? UI.markdown(body) : UI.empty({ iconName: "note", title: "No notes" }); },
    versions: () => {
      const d = detail(), list = sources(d);
      if (!list.length) return UI.empty({ iconName: "stack", title: "Nothing saved yet", text: "The agent saves a version with ralphy content save" });
      return `<div class="list">${list.map((s) => {
        const meta = s.key === "render" ? [s.at ? RP.ago(s.at) : "", s.dur ? RP.dur(s.dur) : "", s.stale ? "Older than the code" : ""]
          : s.key === "current" ? ["Working tree, live"] : [s.at ? RP.ago(s.at) : "", s.note || ""];
        const trail = s.version ? `<button class="btn btn-sm" data-act="ask" data-text="${esc(`ralphy content restore ${d.id} ${s.key}`)}" ${tip("Copies the restore command for the agent")}>Restore</button>`
          : s.key === "render" && s.stale ? `<button class="btn btn-sm" data-act="ask" data-text="${esc(`ralphy render ${d.id}`)}" ${tip("Copies the render command for the agent")}>Render</button>` : "";
        return `<div class="lrow ${isOn(s.key) ? "is-on" : ""}" role="button" tabindex="0" data-act="viewer-source" data-k="${esc(s.key)}" draggable="true" data-drag-path="${esc(s.path || d.path)}" data-drag-label="${esc(`${d.title} ${s.label}`)}">
          ${s.kind === "player" ? `<span class="thumb">${icon(s.key === "current" ? "pulse" : "stack")}</span>` : UI.thumb(s.poster, "", "film")}
          <div class="lrow-b"><div class="lrow-t ell">${esc(s.label)}</div><div class="lrow-m"><span class="ell">${esc(meta.filter(Boolean).join(" · "))}</span></div></div>
          ${trail}</div>`;
      }).join("")}</div>`;
    },
    refs: () => {
      const d = detail(), refs = d.refs || [];
      if (!refs.length) return UI.empty({ iconName: "link", title: "No references" });
      return `<div class="list">${refs.map((r, i) => {
        const metric = r.metrics?.views != null ? `${RP.compact(r.metrics.views)} views` : r.metrics?.likes != null ? `${RP.compact(r.metrics.likes)} likes` : "";
        const name = r.author ? UI.handle(r.author) : r.title || r.ref;
        return `<div class="lrow ${vw().on.kind === "ref" && vw().on.index === i ? "is-on" : ""}" role="button" tabindex="0" data-act="viewer-ref" data-i="${i}" ${r.drag_path || r.path ? `draggable="true" data-drag-path="${esc(r.drag_path || r.path)}" data-drag-label="${esc(name)}"` : ""}>
          ${UI.thumb(r.poster)}
          <div class="lrow-b"><div class="lrow-t ell">${esc(name)}</div>
            <div class="lrow-m">${r.platform ? UI.plat(r.platform) : ""}${r.published_at ? `<span>${esc(RP.date(r.published_at))}</span>` : ""}${metric ? `<span>${esc(metric)}</span>` : ""}${r.kind === "local" && !r.exists ? "<span>Missing</span>" : ""}</div></div>
          ${r.url ? `<a class="ibtn" href="${esc(r.url)}" target="_blank" rel="noopener" aria-label="Open the source" ${tip("Open the source")}>${icon("ext")}</a>` : ""}
        </div>`;
      }).join("")}</div>`;
    },
    posts: () => {
      const d = detail(), posts = d.posts || [];
      const plan = `<button class="cell" data-act="ask" data-text="${esc(`Plan a post of ${d.id}: ralphy post plan ${d.id} --to <account>:<platform> --at <ISO time> --caption "<caption>"`)}">${icon("plus")}<span class="grow">Plan a post</span>${icon("send", "ic-s")}</button>`;
      const many = new Set(posts.map((p) => p.account)).size > 1;
      const live = posts.filter((p) => p.status === "published").sort(UI.byPlatform);
      const rest = posts.filter((p) => p.status !== "published" && p.status !== "cancelled");
      const curves = live.filter((p) => p.analytics?.retention?.length > 1);
      retCurves = curves.map((p) => ({ platform: p.platform, pts: p.analytics.retention }));
      const length = curves.map((p) => p.analytics.duration_s).find(Boolean) || d.duration;
      return `${curves.length ? UI.retention(curves, length) : ""}
        ${live.length ? `<div class="pcards">${live.map((p) => UI.postCard(p, { account: many })).join("")}</div>` : ""}
        ${rest.length ? `<div class="sect">Upcoming<span class="n">${rest.length}</span></div><div class="list">${rest.map((p) => UI.postRow(p, { lead: "avatar", dest: "plat" })).join("")}</div>` : ""}
        <div class="group ${posts.length ? "mt" : ""}">${plan}</div>`;
    },
    info: () => {
      const d = detail(), face = d.face || RP.face(d.account);
      return `<div class="group">
          <div class="cell"><span class="muted">Account</span><span class="cell-v row">${UI.dot(d.account, false)}${esc(face.name)}</span></div>
          ${d.meta?.created_at ? `<div class="cell"><span class="muted">Created</span><span class="cell-v">${esc(RP.date(d.meta.created_at))}</span></div>` : ""}
          <div class="cell"><span class="muted">Rendered</span><span class="cell-v">${d.rendered_at ? `${esc(RP.ago(d.rendered_at))}${d.render_stale ? " · older than the code" : ""}` : "Not yet"}</span></div>
          <div class="cell"><span class="muted">Versions</span><span class="cell-v t-num">${(d.versions || []).length}</span></div>
          ${d.caption ? `<div class="cell"><span class="muted">Caption</span><span class="cell-v">${esc(d.caption)}</span></div>` : ""}
        </div>
        <div class="sect">Folder</div>${UI.pathline(d.path)}
        ${d.render ? `<div class="sect">Render</div>${UI.pathline(d.render)}` : ""}
        <div class="sect">Id</div>${UI.pathline(d.id, "Copy id")}`;
    },
  };

  /* ---------- refresh while the agent works ---------- */
  const srcOf = (el) => el?.getAttribute("src") || "";
  RP.viewerRefresh = () => {
    const d = detail(); if (!d || d.error || !$("#viewer")) return;
    const v = vw(), before = screens.map(srcOf).join("|");
    if (v.on.kind === "src" && !source(v.on.key)) v.on = defaultOn(d);
    if (v.compare && (!source(v.compare.a) || !source(v.compare.b))) v.compare = canCompare() ? pairFor(d) : null;
    const want = v.compare ? [v.compare.a, v.compare.b].map((k) => source(k)?.src || "").join("|") : screenOf().src || "";
    if (want !== before.replace(/\?r=\d+/g, "")) paintStage(false); // a new render has a new ?t= in its URL
    paintTop(); paintHead(); paintTabs();
  };
  /* the working tree changed: reload the live screens that show it */
  RP.viewerWorkChanged = () => {
    const src = detail()?.live_url; if (!src) return;
    const fresh = `${src}?r=${Date.now()}`;
    for (const el of screens) if (el.tagName !== "VIDEO" && srcOf(el).startsWith(src)) el.setAttribute("src", fresh);
  };

  /* ---------- actions ---------- */
  A["viewer-close"] = () => RP.closeViewer();
  A["viewer-step"] = (el) => {
    const v = vw(), i = v.list.indexOf(v.id), next = v.list[i + Number(el.dataset.d)];
    if (!next) return;
    stopMedia(); state.viewer = { ...v, id: next, on: null, compare: null };
    history.replaceState(null, "", RP.href({ view: next })); RP.showViewer(next);
  };
  A["viewer-source"] = (el, e) => {
    if (e?.target.closest("button, a") && e.target.closest("button, a") !== el) return;
    const v = vw(), key = el.dataset.k;
    if (v.compare) { if (source(key)?.kind === "none" || key === v.compare.a || key === v.compare.b) return; v.compare.b = key; paintStage(false); }
    else { v.on = { kind: "src", key }; paintStage(true); }
    paintHead(); if (v.tab === "versions") paintBody();
  };
  A["viewer-ref"] = (el, e) => {
    if (e?.target.closest("a")) return;
    const r = detail().refs[Number(el.dataset.i)];
    if (!r?.media_url) { if (r?.url) window.open(r.url, "_blank", "noopener"); return; }
    vw().compare = null; vw().on = { kind: "ref", index: Number(el.dataset.i) }; paintTop(); paintStage(true); paintHead(); paintBody();
  };
  A["viewer-compare"] = () => {
    const v = vw(), d = detail(); if (!d || d.error) return;
    if (v.compare) { v.on = { kind: "src", key: v.compare.b }; v.compare = null; }
    else { if (!canCompare()) return; v.compare = pairFor(d, v.on.kind === "src" ? v.on.key : null); }
    paintTop(); paintStage(false); paintHead(); if (v.tab === "versions") paintBody();
  };
  const pick = (which) => ({ value }) => {
    const c = vw().compare; if (!c || !source(value)) return;
    const other = which === "a" ? "b" : "a";
    if (c[other] === value) c[other] = c[which];
    c[which] = value; paintStage(false); paintHead(); if (vw().tab === "versions") paintBody();
  };
  A["viewer-pick-a"] = pick("a");
  A["viewer-pick-b"] = pick("b");
  A["viewer-ear"] = (el, e) => { e?.stopPropagation(); const c = vw().compare; if (!c) return; c.heard = el.dataset.side; if (state.muted) state.muted = false; applyMute(); paintStage(false); };
  A["viewer-tab"] = (el) => { vw().tab = el.dataset.v; paintTabs(); };
  A["viewer-play"] = () => { if (!screens.length) return; if (playing()) pauseAll(); else playAll(); };
  A["viewer-mute"] = () => { state.muted = !state.muted; applyMute(); paintTransport(); };
  A["viewer-full"] = () => { const el = vw().compare ? $("#v-frame") : $("#v-screens"); if (document.fullscreenElement) document.exitFullscreen?.(); else el?.requestFullscreen?.().catch(() => {}); };
  A["viewer-ret"] = (el, e) => {
    const d = durOf(master()); if (!d || !e) return;
    const r = el.getBoundingClientRect(); seekAll(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * d);
  };
  RP.inputs["viewer-seek"] = (el) => { const d = durOf(master()); if (!d) return; seekAll((Number(el.value) / 1000) * d); };
  RP.viewerSeekBy = (dt) => { const m = master(); if (!m) return; const d = durOf(m); seekAll(Math.max(0, Math.min(Math.max(0, d - 0.05), (Number(m.currentTime) || 0) + dt))); };
  A["viewer-menu"] = (el) => {
    const d = detail(), s = vw().compare ? screenOf({ kind: "src", key: vw().compare.a }) : screenOf();
    RP.openMenu(el, `<button class="mi" data-act="copy" data-text="${esc(s.path || d.drag_path)}" data-toast="Path copied">${icon("copy", "ic-s")}<span class="mi-l">Copy path</span></button>
      <button class="mi" data-act="copy" data-text="${esc(d.path)}" data-toast="Folder path copied">${icon("folder", "ic-s")}<span class="mi-l">Copy folder path</span></button>
      <button class="mi" data-act="ask" data-text="${esc(context(d))}">${icon("send", "ic-s")}<span class="mi-l">Copy for the agent</span></button>
      ${s.src ? `<hr class="sep"><a class="mi" href="${esc(s.src)}" target="_blank" rel="noopener">${icon("ext", "ic-s")}<span class="mi-l">Open in a new tab</span></a>` : ""}`, { align: "right" });
  };
  const context = (d) => {
    const v = vw(), on = v.on, s = on.kind === "src" ? source(on.key) : null;
    const label = (x) => (!x ? "" : x.key === "render" ? "the render" : x.key === "current" ? "the working tree (live)" : `${x.label} (saved ${RP.ago(x.at)})`);
    return [`Ralphy content ${d.id}: ${d.title}`, `Folder: ${d.path}`,
      d.render ? `Render: ${d.render} (rendered ${RP.ago(d.rendered_at)}${d.render_stale ? ", older than the working tree" : ""})` : "Render: none yet",
      v.compare ? `On screen: ${label(source(v.compare.a))} next to ${label(source(v.compare.b))}` : s ? `On screen: ${label(s)}` : on.kind === "ref" ? "On screen: a reference" : ""].filter(Boolean).join("\n");
  };
  RP.viewerCopyPath = () => { const s = vw().compare ? screenOf({ kind: "src", key: vw().compare.a }) : screenOf(); RP.copy(s.path || detail().drag_path, "Path copied"); };
})();

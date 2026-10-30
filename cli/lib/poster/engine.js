// Poster-collage engine (#598). A browser script that `ralphy editor poster`
// assembles into a project's index.html (cli/lib/poster/assemble.ts). It
// builds every scene from SCENES synchronously and registers one paused GSAP
// timeline as window.__timelines[COMP_ID]. Schema and recipes:
// .agents/skills/editor/references/poster-collage.md.
//
// Globals defined before this script (the scenes file plus the assembler):
//   COMP_ID      the root data-composition-id
//   DURATION     composition length, seconds
//   ASSETS       key -> project-relative path
//   SCENES       scene objects sorted by `t`
//   OSWALD_ADV   Oswald 700 advance widths per character, em (title fit)
//   LOTTIE_DATA  project-relative path -> parsed Lottie JSON, for every
//                Lottie the scenes reference
//
// Layers per scene: .sc (enter transition) > .cam (slow push, pans) >
// .fx (shake, punch-in) > background + items. Each effect owns its layer, so
// one property of one element is never tweened from two places.
//
// Render-safety rules. Each one fixed a broken render; keep them:
// - Lottie timing: the HyperFrames lottie adapter finds every player through
//   window.lottie.getRegisteredAnimations() and seeks it to ABSOLUTE
//   composition time, which blanks a short loop that starts late. The engine
//   keeps a private handle (LOT), drives each inline player's frame from the
//   item's own start with a GSAP tween on an accessor property, and sets
//   window.lottie to undefined at the end.
// - Lottie data is inlined (animationData, one copy per instance): a `path`
//   load is async and misses early frames in parallel render workers.
// - Titles are fitted synchronously from OSWALD_ADV: render workers capture
//   before web fonts finish loading. fitText() after document.fonts.ready only
//   refines.
// - The counter is an odometer of digit columns tweened by yPercent: onUpdate
//   callbacks do not fire under `hyperframes snapshot` seeks.
// - fromTo tweens that must stay invisible until their time (flash, burst)
//   set immediateRender: false. Entrance presets that move far (drop, left,
//   right, rise) also fade from opacity 0, so an element away from its
//   position never peeks in.
// - A flipped image is set with gsap.set(scaleX: -1) and drifts on scaleX and
//   scaleY separately: GSAP parses an inline scaleX(-1) as rotation 180.
// - Shatter clones clear the copied entrance state (opacity, transform) on
//   every descendant.
// - Paper strips reset the PRNG seed per strip, so every copy of the sheet
//   scatters identically.
(function () {
  const root = document.getElementById("root");
  const tl = gsap.timeline({ paused: true });
  // Seeded LCG: every random choice (scatter order, shake, shards) is the
  // same on every load, so render workers and snapshots agree.
  let seed = 20261031;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const RED = "#D0231D";
  const SVGNS = "http://www.w3.org/2000/svg";
  let uid = 0;
  // Private handle on lottie-web. The HyperFrames lottie adapter discovers
  // every registered player through window.lottie and seeks it to absolute
  // composition time, which blanks short loops that start late. Inline players
  // are driven per item (lottieItem), and the global is hidden from the adapter
  // at the end of this script.
  const LOT = window.lottie;
  window.__hfLottie = window.__hfLottie || [];

  const ICONS = {
    person: '<circle cx="50" cy="22" r="14"/><path d="M28 98V56c0-12 10-20 22-20s22 8 22 20v42H60V68h-4v30H44V68h-4v30z"/>',
    bowl: '<path d="M10 52h80c0 22-18 36-40 36S10 74 10 52z"/><path d="M30 44c2-10 8-14 10-22M48 44c2-12 8-16 10-24M66 44c2-10 6-14 8-20" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>',
    house: '<path d="M50 10l42 36h-12v44H60V64H40v26H20V46H8z"/>',
    shield: '<path d="M50 6l38 14v26c0 24-16 42-38 50C28 88 12 70 12 46V20z"/>',
    bow: '<path d="M22 10c40 14 52 50 40 80" fill="none" stroke="currentColor" stroke-width="7"/><path d="M22 10l40 80" stroke="currentColor" stroke-width="3"/><path d="M8 52h80l-12-8m12 8l-12 8" fill="none" stroke="currentColor" stroke-width="6"/>',
    stopwatch: '<circle cx="50" cy="56" r="34" fill="none" stroke="currentColor" stroke-width="7"/><path d="M42 10h16M50 56V34" stroke="currentColor" stroke-width="7" stroke-linecap="round"/>',
    chart: '<path d="M14 88h76" stroke="currentColor" stroke-width="6"/><rect x="20" y="58" width="12" height="26"/><rect x="40" y="44" width="12" height="40"/><rect x="60" y="26" width="12" height="58"/>',
    heart: '<path d="M50 88S10 62 10 36c0-14 10-24 22-24 8 0 14 4 18 10 4-6 10-10 18-10 12 0 22 10 22 24 0 26-40 52-40 52z"/>',
    cross: '<circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" stroke-width="8"/><path d="M34 34l32 32M66 34L34 66" stroke="currentColor" stroke-width="9" stroke-linecap="round"/>',
    check: '<circle cx="50" cy="50" r="42"/><path d="M30 52l14 14 26-30" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>',
    star: '<path d="M50 6l12 30 32 2-25 20 9 32-28-18-28 18 9-32L6 38l32-2z"/>',
    dogface: '<path d="M20 20c-8 2-12 22-6 32 4 6 10 2 12-6M80 20c8 2 12 22 6 32-4 6-10 2-12-6"/><path d="M26 30c4-10 14-14 24-14s20 4 24 14c4 12 2 30-6 42-6 8-12 12-18 12s-12-4-18-12c-8-12-10-30-6-42z"/><circle cx="38" cy="44" r="5" fill="#fff"/><circle cx="62" cy="44" r="5" fill="#fff"/><ellipse cx="50" cy="62" rx="9" ry="6" fill="#fff"/>',
    paw: '<ellipse cx="50" cy="66" rx="22" ry="18"/><ellipse cx="24" cy="40" rx="9" ry="12"/><ellipse cx="42" cy="26" rx="9" ry="12"/><ellipse cx="60" cy="26" rx="9" ry="12"/><ellipse cx="77" cy="40" rx="9" ry="12"/>',
    catface: '<path d="M14 10l20 22h32l20-22v50c0 20-16 34-36 34S14 80 14 60z"/>',
    skull: '<path d="M50 8C28 8 14 24 14 44c0 12 6 20 12 24v14h48V68c6-4 12-12 12-24C86 24 72 8 50 8z"/><circle cx="36" cy="46" r="9" fill="#0D0D0D"/><circle cx="64" cy="46" r="9" fill="#0D0D0D"/><path d="M40 82v10M50 82v10M60 82v10" stroke="#0D0D0D" stroke-width="4"/>',
    bubble: '<path d="M12 18h76v52H46L28 88V70H12z"/>',
    spark: '<path d="M50 4l8 34 34 8-34 8-8 34-8-34-34-8 34-8z"/>'
  };
  const svgIcon = (name, size, color) =>
    '<svg viewBox="0 0 100 100" width="' + size + '" height="' + size + '" fill="currentColor" style="color:' + (color || "#fff") + '">' + ICONS[name] + "</svg>";

  function mk(tag, cls, parent) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    parent.appendChild(e);
    return e;
  }
  function px(e, o) {
    if (o.x !== undefined) e.style.left = o.x + "px";
    if (o.y !== undefined) e.style.top = o.y + "px";
    if (o.w !== undefined) e.style.width = o.w + "px";
    if (o.h !== undefined) e.style.height = o.h + "px";
    if (o.z !== undefined) e.style.zIndex = o.z;
  }

  // Entrance presets (item `anim`, title `reveal` fallback). The far movers
  // (drop, left, right, rise) fade from opacity 0 as well.
  const ENTER = {
    pop: { scale: 0.2, opacity: 0, duration: 0.42, ease: "back.out(2.2)" },
    drop: { y: -620, opacity: 0, duration: 0.55, ease: "expo.out" },
    left: { x: -900, opacity: 0, duration: 0.5, ease: "expo.out" },
    right: { x: 900, opacity: 0, duration: 0.5, ease: "expo.out" },
    rise: { y: 900, opacity: 0, duration: 0.6, ease: "power3.out" },
    zoom: { scale: 1.35, opacity: 0, duration: 0.45, ease: "power2.out" },
    fade: { opacity: 0, duration: 0.35, ease: "sine.out" },
    slam: { scale: 2.2, opacity: 0, duration: 0.2, ease: "expo.out" },
    tilt: { rotation: -18, scale: 0.6, opacity: 0, duration: 0.45, ease: "back.out(1.8)" },
    flipY: { rotationY: 90, transformPerspective: 1000, opacity: 0, duration: 0.45, ease: "back.out(1.6)" },
    flipX: { rotationX: -90, transformPerspective: 1000, opacity: 0, duration: 0.45, ease: "back.out(1.6)" }
  };
  function enter(e, kind, at) {
    if (kind === "none") return;
    tl.from(e, Object.assign({}, ENTER[kind || "fade"]), at);
  }

  // Deformation (land squash, jelly, wobble, warp, spin) runs on an inner
  // element, so it never fights the entrance tween on the wrapper.
  function deform(e, it, t1) {
    if (it.land !== undefined) {
      tl.to(e, { scaleX: 1.25, scaleY: 0.78, duration: 0.08, ease: "power2.out", transformOrigin: "50% 100%" }, it.land);
      tl.to(e, { scaleX: 1, scaleY: 1, duration: 0.55, ease: "elastic.out(1.2,0.35)" }, it.land + 0.08);
    }
    if (it.jelly !== undefined) {
      [].concat(it.jelly).forEach((at) => {
        tl.to(e, { scaleX: 1.14, scaleY: 0.88, duration: 0.07, ease: "power1.out" }, at);
        tl.to(e, { scaleX: 1, scaleY: 1, duration: 0.6, ease: "elastic.out(1.4,0.3)" }, at + 0.07);
      });
    }
    if (it.wobble) {
      const n = Math.max(1, Math.floor((t1 - it.at) / 1.6));
      tl.fromTo(e, { rotation: -it.wobble }, { rotation: it.wobble, duration: 0.8, ease: "sine.inOut", yoyo: true, repeat: n * 2 - 1 }, it.at);
    }
    if (it.warp) {
      const id = "warp" + uid++;
      const svg = document.createElementNS(SVGNS, "svg");
      svg.setAttribute("width", "0"); svg.setAttribute("height", "0"); svg.style.position = "absolute";
      svg.innerHTML = '<filter id="' + id + '" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.03" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="0" xChannelSelector="R" yChannelSelector="G"/></filter>';
      root.appendChild(svg);
      e.style.filter = (e.style.filter || "") + " url(#" + id + ")";
      const dm = svg.querySelector("feDisplacementMap");
      [].concat(it.warp).forEach((w) => {
        tl.fromTo(dm, { attr: { scale: w.from || 0 } }, { attr: { scale: w.amp || 60 }, duration: (w.dur || 0.8) / 2, ease: "sine.in" }, w.at);
        tl.to(dm, { attr: { scale: 0 }, duration: (w.dur || 0.8) / 2, ease: "sine.out" }, w.at + (w.dur || 0.8) / 2);
      });
    }
    if (it.spin) tl.to(e, { rotation: it.spin, duration: t1 - it.at, ease: "none" }, it.at);
  }

  function background(fx, s, t0, t1) {
    const bg = mk("div", "bg bg-" + s.bg, fx);
    if (["red", "black", "beige", "blue"].includes(s.bg) || s.rays) {
      const r = mk("div", "rays" + (s.bg === "beige" ? " rays-red" : ""), bg);
      tl.fromTo(r, { rotation: 0 }, { rotation: s.raySpin || 8, duration: t1 - t0, ease: "none" }, t0);
    }
    if ((s.bg === "paper" || s.bg === "white") && ASSETS.paper) {
      const p = mk("img", "paperimg", bg);
      p.src = ASSETS.paper;
    }
    if (s.blueprint) {
      const svg = document.createElementNS(SVGNS, "svg");
      svg.setAttribute("class", "blueprint");
      svg.setAttribute("viewBox", "0 0 1080 1920");
      let g = "";
      for (let k = 0; k < 7; k++) g += '<circle cx="540" cy="900" r="' + (120 + k * 130) + '"/>';
      g += '<path d="M0 900H1080M540 0V1920M0 260L1080 1640M1080 260L0 1640"/>';
      svg.innerHTML = g;
      bg.appendChild(svg);
      tl.fromTo(svg, { opacity: 0 }, { opacity: 1, duration: 0.6, ease: "sine.out" }, t0);
    }
    if (s.grain !== false) {
      const gr = mk("div", "grain", bg);
      tl.fromTo(gr, { backgroundPosition: "0px 0px" }, { backgroundPosition: "240px 160px", duration: t1 - t0, ease: "steps(" + Math.max(2, Math.round((t1 - t0) * 12)) + ")" }, t0);
    }
  }

  function title(host, it) {
    const box = mk("div", "title" + (it.glow ? " glow" : ""), host);
    px(box, it);
    box.style.fontSize = (it.size || 200) + "px";
    if (it.color) box.style.color = it.color;
    if (it.align) box.style.textAlign = it.align;
    if (it.rot) box.style.transform = "rotate(" + it.rot + "deg)";
    const lines = it.lines.map((l) => (typeof l === "string" ? { t: l, at: it.at } : l));
    lines.forEach((l) => {
      const ln = mk("div", "ln", box);
      // Fit synchronously from the Oswald 700 advance widths: render workers
      // capture before the web font loads, so this cannot wait for it.
      let fs = l.size || it.size || 200;
      if (typeof OSWALD_ADV !== "undefined" && it.w) {
        const em = [...l.t].reduce((a, ch) => a + (OSWALD_ADV[ch.toUpperCase()] || OSWALD_ADV[ch] || 0.56), 0) - 0.015 * (l.t.length - 1);
        if (em * fs > it.w * 0.95) fs = Math.floor((it.w * 0.95) / em);
      }
      ln.style.fontSize = fs + "px";
      const letters = [];
      for (const ch of l.t) {
        const sp = mk("span", "ch", ln);
        sp.textContent = ch === " " ? "\u00a0" : ch;
        letters.push(sp);
      }
      const mode = it.reveal || "scatter";
      if (mode === "scatter") {
        const order = letters.map((_, i) => i).sort(() => rnd() - 0.5);
        order.forEach((li, k) => {
          tl.from(letters[li], { opacity: 0, y: (rnd() - 0.5) * 60, rotation: (rnd() - 0.5) * 30, scale: 0.6 + rnd() * 0.8, duration: 0.09, ease: "power2.out" }, l.at + k * 0.026);
        });
      } else if (mode === "drop") {
        letters.forEach((sp, k) => tl.from(sp, { y: -300, opacity: 0, duration: 0.35, ease: "bounce.out" }, l.at + k * 0.04));
      } else if (mode === "type") {
        letters.forEach((sp, k) => tl.from(sp, { opacity: 0, duration: 0.04, ease: "none" }, l.at + k * 0.035));
      } else {
        tl.from(ln, ENTER[mode] || ENTER.slam, l.at);
      }
    });
    if ((it.reveal || "scatter") === "scatter") tl.from(box, { scale: 1.12, duration: 0.5, ease: "power2.out" }, lines[0].at);
    if (it.glitch !== undefined) glitch(box, it.glitch);
    if (it.strike !== undefined) {
      const st = mk("div", "strike", box);
      tl.from(st, { scaleX: 0, duration: 0.3, ease: "power3.out" }, it.strike);
    }
    if (it.jelly !== undefined) deform(box, { jelly: it.jelly }, 0);
  }

  function glitch(e, at) {
    const offs = [[-14, 4], [12, -6], [-8, -3], [16, 5], [0, 0]];
    offs.forEach(([x, y], k) => {
      tl.to(e, { x: x, y: y, skewX: k % 2 ? 8 : -8, filter: k < 4 ? "drop-shadow(-8px 0 0 rgba(0,255,255,.8)) drop-shadow(8px 0 0 rgba(255,0,80,.8))" : "none", duration: 0.035, ease: "none" }, at + k * 0.045);
    });
    tl.to(e, { skewX: 0, duration: 0.01 }, at + 0.25);
  }

  function text(host, it, cls) {
    const e = mk("div", cls, host);
    px(e, it);
    e.textContent = it.text;
    if (it.size) e.style.fontSize = it.size + "px";
    if (it.color) e.style.color = it.color;
    if (it.rot) e.style.transform = "rotate(" + it.rot + "deg)";
    if (it.align) e.style.textAlign = it.align;
    if (cls === "script") {
      tl.fromTo(e, { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: it.dur || 0.45, ease: "power1.inOut" }, it.at);
    } else {
      tl.from(e, { opacity: 0, y: 14, duration: 0.25, ease: "power2.out" }, it.at);
    }
    if (it.marker !== undefined) {
      const m = mk("div", "marker", e);
      if (it.markerColor) m.style.background = it.markerColor;
      tl.from(m, { scaleX: 0, duration: 0.35, ease: "power2.out" }, it.marker);
    }
  }

  function image(host, it, t1) {
    const wrap = mk("div", "imw", host);
    px(wrap, it);
    if (it.rot) wrap.style.transform = "rotate(" + it.rot + "deg)";
    const inner = mk("div", "imi", wrap);
    const e = mk("img", "im " + (it.cls || ""), inner);
    e.src = ASSETS[it.src];
    e.style.objectFit = it.fit || "contain";
    if (it.flip) gsap.set(e, { scaleX: -1 });
    if (it.filter) e.style.filter = it.filter;
    if (it.radius) e.style.borderRadius = it.radius + "px";
    enter(wrap, it.anim || "pop", it.at);
    deform(inner, it, t1);
    if (it.drift !== false && !it.wobble && !it.spin) tl.to(e, { scaleX: it.flip ? -1.05 : 1.05, scaleY: 1.05, duration: Math.max(0.5, t1 - it.at), ease: "sine.inOut" }, it.at);
    if (it.exit) tl.to(wrap, Object.assign({ duration: 0.4, ease: "power2.in" }, it.exit.to), it.exit.at);
    return wrap;
  }

  function lottieItem(host, it, t1) {
    const wrap = mk("div", "imw", host);
    px(wrap, it);
    const inner = mk("div", "imi lot", wrap);
    const inline = typeof LOTTIE_DATA !== "undefined" && LOTTIE_DATA[ASSETS[it.src]];
    const src = inline ? { animationData: JSON.parse(JSON.stringify(inline)) } : { path: ASSETS[it.src] };
    const anim = LOT.loadAnimation(Object.assign({ container: inner, renderer: "svg", loop: true, autoplay: false }, src));
    if (inline) {
      // Drive the frame from this item's own start (the global adapter would
      // seek every player to absolute composition time, past a short loop's end).
      const nf = inline.op - inline.ip, dur = nf / (inline.fr || 30);
      const proxy = { _f: 0 };
      Object.defineProperty(proxy, "f", { get() { return this._f; }, set(v) { this._f = v; anim.goToAndStop(v, true); } });
      tl.fromTo(proxy, { f: 0 }, { f: nf - 1, duration: dur, ease: "none", repeat: Math.max(0, Math.ceil((t1 - it.at) / dur) - 1) }, it.at);
    } else {
      window.__hfLottie.push(anim);
    }
    enter(wrap, it.anim || "pop", it.at);
    deform(inner, it, t1);
  }

  function card(host, it) {
    const c = mk("div", "card", host);
    px(c, it);
    if (it.bg) c.style.background = it.bg;
    if (it.rot) c.style.transform = "rotate(" + it.rot + "deg)";
    const im = mk("img", "cardimg", c);
    im.src = ASSETS[it.src];
    im.style.height = (it.ih || it.h) + "px";
    if (it.filter) im.style.filter = it.filter;
    if (it.grayAt !== undefined) tl.to(im, { filter: "grayscale(1) brightness(.6)", duration: 0.3 }, it.grayAt);
    if (it.caption) {
      const cap = mk("div", "cardcap", c);
      cap.textContent = it.caption;
    }
    enter(c, it.anim || "pop", it.at);
    if (it.badge) {
      const b = mk("div", "badge", host);
      b.style.left = it.x + it.w - 70 + "px";
      b.style.top = it.y - 40 + "px";
      b.innerHTML = svgIcon(it.badge, 110, it.badge === "check" ? "#2DA44E" : RED);
      tl.from(b, { scale: 3, opacity: 0, rotation: -30, duration: 0.25, ease: "back.out(2.5)" }, it.badgeAt || it.at + 0.3);
    }
    return c;
  }

  function icon(host, it, t1) {
    const e = mk("div", "icon", host);
    px(e, { x: it.x, y: it.y, z: it.z });
    const inner = mk("div", "imi", e);
    inner.innerHTML = svgIcon(it.name, it.size || 120, it.color || "#fff");
    if (it.label) {
      const l = mk("div", "iconlab", e);
      l.textContent = it.label;
      l.style.color = it.color || "#fff";
    }
    enter(e, it.anim || "pop", it.at);
    deform(inner, it, t1);
    if (it.turn) tl.to(inner.firstChild, { color: it.turn.color, duration: 0.12, ease: "none" }, it.turn.at);
  }

  function bubbles(host, it) {
    it.list.forEach((b) => {
      const e = mk("div", "bub", host);
      px(e, b);
      e.textContent = b.text;
      e.style.background = b.color || "#2F7BF6";
      if (b.size) e.style.fontSize = b.size + "px";
      tl.from(e, { scale: 0, opacity: 0, transformOrigin: "0% 100%", duration: 0.35, ease: "back.out(3)" }, b.at);
      tl.to(e, { y: -16, duration: 1.4, ease: "sine.inOut", yoyo: true, repeat: 1 }, b.at + 0.35);
    });
  }

  function grid(host, it) {
    it.tiles.forEach((tile, k) => {
      const col = k % it.cols;
      const row = Math.floor(k / it.cols);
      const e = mk("div", "tile", host);
      px(e, { x: it.x + col * (it.cell + it.gap), y: it.y + row * (it.cell + it.gap), w: it.cell, h: it.cell });
      e.style.background = tile.bg;
      const im = mk("img", "tileimg", e);
      im.src = ASSETS[tile.src];
      im.style.filter = tile.fg === "light" ? "brightness(0) invert(.9) sepia(.35)" : "brightness(0)";
      tl.from(e, { rotationY: 90, transformPerspective: 800, opacity: 0, duration: 0.42, ease: "back.out(1.7)" }, tile.at);
      if (tile.flash !== undefined) {
        tl.to(e, { backgroundColor: "#FFFFFF", duration: 0.06 }, tile.flash);
        tl.to(e, { backgroundColor: tile.bg, duration: 0.3 }, tile.flash + 0.06);
      }
    });
  }

  // Odometer counter: every digit is a column of 0-9 rolled with yPercent, so
  // the state depends only on time (no onUpdate callbacks).
  function counter(host, it) {
    const e = mk("div", "count", host);
    px(e, it);
    e.style.fontSize = (it.size || 200) + "px";
    if (it.color) e.style.color = it.color;
    const str = (it.prefix || "") + Math.round(it.to).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0") + (it.suffix || "");
    const digits = [...str].filter((c) => /\d/.test(c)).length;
    let di = 0;
    for (const ch of str) {
      if (!/\d/.test(ch)) { const sp = mk("span", "cch", e); sp.textContent = ch === " " ? "\u00a0" : ch; continue; }
      const spins = Math.max(0, di - (digits - 3)) + 1;
      const col = mk("span", "dig", e);
      const inner = mk("span", "digcol", col);
      const total = spins * 10 + 10;
      for (let k = 0; k < total; k++) { const d = mk("span", "digit", inner); d.textContent = String(k % 10); }
      const target = spins * 10 + Number(ch);
      tl.fromTo(inner, { yPercent: 0 }, { yPercent: (-100 * target) / total, duration: (it.dur || 0.9) + di * 0.08, ease: "power3.out" }, it.at);
      di++;
    }
    tl.from(e, { opacity: 0, scale: 0.7, duration: 0.2, ease: "back.out(2)" }, it.at);
    if (it.jelly !== undefined) deform(e, { jelly: it.jelly }, 0);
  }

  function people(host, it) {
    for (let k = 0; k < it.n; k++) {
      const e = mk("div", "icon", host);
      px(e, { x: it.x + k * (it.size * 0.78), y: it.y });
      const inner = mk("div", "imi", e);
      inner.innerHTML = svgIcon("person", it.size, "rgba(255,255,255,.35)");
      tl.from(e, { y: -120, opacity: 0, duration: 0.35, ease: "bounce.out" }, it.at + k * 0.05);
      if (k < it.lit) {
        tl.to(inner.firstChild, { color: "#ffffff", duration: 0.08 }, it.litAt + k * 0.07);
        deform(inner, { jelly: it.litAt + k * 0.07 }, 0);
      }
    }
  }

  function line(host, it) {
    const e = mk("div", "hline", host);
    px(e, it);
    if (it.color) e.style.background = it.color;
    tl.from(e, { scaleX: 0, duration: 0.5, ease: "power3.out" }, it.at);
  }

  function arcs(host, it) {
    const svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("class", "arcs");
    svg.setAttribute("viewBox", "0 0 1080 1920");
    host.appendChild(svg);
    it.paths.forEach((p) => {
      const path = document.createElementNS(SVGNS, "path");
      path.setAttribute("d", p.d);
      path.setAttribute("stroke", it.color || "rgba(255,255,255,.6)");
      svg.appendChild(path);
      const len = p.len || 900;
      path.setAttribute("stroke-dasharray", "14 12");
      tl.fromTo(path, { attr: { "stroke-dashoffset": len }, opacity: 0 }, { attr: { "stroke-dashoffset": 0 }, opacity: 1, duration: 0.7, ease: "power2.out" }, p.at);
    });
  }

  function burst(host, it) {
    for (let k = 0; k < (it.n || 10); k++) {
      const e = mk("div", "spark", host);
      px(e, { x: it.x, y: it.y });
      e.innerHTML = svgIcon(it.icon || "paw", it.size || 60, it.color || "#fff");
      const ang = (k / (it.n || 10)) * Math.PI * 2 + rnd() * 0.5;
      const dist = (it.dist || 360) * (0.6 + rnd() * 0.6);
      tl.fromTo(e, { x: 0, y: 0, scale: 0.2, rotation: 0, opacity: 1 },
        { x: Math.cos(ang) * dist, y: Math.sin(ang) * dist, scale: 0.8 + rnd() * 0.6, rotation: (rnd() - 0.5) * 220, opacity: 0, duration: 0.9 + rnd() * 0.3, ease: "power2.out", immediateRender: false }, it.at);
    }
  }

  function orbit(host, it, t1) {
    const ring = mk("div", "orbit", host);
    px(ring, { x: it.cx - it.r, y: it.cy - it.r, w: it.r * 2, h: it.r * 2 });
    const dash = mk("div", "orbitline", ring);
    it.icons.forEach((name, k) => {
      const a = (k / it.icons.length) * Math.PI * 2 - Math.PI / 2;
      const holder = mk("div", "orbiticon", ring);
      holder.style.left = it.r + Math.cos(a) * it.r - 60 + "px";
      holder.style.top = it.r + Math.sin(a) * it.r - 60 + "px";
      const inner = mk("div", "imi", holder);
      inner.innerHTML = svgIcon(name, 120, it.color || "#fff");
      tl.from(holder, { scale: 0, opacity: 0, duration: 0.35, ease: "back.out(2.5)" }, it.at + k * 0.12);
      tl.to(inner, { rotation: -60, duration: t1 - it.at, ease: "none" }, it.at);
    });
    tl.from(dash, { scale: 0.3, opacity: 0, duration: 0.6, ease: "power3.out" }, it.at);
    tl.to(ring, { rotation: 60, duration: t1 - it.at, ease: "none" }, it.at);
  }

  function box(host, it) {
    const e = mk("div", "box " + (it.cls || ""), host);
    px(e, it);
    if (it.color) e.style.background = it.color;
    if (it.radius) e.style.borderRadius = it.radius + "px";
    if (it.clip) e.style.clipPath = it.clip;
    if (it.text) { e.textContent = it.text; }
    enter(e, it.anim || "fade", it.at);
    if (it.jelly !== undefined) deform(e, { jelly: it.jelly }, 0);
    return e;
  }

  function stamp(host, it) {
    const e = mk("div", "stamp", host);
    px(e, it);
    e.textContent = it.text;
    if (it.size) e.style.fontSize = it.size + "px";
    if (it.color) { e.style.color = it.color; e.style.borderColor = it.color; }
    if (it.light) { e.style.mixBlendMode = "normal"; e.style.opacity = "1"; e.style.background = "rgba(0,0,0,.35)"; }
    e.style.transform = "rotate(" + (it.rot || -10) + "deg)";
    tl.from(e, { scale: 2.6, opacity: 0, duration: 0.18, ease: "power4.in" }, it.at);
  }

  function bar(host, it) {
    if (it.label) {
      const l = mk("div", "barlab", host);
      px(l, { x: it.x, y: it.y - 46 });
      l.textContent = it.label;
      if (it.labelColor) l.style.color = it.labelColor;
      tl.from(l, { opacity: 0, y: 10, duration: 0.25, ease: "power2.out" }, it.at);
    }
    const e = mk("div", "bar", host);
    px(e, it);
    e.style.background = it.color || RED;
    tl.from(e, { scaleX: 0, duration: 0.8, ease: "power3.out" }, it.at);
    if (it.value) {
      const v = mk("div", "barval", host);
      px(v, { x: it.x + 24, y: it.y + (it.h - 90) / 2 });
      v.textContent = it.value;
      tl.from(v, { opacity: 0, x: -20, duration: 0.3, ease: "power2.out" }, it.at + 0.5);
    }
  }

  // Shatter: the element is cut into triangle shards (clones clipped by
  // polygons) that fly apart at `at`. The original hides at the same moment.
  function shatter(host, it, target) {
    const cols = it.cols || 5, rows = it.rows || 6;
    it.x = it.x !== undefined ? it.x : parseFloat(target.style.left) || 0;
    it.y = it.y !== undefined ? it.y : parseFloat(target.style.top) || 0;
    const W = (it.w = it.w || parseFloat(target.style.width));
    const H = (it.h = it.h || parseFloat(target.style.height));
    const pts = [];
    for (let r = 0; r <= rows; r++) {
      pts.push([]);
      for (let c = 0; c <= cols; c++) {
        const edge = r === 0 || c === 0 || r === rows || c === cols;
        pts[r].push([(c / cols) * 100 + (edge ? 0 : (rnd() - 0.5) * (70 / cols)), (r / rows) * 100 + (edge ? 0 : (rnd() - 0.5) * (70 / rows))]);
      }
    }
    const holder = mk("div", "shards", host);
    px(holder, { x: it.x, y: it.y, w: W, h: H, z: it.z });
    const tris = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const a = pts[r][c], b = pts[r][c + 1], d = pts[r + 1][c], e = pts[r + 1][c + 1];
      tris.push([a, b, e], [a, e, d]);
    }
    tris.forEach((tri) => {
      const sh = target.cloneNode(true);
      sh.removeAttribute("id");
      sh.classList.add("shard");
      // Clones copy the entrance tweens' starting inline state; shards show the
      // settled look, so clear it on the clone and every descendant.
      [sh, ...sh.querySelectorAll("*")].forEach((n) => { n.style.opacity = ""; n.style.transform = ""; n.style.visibility = ""; });
      if (it.rot) sh.style.transform = "rotate(" + it.rot + "deg)";
      sh.style.left = "0px"; sh.style.top = "0px";
      sh.style.clipPath = "polygon(" + tri.map((p) => p[0] + "% " + p[1] + "%").join(",") + ")";
      holder.appendChild(sh);
      const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3 - 50, cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3 - 50;
      tl.set(sh, { opacity: 0 }, 0);
      tl.set(sh, { opacity: 1 }, it.at);
      tl.to(sh, { x: cx * (8 + rnd() * 10), y: cy * (8 + rnd() * 10) + 300 + rnd() * 500, rotation: (rnd() - 0.5) * 540, opacity: 0, duration: 0.9 + rnd() * 0.4, ease: "power2.in" }, it.at + 0.01);
    });
    tl.set(target, { opacity: 0 }, it.at);
  }

  // Paper unfold: an accordion of N strips, each a clipped copy of the sheet,
  // opening one after another with rotateX and a fold shadow.
  function paper(host, it, t1, build) {
    const n = it.folds || 3;
    const wrap = mk("div", "paperwrap", host);
    px(wrap, { x: it.x, y: it.y, w: it.w, h: it.h, z: it.z });
    const sh = it.h / n;
    const seed0 = seed;
    for (let k = 0; k < n; k++) {
      seed = seed0; // every strip copy gets the same scatter order
      const strip = mk("div", "strip", wrap);
      px(strip, { x: 0, y: k * sh, w: it.w, h: sh });
      strip.style.transformOrigin = k === 0 ? "50% 100%" : "50% 0%";
      const sheet = mk("div", "sheet", strip);
      px(sheet, { x: 0, y: -k * sh, w: it.w, h: it.h });
      if (it.sheetColor) sheet.style.background = it.sheetColor;
      if (ASSETS.paper) { const pi = mk("img", "sheetpaper", sheet); pi.src = ASSETS.paper; }
      (it.items || []).forEach((child) => build(sheet, child, t1));
      const shade = mk("div", "foldshade", strip);
      const at = it.at + k * (it.step || 0.18);
      tl.from(strip, { rotationX: k === 0 ? -95 : 95, opacity: 0, duration: 0.5, ease: "power2.out" }, at);
      tl.fromTo(shade, { opacity: 0.6 }, { opacity: 0, duration: 0.5, ease: "power2.out" }, at);
    }
    tl.from(wrap, { y: 60, duration: 0.6 + n * 0.18, ease: "power2.out" }, it.at);
    return wrap;
  }

  // Scroll: a vertical scroll that unrolls from the top rod downwards.
  function scroll(host, it, t1, build) {
    const wrap = mk("div", "scrollwrap", host);
    px(wrap, { x: it.x, y: it.y, w: it.w, h: it.h, z: it.z });
    const body = mk("div", "scrollbody", wrap);
    (it.items || []).forEach((child) => build(body, child, t1));
    const top = mk("div", "rod", wrap); px(top, { x: -24, y: -22, w: it.w + 48, h: 40 });
    const bot = mk("div", "rod", wrap); px(bot, { x: -24, y: it.h - 18, w: it.w + 48, h: 40 });
    tl.fromTo(body, { clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0% 0)", duration: it.dur || 0.9, ease: "power2.inOut" }, it.at);
    tl.fromTo(bot, { y: -it.h }, { y: 0, duration: it.dur || 0.9, ease: "power2.inOut" }, it.at);
    tl.from([top, bot], { opacity: 0, duration: 0.2 }, it.at);
  }

  function group(host, it, t1, build) {
    const g = mk("div", "grp " + (it.cls || ""), host);
    px(g, it);
    if (it.bg) g.style.background = it.bg;
    if (it.clip) g.style.clipPath = it.clip;
    if (it.rays) { const r = mk("div", "rays", g); tl.fromTo(r, { rotation: 0 }, { rotation: 10, duration: t1 - it.at, ease: "none" }, it.at); }
    (it.items || []).forEach((child) => build(g, child, t1));
    enter(g, it.anim || "none", it.at);
    (it.moves || []).forEach((m) => tl.to(g, Object.assign({ duration: 0.5, ease: "power3.inOut" }, m.to), m.at));
    return g;
  }

  function build(host, it, t1) {
    const T = it.type;
    if (T === "title") title(host, it);
    else if (T === "kick") text(host, it, "kick");
    else if (T === "script") text(host, it, "script");
    else if (T === "img") return image(host, it, t1);
    else if (T === "lottie") lottieItem(host, it, t1);
    else if (T === "card") return card(host, it);
    else if (T === "icon") icon(host, it, t1);
    else if (T === "bubbles") bubbles(host, it);
    else if (T === "grid") grid(host, it);
    else if (T === "counter") counter(host, it);
    else if (T === "people") people(host, it);
    else if (T === "line") line(host, it);
    else if (T === "arcs") arcs(host, it);
    else if (T === "burst") burst(host, it);
    else if (T === "orbit") orbit(host, it, t1);
    else if (T === "box") return box(host, it);
    else if (T === "stamp") stamp(host, it);
    else if (T === "bar") bar(host, it);
    else if (T === "paper") return paper(host, it, t1, build);
    else if (T === "scroll") scroll(host, it, t1, build);
    else if (T === "group") return group(host, it, t1, build);
  }

  SCENES.forEach((s, i) => {
    const t0 = s.t;
    const t1 = i + 1 < SCENES.length ? SCENES[i + 1].t : DURATION;
    const sc = mk("div", "sc", root);
    sc.style.zIndex = 10 + i;
    const cam = mk("div", "cam", sc);
    const fx = mk("div", "fx", cam);
    background(fx, s, t0, t1);
    const byId = {};
    (s.items || []).forEach((it) => {
      if (it.at === undefined) it.at = t0 + 0.05;
      const el = build(fx, it, t1);
      if (it.id && el) byId[it.id] = el;
    });
    (s.shatter || []).forEach((sh) => { if (byId[sh.target]) shatter(fx, sh, byId[sh.target]); });

    // Camera: slow push by default, optional pan keyframes.
    tl.fromTo(cam, { scale: 1 }, { scale: s.push || 1.05, duration: t1 - t0, ease: "sine.inOut" }, t0);
    (s.pan || []).forEach((p) => tl.to(cam, Object.assign({ duration: 1.2, ease: "sine.inOut" }, p.to), p.at));
    // Impacts: shake (x/y jitter) and punch-in (scale) on the fx layer.
    (s.shake || []).forEach((at) => {
      for (let k = 0; k < 6; k++) tl.to(fx, { x: (rnd() - 0.5) * 34 * (1 - k / 6), y: (rnd() - 0.5) * 34 * (1 - k / 6), duration: 0.04, ease: "none" }, at + k * 0.04);
      tl.to(fx, { x: 0, y: 0, duration: 0.05 }, at + 0.24);
    });
    (s.punch || []).forEach((at) => {
      tl.to(fx, { scale: 1.08, duration: 0.08, ease: "power2.out" }, at);
      tl.to(fx, { scale: 1, duration: 0.45, ease: "power2.inOut" }, at + 0.08);
    });
    (s.flash || []).forEach((at) => {
      const f = mk("div", "flash", fx);
      tl.fromTo(f, { opacity: 0.85 }, { opacity: 0, duration: 0.25, ease: "power2.out", immediateRender: false }, at);
    });

    // Enter transition.
    const en = s.enter || "zoomcut";
    if (i === 0) tl.set(sc, { opacity: 1 }, 0);
    else if (en === "iris") {
      const o = s.iris || { x: 540, y: 960 };
      tl.set(sc, { opacity: 1 }, t0 - 0.3);
      tl.fromTo(sc, { clipPath: "circle(0px at " + o.x + "px " + o.y + "px)" }, { clipPath: "circle(2300px at " + o.x + "px " + o.y + "px)", duration: 0.45, ease: "power2.in" }, t0 - 0.3);
    } else if (en === "push") {
      tl.set(sc, { opacity: 1 }, t0 - 0.2);
      tl.fromTo(sc, { y: 1920 }, { y: 0, duration: 0.32, ease: "power3.inOut" }, t0 - 0.2);
    } else if (en === "slide") {
      tl.set(sc, { opacity: 1 }, t0 - 0.2);
      tl.fromTo(sc, { x: 1080 }, { x: 0, duration: 0.3, ease: "power3.inOut" }, t0 - 0.2);
    } else if (en === "glitch") {
      tl.set(sc, { opacity: 1 }, t0 - 0.12);
      [[-40, 0.3], [30, 0.7], [-12, 1]].forEach(([x, o], k) => tl.to(sc, { x: x, opacity: o, duration: 0.04, ease: "none" }, t0 - 0.12 + k * 0.04));
      tl.to(sc, { x: 0, opacity: 1, duration: 0.02 }, t0);
    } else {
      tl.fromTo(sc, { opacity: 0, scale: 1.07 }, { opacity: 1, scale: 1, duration: 0.14, ease: "power2.out" }, t0 - 0.07);
    }
    if (i + 1 < SCENES.length) tl.set(sc, { opacity: 0 }, t1 + 0.5);
  });

  function fitText() {
    document.querySelectorAll(".title .ln").forEach((ln) => {
      const bx = ln.parentElement;
      const base = parseFloat(ln.dataset.fs || getComputedStyle(ln).fontSize);
      ln.dataset.fs = String(base);
      ln.style.fontSize = base + "px";
      const w = ln.scrollWidth;
      if (w > bx.clientWidth * 0.96) ln.style.fontSize = Math.floor((base * bx.clientWidth * 0.96) / w) + "px";
    });
    document.querySelectorAll(".script").forEach((e) => {
      const base = parseFloat(e.dataset.fs || getComputedStyle(e).fontSize);
      e.dataset.fs = String(base);
      e.style.fontSize = base + "px";
      const room = 1000 - e.offsetLeft;
      if (e.scrollWidth > room) e.style.fontSize = Math.floor((base * room) / e.scrollWidth) + "px";
    });
  }
  fitText();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitText);

  try { window.lottie = undefined; } catch (err) { /* keep going */ }
  window.__timelines = window.__timelines || {};
  window.__timelines[COMP_ID] = tl;
})();

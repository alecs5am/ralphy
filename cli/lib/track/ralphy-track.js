/*
 * ralphy-track.js — apply a `ralphy track` JSON document to a HyperFrames
 * element (issue #559). Installed into a project by `ralphy track helper`.
 *
 * Deterministic under seek: the helper adds ONE tween on a plain proxy object
 * to the composition timeline. HyperFrames seeks with totalTime(t, false),
 * GSAP renders the proxy at that time and fires onUpdate, and onUpdate
 * writes a transform that is a pure function of the timeline time. No
 * requestAnimationFrame, no Date.now(), no state carried between frames.
 *
 *   RalphyTrack.follow(tl, el, track, opts)     point / face track -> translate
 *   RalphyTrack.cornerPin(tl, el, track, opts)  planar track -> matrix3d
 *
 * opts (both):
 *   clipStart   composition second where the tracked <video> starts (0)
 *   mediaStart  the video's data-media-start trim, source seconds (0)
 *   mapping     { box: [left, top, width, height], fit: "cover"|"contain"|"fill" }
 *               where the video is drawn in composition px. Default: identity.
 *   duration    tween length in composition seconds (default: through the
 *               last keyframe)
 *   smooth      moving-average radius in keyframes (0 = raw)
 *   minConfidence  keyframes below this are treated as lost (0.3)
 *   hideWhenLost   set opacity 0 while inside a lost stretch (false)
 * follow only:
 *   anchor      [ax, ay] element px pinned to the track point (center)
 *   offset      [dx, dy] composition px added after mapping ([0, 0])
 * cornerPin only:
 *   size        [w, h] element px mapped onto the quad (offsetWidth/Height)
 *   expand      push each quad corner outward (+) or inward (-) by this many
 *               px, e.g. 2-4 to hide the original screen's edge (0)
 *
 * Apply the track to a WRAPPER element and animate its children with GSAP:
 * the helper owns the wrapper's transform.
 */
(function (root) {
  "use strict";

  var VERSION = "1.0.0";

  function lerp(a, b, u) {
    return a + (b - a) * u;
  }

  function fitTransform(srcW, srcH, mapping) {
    if (!mapping || !mapping.box) return { sx: 1, sy: 1, ox: 0, oy: 0 };
    var b = mapping.box;
    var fit = mapping.fit || "cover";
    var sx = b[2] / srcW;
    var sy = b[3] / srcH;
    if (fit === "cover" || fit === "contain") {
      var s = fit === "cover" ? Math.max(sx, sy) : Math.min(sx, sy);
      sx = s;
      sy = s;
    } else if (fit !== "fill") {
      throw new Error("RalphyTrack: unknown fit " + fit);
    }
    return { sx: sx, sy: sy, ox: b[0] + (b[2] - srcW * sx) / 2, oy: b[1] + (b[3] - srcH * sy) / 2 };
  }

  function mapPoint(p, m) {
    return [p[0] * m.sx + m.ox, p[1] * m.sy + m.oy];
  }

  function usableKeys(track, opts) {
    var min = opts && typeof opts.minConfidence === "number" ? opts.minConfidence : 0.3;
    var keys = [];
    for (var i = 0; i < track.keyframes.length; i++) {
      var k = track.keyframes[i];
      if (!k.lost && k.confidence >= min) keys.push(k);
    }
    if (keys.length === 0) throw new Error("RalphyTrack: track has no usable keyframes");
    var r = opts && opts.smooth ? Math.max(0, Math.floor(opts.smooth)) : 0;
    if (r === 0) return keys;
    var out = [];
    for (var j = 0; j < keys.length; j++) {
      var lo = Math.max(0, j - r);
      var hi = Math.min(keys.length - 1, j + r);
      var n = hi - lo + 1;
      var sk = { t: keys[j].t, x: 0, y: 0, lost: false, confidence: keys[j].confidence };
      if (keys[j].corners) sk.corners = [[0, 0], [0, 0], [0, 0], [0, 0]];
      for (var q = lo; q <= hi; q++) {
        sk.x += keys[q].x / n;
        sk.y += keys[q].y / n;
        if (sk.corners) {
          for (var c = 0; c < 4; c++) {
            sk.corners[c][0] += keys[q].corners[c][0] / n;
            sk.corners[c][1] += keys[q].corners[c][1] / n;
          }
        }
      }
      out.push(sk);
    }
    return out;
  }

  // Index of the last key with key.t <= t, or -1.
  function floorIndex(keys, t) {
    var lo = 0;
    var hi = keys.length - 1;
    if (t < keys[0].t) return -1;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if (keys[mid].t <= t) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  // Sample usable keys at source time t: linear interpolation between the
  // surrounding keys, clamped (held) before the first and after the last.
  function sampleKeys(keys, t) {
    var i = floorIndex(keys, t);
    var a;
    var b;
    var u;
    if (i < 0) {
      a = b = keys[0];
      u = 0;
    } else if (i >= keys.length - 1) {
      a = b = keys[keys.length - 1];
      u = 0;
    } else {
      a = keys[i];
      b = keys[i + 1];
      u = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
    }
    var s = { t: t, x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u) };
    if (a.corners && b.corners) {
      s.corners = [];
      for (var c = 0; c < 4; c++) {
        s.corners.push([lerp(a.corners[c][0], b.corners[c][0], u), lerp(a.corners[c][1], b.corners[c][1], u)]);
      }
    }
    return s;
  }

  // True when the raw keyframe nearest to t is lost (for hideWhenLost).
  function lostAt(track, t, min) {
    var keys = track.keyframes;
    var i = floorIndex(keys, t);
    var k = keys[Math.max(0, Math.min(keys.length - 1, i))];
    return !!(k.lost || k.confidence < min);
  }

  function sample(track, t, opts) {
    return sampleKeys(usableKeys(track, opts), t);
  }

  // Solve the 8x8 system for the homography mapping src[i] -> dst[i].
  // Returns [a, b, c, d, e, f, g, h] with
  //   u = (a x + b y + c) / (g x + h y + 1),  v = (d x + e y + f) / (g x + h y + 1)
  function homography(src, dst) {
    var A = [];
    for (var i = 0; i < 4; i++) {
      var x = src[i][0];
      var y = src[i][1];
      var u = dst[i][0];
      var v = dst[i][1];
      A.push([x, y, 1, 0, 0, 0, -x * u, -y * u, u]);
      A.push([0, 0, 0, x, y, 1, -x * v, -y * v, v]);
    }
    for (var col = 0; col < 8; col++) {
      var piv = col;
      for (var r = col + 1; r < 8; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
      if (Math.abs(A[piv][col]) < 1e-12) throw new Error("RalphyTrack: degenerate quad");
      var tmp = A[col];
      A[col] = A[piv];
      A[piv] = tmp;
      for (var r2 = 0; r2 < 8; r2++) {
        if (r2 === col) continue;
        var f = A[r2][col] / A[col][col];
        if (f === 0) continue;
        for (var k = col; k < 9; k++) A[r2][k] -= f * A[col][k];
      }
    }
    var h = [];
    for (var j = 0; j < 8; j++) h.push(A[j][8] / A[j][j]);
    return h;
  }

  function applyHomography(h, p) {
    var w = h[6] * p[0] + h[7] * p[1] + 1;
    return [(h[0] * p[0] + h[1] * p[1] + h[2]) / w, (h[3] * p[0] + h[4] * p[1] + h[5]) / w];
  }

  // Pixel values: 1/1000 px is far below what a frame can show.
  function fmt(n) {
    var v = Math.abs(n) < 1e-9 ? 0 : n;
    return String(Math.round(v * 1e3) / 1e3);
  }

  // Matrix coefficients: keep 12 significant digits. The projective terms
  // are tiny (around 1e-4) and multiply pixel coordinates, so fixed-decimal
  // rounding would bend the far corners.
  function fmtM(n) {
    var v = Math.abs(n) < 1e-14 ? 0 : n;
    return String(Number(v.toPrecision(12)));
  }

  // CSS matrix3d (column-major) that maps the element rect (0,0)-(w,h) onto
  // quad [TL, TR, BR, BL]. Needs transform-origin: 0 0.
  function cornerPinMatrix3d(w, h, quad) {
    var H = homography([[0, 0], [w, 0], [w, h], [0, h]], quad);
    var m = [H[0], H[3], 0, H[6], H[1], H[4], 0, H[7], 0, 0, 1, 0, H[2], H[5], 0, 1];
    return "matrix3d(" + m.map(fmtM).join(", ") + ")";
  }

  function expandQuad(quad, d) {
    if (!d) return quad;
    var cx = (quad[0][0] + quad[1][0] + quad[2][0] + quad[3][0]) / 4;
    var cy = (quad[0][1] + quad[1][1] + quad[2][1] + quad[3][1]) / 4;
    var out = [];
    for (var i = 0; i < 4; i++) {
      var dx = quad[i][0] - cx;
      var dy = quad[i][1] - cy;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      out.push([quad[i][0] + (dx / len) * d * Math.SQRT2, quad[i][1] + (dy / len) * d * Math.SQRT2]);
    }
    return out;
  }

  function sourceTime(c, opts) {
    return c - (opts.clipStart || 0) + (opts.mediaStart || 0);
  }

  function defaultDuration(track, opts) {
    var last = track.keyframes[track.keyframes.length - 1].t;
    return Math.max(0.001, (opts.clipStart || 0) + last - (opts.mediaStart || 0));
  }

  // Pure: the CSS a follow() element gets at composition time c.
  function followStyleAt(track, keys, c, opts, m, anchor) {
    var s = sampleKeys(keys, sourceTime(c, opts));
    var p = mapPoint([s.x, s.y], m);
    var off = opts.offset || [0, 0];
    return {
      transform: "translate(" + fmt(p[0] - anchor[0] + off[0]) + "px, " + fmt(p[1] - anchor[1] + off[1]) + "px)",
      opacity: opts.hideWhenLost && lostAt(track, sourceTime(c, opts), minConf(opts)) ? "0" : "",
    };
  }

  // Pure: the CSS a cornerPin() element gets at composition time c.
  function cornerPinStyleAt(track, keys, c, opts, m, size) {
    var s = sampleKeys(keys, sourceTime(c, opts));
    if (!s.corners) throw new Error("RalphyTrack: cornerPin needs a planar track");
    var quad = [];
    for (var i = 0; i < 4; i++) quad.push(mapPoint(s.corners[i], m));
    quad = expandQuad(quad, opts.expand || 0);
    return {
      transform: cornerPinMatrix3d(size[0], size[1], quad),
      opacity: opts.hideWhenLost && lostAt(track, sourceTime(c, opts), minConf(opts)) ? "0" : "",
    };
  }

  function minConf(opts) {
    return typeof opts.minConfidence === "number" ? opts.minConfidence : 0.3;
  }

  function attach(tl, el, opts, track, styleAt) {
    var proxy = { c: 0 };
    var dur = typeof opts.duration === "number" ? opts.duration : defaultDuration(track, opts);
    function render() {
      var st = styleAt(proxy.c);
      el.style.transform = st.transform;
      el.style.opacity = st.opacity;
    }
    render();
    tl.to(proxy, { c: dur, duration: dur, ease: "none", onUpdate: render }, 0);
    return { duration: dur, render: render, proxy: proxy };
  }

  function follow(tl, el, track, opts) {
    opts = opts || {};
    var keys = usableKeys(track, opts);
    var m = fitTransform(track.source.width, track.source.height, opts.mapping);
    var anchor = opts.anchor || [(el.offsetWidth || 0) / 2, (el.offsetHeight || 0) / 2];
    el.style.position = el.style.position || "absolute";
    el.style.left = "0px";
    el.style.top = "0px";
    el.style.willChange = "transform";
    return attach(tl, el, opts, track, function (c) {
      return followStyleAt(track, keys, c, opts, m, anchor);
    });
  }

  function cornerPin(tl, el, track, opts) {
    opts = opts || {};
    if (track.kind !== "planar") throw new Error("RalphyTrack: cornerPin needs a planar track");
    var keys = usableKeys(track, opts);
    var m = fitTransform(track.source.width, track.source.height, opts.mapping);
    var size = opts.size || [el.offsetWidth, el.offsetHeight];
    if (!(size[0] > 0 && size[1] > 0)) throw new Error("RalphyTrack: cornerPin needs opts.size or a laid-out element");
    el.style.position = el.style.position || "absolute";
    el.style.left = "0px";
    el.style.top = "0px";
    el.style.width = size[0] + "px";
    el.style.height = size[1] + "px";
    el.style.transformOrigin = "0 0";
    el.style.willChange = "transform";
    return attach(tl, el, opts, track, function (c) {
      return cornerPinStyleAt(track, keys, c, opts, m, size);
    });
  }

  var api = {
    version: VERSION,
    fitTransform: fitTransform,
    mapPoint: mapPoint,
    usableKeys: usableKeys,
    sample: sample,
    sampleKeys: sampleKeys,
    homography: homography,
    applyHomography: applyHomography,
    cornerPinMatrix3d: cornerPinMatrix3d,
    expandQuad: expandQuad,
    sourceTime: sourceTime,
    followStyleAt: followStyleAt,
    cornerPinStyleAt: cornerPinStyleAt,
    follow: follow,
    cornerPin: cornerPin,
  };
  root.RalphyTrack = api;
})(typeof window !== "undefined" ? window : globalThis);

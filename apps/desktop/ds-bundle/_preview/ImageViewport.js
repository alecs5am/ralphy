"use strict";
var __dsPreview = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __esm = (fn, res, err) => function __init() {
    if (err) throw err[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
    } catch (e) {
      throw err = [e], e;
    }
  };
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default"));
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // <define:import.meta.env>
  var init_define_import_meta_env = __esm({
    "<define:import.meta.env>"() {
    }
  });

  // ds-raw:__ds_raw__
  var require_ds_raw = __commonJS({
    "ds-raw:__ds_raw__"(exports, module) {
      init_define_import_meta_env();
      module.exports = window.RalphyDesktop;
    }
  });

  // shim:react-shim
  var require_react_shim = __commonJS({
    "shim:react-shim"(exports, module) {
      init_define_import_meta_env();
      var R = window.React;
      function np(p, k) {
        var o = {};
        for (var x in p) if (x !== "children") o[x] = p[x];
        if (k !== void 0) o.key = k;
        return o;
      }
      function jsx2(t, p, k) {
        var c = p && p.children;
        return c === void 0 ? R.createElement(t, np(p, k)) : R.createElement(t, np(p, k), c);
      }
      function jsxs(t, p, k) {
        return R.createElement.apply(R, [t, np(p, k)].concat(p.children));
      }
      module.exports = R;
      module.exports.jsx = jsx2;
      module.exports.jsxs = jsxs;
      module.exports.jsxDEV = function(t, p, k, s) {
        return (s ? jsxs : jsx2)(t, p, k);
      };
      module.exports.Fragment = R.Fragment;
    }
  });

  // .design-sync/previews/ImageViewport.tsx
  var ImageViewport_exports = {};
  __export(ImageViewport_exports, {
    Compact: () => Compact,
    PortraitFrame: () => PortraitFrame,
    Viewer: () => Viewer
  });
  init_define_import_meta_env();

  // ds-shim:ds
  var ds_exports = {};
  __export(ds_exports, {
    default: () => ds_default
  });
  init_define_import_meta_env();
  __reExport(ds_exports, __toESM(require_ds_raw()));
  var g = window.RalphyDesktop;
  var ds_default = "default" in g ? g.default : g;

  // .design-sync/previews/ImageViewport.tsx
  var import_jsx_runtime = __toESM(require_react_shim(), 1);
  var still = (label, a, b) => `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 160 100">
       <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
         <stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/>
       </linearGradient></defs>
       <rect width="160" height="100" fill="url(#g)"/>
       <circle cx="112" cy="34" r="18" fill="#ffffff" opacity="0.14"/>
       <rect x="12" y="70" width="64" height="4" rx="2" fill="#ffffff" opacity="0.5"/>
       <rect x="12" y="79" width="38" height="3" rx="1.5" fill="#ffffff" opacity="0.28"/>
       <text x="12" y="24" font-family="monospace" font-size="7" fill="#ffffff" opacity="0.75">${label}</text>
     </svg>`
  )}`;
  var Stage = ({ children }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "div",
    {
      style: {
        width: 460,
        height: 280,
        display: "grid",
        overflow: "hidden",
        borderRadius: "var(--radius-lg)",
        background: "var(--sunken)"
      },
      children
    }
  );
  var Viewer = () => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stage, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.ImageViewport, { src: still("scene-01-hook.png", "#6d5ce7", "#2a2350"), name: "scene-01-hook.png" }) });
  var Compact = () => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { width: 320, height: 200, display: "grid", overflow: "hidden", borderRadius: "var(--radius-lg)", background: "var(--sunken)" }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    ds_exports.ImageViewport,
    {
      src: still("grinder-front.jpg", "#8a5a3b", "#2b1c14"),
      name: "grinder-front.jpg",
      compact: true
    }
  ) });
  var PortraitFrame = () => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stage, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    ds_exports.ImageViewport,
    {
      src: `data:image/svg+xml;utf8,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1600" viewBox="0 0 90 160">
           <rect width="90" height="160" fill="#1d2b24"/>
           <rect x="0" y="112" width="90" height="48" fill="#0f1a15"/>
           <circle cx="45" cy="62" r="26" fill="#7cb994" opacity="0.35"/>
           <text x="8" y="18" font-family="monospace" font-size="5" fill="#ffffff" opacity="0.7">final.mp4 · 9:16</text>
         </svg>`
      )}`,
      name: "final-frame.png"
    }
  ) });
  return __toCommonJS(ImageViewport_exports);
})();

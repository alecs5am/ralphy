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

  // .design-sync/previews/VideoPlayer.tsx
  var VideoPlayer_exports = {};
  __export(VideoPlayer_exports, {
    Compact: () => Compact,
    Unplayable: () => Unplayable,
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

  // .design-sync/preview-clip.ts
  init_define_import_meta_env();
  var CLIP_MP4 = "data:video/mp4;base64,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O8B4wAAAAAdBm8A7wHjAAAAAB0Gb4DvAeMAAAAAHQZoAO8B4wAAAAAdBmiA7wHjAAAAAB0GaQDvAeMAAAAAHQZpgO8B4wAAAAAdBmoA7wHjAAAAAB0GaoDvAeMAAAAAHQZrAO8B4wAAAAAdBmuA7wHjAAAAAB0GbADvAeMAAAAAHQZsgO8B4wAAAAAdBm0A7wHjAAAAAB0GbYDvAeMAAAAAHQZuAO8B4wAAAAAdBm6A7wHjAAAAAB0GbwDvAeMAAAAAHQZvgO8B4wAAAAAdBmgA7wHjAAAAAB0GaIDvAeMAAAAAHQZpAO8B4wAAAAAdBmmA7wHjAAAAAB0GagDvAeMAAAAAHQZqgO8B4wAAAAAdBmsA7wHjAAAAAB0Ga4DvAeMAAAAAHQZsAO8B4wAAAAAdBmyA7wHjAAAAAB0GbQDvAeMAAAAAHQZtgO8B4wAAAAAdBm4A7wHjAAAAAB0GboDvAeMAAAAAHQZvAO8B4wAAAAAdBm+A7wHjAAAAAB0GaADvAeMAAAAAHQZogO8B4wAAAAAdBmkA7wHjAAAAAB0GaYDvAeMAAAAAHQZqAO8B4wAAAAAdBmqA7wHjAAAAAB0GawDvAeMAAAAAHQZrgO8B4wAAAAAdBmwA7wHjAAAAAB0GbIDvAeMAAAAAHQZtAO8B4wAAAAAdBm2A7wHjAAAAAB0GbgDvAeMAAAAAHQZugO8B4wAAAAAdBm8A7wHjAAAAAB0Gb4DvAeMAAAAAHQZoAO8B4wAAAAAdBmiA7wHjAAAAAB0GaQDvAeMAAAAAHQZpgO8B4wAAAAAdBmoA7wHjAAAAAB0GaoDvAeMAAAAAHQZrAO8B4wAAAAAdBmuA7wHjAAAAAB0GbADfAeMAAAAAHQZsgM8B4wA==";

  // .design-sync/previews/VideoPlayer.tsx
  var import_jsx_runtime = __toESM(require_react_shim(), 1);
  var Stage = ({
    width = 460,
    height = 280,
    children
  }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "div",
    {
      style: {
        width,
        height,
        display: "grid",
        overflow: "hidden",
        borderRadius: "var(--radius-lg)",
        background: "var(--sunken)"
      },
      children
    }
  );
  var Viewer = () => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stage, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.VideoPlayer, { src: CLIP_MP4, name: "final.mp4" }) });
  var Compact = () => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stage, { width: 340, height: 190, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.VideoPlayer, { src: CLIP_MP4, name: "scene-01-hook.mp4", compact: true }) });
  var Unplayable = () => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stage, { width: 340, height: 190, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.VideoPlayer, { src: "/render/missing.mp4", name: "missing.mp4" }) });
  return __toCommonJS(VideoPlayer_exports);
})();

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
      function jsxs2(t, p, k) {
        return R.createElement.apply(R, [t, np(p, k)].concat(p.children));
      }
      module.exports = R;
      module.exports.jsx = jsx2;
      module.exports.jsxs = jsxs2;
      module.exports.jsxDEV = function(t, p, k, s) {
        return (s ? jsxs2 : jsx2)(t, p, k);
      };
      module.exports.Fragment = R.Fragment;
    }
  });

  // .design-sync/previews/AiBrandIcon.tsx
  var AiBrandIcon_exports = {};
  __export(AiBrandIcon_exports, {
    InferredFromModelId: () => InferredFromModelId,
    Providers: () => Providers,
    Sizes: () => Sizes
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

  // .design-sync/previews/AiBrandIcon.tsx
  var import_jsx_runtime = __toESM(require_react_shim(), 1);
  var Cell = ({
    label,
    children
  }) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "span",
    {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "var(--space-2)",
        height: "var(--control-md)",
        padding: "0 var(--space-3)",
        borderRadius: "var(--radius-pill)",
        background: "var(--raised)",
        color: "var(--fg-2)",
        font: `var(--text-sm)/var(--leading-tight) var(--font-sans)`
      },
      children: [
        children,
        label
      ]
    }
  );
  var Wrap = ({ children }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", gap: "var(--space-2)", flexWrap: "wrap", maxWidth: 460 }, children });
  var Providers = () => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Wrap, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cell, { label: "claude", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.AiBrandIcon, { provider: "claude" }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cell, { label: "codex", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.AiBrandIcon, { provider: "codex" }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cell, { label: "openrouter", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.AiBrandIcon, { provider: "openrouter" }) })
  ] });
  var InferredFromModelId = () => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Wrap, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cell, { label: "openai/gpt-5.4-image-2", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.AiBrandIcon, { provider: "openrouter", model: "openai/gpt-5.4-image-2" }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cell, { label: "google/gemini-3-pro", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.AiBrandIcon, { provider: "openrouter", model: "google/gemini-3-pro" }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cell, { label: "deepseek/deepseek-v4", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.AiBrandIcon, { provider: "openrouter", model: "deepseek/deepseek-v4" }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cell, { label: "meta-llama/llama-4-70b", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.AiBrandIcon, { provider: "openrouter", model: "meta-llama/llama-4-70b" }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cell, { label: "x-ai/grok-4", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.AiBrandIcon, { provider: "openrouter", model: "x-ai/grok-4" }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cell, { label: "qwen/qwen3-max", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.AiBrandIcon, { provider: "openrouter", model: "qwen/qwen3-max" }) })
  ] });
  var Sizes = () => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Wrap, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cell, { label: "14", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.AiBrandIcon, { provider: "claude", size: 14 }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cell, { label: "18 — default", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.AiBrandIcon, { provider: "claude" }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cell, { label: "24", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.AiBrandIcon, { provider: "claude", size: 24 }) })
  ] });
  return __toCommonJS(AiBrandIcon_exports);
})();

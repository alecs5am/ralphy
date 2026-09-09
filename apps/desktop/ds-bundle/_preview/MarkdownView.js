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

  // .design-sync/previews/MarkdownView.tsx
  var MarkdownView_exports = {};
  __export(MarkdownView_exports, {
    Brief: () => Brief,
    ChecklistAndTable: () => ChecklistAndTable,
    CodeAndInline: () => CodeAndInline
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

  // .design-sync/previews/MarkdownView.tsx
  var import_jsx_runtime = __toESM(require_react_shim(), 1);
  var Sheet = ({ children }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "viewer-document", style: { width: 520 }, children });
  var brief = `# Arc Grinder Launch

A tactile **15-second** creator review focused on grind consistency, shot on a
warm kitchen counter. Delivery is *vertical 9:16* for TikTok, with a 4:5 cutdown
for Instagram.

## Hook

Open on the burr close-up — the sound of the grind carries the first beat. Keep
the specular highlight off the chrome collar; it reads as blown-out on phone
screens.

## Shot list

1. Burr macro, 1.2s, no VO
2. Hand loading beans, 1.8s
3. Dial click, 0.9s — sync to the beat
4. Pour into portafilter, 2.4s

## Notes

- Reference boards live under \`artifacts/refs/\`
- Voice-over take 3 is the keeper; takes 1–2 clip on the plosives
- See the [storyboard](./STORYBOARD.md) before re-rendering
`;
  var changelog = `## Delivery checklist

- [x] Final render exported at 1080×1920
- [x] Captions burned in
- [ ] Client review pass

> Hold delivery until the colour pass lands — the counter reads green under the
> current LUT.

| Slot | Model | Cost |
| --- | --- | --- |
| image | \`gpt-5.4-image-2\` | $0.18 |
| video | \`kling-v3.0-pro\` | $1.20 |
| speech | \`eleven-v3\` | $0.04 |
`;
  var code = `### Recompose a unit

Run the composer against a single slot:

\`\`\`bash
ralphy render coffee-grinder-001 --slot hook
\`\`\`

The inline form is \`ralphy doctor\`, and ~~legacy \`--fast\`~~ was removed in 0.9.
`;
  var Brief = () => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sheet, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.MarkdownView, { markdown: brief }) });
  var ChecklistAndTable = () => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sheet, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.MarkdownView, { markdown: changelog }) });
  var CodeAndInline = () => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sheet, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.MarkdownView, { markdown: code }) });
  return __toCommonJS(MarkdownView_exports);
})();

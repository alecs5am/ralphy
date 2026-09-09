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

  // .design-sync/previews/MainHeader.tsx
  var MainHeader_exports = {};
  __export(MainHeader_exports, {
    LibraryRoot: () => LibraryRoot,
    SidebarCollapsed: () => SidebarCollapsed,
    WithSidebar: () => WithSidebar
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

  // .design-sync/preview-fixtures.ts
  init_define_import_meta_env();
  var ROOT = "/Users/creator/Movies/ralphy";
  var PROJECT_PATH = `${ROOT}/workspaces/launch-studio/projects/coffee-grinder-001`;
  function generation(operation, costUsd, model) {
    return {
      provider: "openrouter",
      model,
      operation,
      timestamp: "2026-07-30T09:35:00.000Z",
      costUsd,
      slot: operation
    };
  }
  function item(relativePath, entity, kind, sizeBytes, gen = null) {
    const name = relativePath.split("/").at(-1) ?? relativePath;
    const dot = name.lastIndexOf(".");
    return {
      id: `mock-${relativePath.replaceAll("/", "-")}`,
      workspaceId: "launch-studio",
      projectId: "coffee-grinder-001",
      name,
      absolutePath: `${PROJECT_PATH}/${relativePath}`,
      projectRelativePath: relativePath,
      entity,
      kind,
      extension: dot >= 0 ? name.slice(dot).toLowerCase() : "",
      sizeBytes,
      modifiedAt: "2026-07-30T09:42:00.000Z",
      generation: gen
    };
  }
  var finalRender = item(
    "render/final.mp4",
    "final-render",
    "video",
    1842e4,
    generation("render", 0, "ffmpeg")
  );
  var heroImage = item(
    "artifacts/images/scene-01-hook.png",
    "generated-artifact",
    "image",
    284e4,
    generation("image", 0.18, "openai/gpt-5.4-image-2")
  );
  var heroVideo = item(
    "artifacts/videos/scene-01-hook.mp4",
    "generated-artifact",
    "video",
    861e4,
    generation("video", 1.2, "kwaivgi/kling-v3.0-pro")
  );
  var referenceImage = item(
    "artifacts/refs/grinder-front.jpg",
    "reference",
    "image",
    124e4
  );
  var voiceTrack = item(
    "artifacts/audio/vo-take-03.wav",
    "generated-artifact",
    "audio",
    418e4,
    generation("speech", 0.04, "elevenlabs/eleven-v3")
  );
  var briefDoc = item("BRIEF.md", "lifecycle-document", "text", 2140);
  var items = [
    finalRender,
    heroImage,
    heroVideo,
    item(
      "artifacts/images/scene-02-detail.png",
      "generated-artifact",
      "image",
      312e4,
      generation("image", 0.18, "openai/gpt-5.4-image-2")
    ),
    item(
      "artifacts/videos/scene-02-detail.mp4",
      "generated-artifact",
      "video",
      794e4,
      generation("video", 1.2, "kwaivgi/kling-v3.0-pro")
    ),
    referenceImage,
    item("artifacts/refs/counter-lighting.jpg", "reference", "image", 98e4),
    voiceTrack,
    item("units/hero/cut.mp4", "unit-asset", "video", 168e5),
    briefDoc,
    item("production-plan.json", "lifecycle-document", "text", 12480),
    item("STORYBOARD.md", "lifecycle-document", "text", 8320),
    item("index.html", "production-file", "text", 18940)
  ];
  var shortlisted = {
    reviewStatus: "Shortlist",
    favorite: true,
    rating: 4,
    tags: ["hook", "warm-light"],
    notes: "Keep framing; reduce the specular highlight.",
    updatedAt: "2026-07-30T09:40:00.000Z"
  };
  var needsWork = {
    reviewStatus: "Needs Work",
    favorite: false,
    rating: 2,
    tags: ["grind-detail"],
    notes: "Motion blur on the burr close-up reads as a compression artifact.",
    updatedAt: "2026-07-30T09:41:00.000Z"
  };
  var approved = {
    reviewStatus: "Approved",
    favorite: false,
    rating: 5,
    tags: ["final"],
    notes: "",
    updatedAt: "2026-07-30T09:44:00.000Z"
  };
  var workspaces = [
    {
      id: "launch-studio",
      name: "Launch Studio",
      description: "Active launches for the hardware line.",
      absolutePath: `${ROOT}/workspaces/launch-studio`,
      projectCount: 7,
      sharedCount: 12,
      unitCount: 9,
      finalCount: 4,
      recentActivity: "2026-07-30T09:42:00.000Z"
    },
    {
      id: "archive",
      name: "Archive",
      description: "Completed campaigns retained for reference.",
      absolutePath: `${ROOT}/workspaces/archive`,
      projectCount: 18,
      sharedCount: 6,
      unitCount: 31,
      finalCount: 26,
      recentActivity: "2026-07-22T12:00:00.000Z"
    }
  ];
  var projects = [
    {
      id: "launch-studio/coffee-grinder-001",
      workspaceId: "launch-studio",
      projectId: "coffee-grinder-001",
      name: "Arc Grinder Launch",
      brief: "A tactile 15-second creator review focused on grind consistency.",
      absolutePath: PROJECT_PATH,
      status: "assets",
      phase: "production",
      finalState: "review",
      platform: "tiktok",
      aspectRatio: "9:16",
      spendUsd: 3.84,
      finalCount: 1,
      sharedCount: 12,
      unitCount: 3,
      recentActivity: "2026-07-30T09:42:00.000Z"
    },
    {
      id: "launch-studio/skin-set-004",
      workspaceId: "launch-studio",
      projectId: "skin-set-004",
      name: "Night Set Unboxing",
      brief: "Warm bathroom-counter unboxing with three product details.",
      absolutePath: `${ROOT}/workspaces/launch-studio/projects/skin-set-004`,
      status: "done",
      phase: "delivery",
      finalState: "ready",
      platform: "instagram",
      aspectRatio: "4:5",
      spendUsd: 6.2,
      finalCount: 2,
      sharedCount: 12,
      unitCount: 3,
      recentActivity: "2026-07-29T16:21:00.000Z"
    },
    {
      id: "launch-studio/trail-shoe-002",
      workspaceId: "launch-studio",
      projectId: "trail-shoe-002",
      name: "Trail Shoe Macro",
      brief: "Mud, tread, and lace detail cuts for a concise paid social spot.",
      absolutePath: `${ROOT}/workspaces/launch-studio/projects/trail-shoe-002`,
      status: "prompts",
      phase: "preflight",
      finalState: "missing",
      platform: "youtube-shorts",
      aspectRatio: "9:16",
      spendUsd: 0.65,
      finalCount: 0,
      sharedCount: 12,
      unitCount: 2,
      recentActivity: "2026-07-28T11:05:00.000Z"
    }
  ];
  var noop = () => {
  };
  var scan = {
    rootPath: ROOT,
    workspaceId: "launch-studio",
    projectId: "coffee-grinder-001",
    generation: 1,
    items,
    ledger: {
      entries: items.flatMap((entry) => entry.generation ? [entry.generation] : []),
      totalCostUsd: 3.84,
      malformedLineCount: 0,
      oversizedLineCount: 0,
      truncated: false
    },
    completedAt: "2026-07-30T09:43:00.000Z"
  };
  var annotations = {
    [heroImage.id]: shortlisted,
    [finalRender.id]: approved,
    [referenceImage.id]: needsWork
  };

  // .design-sync/previews/MainHeader.tsx
  var import_jsx_runtime = __toESM(require_react_shim(), 1);
  var Bar = ({ children }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { width: 720, background: "var(--canvas)" }, children });
  var trail = [
    { label: "Launch Studio", onClick: noop },
    { label: "Arc Grinder Launch", onClick: noop }
  ];
  var WithSidebar = () => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Bar, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    ds_exports.MainHeader,
    {
      breadcrumbs: trail,
      sidebarVisible: true,
      canGoBack: true,
      canGoForward: false,
      rightPanelVisible: true,
      bottomPanelVisible: false,
      showChooseLibrary: false,
      onBack: noop,
      onForward: noop,
      onToggleSidebar: noop,
      onChooseLibrary: noop,
      onToggleRightPanel: noop,
      onToggleBottomPanel: noop
    }
  ) });
  var SidebarCollapsed = () => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Bar, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    ds_exports.MainHeader,
    {
      breadcrumbs: trail,
      sidebarVisible: false,
      canGoBack: true,
      canGoForward: true,
      rightPanelVisible: false,
      bottomPanelVisible: true,
      showChooseLibrary: false,
      onBack: noop,
      onForward: noop,
      onToggleSidebar: noop,
      onChooseLibrary: noop,
      onToggleRightPanel: noop,
      onToggleBottomPanel: noop
    }
  ) });
  var LibraryRoot = () => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Bar, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    ds_exports.MainHeader,
    {
      breadcrumbs: [{ label: "Ralphy library" }],
      sidebarVisible: true,
      canGoBack: false,
      canGoForward: false,
      rightPanelVisible: false,
      bottomPanelVisible: false,
      showChooseLibrary: true,
      onBack: noop,
      onForward: noop,
      onToggleSidebar: noop,
      onChooseLibrary: noop,
      onToggleRightPanel: noop,
      onToggleBottomPanel: noop
    }
  ) });
  return __toCommonJS(MainHeader_exports);
})();

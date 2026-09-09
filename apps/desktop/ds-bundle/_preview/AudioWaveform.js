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

  // .design-sync/previews/AudioWaveform.tsx
  var AudioWaveform_exports = {};
  __export(AudioWaveform_exports, {
    Compact: () => Compact,
    MusicBed: () => MusicBed,
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
  var TAKE_MP3 = "data:audio/mpeg;base64,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";

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

  // .design-sync/previews/AudioWaveform.tsx
  var import_jsx_runtime = __toESM(require_react_shim(), 1);
  var Stage = ({
    width = 460,
    height = 200,
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
  var Viewer = () => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stage, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    ds_exports.AudioWaveform,
    {
      src: TAKE_MP3,
      path: voiceTrack.absolutePath,
      name: voiceTrack.name,
      sizeBytes: voiceTrack.sizeBytes
    }
  ) });
  var Compact = () => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stage, { width: 340, height: 150, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    ds_exports.AudioWaveform,
    {
      src: TAKE_MP3,
      path: voiceTrack.absolutePath,
      name: voiceTrack.name,
      sizeBytes: voiceTrack.sizeBytes,
      compact: true
    }
  ) });
  var MusicBed = () => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stage, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    ds_exports.AudioWaveform,
    {
      src: TAKE_MP3,
      path: "/library/beds/warm-kitchen-loop.mp3",
      name: "warm-kitchen-loop.mp3",
      sizeBytes: 624e4
    }
  ) });
  return __toCommonJS(AudioWaveform_exports);
})();

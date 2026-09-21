import { createHash } from "node:crypto";

// Like the visual-asset manifest, these exact bytes describe exported media, not app chrome.
// The .sv-* and .rv-* rules are reusable compositions; their HTML modules export standalone
// documents. Controls and preview frames stay outside this list and retain every UI paint guard.
export const INSTRUMENT_MEDIA_SOURCE_SHA256 = Object.freeze({
  "src/pages/marketplace/lib/studio-visual-scenes.ts": "70b7c32e6ec34caa49711a8c5b854ad4a0be804a96b398418f507b5a0dabcde6",
  "src/pages/marketplace/lib/studio-visual-styles.ts": "5dcca72299661a78781be61dac9a06aed94475907b8d93aed47b02ea312e403e",
  "src/pages/marketplace/lib/studio-remocn-preview.ts": "4d1fa79c330acb753bc48f1770d6d39190044ea15bb9a4704c83a1f67ab2d708",
  "src/pages/marketplace/lib/studio-remocn-preview-css.ts": "c3c75953a9d476c31f973393fa8f5dd41804568ff483100e97f8045d36f1f07a",
});

export function isVerifiedMediaSource(path, source) {
  const expected = INSTRUMENT_MEDIA_SOURCE_SHA256[path.replaceAll("\\", "/")];
  return Boolean(expected && createHash("sha256").update(source).digest("hex") === expected);
}

// Ported Remocn scenes are exported compositions too, but there are 208 of them and they are
// authored and revised independently, so pinning each one's bytes would be a lockfile nobody could
// keep current. They are recognised by path instead. A faithful port has to carry its upstream's own
// colours, shadows and gradients; what keeps that honest is scripts/lint-remocn-scenes.ts, which
// holds scene CSS to var(--p-*) colours, one shared clock, and selectors scoped to a single scene.
// The runtime mechanism beneath them is app code and stays inside every UI paint guard.
const SCENE_ROOT = "src/pages/marketplace/lib/scenes/";
const SCENE_MECHANISM = new Set(["types.ts", "shared.ts", "shared.css", "index.ts"].map((name) => `${SCENE_ROOT}${name}`));

export function isExportedComposition(path) {
  const normalized = path.replaceAll("\\", "/");
  return normalized.startsWith(SCENE_ROOT) && !SCENE_MECHANISM.has(normalized);
}

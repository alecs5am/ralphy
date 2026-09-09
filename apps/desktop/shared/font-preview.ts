const SUPPORTED_FONT_PREVIEW_MIMES = new Set([
  "font/ttf",
  "font/otf",
  "font/woff",
  "font/woff2",
  "font/sfnt",
  "application/font-sfnt",
  "application/font-woff",
  "application/x-font-ttf",
  "application/x-font-opentype",
  "application/x-font-woff",
  "application/x-font-woff2",
]);

export function isSupportedFontPreviewMime(value: string | null | undefined): boolean {
  return typeof value === "string" && SUPPORTED_FONT_PREVIEW_MIMES.has(value);
}

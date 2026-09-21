export function marketplacePublicMediaKind(value: string): "image" | "video" | "audio" | null {
  if (value.length === 0 || value.length > 2_048 || value.includes("\\")) return null;
  const rawPath = value.match(/^https:\/\/[^/?#]+([^?#]*)$/)?.[1];
  if (rawPath === undefined
    || rawPath.includes("//")
    || rawPath.split("/").some((part) => part === "." || part === "..")
    || /%(?:25)*(?:00|2e|2f|5c)/i.test(rawPath)) return null;
  try {
    const url = new URL(value);
    decodeURIComponent(url.pathname);
    if (url.origin !== "https://ralphy.b-cdn.net"
      || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== ""
      || (url.port !== "" && url.port !== "443")
      || (!url.pathname.startsWith("/blocks/") && !url.pathname.startsWith("/units/"))) return null;
    if (/\.(?:avif|gif|jpe?g|png|webp)$/i.test(url.pathname)) return "image";
    if (/\.(?:mp4|webm)$/i.test(url.pathname)) return "video";
    if (/\.(?:mp3|wav|ogg|m4a|aac|flac|opus)$/i.test(url.pathname)) return "audio";
  } catch {
    // Invalid source URLs stay inert.
  }
  return null;
}

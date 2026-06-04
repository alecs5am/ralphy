"use client";

// Blueprint hard-asset download link (#095).
//
// The hard assets live on Supabase Storage — a DIFFERENT origin. The HTML5
// `download` attribute is IGNORED for cross-origin URLs, so a plain
// `<a href download>` just NAVIGATES to the file (opening it in the same tab and
// leaving the library). The only reliable cross-origin "save the file" path is
// to fetch the bytes ourselves, wrap them in an object URL, and click a
// throwaway anchor that carries the `download` filename.
//
// Falls back to opening in a new tab if the fetch is blocked (CORS) — the
// `target="_blank" rel="noopener"` baseline keeps the library context either way.

import { useCallback, useState } from "react";

export function DownloadAssetLink({
  href,
  filename,
  className,
  children,
}: {
  href: string;
  filename: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);

  const onClick = useCallback(
    async (e: React.MouseEvent<HTMLAnchorElement>) => {
      // Let modified clicks (cmd/ctrl/middle) keep their native behavior.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      if (busy) return;
      setBusy(true);
      try {
        const res = await fetch(href);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // Revoke after the click has been handled.
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch {
        // CORS / network — fall back to opening in a new tab (context preserved).
        window.open(href, "_blank", "noopener");
      } finally {
        setBusy(false);
      }
    },
    [href, filename, busy],
  );

  return (
    <a
      className={className}
      href={href}
      download={filename}
      target="_blank"
      rel="noopener"
      onClick={onClick}
      aria-busy={busy || undefined}
    >
      {children}
    </a>
  );
}

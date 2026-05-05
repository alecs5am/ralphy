import { useState } from "react";
import { useWorkspace } from "../stores/workspace";
import { ERA, MONO, SANS, DISPLAY } from "../era/tokens";
import {
  Btn,
  Chip,
  Crosses,
  SectionHead,
  Spec,
  StatusBadge,
} from "../era/components";
import { ExternalIcon, InfoIcon } from "../era/icons";

export function RefDetail({ refId }: { refId: string }) {
  const refs = useWorkspace((s) => s.refs);
  const ref = refs.find((r) => r.id === refId) as any;
  const [showRaw, setShowRaw] = useState(false);

  if (!ref) {
    return (
      <div
        className="h-full flex items-center justify-center text-[12px]"
        style={{ color: ERA.mute }}
      >
        ref not found
      </div>
    );
  }

  const hasUrl = !!ref.url;
  const isSocial =
    ref.type === "social" || /instagram|tiktok|youtube|twitter|x\.com/i.test(ref.url || "");
  const embedUrl = toEmbedUrl(ref.url);

  return (
    <div
      className="h-full flex flex-col"
      style={{ background: ERA.bg, color: ERA.ink, ...SANS }}
    >
      <header
        className="relative px-8 pt-8 pb-6"
        style={{ borderBottom: `1px solid ${ERA.rule}` }}
      >
        <Crosses size={10} />
        <div
          className="flex items-baseline gap-3 text-[10px] uppercase tracking-[0.22em] mb-3"
          style={{ color: ERA.mute, ...MONO }}
        >
          <span>reference</span>
          <span>—</span>
          <span>{ref.id}</span>
          <span>—</span>
          <StatusBadge status={ref.status} />
        </div>
        <h1
          className="text-[36px] leading-[1.05] truncate"
          style={{ ...DISPLAY }}
          title={ref.url}
        >
          {ref.url || ref.id}
        </h1>
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <Chip size="sm">{ref.type}</Chip>
          {ref.brand && <Chip size="sm">{ref.brand}</Chip>}
          {hasUrl && (
            <Btn
              kind="bare"
              icon={<ExternalIcon size={11} />}
              href={ref.url}
            >
              open
            </Btn>
          )}
          <Btn
            kind="bare"
            icon={<InfoIcon size={11} />}
            onClick={() => setShowRaw((v) => !v)}
          >
            {showRaw ? "hide raw" : "show raw"}
          </Btn>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-12 gap-6 p-8 overflow-y-auto">
        <div className="col-span-8">
          <SectionHead section="01" title="preview" />
          {hasUrl && embedUrl ? (
            <div
              className="relative w-full"
              style={{
                aspectRatio: isSocial ? "9/16" : "16/9",
                border: `1px solid ${ERA.rule}`,
                background: ERA.panel,
              }}
            >
              <iframe
                src={embedUrl}
                title={ref.id}
                className="w-full h-full"
                style={{ border: "none" }}
                allowFullScreen
              />
            </div>
          ) : (
            <div
              className="px-6 py-8 text-center text-[12px]"
              style={{ border: `1px solid ${ERA.rule}`, color: ERA.mute }}
            >
              no preview available
            </div>
          )}

          {showRaw && (
            <div
              className="mt-4 relative"
              style={{ border: `1px solid ${ERA.rule}`, background: ERA.panel }}
            >
              <Crosses />
              <pre
                className="p-4 text-[11px] leading-[1.7] overflow-x-auto"
                style={{ ...MONO, color: ERA.ink }}
              >
                {JSON.stringify(ref, null, 2)}
              </pre>
            </div>
          )}
        </div>

        <aside className="col-span-4">
          <SectionHead section="meta" title="reference" />
          <table className="w-full" style={{ ...MONO, fontSize: 11 }}>
            <tbody>
              <Spec k="id" v={ref.id} />
              <Spec k="type" v={ref.type} />
              <Spec k="status" v={ref.status} />
              {ref.brand && <Spec k="brand" v={ref.brand} />}
              {ref.note && <Spec k="note" v={ref.note} />}
              {hasUrl && <Spec k="url" v={ref.url} />}
            </tbody>
          </table>
        </aside>
      </div>
    </div>
  );
}

function toEmbedUrl(url?: string): string | null {
  if (!url) return null;
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const v = url.match(/vimeo\.com\/(\d+)/);
  if (v) return `https://player.vimeo.com/video/${v[1]}`;
  if (/tiktok\.com|instagram\.com|twitter\.com|x\.com/.test(url)) {
    return null;
  }
  return url.startsWith("http") ? url : `https://${url}`;
}

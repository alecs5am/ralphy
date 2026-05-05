import { useEffect, useMemo, useState } from "react";
import { ERA, MONO, SANS, DISPLAY, paletteFor } from "../era/tokens";
import {
  Btn,
  Chip,
  Cross,
  Crosses,
  Empty,
  PlaceholderImg,
  SectionHead,
  Spec,
} from "../era/components";
import {
  PlusIcon,
  BatchIcon,
  DownloadIcon,
  FileJsonIcon,
} from "../era/icons";
import { Markdown } from "../components/Markdown";

export function TemplateDetail({ templateId }: { templateId: string }) {
  const [data, setData] = useState<any>(null);
  const [activeDoc, setActiveDoc] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/templates/${templateId}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, [templateId]);

  const docs: Record<string, string> = data?.docs || {};
  const docNames = useMemo(() => orderDocs(Object.keys(docs)), [docs]);

  useEffect(() => {
    if (docNames.length > 0 && !activeDoc) {
      setActiveDoc(docNames[0]);
    }
  }, [docNames, activeDoc]);

  if (!data) {
    return (
      <div
        className="h-full flex items-center justify-center text-[12px]"
        style={{ color: ERA.mute }}
      >
        loading…
      </div>
    );
  }

  const pal = paletteFor(data.id);
  const scenes: any[] = data.scenes || [];
  const tags: string[] = data.tags || [];
  const tips: string[] = data.tips || [];
  const stack = data.stack || data.stackSummary || {};

  return (
    <div
      className="h-full overflow-y-auto"
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
          <span>template</span>
          <span>—</span>
          <span>{data.id}</span>
          {data.kind && (
            <>
              <span>—</span>
              <span>{data.kind}</span>
            </>
          )}
        </div>
        <h1 className="text-[56px] leading-[0.95]" style={{ ...DISPLAY }}>
          {data.name || data.id}
        </h1>
        {data.description && (
          <p className="text-[13px] max-w-[60ch] mt-2" style={{ color: ERA.sub }}>
            {data.description}
          </p>
        )}
        <div className="mt-6 flex items-center gap-2 flex-wrap">
          <Btn kind="primary" icon={<PlusIcon size={11} />}>
            create project
          </Btn>
          <Btn icon={<BatchIcon size={11} />}>start batch</Btn>
          <Btn icon={<DownloadIcon size={11} />}>export .json</Btn>
          {tags.map((t) => (
            <Chip key={t} size="sm">
              {t}
            </Chip>
          ))}
        </div>
      </header>

      <div className="p-8 grid grid-cols-12 gap-8">
        <div className="col-span-8">
          <SectionHead
            section="01"
            title="scenes"
            right={`${scenes.length} scenes${data.durationSec ? ` · ${data.durationSec}s` : ""}`}
          />
          {scenes.length > 0 ? (
            <>
              <div className="mb-4 flex" style={{ border: `1px solid ${ERA.rule}` }}>
                {scenes.map((s: any, i: number) => {
                  const dur = s.durationSec || s.duration || 1;
                  return (
                    <div
                      key={s.id || i}
                      className="relative px-3 py-2"
                      style={{
                        flex: dur,
                        borderRight:
                          i < scenes.length - 1 ? `1px solid ${ERA.rule}` : "none",
                      }}
                    >
                      <div
                        className="text-[9px] mb-1"
                        style={{ color: ERA.mute, ...MONO }}
                      >
                        {String(i + 1).padStart(2, "0")} · {s.type || "scene"}
                      </div>
                      <div className="text-[11px] truncate">
                        {(s.label || s.title || "").toString().split("—")[0]}
                      </div>
                      <div
                        className="absolute right-2 bottom-1 text-[9px]"
                        style={{ color: ERA.mute, ...MONO }}
                      >
                        {dur}s
                      </div>
                    </div>
                  );
                })}
              </div>
              <div
                className="grid gap-px"
                style={{
                  background: ERA.rule,
                  gridTemplateColumns: `repeat(${Math.min(scenes.length, 5)}, minmax(0, 1fr))`,
                  border: `1px solid ${ERA.rule}`,
                }}
              >
                {scenes.map((s: any, i: number) => (
                  <div key={s.id || i} className="bg-white p-3 relative">
                    <Cross corner="tl" size={6} />
                    <Cross corner="tr" size={6} />
                    <Cross corner="bl" size={6} />
                    <Cross corner="br" size={6} />
                    <PlaceholderImg
                      palette={pal}
                      ratio="9/16"
                      className="w-full mb-2"
                      label={s.type || "scene"}
                    />
                    <div className="text-[11px]">
                      {s.label || s.title || "—"}
                    </div>
                    <div
                      className="text-[9px] mt-1"
                      style={{ color: ERA.mute, ...MONO }}
                    >
                      {s.durationSec || s.duration || 0}s
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <Empty>no scene structure · this is a flat template</Empty>
          )}

          {tips.length > 0 && (
            <div className="mt-10">
              <SectionHead section="02" title="tips" />
              <div style={{ border: `1px solid ${ERA.rule}` }}>
                {tips.map((tip, i) => (
                  <div
                    key={i}
                    className="px-4 py-3 flex gap-3 text-[12px]"
                    style={{ borderTop: i ? `1px solid ${ERA.ruleSoft}` : "none" }}
                  >
                    <span
                      className="text-[10px]"
                      style={{ color: ERA.mute, ...MONO }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span style={{ color: ERA.ink }}>{tip}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {docNames.length > 0 && (
            <div className="mt-10">
              <SectionHead
                section="03"
                title="docs"
                right={`${docNames.length} files`}
              />
              <div className="flex items-center gap-1 mb-3 flex-wrap">
                {docNames.map((d) => (
                  <button
                    key={d}
                    onClick={() => setActiveDoc(d)}
                    className="h-7 px-3 text-[11px] flex items-center gap-1.5"
                    style={{
                      border: `1px solid ${activeDoc === d ? ERA.ink : ERA.rule}`,
                      background: activeDoc === d ? ERA.ink : "transparent",
                      color: activeDoc === d ? "#FFF" : ERA.sub,
                      ...MONO,
                    }}
                  >
                    <FileJsonIcon size={11} />
                    {d}
                  </button>
                ))}
              </div>
              {activeDoc && (
                <div
                  className="relative p-6"
                  style={{ border: `1px solid ${ERA.rule}`, background: ERA.bg }}
                >
                  <Crosses />
                  <div className="max-w-none">
                    <Markdown content={docs[activeDoc]} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <aside className="col-span-4">
          <SectionHead section="meta" title="template specs" />
          <table className="w-full" style={{ ...MONO, fontSize: 11 }}>
            <tbody>
              <Spec k="id" v={data.id} />
              {data.kind && <Spec k="kind" v={data.kind} />}
              {data.platform && <Spec k="platform" v={data.platform} />}
              {data.aspectRatio && <Spec k="aspect" v={data.aspectRatio} />}
              <Spec
                k="duration"
                v={data.durationSec ? `${data.durationSec}s` : "—"}
              />
              {data.assets && (
                <Spec
                  k="assets"
                  v={Array.isArray(data.assets) ? data.assets.length : data.assets}
                />
              )}
            </tbody>
          </table>

          {Object.keys(stack).length > 0 && (
            <div className="mt-6">
              <SectionHead section="stack" title="model stack" />
              <table className="w-full" style={{ ...MONO, fontSize: 11 }}>
                <tbody>
                  {Object.entries(stack).map(([k, v]) => (
                    <Spec key={k} k={k} v={String(v)} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

const DOC_ORDER = [
  "TEMPLATE.md",
  "reference-example.md",
  "fragments.md",
  "model-stack.md",
  "composition.md",
];

function orderDocs(names: string[]): string[] {
  const set = new Set(names);
  const ordered = DOC_ORDER.filter((n) => set.has(n));
  for (const n of names) if (!ordered.includes(n)) ordered.push(n);
  return ordered;
}

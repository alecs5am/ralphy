import { useMemo, useState } from "react";
import { useWorkspace } from "../stores/workspace";
import { ERA, MONO, SANS, DISPLAY, paletteFor } from "../era/tokens";
import {
  Btn,
  Chip,
  Crosses,
  PlaceholderImg,
  StatusBadge,
} from "../era/components";
import {
  PlusIcon,
  WandIcon,
  ExternalIcon,
  ChevronIcon,
} from "../era/icons";

export function RefsLibrary() {
  const refs = useWorkspace((s) => s.refs) as any[];
  const openViewTab = useWorkspace((s) => s.openViewTab);
  const [filter, setFilter] = useState<string>("all");

  const types = useMemo(() => {
    const set = new Set<string>();
    refs.forEach((r) => set.add(r.type));
    return ["all", ...Array.from(set)];
  }, [refs]);

  const filtered = filter === "all" ? refs : refs.filter((r) => r.type === filter);

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
        <div className="flex items-end justify-between gap-6">
          <div>
            <div
              className="flex items-baseline gap-3 text-[10px] uppercase tracking-[0.22em] mb-3"
              style={{ color: ERA.mute, ...MONO }}
            >
              <span>references</span>
              <span>—</span>
              <span>{refs.length} items</span>
            </div>
            <h1 className="text-[64px] leading-[0.95]" style={{ ...DISPLAY }}>
              references library
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Btn icon={<PlusIcon size={11} />}>add url</Btn>
            <Btn icon={<WandIcon size={11} />}>analyze all</Btn>
          </div>
        </div>
      </header>

      <div className="p-8">
        <div className="flex items-center gap-1 mb-4 flex-wrap">
          {types.map((f, i) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="h-7 px-3 text-[11px]"
              style={{
                border: `1px solid ${filter === f ? ERA.ink : ERA.rule}`,
                background: filter === f ? ERA.ink : "transparent",
                color: filter === f ? "#FFF" : ERA.sub,
                ...MONO,
              }}
            >
              {f}
            </button>
          ))}
          <span
            className="ml-auto text-[10px]"
            style={{ color: ERA.mute, ...MONO }}
          >
            {filtered.length} of {refs.length}
          </span>
        </div>

        {filtered.length === 0 ? (
          <div
            className="px-6 py-8 text-center text-[12px]"
            style={{ border: `1px solid ${ERA.rule}`, color: ERA.mute }}
          >
            no references
          </div>
        ) : (
          <div style={{ border: `1px solid ${ERA.rule}` }}>
            <div
              className="grid grid-cols-12 px-4 py-2 text-[9px] uppercase tracking-[0.18em]"
              style={{
                color: ERA.mute,
                ...MONO,
                borderBottom: `1px solid ${ERA.rule}`,
                background: ERA.panel,
              }}
            >
              <div className="col-span-1">no.</div>
              <div className="col-span-1">type</div>
              <div className="col-span-5">source</div>
              <div className="col-span-2">brand</div>
              <div className="col-span-2">status</div>
              <div className="col-span-1 text-right">/</div>
            </div>
            {filtered.map((r, i) => {
              const pal = paletteFor(r.id, i);
              return (
                <div
                  key={r.id}
                  className="grid grid-cols-12 px-4 py-3 text-[12px] items-center"
                  style={{
                    borderBottom:
                      i < filtered.length - 1 ? `1px solid ${ERA.ruleSoft}` : "none",
                  }}
                >
                  <div
                    className="col-span-1 text-[10px]"
                    style={{ color: ERA.mute, ...MONO }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div className="col-span-1">
                    <Chip size="sm">{r.type}</Chip>
                  </div>
                  <div className="col-span-5 flex items-center gap-2">
                    <PlaceholderImg
                      palette={pal}
                      ratio="4/3"
                      className="w-12 shrink-0"
                    />
                    <span
                      className="truncate"
                      style={{ ...MONO, fontSize: 11 }}
                      title={r.url}
                    >
                      {r.url}
                    </span>
                  </div>
                  <div
                    className="col-span-2 text-[10px]"
                    style={{ color: ERA.mute, ...MONO }}
                  >
                    {r.brand || "—"}
                  </div>
                  <div className="col-span-2">
                    <StatusBadge status={r.status} dim />
                  </div>
                  <div className="col-span-1 flex justify-end gap-1.5">
                    {r.url && (
                      <a
                        href={r.url.startsWith("http") ? r.url : `https://${r.url}`}
                        target="_blank"
                        rel="noreferrer"
                        className="w-6 h-6 flex items-center justify-center hover:bg-[#F0F0F0]"
                        style={{ color: ERA.sub }}
                      >
                        <ExternalIcon size={11} />
                      </a>
                    )}
                    <button
                      onClick={() =>
                        openViewTab({
                          id: `ref:${r.id}`,
                          type: "ref",
                          label: r.url?.replace(/^https?:\/\//, "").slice(0, 30) || r.id,
                          entityId: r.id,
                        })
                      }
                      className="w-6 h-6 flex items-center justify-center hover:bg-[#F0F0F0]"
                      style={{ color: ERA.sub }}
                    >
                      <ChevronIcon size={11} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

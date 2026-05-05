import { useWorkspace } from "../stores/workspace";
import { ERA, MONO, SANS, DISPLAY, paletteFor } from "../era/tokens";
import {
  Btn,
  Chip,
  Cross,
  Crosses,
  CrossedGrid,
  NumTag,
  PlaceholderImg,
  SectionHead,
  StatusBadge,
} from "../era/components";
import {
  PlusIcon,
  WandIcon,
  BatchIcon,
  TerminalIcon,
} from "../era/icons";

function projectThumbUrl(p: any): string | null {
  if (!p) return null;
  if (p.coverThumb) return `/media/${String(p.coverThumb).replace(/^\/+/, "")}`;
  if (p.thumb) return `/media/${String(p.thumb).replace(/^\/+/, "")}`;
  return null;
}

export function WelcomeView() {
  const { projects, brands, batches, templates, personas, refs, stats, openViewTab, openTerminal } =
    useWorkspace();

  const recents = projects.slice(0, 6);
  const today = new Date();
  const dateLabel = today
    .toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" })
    .replace(/\//g, ".");
  const timeLabel = today
    .toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    .replace(":", ":");

  const greet = (() => {
    const h = today.getHours();
    if (h < 5) return "good night";
    if (h < 12) return "good morning";
    if (h < 18) return "good afternoon";
    return "good evening";
  })();

  function openNewProject() {
    if (recents[0]) {
      openViewTab({
        id: `project:${recents[0].id}`,
        type: "project",
        label: recents[0].name || recents[0].id,
        entityId: recents[0].id,
      });
    }
  }

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ background: ERA.bg, color: ERA.ink, ...SANS }}
    >
      {/* Hero band */}
      <section
        className="relative"
        style={{ borderBottom: `1px solid ${ERA.rule}` }}
      >
        <Crosses size={10} />
        <div className="px-10 py-12 grid grid-cols-12 gap-8 items-end">
          <div className="col-span-7">
            <div
              className="flex items-center gap-3 mb-6 text-[10px] uppercase tracking-[0.22em]"
              style={{ color: ERA.mute, ...MONO }}
            >
              <span>ralph</span>
              <span>—</span>
              <span>workspace</span>
              <span>—</span>
              <span>v04</span>
            </div>
            <h1 className="text-[88px] leading-[0.92]" style={{ ...DISPLAY }}>
              {greet},<br />
              <span style={{ color: ERA.sub }}>let's make</span>
            </h1>
            <div className="mt-8 flex flex-wrap gap-2">
              <Btn
                kind="primary"
                icon={<PlusIcon size={11} />}
                onClick={openNewProject}
              >
                new project
              </Btn>
              <Btn icon={<WandIcon size={11} />}>brief → scenario</Btn>
              <Btn icon={<BatchIcon size={11} />}>start a batch</Btn>
              <Btn icon={<TerminalIcon size={11} />} onClick={openTerminal}>
                terminal
              </Btn>
            </div>
          </div>

          <div className="col-span-5">
            <table className="w-full" style={{ ...MONO, fontSize: 11 }}>
              <tbody>
                <tr style={{ borderTop: `1px solid ${ERA.ink}` }}>
                  <StatCell k="projects" v={projects.length} />
                  <StatCell k="brands" v={brands.length} pl />
                </tr>
                <tr style={{ borderTop: `1px solid ${ERA.rule}` }}>
                  <StatCell k="personas" v={personas.length} />
                  <StatCell k="refs" v={refs.length} pl />
                </tr>
                <tr style={{ borderTop: `1px solid ${ERA.rule}` }}>
                  <StatCell k="batches" v={batches.length} />
                  <StatCell k="templates" v={templates.length} pl />
                </tr>
                <tr style={{ borderTop: `1px solid ${ERA.rule}` }}>
                  <StatCell k="assets" v={stats?.assetCount ?? "—"} />
                  <StatCell
                    k="storage"
                    v={stats ? `${stats.totalSizeMB} mb` : "—"}
                    pl
                  />
                </tr>
                <tr style={{ borderTop: `1px solid ${ERA.ink}` }}>
                  <td
                    colSpan={4}
                    className="py-2 text-[10px]"
                    style={{ color: ERA.mute }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <span
                          className="w-1 h-1 rounded-full"
                          style={{ background: ERA.ok, display: "inline-block" }}
                        />
                        all systems online
                      </span>
                      <span>
                        {dateLabel} / {timeLabel}
                      </span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Recent projects */}
      {recents.length > 0 && (
        <section className="px-10 py-10">
          <SectionHead
            section="01"
            title="recent projects"
            right={`${recents.length} of ${projects.length}`}
          />
          <CrossedGrid cols={3}>
            {recents.map((p, i) => {
              const pal = paletteFor(p.id, i);
              const thumb = projectThumbUrl(p);
              return (
                <button
                  key={p.id}
                  onClick={() =>
                    openViewTab({
                      id: `project:${p.id}`,
                      type: "project",
                      label: p.name || p.id,
                      entityId: p.id,
                    })
                  }
                  className="relative text-left p-5"
                  style={{
                    borderRight: i % 3 !== 2 ? `1px solid ${ERA.rule}` : "none",
                    borderBottom: i < 3 ? `1px solid ${ERA.rule}` : "none",
                    background: ERA.bg,
                  }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.background = ERA.panel)
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.background = ERA.bg)
                  }
                >
                  <Cross corner="tl" />
                  <Cross corner="tr" />
                  <Cross corner="bl" />
                  <Cross corner="br" />
                  <div className="flex items-start justify-between mb-4">
                    <NumTag index={i + 1} total={recents.length} />
                    <StatusBadge status={p.status} dim />
                  </div>
                  <div
                    className="grid grid-cols-3 gap-1 mb-4"
                    style={{ aspectRatio: "16/9" }}
                  >
                    {[0, 1, 2].map((k) => (
                      <PlaceholderImg
                        key={k}
                        palette={pal}
                        ratio="auto"
                        className="w-full h-full"
                        src={k === 0 ? thumb : null}
                      />
                    ))}
                  </div>
                  <div
                    className="text-[15px] mb-1"
                    style={{ letterSpacing: "-0.01em" }}
                  >
                    {p.name || p.id}
                  </div>
                  <div
                    className="text-[11px] mb-3 line-clamp-2"
                    style={{ color: ERA.sub }}
                  >
                    {(p as any).brief || (p as any).description || ""}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {(p as any).platform && (
                      <Chip size="sm">{(p as any).platform.toLowerCase()}</Chip>
                    )}
                    {(p as any).aspect && <Chip size="sm">{(p as any).aspect}</Chip>}
                    {(p as any).duration != null && (
                      <Chip size="sm">{(p as any).duration}s</Chip>
                    )}
                    <span
                      className="text-[10px] ml-auto"
                      style={{ color: ERA.mute, ...MONO }}
                    >
                      {p.assetCount ?? 0} assets
                    </span>
                  </div>
                </button>
              );
            })}
          </CrossedGrid>
        </section>
      )}

      {/* Templates */}
      {templates.length > 0 && (
        <section
          className="px-10 py-10"
          style={{ borderTop: `1px solid ${ERA.rule}` }}
        >
          <SectionHead
            section="02"
            title="quickstart from template"
            right={`${templates.length} templates`}
          />
          <CrossedGrid cols={4}>
            {templates.map((t: any, i: number) => (
              <button
                key={t.id}
                onClick={() =>
                  openViewTab({
                    id: `template:${t.id}`,
                    type: "template",
                    label: t.name || t.id,
                    entityId: t.id,
                  })
                }
                className="relative text-left p-5"
                style={{
                  borderRight: i % 4 !== 3 ? `1px solid ${ERA.rule}` : "none",
                  borderBottom:
                    i < templates.length - (templates.length % 4 || 4)
                      ? `1px solid ${ERA.rule}`
                      : "none",
                  background: ERA.bg,
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLElement).style.background = ERA.panel)
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLElement).style.background = ERA.bg)
                }
              >
                <Cross corner="tl" />
                <Cross corner="tr" />
                <Cross corner="bl" />
                <Cross corner="br" />
                <div className="flex items-start justify-between mb-3">
                  <NumTag index={i + 1} />
                  {t.kind && <Chip size="sm">{t.kind}</Chip>}
                </div>
                <div className="text-[14px] mb-2">{t.name || t.id}</div>
                <div
                  className="text-[11px] mb-3"
                  style={{ color: ERA.sub, minHeight: 30 }}
                >
                  {t.description || ""}
                </div>
                <div
                  className="flex items-center gap-1.5 text-[10px]"
                  style={{ color: ERA.mute, ...MONO }}
                >
                  {t.platform && <span>{t.platform}</span>}
                  {t.platform && t.aspectRatio && <span>·</span>}
                  {t.aspectRatio && <span>{t.aspectRatio}</span>}
                  {t.durationSec ? (
                    <>
                      <span>·</span>
                      <span>{t.durationSec}s</span>
                    </>
                  ) : null}
                </div>
              </button>
            ))}
          </CrossedGrid>
        </section>
      )}

      {/* In flight + brands */}
      <section
        className="px-10 py-10 grid grid-cols-12 gap-10"
        style={{ borderTop: `1px solid ${ERA.rule}` }}
      >
        <div className="col-span-7">
          <SectionHead
            section="03"
            title="in flight"
            right="batches + renders"
          />
          {batches.length > 0 ? (
            <div style={{ border: `1px solid ${ERA.rule}` }}>
              {batches.map((b: any, i: number) => {
                const sub = b.state?.projects || [];
                return (
                  <button
                    key={b.id}
                    onClick={() =>
                      openViewTab({
                        id: `batch:${b.id}`,
                        type: "batch",
                        label: b.config?.name || b.id,
                        entityId: b.id,
                      })
                    }
                    className="w-full text-left px-4 py-3 grid grid-cols-12 gap-4 items-center"
                    style={{ borderTop: i ? `1px solid ${ERA.ruleSoft}` : "none" }}
                  >
                    <div
                      className="col-span-1 text-[10px]"
                      style={{ color: ERA.mute, ...MONO }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <div className="col-span-5">
                      <div className="text-[12px]">
                        {b.config?.name || b.id}
                      </div>
                      <div
                        className="text-[10px] mt-0.5"
                        style={{ color: ERA.mute, ...MONO }}
                      >
                        {b.config?.template || "—"} · {sub.length} projects
                      </div>
                    </div>
                    <div className="col-span-4">
                      <div className="flex h-1" style={{ background: ERA.rule }}>
                        {sub.map((pr: any, j: number) => (
                          <span
                            key={j}
                            style={{
                              flex: 1,
                              marginRight: j < sub.length - 1 ? 1 : 0,
                              background:
                                pr.status === "done"
                                  ? ERA.ok
                                  : pr.status === "rendering" ||
                                    pr.status === "running"
                                  ? ERA.busy
                                  : pr.status === "queued"
                                  ? ERA.mute
                                  : ERA.rule,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="col-span-2 text-right">
                      <StatusBadge status={b.state?.status} />
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div
              className="px-4 py-6 text-[12px] text-center"
              style={{ border: `1px solid ${ERA.rule}`, color: ERA.mute }}
            >
              no batches yet
            </div>
          )}
        </div>

        <div className="col-span-5">
          <SectionHead
            section="04"
            title="brands"
            right={`${brands.length} active`}
          />
          {brands.length > 0 ? (
            <div style={{ border: `1px solid ${ERA.rule}` }}>
              {brands.slice(0, 6).map((b, i) => {
                const c: any = b.colors || {};
                const palette = [c.primary, c.secondary, c.accent].filter(
                  Boolean
                ) as string[];
                return (
                  <button
                    key={b.id}
                    onClick={() =>
                      openViewTab({
                        id: `brand:${b.id}`,
                        type: "brand",
                        label: b.name,
                        entityId: b.id,
                      })
                    }
                    className="w-full px-4 py-3 grid grid-cols-12 gap-3 items-center text-left"
                    style={{
                      borderTop: i ? `1px solid ${ERA.ruleSoft}` : "none",
                    }}
                  >
                    <div
                      className="col-span-1 text-[10px]"
                      style={{ color: ERA.mute, ...MONO }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <div className="col-span-3 flex">
                      {palette.length === 0 && (
                        <span
                          style={{
                            width: 30,
                            height: 18,
                            background: ERA.panel,
                            border: `1px solid ${ERA.rule}`,
                          }}
                        />
                      )}
                      {palette.map((cl, j) => (
                        <span
                          key={j}
                          style={{ width: 10, height: 18, background: cl }}
                        />
                      ))}
                    </div>
                    <div className="col-span-4 text-[12px]">{b.name}</div>
                    <div
                      className="col-span-4 text-right text-[10px]"
                      style={{ color: ERA.mute, ...MONO }}
                    >
                      {b.url || b.slug || ""}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div
              className="px-4 py-6 text-[12px] text-center"
              style={{ border: `1px solid ${ERA.rule}`, color: ERA.mute }}
            >
              no brands yet
            </div>
          )}
        </div>
      </section>

      <footer
        className="px-10 py-8 grid grid-cols-12 gap-6 text-[10px]"
        style={{
          borderTop: `1px solid ${ERA.ink}`,
          color: ERA.mute,
          ...MONO,
        }}
      >
        <div className="col-span-3">ralph workspace</div>
        <div className="col-span-3">build v04 · {dateLabel}</div>
        <div className="col-span-3">tip: ⌘k to search anything</div>
        <div className="col-span-3 text-right">↘ scroll for more</div>
      </footer>
    </div>
  );
}

function StatCell({
  k,
  v,
  pl,
}: {
  k: string;
  v: number | string;
  pl?: boolean;
}) {
  return (
    <>
      <td
        className={`py-2 text-[10px] uppercase tracking-[0.18em] ${pl ? "pl-6" : ""}`}
        style={{ color: ERA.mute }}
      >
        {k}
      </td>
      <td className="py-2 text-right">{v}</td>
    </>
  );
}

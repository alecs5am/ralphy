import { useMemo, useState } from "react";
import { useWorkspace, type SectionKey } from "../stores/workspace";
import { getAllGroups } from "../stores/layout";
import { ERA, MONO, SANS } from "../era/tokens";
import {
  Cross,
  StatusBadge,
} from "../era/components";
import {
  PanelIcon,
  SearchIcon,
  ProjectIcon,
  TemplateIcon,
  BrandIcon,
  PersonaIcon,
  RefIcon,
  BatchIcon,
} from "../era/icons";

const SECTIONS: { key: SectionKey; label: string; icon: any }[] = [
  { key: "projects", label: "Projects", icon: ProjectIcon },
  { key: "templates", label: "Templates", icon: TemplateIcon },
  { key: "brands", label: "Brands", icon: BrandIcon },
  { key: "personas", label: "Personas", icon: PersonaIcon },
  { key: "refs", label: "References", icon: RefIcon },
  { key: "batches", label: "Batches", icon: BatchIcon },
];

type SidebarItem = {
  id: string;
  label: string;
  sub?: string;
  status?: string;
  palette?: string[];
};

function shortenUrl(url?: string) {
  if (!url) return "";
  return url.replace(/^https?:\/\//, "").replace(/^www\./, "").slice(0, 40);
}

export function Sidebar() {
  const {
    projects,
    brands,
    personas,
    refs,
    batches,
    templates,
    stats,
    activeSection,
    setActiveSection,
    editorLayout,
    activeGroupId,
    openViewTab,
  } = useWorkspace();

  const activeTabIds = useMemo(() => {
    const ids = new Set<string>();
    for (const g of getAllGroups(editorLayout)) {
      if (g.activeTabId) ids.add(g.activeTabId);
    }
    return ids;
  }, [editorLayout, activeGroupId]);

  const [query, setQuery] = useState("");

  const counts: Record<SectionKey, number> = {
    projects: projects.length,
    brands: brands.length,
    personas: personas.length,
    refs: refs.length,
    batches: batches.length,
    templates: templates.length,
  };

  const items = useMemo<Record<SectionKey, SidebarItem[]>>(
    () => ({
      projects: projects.map((p) => ({
        id: p.id,
        label: p.name || p.id,
        status: p.status,
        sub: (p as any).platform?.toLowerCase?.() || "—",
      })),
      templates: templates.map((t: any) => ({
        id: t.id,
        label: t.name || t.id,
        sub: `${t.platform ?? "—"} · ${t.aspectRatio ?? ""}`.trim(),
      })),
      brands: brands.map((b) => {
        const c: any = b.colors || {};
        const palette = [c.primary, c.secondary, c.accent].filter(Boolean) as string[];
        return {
          id: b.id,
          label: b.name,
          sub: b.url || b.slug,
          palette: palette.length ? palette : undefined,
        };
      }),
      personas: personas.map((p) => ({
        id: p.id,
        label: p.fullName || p.name,
        sub: p.tone || (p as any).tag,
      })),
      refs: refs.map((r) => ({
        id: r.id,
        label: shortenUrl(r.url) || r.id,
        sub: r.type,
        status: r.status,
      })),
      batches: batches.map((b: any) => ({
        id: b.id,
        label: b.config?.name || b.id,
        status: b.state?.status,
        sub: `${(b.state?.projects || []).length} projects`,
      })),
    }),
    [projects, brands, personas, refs, batches, templates]
  );

  const list = items[activeSection] || [];
  const filtered = query.trim()
    ? list.filter((i) => i.label.toLowerCase().includes(query.toLowerCase()))
    : list;

  function openItem(section: SectionKey, item: SidebarItem) {
    const typeMap: Record<SectionKey, "project" | "brand" | "persona" | "ref" | "batch" | "template"> = {
      projects: "project",
      brands: "brand",
      personas: "persona",
      refs: "ref",
      batches: "batch",
      templates: "template",
    };
    const type = typeMap[section];
    openViewTab({
      id: `${type}:${item.id}`,
      type,
      label: item.label,
      entityId: item.id,
    });
  }

  const today = new Date();
  const dateLabel = today
    .toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" })
    .replace(/\//g, ".");

  return (
    <aside
      className="h-full flex flex-col relative"
      style={{
        width: 240,
        background: ERA.bg,
        color: ERA.ink,
        borderRight: `1px solid ${ERA.rule}`,
        ...SANS,
        fontSize: 12,
      }}
    >
      <Cross corner="tr" />
      <Cross corner="br" />

      {/* Brand row */}
      <div
        className="px-5 pt-5 pb-4 flex items-center justify-between"
        style={{ borderBottom: `1px solid ${ERA.rule}` }}
      >
        <div className="flex items-baseline gap-1.5">
          <div className="text-[15px] font-medium tracking-tight">ralph</div>
          <span className="text-[10px]" style={{ color: ERA.mute, ...MONO }}>®</span>
        </div>
        <div
          className="flex items-center gap-2 text-[10px]"
          style={{ color: ERA.mute, ...MONO }}
        >
          <span>v04</span>
          <button
            className="w-5 h-5 flex items-center justify-center"
            style={{ color: ERA.sub }}
          >
            <PanelIcon size={12} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div
        className="px-5 py-3"
        style={{ borderBottom: `1px solid ${ERA.rule}` }}
      >
        <div className="flex items-center gap-2 h-7">
          <SearchIcon size={11} style={{ color: ERA.mute }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search"
            className="bg-transparent outline-none flex-1 text-[12px]"
            style={{ color: ERA.ink }}
          />
          <span className="text-[10px]" style={{ color: ERA.mute, ...MONO }}>⌘k</span>
        </div>
      </div>

      {/* Section nav */}
      <nav
        className="py-2.5 shrink-0"
        style={{ borderBottom: `1px solid ${ERA.rule}` }}
      >
        <div
          className="px-5 pb-2 text-[9px] uppercase tracking-[0.18em]"
          style={{ color: ERA.mute, ...MONO }}
        >
          navigation
        </div>
        {SECTIONS.map((s, i) => {
          const Icon = s.icon;
          const active = s.key === activeSection;
          return (
            <button
              key={s.key}
              onClick={() => setActiveSection(s.key)}
              className="w-full flex items-center px-5 h-7 text-left text-[12px] gap-3 relative"
              style={{
                color: active ? ERA.ink : ERA.sub,
                background: active ? ERA.hover : "transparent",
                fontWeight: active ? 500 : 400,
              }}
            >
              <span
                className="text-[10px] w-5 shrink-0"
                style={{ color: active ? ERA.ink : ERA.mute, ...MONO }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <Icon size={11} style={{ color: active ? ERA.ink : ERA.mute }} />
              <span className="flex-1">{s.label.toLowerCase()}</span>
              <span
                className="text-[10px]"
                style={{ color: ERA.mute, ...MONO }}
              >
                {String(counts[s.key] ?? 0).padStart(2, "0")}
              </span>
              {active && (
                <span
                  className="absolute left-0 top-0 bottom-0 w-px"
                  style={{ background: ERA.ink }}
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Items */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div
          className="px-5 pt-3 pb-2 flex items-center justify-between text-[9px] uppercase tracking-[0.18em]"
          style={{ color: ERA.mute, ...MONO }}
        >
          <span>{activeSection}</span>
          <span>{String(filtered.length).padStart(2, "0")}</span>
        </div>
        {filtered.map((it, i) => {
          const tabId = `${sectionToType(activeSection)}:${it.id}`;
          const active = activeTabIds.has(tabId);
          return (
            <button
              key={it.id}
              onClick={() => openItem(activeSection, it)}
              className="w-full flex items-center gap-2.5 px-5 py-2 text-left relative"
              style={{
                background: active ? ERA.hover : "transparent",
                borderTop: i ? `1px solid ${ERA.ruleSoft}` : "none",
              }}
            >
              <span
                className="text-[10px] w-5 shrink-0"
                style={{ color: ERA.mute, ...MONO }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              {it.palette ? (
                <span className="flex shrink-0">
                  {it.palette.slice(0, 4).map((c, j) => (
                    <span
                      key={j}
                      style={{ width: 4, height: 18, background: c }}
                    />
                  ))}
                </span>
              ) : (
                <span
                  className="w-1.5 h-1.5 shrink-0"
                  style={{ background: ERA.ink }}
                />
              )}
              <div className="flex-1 min-w-0">
                <div
                  className="text-[12px] truncate"
                  style={{ color: ERA.ink }}
                >
                  {it.label.toLowerCase()}
                </div>
                <div
                  className="flex items-center gap-2 text-[10px] mt-0.5"
                  style={{ color: ERA.mute, ...MONO }}
                >
                  {it.sub && <span className="truncate">{it.sub}</span>}
                  {it.status && <StatusBadge status={it.status} dim />}
                </div>
              </div>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div
            className="px-5 py-8 text-center text-[11px]"
            style={{ color: ERA.mute }}
          >
            {query ? "no matches" : "empty"}
          </div>
        )}
      </div>

      {/* Footer stats */}
      {stats && (
        <div
          className="shrink-0"
          style={{ borderTop: `1px solid ${ERA.rule}` }}
        >
          <div
            className="px-5 py-3 grid grid-cols-2 gap-y-1 text-[10px]"
            style={MONO}
          >
            <span style={{ color: ERA.mute }}>projects</span>
            <span className="text-right">{stats.projectCount}</span>
            <span style={{ color: ERA.mute }}>assets</span>
            <span className="text-right">{stats.assetCount}</span>
            <span style={{ color: ERA.mute }}>storage</span>
            <span className="text-right">{stats.totalSizeMB} mb</span>
          </div>
          <div
            className="px-5 py-2.5 text-[10px] flex items-center justify-between"
            style={{
              borderTop: `1px solid ${ERA.rule}`,
              color: ERA.mute,
              ...MONO,
            }}
          >
            <span className="flex items-center gap-1.5">
              <span
                className="w-1 h-1 rounded-full"
                style={{ background: ERA.ok }}
              />
              online
            </span>
            <span>{dateLabel}</span>
          </div>
        </div>
      )}
    </aside>
  );
}

function sectionToType(s: SectionKey) {
  return ({
    projects: "project",
    brands: "brand",
    personas: "persona",
    refs: "ref",
    batches: "batch",
    templates: "template",
  } as const)[s];
}

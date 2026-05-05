import { useCallback, useEffect, useRef, useState } from "react";
import { useWebSocket, eventPaths } from "../hooks/useWebSocket";
import { ERA, MONO, SANS, DISPLAY, paletteFor } from "../era/tokens";
import {
  Btn,
  Chip,
  Crosses,
  PlaceholderImg,
  SectionHead,
  Spec,
  StatusBadge,
} from "../era/components";
import {
  PlayIcon,
  WandIcon,
  SparklesIcon,
  DownloadIcon,
  ExternalIcon,
  PlusIcon,
  ChecksIcon,
  GridIcon,
  ListIcon,
  ChevronIcon,
} from "../era/icons";
import { MediaPlayer } from "../components/MediaPlayer";
import { Lightbox } from "../components/Lightbox";

type SubTab = "brief" | "scenario" | "prompts" | "assets" | "manifest" | "render";
const TABS: SubTab[] = ["brief", "scenario", "prompts", "assets", "manifest", "render"];

export function ProjectDetail({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<any>(null);
  const [tab, setTab] = useState<SubTab>("brief");

  const refetch = useCallback(() => {
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then(setProject)
      .catch(() => {});
  }, [projectId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useWebSocket(
    useCallback(
      (e) => {
        const needle = `/projects/${projectId}/`;
        const hit = eventPaths(e).some((p) => p.includes(needle));
        if (!hit) return;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(refetch, 250);
      },
      [projectId, refetch]
    )
  );

  if (!project) {
    return (
      <div
        className="h-full flex items-center justify-center text-[12px]"
        style={{ color: ERA.mute }}
      >
        loading…
      </div>
    );
  }

  const meta = project.scenario?.metadata || {};
  const platform = (meta.platform || "—").toString().toLowerCase();
  const aspect = meta.aspectRatio || meta.aspect || "—";
  const duration = meta.durationSec ?? meta.duration ?? "—";
  const brief = meta.brief || meta.description || project.scenario?.description || "";
  const name = project.scenario?.metadata?.title || project.scenario?.name || project.id;
  const status = project.hasRender
    ? "done"
    : project.manifest
    ? "assets"
    : project.scenario
    ? "scenario"
    : "draft";

  const pal = paletteFor(project.id);

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ background: ERA.bg, color: ERA.ink, ...SANS }}
    >
      {/* Title block */}
      <header
        className="relative px-8 pt-8 pb-6"
        style={{ borderBottom: `1px solid ${ERA.rule}` }}
      >
        <Crosses size={10} />
        <div className="grid grid-cols-12 gap-6 items-end">
          <div className="col-span-8">
            <div
              className="flex items-center gap-3 text-[10px] uppercase tracking-[0.22em] mb-3"
              style={{ color: ERA.mute, ...MONO }}
            >
              <span>project</span>
              <span>—</span>
              <span>{project.id}</span>
              <span>—</span>
              <StatusBadge status={status} />
            </div>
            <h1 className="text-[56px] leading-[0.95] mb-3" style={{ ...DISPLAY }}>
              {name}
            </h1>
            {brief && (
              <p
                className="text-[13px] max-w-[60ch]"
                style={{ color: ERA.sub }}
              >
                {brief}
              </p>
            )}
          </div>
          <div className="col-span-4">
            <div
              className="grid grid-cols-4 gap-1 mb-3"
              style={{ aspectRatio: "16/9" }}
            >
              {[0, 1, 2, 3].map((i) => (
                <PlaceholderImg
                  key={i}
                  palette={pal}
                  ratio="auto"
                  className="w-full h-full"
                  label={i === 0 && aspect !== "—" ? aspect : null}
                />
              ))}
            </div>
            <table className="w-full" style={{ ...MONO, fontSize: 11 }}>
              <tbody>
                <Spec k="platform" v={platform} />
                <Spec k="aspect" v={aspect} />
                <Spec k="duration" v={typeof duration === "number" ? `${duration}s` : duration} />
                <Spec k="assets" v={`${project.assetFiles?.length ?? 0} files`} />
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-2 flex-wrap">
          <Btn kind="primary" icon={<PlayIcon size={10} />}>
            render
          </Btn>
          <Btn icon={<WandIcon size={11} />}>regen prompts</Btn>
          <Btn icon={<SparklesIcon size={11} />}>generate assets</Btn>
          <Btn icon={<DownloadIcon size={11} />}>export</Btn>
          <Btn kind="bare" icon={<ExternalIcon size={11} />}>
            preview
          </Btn>
        </div>
      </header>

      {/* Sub-tabs */}
      <nav
        className="flex items-stretch px-8"
        style={{ borderBottom: `1px solid ${ERA.rule}`, background: ERA.bg }}
      >
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 h-10 flex items-center gap-2 text-[12px] relative"
            style={{
              color: tab === t ? ERA.ink : ERA.sub,
              fontWeight: tab === t ? 500 : 400,
            }}
          >
            <span
              className="text-[10px]"
              style={{ color: ERA.mute, ...MONO }}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <span>{t}</span>
            {tab === t && (
              <span
                className="absolute left-0 right-0 -bottom-px h-px"
                style={{ background: ERA.ink }}
              />
            )}
          </button>
        ))}
        <div
          className="ml-auto flex items-center gap-3 text-[10px]"
          style={{ color: ERA.mute, ...MONO }}
        >
          <span>auto · live</span>
        </div>
      </nav>

      <div className="p-8">
        {tab === "brief" && <BriefTab project={project} brief={brief} />}
        {tab === "scenario" && <ScenarioTab project={project} />}
        {tab === "prompts" && <PromptsTab project={project} />}
        {tab === "assets" && <AssetsTab project={project} pal={pal} />}
        {tab === "manifest" && <ManifestTab project={project} />}
        {tab === "render" && <RenderTab project={project} pal={pal} aspect={aspect} duration={duration} />}
      </div>
    </div>
  );
}

function BriefTab({ project, brief }: { project: any; brief: string }) {
  const meta = project.scenario?.metadata || {};
  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-8">
        <SectionHead section="brief" title="creative direction" />
        <div className="text-[15px] leading-[1.6]" style={{ color: ERA.ink }}>
          {brief ? (
            <p style={{ textIndent: "2em" }}>{brief}</p>
          ) : (
            <p style={{ color: ERA.mute }}>no brief recorded for this project.</p>
          )}
        </div>
      </div>
      <div className="col-span-4">
        <SectionHead section="meta" title="constraints" />
        <table className="w-full" style={{ ...MONO, fontSize: 11 }}>
          <tbody>
            <Spec k="brand" v={meta.brand || "—"} />
            <Spec k="persona" v={meta.persona || "—"} />
            <Spec k="platform" v={(meta.platform || "—").toString().toLowerCase()} />
            <Spec k="aspect" v={meta.aspectRatio || meta.aspect || "—"} />
            <Spec
              k="duration"
              v={meta.durationSec != null ? `${meta.durationSec}s` : meta.duration ? `${meta.duration}s` : "—"}
            />
            <Spec k="status" v={project.hasRender ? "rendered" : "in progress"} />
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScenarioTab({ project }: { project: any }) {
  const scenes: any[] = project.scenario?.scenes || [];
  if (scenes.length === 0) {
    return (
      <div
        className="px-6 py-8 text-center text-[12px]"
        style={{ border: `1px solid ${ERA.rule}`, color: ERA.mute }}
      >
        no scenario yet — generate one with /ralph-scenarist
      </div>
    );
  }
  const totalDur = scenes.reduce(
    (s, x) => s + (x.durationSec || x.duration || x.dur || 0),
    0
  );
  return (
    <div>
      <SectionHead
        section="scenario"
        title="scene timeline"
        right={`${scenes.length} scenes · ${totalDur}s`}
      />

      <div className="mb-6 flex" style={{ border: `1px solid ${ERA.rule}` }}>
        {scenes.map((s: any, i: number) => {
          const dur = s.durationSec || s.duration || s.dur || 1;
          return (
            <div
              key={s.id || i}
              className="relative px-3 py-2"
              style={{
                flex: dur,
                borderRight: i < scenes.length - 1 ? `1px solid ${ERA.rule}` : "none",
              }}
            >
              <div
                className="text-[9px] mb-1"
                style={{ color: ERA.mute, ...MONO }}
              >
                {String(i + 1).padStart(2, "0")} · {s.type || "scene"}
              </div>
              <div className="text-[11px] truncate">
                {(s.label || s.title || s.description || "").toString().split("—")[0]}
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
          <div className="col-span-2">type</div>
          <div className="col-span-6">label</div>
          <div className="col-span-2 text-right">dur</div>
          <div className="col-span-1 text-right">/</div>
        </div>
        {scenes.map((s: any, i: number) => {
          const dur = s.durationSec || s.duration || s.dur || 0;
          return (
            <div
              key={s.id || i}
              className="grid grid-cols-12 px-4 py-3 text-[12px] items-center"
              style={{
                borderBottom: i < scenes.length - 1 ? `1px solid ${ERA.ruleSoft}` : "none",
              }}
            >
              <div
                className="col-span-1 text-[10px]"
                style={{ color: ERA.mute, ...MONO }}
              >
                {String(i + 1).padStart(2, "0")}
              </div>
              <div className="col-span-2">
                <Chip size="sm">{s.type || "scene"}</Chip>
              </div>
              <div className="col-span-6">
                {s.label || s.title || s.description || "—"}
              </div>
              <div
                className="col-span-2 text-right text-[11px]"
                style={{ ...MONO }}
              >
                {dur}s
              </div>
              <div className="col-span-1 flex justify-end gap-1.5">
                <button
                  className="w-6 h-6 flex items-center justify-center hover:bg-[#F0F0F0]"
                  style={{ color: ERA.sub }}
                >
                  <WandIcon size={11} />
                </button>
                <button
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
    </div>
  );
}

function PromptsTab({ project }: { project: any }) {
  const prompts: any[] = Array.isArray(project.prompts)
    ? project.prompts
    : project.prompts?.prompts || project.prompts?.scenes || [];

  if (prompts.length === 0) {
    return (
      <div
        className="px-6 py-8 text-center text-[12px]"
        style={{ border: `1px solid ${ERA.rule}`, color: ERA.mute }}
      >
        no prompts yet — generate them with /ralph-art-director
      </div>
    );
  }

  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-8">
        <SectionHead
          section="prompts"
          title="generation prompts"
          right={`${prompts.length} prompts`}
        />
        <div className="space-y-3">
          {prompts.map((p: any, i: number) => {
            const text =
              p.prompt || p.text || p.imagePrompt || p.videoPrompt || p.description || "";
            const kind = p.kind || p.type || (p.videoPrompt ? "vid" : p.imagePrompt ? "img" : "—");
            const model = p.model || p.endpoint || "—";
            return (
              <div
                key={p.id || i}
                className="relative p-4"
                style={{ border: `1px solid ${ERA.rule}` }}
              >
                <Crosses />
                <div className="flex items-start justify-between mb-3 gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="text-[10px]"
                      style={{ color: ERA.mute, ...MONO }}
                    >
                      {String(i + 1).padStart(2, "0")}
                      {p.scene ? ` / ${p.scene}` : ""}
                    </span>
                    <Chip size="sm">{kind}</Chip>
                    <span
                      className="text-[10px]"
                      style={{ color: ERA.sub, ...MONO }}
                    >
                      {model}
                    </span>
                  </div>
                  {p.status && <StatusBadge status={p.status} dim />}
                </div>
                <div
                  className="text-[13px] leading-[1.55]"
                  style={{ color: ERA.ink, ...SANS }}
                >
                  "{text || "—"}"
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <aside className="col-span-4">
        <SectionHead section="stack" title="model stack" />
        <table className="w-full" style={{ ...MONO, fontSize: 11 }}>
          <tbody>
            {Object.entries(project.prompts?.stack || {}).map(([k, v]) => (
              <Spec key={k} k={k} v={String(v)} />
            ))}
            {Object.keys(project.prompts?.stack || {}).length === 0 && (
              <Spec k="status" v="—" />
            )}
          </tbody>
        </table>
      </aside>
    </div>
  );
}

function AssetsTab({ project, pal }: { project: any; pal: string[] }) {
  const allAssets: string[] = project.assetFiles || [];
  const [filter, setFilter] = useState<string>("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [lightbox, setLightbox] = useState<number | null>(null);

  const classify = (p: string) => {
    const lower = p.toLowerCase();
    if (/\.(png|jpg|jpeg|webp|gif)$/.test(lower)) return "image";
    if (/\.(mp4|mov|webm)$/.test(lower)) return "video";
    if (/\.(wav|mp3|m4a|ogg)$/.test(lower)) return "audio";
    return "other";
  };

  const filtered = filter === "all" ? allAssets : allAssets.filter((p) => classify(p) === filter);
  const counts = {
    all: allAssets.length,
    image: allAssets.filter((p) => classify(p) === "image").length,
    video: allAssets.filter((p) => classify(p) === "video").length,
    audio: allAssets.filter((p) => classify(p) === "audio").length,
  };
  const filters: { key: string; n: number }[] = [
    { key: "all", n: counts.all },
    { key: "image", n: counts.image },
    { key: "video", n: counts.video },
    { key: "audio", n: counts.audio },
  ];

  const imageList = filtered
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => classify(p) === "image");

  return (
    <div>
      <SectionHead
        section="assets"
        title="generated + uploaded"
        right={`${allAssets.length} files`}
      />

      <div className="flex items-center gap-1 mb-4">
        {filters.map(({ key, n }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className="h-8 px-3 text-[11px] flex items-center gap-2"
            style={{
              border: `1px solid ${filter === key ? ERA.ink : ERA.rule}`,
              background: filter === key ? ERA.ink : "transparent",
              color: filter === key ? "#FFF" : ERA.sub,
              ...MONO,
            }}
          >
            {key}
            <span className="text-[9px] opacity-70">{n}</span>
          </button>
        ))}
        <div
          className="ml-auto flex items-center gap-2 text-[10px]"
          style={{ color: ERA.mute, ...MONO }}
        >
          <button
            onClick={() => setView("grid")}
            className="px-2 h-7 flex items-center gap-1.5"
            style={{
              border: `1px solid ${view === "grid" ? ERA.ink : ERA.rule}`,
              background: view === "grid" ? ERA.hover : "transparent",
            }}
          >
            <GridIcon size={11} />
            grid
          </button>
          <button
            onClick={() => setView("list")}
            className="px-2 h-7 flex items-center gap-1.5"
            style={{
              border: `1px solid ${view === "list" ? ERA.ink : ERA.rule}`,
              background: view === "list" ? ERA.hover : "transparent",
            }}
          >
            <ListIcon size={11} />
            list
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div
          className="px-6 py-8 text-center text-[12px]"
          style={{ border: `1px solid ${ERA.rule}`, color: ERA.mute }}
        >
          no assets in this filter
        </div>
      ) : view === "grid" ? (
        <div
          className="grid gap-px"
          style={{
            background: ERA.rule,
            gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
            border: `1px solid ${ERA.rule}`,
          }}
        >
          {filtered.map((p, i) => {
            const kind = classify(p);
            const url = `/media/${p}`;
            const name = p.split("/").pop() || p;
            return (
              <div key={p} className="relative bg-white p-2">
                <div className="relative">
                  {kind === "image" ? (
                    <button
                      onClick={() =>
                        setLightbox(imageList.findIndex((x) => x.p === p))
                      }
                      className="block w-full"
                    >
                      <PlaceholderImg
                        palette={pal}
                        ratio="1/1"
                        className="w-full"
                        src={url}
                      />
                    </button>
                  ) : kind === "video" ? (
                    <div
                      style={{
                        aspectRatio: "1/1",
                        background: ERA.panel,
                        position: "relative",
                      }}
                    >
                      <MediaPlayer src={p} type="video" />
                    </div>
                  ) : kind === "audio" ? (
                    <div
                      className="flex flex-col"
                      style={{
                        aspectRatio: "1/1",
                        background: ERA.panel,
                        padding: 8,
                        gap: 8,
                      }}
                    >
                      <div
                        className="flex-1 flex items-end gap-px"
                        style={{ minHeight: 0 }}
                      >
                        {Array.from({ length: 28 }).map((_, k) => (
                          <span
                            key={k}
                            style={{
                              flex: 1,
                              height: `${25 + Math.abs(Math.sin(k * 0.6 + i)) * 70}%`,
                              background: ERA.ink,
                            }}
                          />
                        ))}
                      </div>
                      <audio
                        src={url}
                        controls
                        preload="metadata"
                        style={{ width: "100%", height: 28 }}
                      />
                    </div>
                  ) : (
                    <PlaceholderImg palette={pal} ratio="1/1" className="w-full" />
                  )}
                  <div
                    className="absolute top-1 left-1 px-1 py-0.5 text-[9px]"
                    style={{ background: ERA.ink, color: "#FFF", ...MONO }}
                  >
                    {kind[0]}
                  </div>
                </div>
                <div
                  className="mt-2 flex items-baseline justify-between text-[10px]"
                  style={{ ...MONO }}
                >
                  <span
                    className="truncate"
                    style={{ color: ERA.sub }}
                    title={name}
                  >
                    {name}
                  </span>
                  <span style={{ color: ERA.mute }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ border: `1px solid ${ERA.rule}` }}>
          {filtered.map((p, i) => (
            <div
              key={p}
              className="grid grid-cols-12 px-4 py-2 text-[12px] items-center"
              style={{ borderTop: i ? `1px solid ${ERA.ruleSoft}` : "none" }}
            >
              <div
                className="col-span-1 text-[10px]"
                style={{ color: ERA.mute, ...MONO }}
              >
                {String(i + 1).padStart(2, "0")}
              </div>
              <div className="col-span-1">
                <Chip size="sm">{classify(p)}</Chip>
              </div>
              <div
                className="col-span-9 truncate text-[11px]"
                style={{ color: ERA.sub, ...MONO }}
              >
                {p}
              </div>
              <div className="col-span-1 text-right">
                <a
                  href={`/media/${p}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex w-6 h-6 items-center justify-center"
                  style={{ color: ERA.sub }}
                >
                  <ExternalIcon size={11} />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {lightbox !== null && imageList[lightbox] && (
        <Lightbox
          src={imageList[lightbox].p}
          onClose={() => setLightbox(null)}
          onPrev={
            lightbox > 0 ? () => setLightbox(lightbox - 1) : undefined
          }
          onNext={
            lightbox < imageList.length - 1
              ? () => setLightbox(lightbox + 1)
              : undefined
          }
        />
      )}

      <div className="mt-4 flex items-center gap-2">
        <Btn kind="primary" icon={<SparklesIcon size={11} />}>
          generate next batch
        </Btn>
        <Btn icon={<PlusIcon size={11} />}>upload</Btn>
      </div>
    </div>
  );
}

function ManifestTab({ project }: { project: any }) {
  const manifest = project.manifest;
  const json = manifest ? JSON.stringify(manifest, null, 2) : null;

  const checks: [string, "ok" | "warn" | "err"][] = [
    ["scenario complete", project.scenario ? "ok" : "warn"],
    ["all prompts present", project.prompts ? "ok" : "warn"],
    ["all assets generated", manifest ? "ok" : "warn"],
    ["composition props", project.compositionProps ? "ok" : "warn"],
    ["render output", project.hasRender ? "ok" : "warn"],
  ];

  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-8">
        <SectionHead
          section="manifest"
          title="render manifest"
          right="asset-manifest.json"
        />
        {json ? (
          <div
            className="relative"
            style={{ border: `1px solid ${ERA.rule}`, background: ERA.panel }}
          >
            <Crosses />
            <div
              className="flex items-center justify-between px-3 py-2 text-[10px]"
              style={{
                borderBottom: `1px solid ${ERA.rule}`,
                color: ERA.mute,
                ...MONO,
              }}
            >
              <span>asset-manifest.json</span>
              <span>
                {(json.length / 1024).toFixed(1)}kb · valid
              </span>
            </div>
            <pre
              className="p-4 text-[11px] leading-[1.7] overflow-x-auto max-h-[60vh]"
              style={{ ...MONO, color: ERA.ink }}
            >
              {json}
            </pre>
          </div>
        ) : (
          <div
            className="px-6 py-8 text-center text-[12px]"
            style={{ border: `1px solid ${ERA.rule}`, color: ERA.mute }}
          >
            no manifest yet
          </div>
        )}
        <div className="mt-3 flex items-center gap-2">
          <Btn icon={<DownloadIcon size={11} />}>download .json</Btn>
          <Btn icon={<ChecksIcon size={11} />}>validate</Btn>
        </div>
      </div>

      <aside className="col-span-4">
        <SectionHead section="checks" title="preflight" />
        <div style={{ border: `1px solid ${ERA.rule}` }}>
          {checks.map(([k, st], i) => (
            <div
              key={k}
              className="flex items-center justify-between px-3 py-2 text-[11px]"
              style={{ borderTop: i ? `1px solid ${ERA.ruleSoft}` : "none" }}
            >
              <span style={{ color: ERA.ink }}>{k}</span>
              <span
                className="flex items-center gap-1.5 text-[10px]"
                style={{ ...MONO }}
              >
                <span
                  className="w-1.5 h-1.5"
                  style={{
                    background:
                      st === "ok" ? ERA.ok : st === "warn" ? ERA.warn : ERA.err,
                  }}
                />
                <span style={{ color: ERA.sub }}>{st}</span>
              </span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

function RenderTab({
  project,
  pal,
  aspect,
  duration,
}: {
  project: any;
  pal: string[];
  aspect: string;
  duration: number | string;
}) {
  const renderPath = project.hasRender
    ? `workspace/projects/${project.id}/render/final.mp4`
    : null;
  const ratio =
    typeof aspect === "string" && aspect.includes(":") ? aspect.replace(":", "/") : "16/9";

  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-8">
        <SectionHead
          section="render"
          title="output"
          right={project.hasRender ? "ready" : "not rendered"}
        />
        <div className="relative" style={{ border: `1px solid ${ERA.rule}` }}>
          <Crosses size={10} />
          <div className="relative" style={{ aspectRatio: ratio }}>
            {renderPath ? (
              <MediaPlayer src={renderPath} type="video" />
            ) : (
              <PlaceholderImg
                palette={pal}
                ratio={ratio}
                className="w-full h-full"
                textTone="light"
              />
            )}
            {!renderPath && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div
                  className="px-3 py-1 text-[10px]"
                  style={{
                    background: "rgba(255,255,255,0.92)",
                    color: ERA.ink,
                    ...MONO,
                  }}
                >
                  no render yet
                </div>
              </div>
            )}
            {aspect !== "—" && (
              <div
                className="absolute top-3 left-3 px-2 py-1 text-[10px]"
                style={{ background: ERA.ink, color: "#FFF", ...MONO }}
              >
                {aspect}
                {typeof duration === "number" ? ` · ${duration}s` : ""}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Btn kind="primary" icon={<PlayIcon size={10} />}>
            {project.hasRender ? "re-render" : "start render"}
          </Btn>
          {renderPath && (
            <Btn href={`/media/${renderPath}`} icon={<DownloadIcon size={11} />}>
              download mp4
            </Btn>
          )}
        </div>
      </div>

      <aside className="col-span-4">
        <SectionHead section="specs" title="output" />
        <table className="w-full" style={{ ...MONO, fontSize: 11 }}>
          <tbody>
            <Spec k="status" v={project.hasRender ? "rendered" : "queued"} />
            <Spec k="aspect" v={aspect} />
            <Spec
              k="duration"
              v={typeof duration === "number" ? `${duration}s` : duration}
            />
            <Spec k="path" v={project.renderPath || "—"} />
          </tbody>
        </table>
      </aside>
    </div>
  );
}

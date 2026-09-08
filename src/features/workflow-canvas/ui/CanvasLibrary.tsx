import { ArrowUpRight, Clapperboard, GitCompareArrows, Image, Plus, RefreshCw, Workflow } from "@/shared/ui/icons";
import type { SavedCanvas, WorkflowCanvas } from "../../../../shared/workflow-canvas";
import { canvasNodeWidth } from "../model/node-layout";
import { canvasNodeHeight, type CanvasTemplate } from "../model/canvas-editor";
import { PageHeader, PAGE_HEADER_BUTTON, PAGE_HEADER_PRIMARY } from "@/shared/ui/PageHeader";
import { WINDOW, WINDOW_PLATE, WINDOW_TITLEBAR } from "@/shared/ui/Window";

const STARTERS = [
  { id: "blank", icon: Plus, title: "Blank canvas", description: "A clear space for your own process.", steps: "Start anywhere" },
  { id: "idea", icon: Workflow, title: "Idea to image", description: "A language model writes your image prompt.", steps: "Idea → LLM → Image → Review" },
  { id: "image", icon: Image, title: "Image concept", description: "Turn a direction into something you can see.", steps: "Prompt → Image → Review" },
  { id: "video", icon: Clapperboard, title: "Video pipeline", description: "Bring a reference to life, one step at a time.", steps: "Reference → Motion → Output" },
  { id: "comparison", icon: GitCompareArrows, title: "Compare directions", description: "Explore alternatives. Keep the strongest.", steps: "One idea → Multiple directions" },
] satisfies { id: CanvasTemplate; icon: typeof Plus; title: string; description: string; steps: string }[];

function StarterArtwork({ template }: { template: CanvasTemplate }) {
  const positions = template === "comparison" ? [[40, 68], [142, 30], [142, 105], [244, 68]] : [[40, 68], [142, 68], [244, 68]];
  return <svg className="h-16 w-full text-canvas-library-accent" viewBox="0 0 320 160" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
    {template === "blank" ? <><rect x="118" y="42" width="84" height="76" rx="12" strokeDasharray="4 5" /><path d="M145 80h30m-15-15v30" /></> : <>
      {template === "comparison" ? <path d="M82 80C112 80 112 42 142 42M82 80C112 80 112 117 142 117M184 42C214 42 214 80 244 80M184 117C214 117 214 80 244 80" opacity=".4" /> : <path d="M82 80h60m42 0h60" opacity=".4" />}
      {positions.map(([x, y], index) => <g key={index}><rect x={x} y={y} width="42" height="30" rx="6" fill="currentColor" fillOpacity=".08" /><path d={`M${x + 9} ${y + 11}h24m-24 7h14`} opacity=".6" /></g>)}
      {template === "video" && <path d="m155 77 9 6-9 6z" fill="currentColor" />}
    </>}
  </svg>;
}

/** Every miniature reflects the stored graph's positions and edges, including an empty graph. */
export function CanvasGraphPreview({ canvas }: { canvas: WorkflowCanvas }) {
  if (!canvas.nodes.length) return <div className="flex h-24 items-center justify-center text-muted"><Plus size={28} strokeWidth={1.2} aria-hidden="true" /></div>;
  const minX = Math.min(...canvas.nodes.map((node) => node.x));
  const minY = Math.min(...canvas.nodes.map((node) => node.y));
  const width = Math.max(...canvas.nodes.map((node) => node.x + canvasNodeWidth(node))) - minX;
  const height = Math.max(...canvas.nodes.map((node) => node.y + canvasNodeHeight(node))) - minY;
  const nodes = new Map(canvas.nodes.map((node) => [node.id, node]));
  return <svg className="h-24 w-full text-muted" viewBox={`${minX - 90} ${minY - 90} ${width + 180} ${height + 180}`} role="img" aria-label={`${canvas.name}: ${canvas.nodes.length} ${canvas.nodes.length === 1 ? "node" : "nodes"} and ${canvas.edges.length} ${canvas.edges.length === 1 ? "connection" : "connections"}`}>
    {canvas.edges.map((edge, index) => {
      const from = nodes.get(edge.from), to = nodes.get(edge.to);
      if (!from || !to) return null;
      const x = from.x + canvasNodeWidth(from), y = from.y + canvasNodeHeight(from) / 2, endY = to.y + canvasNodeHeight(to) / 2;
      return <path key={index} d={`M${x} ${y}C${x + 60} ${y} ${to.x - 60} ${endY} ${to.x} ${endY}`} fill="none" stroke="currentColor" strokeWidth="7" opacity=".35" />;
    })}
    {canvas.nodes.map((node) => <g className="canvas-graph-node" data-node-kind={node.kind} key={node.id}><rect x={node.x} y={node.y} width={canvasNodeWidth(node)} height={canvasNodeHeight(node)} rx="20" fill="currentColor" fillOpacity=".09" stroke="currentColor" strokeWidth="4" strokeOpacity=".55" /><rect x={node.x + 20} y={node.y + 24} width="24" height="24" rx="6" fill="currentColor" opacity=".8" /><text x={node.x + 60} y={node.y + 46} fill="currentColor" fontSize="20" className="font-app">{node.title.length > 15 ? `${node.title.slice(0, 14)}…` : node.title}</text></g>)}
  </svg>;
}

export function CanvasLibrary({ workspaceName, items, onCreate, onSelect, onReload, loading = false }: {
  workspaceName: string;
  items: SavedCanvas[];
  onCreate(template: CanvasTemplate): void;
  onSelect(canvas: SavedCanvas): void;
  onReload(): void;
  loading?: boolean;
}) {
  return <main className="canvas-library @container/canvas-library flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto p-2 text-ink" aria-label="Canvas library">
    <PageHeader title="Canvases" icon={Workflow} meta={`${items.length} · ${workspaceName}`} description="Connect ideas, models and results.">
      <button className={PAGE_HEADER_BUTTON} aria-label="Reload canvases" title="Reload canvases" disabled={loading} onClick={onReload} type="button"><RefreshCw size={14} className={loading ? "animate-spin motion-reduce:animate-none" : ""} /></button>
      <button className={PAGE_HEADER_PRIMARY} aria-label="New canvas" title="New canvas" disabled={loading} onClick={() => onCreate("blank")} type="button"><Plus size={14} /><span className="page-header-action-label">New canvas</span></button>
    </PageHeader>
    <section aria-labelledby="canvas-starters-title"><div className="mb-3 flex items-center justify-between gap-3"><h2 className="m-0 type-base font-medium" id="canvas-starters-title">New canvas</h2><span className="type-xs text-muted">Templates</span></div><div className="grid grid-cols-1 gap-3 @min-canvas-wide/canvas-library:grid-cols-5">{STARTERS.map(({ id, icon: Icon, title, steps }) => <button className={`${WINDOW} canvas-starter text-left text-ink hover:bg-chip focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink`} data-template={id} type="button" key={id} disabled={loading} onClick={() => onCreate(id)}><span className={`${WINDOW_PLATE} w-full bg-canvas-library-tint`}><StarterArtwork template={id} /></span><span className="flex flex-1 flex-col gap-1.5 p-2.5"><span className="flex items-center gap-2"><Icon size={15} className="shrink-0 text-canvas-library-accent" /><strong className="type-sm font-medium">{title}</strong></span><small className="mt-auto pt-1 font-code type-mono-xs text-muted">{steps}</small></span></button>)}</div></section>
    <section aria-labelledby="canvas-saved-title"><div className="mb-3 flex items-center justify-between gap-3"><h2 className="m-0 type-base font-medium" id="canvas-saved-title">Your canvases <span className="ml-2 type-xs font-normal text-muted">{items.length}</span></h2><span className="font-code type-mono-xs text-muted">Saved in this workspace</span></div>
      {loading ? <div className="grid grid-cols-2 gap-3" role="status" aria-label="Loading canvases">{[0, 1].map((index) => <div className="h-48 animate-pulse rounded-inner bg-field motion-reduce:animate-none" key={index} />)}</div>
        : items.length ? <div className="grid grid-cols-1 gap-3 @min-canvas-wide/canvas-library:grid-cols-2 @min-canvas-library-wide/canvas-library:grid-cols-3">{items.map((item) => <button className={`${WINDOW} text-left hover:bg-chip focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink`} type="button" key={item.canvas.id} onClick={() => onSelect(item)}><span className={`${WINDOW_PLATE} w-full p-2`}><CanvasGraphPreview canvas={item.canvas} /></span><span className={`${WINDOW_TITLEBAR} w-full`}><Workflow size={16} className="shrink-0 text-muted" /><span className="flex min-w-0 flex-1 flex-col gap-1"><strong className="truncate type-sm font-medium text-ink">{item.canvas.name}</strong><small className="type-xs text-muted">{item.canvas.nodes.length} nodes · {item.canvas.edges.length} connections</small></span><ArrowUpRight size={14} className="shrink-0 text-muted" /></span></button>)}</div>
          : <div className="flex min-h-24 items-center gap-4 rounded-inner border border-dashed border-divider p-5"><span className="grid size-12 shrink-0 place-items-center rounded-inner bg-field text-muted"><Workflow size={22} strokeWidth={1.3} /></span><span className="flex flex-col gap-2"><strong className="type-sm font-normal">Your next project starts above.</strong><p className="m-0 type-xs leading-relaxed text-muted">Choose a starting point. Your saved canvases will live here.</p></span></div>}
    </section>
  </main>;
}

import { useWorkspace } from "../stores/workspace";
import { ERA, MONO, SANS, DISPLAY, paletteFor } from "../era/tokens";
import {
  Btn,
  Crosses,
  PlaceholderImg,
  SectionHead,
  Spec,
  StatusBadge,
} from "../era/components";
import { PlayIcon, PlusIcon, DownloadIcon } from "../era/icons";

const STEPS = ["scenario", "prompts", "assets", "render"] as const;
const STEP_INDEX: Record<string, number> = {
  scenario: 1,
  prompts: 2,
  assets: 3,
  render: 4,
};

export function BatchDetail({ batchId }: { batchId: string }) {
  const batches = useWorkspace((s) => s.batches) as any[];
  const batch = batches.find((b) => b.id === batchId);

  if (!batch) {
    return (
      <div
        className="h-full flex items-center justify-center text-[12px]"
        style={{ color: ERA.mute }}
      >
        batch not found
      </div>
    );
  }

  const config = batch.config || {};
  const state = batch.state || {};
  const projects: any[] = state.projects || [];

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
          <span>batch</span>
          <span>—</span>
          <span>{batch.id}</span>
          {state.status && (
            <>
              <span>—</span>
              <StatusBadge status={state.status} />
            </>
          )}
        </div>
        <h1 className="text-[56px] leading-[0.95]" style={{ ...DISPLAY }}>
          {config.name || batch.id}
        </h1>
        {config.template && (
          <div className="text-[13px] mt-2" style={{ color: ERA.sub }}>
            template <strong>{config.template}</strong> · {projects.length} variants
          </div>
        )}
        <div className="mt-6 flex items-center gap-2">
          <Btn kind="primary" icon={<PlayIcon size={10} />}>
            run all
          </Btn>
          <Btn icon={<PlusIcon size={11} />}>add variant</Btn>
          <Btn icon={<DownloadIcon size={11} />}>export results</Btn>
        </div>
      </header>

      <div className="p-8 grid grid-cols-12 gap-8">
        <div className="col-span-9">
          <SectionHead section="01" title="variants" />
          {projects.length === 0 ? (
            <div
              className="px-6 py-8 text-center text-[12px]"
              style={{ border: `1px solid ${ERA.rule}`, color: ERA.mute }}
            >
              no variants yet
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
                <div className="col-span-3">name</div>
                <div className="col-span-5">progress</div>
                <div className="col-span-2">step</div>
                <div className="col-span-1 text-right">status</div>
              </div>
              {projects.map((pr: any, i: number) => {
                const pal = paletteFor(pr.id || pr.name || i, i);
                const sIdx = STEP_INDEX[pr.step] ?? 0;
                return (
                  <div
                    key={pr.id || i}
                    className="grid grid-cols-12 px-4 py-4 items-center text-[12px]"
                    style={{
                      borderBottom:
                        i < projects.length - 1 ? `1px solid ${ERA.ruleSoft}` : "none",
                    }}
                  >
                    <div
                      className="col-span-1 text-[10px]"
                      style={{ color: ERA.mute, ...MONO }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <div className="col-span-3 flex items-center gap-2">
                      <PlaceholderImg
                        palette={pal}
                        ratio="1/1"
                        className="w-8 shrink-0"
                      />
                      <span>{pr.name || pr.id}</span>
                    </div>
                    <div className="col-span-5">
                      <div className="flex items-center gap-1">
                        {STEPS.map((s, k) => (
                          <div key={s} className="flex-1 relative">
                            <div
                              className="h-1"
                              style={{
                                background:
                                  k < sIdx
                                    ? ERA.ink
                                    : k === sIdx - 1
                                    ? ERA.busy
                                    : ERA.rule,
                              }}
                            />
                            <div
                              className="text-[9px] mt-1"
                              style={{
                                color: k <= sIdx - 1 ? ERA.ink : ERA.mute,
                                ...MONO,
                              }}
                            >
                              {String(k + 1).padStart(2, "0")} {s}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div
                      className="col-span-2 text-[11px]"
                      style={{ ...MONO, color: ERA.sub }}
                    >
                      {pr.step || "—"}
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <StatusBadge status={pr.status} dim />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <aside className="col-span-3">
          <SectionHead section="meta" title="batch" />
          <table className="w-full" style={{ ...MONO, fontSize: 11 }}>
            <tbody>
              <Spec k="id" v={batch.id} />
              {config.template && <Spec k="template" v={config.template} />}
              <Spec k="variants" v={projects.length} />
              {state.status && <Spec k="status" v={state.status} />}
              {state.startedAt && <Spec k="started" v={state.startedAt} />}
              {state.eta && <Spec k="eta" v={state.eta} />}
            </tbody>
          </table>
        </aside>
      </div>
    </div>
  );
}

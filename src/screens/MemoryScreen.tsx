import * as Dialog from "@radix-ui/react-dialog";
import {
  Activity, Archive, ArrowDownUp, ArrowLeft, Box, Building2, Check, ChevronRight,
  CircleSlash, Cpu, Eye, FileClock, Globe2, History, Inbox, Layers3, Palette, PencilLine,
  PenTool, Plus, Search, TriangleAlert, UserRound, Wrench, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { MemoryDetailDto, MemoryTier, MemoryType } from "../../electron/ralphy/types";
import type { MemoryMutation } from "../../electron/ralphy/memory-reader";
import { bridge } from "../lib/ipc";
import { SelectMenu } from "../components/ui/SelectMenu";
import { defineInstrumentScreenStates, InstrumentScreenRoot } from "../instrument/screen-state-registry";

export const memoryInstrumentStates = defineInstrumentScreenStates({
  routeKey: "workspace.memory",
  states: ["loading", "ready", "empty", "unavailable", "selected"],
  rootMarker: "workspace-memory",
  landmarks: ["Memory", "Durable context agents reuse across future work"],
} as const);

const TYPES: MemoryType[] = ["style", "craft", "client", "model", "tooling", "user", "legacy"];
const FILTER_TYPES = TYPES.filter((type): type is Exclude<MemoryType, "legacy"> => type !== "legacy");
const TYPE_LABEL: Record<MemoryType, string> = {
  model: "Model", craft: "Craft", tooling: "Tooling", client: "Client",
  style: "Style", user: "User", legacy: "Legacy",
};
const TYPE_ICON = {
  style: Palette, craft: PenTool, client: Building2, model: Cpu,
  tooling: Wrench, user: UserRound, legacy: Layers3,
} satisfies Record<MemoryType, typeof Palette>;
const SORTS = ["revised", "filed", "name"] as const;
const SORT_LABEL = { revised: "RECENTLY REVISED", filed: "RECENTLY FILED", name: "NAME" } as const;

type Scope = "effective" | MemoryTier;
type EditorState = { entry?: MemoryDetailDto } | null;
type ConfirmState = { action: "approve" | "reject" | "retire"; entry: MemoryDetailDto } | null;

export function MemoryScreen({ workspaceId, workspaceName }: { workspaceId: string; workspaceName: string }) {
  const [active, setActive] = useState<MemoryDetailDto[]>([]);
  const [proposed, setProposed] = useState<MemoryDetailDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("effective");
  const [type, setType] = useState<MemoryType | null>(null);
  const [order, setOrder] = useState<(typeof SORTS)[number]>("revised");
  const [reviewing, setReviewing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [recallOpen, setRecallOpen] = useState(false);
  const [recall, setRecall] = useState<Awaited<ReturnType<typeof bridge.recallMemory>> | null>(null);
  const [editor, setEditor] = useState<EditorState>(null);
  const [history, setHistory] = useState<MemoryDetailDto[] | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const initialExpansionSet = useRef(false);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    void Promise.all([
      bridge.loadMemory(workspaceId, { scope, status: "active", order: "slug" }),
      bridge.loadMemory(workspaceId, { scope, status: "proposed", order: "slug" }),
    ]).then(([nextActive, nextProposed]) => {
      if (!current) return;
      setActive(nextActive.items);
      setProposed(nextProposed.items);
    }).catch((cause: unknown) => {
      if (current) setError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [refresh, scope, workspaceId]);

  const visibleActive = useMemo(() => filterMemory(active, query, type, order), [active, order, query, type]);
  const visibleProposed = useMemo(() => filterMemory(proposed, query, type, order), [order, proposed, query, type]);
  const items = reviewing ? visibleProposed : visibleActive;
  const selectedVisible = expanded !== null && items.some((entry) => entry.id === expanded);
  const groups = useMemo(() => {
    const order = reviewing ? ["workspace", "global"] : TYPES;
    return order.map((group) => [group, items.filter((entry) => (reviewing ? entry.tier : entry.type) === group)] as const)
      .filter(([, entries]) => entries.length > 0);
  }, [items, reviewing]);
  const chipSource = reviewing ? proposed : active;
  const dirty = query.trim() !== "" || scope !== "effective" || type !== null;
  const workspaceCount = active.filter((entry) => entry.tier === "workspace").length;
  const firstActiveDisplayed = TYPES.map((value) => visibleActive.find((entry) => entry.type === value)).find(Boolean);

  useEffect(() => {
    const firstDisplayed = groups[0]?.[1][0];
    if (!loading && !reviewing && !initialExpansionSet.current && firstDisplayed) {
      initialExpansionSet.current = true;
      setExpanded(firstDisplayed.id);
    }
  }, [groups, loading, reviewing]);

  useEffect(() => {
    if (expanded !== null && !selectedVisible) setExpanded(null);
  }, [expanded, selectedVisible]);

  const reload = useCallback((message: string) => {
    setNotice(message);
    setRefresh((value) => value + 1);
  }, []);

  const openRecall = () => {
    setRecallOpen(true);
    setRecall(null);
    void bridge.recallMemory(workspaceId).then(setRecall).catch((cause: unknown) => {
      setNotice(cause instanceof Error ? cause.message : String(cause));
    });
  };

  const openHistory = (entry: MemoryDetailDto) => {
    setHistory([]);
    void bridge.loadMemoryHistory(workspaceId, entry.id).then((result) => setHistory(result.items)).catch((cause: unknown) => {
      setHistory(null);
      setNotice(cause instanceof Error ? cause.message : String(cause));
    });
  };

  const runConfirmed = async () => {
    if (!confirm) return;
    await bridge.mutateMemory(workspaceId, {
      action: confirm.action,
      memoryEntryId: confirm.entry.id,
      expectedRevisionId: confirm.entry.revisionId,
    });
    const action = confirm.action;
    setConfirm(null);
    reload(action === "approve" ? "Proposal approved." : action === "reject" ? "Proposal rejected." : "Memory retired.");
  };

  const reviewHealth = async () => {
    try {
      const health = await bridge.loadMemoryHealth(workspaceId);
      setNotice(health.findings.length
        ? `${health.findings.length} ${health.findings.length === 1 ? "memory needs" : "memories need"} review.`
        : `All ${health.scanned} effective memories are healthy.`);
      if (health.findings[0]) setExpanded(health.findings[0].memoryEntryId);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const instrumentState = error
    ? "unavailable"
    : loading
      ? "loading"
      : items.length === 0
        ? "empty"
        : selectedVisible
          ? "selected"
          : "ready";

  return (
    <InstrumentScreenRoot descriptor={memoryInstrumentStates} state={instrumentState}>
    <main className="main-region memory-region">
      <div className="memory-topbar">
        <span>{workspaceName}</span>
        <div>
          <button type="button" onClick={() => void reviewHealth()}><Activity />Review memory health</button>
          <button type="button" onClick={openRecall}><Eye />Preview agent context</button>
          <button type="button" className="memory-primary" onClick={() => setEditor({})}><Plus />Add memory</button>
        </div>
      </div>

      <header className="memory-header">
        <div><h1>Memory</h1><p>Durable context agents reuse across future work</p></div>
        <div className="memory-counts"><strong>{reviewing ? `${proposed.length} PROPOSED · NOT IN RECALL` : `${active.length} ACTIVE · ${workspaceCount} WORKSPACE · ${active.length - workspaceCount} INHERITED`}</strong><span>{reviewing ? "PROPOSALS ARE NOT PART OF THE ACTIVE CAP" : `${workspaceCount} / 100 IN THIS TIER`}</span></div>
      </header>

      <div className="memory-filters">
        <label className="memory-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search rules and bodies" />{query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")}><X /></button>}</label>
        <div className="memory-segments" aria-label="Memory scope">
          {(["effective", "workspace", "global"] as Scope[]).map((value) => <button type="button" className={scope === value ? "is-active" : ""} key={value} onClick={() => setScope(value)}>{value[0]!.toUpperCase() + value.slice(1)}</button>)}
        </div>
        <i />
        <div className="memory-type-chips">
          <button type="button" className={type === null ? "is-active" : ""} onClick={() => setType(null)}>All <span>{chipSource.length}</span></button>
          {FILTER_TYPES.map((value) => <button type="button" key={value} className={type === value ? "is-active" : ""} onClick={() => setType(value)}>{TYPE_LABEL[value]} <span>{chipSource.filter((entry) => entry.type === value).length}</span></button>)}
        </div>
        {dirty && <button type="button" className="memory-clear" onClick={() => { setQuery(""); setScope("effective"); setType(null); }}>Clear filters</button>}
        <button type="button" className="memory-sort" onClick={() => setOrder((value) => SORTS[(SORTS.indexOf(value) + 1) % SORTS.length]!)}><ArrowDownUp />{SORT_LABEL[order]}</button>
      </div>

      <div className={`memory-review-strip${reviewing ? " is-reviewing" : ""}`}>
        {reviewing ? <ArrowLeft /> : proposed.length > 0 ? <Inbox /> : <Check />}
        <span>{proposed.length > 0 ? reviewing ? `Reviewing ${proposed.length} proposals · nothing here reaches agents until you approve it` : `${proposed.length} ${proposed.length === 1 ? "proposal is" : "proposals are"} waiting for review — they do not reach agents yet` : "Memory is up to date"}</span>
        <button type="button" onClick={() => { setReviewing((value) => { const next = !value; setExpanded(next ? null : firstActiveDisplayed?.id ?? null); return next; }); }}>{reviewing ? "Back to active memory" : "Review now"}</button>
      </div>

      <section className="memory-rulebook" aria-busy={loading}>
        {error && <div className="memory-state"><TriangleAlert />{error}<button type="button" onClick={() => setRefresh((value) => value + 1)}>Retry</button></div>}
        {!error && loading && <div className="memory-state">Loading memory…</div>}
        {!error && !loading && items.length === 0 && <div className="memory-state">{query || type ? "No memory matches these filters." : reviewing ? "No proposals are waiting for review." : "No active memory yet."}</div>}
        {!error && !loading && groups.map(([group, entries]) => (
          <div className="memory-group" key={group}>
            <MemoryGroupHeader group={group} reviewing={reviewing} count={entries.length} workspaceName={workspaceName} />
            <div>{entries.map((entry) => <MemoryRule key={`${entry.id}:${entry.revisionId}`} entry={entry} workspaceName={workspaceName} open={expanded === entry.id} reviewing={reviewing} onToggle={() => setExpanded((value) => value === entry.id ? null : entry.id)} onRevise={() => setEditor({ entry })} onHistory={() => openHistory(entry)} onConfirm={(action) => setConfirm({ action, entry })} />)}</div>
          </div>
        ))}
      </section>
      <div className="memory-live" aria-live="polite">{notice}</div>

      <RecallDialog open={recallOpen} onOpenChange={setRecallOpen} recall={recall} />
      <EditorDialog key={editor?.entry?.revisionId ?? (editor ? "new" : "closed")} open={editor !== null} entry={editor?.entry} onOpenChange={(open) => { if (!open) setEditor(null); }} onSave={async (mutation) => { await bridge.mutateMemory(workspaceId, mutation); setEditor(null); reload(editor?.entry ? "New memory version saved." : "Memory added."); }} />
      <HistoryDialog history={history} onOpenChange={(open) => { if (!open) setHistory(null); }} />
      <ConfirmDialog state={confirm} onOpenChange={(open) => { if (!open) setConfirm(null); }} onConfirm={() => void runConfirmed().catch((cause: unknown) => setNotice(cause instanceof Error ? cause.message : String(cause)))} />
    </main>
    </InstrumentScreenRoot>
  );
}

function filterMemory(entries: MemoryDetailDto[], query: string, type: MemoryType | null, order: (typeof SORTS)[number]): MemoryDetailDto[] {
  const needle = query.trim().toLocaleLowerCase();
  return entries.filter((entry) => (!type || entry.type === type) && (!needle || [entry.name, entry.slug, entry.body.rule, entry.body.why, ...entry.body.howToApply, ...entry.body.doesNotApplyTo].join(" ").toLocaleLowerCase().includes(needle)))
    .sort(order === "name" ? (a, b) => a.name.localeCompare(b.name) : order === "filed" ? (a, b) => Date.parse(b.filed) - Date.parse(a.filed) : (a, b) => b.version - a.version || Date.parse(b.filed) - Date.parse(a.filed));
}

function MemoryGroupHeader({ group, reviewing, count, workspaceName }: { group: string; reviewing: boolean; count: number; workspaceName: string }) {
  const Icon = reviewing ? group === "global" ? Globe2 : Box : TYPE_ICON[group as MemoryType];
  const label = reviewing ? group === "global" ? "GLOBAL · EVERY WORKSPACE" : `WORKSPACE · ${workspaceName.toUpperCase()}` : TYPE_LABEL[group as MemoryType].toUpperCase();
  return <header><Icon /><span>{label}</span><b>{count}</b><i /></header>;
}

function MemoryRule({ entry, workspaceName, open, reviewing, onToggle, onRevise, onHistory, onConfirm }: {
  entry: MemoryDetailDto; workspaceName: string; open: boolean; reviewing: boolean; onToggle(): void; onRevise(): void;
  onHistory(): void; onConfirm(action: "approve" | "reject" | "retire"): void;
}) {
  const panelId = `memory-rule-${entry.id}`;
  const filed = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(entry.filed));
  return <article className={`memory-rule${open ? " is-open" : ""}${reviewing ? " is-proposal" : ""}`}>
    <button type="button" className="memory-rule-head" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
      <ChevronRight />
      <span><strong>{entry.body.rule || entry.name}</strong><small><em className={`is-${entry.tier}`}>{entry.tier === "global" ? <Globe2 /> : <Box />}{entry.tier === "global" ? "Global" : `Workspace · ${workspaceName}`}</em>{entry.overridesGlobal && <em className="memory-tag">OVERRIDES</em>}<i>v{entry.version} · {entry.version > 1 ? "Revised" : "Filed"} {filed}</i>{entry.qualityFlags.length > 0 && <b><TriangleAlert />No negative scope</b>}</small></span>
      <i>{entry.name}</i>
    </button>
    {open && <div className="memory-rule-body" id={panelId}>
      <section><label>WHY</label><p>{entry.body.why || "Why has not been captured yet."}</p></section>
      <div className="memory-rule-columns">
        <section><label>HOW TO APPLY</label>{entry.body.howToApply.length ? <ul>{entry.body.howToApply.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="is-muted">Application guidance is missing.</p>}</section>
        <section><label>DOES NOT APPLY TO</label>{entry.body.doesNotApplyTo.length ? <ul className="is-negative">{entry.body.doesNotApplyTo.map((item) => <li key={item}><CircleSlash />{item}</li>)}</ul> : <div className="memory-quality"><TriangleAlert /><span>Negative scope is missing. This memory may be applied too broadly.</span><button type="button" onClick={onRevise}>Revise and complete</button></div>}</section>
      </div>
      {entry.overridesGlobal && <div className="memory-override"><Layers3 />This workspace memory overrides a global memory with the same ID — the global text is not sent.</div>}
      <footer>{reviewing ? <><button type="button" className="memory-primary" onClick={() => onConfirm("approve")}><Check />Approve</button><button type="button" onClick={() => onConfirm("reject")}><X />Reject</button></> : <button type="button" className="memory-primary" onClick={onRevise}><PencilLine />Revise</button>}<button type="button" onClick={onHistory}><History />History ({entry.version})</button><span>{entry.source} · filed {entry.filed}</span>{!reviewing && <button type="button" className="memory-retire" onClick={() => onConfirm("retire")}><Archive />Retire</button>}</footer>
    </div>}
  </article>;
}

function MemoryModal({ open, onOpenChange, title, description, className = "", children }: { open: boolean; onOpenChange(open: boolean): void; title: string; description: string; className?: string; children: React.ReactNode }) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>{open && <><Dialog.Overlay forceMount className="memory-modal-overlay" /><Dialog.Content forceMount className={`memory-modal ${className}`}><header><div><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{description}</Dialog.Description></div><Dialog.Close asChild><button type="button" aria-label={`Close ${title}`}><X /></button></Dialog.Close></header>{children}</Dialog.Content></>}</Dialog.Root>;
}

function RecallDialog({ open, onOpenChange, recall }: { open: boolean; onOpenChange(open: boolean): void; recall: Awaited<ReturnType<typeof bridge.recallMemory>> | null }) {
  return <MemoryModal open={open} onOpenChange={onOpenChange} title="Agent context preview" description="The exact effective memory sent as background context" className="memory-recall">
    {!recall ? <div className="memory-state">Loading context…</div> : <><div className="memory-recall-counts"><span>{recall.workspaceCount} workspace</span><span>{recall.globalCount} global</span></div><p className="memory-recall-note">{recall.note}</p><div className="memory-recall-list">{recall.entries.map((entry) => <article key={entry.id}><small>{entry.tier} · {entry.slug}</small><strong>{entry.body.rule}</strong><p>{entry.description}</p></article>)}</div></>}
  </MemoryModal>;
}

function EditorDialog({ open, entry, onOpenChange, onSave }: { open: boolean; entry?: MemoryDetailDto; onOpenChange(open: boolean): void; onSave(input: MemoryMutation): Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [tier, setTier] = useState<MemoryTier>(entry?.tier ?? "workspace");
  const [type, setType] = useState<Exclude<MemoryType, "legacy">>(entry?.type === "legacy" ? "user" : entry?.type ?? "user");
  const [status, setStatus] = useState<"active" | "proposed">(entry ? "proposed" : "active");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const lines = (name: string) => String(data.get(name) ?? "").split("\n").map((item) => item.trim()).filter(Boolean);
    const common = {
      status,
      name: String(data.get("name")), description: String(data.get("description")),
      type,
      body: { rule: String(data.get("rule")), why: String(data.get("why")), howToApply: lines("how"), doesNotApplyTo: lines("not") },
      source: "Desktop",
    };
    const mutation: MemoryMutation = entry
      ? { action: "revise", memoryEntryId: entry.id, expectedRevisionId: entry.revisionId, ...common }
      : { action: "create", tier, slug: String(data.get("slug")), ...common };
    setSaving(true); setFormError("");
    try { await onSave(mutation); } catch (cause) { setFormError(cause instanceof Error ? cause.message : String(cause)); setSaving(false); }
  };
  return <MemoryModal open={open} onOpenChange={onOpenChange} title={entry ? "Revise memory" : "Add memory"} description={entry ? `Save as immutable version ${entry.version + 1}` : "Create a durable rule for future work"}>
    <form className="memory-editor" onSubmit={(event) => void submit(event)}>
      <label>Rule<textarea name="rule" required defaultValue={entry?.body.rule} autoFocus /></label>
      <div><label>Scope{entry ? <span className="memory-static-field">{tier === "workspace" ? "Workspace" : "Global"}</span> : <SelectMenu<MemoryTier> overlayOwner="memory.editor" value={tier} options={[{ value: "workspace", label: "Workspace" }, { value: "global", label: "Global" }]} ariaLabel="Memory scope" onValueChange={setTier} />}</label><label>Type<SelectMenu<Exclude<MemoryType, "legacy">> overlayOwner="memory.editor" value={type} options={TYPES.filter((value): value is Exclude<MemoryType, "legacy"> => value !== "legacy").map((value) => ({ value, label: TYPE_LABEL[value] }))} ariaLabel="Memory type" onValueChange={setType} /></label><label>State<SelectMenu<"active" | "proposed"> overlayOwner="memory.editor" value={status} options={[{ value: "active", label: "Active" }, { value: "proposed", label: "Proposal" }]} ariaLabel="Memory state" onValueChange={setStatus} /></label></div>
      <label>Why<textarea name="why" defaultValue={entry?.body.why} /></label>
      <div><label>How to apply <small>one item per line</small><textarea name="how" defaultValue={entry?.body.howToApply.join("\n")} /></label><label>Does not apply to <small>one item per line</small><textarea name="not" defaultValue={entry?.body.doesNotApplyTo.join("\n")} /></label></div>
      <details><summary>Advanced fields</summary><div><label>Name<input name="name" required defaultValue={entry?.name ?? "Memory rule"} /></label>{!entry && <label>Slug<input name="slug" required pattern="[a-z0-9][a-z0-9-]*" placeholder="memory-rule" /></label>}<label>Description<input name="description" required defaultValue={entry?.description ?? "Durable workspace guidance."} /></label></div></details>
      {formError && <p className="memory-form-error">{formError}</p>}
      <footer><Dialog.Close asChild><button type="button">Cancel</button></Dialog.Close><button className="memory-primary" type="submit" disabled={saving}>{saving ? "Saving…" : entry ? `Save as version ${entry.version + 1}` : "Add memory"}</button></footer>
    </form>
  </MemoryModal>;
}

function HistoryDialog({ history, onOpenChange }: { history: MemoryDetailDto[] | null; onOpenChange(open: boolean): void }) {
  return <MemoryModal open={history !== null} onOpenChange={onOpenChange} title="Version history" description="Immutable revisions, newest first"><div className="memory-history">{history?.length === 0 && <div className="memory-state">Loading history…</div>}{history?.map((entry) => <article key={entry.revisionId}><FileClock /><span><strong>Version {entry.version}</strong><small>{entry.status} · {entry.filed} · {entry.source}</small><p>{entry.body.rule}</p></span></article>)}</div></MemoryModal>;
}

function ConfirmDialog({ state, onOpenChange, onConfirm }: { state: ConfirmState; onOpenChange(open: boolean): void; onConfirm(): void }) {
  const verb = state?.action ?? "retire";
  return <MemoryModal open={state !== null} onOpenChange={onOpenChange} title={`${verb[0]!.toUpperCase()}${verb.slice(1)} memory?`} description={verb === "retire" ? "The rule leaves recall but remains in immutable history." : verb === "approve" ? "The proposal becomes the active revision." : "The proposal is preserved as rejected provenance."}><div className="memory-confirm"><p>{state?.entry.body.rule}</p><footer><Dialog.Close asChild><button type="button">Cancel</button></Dialog.Close><button type="button" className={verb === "approve" ? "memory-primary" : "memory-danger"} onClick={onConfirm}>{verb[0]!.toUpperCase() + verb.slice(1)}</button></footer></div></MemoryModal>;
}

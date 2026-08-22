import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, X } from "lucide-react";
import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { SelectMenu } from "../../components/ui/SelectMenu";
import type { Availability, SharedArtifactPresentation } from "./presentation";

export type SharedLibraryWorkflowKind = "add" | "promote" | "duplicate" | "suggestions" | "archive" | "update-review";

const coreReason = "This workflow cannot persist because the current Core version exposes no Shared Library mutation contract.";
const unavailable = "Unavailable from this Core version";
export const SHARED_ARTIFACT_ROLES = [
  "Canonical character", "Character reference", "Location", "Product", "Logo or brand mark", "Color or style reference",
  "Universal sound hook", "Music bed", "Sound effect", "Voice reference", "Font", "Prop", "Recurring footage",
  "Intro or outro", "Overlay or texture", "Document reference", "Other",
] as const;
const roleOptions = SHARED_ARTIFACT_ROLES.map((value) => ({ value, label: value }));
const formatLocalBytes = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

function RoleField({ role, otherRole, onRole, onOtherRole }: { role: string; otherRole: string; onRole(value: string): void; onOtherRole(value: string): void }) {
  return <div className="shared-workflow-field"><span>Role</span><SelectMenu overlayOwner="shared.workflow" value={role} options={roleOptions} ariaLabel="Role" className="shared-workflow-role" onValueChange={onRole} />
    {role === "Other" && <input aria-label="Other role" value={otherRole} onChange={(event) => onOtherRole(event.currentTarget.value)} placeholder="Describe the role" />}
  </div>;
}

function WorkflowFrame({ kind, title, description, returnFocus, onClose, steps, footerNote, children, actions }: {
  kind: SharedLibraryWorkflowKind;
  title: string;
  description: string;
  returnFocus: HTMLElement | null;
  onClose(): void;
  steps?: ReactNode;
  footerNote?: string;
  children: ReactNode;
  actions: ReactNode;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const restoreFocus = useCallback(() => {
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  }, [returnFocus]);
  const close = useCallback(() => {
    onClose();
    queueMicrotask(restoreFocus);
  }, [onClose, restoreFocus]);

  return <Dialog.Root open onOpenChange={(open) => { if (!open) close(); }}>
    <Dialog.Portal container={typeof document === "undefined" ? undefined : document.body}>
      <Dialog.Overlay className="shared-workflow-overlay" />
      <Dialog.Content data-instrument-overlay="shared-workflow"
        ref={surface}
        tabIndex={-1}
        className="shared-workflow-window rounded-panel bg-surface text-ink [&_input]:bg-surface-sunken [&_textarea]:bg-surface-sunken"
        data-workflow={kind}
        onOpenAutoFocus={(event) => { event.preventDefault(); surface.current?.focus({ preventScroll: true }); }}
        onCloseAutoFocus={(event) => { event.preventDefault(); restoreFocus(); }}
      >
        <header className="shared-workflow-header bg-surface-sunken">
          <div><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{description}</Dialog.Description></div>
          <button type="button" aria-label={`Close ${title}`} onClick={close}><X aria-hidden="true" /></button>
        </header>
        {steps}
        <form className="shared-workflow-body" onSubmit={(event) => event.preventDefault()}>{children}</form>
        <footer className="shared-workflow-footer bg-surface-sunken">
          <small>{footerNote ?? coreReason}</small>
          <span>{actions}</span>
        </footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

function Block({ label, tag, children, className = "" }: { label: string; tag?: string; children: ReactNode; className?: string }) {
  return <section className={`shared-workflow-block rounded-cell bg-surface-sunken ${className}`}><header><h3>{label}</h3>{tag && <span>{tag}</span>}</header>{children}</section>;
}

const addSteps = ["Source", "Duplicates", "Describe for reuse", "Confirm"] as const;

function AddWorkflow({ returnFocus, onClose }: Pick<SharedLibraryWorkflowsProps, "returnFocus" | "onClose">) {
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<{ name: string; type: string; size: number } | null>(null);
  const [fields, setFields] = useState({ title: "", role: SHARED_ARTIFACT_ROLES[0] as string, otherRole: "", purpose: "", useWhen: "", rights: "Not documented" });
  const reasonId = useId();
  const sourceReasonId = useId();
  const setField = (field: keyof typeof fields, value: string) => setFields((current) => ({ ...current, [field]: value }));
  const selectFile = (next?: { name: string; type: string; size: number }) => setFile(next ? { name: next.name, type: next.type, size: next.size } : null);
  const selectedRole = fields.role === "Other" ? fields.otherRole : fields.role;
  const needsContext = !fields.title.trim() || !selectedRole.trim() || !fields.purpose.trim() || !fields.useWhen.trim();
  const steps = <ol className="shared-workflow-steps" aria-label="Add artifact steps">
    {addSteps.map((label, index) => <li key={label}><button type="button" aria-current={step === index ? "step" : undefined} onClick={() => setStep(index)}><span>{index + 1}</span>{label}</button></li>)}
  </ol>;

  return <WorkflowFrame
    kind="add"
    title="Add artifact"
    description="Prepare a reusable artifact locally; the current Core cannot accept the upload."
    returnFocus={returnFocus}
    onClose={onClose}
    steps={steps}
    footerNote={step === 3 ? coreReason : `STEP ${step + 1} OF 4 · LOCAL PREVIEW ONLY`}
    actions={<>
      {step > 0 && <button type="button" onClick={() => setStep((current) => current - 1)}>Back</button>}
      {step < 3 && <button type="button" className="shared-workflow-primary" onClick={() => setStep((current) => current + 1)}>{step === 0 ? "Continue to duplicates" : step === 1 ? "Continue to describe" : "Continue to confirm"}</button>}
      {step === 3 && <button type="button" className="shared-workflow-primary" disabled aria-describedby={reasonId}>Add to Shared Library unavailable</button>}
    </>}
  >
    {step === 0 && <Block label="Source" tag="LOCAL ONLY">
      <div className="shared-workflow-sources">
        <label className="shared-workflow-source is-upload" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); selectFile(event.dataTransfer.files?.[0]); }}><strong>Upload new file</strong><span>Drop a file here or choose with the accessible picker.</span><input type="file" onChange={(event) => selectFile(event.currentTarget.files?.[0])} /><small>{file ? file.name : "Choose a file"}</small></label>
        {["Promote from project", "Import from asset pool", "Add external reference"].map((label) => <button type="button" data-unavailable-source aria-disabled="true" aria-describedby={sourceReasonId} key={label}><strong>{label}</strong><span>Unavailable from the current Core version.</span></button>)}
      </div>
      <dl className="shared-workflow-inventory"><div><dt>Accepted types</dt><dd> · unavailable from the current Core upload contract</dd></div><div><dt>Maximum size</dt><dd> · unavailable from the current Core upload contract</dd></div></dl>
      {file && <div className="shared-workflow-local-preview" aria-label="Local confirmation preview"><strong>{file.name}</strong><span>{file.type || "Type not reported"} · {formatLocalBytes(file.size)}</span></div>}
      <p className="shared-workflow-core-reason" id={sourceReasonId}>Project promotion, asset-pool import, and external references are unavailable because Core exposes no source inventory or mutation contract.</p>
      <p className="shared-workflow-caption">Upload cannot persist with this Core version. Choosing a file only updates this window.</p>
    </Block>}
    {step === 1 && <Block label="Duplicates" tag="CHECK UNAVAILABLE">
      <div className="shared-workflow-note"><AlertTriangle aria-hidden="true" /><span><strong>Content hash comparison is unavailable from this Core version.</strong> No duplicate has been detected and no identity claim is being made.</span></div>
    </Block>}
    {step === 2 && <Block label="Required for reuse" tag="5 FIELDS">
      <div className="shared-workflow-fields">
        <label><span>Title</span><input value={fields.title} onChange={(event) => setField("title", event.currentTarget.value)} placeholder="What this artifact represents" /></label>
        <RoleField role={fields.role} otherRole={fields.otherRole} onRole={(value) => setField("role", value)} onOtherRole={(value) => setField("otherRole", value)} />
        <label><span>Purpose</span><textarea value={fields.purpose} onChange={(event) => setField("purpose", event.currentTarget.value)} placeholder="What this is for" /></label>
        <label><span>Use when</span><textarea value={fields.useWhen} onChange={(event) => setField("useWhen", event.currentTarget.value)} placeholder="Trigger conditions for future work" /></label>
        <fieldset className="shared-workflow-rights"><legend>Rights status</legend><div role="group" aria-label="Proposed rights status">{["Not documented", "Cleared", "Cleared with conditions", "Internal/reference only", "Restricted"].map((status) => <button type="button" className={fields.rights === status ? "bg-instrument text-on-instrument" : "bg-surface-sunken text-ink"} aria-pressed={fields.rights === status} onClick={() => setField("rights", status)} key={status}>{status}</button>)}</div></fieldset>
      </div>
      <p className="shared-workflow-caption">Incomplete values would be marked Needs context. Proposed rights default to Not documented; neither value has been saved.</p>
    </Block>}
    {step === 3 && <Block label="Confirm" tag={needsContext ? "NEEDS CONTEXT" : "CONTEXT REVIEWED"}>
      <dl className="shared-workflow-inventory">
        <div><dt>Source</dt><dd>{file?.name || "No local file selected"}</dd></div>
        <div><dt>Local file facts</dt><dd>{file ? `${file.type || "Type not reported"} · ${formatLocalBytes(file.size)}` : "Unavailable until a local file is selected"}</dd></div>
        <div><dt>Title</dt><dd>{fields.title || "Incomplete"}</dd></div>
        <div><dt>Role</dt><dd>{selectedRole || "Incomplete"}</dd></div>
        <div><dt>Purpose</dt><dd>{fields.purpose || "Incomplete"}</dd></div>
        <div><dt>Use when</dt><dd>{fields.useWhen || "Incomplete"}</dd></div>
        <div><dt>Rights</dt><dd>Proposed rights · {fields.rights}</dd></div>
      </dl>
      <div className="shared-workflow-note"><AlertTriangle aria-hidden="true" /><span><strong>{needsContext ? "Needs context" : "Context ready for review"}</strong> Nothing has been saved. Incomplete metadata would not block a future upload.</span></div>
      <p className="shared-workflow-core-reason" id={reasonId}>{coreReason}</p>
    </Block>}
  </WorkflowFrame>;
}

function PromoteWorkflow({ returnFocus, onClose }: Pick<SharedLibraryWorkflowsProps, "returnFocus" | "onClose">) {
  const reasonId = useId();
  const [meaning, setMeaning] = useState({ title: "", role: SHARED_ARTIFACT_ROLES[0] as string, otherRole: "", purpose: "" });
  const setField = (field: keyof typeof meaning, value: string) => setMeaning((current) => ({ ...current, [field]: value }));
  return <WorkflowFrame kind="promote" title="Promote from project" description="Make a project artifact reusable without moving or changing its project source." returnFocus={returnFocus} onClose={onClose} actions={<><Dialog.Close asChild><button type="button">Cancel</button></Dialog.Close><button type="button" className="shared-workflow-primary" disabled aria-describedby={reasonId}>Promote to Shared Library unavailable</button></>}>
    <Block label="Source project artifact" tag="INVENTORY UNAVAILABLE">
      <div className="shared-workflow-field"><span>Project source</span><button type="button" className="shared-workflow-disabled-select" aria-disabled="true" aria-describedby={reasonId}>Project artifact inventory unavailable from this Core version</button></div>
      <p className="shared-workflow-caption">A future source picker preserves the source project, Unit, selected revision, provenance, existing reference, and content identity.</p>
    </Block>
    <Block label="Workspace meaning" tag="LOCAL PREVIEW">
      <div className="shared-workflow-fields shared-workflow-fields-three">
        <label><span>Title</span><input value={meaning.title} onChange={(event) => setField("title", event.currentTarget.value)} /></label>
        <RoleField role={meaning.role} otherRole={meaning.otherRole} onRole={(value) => setField("role", value)} onOtherRole={(value) => setField("otherRole", value)} />
        <label><span>Purpose</span><textarea value={meaning.purpose} onChange={(event) => setField("purpose", event.currentTarget.value)} /></label>
      </div>
    </Block>
    <Block label="Confirmation copy" tag="NOT PERFORMED"><div className="shared-workflow-note"><span><strong>Added to Shared Library · the existing project remains pinned to its current artifact.</strong> No promotion has occurred; this is the exact future confirmation copy.</span></div></Block>
    <p className="shared-workflow-core-reason" id={reasonId}>{coreReason}</p>
  </WorkflowFrame>;
}

function DuplicateWorkflow({ returnFocus, onClose }: Pick<SharedLibraryWorkflowsProps, "returnFocus" | "onClose">) {
  const [choice, setChoice] = useState<"reuse" | "revision" | "separate">("reuse");
  const [reason, setReason] = useState("");
  const reasonId = useId();
  const choices = [
    ["reuse", "Reuse the existing artifact", "No new artifact would be created."],
    ["revision", "Add as a new revision", "A future revision would be append-only; existing usages stay pinned."],
    ["separate", "Create a separate artifact", "The same bytes need a recorded semantic reason."],
  ] as const;
  return <WorkflowFrame kind="duplicate" title="Duplicate review" description="Review the same-content boundary without claiming a hash result." returnFocus={returnFocus} onClose={onClose} actions={<><Dialog.Close asChild><button type="button">Cancel</button></Dialog.Close><button type="button" className="shared-workflow-primary" disabled aria-describedby={reasonId}>{choice === "reuse" ? "Reuse existing artifact unavailable" : choice === "revision" ? "Add revision unavailable" : "Create separate artifact unavailable"}</button></>}>
    <Block label="Same content identity" tag="HASH UNAVAILABLE">
      <div className="shared-workflow-compare"><article><strong>Existing artifact</strong><span>{unavailable}</span></article><article><strong>Incoming file</strong><span>{unavailable}</span></article></div>
      <p className="shared-workflow-caption">Content hash comparison is unavailable from this Core version. A filename is not content identity.</p>
    </Block>
    <Block label="What should happen" tag="LOCAL CHOICE">
      <div className="shared-workflow-choices">{choices.map(([value, label, detail]) => <button type="button" className={choice === value ? "bg-instrument text-on-instrument [&_small]:text-on-instrument-muted [&_strong]:text-on-instrument" : "bg-surface-sunken text-ink"} aria-pressed={choice === value} onClick={() => setChoice(value)} key={value}><span><strong>{label}</strong><small>{detail}</small></span></button>)}</div>
      {choice === "separate" && <label className="shared-workflow-field"><span>Reason required</span><input required value={reason} onChange={(event) => setReason(event.currentTarget.value)} placeholder="Why the same bytes represent a distinct artifact" /></label>}
    </Block>
    <p className="shared-workflow-core-reason" id={reasonId}>{coreReason}</p>
  </WorkflowFrame>;
}

const suggestionFields = ["Title", "Media kind and role", "Named entity", "Purpose"];

function SuggestionsWorkflow({ suggestions, returnFocus, onClose }: Pick<SharedLibraryWorkflowsProps, "suggestions" | "returnFocus" | "onClose">) {
  const [review, setReview] = useState<Record<string, "pending" | "accepted" | "rejected">>({});
  const reasonId = useId();
  const items = suggestions.status === "ready" || suggestions.status === "partial" ? suggestions.value : [];
  const suggestionReason = suggestions.status === "ready" ? "No suggestion evidence was supplied." : suggestions.reason;
  return <WorkflowFrame kind="suggestions" title="Suggested from file content" description="Review each local suggestion before it could become context agents receive." returnFocus={returnFocus} onClose={onClose} footerNote="SUGGESTIONS ARE NOT CANONICAL UNTIL ACCEPTED" actions={<><Dialog.Close asChild><button type="button">Cancel</button></Dialog.Close><button type="button" className="shared-workflow-primary" disabled aria-describedby={reasonId}>Apply reviewed fields unavailable</button></>}>
    <Block label="Suggestions" tag={items.length ? `REVIEW ${items.length}` : "UNAVAILABLE"}>
      <div className="shared-workflow-suggestions">{items.length ? items.map(({ field, value, source }, index) => {
        const key = `${field}:${index}`;
        const status = review[key] ?? "pending";
        return <article className="shared-workflow-suggestion" key={key}>
          <header><strong>{field}</strong><span>SUGGESTED</span></header><p>{value}</p><small>{source}</small>
          <div><button type="button" className={status === "accepted" ? "bg-instrument text-on-instrument" : "bg-surface-sunken text-ink"} aria-pressed={status === "accepted"} onClick={() => setReview((current) => ({ ...current, [key]: "accepted" }))}>Accept {field} suggestion</button><button type="button" className={status === "rejected" ? "bg-instrument text-on-instrument" : "bg-surface-sunken text-ink"} aria-pressed={status === "rejected"} onClick={() => setReview((current) => ({ ...current, [key]: "rejected" }))}>Reject {field} suggestion</button></div>
          <b>{status === "accepted" ? "Accepted locally for review" : status === "rejected" ? "Rejected locally" : "Awaiting review"}</b>
        </article>;
      }) : suggestionFields.map((field) => <article className="shared-workflow-suggestion" key={field}>
        <header><strong>{field}</strong><span>UNAVAILABLE</span></header><p>{suggestionReason}</p><small>No suggestion value or source evidence returned.</small>
        <div><button type="button" disabled>Accept {field} suggestion</button><button type="button" disabled>Reject {field} suggestion</button></div>
        <b>Unavailable from this Core version</b>
      </article>)}</div>
      {suggestions.status === "partial" && <p className="shared-workflow-caption">{suggestions.reason}</p>}
    </Block>
    <div className="shared-workflow-note is-warning"><AlertTriangle aria-hidden="true" /><span><strong>Licence, consent and identity are never inferred.</strong> Universal-use rules are never inferred from media either.</span></div>
    <Block label="NOT SUGGESTED"><dl className="shared-workflow-inventory"><div><dt>Rights and licence</dt><dd>Human evidence only</dd></div><div><dt>Consent and identity</dt><dd>Human evidence only</dd></div><div><dt>Universal-use rules</dt><dd>Human decision only</dd></div><div><dt>Canonical status</dt><dd>Human decision only</dd></div></dl></Block>
    <p className="shared-workflow-core-reason" id={reasonId}>Suggestions are not canonical and nothing has been persisted. {coreReason}</p>
  </WorkflowFrame>;
}

function ArchiveWorkflow({ artifact, returnFocus, onClose }: SharedLibraryWorkflowsProps) {
  const reasonId = useId();
  return <WorkflowFrame kind="archive" title="Archive impact" description={`Archiving ${artifact?.slug ?? "this artifact"} would stop future selection while preserving references and provenance.`} returnFocus={returnFocus} onClose={onClose} actions={<><Dialog.Close asChild><button type="button">Cancel</button></Dialog.Close><button type="button" className="shared-workflow-warning" disabled aria-describedby={reasonId}>Archive artifact unavailable</button></>}>
    <Block label="What this touches" tag="IMPACT UNAVAILABLE"><dl className="shared-workflow-inventory">{["Active references", "Historical references", "Projects affected", "Units affected", "Currently canonical", "File state"].map((label) => <div key={label}><dt>{label}</dt><dd>{unavailable}</dd></div>)}</dl></Block>
    <Block label="Replacement for future work" tag="PICKER UNAVAILABLE"><div className="shared-workflow-field"><span>Replacement artifact</span><button type="button" className="shared-workflow-disabled-select" disabled>Replacement candidates unavailable from this Core version</button></div></Block>
    <div className="shared-workflow-note is-warning"><AlertTriangle aria-hidden="true" /><span><strong>Nothing is deleted.</strong> Archive is reversible. Existing references and provenance would remain; permanent byte removal is a separate technical action.</span></div>
    <p className="shared-workflow-core-reason" id={reasonId}>{coreReason} Counts, canonical status, references, and replacement candidates are unavailable.</p>
  </WorkflowFrame>;
}

function UpdateReviewWorkflow({ artifact, returnFocus, onClose }: SharedLibraryWorkflowsProps) {
  const reasonId = useId();
  return <WorkflowFrame kind="update-review" title="Revision update review" description={`Review future update choices for ${artifact?.slug ?? "this artifact"} without changing pinned usages.`} returnFocus={returnFocus} onClose={onClose} actions={<><Dialog.Close asChild><button type="button">Cancel</button></Dialog.Close><button type="button" className="shared-workflow-primary" disabled aria-describedby={reasonId}>Apply usage decisions unavailable</button></>}>
    <Block label="Affected usages" tag="INVENTORY UNAVAILABLE"><p className="shared-workflow-caption">System-derived backlinks and compatibility evidence are unavailable from this Core version, so no usage can be enumerated or classified.</p></Block>
    <Block label="Choices" tag="ALL UNAVAILABLE"><div className="shared-workflow-choices">{[
      ["Update compatible usages", "Requires backlinks plus format, dimensions, duration, and rights compatibility."],
      ["Keep current revision", "Requires the exact pinned usage inventory."],
      ["Open usage for review", "Requires a project, Unit, and Unit revision backlink."],
    ].map(([label, detail]) => <button type="button" disabled key={label}><span><strong>{label}</strong><small>{detail}</small></span></button>)}</div></Block>
    <p className="shared-workflow-core-reason" id={reasonId}>{coreReason}</p>
  </WorkflowFrame>;
}

export interface SharedLibraryWorkflowsProps {
  kind: SharedLibraryWorkflowKind;
  artifact?: SharedArtifactPresentation;
  suggestions: Availability<SharedLibrarySuggestion[]>;
  returnFocus: HTMLElement | null;
  onClose(): void;
}

export interface SharedLibrarySuggestion {
  field: string;
  value: string;
  source: string;
}

export function SharedLibraryWorkflows(props: SharedLibraryWorkflowsProps) {
  if (props.kind === "add") return <AddWorkflow {...props} />;
  if (props.kind === "promote") return <PromoteWorkflow {...props} />;
  if (props.kind === "duplicate") return <DuplicateWorkflow {...props} />;
  if (props.kind === "suggestions") return <SuggestionsWorkflow {...props} />;
  if (props.kind === "archive") return <ArchiveWorkflow {...props} />;
  return <UpdateReviewWorkflow {...props} />;
}

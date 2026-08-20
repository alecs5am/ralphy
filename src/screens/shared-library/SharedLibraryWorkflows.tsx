import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, X } from "lucide-react";
import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import type { SharedArtifactPresentation } from "./presentation";

export type SharedLibraryWorkflowKind = "add" | "promote" | "duplicate" | "suggestions" | "archive" | "update-review";

const coreReason = "This workflow cannot persist because the current Core version exposes no Shared Library mutation contract.";
const unavailable = "Unavailable from this Core version";

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
      <Dialog.Content
        ref={surface}
        tabIndex={-1}
        className="shared-workflow-window"
        data-workflow={kind}
        onOpenAutoFocus={(event) => { event.preventDefault(); surface.current?.focus({ preventScroll: true }); }}
        onCloseAutoFocus={(event) => { event.preventDefault(); restoreFocus(); }}
      >
        <header className="shared-workflow-header">
          <div><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{description}</Dialog.Description></div>
          <button type="button" aria-label={`Close ${title}`} onClick={close}><X aria-hidden="true" /></button>
        </header>
        {steps}
        <div className="shared-workflow-body">{children}</div>
        <footer className="shared-workflow-footer">
          <small>{footerNote ?? coreReason}</small>
          <span>{actions}</span>
        </footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

function Block({ label, tag, children, className = "" }: { label: string; tag?: string; children: ReactNode; className?: string }) {
  return <section className={`shared-workflow-block ${className}`}><header><h3>{label}</h3>{tag && <span>{tag}</span>}</header>{children}</section>;
}

const addSteps = ["Source", "Duplicates", "Describe for reuse", "Confirm"] as const;

function AddWorkflow({ returnFocus, onClose }: Pick<SharedLibraryWorkflowsProps, "returnFocus" | "onClose">) {
  const [step, setStep] = useState(0);
  const [fileName, setFileName] = useState("");
  const [fields, setFields] = useState({ title: "", role: "", purpose: "", useWhen: "", rights: "Not documented" });
  const reasonId = useId();
  const setField = (field: keyof typeof fields, value: string) => setFields((current) => ({ ...current, [field]: value }));
  const needsContext = !fields.title.trim() || !fields.role.trim() || !fields.purpose.trim() || !fields.useWhen.trim();
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
      <label className="shared-workflow-file">
        <input type="file" onChange={(event) => setFileName(event.currentTarget.files?.[0]?.name ?? "")} />
        <span>{fileName || "Choose a file"}</span>
        <small>Upload cannot persist with this Core version. Choosing a file only updates this window.</small>
      </label>
    </Block>}
    {step === 1 && <Block label="Duplicates" tag="CHECK UNAVAILABLE">
      <div className="shared-workflow-note"><AlertTriangle aria-hidden="true" /><span><strong>Content hash comparison is unavailable from this Core version.</strong> No duplicate has been detected and no identity claim is being made.</span></div>
    </Block>}
    {step === 2 && <Block label="Required for reuse" tag="5 FIELDS">
      <div className="shared-workflow-fields">
        <label><span>Title</span><input value={fields.title} onChange={(event) => setField("title", event.currentTarget.value)} placeholder="What this artifact represents" /></label>
        <label><span>Role</span><input value={fields.role} onChange={(event) => setField("role", event.currentTarget.value)} placeholder="How future work refers to it" /></label>
        <label><span>Purpose</span><textarea value={fields.purpose} onChange={(event) => setField("purpose", event.currentTarget.value)} placeholder="What this is for" /></label>
        <label><span>Use when</span><textarea value={fields.useWhen} onChange={(event) => setField("useWhen", event.currentTarget.value)} placeholder="Trigger conditions for future work" /></label>
        <fieldset className="shared-workflow-rights"><legend>Rights status</legend><div role="group" aria-label="Proposed rights status">{["Not documented", "Cleared", "Cleared with conditions", "Internal/reference only", "Restricted"].map((status) => <button type="button" aria-pressed={fields.rights === status} onClick={() => setField("rights", status)} key={status}>{status}</button>)}</div></fieldset>
      </div>
      <p className="shared-workflow-caption">Incomplete values would be marked Needs context. Proposed rights default to Not documented; neither value has been saved.</p>
    </Block>}
    {step === 3 && <Block label="Confirm" tag={needsContext ? "NEEDS CONTEXT" : "CONTEXT REVIEWED"}>
      <dl className="shared-workflow-inventory">
        <div><dt>Source</dt><dd>{fileName || "No local file selected"}</dd></div>
        <div><dt>Title</dt><dd>{fields.title || "Incomplete"}</dd></div>
        <div><dt>Role</dt><dd>{fields.role || "Incomplete"}</dd></div>
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
  const [meaning, setMeaning] = useState({ title: "", role: "", purpose: "" });
  const setField = (field: keyof typeof meaning, value: string) => setMeaning((current) => ({ ...current, [field]: value }));
  return <WorkflowFrame kind="promote" title="Promote from project" description="Make a project artifact reusable without moving or changing its project source." returnFocus={returnFocus} onClose={onClose} actions={<><Dialog.Close asChild><button type="button">Cancel</button></Dialog.Close><button type="button" className="shared-workflow-primary" disabled aria-describedby={reasonId}>Promote to Shared Library unavailable</button></>}>
    <Block label="Source project artifact" tag="INVENTORY UNAVAILABLE">
      <div className="shared-workflow-field"><span>Project source</span><button type="button" className="shared-workflow-disabled-select" disabled>Project artifact inventory unavailable from this Core version</button></div>
      <p className="shared-workflow-caption">A future source picker preserves the source project, Unit, selected revision, provenance, existing reference, and content identity.</p>
    </Block>
    <Block label="Workspace meaning" tag="LOCAL PREVIEW">
      <div className="shared-workflow-fields shared-workflow-fields-three">
        <label><span>Title</span><input value={meaning.title} onChange={(event) => setField("title", event.currentTarget.value)} /></label>
        <label><span>Role</span><input value={meaning.role} onChange={(event) => setField("role", event.currentTarget.value)} /></label>
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
      <div className="shared-workflow-choices">{choices.map(([value, label, detail]) => <button type="button" aria-pressed={choice === value} onClick={() => setChoice(value)} key={value}><span><strong>{label}</strong><small>{detail}</small></span></button>)}</div>
      {choice === "separate" && <label className="shared-workflow-field"><span>Reason required</span><input required value={reason} onChange={(event) => setReason(event.currentTarget.value)} placeholder="Why the same bytes represent a distinct artifact" /></label>}
    </Block>
    <p className="shared-workflow-core-reason" id={reasonId}>{coreReason}</p>
  </WorkflowFrame>;
}

const suggestions = [
  ["Title", "Rooftop bar — establishing", "from EXIF + visual content"],
  ["Media kind and role", "Image · Location", "from MIME + visual content"],
  ["Named entity", "Possible existing entity", "matches existing artifacts · not verified"],
  ["Purpose", "Wide establishing view for location context", "from visual content"],
] as const;

function SuggestionsWorkflow({ returnFocus, onClose }: Pick<SharedLibraryWorkflowsProps, "returnFocus" | "onClose">) {
  const [review, setReview] = useState<Record<string, "pending" | "accepted" | "rejected">>({});
  const reasonId = useId();
  return <WorkflowFrame kind="suggestions" title="Suggested from file content" description="Review each local suggestion before it could become context agents receive." returnFocus={returnFocus} onClose={onClose} footerNote="SUGGESTIONS ARE NOT CANONICAL UNTIL ACCEPTED" actions={<><Dialog.Close asChild><button type="button">Cancel</button></Dialog.Close><button type="button" className="shared-workflow-primary" disabled aria-describedby={reasonId}>Apply reviewed fields unavailable</button></>}>
    <Block label="Suggestions" tag="REVIEW 4">
      <div className="shared-workflow-suggestions">{suggestions.map(([field, value, source]) => {
        const status = review[field] ?? "pending";
        return <article className="shared-workflow-suggestion" key={field}>
          <header><strong>{field}</strong><span>SUGGESTED</span></header><p>{value}</p><small>{source}</small>
          <div><button type="button" aria-pressed={status === "accepted"} onClick={() => setReview((current) => ({ ...current, [field]: "accepted" }))}>Accept {field} suggestion</button><button type="button" aria-pressed={status === "rejected"} onClick={() => setReview((current) => ({ ...current, [field]: "rejected" }))}>Reject {field} suggestion</button></div>
          <b>{status === "accepted" ? "Accepted locally for review" : status === "rejected" ? "Rejected locally" : "Awaiting review"}</b>
        </article>;
      })}</div>
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
  returnFocus: HTMLElement | null;
  onClose(): void;
}

export function SharedLibraryWorkflows(props: SharedLibraryWorkflowsProps) {
  if (props.kind === "add") return <AddWorkflow {...props} />;
  if (props.kind === "promote") return <PromoteWorkflow {...props} />;
  if (props.kind === "duplicate") return <DuplicateWorkflow {...props} />;
  if (props.kind === "suggestions") return <SuggestionsWorkflow {...props} />;
  if (props.kind === "archive") return <ArchiveWorkflow {...props} />;
  return <UpdateReviewWorkflow {...props} />;
}

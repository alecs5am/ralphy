import * as Dialog from "@radix-ui/react-dialog";
import { CheckCircle2, CircleAlert, Download, LoaderCircle, X } from "lucide-react";
import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import type { CatalogResult } from "../../lib/ipc";
import type { WorkbenchRoute } from "../../state/workbench";

export type MarketplaceWorkflowKind =
  | "model-download"
  | "template-target"
  | "recipe-target"
  | "prompt-use"
  | "component-target"
  | "skill-install"
  | "update-conflict";

export interface MarketplaceProjectTargetOption {
  id: string;
  kind: "project";
  label: string;
  contextLabel: string;
  current: boolean;
  compatible: true;
  compatibilityBasis: "project-target";
}

export interface MarketplaceUnavailableTargetScope {
  kind: "chat" | "agent" | "computer";
  label: string;
  reason: string;
}

export interface MarketplaceWorkflowTargets {
  workflow: MarketplaceWorkflowKind;
  projectOptions: MarketplaceProjectTargetOption[];
  unavailableScopes: MarketplaceUnavailableTargetScope[];
  contextProjectLabel: string | null;
  targetUnavailableReason: string | null;
}

export function marketplaceTargets(
  catalog: CatalogResult | null,
  current: WorkbenchRoute,
  kind: MarketplaceWorkflowKind,
): MarketplaceWorkflowTargets {
  const workspaceNames = new Map((catalog?.workspaces ?? []).map((workspace) => [workspace.id, workspace.name]));
  const namedProjects = (catalog?.projects ?? []).flatMap((project) => {
    const workspaceName = workspaceNames.get(project.workspaceId);
    return workspaceName ? [{
      id: project.projectId,
      kind: "project" as const,
      label: project.name,
      contextLabel: `${workspaceName} / ${project.name}`,
      current: current.kind === "project" && current.workspaceId === project.workspaceId && current.projectId === project.projectId,
      compatible: true as const,
      compatibilityBasis: "project-target" as const,
    }] : [];
  });
  const currentProject = current.kind === "project"
    ? namedProjects.find(({ id }) => id === current.projectId)?.contextLabel ?? null
    : null;

  if (kind === "template-target" || kind === "recipe-target" || kind === "component-target") {
    return {
      workflow: kind,
      projectOptions: namedProjects,
      unavailableScopes: [],
      contextProjectLabel: null,
      targetUnavailableReason: namedProjects.length ? null : "No named project targets are available",
    };
  }
  if (kind === "model-download") return {
    workflow: kind,
    projectOptions: [],
    unavailableScopes: [{
      kind: "computer",
      label: "Computer/runtime",
      reason: "Computer and runtime targets cannot be enumerated by the current Desktop contract",
    }],
    contextProjectLabel: null,
    targetUnavailableReason: null,
  };
  if (kind === "prompt-use") return {
    workflow: kind,
    projectOptions: [],
    unavailableScopes: [{
      kind: "chat",
      label: "Chat",
      reason: "Chat targets cannot be enumerated or attached by the current Desktop contract",
    }],
    contextProjectLabel: null,
    targetUnavailableReason: null,
  };
  if (kind === "skill-install") return {
    workflow: kind,
    projectOptions: [],
    unavailableScopes: [{
      kind: "agent",
      label: "Agent",
      reason: "Agent targets and installation scopes cannot be enumerated by the current Desktop contract",
    }],
    contextProjectLabel: currentProject,
    targetUnavailableReason: null,
  };
  return {
    workflow: kind,
    projectOptions: [],
    unavailableScopes: [],
    contextProjectLabel: null,
    targetUnavailableReason: "Update target is unavailable without persistent installed-version and local-modification state",
  };
}

function TargetList({ targets }: { targets: MarketplaceWorkflowTargets }) {
  const [selected, setSelected] = useState(() => targets.projectOptions.find(({ current }) => current)?.id ?? null);
  return <section className="marketplace-target-list" aria-labelledby="marketplace-target-list-title">
    <h3 id="marketplace-target-list-title">Target</h3>
    {targets.contextProjectLabel && <p>Current project context · {targets.contextProjectLabel}</p>}
    {targets.projectOptions.length > 0 && <div role="group" aria-label="Named project targets">
      {targets.projectOptions.map((option) => <button
        key={option.id}
        type="button"
        aria-pressed={selected === option.id}
        onClick={() => setSelected(option.id)}
      ><span>{option.contextLabel}</span><small>{option.current ? "Current project · project target" : "Project target"}</small></button>)}
    </div>}
    {targets.unavailableScopes.map((scope) => <button
      key={scope.kind}
      type="button"
      aria-disabled="true"
      aria-describedby={`marketplace-${targets.workflow}-${scope.kind}-reason`}
    ><span>{scope.label}</span><small id={`marketplace-${targets.workflow}-${scope.kind}-reason`}>{scope.reason}</small></button>)}
    {targets.targetUnavailableReason && <p role="status">{targets.targetUnavailableReason}</p>}
  </section>;
}

interface WorkflowFrameProps {
  kind: MarketplaceWorkflowKind;
  title: string;
  description: string;
  onCancel(): void;
  children: ReactNode;
  finalLabel: string;
  finalReason: string;
}

function WorkflowContents({ kind, title, description, onCancel, children, finalLabel, finalReason }: WorkflowFrameProps) {
  const titleId = useId();
  const descriptionId = useId();
  const reasonId = useId();
  return <div
    className="marketplace-workflow-window"
    data-workflow={kind}
    role="dialog"
    aria-modal="true"
    aria-labelledby={titleId}
    aria-describedby={descriptionId}
  >
    <header className="marketplace-workflow-header"><div><h2 id={titleId}>{title}</h2><p id={descriptionId}>{description}</p></div><button type="button" aria-label={`Close ${title}`} onClick={onCancel}><X aria-hidden="true" /></button></header>
    <div className="marketplace-workflow-body">{children}</div>
    <footer className="marketplace-workflow-footer"><small id={reasonId}>{finalReason} The final action is disabled.</small><button type="button" aria-disabled="true" aria-describedby={reasonId}>{finalLabel}</button></footer>
  </div>;
}

function WorkflowFrame(props: WorkflowFrameProps) {
  const returnFocus = useRef(typeof document === "undefined" ? null : document.activeElement as HTMLElement | null);
  const restoreFocus = useCallback(() => {
    if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
  }, []);
  const close = useCallback(() => {
    props.onCancel();
    queueMicrotask(restoreFocus);
  }, [props.onCancel, restoreFocus]);
  if (typeof document === "undefined") return <WorkflowContents {...props} onCancel={close} />;
  return <Dialog.Root open onOpenChange={(open) => { if (!open) close(); }}>
    <Dialog.Portal container={document.body}>
      <Dialog.Overlay className="marketplace-workflow-overlay" onClick={close} />
      <Dialog.Content
        className="marketplace-workflow-window"
        data-workflow={props.kind}
        onClick={(event) => event.stopPropagation()}
        onCloseAutoFocus={(event) => { event.preventDefault(); restoreFocus(); }}
      >
        <header className="marketplace-workflow-header"><div><Dialog.Title>{props.title}</Dialog.Title><Dialog.Description>{props.description}</Dialog.Description></div><button type="button" aria-label={`Close ${props.title}`} onClick={close}><X aria-hidden="true" /></button></header>
        <div className="marketplace-workflow-body">{props.children}</div>
        <footer className="marketplace-workflow-footer"><small id="marketplace-workflow-final-reason">{props.finalReason} The final action is disabled.</small><button type="button" aria-disabled="true" aria-describedby="marketplace-workflow-final-reason">{props.finalLabel}</button></footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

export interface MarketplaceTargetChooserProps {
  targets: MarketplaceWorkflowTargets;
  onCancel(): void;
}

export function MarketplaceTargetChooser({ targets, onCancel }: MarketplaceTargetChooserProps) {
  return <WorkflowFrame
    kind={targets.workflow}
    title="Choose a target"
    description="Only targets returned by the current Desktop catalog are shown. Nothing is changed by this review."
    onCancel={onCancel}
    finalLabel="Continue unavailable"
    finalReason="A final action plan is unavailable from the current contract."
  ><TargetList targets={targets} /></WorkflowFrame>;
}

function ReviewField({ label, children }: { label: string; children: string }) {
  return <section className="marketplace-review-field"><h3>{label}</h3><p>{children}</p></section>;
}

function ReviewFields({ kind }: { kind: MarketplaceWorkflowKind }) {
  if (kind === "model-download") return <>
    <ReviewField label="Compatibility preflight">Machine fit remains the evidence shown on the Model detail; no new compatibility claim is made here.</ReviewField>
    <ReviewField label="License and access">Provider license and access evidence must be reviewed before any package can be fetched.</ReviewField>
    <ReviewField label="Download plan">Files, destination, expected bytes, checksum, and resumable job state are unavailable.</ReviewField>
    <ReviewField label="Runtime installation">Runtime registration is unavailable without a download and installation contract.</ReviewField>
    <ReviewField label="Load test">A successful runtime load test is required before Installed can be claimed.</ReviewField>
  </>;
  if (kind === "template-target") return <>
    <ReviewField label="Project target">Only a named project target can be selected.</ReviewField>
    <ReviewField label="Pinned version">Version evidence is unavailable from public-library schema 1.</ReviewField>
    <ReviewField label="What will be added">Scene structure, files, references, and conflicts require a Core mutation plan.</ReviewField>
  </>;
  if (kind === "recipe-target") return <>
    <ReviewField label="Project target">Only a named project target can be selected.</ReviewField>
    <ReviewField label="Artifact and parameters">The exact source artifact remains inert until a conflict-safe apply plan exists.</ReviewField>
    <ReviewField label="Apply plan">Files, Unit changes, tools, costs, and conflicts are unavailable without a Core mutation contract.</ReviewField>
  </>;
  if (kind === "prompt-use") return <>
    <ReviewField label="Chat target">Chat targets cannot be enumerated by the current Desktop contract.</ReviewField>
    <ReviewField label="Prompt body and variables">No production Prompt record or variables are available without a Prompt catalog contract.</ReviewField>
  </>;
  if (kind === "component-target") return <>
    <ReviewField label="Project target">Only a named project target can be selected.</ReviewField>
    <ReviewField label="Package files">A Component manifest and file plan are unavailable.</ReviewField>
    <ReviewField label="Dependencies">Runtime and package dependencies require a Component manifest contract.</ReviewField>
    <ReviewField label="Controls and accessibility">Control and accessibility evidence are unavailable without reviewed Component contracts.</ReviewField>
  </>;
  if (kind === "skill-install") return <>
    <ReviewField label="Bundle">Bundle membership and version pins are unavailable without a Skill manifest contract.</ReviewField>
    <ReviewField label="Agent target">Agent targets cannot be enumerated by the current Desktop contract.</ReviewField>
    <ReviewField label="Scope">User and project installation scopes are unavailable.</ReviewField>
    <ReviewField label="Installation mode">Copy or symlink behavior is unavailable.</ReviewField>
    <ReviewField label="Files">SKILL.md, references/, scripts/, and supporting files require a bundle manifest.</ReviewField>
    <ReviewField label="Tools and shell">Declared tools and shell access require a permission manifest.</ReviewField>
    <ReviewField label="Network">Allowed hosts and network use require a permission manifest.</ReviewField>
    <ReviewField label="Credentials">Credential names and access boundaries require a permission manifest.</ReviewField>
  </>;
  return <>
    <ReviewField label="Current version">Current installed version is unavailable without persistent installed-version state.</ReviewField>
    <ReviewField label="Proposed version">Proposed version and change history are unavailable without a persistent update contract.</ReviewField>
    <ReviewField label="Local modifications">Local modification evidence is unavailable without persistent hash and modification state.</ReviewField>
    <div className="marketplace-update-choices" role="group" aria-label="Unavailable conflict choices">
      {[["Keep current", "Keep the current pinned version"], ["Fork local", "Preserve local changes as a derivative"], ["Replace local", "Replace only after explicit confirmation"]].map(([label, note]) => <button key={label} type="button" aria-disabled="true"><span>{label}</span><small>{note} · unavailable</small></button>)}
    </div>
  </>;
}

function reviewCopy(kind: MarketplaceWorkflowKind) {
  if (kind === "model-download") return ["Model download and install review", "Review machine evidence before any download or runtime change.", "Download unavailable", "Download and installation are unavailable without persistent jobs and a guarded install contract."] as const;
  if (kind === "template-target") return ["Template project review", "Review the named project and proposed Template changes.", "Start project unavailable", "Adding is unavailable without a Core mutation contract."] as const;
  if (kind === "recipe-target") return ["Recipe apply review", "Review the named project and exact Recipe artifact before applying.", "Apply unavailable", "Applying is unavailable without a Core mutation contract."] as const;
  if (kind === "prompt-use") return ["Prompt use-in-chat review", "Review the Prompt and named Chat target without executing it.", "Use in chat unavailable", "Use in chat is unavailable without target enumeration and attachment contracts."] as const;
  if (kind === "component-target") return ["Component project review", "Review the named project, package, dependencies, and controls.", "Add component unavailable", "Adding is unavailable without a Core mutation contract."] as const;
  if (kind === "skill-install") return ["Skill install review", "Previewing a Skill never executes it; review the full security boundary.", "Install unavailable", "Installation is unavailable without agent targets, bundle manifests, permissions, and installation contracts."] as const;
  return ["Update and conflict review", "Review version and local-modification evidence before choosing a resolution.", "Update unavailable", "Update resolution is unavailable without persistent installed-version and local-modification state."] as const;
}

export interface MarketplaceActionReviewProps {
  kind: MarketplaceWorkflowKind;
  targets: MarketplaceWorkflowTargets;
  itemLabel: string | null;
  onCancel(): void;
}

export function MarketplaceActionReview({ kind, targets, itemLabel, onCancel }: MarketplaceActionReviewProps) {
  const [title, description, finalLabel, finalReason] = reviewCopy(kind);
  return <WorkflowFrame kind={kind} title={itemLabel ? `${title} · ${itemLabel}` : title} description={description} onCancel={onCancel} finalLabel={finalLabel} finalReason={finalReason}>
    <TargetList targets={targets} />
    <div className="marketplace-review-fields"><ReviewFields kind={kind} /></div>
    <p className="marketplace-review-save-state">Saving is unavailable without a persistent saved-state contract.</p>
  </WorkflowFrame>;
}

export type MarketplaceDownloadPresentation =
  | { availability: "unavailable"; reason: string }
  | { availability: "ready"; jobs: { id: string; label: string; state: "active" | "failed" | "completed"; progress: number | null; nextAction: string }[] };

const downloadGroups = [
  ["active", "Active"],
  ["failed", "Needs attention"],
  ["completed", "Completed"],
] as const;

export function MarketplaceDownloads({ presentation }: { presentation: MarketplaceDownloadPresentation }) {
  if (presentation.availability === "unavailable") return <section className="marketplace-library-unavailable" role="status"><Download aria-hidden="true" /><h2>Downloads</h2><p>{presentation.reason}</p><small>No zero count is inferred.</small></section>;
  return <section className="marketplace-downloads" aria-labelledby="marketplace-downloads-title">
    <h2 id="marketplace-downloads-title">Downloads</h2>
    {downloadGroups.map(([state, label]) => {
      const jobs = presentation.jobs.filter((job) => job.state === state);
      return <section key={state} aria-labelledby={`marketplace-download-${state}`}><h3 id={`marketplace-download-${state}`}>{label}</h3>
        {jobs.length === 0 ? <p>No jobs in this supplied presentation.</p> : <ul role="list">{jobs.map((job) => <li key={job.id}>
          {job.state === "active" ? <LoaderCircle aria-hidden="true" /> : job.state === "failed" ? <CircleAlert aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
          <span><strong>{job.label}</strong><small>{job.nextAction}</small></span>
          {job.progress === null ? <em>Progress unavailable</em> : <progress max={100} value={Math.max(0, Math.min(100, job.progress))} aria-label={`${job.label} download progress: ${job.progress}%`}>{job.progress}%</progress>}
        </li>)}</ul>}
      </section>;
    })}
  </section>;
}

export function MarketplaceUpdateConflictReview() {
  return <section className="marketplace-update-review" aria-labelledby="marketplace-update-review-title">
    <h2 id="marketplace-update-review-title">Update and conflict review</h2>
    <p>Update target is unavailable without persistent installed-version and local-modification state.</p>
    <div className="marketplace-review-fields"><ReviewFields kind="update-conflict" /></div>
    <p>Update resolution is unavailable without persistent installed-version and local-modification state. The final action is disabled.</p>
  </section>;
}

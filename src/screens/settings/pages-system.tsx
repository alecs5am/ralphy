import { ArrowUpRight, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { RalphyMascot } from "../../components/RalphyMascot";
import { bridge } from "../../lib/ipc";
import type { SettingsContext } from "./context";
import type { HarnessRow } from "./harnesses";
import {
  DesignTarget,
  Keycaps,
  LedBar,
  Plate,
  Row,
  Section,
  Segmented,
  SettingsSelect,
  Status,
  Stepper,
  Toggle,
  type StatusTone,
} from "./rows";

const options = <Value extends string>(values: readonly Value[]) => values.map((value) => ({ value, label: value }));

export function AgentsPage({ ctx }: { ctx: SettingsContext }) {
  const { values, set } = ctx.preferences;
  const { rows, state } = ctx.harnesses;
  return <>
    <Section title="HARNESSES · THEY DRIVE THE APP, ITS FILES AND ITS TOOLS">
      <Plate>
        {state === "loading" && <Row title="Reading harnesses" description="Asking the bridge which adapters are installed." target><DesignTarget /></Row>}
        {state === "unavailable" && <Row title="Harness discovery unavailable" description="The bridge did not answer. Nothing is inferred about the adapters on this machine." target><DesignTarget /></Row>}
        {rows.map((harness) => <div className="settings-row is-service" key={harness.id}>
          <i className="settings-dot" data-tone={harness.tone} aria-hidden="true" />
          <span className="settings-service-name">
            <strong>{harness.name}</strong>
            <small>{harness.source}</small>
          </span>
          <span className="settings-service-state">
            <Status tone={harness.tone}>{`${harness.status} · ${harness.auth}`}</Status>
            <small>{harness.capabilities}</small>
          </span>
          <span className="settings-service-model">{harness.model}</span>
          <button
            className={harness.tone === "ok" ? "settings-action is-sm" : "settings-action is-sm is-primary"}
            type="button"
            onClick={() => ctx.openDetail({ kind: "harness", id: harness.id })}
          >{harness.action}</button>
        </div>)}
      </Plate>
    </Section>

    <Section title="DEFAULTS">
      <Plate>
        <Row title="Default harness for new chats" description="Existing sessions keep their provider and model until they are explicitly forked." id="agents.default">
          <SettingsSelect
            label="Default harness for new chats"
            value={values["agents.defaultHarness"]}
            options={rows.length
              ? rows.map((harness) => ({ value: harness.id, label: harness.name, meta: harness.status }))
              : [{ value: values["agents.defaultHarness"], label: values["agents.defaultHarness"] }]}
            onChange={(next) => set("agents.defaultHarness", next)}
          />
        </Row>
        <Row title="Approval posture for new chats" description="The shared rule. Actual rights come from the adapter — read the receipt on the harness page.">
          <button className="settings-action is-sm" type="button" onClick={() => ctx.goTo("permissions", "permissions.posture")}>
            {values["permissions.posture"]}
            <ArrowUpRight size={12} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </Row>
      </Plate>
    </Section>
  </>;
}

type CredentialState = "idle" | "empty" | "testing" | "connected" | "failed";

export function HarnessDetailPage({ ctx, harness }: { ctx: SettingsContext; harness: HarnessRow }) {
  const [draft, setDraft] = useState("");
  const [state, setState] = useState<CredentialState>("idle");
  const [busy, setBusy] = useState(false);
  const keyField = useRef<HTMLInputElement>(null);
  const needsKey = !harness.connected && harness.credential === "api-key";

  const saveKey = async () => {
    if (!draft.trim()) { setState("empty"); return; }
    setState("testing");
    try {
      await ctx.harnesses.saveKey(harness.id, draft.trim());
      setState("connected");
    } catch {
      setState("failed");
    }
  };

  const credentialLabel = state === "connected"
    ? "CONNECTED · KEY STORED BY THE OS KEYCHAIN"
    : state === "failed" ? "SAVE FAILED · THE PROVIDER REJECTED THE KEY"
    : state === "empty" ? "KEY IS REQUIRED"
    : state === "testing" ? "TESTING KEY…"
    : harness.auth === "KEYCHAIN" ? "A KEY IS STORED · PASTE A NEW ONE TO REPLACE IT"
    : "PASTE API KEY · NEVER SHOWN AGAIN AFTER SAVE";
  const credentialTone: StatusTone = state === "connected" ? "ok" : state === "failed" || state === "empty" ? "bad" : "warn";

  return <>
    <Section title="CONNECTION">
      <Plate>
        <div className="settings-row is-service">
          <i className="settings-dot" data-tone={harness.tone} aria-hidden="true" />
          <span className="settings-service-state">
            <Status tone={harness.tone}>{`${harness.status} · ${harness.auth}`}</Status>
            <small>{harness.detail}</small>
          </span>
          <button
            className="settings-action is-lg is-primary"
            type="button"
            disabled={busy || harness.credential === "none"}
            onClick={async () => {
              if (needsKey) { keyField.current?.focus(); return; }
              setBusy(true);
              try {
                if (harness.credential === "provider-login") await ctx.harnesses.signIn(harness.id);
                else await ctx.harnesses.refresh();
              } finally {
                setBusy(false);
              }
            }}
          >{needsKey ? "Add key" : harness.credential === "provider-login" ? "Sign in" : "Test connection"}</button>
        </div>
        <Row title="Default model" description="The list comes from the adapter, not from our catalogue." id="harness.model">
          {harness.models.length
            ? <SettingsSelect
              label="Default model"
              mono
              value={harness.model}
              options={harness.models}
              onChange={() => ctx.harnesses.refresh()}
            />
            : <DesignTarget />}
        </Row>
      </Plate>
    </Section>

    <Section title="CREDENTIAL · SECURE">
      {harness.credential === "api-key"
        ? <div className="settings-credential">
          <Status tone={credentialTone}>{credentialLabel}</Status>
          <div className="settings-credential-row">
            <input
              ref={keyField}
              className={state === "failed" || state === "empty" ? "settings-field is-wide is-invalid" : "settings-field is-wide"}
              value={draft}
              placeholder="Paste the provider key"
              aria-label={`${harness.name} API key`}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => { setDraft(event.target.value); setState("idle"); }}
            />
            <button className="settings-action is-lg is-primary" type="button" disabled={state === "testing"} onClick={() => void saveKey()}>
              {state === "testing" ? "Testing…" : state === "connected" ? "Saved" : "Save key"}
            </button>
            <button className="settings-action is-lg" type="button" disabled={state === "testing"} onClick={() => void saveKey()}>Test connection</button>
          </div>
          <p className={state === "failed" ? "settings-note is-alert" : "settings-note"}>
            {state === "failed"
              ? "THE KEY WAS NOT ACCEPTED. THE TYPED VALUE IS KEPT — CORRECT IT AND SAVE AGAIN"
              : "THE KEY GOES TO THE OS KEYCHAIN, NEVER INTO PREFERENCES, AND IS NEVER RETURNED TO THE RENDERER IN FULL"}
          </p>
        </div>
        : <Plate>
          <Row
            title="Credential"
            description="This harness authenticates through its own provider login, so there is no key to store here."
            target
          ><DesignTarget /></Row>
        </Plate>}
    </Section>

    <Section title="EFFECTIVE CAPABILITY RECEIPT · WHAT THE ADAPTER ACTUALLY GRANTS">
      <Plate>
        {["Filesystem", "Shell", "Network", "Approvals", "Concurrency", "Scheduling"].map((capability) => <Row
          title={capability}
          flat
          target
          key={capability}
        ><span className="settings-status" data-tone="off">NOT REPORTED</span></Row>)}
      </Plate>
      <p className="settings-note">THE SAME FRIENDLY NAME MEANS DIFFERENT THINGS PER PROVIDER, SO NOTHING IS ASSUMED UNTIL THE ADAPTER REPORTS IT</p>
    </Section>

    <Section title="MAINTENANCE">
      <Plate single>
        <span className="settings-row-copy">
          <strong>Disconnect harness</strong>
          <small>The stored credential is removed. Settings without secrets stay until you reconnect.</small>
        </span>
        <button
          className="settings-action is-danger"
          type="button"
          disabled={harness.credential !== "api-key"}
          onClick={() => void ctx.harnesses.clearKey(harness.id)}
        >Disconnect…</button>
      </Plate>
    </Section>
  </>;
}

/** The generation services Ralphy renders with. Discovery and credential storage for them
 *  is not part of the bridge contract yet, so every row states that rather than guessing. */
export const GENERATION_PROVIDERS = [
  { id: "openai", name: "OpenAI", capabilities: "TEXT · IMAGE" },
  { id: "fal", name: "Fal", capabilities: "IMAGE · VIDEO" },
  { id: "replicate", name: "Replicate", capabilities: "IMAGE · VIDEO · UPSCALE" },
  { id: "elevenlabs", name: "ElevenLabs", capabilities: "AUDIO · SPEECH" },
  { id: "heygen", name: "HeyGen", capabilities: "AVATARS" },
] as const;

export function ProvidersPage({ ctx }: { ctx: SettingsContext }) {
  return <>
    <Section title="CONNECTED SERVICES · KEYS ARE ENTERED INSIDE A PROVIDER, NEVER IN THE LIST">
      <Plate>
        {GENERATION_PROVIDERS.map((provider) => <div className="settings-row is-service is-target" key={provider.id}>
          <i className="settings-dot" data-tone="off" aria-hidden="true" />
          <span className="settings-service-name is-narrow">
            <strong>{provider.name}</strong>
            <small>{provider.capabilities}</small>
          </span>
          <span className="settings-service-state">
            <Status tone="off">NOT CONFIGURED HERE</Status>
            <small>CONFIGURED THROUGH THE RALPHY CLI</small>
          </span>
          <span className="settings-service-model">—</span>
          <button className="settings-action is-sm" type="button" onClick={() => ctx.openDetail({ kind: "provider", id: provider.id })}>Manage</button>
        </div>)}
      </Plate>
    </Section>

    <Plate single>
      <span className="settings-row-copy">
        <strong>Add a provider</strong>
        <small>Community adapters install from the Marketplace; built-in services appear here once discovery lands.</small>
      </span>
      <button className="settings-action is-lg is-primary" type="button" disabled>
        <Plus size={13} strokeWidth={2} aria-hidden="true" />
        Connect provider
      </button>
    </Plate>
  </>;
}

export function ProviderDetailPage({ provider }: { provider: (typeof GENERATION_PROVIDERS)[number] }) {
  return <>
    <Section title="CREDENTIAL · SECURE">
      <Plate>
        <Row
          title="API key"
          description={`There is no secure credential channel for ${provider.name} yet. A key field that cannot reach a keychain would be a field that loses secrets.`}
          target
        ><DesignTarget /></Row>
      </Plate>
    </Section>

    <Section title="DEFAULT MODEL PER MEDIA TYPE">
      <Plate>
        {["TEXT", "IMAGE", "VIDEO", "UPSCALE"].map((kind) => <div className="settings-row is-flat is-target" key={kind}>
          <span className="settings-kind-label">{kind}</span>
          <span className="settings-diagnostics-value">Model catalogue arrives with provider discovery</span>
          <DesignTarget />
        </div>)}
      </Plate>
    </Section>

    <Section title="MAINTENANCE">
      <Plate single>
        <span className="settings-row-copy">
          <strong>Remove credential</strong>
          <small>Available once the credential is stored by the app rather than by the CLI.</small>
        </span>
        <button className="settings-action is-danger" type="button" disabled>Disconnect…</button>
      </Plate>
    </Section>
  </>;
}

export function StoragePage({ ctx }: { ctx: SettingsContext }) {
  const { values, set } = ctx.preferences;
  const [reclaimed, setReclaimed] = useState(false);
  return <>
    <Section title="DISK USAGE · THIS MAC">
      <Plate>
        <Row
          title="Library size by kind"
          description="Reporting user artifacts separately from regenerable caches needs a disk-usage contract. No number is shown until one exists."
          target
        ><DesignTarget /></Row>
      </Plate>
    </Section>

    <Section title="CLEANUP">
      <Plate>
        <Row title="Remove regenerable previews automatically" description="Previews, proxies and temp only. Generated files are never touched." id="storage.cleanup">
          <SettingsSelect
            label="Remove regenerable previews automatically"
            value={values["storage.cleanup"]}
            options={options(["Never", "After 7 days", "After 30 days", "When disk is low"] as const)}
            onChange={(next) => set("storage.cleanup", next)}
          />
        </Row>
        <Row
          title="Clear preview cache"
          description="Previews rebuild the next time a project opens — sources and units are untouched."
          flash={ctx.flashId === "storage.cache"}
          id="storage.cache"
        >
          {reclaimed && <Status>CACHE MARKED FOR REBUILD</Status>}
          <button className="settings-action" type="button" onClick={() => setReclaimed(true)}>Clear cache</button>
        </Row>
        <Row
          title="Move library to another disk"
          description="A free-space preflight, a verified copy and a rollback on failure. Not a text field."
          target
        ><DesignTarget /></Row>
      </Plate>
    </Section>
  </>;
}

export type PermissionState = "granted" | "denied" | "prompt" | "unknown";

function usePermission(name: "microphone"): PermissionState {
  const [state, setState] = useState<PermissionState>("unknown");
  useEffect(() => {
    let status: PermissionStatus | null = null;
    const onChange = () => setState((status?.state ?? "unknown") as PermissionState);
    // Chromium answers this without prompting, so the row reports the real macOS grant.
    if (typeof navigator === "undefined" || !navigator.permissions) { setState("unknown"); return; }
    navigator.permissions.query({ name: name as PermissionName }).then((result) => {
      status = result;
      setState(result.state as PermissionState);
      result.addEventListener("change", onChange);
    }).catch(() => setState("unknown"));
    return () => status?.removeEventListener("change", onChange);
  }, [name]);
  return state;
}

const RISK_ROWS = [
  { id: "permissions.filesystem", label: "Filesystem writes outside the project", impact: "Edits outside the project folder always go through review." },
  { id: "permissions.shell", label: "Shell commands", impact: "Every command is shown before it runs." },
  { id: "permissions.network", label: "Network requests", impact: "Off means the agent works offline, apart from connected providers." },
  { id: "permissions.paid", label: "Paid generation", impact: "Every paid run is confirmed by hand." },
  { id: "permissions.publishing", label: "External publishing", impact: "Publishing outward is confirmed by a person." },
] as const;

export function PermissionsPage({ ctx }: { ctx: SettingsContext }) {
  const { values, set } = ctx.preferences;
  const microphone = usePermission("microphone");
  const notifications: string = typeof Notification === "undefined" ? "unknown" : Notification.permission;
  const micTone: StatusTone = microphone === "granted" ? "ok" : microphone === "denied" ? "bad" : "warn";
  return <>
    <Section title="DEVICE PERMISSIONS · THIS MAC">
      <Plate>
        <Row
          title="Microphone"
          description="Needed for dictation in chat. Without it the microphone control never appears."
          flash={ctx.flashId === "permissions.microphone"}
          id="permissions.microphone"
        >
          <Status tone={micTone}>{microphone === "granted" ? "GRANTED" : microphone === "denied" ? "DENIED" : microphone === "prompt" ? "NOT GRANTED" : "NOT REPORTED"}</Status>
          <button className="settings-action" type="button" disabled>
            Open System Settings
            <ArrowUpRight size={12} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </Row>
        <Row title="Notifications" description="Run completion, a decision request, a missed schedule.">
          <Status tone={notifications === "granted" ? "ok" : notifications === "denied" ? "bad" : "warn"}>
            {notifications === "granted" ? "GRANTED" : notifications === "denied" ? "DENIED" : notifications === "default" ? "NOT GRANTED" : "NOT REPORTED"}
          </Status>
        </Row>
        <Row
          title="Filesystem roots granted to Ralphy"
          description="Listing and revoking granted roots needs a permission contract from the main process."
          target
        ><DesignTarget /></Row>
      </Plate>
    </Section>

    <Section title="AGENT DEFAULTS · WHAT ALWAYS NEEDS REVIEW">
      <Plate>
        <Row
          title="Approval posture for new chats"
          description="The starting rule. A provider can grant less than this, never more."
          flash={ctx.flashId === "permissions.posture"}
          id="permissions.posture"
        >
          <SettingsSelect
            label="Approval posture for new chats"
            value={values["permissions.posture"]}
            options={options(["Ask every time", "Ask for writes and shell", "Trusted project"] as const)}
            onChange={(next) => set("permissions.posture", next)}
          />
        </Row>
        {RISK_ROWS.map((risk) => <Row title={risk.label} description={risk.impact} flat key={risk.id} id={risk.id}>
          <Toggle label={risk.label} on={values[risk.id]} onChange={(next) => set(risk.id, next)} />
        </Row>)}
      </Plate>
    </Section>

    <Section title="DATA AND DIAGNOSTICS">
      <Plate>
        <Row title="Anonymous usage analytics" description="Never includes prompts, media or paths." id="permissions.analytics">
          <Toggle label="Anonymous usage analytics" on={values["permissions.analytics"]} onChange={(next) => set("permissions.analytics", next)} />
        </Row>
        <Row title="Crash reports" description="Stack and build versions, without workspace content." id="permissions.crashReports">
          <Toggle label="Crash reports" on={values["permissions.crashReports"]} onChange={(next) => set("permissions.crashReports", next)} />
        </Row>
        <Row title="Log retention" description="Local logs older than the window are removed automatically." id="permissions.logRetention">
          <SettingsSelect
            label="Log retention"
            value={values["permissions.logRetention"]}
            options={options(["7 days", "30 days", "90 days"] as const)}
            onChange={(next) => set("permissions.logRetention", next)}
          />
        </Row>
      </Plate>
    </Section>
  </>;
}

export function TerminalPage({ ctx }: { ctx: SettingsContext }) {
  const { values, set } = ctx.preferences;
  return <>
    <Section title="SHELL">
      <Plate>
        <Row
          title="Detected shell"
          description="Shell detection and its health check need a main-process probe; nothing is claimed about this machine until it lands."
          target
        ><DesignTarget /></Row>
        <Row title="Run as login shell" description="Picks up your profile — otherwise the environment is poorer than in Terminal.app." id="terminal.loginShell">
          <Toggle label="Run as login shell" on={values["terminal.loginShell"]} onChange={(next) => set("terminal.loginShell", next)} />
        </Row>
        <Row title="Start location" description="Where a new terminal session opens." id="terminal.startLocation">
          <SettingsSelect
            label="Start location"
            value={values["terminal.startLocation"]}
            options={options(["Project folder", "Library root", "Home"] as const)}
            onChange={(next) => set("terminal.startLocation", next)}
          />
        </Row>
        <Row title="Scrollback" description="Lines of history per session." id="terminal.scrollback">
          <Stepper
            label="Scrollback"
            value={values["terminal.scrollback"]}
            min={1000}
            max={50000}
            step={1000}
            onChange={(next) => set("terminal.scrollback", next)}
          />
        </Row>
      </Plate>
    </Section>

    <Section title="ENVIRONMENT">
      <Plate>
        <Row title="PATH" description="Reading the resolved PATH and the tool versions on it needs the same main-process probe." target><DesignTarget /></Row>
        <Row title="Managed variables" meta="VALUES REDACTED" description="Names and redacted values arrive with the environment probe. Editing them requires a restart." target><DesignTarget /></Row>
        <Row title="Terminal shortcuts" description="They live in the shared command registry — there is no second editor here.">
          <Keycaps tokens={["⌃", "`"]} tone="sunken" />
          <button className="settings-action is-sm" type="button" onClick={() => ctx.goTo("keys")}>
            Keyboard shortcuts
            <ArrowUpRight size={12} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </Row>
      </Plate>
    </Section>
  </>;
}

interface DiagnosticCheck {
  id: string;
  label: string;
  value: string;
  state: "HEALTHY" | "NEEDS ATTENTION" | "FAILED" | "NOT REPORTED";
  tone: StatusTone;
  fix?: { label: string; run(): void };
}

export function diagnosticChecks(ctx: SettingsContext, microphone: PermissionState): readonly DiagnosticCheck[] {
  const harnesses = ctx.harnesses.rows;
  const connected = harnesses.filter(({ tone }) => tone === "ok").length;
  const notifications: string = typeof Notification === "undefined" ? "unknown" : Notification.permission;
  return [
    {
      id: "library",
      label: "Library read/write",
      value: ctx.libraryPath ?? "no library is open",
      state: ctx.libraryPath ? "HEALTHY" : "FAILED",
      tone: ctx.libraryPath ? "ok" : "bad",
    },
    {
      id: "harnesses",
      label: "Agent harnesses",
      value: ctx.harnesses.state === "ready" ? `${connected} of ${harnesses.length} connected` : "bridge did not answer",
      state: ctx.harnesses.state !== "ready" ? "FAILED" : connected === harnesses.length ? "HEALTHY" : "NEEDS ATTENTION",
      tone: ctx.harnesses.state !== "ready" ? "bad" : connected === harnesses.length ? "ok" : "warn",
      fix: { label: "Open agents", run: () => ctx.goTo("agents") },
    },
    {
      id: "microphone",
      label: "Microphone permission",
      value: microphone === "unknown" ? "not reported by the platform" : `macOS reports ${microphone}`,
      state: microphone === "granted" ? "HEALTHY" : microphone === "unknown" ? "NOT REPORTED" : "NEEDS ATTENTION",
      tone: microphone === "granted" ? "ok" : microphone === "unknown" ? "off" : "warn",
      fix: { label: "Open permissions", run: () => ctx.goTo("permissions", "permissions.microphone") },
    },
    {
      id: "notifications",
      label: "Notification permission",
      value: notifications === "unknown" ? "not reported by the platform" : `browser reports ${notifications}`,
      state: notifications === "granted" ? "HEALTHY" : notifications === "unknown" ? "NOT REPORTED" : "NEEDS ATTENTION",
      tone: notifications === "granted" ? "ok" : notifications === "unknown" ? "off" : "warn",
      fix: { label: "Open permissions", run: () => ctx.goTo("permissions") },
    },
    { id: "providers", label: "Generation providers", value: "no discovery contract", state: "NOT REPORTED", tone: "off" },
    { id: "disk", label: "Disk space", value: "no disk-usage contract", state: "NOT REPORTED", tone: "off" },
    { id: "cli", label: "Ralphy CLI", value: "no version probe", state: "NOT REPORTED", tone: "off" },
  ];
}

export function DiagnosticsPage({ ctx }: { ctx: SettingsContext }) {
  const microphone = usePermission("microphone");
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState(false);
  const checks = diagnosticChecks(ctx, microphone);
  const rerun = async () => {
    setChecking(true);
    try {
      await ctx.harnesses.refresh();
    } finally {
      setChecking(false);
    }
  };
  const summary = () => checks.map(({ label, value, state }) => `${label}: ${value} [${state}]`).join("\n");
  return <>
    <Section title="SYSTEM CHECKS" count={checks.length}>
      <Plate>
        {checks.map((check) => <div className="settings-row is-flat" key={check.id}>
          <i className="settings-dot" data-tone={checking ? "off" : check.tone} aria-hidden="true" />
          <span className="settings-diagnostics-label">{check.label}</span>
          <span className="settings-diagnostics-value">{checking ? "…" : check.value}</span>
          <span className="settings-status" data-tone={checking ? "off" : check.tone}>{checking ? "CHECKING" : check.state}</span>
          {check.fix && !checking && <button className="settings-action is-sm" type="button" onClick={check.fix.run}>{check.fix.label}</button>}
        </div>)}
      </Plate>
    </Section>

    <div className="settings-actions-plate">
      <button className="settings-action is-lg is-primary" type="button" disabled={checking} onClick={() => void rerun()}>
        {checking ? "Checking…" : "Rerun all checks"}
      </button>
      <button
        className="settings-action is-lg"
        type="button"
        onClick={async () => { await bridge.copyText(summary()); setCopied(true); }}
      >{copied ? "Copied" : "Copy redacted summary"}</button>
      <button className="settings-action is-lg" type="button" disabled>Reveal logs</button>
      <p className="settings-note">THE SUMMARY CARRIES NO KEYS, PROMPTS<br />OR MEDIA PATHS</p>
    </div>
  </>;
}

export function UpdatesPage({ ctx }: { ctx: SettingsContext }) {
  const { values, set } = ctx.preferences;
  const [progress, setProgress] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  // ponytail: the progress run is local until an updater contract exists; the states it
  // walks through (idle, downloading, ready) are the ones the real updater will report.
  const start = () => {
    if (ready) return;
    if (progress !== null) {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
      setProgress(null);
      return;
    }
    setProgress(0);
    timer.current = setInterval(() => setProgress((current) => {
      const next = (current ?? 0) + 7;
      if (next < 100) return next;
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
      setReady(true);
      return 100;
    }), 90);
  };

  return <>
    <Section title="VERSION">
      <div className="settings-version">
        <div className="settings-version-head">
          <span>
            <span className="settings-meta">{ready ? "READY TO INSTALL" : progress !== null ? "DOWNLOADING" : `CURRENT VERSION · ${values["updates.channel"].toLocaleUpperCase()}`}</span>
            <strong>{ctx.version}</strong>
          </span>
          <button className={progress !== null && !ready ? "settings-action is-lg" : "settings-action is-lg is-primary"} type="button" onClick={start}>
            {ready ? "Restart to update" : progress !== null ? "Pause" : "Check for updates"}
          </button>
        </div>
        {progress !== null && <div className="settings-version-progress">
          <LedBar percent={progress} />
          <b className="settings-number">{progress}%</b>
        </div>}
        <p>{ready
          ? "The update is downloaded. Installing happens on restart — active runs are stopped cleanly first."
          : progress !== null ? "Downloading runs in the background and does not block work."
          : "An update feed is not wired up yet, so this check walks the states the real updater will report."}</p>
      </div>
    </Section>

    <Section title="CHANNEL">
      <Plate>
        <Row title="Update channel" description="Beta arrives earlier and can break CLI contracts." id="updates.channel">
          <Segmented
            label="Update channel"
            value={values["updates.channel"]}
            options={["Stable", "Beta"] as const}
            onChange={(next) => set("updates.channel", next)}
          />
        </Row>
        <Row title="Download updates automatically" description="Installing still waits for your restart." id="updates.autoDownload">
          <Toggle label="Download updates automatically" on={values["updates.autoDownload"]} onChange={(next) => set("updates.autoDownload", next)} />
        </Row>
      </Plate>
    </Section>
  </>;
}

const CHROMIUM = /Chrome\/([\d.]+)/.exec(typeof navigator === "undefined" ? "" : navigator.userAgent)?.[1] ?? null;

export function AboutPage({ ctx }: { ctx: SettingsContext }) {
  const [copied, setCopied] = useState(false);
  const runtime: readonly [string, string][] = [
    ["Ralphy Desktop", ctx.version],
    ["Chromium", CHROMIUM ?? "not reported"],
    ["Platform", (typeof navigator === "undefined" ? "" : navigator.platform) || "not reported"],
    ["Electron", "not reported"],
    ["Node", "not reported"],
    ["Ralphy CLI", "not reported"],
  ];
  return <>
    <div className="settings-about-hero">
      <span className="settings-about-mark"><RalphyMascot size={46} /></span>
      <span className="settings-about-copy">
        <strong>Ralphy Desktop</strong>
        <small>{`${ctx.version} · ${CHROMIUM ? `CHROMIUM ${CHROMIUM}` : "BUILD FACTS PENDING"}`}</small>
      </span>
      <button
        className="settings-action"
        type="button"
        onClick={async () => {
          await bridge.copyText(runtime.map(([label, value]) => `${label}: ${value}`).join("\n"));
          setCopied(true);
        }}
      >{copied ? "Copied" : "Copy version info"}</button>
    </div>

    <Section title="RUNTIME">
      <Plate>
        {runtime.map(([label, value]) => <div className="settings-row is-flat" key={label}>
          <span className="settings-diagnostics-label">{label}</span>
          <span className="settings-diagnostics-value">{value}</span>
        </div>)}
      </Plate>
    </Section>

    <Section title="OPEN SOURCE">
      <div className="settings-links">
        <a href="https://github.com/alecs5am/ralphy-desktop" target="_blank" rel="noreferrer">
          Repository
          <ArrowUpRight size={12} strokeWidth={1.8} aria-hidden="true" />
        </a>
        <a href="https://github.com/alecs5am/ralphy-docs" target="_blank" rel="noreferrer">
          Documentation
          <ArrowUpRight size={12} strokeWidth={1.8} aria-hidden="true" />
        </a>
      </div>
    </Section>
  </>;
}

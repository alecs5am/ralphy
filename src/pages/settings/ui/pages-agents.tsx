/**
 * Agents: which harness answers, what it reports about itself, and the credential it needs.
 *
 * A harness states its own version, model and account -- nothing here infers any of them, and a
 * harness that reports nothing says so rather than showing a plausible default. The credential
 * field hands its value to the main process, which owns the keychain; this page only ever learns
 * whether the test call worked.
 */
import { useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";

import type { HarnessRow } from "../lib/harnesses";
import {
  action,
  DesignTarget,
  Dot,
  FIELD_WIDE,
  NOTE,
  NOTE_ALERT,
  Plate,
  Row,
  ROW_COPY,
  ROW_TITLE,
  Section,
  SettingsSelect,
  Status,
  statusText,
  type StatusTone,
  WIDGET_LIGHT,
} from "./rows";
import type { SettingsContext } from "../model/context";
import {
  SERVICE_META,
  SERVICE_MODEL,
  SERVICE_NAME,
  SERVICE_ROW,
  SERVICE_STATE,
} from "./system-rows";

export function AgentsPage({ ctx }: { ctx: SettingsContext }) {
  const { values, set } = ctx.preferences;
  const { rows, state } = ctx.harnesses;
  return <>
    <Section title="HARNESSES · THEY DRIVE THE APP, ITS FILES AND ITS TOOLS">
      <Plate>
        {state === "loading" && <Row title="Reading harnesses" description="Asking the bridge which adapters are installed." target><DesignTarget /></Row>}
        {state === "unavailable" && <Row title="Harness discovery unavailable" description="The bridge did not answer. Nothing is inferred about the adapters on this machine." target><DesignTarget /></Row>}
        {rows.map((harness) => <div className={`${SERVICE_ROW} hover:bg-row-hover`} key={harness.id}>
          <Dot tone={harness.tone} />
          <span className={`w-settings-service ${SERVICE_NAME}`}>
            <strong className="type-ui font-normal text-ink">{harness.name}</strong>
            <small className={SERVICE_META}>{harness.source}</small>
          </span>
          <span className={SERVICE_STATE}>
            <Status tone={harness.tone}>{`${harness.status} · ${harness.auth}`}</Status>
            <small className={SERVICE_META}>{harness.capabilities}</small>
          </span>
          <span className={SERVICE_MODEL}>{harness.model}</span>
          <button
            className={action({ size: "sm", tone: harness.tone === "ok" ? undefined : "primary" })}
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
          <button className={action({ size: "sm" })} type="button" onClick={() => ctx.goTo("permissions", "permissions.posture")}>
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
  // Two ways in, and the row may offer both: the provider's own login, or a key we store.
  const signIn = !harness.connected && harness.login;
  const needsKey = !harness.connected && !harness.login && harness.apiKey;

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
        <div className={`${SERVICE_ROW} hover:bg-row-hover`}>
          <Dot tone={harness.tone} />
          <span className={SERVICE_STATE}>
            <Status tone={harness.tone}>{`${harness.status} · ${harness.auth}`}</Status>
            <small className={SERVICE_META}>{harness.detail}</small>
          </span>
          <button
            className={action({ size: "lg", tone: "primary" })}
            type="button"
            disabled={busy || !(harness.login || harness.apiKey)}
            onClick={async () => {
              if (needsKey) { keyField.current?.focus(); return; }
              setBusy(true);
              try {
                if (signIn) await ctx.harnesses.signIn(harness.id);
                else await ctx.harnesses.refresh();
              } finally {
                setBusy(false);
              }
            }}
          >{signIn ? "Sign in" : needsKey ? "Add key" : "Test connection"}</button>
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
      {harness.apiKey
        ? <div className={`flex flex-col gap-2.75 ${WIDGET_LIGHT}`}>
          <Status tone={credentialTone}>{credentialLabel}</Status>
          <div className="flex items-center gap-2 @max-settings-column/settings-main:flex-wrap">
            <input
              ref={keyField}
              className={state === "failed" || state === "empty" ? `${FIELD_WIDE} bg-error-surface` : FIELD_WIDE}
              value={draft}
              placeholder="Paste the provider key"
              aria-label={`${harness.name} API key`}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => { setDraft(event.target.value); setState("idle"); }}
            />
            <button className={action({ size: "lg", tone: "primary" })} type="button" disabled={state === "testing"} onClick={() => void saveKey()}>
              {state === "testing" ? "Testing…" : state === "connected" ? "Saved" : "Save key"}
            </button>
            <button className={action({ size: "lg" })} type="button" disabled={state === "testing"} onClick={() => void saveKey()}>Test connection</button>
          </div>
          <p className={state === "failed" ? NOTE_ALERT : NOTE}>
            {state === "failed"
              ? "THE KEY WAS NOT ACCEPTED. THE TYPED VALUE IS KEPT — CORRECT IT AND SAVE AGAIN"
              : "THE KEY GOES TO THE OS KEYCHAIN, NEVER INTO PREFERENCES, AND IS NEVER RETURNED TO THE RENDERER IN FULL"}
          </p>
          {/* A key is billed per token; the login uses the plan the operator already pays for.
              Saying so here is what tells them the field above is optional. */}
          {harness.login && <p className={NOTE}>{`A KEY IS THE ALTERNATIVE, NOT THE REQUIREMENT — SIGN IN ABOVE TO USE THE ${harness.name.toLocaleUpperCase()} SUBSCRIPTION INSTEAD`}</p>}
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
        ><span className={statusText("off")}>NOT REPORTED</span></Row>)}
      </Plate>
      <p className={NOTE}>THE SAME FRIENDLY NAME MEANS DIFFERENT THINGS PER PROVIDER, SO NOTHING IS ASSUMED UNTIL THE ADAPTER REPORTS IT</p>
    </Section>

    <Section title="MAINTENANCE">
      <Plate single>
        <span className={ROW_COPY}>
          <strong className={ROW_TITLE}>Disconnect harness</strong>
          <small className="type-label leading-row text-muted">The stored credential is removed. Settings without secrets stay until you reconnect.</small>
        </span>
        <button
          className={action({ tone: "danger" })}
          type="button"
          disabled={!harness.apiKey}
          onClick={() => void ctx.harnesses.clearKey(harness.id)}
        >Disconnect…</button>
      </Plate>
    </Section>
  </>;
}

/** The generation services Ralphy renders with. Discovery and credential storage for them
 *  is not part of the bridge contract yet, so every row states that rather than guessing. */

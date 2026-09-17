/**
 * Agents: which harness answers, what it reports about itself, and the credential it needs.
 *
 * A harness states its own version, model and account -- nothing here infers any of them, and a
 * harness that reports nothing says so rather than showing a plausible default. The credential
 * field hands its value to the main process, which owns the keychain; this page only ever learns
 * whether the test call worked.
 */
import { useRef, useState } from "react";
import { ArrowUpRight } from "@/shared/ui/icons";

import type { HarnessRow } from "../lib/harnesses";
import {
  action,
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
    <Section title="CHAT AGENTS">
      <Plate>
        {state === "loading" && <Row title="Checking available agents" description="Reading installed apps and account connections." />}
        {state === "unavailable" && <Row title="Agents could not be checked" description="Try again to check your installed agents."><button className={action()} onClick={() => void ctx.harnesses.refresh()}>Retry</button></Row>}
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
        <Row title="Default agent for new chats" description="Existing conversations keep their provider and model." id="agents.default">
          <SettingsSelect
            label="Default agent for new chats"
            value={values["agents.defaultHarness"]}
            options={rows.length
              ? rows.map((harness) => ({ value: harness.id, label: harness.name, meta: harness.status }))
              : [{ value: values["agents.defaultHarness"], label: values["agents.defaultHarness"] }]}
            onChange={(next) => set("agents.defaultHarness", next)}
          />
        </Row>
        <Row title="Access for new chats" description="Choose the default access level. Existing chats keep their own setting.">
          <button className={action({ size: "sm" })} type="button" onClick={() => ctx.goTo("permissions", "permissions.mode")}>
            {{ plan: "Read-only files", auto: "Workspace access", full: "Full access" }[values["permissions.mode"]] ?? "Read-only files"}
            <ArrowUpRight size={12} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </Row>
      </Plate>
    </Section>
    <Section title="TOOLS AND GENERATION"><Plate>
      <Row title="Image, video and audio services" description="Create, Canvas and agent tool calls use your generation connections."><button className={action()} onClick={() => ctx.goTo("providers")}>Generation providers</button></Row>
      <Row title="MCP tools" description="Codex and Claude use the MCP connections configured in their own apps. Configure a tool there, then start a new chat here to use it. Connections and access may differ between agents." />
    </Plate></Section>
  </>;
}

type CredentialState = "idle" | "empty" | "testing" | "connected" | "failed";

export function HarnessDetailPage({ ctx, harness }: { ctx: SettingsContext; harness: HarnessRow }) {
  const [draft, setDraft] = useState("");
  const [state, setState] = useState<CredentialState>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyField = useRef<HTMLInputElement>(null);
  // Two ways in, and the row may offer both: the provider's own login, or a key we store.
  const signIn = !harness.connected && harness.login;
  const needsKey = !harness.connected && !harness.login && harness.apiKey;

  const saveKey = async () => {
    if (!draft.trim()) { setState("empty"); return; }
    setState("testing"); setError(null);
    try {
      await ctx.harnesses.saveKey(harness.id, draft.trim());
      setState("connected");
      setDraft("");
    } catch (cause) {
      setState("failed");
      setError(cause instanceof Error ? cause.message : "The key could not be saved.");
    }
  };

  const credentialLabel = state === "connected"
    ? "KEY SAVED SECURELY · NOT AN AUTHENTICATION CHECK"
    : state === "failed" ? "KEY COULD NOT BE SAVED"
    : state === "empty" ? "KEY IS REQUIRED"
    : state === "testing" ? "SAVING KEY…"
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
            disabled={busy}
            onClick={async () => {
              if (needsKey) { keyField.current?.focus(); return; }
              setBusy(true); setError(null);
              try {
                if (signIn && harness.installed) await ctx.harnesses.signIn(harness.id);
                else await ctx.harnesses.refresh();
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : "The connection could not be checked.");
              } finally {
                setBusy(false);
              }
            }}
          >{busy ? "Checking…" : !harness.installed ? "Check installation" : signIn ? "Sign in" : needsKey ? "Add key" : "Refresh status"}</button>
        </div>
        <Row title="Model" description="Choose a model in the chat composer. Existing conversations keep the model they started with." id="harness.model"><Status>{harness.model}</Status></Row>
      </Plate>
    </Section>
    {!harness.installed && <p className={NOTE}>Install {harness.name} on this Mac, then check its status again. Ralphy does not bundle third-party agent apps.</p>}
    {error && <p role="alert" className={NOTE_ALERT}>{error}</p>}

    <Section title="CREDENTIAL · SECURE">
      {harness.apiKey
        ? <div className={`flex flex-col gap-2.75 ${WIDGET_LIGHT}`}>
          <Status tone={credentialTone}>{credentialLabel}</Status>
          <div className="flex items-center gap-2 @max-settings-column/settings-main:flex-wrap">
            <input
              ref={keyField}
              type="password"
              className={state === "failed" || state === "empty" ? `${FIELD_WIDE} bg-error-surface` : FIELD_WIDE}
              value={draft}
              placeholder="Paste the provider key"
              aria-label={`${harness.name} API key`}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => { setDraft(event.target.value); setState("idle"); }}
            />
            <button className={action({ size: "lg", tone: "primary" })} type="button" disabled={state === "testing"} onClick={() => void saveKey()}>
              {state === "testing" ? "Saving…" : state === "connected" ? "Saved" : "Save key"}
            </button>
          </div>
          <p className={state === "failed" ? NOTE_ALERT : NOTE}>
            {state === "failed"
              ? "The key was not saved. Correct it and try again."
              : "Your key is encrypted on this Mac. It is never stored in preferences or shown again after saving."}
          </p>
          {/* A key is billed per token; the login uses the plan the operator already pays for.
              Saying so here is what tells them the field above is optional. */}
          {harness.login && <p className={NOTE}>{`A KEY IS THE ALTERNATIVE, NOT THE REQUIREMENT — SIGN IN ABOVE TO USE THE ${harness.name.toLocaleUpperCase()} SUBSCRIPTION INSTEAD`}</p>}
        </div>
        : <Plate>
          <Row
            title="Credential"
            description="Codex uses the account signed in to its app or CLI. There is no separate key to store in Ralphy."
          />
        </Plate>}
    </Section>

    {harness.apiKey && <Section title="MAINTENANCE">
      <Plate single>
        <span className={ROW_COPY}>
          <strong className={ROW_TITLE}>Remove saved API key</strong>
          <small className="type-label leading-row text-muted">Removes the key stored by Ralphy. Provider login and environment credentials remain managed outside this app.</small>
        </span>
        <button
          className={action({ tone: "danger" })}
          type="button"
          disabled={!harness.apiKey}
          onClick={() => { setError(null); void ctx.harnesses.clearKey(harness.id).then(() => setState("idle")).catch(() => setError("The saved key could not be removed.")); }}
        >Remove saved key</button>
      </Plate>
    </Section>}
  </>;
}

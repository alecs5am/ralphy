/**
 * Generation providers and where their output lands.
 *
 * The provider list is the app's own vocabulary of who can render a frame; the storage page is the
 * other half of the same question -- what the render leaves behind, and how long it is kept.
 */
import {
  action,
  Dot,
  FIELD_WIDE,
  Plate,
  Row,
  ROW_COPY,
  ROW_TITLE,
  Section,
  Status,
} from "./rows";
import { useState } from "react";
import { PostizConnection } from "./PostizConnection";

import type { SettingsContext } from "../model/context";
import type { useGenerationProviders } from "../model/use-generation-providers";
import type { GenerationProviderStatus } from "../../../../shared/generation-studio";
import {
  SERVICE_META,
  SERVICE_NAME,
  SERVICE_ROW,
  SERVICE_STATE,
} from "./system-rows";

export const GENERATION_PROVIDERS = [
  { id: "openrouter", name: "OpenRouter", capabilities: ["Images", "Video", "Text"] },
  { id: "elevenlabs", name: "ElevenLabs", capabilities: ["Voice", "Music", "Sound effects"] },
  { id: "fal", name: "fal.ai", capabilities: ["Video"] },
] as const satisfies readonly Pick<GenerationProviderStatus, "id" | "name" | "capabilities">[];

type ProviderController = ReturnType<typeof useGenerationProviders>;
const sourceLabel = (provider: GenerationProviderStatus) => provider.stored
  ? `SAVED ON THIS MAC${provider.inherited ? " · ENVIRONMENT KEY AVAILABLE" : ""}`
  : provider.inherited ? "FROM ENVIRONMENT" : "ADD AN API KEY";
const validationLabel = (provider: GenerationProviderStatus) => !provider.configured ? "NO KEY" : provider.validation?.state === "valid" ? "AUTHENTICATED" : provider.validation?.state === "invalid" ? "KEY REJECTED" : provider.validation?.state === "unreachable" ? "CHECK UNAVAILABLE" : "KEY PRESENT · UNTESTED";
const validationDetail = (provider?: GenerationProviderStatus) => provider?.validation?.state === "valid" ? "OpenRouter accepted this key. Model access and billing can still vary." : provider?.validation?.state === "invalid" ? "OpenRouter rejected this key. Replace it with an active OpenRouter API key." : provider?.validation?.state === "unreachable" ? "OpenRouter could not be reached or checked. Your key is unchanged; retry when the service is available." : "Check the saved or inherited key without generating content or using model credits.";

function ProviderFeedback({ controller }: { controller: ProviderController }) {
  return <>
    {controller.error && <p className="m-0 rounded-inner bg-card p-3 type-sm leading-copy text-alert" role="alert">{controller.error}</p>}
    {controller.notice && <p className="m-0 rounded-inner bg-card p-3 type-sm leading-copy text-muted" role="status">{controller.notice}</p>}
  </>;
}

export function ProvidersPage({ ctx, controller }: { ctx: SettingsContext; controller: ProviderController }) {
  return <>
    <ProviderFeedback controller={controller} />
    <PostizConnection key={ctx.workspace?.id} workspace={ctx.workspace} />
    <Section title="GENERATION SERVICES">
      <Plate>
        {GENERATION_PROVIDERS.map((provider) => {
          const status = controller.providers?.find((item) => item.id === provider.id);
          return <div className={SERVICE_ROW} key={provider.id}>
            <Dot tone={status?.validation?.state === "valid" ? "ok" : "off"} />
            <span className={`w-settings-service-narrow ${SERVICE_NAME}`}><strong className="type-ui font-normal text-ink">{provider.name}</strong><small className={SERVICE_META}>{provider.capabilities.join(" · ")}</small></span>
            <span className={SERVICE_STATE}><Status tone={status?.validation?.state === "valid" ? "ok" : "off"}>{status ? validationLabel(status) : controller.loading ? "LOADING…" : "STATUS UNAVAILABLE"}</Status><small className={SERVICE_META}>{status ? sourceLabel(status) : ""}</small></span>
            <button className={action({ size: "sm" })} type="button" onClick={() => ctx.openDetail({ kind: "provider", id: provider.id })} aria-label={`Manage ${provider.name}`}>Manage</button>
          </div>;
        })}
      </Plate>
    </Section>
    <Section title="GENERATION COST"><Plate><Row title="High cost warning" description="Highlight estimates above this amount before you generate. This is a warning, not a spending cap." id="generation.costWarningUsd"><label className="flex items-center gap-2 type-ui text-ink">$<input aria-label="High cost warning in USD" className={FIELD_WIDE} type="number" min={0.01} max={10000} step={0.01} required key={ctx.preferences.values["generation.costWarningUsd"]} defaultValue={ctx.preferences.values["generation.costWarningUsd"]} onBlur={(event) => { if (event.currentTarget.reportValidity()) ctx.preferences.set("generation.costWarningUsd", Number(event.currentTarget.value)); }} /></label></Row></Plate></Section>
    <Plate single><span className={ROW_COPY}><strong className={ROW_TITLE}>Generation and agent access</strong><small className="type-label leading-row text-muted">Choose models in Create or Canvas. OpenRouter also shares its saved key with the OpenRouter agent. Claude and Codex sign-ins are managed in Agents.</small></span><button className={action()} type="button" disabled={controller.loading || controller.busy !== null} onClick={() => { void controller.refresh(); }}>Refresh status</button></Plate>
  </>;
}

export function ProviderDetailPage({ provider, controller }: { provider: (typeof GENERATION_PROVIDERS)[number]; controller: ProviderController }) {
  const [key, setKey] = useState("");
  const status = controller.providers?.find((item) => item.id === provider.id);
  const busy = controller.busy !== null;
  const unavailable = !status || controller.loading;
  return <>
    <ProviderFeedback controller={controller} />
    <Section title="API KEY · THIS MAC">
      <Plate>
        <Row title={status?.configured ? "Key present" : status ? "No key configured" : "Provider status unavailable"} description={status ? `${sourceLabel(status)}. Key presence does not confirm provider access.` : "Refresh provider status before changing a credential."}>
          <button className={action()} type="button" disabled={controller.loading || busy} onClick={() => { void controller.refresh(); }}>Refresh status</button>
        </Row>
      </Plate>
      {provider.id === "openrouter" && <Plate><Row title={status ? validationLabel(status) : "Authentication not checked"} description={validationDetail(status)}><button className={action()} type="button" disabled={!status?.configured || busy || unavailable} onClick={() => { void controller.probe(provider.id); }}>Test connection</button></Row></Plate>}
      <form className="flex flex-col gap-3 rounded-inner bg-card p-4" onSubmit={(event) => {
        event.preventDefault();
        if (busy || unavailable || !key.trim()) return;
        void controller.save(provider.id, key.trim()).then((saved) => { if (saved) setKey(""); });
      }}>
        <label className="type-ui text-ink" htmlFor={`provider-key-${provider.id}`}>{status?.stored ? "Replacement API key" : "New API key"}</label>
        <input id={`provider-key-${provider.id}`} className={`${FIELD_WIDE} min-w-0 w-full flex-none`} type="password" autoComplete="new-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={key} maxLength={512} required pattern={provider.id === "openrouter" ? "\\s*sk-or-\\S{14,}\\s*" : "\\s*\\S{16,}\\s*"} title={provider.id === "openrouter" ? "Enter an OpenRouter API key beginning with sk-or- (at least 20 characters)." : "Enter an API key with at least 16 characters and no spaces inside."} disabled={busy || unavailable} onChange={(event) => setKey(event.currentTarget.value)} aria-describedby="provider-key-help" />
        <p id="provider-key-help" className="m-0 type-label leading-row text-muted">Keys entered here are encrypted on this Mac. Existing keys are never displayed. Saving does not submit a generation request or validate the key.</p>
        <button className={`${action({ tone: "primary" })} self-start`} type="submit" disabled={busy || unavailable || !key.trim()}>{controller.busy === provider.id ? "Working…" : status?.stored ? "Replace key" : "Save key"}</button>
      </form>
    </Section>
    <Section title="USED THROUGHOUT RALPHY"><Plate><Row title="One connection for every generation" description="Create, Canvas, Codex and Claude use the connection shown here. A saved app key takes priority over the app environment. Older project/workspace generation keys and agent shell overrides do not replace it. Changes apply to the next request; running requests keep their current connection. Agent subscriptions and MCP tools have separate connections." /></Plate></Section>
    <Section title="DISCONNECT">
      <Plate single><span className={ROW_COPY}><strong className={ROW_TITLE}>Remove the saved key</strong><small className="type-label leading-row text-muted">{status?.inherited ? "An environment key remains available after the saved key is removed. Change the app's environment to disconnect it." : "This removes only the credential saved by this app. Generated media stays in your library."}</small></span><button className={action({ tone: "danger" })} type="button" disabled={!status?.stored || busy || unavailable} onClick={() => { void controller.clear(provider.id).then((cleared) => { if (cleared) setKey(""); }); }}>Disconnect saved key</button></Plate>
    </Section>
  </>;
}

export { StoragePage } from "./pages-storage";

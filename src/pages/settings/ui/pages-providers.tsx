/**
 * Generation providers and where their output lands.
 *
 * The provider list is the app's own vocabulary of who can render a frame; the storage page is the
 * other half of the same question -- what the render leaves behind, and how long it is kept.
 */
import {
  action,
  DesignTarget,
  Dot,
  Plate,
  Row,
  ROW_COPY,
  ROW_TITLE,
  Section,
  SettingsSelect,
  Status,
} from "./rows";
import { useState } from "react";
import { Plus } from "lucide-react";

import type { SettingsContext } from "../model/context";
import {
  FLAT_ROW,
  FLAT_VALUE,
  options,
  SERVICE_META,
  SERVICE_MODEL,
  SERVICE_NAME,
  SERVICE_ROW,
  SERVICE_STATE,
} from "./system-rows";

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
        {GENERATION_PROVIDERS.map((provider) => <div className={SERVICE_ROW} key={provider.id}>
          <Dot tone="off" />
          <span className={`w-settings-service-narrow ${SERVICE_NAME}`}>
            <strong className="type-ui font-normal text-ink">{provider.name}</strong>
            <small className={SERVICE_META}>{provider.capabilities}</small>
          </span>
          <span className={SERVICE_STATE}>
            <Status tone="off">NOT CONFIGURED HERE</Status>
            <small className={SERVICE_META}>CONFIGURED THROUGH THE RALPHY CLI</small>
          </span>
          <span className={SERVICE_MODEL}>—</span>
          <button className={action({ size: "sm" })} type="button" onClick={() => ctx.openDetail({ kind: "provider", id: provider.id })}>Manage</button>
        </div>)}
      </Plate>
    </Section>

    <Plate single>
      <span className={ROW_COPY}>
        <strong className={ROW_TITLE}>Add a provider</strong>
        <small className="type-label leading-row text-muted">Community adapters install from the Marketplace; built-in services appear here once discovery lands.</small>
      </span>
      <button className={action({ size: "lg", tone: "primary" })} type="button" disabled>
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
        {["TEXT", "IMAGE", "VIDEO", "UPSCALE"].map((kind) => <div className={FLAT_ROW} key={kind}>
          <span className="w-settings-kind flex-none font-code type-mono-sm tracking-caps text-muted">{kind}</span>
          <span className={FLAT_VALUE}>Model catalogue arrives with provider discovery</span>
          <DesignTarget />
        </div>)}
      </Plate>
    </Section>

    <Section title="MAINTENANCE">
      <Plate single>
        <span className={ROW_COPY}>
          <strong className={ROW_TITLE}>Remove credential</strong>
          <small className="type-label leading-row text-muted">Available once the credential is stored by the app rather than by the CLI.</small>
        </span>
        <button className={action({ tone: "danger" })} type="button" disabled>Disconnect…</button>
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
          <button className={action()} type="button" onClick={() => setReclaimed(true)}>Clear cache</button>
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

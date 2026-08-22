import { ArrowLeft, ArrowRight, Search, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ProfileAvatar, profileIdentity } from "../components/ProfileAvatar";
import { RalphyMascot } from "../components/RalphyMascot";
import { defineInstrumentScreenStates, InstrumentScreenRoot } from "../instrument/screen-state-registry";
import type { ResolvedTheme, ThemePreference } from "../instrument/types";
import {
  readCommandBindings,
  writeCommandBindings,
  type CommandBindings,
} from "./settings/commands";
import type { SettingsContext, SettingsDetail } from "./settings/context";
import { useHarnesses } from "./settings/harnesses";
import {
  AppearancePage,
  GeneralPage,
  KeyboardPage,
  ProfilePage,
} from "./settings/pages-personal";
import {
  AboutPage,
  AgentsPage,
  DiagnosticsPage,
  GENERATION_PROVIDERS,
  HarnessDetailPage,
  PermissionsPage,
  ProviderDetailPage,
  ProvidersPage,
  StoragePage,
  TerminalPage,
  UpdatesPage,
} from "./settings/pages-system";
import { settingsStorage, useAppPreferences } from "./settings/preferences";
import { railFor } from "./settings/rail";
import {
  searchSettings,
  SETTINGS_NAV_GROUPS,
  SETTINGS_PAGE_ICONS,
  SETTINGS_PAGE_IDS,
  SETTINGS_PAGES,
  type SettingsPageId,
} from "./settings/registry";
import { version as appVersion } from "../../package.json";

export type SettingsCategory = SettingsPageId;
export const SETTINGS_CATEGORY_IDS = SETTINGS_PAGE_IDS;
const LAST_PAGE_KEY = "ralphy.settings.page";

export const settingsInstrumentStates = SETTINGS_PAGE_IDS.map((id) => defineInstrumentScreenStates({
  routeKey: `settings.${id}`,
  states: ["ready"],
  rootMarker: `settings-${id}`,
  landmarks: [SETTINGS_PAGES[id].title, "Settings categories"],
} as const));

function readLastPage(): SettingsPageId {
  const stored = settingsStorage.getItem(LAST_PAGE_KEY);
  return SETTINGS_PAGE_IDS.includes(stored as SettingsPageId) ? stored as SettingsPageId : "general";
}

export function SettingsScreen({
  rootPath,
  theme,
  resolvedTheme = "light",
  onThemeChange,
  onBack,
}: {
  rootPath: string | null;
  theme: ThemePreference;
  resolvedTheme?: ResolvedTheme;
  onThemeChange(value: ThemePreference): void;
  onBack(): void;
}) {
  const [page, setPage] = useState(readLastPage);
  const [detail, setDetail] = useState<SettingsDetail | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [bindings, setStoredBindings] = useState<CommandBindings>(() => readCommandBindings(settingsStorage));
  const heading = useRef<HTMLHeadingElement>(null);
  const preferences = useAppPreferences(settingsStorage);
  const harnesses = useHarnesses();

  useEffect(() => { settingsStorage.setItem(LAST_PAGE_KEY, page); }, [page]);
  // Focus lands on the page heading after a category change, which is both the design's
  // focus contract and the only place a landing indicator reads as anything.
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [page, detail]);
  // The highlight after a jump is a hint, not a state: it fades on its own.
  useEffect(() => {
    if (!flashId) return;
    const timer = setTimeout(() => setFlashId(null), 1400);
    return () => clearTimeout(timer);
  }, [flashId]);

  const goTo = (next: SettingsPageId, flash?: string) => {
    setPage(next);
    setDetail(null);
    setQuery("");
    setFlashId(flash ?? null);
  };

  const ctx: SettingsContext = {
    preferences,
    harnesses,
    bindings,
    libraryPath: rootPath,
    version: appVersion,
    theme,
    resolvedTheme,
    flashId,
    setBindings: (next) => { writeCommandBindings(settingsStorage, next); setStoredBindings(next); },
    onThemeChange,
    goTo,
    openDetail: (next) => { setDetail(next); setFlashId(null); },
  };

  const results = useMemo(() => searchSettings(query), [query]);
  const searching = query.trim().length > 0;
  const harness = detail?.kind === "harness" ? harnesses.rows.find(({ id }) => id === detail.id) ?? null : null;
  const provider = detail?.kind === "provider" ? GENERATION_PROVIDERS.find(({ id }) => id === detail.id) ?? null : null;
  const needAction = harnesses.rows.filter(({ tone }) => tone !== "ok").length;
  const attention: Partial<Record<SettingsPageId, boolean>> = {
    agents: needAction > 0,
    diagnostics: needAction > 0 || harnesses.state === "unavailable",
  };
  const operator = String(preferences.values["profile.displayName"]).trim() || profileIdentity(rootPath ?? "") || "LOCAL";

  const title = searching
    ? "Search settings"
    : harness?.name ?? (provider ? provider.name : SETTINGS_PAGES[page].title);
  const scopes = searching
    ? ["ROW-LEVEL INDEX"]
    : harness ? ["MANAGED BY PROVIDER"] : provider ? ["SECURE CREDENTIAL"] : SETTINGS_PAGES[page].scopes;
  const rail = searching || page === "about" || detail ? null : railFor(page, ctx);
  const descriptor = settingsInstrumentStates.find(({ routeKey }) => routeKey === `settings.${page}`)!;

  const openResult = (index: number) => {
    const entry = results[index];
    if (entry) goTo(entry.page, entry.id);
  };

  const content = (() => {
    if (searching) return results.length
      ? <>
        <p className="settings-results-label">
          RESULTS
          <span className="settings-number">{results.length}</span>
          · ↑↓ TO MOVE · ENTER OPENS AND HIGHLIGHTS THE ROW
        </p>
        <div className="settings-plate">
          {results.map((entry, index) => <button
            className={index === selected ? "settings-result is-selected" : "settings-result"}
            type="button"
            key={entry.id}
            onClick={() => openResult(index)}
          >
            <span>
              <strong>{entry.title}</strong>
              <em>{`${SETTINGS_PAGES[entry.page].title} › ${entry.section}`}</em>
            </span>
            <small>{entry.state(preferences.values)}</small>
            <ArrowRight size={13} strokeWidth={1.9} aria-hidden="true" />
          </button>)}
        </div>
      </>
      : <div className="settings-empty">
        <RalphyMascot size={56} />
        <strong>{`Nothing matched “${query.trim()}”`}</strong>
        <p>THE INDEX COVERS ROWS, DESCRIPTIONS AND SYNONYMS.<br />TRY: API KEY · CACHE · MICROPHONE · SHORTCUT · PATH</p>
        <button className="settings-action is-lg is-primary" type="button" onClick={() => setQuery("")}>Clear search</button>
      </div>;
    if (harness) return <HarnessDetailPage ctx={ctx} harness={harness} />;
    if (provider) return <ProviderDetailPage provider={provider} />;
    if (page === "general") return <GeneralPage ctx={ctx} />;
    if (page === "profile") return <ProfilePage ctx={ctx} />;
    if (page === "appearance") return <AppearancePage ctx={ctx} />;
    if (page === "keys") return <KeyboardPage ctx={ctx} />;
    if (page === "agents") return <AgentsPage ctx={ctx} />;
    if (page === "providers") return <ProvidersPage ctx={ctx} />;
    if (page === "storage") return <StoragePage ctx={ctx} />;
    if (page === "permissions") return <PermissionsPage ctx={ctx} />;
    if (page === "terminal") return <TerminalPage ctx={ctx} />;
    if (page === "diagnostics") return <DiagnosticsPage ctx={ctx} />;
    if (page === "updates") return <UpdatesPage ctx={ctx} />;
    return <AboutPage ctx={ctx} />;
  })();

  return <InstrumentScreenRoot descriptor={descriptor} state="ready">
    <motion.div
      className="settings-desk"
      data-density={String(preferences.values["appearance.density"]).toLocaleLowerCase()}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.16, ease: [0.2, 0, 0.2, 1] }}
    >
      <div className="settings-topbar">
        <button className="settings-back" type="button" onClick={onBack}>
          <ArrowLeft size={14} strokeWidth={1.9} aria-hidden="true" />
          Back to app
        </button>
        <div className="settings-island">
          <b>SETTINGS</b>
          <span>{`THIS MAC · ${operator.toLocaleUpperCase()}`}</span>
          {needAction > 0 && <button className="settings-island-attention" type="button" onClick={() => goTo("diagnostics")}>
            <i className="settings-dot" data-tone="warn" aria-hidden="true" />
            {`${needAction} NEED ATTENTION`}
          </button>}
        </div>
        <span className="settings-brand">
          RALPHY
          <b className="settings-number">{appVersion}</b>
        </span>
        <ProfileAvatar rootPath={rootPath ?? ""} size={32} round />
      </div>

      <div className="settings-body">
        <aside className="settings-nav">
          <label className="settings-nav-search">
            <Search size={13} strokeWidth={1.9} aria-hidden="true" />
            <input
              value={query}
              placeholder="Search settings"
              aria-label="Search settings"
              onChange={(event) => { setQuery(event.target.value); setSelected(0); }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") { event.preventDefault(); setSelected((index) => Math.min(results.length - 1, index + 1)); }
                if (event.key === "ArrowUp") { event.preventDefault(); setSelected((index) => Math.max(0, index - 1)); }
                if (event.key === "Enter") { event.preventDefault(); openResult(selected); }
              }}
            />
            {query && <button className="settings-nav-clear" type="button" aria-label="Clear search" onClick={() => setQuery("")}>
              <X size={11} strokeWidth={2} aria-hidden="true" />
            </button>}
          </label>
          <nav className="settings-nav-groups" aria-label="Settings categories">
            {SETTINGS_NAV_GROUPS.map((group) => <div className="settings-nav-group" key={group.label}>
              <h2>{group.label}</h2>
              {group.items.map((id) => {
                const Icon = SETTINGS_PAGE_ICONS[id];
                const active = page === id && !searching;
                return <button
                  className={active ? "settings-nav-row is-selected" : "settings-nav-row"}
                  type="button"
                  key={id}
                  aria-current={active || undefined}
                  onClick={() => goTo(id)}
                >
                  <Icon size={14} strokeWidth={1.8} aria-hidden="true" />
                  <span>{SETTINGS_PAGES[id].title}</span>
                  {attention[id] && <i className="settings-dot" data-tone="warn" aria-hidden="true" />}
                </button>;
              })}
            </div>)}
          </nav>
          <button className="settings-identity" type="button" onClick={() => goTo("updates")}>
            <span>
              <small>RALPHY DESKTOP</small>
              <strong>{appVersion}</strong>
            </span>
          </button>
        </aside>

        <div className="settings-main">
          <div className="settings-column">
            <header className="settings-page-header">
              {detail && <button className="settings-detail-back" type="button" aria-label="Back to the category" onClick={() => setDetail(null)}>
                <ArrowLeft size={14} strokeWidth={1.9} aria-hidden="true" />
              </button>}
              <h1 ref={heading} tabIndex={-1}>{title}</h1>
              {scopes.map((scope) => <span className="settings-scope" key={scope}>{scope}</span>)}
            </header>
            <div className="settings-scroll" key={`${page}-${detail?.id ?? ""}-${searching}`}>{content}</div>
          </div>

          {/* The rail keeps its slot on pages that have no rail, so the centred column does
              not shift as you move between pages. */}
          <aside className="settings-rail" aria-label={rail ? "Page context" : undefined} aria-hidden={rail ? undefined : true}>
            {rail && <><div className="settings-rail-facts">
              <h2>{rail.label}</h2>
              {rail.rows.map(([label, value]) => <span className="settings-rail-row" key={label}>
                <span>{label}</span>
                <b className={/^\d/.test(value) ? "settings-number" : "settings-code"}>{value}</b>
              </span>)}
              {rail.action && <button className="settings-action" type="button" disabled={rail.action.disabled} onClick={rail.action.run}>{rail.action.label}</button>}
            </div>
            {rail.note && <div className="settings-rail-note">
              <h2>{rail.note.label}</h2>
              <p>{rail.note.text}</p>
              {rail.note.danger && <button className="settings-action is-danger" type="button" disabled={rail.note.danger.disabled} onClick={rail.note.danger.run}>{rail.note.danger.label}</button>}
            </div>}</>}
          </aside>
        </div>
      </div>
    </motion.div>
  </InstrumentScreenRoot>;
}

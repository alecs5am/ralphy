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
import {
  action,
  CODE,
  Dot,
  NUMBER,
  PLATE,
  ROW_COPY,
  ROW_PAD,
  ROW_SHELL,
  SECTION_LABEL,
} from "./settings/rows";
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

/* The nav stands on the sidebar card, which is a theme surface, so its rows take the theme's own
   ink and the theme's focus ring -- and the same row radius the app's own sidebar rows take. The
   on-instrument family it used to carry belonged to the black widget this card replaced. */
const NAV_ROW = "flex h-control-lg items-center gap-3 rounded-row px-3 type-ui text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink";
const MONO_LABEL = "font-code type-mono-xs font-normal tracking-mono";

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
        <p className={SECTION_LABEL}>
          RESULTS
          <span className={NUMBER}>{results.length}</span>
          · ↑↓ TO MOVE · ENTER OPENS AND HIGHLIGHTS THE ROW
        </p>
        <div className={PLATE}>
          {results.map((entry, index) => <button
            className={`${ROW_SHELL} ${ROW_PAD} ${index === selected ? "bg-row-hover" : "hover:bg-row-hover"} focus-visible:outline-ink`}
            type="button"
            key={entry.id}
            onClick={() => openResult(index)}
          >
            <span className={ROW_COPY}>
              <strong className="type-ui font-normal text-ink">{entry.title}</strong>
              <em className="font-code type-mono-xs not-italic tracking-status text-muted">{`${SETTINGS_PAGES[entry.page].title} › ${entry.section}`}</em>
            </span>
            <small className="max-w-settings-result flex-none overflow-hidden font-code type-mono-sm tracking-label text-ellipsis whitespace-nowrap text-muted">{entry.state(preferences.values)}</small>
            <ArrowRight size={13} strokeWidth={1.9} aria-hidden="true" />
          </button>)}
        </div>
      </>
      : <div className="flex flex-col items-center gap-3 rounded-panel bg-instrument p-6">
        <RalphyMascot size={56} />
        <strong className="type-lg font-normal text-on-instrument">{`Nothing matched “${query.trim()}”`}</strong>
        <p className="m-0 max-w-settings-empty text-center font-code type-mono-sm tracking-caps leading-empty text-on-instrument-muted">THE INDEX COVERS ROWS, DESCRIPTIONS AND SYNONYMS.<br />TRY: API KEY · CACHE · MICROPHONE · SHORTCUT · PATH</p>
        <button className={action({ size: "lg", tone: "primary", surface: "instrument" })} type="button" onClick={() => setQuery("")}>Clear search</button>
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
      className="settings-screen flex h-full w-full min-h-0 gap-2 overflow-hidden bg-desk p-2 font-app type-base text-ink"
      data-density={String(preferences.values["appearance.density"]).toLocaleLowerCase()}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.16, ease: [0.2, 0, 0.2, 1] }}
    >
      {/* One card, the window's full height, standing 8 inside every edge it faces -- the same
          card the app's own sidebar is, so the two screens read as one window rather than two.
          It is a theme surface too, not the black widget it used to be: a black card on a #050505
          desk has no edge to see, which is exactly why the app's sidebar stopped being one. */}
      <aside className="settings-sidebar flex h-full w-settings-nav min-h-0 flex-none flex-col overflow-hidden rounded-sidebar bg-card text-ink">
        {/* macOS draws the traffic lights itself and the sidebar now runs to the top of the
            window, so they land on this header -- the same seat, at the same height, as the app's
            own sidebar header, which is why `trafficLightPosition` needs no second value. */}
        <header className="settings-sidebar-header flex h-9 flex-none items-center gap-2.5 px-3.5 [-webkit-app-region:drag]">
          <div className="w-traffic-sidebar h-px flex-none" aria-hidden="true" />
          <button
            className="inline-flex h-8 min-w-0 flex-1 items-center gap-2.25 rounded-control px-2.5 type-ui text-muted [-webkit-app-region:no-drag] hover:bg-field hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            type="button"
            onClick={onBack}
          >
            <ArrowLeft size={14} strokeWidth={1.9} aria-hidden="true" />
            <span className="truncate">Back to app</span>
          </button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-2 px-2 pb-2">
          <label className="flex h-control-lg flex-none items-center gap-2.25 rounded-control bg-field px-3 text-muted focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink">
            <Search size={13} strokeWidth={1.9} aria-hidden="true" />
            <input
              className="min-w-0 flex-1 bg-transparent type-sm text-ink placeholder:text-muted"
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
            {query && <button
              className="grid size-settings-keycap flex-none place-items-center rounded-control text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
            >
              <X size={11} strokeWidth={2} aria-hidden="true" />
            </button>}
          </label>
          <nav className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto" aria-label="Settings categories">
            {SETTINGS_NAV_GROUPS.map((group) => <div className="flex flex-col gap-0.5" key={group.label}>
              <h2 className={`m-0 flex h-6.5 items-center px-3 ${MONO_LABEL} text-muted`}>{group.label}</h2>
              {group.items.map((id) => {
                const Icon = SETTINGS_PAGE_ICONS[id];
                const active = page === id && !searching;
                return <button
                  className={`${NAV_ROW} ${active ? "bg-field text-ink" : "text-muted hover:bg-field hover:text-ink"}`}
                  type="button"
                  key={id}
                  aria-current={active || undefined}
                  onClick={() => goTo(id)}
                >
                  <Icon size={14} strokeWidth={1.8} aria-hidden="true" />
                  <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{SETTINGS_PAGES[id].title}</span>
                  {attention[id] && <Dot tone="warn" />}
                </button>;
              })}
            </div>)}
          </nav>
          <button
            className="group flex h-settings-plate flex-none items-center gap-3 rounded-control bg-field px-3 text-left hover:bg-row-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            type="button"
            onClick={() => goTo("updates")}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <small className={`${MONO_LABEL} text-muted`}>RALPHY DESKTOP</small>
              <strong className="font-display type-base font-extrabold text-ink">{appVersion}</strong>
            </span>
          </button>
        </div>
      </aside>

      <div className="settings-content-column flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        {/* The app's topbar, to the pixel: exactly the dynamic island's height, and no horizontal
            padding, so the badge stands 8 from this column's left edge and the avatar 8 from the
            window's right -- the line every other zone in the window starts on. */}
        <header className="settings-top-row flex h-9 min-w-0 flex-none items-center gap-3 [-webkit-app-region:drag] [&>*]:[-webkit-app-region:no-drag]">
          <div className="flex h-full flex-none items-center gap-3 rounded-control bg-instrument pr-1.5 pl-3.5">
            <b className="font-code type-mono-sm font-normal tracking-mono text-on-instrument">SETTINGS</b>
            <span className="font-code type-mono-sm font-normal tracking-mono text-on-instrument-muted">{`THIS MAC · ${operator.toLocaleUpperCase()}`}</span>
            {needAction > 0 && <button
              className="inline-flex h-control-sm items-center gap-2 rounded-control bg-instrument-raised px-2.75 font-code type-mono-xs tracking-caps text-on-instrument-muted hover:bg-ghost hover:text-on-instrument focus-visible:outline-focus-on-instrument"
              type="button"
              onClick={() => goTo("diagnostics")}
            >
              <Dot tone="warn" surface="instrument" />
              {`${needAction} NEED ATTENTION`}
            </button>}
          </div>
          <span className="ml-auto inline-flex flex-none items-center gap-2 font-code type-mono-xs tracking-caps text-muted">
            RALPHY
            <b className={NUMBER}>{appVersion}</b>
          </span>
          <ProfileAvatar rootPath={rootPath ?? ""} size={32} round />
        </header>

        {/* The column is a fixed reading width and the rail is context, so a narrow row drops
            the rail first and only then lets the column shrink. Measured against the content
            row, not the window: the sidebar and the chat rail change it without moving the
            viewport. */}
        <div className="@container/settings-main flex min-h-0 min-w-0 flex-1 justify-center gap-2">
          <div className="flex w-settings-column min-h-0 flex-none flex-col gap-2 @max-settings-column/settings-main:mx-2 @max-settings-column/settings-main:w-auto @max-settings-column/settings-main:min-w-0 @max-settings-column/settings-main:flex-1">
            <header className="flex min-h-settings-plate flex-none items-center gap-3 px-2">
              {detail && <button
                className="grid size-control-md flex-none place-items-center rounded-control text-muted hover:bg-desk-hover hover:text-ink focus-visible:outline-ink"
                type="button"
                aria-label="Back to the category"
                onClick={() => setDetail(null)}
              >
                <ArrowLeft size={14} strokeWidth={1.9} aria-hidden="true" />
              </button>}
              <h1
                className="m-0 type-page font-normal tracking-page text-ink focus-visible:outline-ink focus-visible:outline-offset-4"
                ref={heading}
                tabIndex={-1}
              >{title}</h1>
              {scopes.map((scope) => <span
                className="inline-flex h-6 flex-none items-center rounded-control bg-card px-2.75 font-code type-mono-xs tracking-caps text-muted"
                key={scope}
              >{scope}</span>)}
            </header>
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-6" key={`${page}-${detail?.id ?? ""}-${searching}`}>{content}</div>
          </div>

          {/* The rail keeps its slot on pages that have no rail, so the centred column does
              not shift as you move between pages. Its blocks are the overview's panels: chrome
              carrying the label, one card carrying the readings. */}
          <aside
            className="flex w-settings-rail flex-none flex-col gap-2 pt-settings-plate @max-settings-rail/settings-main:hidden"
            aria-label={rail ? "Page context" : undefined}
            aria-hidden={rail ? undefined : true}
          >
            {rail && <><div className="flex flex-col gap-1.5 rounded-panel bg-panel p-1.5">
              <h2 className={`m-0 flex min-h-8 items-center px-2 ${MONO_LABEL} text-muted`}>{rail.label}</h2>
              <div className="flex flex-col gap-2.25 rounded-inner bg-card p-3">
                {rail.rows.map(([label, value]) => <span className="flex items-baseline gap-3" key={label}>
                  <span className="min-w-0 flex-1 type-label leading-row text-muted">{label}</span>
                  <b className={`max-w-settings-rail-label flex-none text-right text-balance ${/^\d/.test(value) ? NUMBER : CODE}`}>{value}</b>
                </span>)}
              </div>
              {rail.action && <button className={action({ surface: "panel" })} type="button" disabled={rail.action.disabled} onClick={rail.action.run}>{rail.action.label}</button>}
            </div>
            {rail.note && <div className="flex flex-col gap-1.5 rounded-panel bg-instrument p-1.5">
              <h2 className={`m-0 flex min-h-8 items-center px-2 ${MONO_LABEL} text-on-instrument-muted`}>{rail.note.label}</h2>
              <p className="m-0 rounded-inner bg-instrument-raised p-3 type-label leading-copy text-pretty text-on-instrument-muted">{rail.note.text}</p>
              {rail.note.danger && <button className={action({ tone: "danger", surface: "instrument" })} type="button" disabled={rail.note.danger.disabled} onClick={rail.note.danger.run}>{rail.note.danger.label}</button>}
            </div>}</>}
          </aside>
        </div>
      </div>
    </motion.div>
  </InstrumentScreenRoot>;
}

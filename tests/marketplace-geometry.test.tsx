import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { describe, expect, test } from "vitest";
import { builtStylesheetLink } from "./style-sources";

type GeometryResult = {
  state: string;
  layout: string;
  width: number;
  height: number;
  overflows: string[];
  sidebarCount: number;
  sidebarWidth: number | null;
  sidebarDisplay: string | null;
  sidebarVisible: string | null;
  categoryMenu: boolean;
  categoryMenuDisplay: string | null;
  categoryMenuValue: string | null;
  chatWidth: number | null;
  containerWidth: number | null;
  containerType: string | null;
  containerName: string | null;
  detailGrid: string | null;
  detailColumns: number | null;
  bodyOverflows: boolean;
  pageScrollOwners: string[];
  workflowScrollOwners: string[];
  primaryActionsFit: boolean;
  autoplayCount: number;
  untrustedCount: number;
  lists: number;
  progress: number;
  dialogs: number;
  categoryLabels: number;
  statusLabels: number;
  trustLabels: number;
  workflowBackground: string | null;
  workflowInitialFocusLabel: string | null;
  workflowInitialFocusVisible: boolean | null;
  workflowInitialFocusOutlineWidth: number | null;
  workflowInitialFocusOutlineStyle: string | null;
  focus: Array<{ selector: string; width: number; style: string }>;
  motion: Array<{ selector: string; transition: string; animation: string }>;
};

type GeometrySmoke = { results: GeometryResult[]; myWorkWidths: number[] };

const states = [
  "discover", "results", "category", "no-results-partial", "model-detail", "model-review",
  "template-detail", "recipe-detail", "prompt-shell", "component-shell", "skill-shell",
  "target-chooser", "installed", "downloads", "update-conflict", "collection", "offline",
] as const;

const layouts = [
  { name: "wide", width: 1440, height: 900, sidebar: true, chat: false },
  { name: "narrow", width: 1280, height: 800, sidebar: true, chat: false },
  { name: "wide-chat", width: 1440, height: 900, sidebar: true, chat: true },
  { name: "narrow-chat", width: 1280, height: 800, sidebar: true, chat: true },
] as const;

const detailLayouts = [
  { name: "detail-container-wide", width: 1160, height: 800, sidebar: true, chat: false },
  { name: "detail-container-narrow-chat", width: 1080, height: 800, sidebar: true, chat: true },
] as const;

async function marketplaceGeometry(): Promise<GeometrySmoke> {
  const directory = mkdtempSync(join(tmpdir(), "ralphy-marketplace-geometry-"));
  try {
    const styleLinks = builtStylesheetLink();
    writeFileSync(join(directory, "harness.tsx"), `
      import { createRoot } from "react-dom/client";
      import { ContextSidebar } from ${JSON.stringify(join(process.cwd(), "src/components/ContextSidebar.tsx"))};
      import { MarketplaceScreenView } from ${JSON.stringify(join(process.cwd(), "src/screens/MarketplaceScreen.tsx"))};
      import { MarketplaceHeader } from ${JSON.stringify(join(process.cwd(), "src/screens/marketplace/MarketplaceHeader.tsx"))};
      import { MarketplaceActionReview, MarketplaceDownloads, MarketplaceTargetChooser, marketplaceTargets } from ${JSON.stringify(join(process.cwd(), "src/screens/marketplace/MarketplaceWorkflows.tsx"))};
      import { projectMarketplacePublicItem } from ${JSON.stringify(join(process.cwd(), "src/screens/marketplace/presentation.ts"))};

      const noop = () => {};
      const query = { text: "", filters: { category: "all", source: "all", license: "all", compatibility: "all", modality: "all", format: "all" }, sort: "relevance" };
      const publicItems = [{ id: "clean-cut", category: "template", name: "Clean cut", summary: "A concise source-backed template with a deliberately long but bounded summary.", referenceUrls: ["https://example.invalid/reference"], recipe: null }, { id: "voxel-dither", category: "recipe", name: "Voxel dither", summary: "A reproducible image treatment", referenceUrls: [], recipe: { kind: "ffmpeg", body: "# Recipe\\n\\n<script>window.__untrusted = true</script>\\nApply the bounded source artifact.", artifact: "ffmpeg -i input.mp4 output.mp4", parameters: null, demo: { kind: "media", storageUrl: null, beforeUrl: null, afterUrl: null, posterUrl: null } } }];
      const model = { provider: "huggingface", id: "Acme/alpha", name: "Alpha model", author: "Acme", task: "text-generation", modality: "text", modelType: "base", baseModel: "Alpha", license: "apache-2.0", gated: false, revision: "abc123", lastModified: "2026-08-19T10:00:00.000Z", tags: ["assistant", "gguf"], iconUrl: null, previewUrl: null, providerUrl: "https://huggingface.co/Acme/alpha", recommendedPackage: { format: "GGUF", bytes: 8589934592, files: ["alpha.gguf"] }, comfort: { level: "comfortable", label: "Comfortable here", score: 4, runtime: "ollama", estimatedMemoryBytes: 10737418240, evidence: ["Fits available memory"] }, state: "remote", permissions: [] };
      const modelItem = { key: "model:huggingface:Acme/alpha", category: "models", name: "Alpha model", summary: "Text generation", sourceLabel: "Hugging Face", version: { status: "ready", value: "abc123" }, updatedAt: { status: "ready", value: "2026-08-19T10:00:00.000Z" }, license: { status: "ready", value: "apache-2.0" }, publisherIdentity: { status: "unavailable", reason: "Publisher verification is unavailable." }, contentAudit: { status: "unavailable", reason: "Content audit is unavailable." }, compatibility: { status: "ready", value: "Comfortable here" }, model };
      const source = { schemaVersion: 1, source: "live", refreshedAt: "2026-08-20T10:00:00.000Z", sourceUpdatedAt: null, warning: null, items: publicItems };
      const publicPresentations = publicItems.map((item) => projectMarketplacePublicItem(item, "live"));
      const categories = [
        ["models", "Models", "Model packages from current providers.", { status: "ready", value: 1 }],
        ["templates", "Templates", "Reusable structures for content formats.", { status: "ready", value: 1 }],
        ["recipes", "Recipes", "Reusable production artifacts and transformations.", { status: "ready", value: 1 }],
        ["prompts", "Prompts", "Reusable generation instructions.", { status: "unavailable", reason: "Prompt catalog is unavailable in the current Desktop contract." }],
        ["components", "Components & Effects", "Reusable visual and audio building blocks.", { status: "unavailable", reason: "Components catalog is unavailable in the current Desktop contract." }],
        ["skills", "Skills", "Installable agent capabilities.", { status: "unavailable", reason: "Skills catalog is unavailable in the current Desktop contract." }],
      ].map(([category, label, purpose, count]) => ({ category, label, purpose, count, catalog: count.status === "ready" ? "ready" : "unavailable" }));
      const machine = { platform: "macOS", architecture: "arm64", cpu: "Apple M3 Max", totalMemoryBytes: 38654705664, freeDiskBytes: 214748364800, runtimes: [{ id: "ollama", label: "Ollama", available: true, detail: "Detected" }], installed: [{ id: "llama3.2:latest", name: "Llama 3.2", runtime: "ollama", digest: "sha256:abc", bytes: 2147483648, format: "GGUF", updatedAt: "2026-08-18T09:00:00.000Z" }] };
      const ready = (patch = {}) => ({ status: "ready", items: [modelItem, ...publicPresentations], categories, machine, publicSource: source, sourceErrors: [], sourceHealth: { publicLibrary: "ready", models: "ready" }, refreshing: false, query, ...patch });
      const catalog = { rootPath: "/safe/catalog", workspaces: [{ id: "workspace-1", name: "Launch Studio", projectCount: 1, unitCount: 0, sharedCount: 0 }], projects: [{ id: "workspace-1/project-1", workspaceId: "workspace-1", projectId: "project-1", name: "Launch", brief: "Launch campaign", status: "active", phase: "production", finalState: "working", platform: null, aspectRatio: null, spendUsd: null, finalCount: 0, sharedCount: 0, unitCount: 0, recentActivity: "2026-08-20T00:00:00.000Z" }] };
      const locations = {
        discover: { route: { kind: "discover" }, query },
        results: { route: { kind: "results" }, query: { ...query, text: "alpha" } },
        category: { route: { kind: "category", category: "models" }, query: { ...query, filters: { ...query.filters, category: "models" } } },
        "no-results-partial": { route: { kind: "results" }, query: { ...query, text: "missing", filters: { ...query.filters, source: "ralphy" } } },
        "model-detail": { route: { kind: "detail", itemId: "model:huggingface:Acme/alpha" }, query },
        "template-detail": { route: { kind: "detail", itemId: "template:clean-cut" }, query },
        "recipe-detail": { route: { kind: "detail", itemId: "recipe:voxel-dither" }, query },
        "prompt-shell": { route: { kind: "unavailable-detail", category: "prompts" }, query },
        "component-shell": { route: { kind: "unavailable-detail", category: "components" }, query },
        "skill-shell": { route: { kind: "unavailable-detail", category: "skills" }, query },
        installed: { route: { kind: "library", section: "installed" }, query },
        "update-conflict": { route: { kind: "library", section: "updates" }, query },
        collection: { route: { kind: "collection" }, query: { ...query, filters: { ...query.filters, category: "models" } } },
        offline: { route: { kind: "discover" }, query },
      };
      const normalize = (value) => ({ ...value, selectedItemId: value.route.kind === "detail" ? value.route.itemId : null, scrollTop: 0, focusId: null });
      const screenSnapshot = (state) => state === "no-results-partial" ? ready({ items: [], sourceErrors: [{ source: "civitai", scope: "model-provider", message: "rate limited" }], sourceHealth: { publicLibrary: "ready", models: "partial" }, query: locations[state].query }) : state === "offline" ? ready({ publicSource: { ...source, source: "cache", warning: "Network unavailable" }, sourceErrors: [{ source: "civitai", scope: "model-provider", message: "offline" }], sourceHealth: { publicLibrary: "ready", models: "partial" } }) : ready({ query: locations[state]?.query ?? query });
      function Screen({ state, sidebarVisible }) {
        const location = normalize(locations[state] ?? locations.discover);
        return <MarketplaceScreenView catalog={catalog} workRoute={{ kind: "project", workspaceId: "workspace-1", projectId: "project-1" }} location={location} sidebarVisible={sidebarVisible} snapshot={screenSnapshot(state)} onBack={noop} onNavigate={noop} onRememberLocation={noop} onRetry={noop} />;
      }
      function Downloads({ sidebarVisible }) {
        return <main className="marketplace-screen main-region" data-sidebar-visible={sidebarVisible ? "true" : "false"}><MarketplaceHeader title="Downloads" query={query} selectedCategory={null} sidebarVisible={sidebarVisible} refreshing={false} onQueryChange={noop} onSearch={noop} onOpenCategory={noop} /><div className="marketplace-scroll"><p className="marketplace-target-state">Source-backed download presentation</p><MarketplaceDownloads presentation={{ availability: "ready", jobs: [{ id: "active", label: "Alpha model", state: "active", progress: 42, nextAction: "Downloading verified package" }, { id: "failed", label: "Beta model", state: "failed", progress: null, nextAction: "Retry unavailable" }, { id: "done", label: "Gamma model", state: "completed", progress: 100, nextAction: "Load health unavailable" }] }} /></div></main>;
      }
      function Harness({ state, sidebar, chat, mode = "marketplace", sidebarWidth = 248 }) {
        const sidebarVisible = mode === "work" ? sidebar : sidebar && window.innerWidth > 1280;
        const workflow = state === "model-review" ? <MarketplaceActionReview kind="model-download" targets={marketplaceTargets(catalog, { kind: "project", workspaceId: "workspace-1", projectId: "project-1" }, "model-download")} itemLabel="Alpha model" onCancel={noop} /> : state === "target-chooser" ? <MarketplaceTargetChooser targets={marketplaceTargets(catalog, { kind: "project", workspaceId: "workspace-1", projectId: "project-1" }, "recipe-target")} onCancel={noop} /> : null;
        const marketplace = state === "downloads" ? <Downloads sidebarVisible={sidebarVisible} /> : <Screen state={state} sidebarVisible={sidebarVisible} />;
        return <div className={"workbench" + (sidebarVisible ? "" : " sidebar-collapsed") + (chat ? " has-right-panel" : "")} style={{ "--sidebar-w": sidebarWidth + "px", "--inspector-w": "336px" }}>
          {sidebarVisible && <ContextSidebar mode={mode} route={{ kind: "library" }} page="overview" pageActive={false} marketplaceRoute={(locations[state]?.route ?? locations.discover.route)} rootPath={null} workspaces={[]} workspaceId={null} pinnedWorkspaceIds={[]} canGoBack={false} canGoForward={false} onBack={noop} onForward={noop} onToggleSidebar={noop} onOpenSettings={noop} onSwitchMode={noop} onOpenMarketplaceRoute={noop} onOpenWorkspace={noop} onOpenPage={noop} />}
          <section className="main-shell"><div className="main-content-stage"><div className="app-mode-surface">{marketplace}</div></div></section>
          {chat && <aside className="utility-right-panel" aria-label="Agent chat"><header className="utility-panel-header">Agent chat</header></aside>}
          {workflow}
        </div>;
      }
      const root = createRoot(document.getElementById("root"));
      window.renderMarketplaceGeometry = (state, sidebar, chat) => root.render(<Harness key={state + sidebar + chat} state={state} sidebar={sidebar} chat={chat} />);
      window.renderMyWorkSidebarGeometry = (sidebarWidth) => root.render(<Harness key={"work" + sidebarWidth} state="discover" sidebar chat={false} mode="work" sidebarWidth={sidebarWidth} />);
    `);
    await build({
      entryPoints: [join(directory, "harness.tsx")],
      outfile: join(directory, "harness.js"),
      bundle: true,
      platform: "browser",
      format: "iife",
      target: "chrome130",
      jsx: "automatic",
      nodePaths: [join(process.cwd(), "node_modules")],
      define: { "process.env.NODE_ENV": '"production"', "import.meta.env": '{"MODE":"test","VITE_RALPHY_ENABLE_MOCKS":"true"}' },
      logLevel: "silent",
    });
    writeFileSync(join(directory, "layout.html"), `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'self' file:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' file:; img-src 'self' data: https:; media-src 'self' data: https:; connect-src 'none'; object-src 'none';"><style>html,body,#root{width:100%;height:100%;margin:0;overflow:hidden}</style>${styleLinks}</head><body><div id="root"></div><script>window.ralphy={loadLocalModelDetail:async()=>({provider:"huggingface",id:"Acme/alpha",name:"Alpha model",author:"Acme",task:"text-generation",modality:"text",modelType:"base",baseModel:"Alpha",license:"apache-2.0",gated:false,revision:"abc123",lastModified:"2026-08-19T10:00:00.000Z",downloads:0,likes:0,tags:["assistant","gguf"],iconUrl:null,previewUrl:null,providerUrl:"https://huggingface.co/Acme/alpha",recommendedPackage:{format:"GGUF",bytes:8589934592,files:["alpha.gguf"]},comfort:{level:"comfortable",label:"Comfortable here",score:4,runtime:"ollama",estimatedMemoryBytes:10737418240,evidence:["Fits available memory"]},state:"remote",permissions:[],readme:"# Model card\\n\\nSource-provided text.",previewUrls:[],files:[{name:"alpha.gguf",bytes:8589934592,format:"GGUF",recommended:true,warning:null}]}),openLocalModelProvider:async()=>{},copyText:async()=>{},refreshLocalModelMachine:async()=>{}}</script><script src="./harness.js"></script></body></html>`);
    writeFileSync(join(directory, "package.json"), JSON.stringify({ main: "main.cjs" }));
    writeFileSync(join(directory, "main.cjs"), `
      const { app, BrowserWindow } = require("electron");
      app.commandLine.appendSwitch("disable-gpu");
      const states = ${JSON.stringify(states)}, layouts = ${JSON.stringify(layouts)};
      app.whenReady().then(async () => {
        const win = new BrowserWindow({ show: false, width: 1440, height: 900, useContentSize: true });
        await win.loadFile(${JSON.stringify(join(directory, "layout.html"))});
        win.webContents.debugger.attach("1.3");
        await win.webContents.debugger.sendCommand("DOM.enable");
        await win.webContents.debugger.sendCommand("CSS.enable");
        await win.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
        const results = [];
        const waitForSize = async (width, height) => {
          const deadline = Date.now() + 2000;
          while (Date.now() < deadline) {
            const size = await win.webContents.executeJavaScript("({width:innerWidth,height:innerHeight})");
            if (size.width === width && size.height === height) return;
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
          throw new Error("Marketplace viewport did not settle at " + width + "x" + height);
        };
        const combinations = states.flatMap((state) => layouts.map((layout) => ({ state, ...layout })))
          .concat([{ state: "discover", name: "wide-manual-hidden", width: 1440, height: 900, sidebar: false, chat: false }])
          .concat(["model-detail","template-detail","recipe-detail"].flatMap((state) => ${JSON.stringify(detailLayouts)}.map((layout) => ({ state, ...layout }))));
        for (const value of combinations) {
          win.setContentSize(value.width, value.height);
          await waitForSize(value.width, value.height);
          await win.webContents.executeJavaScript(\`(async()=>{window.renderMarketplaceGeometry(\${JSON.stringify(value.state)},\${JSON.stringify(value.sidebar)},\${JSON.stringify(value.chat)});await new Promise(r=>setTimeout(r,20));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));})()\`);
          const renderedSidebar = value.sidebar && value.width > 1280;
          const selectors = renderedSidebar ? ["#app-mode-marketplace", ".sidebar-nav[aria-label='Marketplace categories'] .sidebar-nav-row", ".marketplace-search input", ".marketplace-filter-row .select-menu-trigger"] : [".marketplace-header-category-menu .select-menu-trigger", ".marketplace-search input", ".marketplace-filter-row .select-menu-trigger"];
          if (value.state === "results") selectors.push(".marketplace-result");
          if (value.state === "model-detail") selectors.push(".marketplace-model-actions button");
          if (["template-detail","recipe-detail"].includes(value.state)) selectors.push(".marketplace-public-actions button");
          if (["prompt-shell","component-shell","skill-shell"].includes(value.state)) selectors.push(".marketplace-unavailable-review button");
          if (["model-review","target-chooser"].includes(value.state)) selectors.push(".marketplace-workflow-header button", ".marketplace-target-list button", ".marketplace-workflow-footer button");
          const documentNode = await win.webContents.debugger.sendCommand("DOM.getDocument");
          for (const selector of selectors) {
            const node = await win.webContents.debugger.sendCommand("DOM.querySelector", { nodeId: documentNode.root.nodeId, selector });
            if (node.nodeId) await win.webContents.debugger.sendCommand("CSS.forcePseudoState", { nodeId: node.nodeId, forcedPseudoClasses: ["focus-visible"] });
          }
          results.push(await win.webContents.executeJavaScript(\`(()=>{
            const state=\${JSON.stringify(value.state)},layout=\${JSON.stringify(value.name)},focusSelectors=\${JSON.stringify(selectors)};
            const required=[".workbench",".main-shell",".main-content-stage",".app-mode-surface",".marketplace-screen",".marketplace-header",".marketplace-scroll"];
            const optional=[".marketplace-results-list",".marketplace-detail-route",".marketplace-downloads",".marketplace-workflow-window",".marketplace-workflow-header",".marketplace-workflow-body",".marketplace-workflow-footer"];
            const overflows=required.filter(s=>!document.querySelector(s)).map(s=>"missing:"+s);
            for(const selector of [...required,...optional]) for(const element of document.querySelectorAll(selector)) if(element.scrollWidth>element.clientWidth+1) overflows.push(selector+":"+element.scrollWidth+">"+element.clientWidth);
            const sidebar=document.querySelector(".context-sidebar"),screen=document.querySelector(".marketplace-screen"),chat=document.querySelector(".utility-right-panel"),workflow=document.querySelector(".marketplace-workflow-window");
            const scrollCandidates=[screen,document.querySelector(".main-content-stage"),document.querySelector(".app-mode-surface"),document.querySelector(".marketplace-scroll")].filter(Boolean);
            const scrollOwners=scrollCandidates.filter(e=>["auto","scroll"].includes(getComputedStyle(e).overflowY)).map(e=>e.className);
            const workflowParts=workflow?[workflow,workflow.querySelector(".marketplace-workflow-header"),workflow.querySelector(".marketplace-workflow-body"),workflow.querySelector(".marketplace-workflow-footer")].filter(Boolean):[];
            const workflowOwners=workflowParts.filter(e=>["auto","scroll"].includes(getComputedStyle(e).overflowY)).map(e=>e.className);
            const boundary=(workflow||document.querySelector(".marketplace-scroll")).getBoundingClientRect();
            const actions=[...document.querySelectorAll(".marketplace-model-actions button,.marketplace-public-actions button,.marketplace-unavailable-review button,.marketplace-workflow-footer button")];
            const actionFits=actions.every(e=>{const r=e.getBoundingClientRect();return r.left>=boundary.left-1&&r.right<=boundary.right+1&&r.top>=boundary.top-1&&r.bottom<=boundary.bottom+1;});
            const focus=focusSelectors.map(selector=>{const element=document.querySelector(selector),style=element?getComputedStyle(element):null;return{selector,width:style?parseFloat(style.outlineWidth):0,style:style?.outlineStyle??"missing"};});
            const motion=[".marketplace-category-card",".marketplace-result",".marketplace-loading i"].flatMap(selector=>{const element=document.querySelector(selector);if(!element)return[];const style=getComputedStyle(element);return[{selector,transition:style.transitionDuration,animation:style.animationName}];});
            const categoryMenu=document.querySelector(".marketplace-header-category-menu"),detailLayout=document.querySelector(".marketplace-model-detail-layout,.marketplace-public-detail-layout");
            const containerStyle=screen?getComputedStyle(screen):null,detailGrid=detailLayout?getComputedStyle(detailLayout).gridTemplateColumns:null;
            const active=document.activeElement,workflowSurface=document.querySelector('[data-instrument-overlay="target-chooser"]'),activeStyle=workflow&&(workflow.contains(active)||workflowSurface===active)?getComputedStyle(active):null;
            return{state,layout,width:innerWidth,height:innerHeight,overflows,sidebarCount:document.querySelectorAll(".context-sidebar").length,sidebarWidth:sidebar?.getBoundingClientRect().width??null,sidebarDisplay:sidebar?getComputedStyle(sidebar).display:null,sidebarVisible:screen?.dataset.sidebarVisible??null,categoryMenu:!!categoryMenu,categoryMenuDisplay:categoryMenu?getComputedStyle(categoryMenu).display:null,categoryMenuValue:categoryMenu?.querySelector(".select-menu-value")?.textContent.trim()??null,chatWidth:chat?.getBoundingClientRect().width??null,containerWidth:screen?.getBoundingClientRect().width??null,containerType:containerStyle?.containerType??null,containerName:containerStyle?.containerName??null,detailGrid,detailColumns:detailGrid?detailGrid.trim().split(" ").filter(Boolean).length:null,bodyOverflows:document.documentElement.scrollWidth>innerWidth+1||document.body.scrollWidth>innerWidth+1,pageScrollOwners:scrollOwners,workflowScrollOwners:workflowOwners,primaryActionsFit:actionFits,autoplayCount:document.querySelectorAll(".workbench audio[autoplay],.workbench video[autoplay],.marketplace-workflow-window audio[autoplay],.marketplace-workflow-window video[autoplay]").length,untrustedCount:document.querySelectorAll(".workbench script,.workbench iframe,.workbench object,.workbench embed,.marketplace-workflow-window script,.marketplace-workflow-window iframe,.marketplace-workflow-window object,.marketplace-workflow-window embed").length,lists:document.querySelectorAll(".marketplace-screen [role=list]").length,progress:document.querySelectorAll(".marketplace-screen progress").length,dialogs:document.querySelectorAll('[data-instrument-overlay="target-chooser"][role=dialog]').length,categoryLabels:[...document.querySelectorAll(".marketplace-result-category")].filter(e=>e.textContent.trim()).length,statusLabels:[...document.querySelectorAll(".marketplace-screen [role=status],.marketplace-screen [role=alert]")].filter(e=>e.textContent.trim()).length,trustLabels:[...document.querySelectorAll(".marketplace-detail-route h3,.marketplace-detail-route dt")].filter(e=>/Compatibility|License|Publisher identity|Content audit|provenance/i.test(e.textContent)).length,workflowBackground:workflow?getComputedStyle(workflow).backgroundColor:null,workflowInitialFocusLabel:activeStyle?(active.getAttribute("aria-label")||active.getAttribute("data-instrument-overlay")):null,workflowInitialFocusVisible:activeStyle?(active===workflowSurface||active.matches(":focus-visible")):null,workflowInitialFocusOutlineWidth:activeStyle?parseFloat(activeStyle.outlineWidth):null,workflowInitialFocusOutlineStyle:activeStyle?activeStyle.outlineStyle:null,focus,motion};
          })()\`));
        }
        const myWorkWidths=[];
        for(const width of [288,420]){
          await win.webContents.executeJavaScript("window.renderMyWorkSidebarGeometry("+width+")");
          await new Promise(resolve=>setTimeout(resolve,30));
          myWorkWidths.push(await win.webContents.executeJavaScript("Math.round(document.querySelector('.context-sidebar').getBoundingClientRect().width)"));
        }
        process.stdout.write("RALPHY_MARKETPLACE_GEOMETRY="+JSON.stringify({results,myWorkWidths})+"\\n");
        app.quit();
      }).catch(error=>{console.error(error);app.exit(1)});
    `);
    const electron = join(process.cwd(), "node_modules", ".bin", "electron");
    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn(electron, [directory], { env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: "true" } });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.once("error", reject);
      child.once("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(`Marketplace Electron geometry failed (${code}): ${stderr}`)));
    });
    const line = output.split("\n").find((candidate) => candidate.startsWith("RALPHY_MARKETPLACE_GEOMETRY="));
    if (!line) throw new Error(`Marketplace Electron geometry returned no results: ${output}`);
    return JSON.parse(line.slice("RALPHY_MARKETPLACE_GEOMETRY=".length)) as GeometrySmoke;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

let geometryRun: Promise<GeometrySmoke> | null = null;
const measuredMarketplaceGeometry = () => geometryRun ??= marketplaceGeometry();

describe("Marketplace production geometry", () => {
  test("fits all operational frames across sidebar, chat, narrow, and manual-hidden layouts", async () => {
    const { results, myWorkWidths } = await measuredMarketplaceGeometry();
    expect(results).toHaveLength(states.length * layouts.length + 1 + 3 * detailLayouts.length);
    expect(new Set(results.map(({ state }) => state))).toEqual(new Set(states));
    for (const result of results) {
      const expectedSize = result.layout === "detail-container-wide"
        ? [1160, 800]
        : result.layout === "detail-container-narrow-chat"
          ? [1080, 800]
          : result.layout.startsWith("wide")
            ? [1440, 900]
            : [1280, 800];
      expect([result.width, result.height]).toEqual(expectedSize);
      expect(result.overflows, `${result.state}/${result.layout}`).toEqual([]);
      expect(result.primaryActionsFit, `${result.state}/${result.layout}`).toBe(true);
      expect(result.autoplayCount, `${result.state}/${result.layout}`).toBe(0);
      expect(result.untrustedCount, `${result.state}/${result.layout}`).toBe(0);
      expect(result.bodyOverflows, `${result.state}/${result.layout}`).toBe(false);
      expect(result.pageScrollOwners, `${result.state}/${result.layout}`).toEqual(["marketplace-scroll"]);
      for (const focus of result.focus) {
        expect(focus.width, `${result.state}/${result.layout} ${focus.selector} (${focus.style})`).toBeGreaterThanOrEqual(2);
        expect(focus.style, `${result.state}/${result.layout} ${focus.selector}`).not.toBe("none");
      }
      for (const motion of result.motion) {
        expect(motion.transition, `${result.state}/${result.layout} ${motion.selector}`).toBe("0s");
        expect(motion.animation, `${result.state}/${result.layout} ${motion.selector}`).toBe("none");
      }
      const sidebarExpected = result.layout === "wide" || result.layout === "wide-chat";
      expect(result.sidebarCount, `${result.state}/${result.layout}`).toBe(sidebarExpected ? 1 : 0);
      expect(result.sidebarWidth, `${result.state}/${result.layout}`).toBe(sidebarExpected ? 248 : null);
      expect(result.sidebarDisplay, `${result.state}/${result.layout}`).toBe(sidebarExpected ? "flex" : null);
      expect(result.sidebarVisible, `${result.state}/${result.layout}`).toBe(sidebarExpected ? "true" : "false");
      expect(result.categoryMenu, `${result.state}/${result.layout}`).toBe(!sidebarExpected);
      expect(result.categoryMenuDisplay, `${result.state}/${result.layout}`).toBe(sidebarExpected ? null : "flex");
      expect(result.chatWidth, `${result.state}/${result.layout}`).toBe(result.layout.endsWith("chat") ? 336 : null);
    }
    expect(myWorkWidths).toEqual([288, 420]);
  }, 60_000);

  test("keeps workflow chrome fixed, exposes semantic states, and restores the narrow category control", async () => {
    const { results } = await measuredMarketplaceGeometry();
    for (const result of results.filter(({ state }) => state === "model-review" || state === "target-chooser")) {
      expect(result.dialogs, `${result.state}/${result.layout}`).toBe(1);
      expect(result.workflowScrollOwners, `${result.state}/${result.layout}`).toEqual(["marketplace-workflow-body"]);
      expect(result.workflowBackground, `${result.state}/${result.layout}`).not.toBe("rgba(0, 0, 0, 0)");
      expect(result.workflowInitialFocusLabel, `${result.state}/${result.layout}`).toBe("target-chooser");
      expect(result.workflowInitialFocusVisible, `${result.state}/${result.layout}`).toBe(true);
      expect(result.workflowInitialFocusOutlineWidth, `${result.state}/${result.layout}`).toBeGreaterThanOrEqual(2);
      expect(result.workflowInitialFocusOutlineStyle, `${result.state}/${result.layout}`).not.toBe("none");
    }
    expect(results.find(({ state, layout }) => state === "discover" && layout === "wide")!.lists).toBeGreaterThan(0);
    expect(results.find(({ state, layout }) => state === "downloads" && layout === "wide")!.progress).toBeGreaterThan(0);
    expect(results.find(({ state, layout }) => state === "results" && layout === "wide")!.categoryLabels).toBeGreaterThan(0);
    expect(results.find(({ state, layout }) => state === "model-detail" && layout === "wide")!.trustLabels).toBeGreaterThanOrEqual(2);
    expect(results.find(({ state, layout }) => state === "template-detail" && layout === "wide")!.trustLabels).toBeGreaterThanOrEqual(2);
    expect(results.find(({ state, layout }) => state === "offline" && layout === "wide")!.statusLabels).toBeGreaterThan(0);
    expect(results.find(({ state, layout }) => state === "collection" && layout === "narrow")!.categoryMenuValue).toBe("All categories");
    for (const [state, value] of [["model-detail", "Models"], ["template-detail", "Templates"], ["recipe-detail", "Recipes"]]) {
      expect(results.find((result) => result.state === state && result.layout === "narrow")!.categoryMenuValue).toBe(value);
      const wideDetail = results.find((result) => result.state === state && result.layout === "detail-container-wide")!;
      expect(wideDetail.detailColumns, `${state} at ${wideDetail.containerWidth}px ${wideDetail.containerName}/${wideDetail.containerType}: ${wideDetail.detailGrid}`).toBe(2);
      expect(results.find((result) => result.state === state && result.layout === "detail-container-narrow-chat")!.detailColumns).toBe(1);
    }
    const manual = results.find(({ layout }) => layout === "wide-manual-hidden")!;
    expect(manual.sidebarCount).toBe(0);
    expect(manual.sidebarVisible).toBe("false");
    expect(manual.categoryMenu).toBe(true);
  }, 60_000);
});

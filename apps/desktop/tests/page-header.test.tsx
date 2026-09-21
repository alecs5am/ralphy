import { act, useState } from "react";
import { Layers3 } from "../src/shared/ui/icons";
import { expect, test, vi } from "vitest";
import { PageHeader, PageHeaderHost } from "@/shared/ui/PageHeader";
import { AppDesk } from "@/app/ui/AppDesk";
import { ShellTopRow } from "@/app/layout/ShellTopRow";
import { createReactHost } from "./react-host";

vi.mock("@/pages/marketplace", () => ({ MARKETPLACE_SIDEBAR_WIDTH: 240, MarketplaceScreen: () => <p>Explore content</p> }));

test("page controls move between the shell and inline panel without resetting their page", async () => {
  const host = createReactHost();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  function Page() {
    const [count, setCount] = useState(0);
    return <main><PageHeader title="Units" icon={Layers3}><button onClick={() => setCount(count + 1)}>Refresh {count}</button></PageHeader><p>{count} refreshes</p></main>;
  }
  function Harness({ desk, active = true }: { desk: boolean; active?: boolean }) {
    const [headerHost, setHeaderHost] = useState<HTMLDivElement | null>(null);
    return <><header ref={setHeaderHost} /><PageHeaderHost.Provider value={desk ? headerHost : null}>{active ? <Page /> : <p>Another page</p>}</PageHeaderHost.Provider></>;
  }
  try {
    await act(async () => root.render(<Harness desk />));
    const shell = host.container.querySelector("header")!;
    expect(shell.querySelector("h1")?.textContent).toBe("Units");
    expect(host.container.querySelector("main")?.querySelector("h1")).toBeNull();
    await act(async () => shell.querySelector("button")!.dispatchEvent(new Event("click", { bubbles: true })));
    expect(host.container.querySelector("main")?.textContent).toContain("1 refreshes");
    await act(async () => root.render(<Harness desk={false} />));
    expect(shell.querySelector("button")).toBeNull();
    expect(host.container.querySelector("main")?.querySelector("button")?.textContent).toBe("Refresh 1");
    await act(async () => root.render(<Harness desk />));
    expect(shell.querySelector("button")?.textContent).toBe("Refresh 1");
    await act(async () => root.render(<Harness desk active={false} />));
    expect(shell.querySelector("button")).toBeNull();
  } finally { await act(async () => root.unmount()); host.restore(); }
});

test("saved chat views keep page actions in the original chrome and hide them in Explore", async () => {
  const host = createReactHost(), { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  function Page() {
    const [count, setCount] = useState(0);
    return <main><PageHeader title="Content" icon={Layers3}><button onClick={() => setCount(count + 1)}>Refresh {count}</button></PageHeader><p>{count} refreshes</p></main>;
  }
  function Harness({ mode = "work", framed = true }: { mode?: "work" | "marketplace"; framed?: boolean }) {
    const [header, setHeader] = useState<HTMLDivElement | null>(null);
    return <><ShellTopRow leftVisible agentVisible={false} onToggleLeft={() => {}} pageHeaderRef={setHeader} />
      <AppDesk mode={mode} viewFrameActive={framed} pageHeaderHost={header} catalog={null} workRoute={{ kind: "workspace", workspaceId: "studio" }} location={{ route: { kind: "discover" } }} marketplaceSidebarVisible={false} onBack={() => {}} onNavigate={() => {}} onRememberLocation={() => {}}><Page /></AppDesk></>;
  }
  try {
    await act(async () => root.render(<Harness />));
    const chrome = host.container.querySelector(".instrument-top-row")!;
    const page = host.container.querySelector("main")!;
    expect(chrome.querySelector("h1")?.textContent).toBe("Content");
    expect(page.querySelector(".page-header-inline")).toBeNull();
    await act(async () => chrome.querySelector("button")!.dispatchEvent(new Event("click", { bubbles: true })));
    await act(async () => root.render(<Harness framed={false} />));
    expect(chrome.querySelector("button")?.textContent).toBe("Refresh 1");
    expect(host.container.querySelector("main")).toBe(page);
    await act(async () => root.render(<Harness mode="marketplace" />));
    expect(chrome.querySelector("h1")).toBeNull();
    expect(host.container.querySelector(".app-mode-work")?.getAttribute("hidden")).toBe("");
    await act(async () => root.render(<Harness />));
    expect(chrome.querySelector("button")?.textContent).toBe("Refresh 1");
    expect(page.querySelector(".page-header-inline")).toBeNull();
  } finally { await act(async () => root.unmount()); host.restore(); }
});

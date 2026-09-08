import { act, useState } from "react";
import { Layers3 } from "../src/shared/ui/icons";
import { expect, test } from "vitest";
import { PageHeader, PageHeaderHost } from "@/shared/ui/PageHeader";
import { createReactHost } from "./react-host";

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

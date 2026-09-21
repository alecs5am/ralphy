import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test } from "vitest";
import { studioCatalog } from "../src/pages/marketplace/lib/studio-catalog";
import { MarketplaceTemplatePlan } from "../src/pages/marketplace/ui/MarketplaceTemplatePlan";
import { createReactHost } from "./react-host";

test("template sequences keep step selection and authored input/output instructions together", async () => {
  const templates = studioCatalog().filter((item) => item.category === "templates");
  const host = createReactHost();
  const root = createRoot(host.container as unknown as Element);
  try {
    for (const item of templates) {
      await act(async () => root.render(<MarketplaceTemplatePlan key={item.key} item={item} />));
      const steps = host.container.querySelectorAll(".explore-template-timeline button");
      expect(steps).toHaveLength(item.studio!.steps!.length);
      expect(steps[0]!.getAttribute("aria-pressed")).toBe("true");
      const firstInput = host.container.querySelector(".explore-beat-handoff dd")!.textContent;
      const last = steps.at(-1)!;
      await act(async () => last.dispatchEvent(new Event("click", { bubbles: true })));
      expect(last.getAttribute("aria-pressed")).toBe("true");
      expect(steps[0]!.getAttribute("aria-pressed")).toBe("false");
      const panel = host.container.querySelector(".explore-template-beat")!;
      expect(panel.getAttribute("aria-labelledby")).toBe(last.getAttribute("id"));
      expect(panel.querySelector("h3")?.textContent).toBe(item.studio!.steps!.at(-1));
      expect(panel.querySelectorAll("dt").map((node) => node.textContent)).toEqual(["Start with", "Make"]);
      expect(panel.querySelector("dd")!.textContent).not.toBe(firstInput);
      expect(panel.querySelectorAll("dd").every((node) => node.textContent.length > 20)).toBe(true);
      expect(host.container.querySelector(".explore-template-beat img")).toBeNull();
    }
  } finally { await act(async () => root.unmount()); host.restore(); }
});

test("template modules are visible before selecting their steps and open the actual referenced prompt", async () => {
  const catalog = studioCatalog();
  const original = catalog.find((item) => item.category === "templates")!;
  const prompts = catalog.filter((item) => item.category === "prompts").slice(0, 2);
  const item = { ...original, key: "studio:templates:baseball-broadcast", studio: { ...original.studio!,
    steps: ["Choose the photo", "Approve the still", "Animate the reaction", "Review and export"],
    modules: [{ key: prompts[0]!.key, step: 1, role: "Still-image prompt" }, { key: prompts[1]!.key, step: 2, role: "Motion prompt" }],
  } };
  const opened: string[] = [];
  const host = createReactHost();
  const root = createRoot(host.container as unknown as Element);
  try {
    await act(async () => root.render(<MarketplaceTemplatePlan item={item} items={catalog} onOpenItem={(key) => opened.push(key)} />));
    const rows = host.container.querySelectorAll(".explore-template-module");
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.getAttribute("data-active"))).toEqual(["false", "false"]);
    expect(host.container.querySelectorAll(".explore-template-modules img")).toHaveLength(2);
    expect(host.container.querySelectorAll("button button")).toHaveLength(0);
    expect(host.container.querySelector(".explore-template-inputs")!.textContent).toContain("Portrait photo");
    expect(host.container.querySelector(".explore-template-output")!.textContent).toContain("10-second 16:9 reaction video");
    const steps = host.container.querySelectorAll(".explore-template-timeline button");
    await act(async () => steps[1]!.dispatchEvent(new Event("click", { bubbles: true })));
    expect(rows.map((row) => row.getAttribute("data-active"))).toEqual(["true", "false"]);
    expect(host.container.querySelector(".explore-template-beat")!.textContent).toContain("GPT Image");
    await act(async () => rows[0]!.querySelector("button")!.dispatchEvent(new Event("click", { bubbles: true })));
    expect(opened).toEqual([prompts[0]!.key]);
    await act(async () => steps[2]!.dispatchEvent(new Event("click", { bubbles: true })));
    expect(rows.map((row) => row.getAttribute("data-active"))).toEqual(["false", "true"]);
    expect(host.container.querySelector(".explore-template-beat")!.textContent).toContain("approved frame");
    await act(async () => rows[1]!.querySelector("button")!.dispatchEvent(new Event("click", { bubbles: true })));
    expect(opened).toEqual(prompts.map((prompt) => prompt.key));

    const missing = { ...item, studio: { ...item.studio, modules: [{ key: "studio:prompts:unavailable-module", step: 1, role: "Still-image prompt" }] } };
    await act(async () => root.render(<MarketplaceTemplatePlan item={missing} onOpenItem={(key) => opened.push(key)} />));
    const unavailable = host.container.querySelector(".explore-template-module button")!;
    expect(unavailable.disabled).toBe(true);
    expect(unavailable.textContent).toContain("Module unavailable");
  } finally { await act(async () => root.unmount()); host.restore(); }
});

import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { MarketplacePublicItemDetail, marketplaceAgentRequest, studioCatalog } from "@/pages/marketplace";
import { bridge } from "@/shared/api/ipc";
import { fillPrompt, promptVariables } from "../src/pages/marketplace/lib/prompt-variables";
import { promptDirections } from "../src/pages/marketplace/lib/prompt-directions";
import { createReactHost } from "./react-host";

test("fills explicit prompt slots literally and sends exactly the customized prompt to clipboard and chat", async () => {
  expect(promptVariables("[subject] and [subject] in [setting], [123], ordinary text")).toEqual(["subject", "setting"]);
  expect(fillPrompt("[subject], [setting]", { subject: "$& <script>literal</script>", setting: " " })).toBe("$& <script>literal</script>, [setting]");
  const item = studioCatalog().find((entry) => entry.key === "studio:prompts:human-editorial")!;
  const copy = vi.spyOn(bridge, "copyText").mockResolvedValue();
  const use = vi.fn();
  const host = createReactHost();
  const root = createRoot(host.container as unknown as Element);
  const button = (text: string) => host.container.querySelectorAll("button").find((node) => node.textContent === text)!;
  try {
    await act(async () => root.render(<MarketplacePublicItemDetail item={item} onBack={vi.fn()} onUse={use} />));
    const input = host.container.querySelectorAll("input").find((node) => node.getAttribute("placeholder") === "Your subject")!;
    Object.assign(input, { value: "an artist holding $& <script>" });
    await act(async () => input.dispatchEvent(new Event("input", { bubbles: true })));
    const expected = item.studio!.body.replace("[subject]", "an artist holding $& <script>");
    // String.replace interprets $& in string replacements; the source must remain literal instead.
    const literal = fillPrompt(item.studio!.body, { subject: "an artist holding $& <script>" });
    expect(literal).not.toBe(expected);
    expect(host.container.querySelector(".explore-prompt-document")?.textContent).toContain("an artist holding $& <script>");
    expect(host.container.querySelector("script")).toBeNull();
    await act(async () => button("Copy prompt").dispatchEvent(new Event("click", { bubbles: true })));
    expect(copy).toHaveBeenLastCalledWith(literal);
    await act(async () => button("Use in chat").dispatchEvent(new Event("click", { bubbles: true })));
    const attachment = marketplaceAgentRequest(use.mock.calls[0]![0]).attachment;
    const data = JSON.parse(attachment.instructions!.split("\n\n").at(-1)!);
    expect(data.instructions).toBe(literal);
    expect(data.artifact).toBe(literal);
    await act(async () => button("Clear fields").dispatchEvent(new Event("click", { bubbles: true })));
    await act(async () => button("Copy prompt").dispatchEvent(new Event("click", { bubbles: true })));
    expect(copy).toHaveBeenLastCalledWith(item.studio!.body);
    const sample = host.container.querySelector(".explore-effect-preview img")?.getAttribute("src");
    const direction = promptDirections(item)[1]!;
    const choose = host.container.querySelectorAll(".explore-direction-choice").find((node) => node.querySelector("strong")?.textContent === direction.label)!;
    await act(async () => choose.dispatchEvent(new Event("click", { bubbles: true })));
    expect(choose.getAttribute("aria-pressed")).toBe("true");
    expect(host.container.querySelector(".explore-prompt-document")?.textContent).toContain(direction.prompt.split("\n\n")[1]);
    expect(host.container.querySelector(".explore-effect-preview img")?.getAttribute("src")).toBe(sample);
    await act(async () => button("Copy prompt").dispatchEvent(new Event("click", { bubbles: true })));
    expect(copy).toHaveBeenLastCalledWith(direction.prompt);
    await act(async () => button("Use in chat").dispatchEvent(new Event("click", { bubbles: true })));
    const configured = JSON.parse(marketplaceAgentRequest(use.mock.calls.at(-1)![0]).attachment.instructions!.split("\n\n").at(-1)!);
    expect(configured.instructions).toBe(direction.prompt);
    expect(configured.artifact).toBe(direction.prompt);
    Object.assign(input, { value: "a printmaker in a plain linen shirt" });
    await act(async () => input.dispatchEvent(new Event("input", { bubbles: true })));
    await act(async () => button("Copy prompt").dispatchEvent(new Event("click", { bubbles: true })));
    expect(copy).toHaveBeenLastCalledWith(fillPrompt(direction.source, { ...direction.values, subject: "a printmaker in a plain linen shirt" }));
  } finally { await act(async () => root.unmount()); host.restore(); vi.restoreAllMocks(); }
});

test("each studio prompt offers distinct filled directions without changing its base document", () => {
  const prompts = studioCatalog().filter((item) => item.category === "prompts");
  expect(prompts).toHaveLength(10);
  for (const item of prompts) {
    const source = item.studio!.body;
    const directions = promptDirections(item);
    expect(directions).toHaveLength(3);
    expect(new Set(directions.map(({ prompt }) => prompt)).size).toBe(3);
    for (const direction of directions) {
      expect(promptVariables(direction.prompt)).toEqual([]);
      expect(direction.prompt).toBe(fillPrompt(direction.source, direction.values));
      expect(direction.intent).toBeTruthy();
    }
    expect(item.studio!.body).toBe(source);
  }
  expect(promptDirections(studioCatalog().find((item) => item.category === "templates"))).toEqual([]);
});

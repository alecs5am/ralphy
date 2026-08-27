import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { MarkdownView } from "@/shared/ui/MarkdownView";
import { createReactHost } from "./react-host";

describe("MarkdownView", () => {
  test("renders common GFM and safe model-card HTML without flattening tables", () => {
    const markup = renderToStaticMarkup(<MarkdownView baseUrl="https://huggingface.co/Qwen/Qwen3.8-27B/resolve/main/" markdown={`---
library_name: transformers
---

> [!NOTE]
> Check the provider card.

| Model | Score |
| --- | ---: |
| Small | 73.0 |

<style>.vl-table { color: red }</style>
<table class="vl-table" onclick="alert('no')">
  <thead><tr><th>Task</th><th>Model A</th><th>Model B</th></tr></thead>
  <tbody>
    <tr><td colspan="3">Coding</td></tr>
    <tr><td><strong>Terminal Bench</strong><br>Agentic coding</td><td>73.0</td><td>63.4</td></tr>
  </tbody>
</table>

<details open><summary>Evaluation notes</summary><p>Measured on the public suite.</p></details>

![Architecture](assets/architecture.png)
<a href="javascript:alert('no')">Unsafe link</a>

<script>alert('no')</script>
`} />);

    expect(markup).not.toContain("library_name");
    expect(markup).toContain("markdown-alert markdown-alert-note");
    expect(markup.match(/<table/g)).toHaveLength(2);
    expect(markup).toContain('<td colSpan="3">Coding</td>');
    expect(markup).toContain("<details open=\"\"><summary>Evaluation notes</summary>");
    expect(markup).not.toContain("onclick");
    expect(markup).toContain('src="https://huggingface.co/Qwen/Qwen3.8-27B/resolve/main/assets/architecture.png"');
    expect(markup).not.toContain("javascript:");
    expect(markup).not.toContain("<style");
    expect(markup).not.toContain("<script");
  });

  test("replaces failed Markdown and allowlisted HTML images with text and resets for new URLs", async () => {
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    const renderImages = (suffix: string) => root.render(<MarkdownView markdown={`![Markdown preview](https://provider.example/${suffix}-markdown.png)\n\n<img src="https://provider.example/${suffix}-html.png" alt="HTML preview">`} />);
    try {
      await act(async () => renderImages("first"));
      const images = host.container.querySelectorAll("img");
      expect(images).toHaveLength(2);
      await act(async () => images.forEach((image) => image.dispatchEvent(new Event("error"))));
      expect(host.container.querySelectorAll("img")).toHaveLength(0);
      expect(host.container.textContent).toContain("[image unavailable: Markdown preview]");
      expect(host.container.textContent).toContain("[image unavailable: HTML preview]");

      await act(async () => renderImages("second"));
      expect(host.container.querySelectorAll("img").map((image) => image.getAttribute("src"))).toEqual([
        "https://provider.example/second-markdown.png",
        "https://provider.example/second-html.png",
      ]);
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });
});

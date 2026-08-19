import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { MarkdownView } from "../src/components/MarkdownView";

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
});

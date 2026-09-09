import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { ContextUsage } from "../src/pages/context/ui/ContextUsage";

test("context usage keeps unknown distinct from zero and caps the measured meter", () => {
  const unknown = renderToStaticMarkup(<ContextUsage usage={null} provider="claude" />);
  expect(unknown).toContain("No usage reported yet");
  expect(unknown).not.toContain('role="meter"');
  const zero = renderToStaticMarkup(<ContextUsage usage={{ inputTokens: 0, totalTokens: 0, contextWindow: 100 }} provider="codex" />);
  expect(zero).toContain("0 input tokens");
  expect(zero).toContain('style="width:0%"');
  const measured = renderToStaticMarkup(<ContextUsage usage={{ inputTokens: 120, totalTokens: 150, contextWindow: 100 }} provider="codex" />);
  expect(measured).toContain("120 input tokens");
  expect(measured).toContain('aria-valuenow="100"');
  expect(measured).toContain("not a forecast");
});

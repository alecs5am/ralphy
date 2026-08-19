AiBrandIcon from ralphy-desktop. Use via `window.RalphyDesktop.AiBrandIcon` (bundle loaded from the root `_ds_bundle.js`). Wrap the tree in `<PreviewCanvas>` (full provider chain in README.md — components read theme/i18n from that context).

## Examples

### Providers

```jsx
() => (
  <Wrap>
    <Cell label="claude">
      <AiBrandIcon provider="claude" />
    </Cell>
    <Cell label="codex">
      <AiBrandIcon provider="codex" />
    </Cell>
    <Cell label="openrouter">
      <AiBrandIcon provider="openrouter" />
    </Cell>
  </Wrap>
);

// The brand is inferred from the model id, so a single OpenRouter session shows
// the actual vendor behind each call.
```

### InferredFromModelId

```jsx
() => (
  <Wrap>
    <Cell label="openai/gpt-5.4-image-2">
      <AiBrandIcon provider="openrouter" model="openai/gpt-5.4-image-2" />
    </Cell>
    <Cell label="google/gemini-3-pro">
      <AiBrandIcon provider="openrouter" model="google/gemini-3-pro" />
    </Cell>
    <Cell label="deepseek/deepseek-v4">
      <AiBrandIcon provider="openrouter" model="deepseek/deepseek-v4" />
    </Cell>
    <Cell label="meta-llama/llama-4-70b">
      <AiBrandIcon provider="openrouter" model="meta-llama/llama-4-70b" />
    </Cell>
    <Cell label="x-ai/grok-4">
      <AiBrandIcon provider="openrouter" model="x-ai/grok-4" />
    </Cell>
    <Cell label="qwen/qwen3-max">
      <AiBrandIcon provider="openrouter" model="qwen/qwen3-max" />
    </Cell>
  </Wrap>
)
```

### Sizes

```jsx
() => (
  <Wrap>
    <Cell label="14">
      <AiBrandIcon provider="claude" size={14} />
    </Cell>
    <Cell label="18 — default">
      <AiBrandIcon provider="claude" />
    </Cell>
    <Cell label="24">
      <AiBrandIcon provider="claude" size={24} />
    </Cell>
  </Wrap>
)
```

AgentChatPanel from ralphy-desktop. Use via `window.RalphyDesktop.AgentChatPanel` (bundle loaded from the root `_ds_bundle.js`). Wrap the tree in `<PreviewCanvas>` (full provider chain in README.md — components read theme/i18n from that context).

## Examples

### Conversation

```jsx
() => (
  <Panel>
    <AgentChatPanel
      chat={chatController()}
      workspace={workspaces[0]}
      project={projects[0]}
      onClose={noop}
    />
  </Panel>
);

// A fresh chat, before the first prompt.
```

### EmptyState

```jsx
() => (
  <Panel>
    <AgentChatPanel
      chat={emptyChat()}
      workspace={workspaces[0]}
      project={projects[0]}
      onClose={noop}
    />
  </Panel>
);

// Mid-run: the composer is locked and the stop affordance takes over.
```

### Running

```jsx
() => (
  <Panel>
    <AgentChatPanel
      chat={runningChat()}
      workspace={workspaces[0]}
      project={projects[0]}
      onClose={noop}
    />
  </Panel>
);

// The bridge is unreachable — the panel surfaces the connection error.
```

### Disconnected

```jsx
() => (
  <Panel>
    <AgentChatPanel
      chat={disconnectedChat()}
      workspace={workspaces[0]}
      project={null}
      onClose={noop}
    />
  </Panel>
)
```

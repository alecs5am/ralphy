# Ralphy Agent Chat

## Scope

Replace the mocked right-panel conversation with a working Ralphy agent chat.
The first provider is the locally installed Claude CLI in non-interactive
streaming mode. It supplies the same agent loop, tools, project instructions,
skills, hooks, MCP servers, and local session storage as Claude Code without
adding another runtime dependency.

Codex and OpenRouter are explicitly outside this implementation. OpenRouter
does not provide the Claude agent harness, and adding a provider abstraction
before a second implementation exists would be speculative. The chat IPC is
provider-neutral enough to add another runtime later without changing the UI.

## Authentication

The app supports both Claude subscription OAuth and Anthropic API-key billing.

- Subscription mode uses credentials created by `claude auth login --claudeai`
  and stored by the local Claude installation. The child process receives no
  `ANTHROPIC_API_KEY`, provider override, or bearer-token variables.
- API-key mode uses a key entered in the chat connection view or inherited from
  `ANTHROPIC_API_KEY`. An entered key is encrypted with Electron `safeStorage`
  and the encrypted value is stored under the app user-data directory.
- The renderer can query whether the CLI, subscription login, and API key are
  available, but it can never read a stored key back from the main process.
- `claude auth login` runs only after an explicit user action.

Anthropic paused the proposed separate Agent SDK monthly credit on June 15,
2026. Subscription-backed Agent SDK, `claude -p`, and third-party app usage
currently draw from subscription usage limits. The UI must not promise a
separate credit pool.

## Agent Runtime

The Electron main process owns one active Claude run. Each user turn spawns the
local CLI with `-p`, `--output-format stream-json`, `--verbose`, and
`--include-partial-messages`. Follow-up turns use the session id emitted by the
previous run with `--resume`.

The process cwd is the parent of the selected `.ralphy` directory. This is the
Ralphy repository root, so Claude discovers the real `AGENTS.md`, `CLAUDE.md`,
project settings, skills, hooks, and MCP configuration. The active workspace
and project are supplied as bounded contextual metadata on each turn. A project
reference is resolved and authorized in the main process before its path is
included.

The chat is global to the active `.ralphy` library. Switching workspace or
project changes the next-turn context without destroying the conversation.
Changing the library starts or restores that library's own conversation.

## Permissions

The composer exposes three modes:

- `Auto` is the default and delegates tool approval to Claude's classifier.
- `Plan` permits investigation without edits.
- `Full access` uses `bypassPermissions` and is visibly selected before any
  unrestricted Bash or filesystem action runs.

The app never silently upgrades a conversation to Full access. The selected
mode is sent with every turn and validated in the main process.

## Streaming And State

The main process normalizes CLI JSONL into bounded chat events: session start,
text delta, tool start, tool result, completion, and error. Malformed or
oversized lines are ignored or reported without crashing Electron. stderr is
bounded and only becomes a user-visible error when the run fails.

The React app owns chat state above the conditionally visible right panel, so
closing the panel does not unsubscribe from a running agent. User and assistant
messages, tool rows, the current session id, and the chosen modes are persisted
per `.ralphy` root in bounded local storage. A Stop action terminates the active
CLI process; New chat clears the local session id without deleting Claude's
on-disk transcript.

## Interface

The existing right panel remains a neutral work surface separated from the
main area by one border. Assistant messages are borderless prose with compact
inline tool activity. User messages retain a restrained filled bubble. The
composer provides multiline input, Enter-to-send, Shift+Enter for newline,
Send/Stop, the auth source, and the permission mode.

When no usable credential exists, the panel shows a focused connection state
with two actions: sign in through the local Claude CLI or enter an Anthropic
API key. Authentication failures remain in the panel and never crash or reload
the media workbench.

## Acceptance

- A logged-in local Claude subscription can stream a real response with no API
  key present.
- A stored or inherited Anthropic API key can run the same chat explicitly in
  API-key mode.
- The agent discovers Ralphy instructions and can use Bash, file tools, skills,
  and MCP according to the selected permission mode.
- Tool activity and partial text appear while a run is active; Stop cancels it.
- Closing and reopening the right panel preserves the active run and messages.
- Restarting the app restores the library conversation and resumes its session.
- Workspace/project changes affect subsequent context without relying on the
  deprecated `activeWorkspace` setting.
- Unit tests, typecheck, build, Electron smoke, packaged launch, and visual
  inspection pass. Real inference is verified when a credential is available.

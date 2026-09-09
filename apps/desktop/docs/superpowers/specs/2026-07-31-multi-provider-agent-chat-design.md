# Multi-Provider Ralphy Agent Chat

## Scope

Extend the existing right-panel agent from one Claude conversation into a
provider-aware chat workspace. The supported providers are Claude, Codex, and
OpenRouter. Every provider remains a full local coding agent with repository
instructions, skills, Bash, file access, MCP, and the active Ralphy context.

`Provider` is the product term. A provider identifies the runtime and billing
route; a model is selected independently inside that provider.

## Runtime

Claude continues to use the installed Claude Code CLI and its existing
stream-json session contract.

Codex uses the installed `codex exec --json` command. It reuses the user's
saved ChatGPT authentication, runs from the repository containing the selected
`.ralphy` directory, and resumes follow-up turns by thread UUID.

OpenRouter uses the same Codex CLI agent harness with invocation-only Codex
configuration overrides for the OpenRouter Responses endpoint. The app never
modifies `~/.codex/config.toml`. Its API key is supplied only to the child
process through `OPENROUTER_API_KEY`, so OpenRouter gets the same local agent
tools as Codex without a second shell execution implementation.

Only one agent turn runs at once. Users may switch chats while it runs; events
continue updating the originating chat. Sending in another chat remains
disabled until the active turn completes or is stopped.

## Authentication And Secrets

- Claude keeps subscription and encrypted Anthropic API-key modes.
- Codex reports the installed CLI and `codex login status`; no OpenAI key is
  copied into Ralphy Media.
- OpenRouter accepts an `sk-or-...` key or an inherited
  `OPENROUTER_API_KEY`. Entered keys are encrypted with Electron `safeStorage`
  under app user data and are write-only from the renderer.
- Provider status exposes booleans and labels, never secret values.

## Models

Claude offers the CLI aliases `opus`, `sonnet`, and `fable`.

Codex reads the installed CLI's bounded `~/.codex/models_cache.json`, showing
only picker-visible models. If the cache is absent or invalid, a `Codex
default` option omits `--model` and lets the user's Codex configuration decide.

OpenRouter loads its searchable catalog from `GET /api/v1/models`, restricted
to text models with tool calling. The response is bounded and validated before
reaching the renderer. A default model is selected from the returned catalog;
the user can search by display name or slug.

The model belongs to a chat and can change between turns. Provider changes on
an empty chat update that chat; changing provider after the first message
creates a new chat so incompatible Claude and Codex session identifiers are
never mixed.

## Chat State

Each `.ralphy` library owns a bounded collection of chats. A chat stores:

- local id, title, provider, model, and updated timestamp;
- normalized user, assistant, tool, and error entries;
- provider session UUID, permission mode, and latest cost when available.

The first user message becomes the title. The header exposes a custom recent
chat menu, New chat, and the active provider/model. Existing version-1 Claude
state is migrated into one Claude chat without deleting the legacy key until
the new state is successfully written.

All renderer-to-main requests carry both `chatId` and provider. Main validates
the provider, model, UUID, prompt, permission mode, library epoch, and optional
project reference. Every streamed event returns `rootPath` and `chatId`, which
prevents output from entering whichever chat happens to be visible.

## Interface

The right panel keeps its borderless conversational layout. The header becomes
a compact chat switcher with provider identity and model metadata. New chat,
panel close, provider, model, and permission controls use custom menus rather
than native selects.

The provider picker is available before connection. Claude shows its existing
login/API-key flow, Codex shows the detected ChatGPT account state, and
OpenRouter shows a masked key form. Model search stays inside its popup and
does not add a permanent toolbar row.

## Acceptance

- Codex can send and resume a real full-access turn using the current ChatGPT
  login, with normalized messages and tool activity.
- OpenRouter can use any compatible catalog model through the Codex agent
  harness after an encrypted key is configured.
- Claude behavior and persisted history continue to work.
- Provider and model selectors clearly show the current choices.
- At least two chats can be created, switched, restored after relaunch, and
  updated independently, including when an event arrives for an inactive chat.
- Existing single-chat state migrates without losing entries.
- Tests cover request validation, CLI arguments, event normalization, secrets,
  model parsing, migration, and chat switching.
- Typecheck, tests, build, Electron smoke, packaged launch, and visual
  inspection pass.

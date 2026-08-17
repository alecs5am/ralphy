# Ralphy Media

Native macOS browser for generated files inside a Ralphy `.ralphy` directory.

## Run

```bash
swift run RalphyMedia /Users/maximovchinnikov/github/ralphy/ralphy/.ralphy
```

Or run without an argument and pick the `.ralphy` folder from the open panel:

```bash
swift run RalphyMedia
```

## Features

- indexes all workspace project media under `.ralphy/workspaces/*/projects/*`
- watches the selected `.ralphy` folder and rescans on file changes
- filters by workspace, project, type, search, favorite, and rejected state
- adjustable media grid
- preview for images, video/audio, and text
- rating, favorite, rejected/slop flag, tags, and notes
- Copy for Agent markdown feedback copied to the clipboard
- Open, Reveal in Finder, and Move to Trash

Annotations are stored in `.ralphy/media-library/library.json`. Generated files
are not edited for review metadata.

## Verify

```bash
swift test
swift build
swift run RalphyMedia --scan-only /Users/maximovchinnikov/github/ralphy/ralphy/.ralphy
```

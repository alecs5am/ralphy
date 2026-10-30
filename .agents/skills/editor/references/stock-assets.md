# Stock overlay assets: `ralphy stock`

Finance, investing and news shorts lean on collected overlays: brand logos, photos of people and places, b-roll, SFX (whoosh, cash register, ding) and a music bed. Collect them with `ralphy stock`, not by saving files from a browser: the verb records where each file came from, its license and its credit line, and puts the file where `index.html` can load it (#596).

## Flow

```bash
# 1. Find candidates (JSON; nothing is downloaded)
ralphy stock search nvidia --kind logo
ralphy stock search "stock exchange trading floor" --kind video --orientation vertical
ralphy stock search "cash register" --kind audio --limit 5
ralphy stock search "lofi beat" --kind audio --source openverse

# 2. Pull the ones you will use (Artifact revision + file in the Project tree, $0)
ralphy stock pull simple-icons:nvidia commons:File:NYSE_floor.jpg --project <id>
ralphy stock pull archive:<identifier> --project <id> --slot broll-trading-floor

# 3. Put the credits in the post copy
ralphy stock credits --project <id> --markdown
```

- `--kind` is `image | video | audio | logo`. Default sources: image `openverse, commons, pexels`; video `commons, archive, pexels`; audio `openverse, commons`; logo `simple-icons, commons`. Pexels needs a free `PEXELS_API_KEY` (`ralphy provider auth set pexels --stdin`) and is skipped with a note without one.
- The default `--license commercial` keeps only items that allow commercial use AND modification (no NC, no ND). `--license open` also drops ShareAlike (CC BY-SA, GFDL), leaving public domain, CC0, CC BY and Pexels: prefer it for a published video, since a BY-SA overlay puts share-alike terms on the whole cut. Pass `--license any` only for a non-commercial, unedited use and say so to the user. `stock pull` applies the same filter (default `commercial`).
- Each source gets 10 s to answer (`--timeout <sec>`); a slower or failing source is listed in `sources` with its error while the others still return results.
- Read each candidate's `previewUrl`, size or duration, `license` and `notes` before pulling. Notes carry caveats the license name does not: trademarks, ShareAlike, identifiable people, GFDL.
- Pull by the `id` the search printed. `pull` asks the source again, so the license recorded is the current one.

## Where the files land

| Kind | Folder in the Project tree |
|---|---|
| image, logo | `artifacts/images/` |
| video | `artifacts/videos/` |
| audio the source calls music, or longer than 30 s | `artifacts/music/` |
| other audio (sound effects, short clips) | `artifacts/sfx/` |

The file is `<slot><ext>` (default slot `logo-<brand>` for Simple Icons, else `stock-<title>-<hash>`); reference it from `index.html` by the `path` the pull printed, e.g. `<img src="artifacts/images/logo-nvidia.svg">`. A second pull never overwrites: identical bytes reuse the file, new bytes get `<slot>.v2<ext>`.

Simple Icons logos are single-color SVGs filled with the brand hex. Commons and Archive video is already transcoded to at most 1080 lines where the source offers it; trim long b-roll with `ralphy video extract-segment` before composing.

## Credits and trademarks

- Every pulled item has an attribution line. `stock credits` prints the block for the caption or description: required credits first, then items whose license asks for none (Pexels, CC0, public domain). Paste the block whenever any item has `attributionRequired: true`; including the courtesy lines is good practice.
- A logo is a trademark whatever its copyright license: use it to name the company the video talks about, never to suggest the brand made, sponsors or endorses the video.
- A photo of an identifiable person can carry personality rights even under CC0: keep such shots editorial.

# Stock overlay assets: `ralphy stock`

Finance, investing and news shorts lean on collected overlays: brand logos, photos of people and places, b-roll, SFX (whoosh, cash register, ding) and a music bed. Montage edits also need motion and cut-outs: animated emoji, Lottie, GIF / WebP / WebM micro-animations, transparent stickers and icons. Collect them with `ralphy stock`, not by saving files from a browser: the verb records where each file came from, its license and its credit line, and puts the file where `index.html` can load it (#596, #597).

## Flow

```bash
# 1. Find candidates (JSON; nothing is downloaded)
ralphy stock search nvidia --kind logo
ralphy stock search "stock exchange trading floor" --kind video --orientation vertical
ralphy stock search "cash register" --kind audio --limit 5
ralphy stock search "lofi beat" --kind audio --source openverse
ralphy stock search fire --kind animation                # Noto Lottie, animated SVG icons, Commons GIF / WebM
ralphy stock search "money bag" --kind sticker           # Fluent 3D emoji, Noto static emoji, Pixabay vectors
ralphy stock search "trending up" --kind icon --license open

# 2. Pull the ones you will use (Artifact revision + file in the Project tree, $0)
ralphy stock pull simple-icons:nvidia commons:File:NYSE_floor.jpg --project <id>
ralphy stock pull archive:<identifier> --project <id> --slot broll-trading-floor
ralphy stock pull noto-emoji:lottie:1f525 fluent-emoji:3d:money-bag --project <id>

# 3. Put the credits in the post copy
ralphy stock credits --project <id> --markdown
```

- `--kind` is `image | video | audio | logo | animation | sticker | icon`. `animation` means Lottie JSON, animated WebP / GIF / SVG and WebM clips of at most 20 s; `sticker` means transparent PNG / SVG objects and emoji; `icon` means SVG icons.
- Default sources: image `openverse, commons, pexels, pixabay`; video `commons, archive, pexels, pixabay`; audio `openverse, commons`; logo `simple-icons, commons`; animation `noto-emoji, iconify, commons`; sticker `fluent-emoji, noto-emoji, pixabay`; icon `iconify`. Pexels and Pixabay need a free key (`PEXELS_API_KEY`, `PIXABAY_API_KEY`; `ralphy provider auth set pexels|pixabay --stdin`) and are skipped with a note without one.
- The default `--license commercial` keeps only items that allow commercial use AND modification (no NC, no ND). `--license open` also drops ShareAlike (CC BY-SA, GFDL, MPL), leaving public domain, CC0, CC BY, MIT / Apache, Pexels and Pixabay: prefer it for a published video, since a BY-SA overlay puts share-alike terms on the whole cut. Pass `--license any` only for a non-commercial, unedited use or a private reference, and say so to the user. `stock pull` applies the same filter (default `commercial`).
- Each source gets 10 s to answer (`--timeout <sec>`); a slower or failing source is listed in `sources` with its error while the others still return results. The first Fluent UI Emoji search builds its keyword index once (about 20-45 s, cached under `.ralphy/cache/stock/`) and gets a longer deadline for that one run.
- Read each candidate's `previewUrl`, size or duration, `license` and `notes` before pulling. Notes carry caveats the license name does not: trademarks, ShareAlike, identifiable people, GFDL, GPL / font licenses, monotone icons drawn in `currentColor`, and the other formats of the same emoji.
- Pull by the `id` the search printed. `pull` asks the source again, so the license recorded is the current one.

## Sources for motion and cut-outs

| Source | What | License | Ids |
|---|---|---|---|
| `noto-emoji` | Google Noto Animated Emoji: Lottie JSON, 512 px animated WebP / GIF, the static frame as SVG / PNG | CC BY 4.0 (credit Google) | `noto-emoji:<lottie\|webp\|gif\|svg\|png>:<codepoint>`; a search returns the Lottie (animation) or the SVG (sticker) and lists the other formats in `notes` / `extra` |
| `fluent-emoji` | Microsoft Fluent UI Emoji at a pinned commit: 3D PNG (256 px) and flat SVG | MIT (keep the Microsoft notice: the credit line covers it) | `fluent-emoji:<3d\|flat>:<name>`; use the flat SVG for a large overlay |
| `iconify` | 200+ open icon sets as SVG; `--kind animation` asks only the animated sets (`line-md`, `svg-spinners`, `meteocons`) | per set: MIT / Apache / CC BY pass; CC BY-SA and MPL fail `open`; GPL, OFL (font) and unknown sets fail `commercial` | `iconify:<set>:<name>`, `iconify:animation:<set>:<name>` |
| `commons` | animated GIF (more than one frame), animated WebP, WebM of at most 20 s | per file | `commons:animation:File:<name>` |
| `pixabay` | photos, illustrations, vectors (`--kind sticker`), video | Pixabay Content License (no attribution required) | `pixabay:image:<n>`, `pixabay:video:<n>` |

Monotone Iconify icons draw in `currentColor`: inline the SVG and set `color` in CSS, or edit its fill; as an `<img>` they render black. A Lottie file needs a Lottie player in the composition (the `lottie` skill); for a plain `<img>`, pull the WebP or GIF id of the same emoji instead. Animated SVG and GIF play in a browser; check them in a test render, since a render seeks time frame by frame.

For a poster-collage explainer, `ralphy editor poster` takes the pulled files by their `path` in its scenes file's `ASSETS`, inlines every Lottie JSON it uses and plays each one from its own start ([poster-collage.md](./poster-collage.md), #598). Cut out photo subjects with `ralphy matte subject --model birefnet` before placing them.

## Pinterest: import only, reference only

`ralphy stock pull pinterest:<pin-or-board-url> --project <id> --license any [--max 30]` reads a pin or a board with the local `yt-dlp` (no cookies, no login, no proxies; private pins and boards cannot be imported), takes at most `--max` pins from a board (default 30) and pauses between downloads. There is no Pinterest search.

- Pinterest's terms restrict automated access: import only pins the user may use, or keeps as a private reference.
- A pin carries no license: the rights belong to its creator, who is often not the person who pinned it. Every pin is unlicensed and marked reference only, so it fails `--license commercial` and `open`: the pull needs `--license any`, and `stock credits` lists pins under "Reference only, not cleared for publishing". Never put a pinned file in a published cut; use it as a mood or layout reference, or find the creator and get permission.

## Where the files land

| Kind | Folder in the Project tree |
|---|---|
| image, logo, sticker, icon | `artifacts/images/` |
| animation (Lottie JSON, animated WebP / GIF / SVG, short WebM) | `artifacts/animations/` |
| video | `artifacts/videos/` |
| audio the source calls music, or longer than 30 s | `artifacts/music/` |
| other audio (sound effects, short clips) | `artifacts/sfx/` |

The file is `<slot><ext>` (default slot `logo-<brand>` for Simple Icons, else `stock-<title>-<hash>`); reference it from `index.html` by the `path` the pull printed, e.g. `<img src="artifacts/images/logo-nvidia.svg">`. A second pull never overwrites: identical bytes reuse the file, new bytes get `<slot>.v2<ext>`. A Lottie is stored as a `data` Artifact, a WebM animation as `video`, a GIF / WebP / SVG animation as `image`.

Simple Icons logos are single-color SVGs filled with the brand hex. Commons and Archive video is already transcoded to at most 1080 lines where the source offers it; trim long b-roll with `ralphy video extract-segment` before composing.

## Credits and trademarks

- Every pulled item has an attribution line. `stock credits` prints the block for the caption or description: required credits first, then items whose license asks for none (Pexels, Pixabay, CC0, public domain), then, apart, the reference-only items that must not be published. Paste the block whenever any item has `attributionRequired: true`; including the courtesy lines is good practice. The reference-only lines are a warning, not a credit: a cut that still shows those files is not ready to publish.
- A logo is a trademark whatever its copyright license: use it to name the company the video talks about, never to suggest the brand made, sponsors or endorses the video.
- A photo of an identifiable person can carry personality rights even under CC0: keep such shots editorial.

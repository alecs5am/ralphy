# Comments on our own posts (#582)

Viewers' comments tell you three things metrics cannot: what they want next, where they got lost, and what they dispute. This flow turns them into iteration proposals tied to evidence. It is free by default and never posts, replies, pins, or deletes anything on a platform.

## The flow

```bash
# 1. Read the comment screenshots yourself and write comments.json (keys below),
#    or save the owner's pasted text to comments.txt. Preview: nothing is written.
ralphy analytics comments import <unit> --workspace <ws> --platform tiktok \
  --data comments.json --screenshot comments-1.png --screenshot comments-2.png --dry-run

# 2. Show the owner the labels and moments. On "yes", store them:
ralphy analytics comments import <unit> --workspace <ws> --platform tiktok \
  --data comments.json --screenshot comments-1.png --screenshot comments-2.png --yes

# YouTube we posted: pull the comments for free (one video URL, passed explicitly).
ralphy analytics comments import <unit> --workspace <ws> --platform youtube \
  --from-ytdlp https://www.youtube.com/shorts/<id> --dry-run

# 3. Read the analysis.
ralphy analytics comments report <unit> --workspace <ws>
```

The unit argument takes a Unit ID, a Unit slug, or a Project with exactly one Unit. Re-running the same input replays instead of appending. A later reading of the same comments merges: counts take the newer reading, new comments are appended, nothing is dropped. Screenshots are copied into the store as provenance; the same image reuses its stored copy.

`--from-ytdlp` refuses playlists and channels. When the Unit has a YouTube Publication URL recorded (for example from `ralphy analytics import --data '{"url": ...}'`), a different video id is refused; with no URL recorded the pull runs and the preview says ownership was not verified. yt-dlp runs logged out (no cookies), on the dry-run too (it is free); the `--yes` run pulls again, so counts can move slightly between the two.

## Payload keys

`--data` is a JSON array of comments, or an object `{ "capturedAt", "postUrl", "notes", "comments": [...] }`. Pasted text works too: one comment per line, a leading `@handle:` becomes the author.

| Key | Meaning | Accepted forms |
|---|---|---|
| `text` | The comment, as shown | text (required) |
| `author` | Handle as shown; hashed with the Workspace ID, never stored | `"@brewbuddy"` |
| `likes`, `replies` | Like / reply counts | `12`, `"1.2K"` |
| `postedAt` | When it was posted | ISO date, epoch ms, or the app's age (`"2d"`, `"5h ago"`, `"3 weeks ago"`) |
| `replyTo` | Parent comment: a `ref` in this payload or the platform comment id | text |
| `ref` | Local label other comments can name in `replyTo`; not stored | text |
| `id` | The platform's comment id, when visible | text |
| `byCreator` | Our own comment or reply; kept, never classified | `true` |
| `pinned` | Pinned on the platform | `true` |
| `labels` | Classes you assign yourself; they override the rules | `["question", "confusion"]` |
| `timestamps` | Moments the comment refers to, if not in the text | `["0:12"]`, `[12]` |

Screen-label aliases fold (`handle`, `like_count`, `parent`, `classes`, `moments`, ...). Unknown keys are rejected. Pass handles whenever the screen shows them: identical short comments ("part 2") from different people stay distinct, and proposals count distinct commenters.

## Classes and rules

`question`, `request-more`, `objection`, `confusion`, `praise`, `delivery-criticism`, `spam`. A comment can carry several. Label precedence: your `labels` > `--llm` labels > the deterministic English rules in `cli/lib/analytics/comment-rules.ts` (every match records its rule id, shown in the preview).

- **spam** (links, self-promotion, scams) overrides every other class and is excluded from all other counts. The creator's own comments are never counted.
- **confusion** also fires for a question that names a moment ("what is that at 0:12?"), but not for a product or song question.
- **objection** facets: `accuracy`, `disagree`, `value`, `packaging` (clickbait, misleading title, an unanswered promise).
- **delivery-criticism** facets: `pace-fast`, `pace-slow`, `audio`, `text`, `visual`, `synthetic`.
- Moments: `0:12`, `1:02:03`, `at 12s`, `12 sec in`, and position cues (`the intro`, `the ending`). Wall-clock times (`10:30 am`) are ignored.

`--llm` labels only the comments the rules left unlabeled, in batches of 100 (max 500), through the cheap `google/gemini-2.5-flash`, and only on `--yes`. Prefer labeling them yourself in the JSON: it is free and you see the context.

## Reading the report

- **classes / top**: counts, distinct commenters, likes, and the most-liked comments per class.
- **beats**: every moment a comment names is placed on a scenario beat (scene start / end from the scenario durations; `--from <project dir>` points at a `scenario.json`). When a retention curve was imported with `ralphy analytics import`, each beat shows retention at its start and end, the drop, and which beat drops fastest.
- **proposals**, each with `evidence` (distinct commenters `count`, comments, likes, comment ids, an example):
  - `hook` / `fix-beat`: a beat where viewers were confused, objected, or criticized the delivery, with the retention drop when known;
  - `next-video`: a topic several commenters asked for or asked about (shared word or two-word phrase), or a plain "part 2";
  - `packaging`: clickbait or misleading-title objections;
  - `objection`: the recurring accuracy, disagreement, or value doubt;
  - `delivery`: a delivery facet across the whole video;
  - `clarity`: confusion that names no moment.
- **signals**: the same patterns with fewer than `--min-n` (default 2) distinct commenters. Report them as signals, never as claims.

`ralphy analytics report --workspace <ws>` adds a `comments` section: per unit and platform, class counts next to the outcome (target metric and hit), shown only from `--comments-min-n` (default 5) analyzed comments.

## Traps

- **Comments are a biased sample.** A loud minority comments; weigh proposals against the metrics and the retention curve, not on their own.
- **Read the whole thread.** "Part 2?" under a reply is still demand; a reply from us is `byCreator`.
- **Moments drift between platforms.** Map them to the beat of the version that was posted; a moment after the end of the scenario is listed as unmapped.
- **Personal data.** Screenshots stay in the local store. Never commit them; test fixtures are synthetic.

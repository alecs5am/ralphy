# Signals to fixes

Compare our video with the reference and with the account's own median on the same axis. Numbers
beat impressions; the user's verdict beats both.

| Signal | How to read it | Fix to try |
|---|---|---|
| Views below the account median | Compare the first 2 s and the first text with the reference's | Copy the reference's hook promise and first frame more closely; cut dead frames at the start |
| Views fine, retention weak (comments say "too long", drop-off) | Our shots run longer than the reference's (`cuts.json` median shot) | Cut each shot back to the reference length; tighten gaps between lines |
| Reference ends on a loop or payoff, ours fades out | Ending differs | Copy the ending structure, not its content |
| Reference has text per beat, ours does not | Text layer differs (`ocr.json`, breakdown "Text on screen") | Add text per beat in the account's caption look |
| Ours looks static next to the reference | `compare` shows a higher still share or longer shots | Restore the reference's shot density and in-shot motion; no stills with a slow zoom as a stand-in |
| Cuts feel off the music | `beats.json` cut alignment, `compare` cut offsets | Land each cut on the sound's arrival frame |
| Remake looks worse than the earlier version | `compare` the two versions; colour, contrast, motion | Undo the regression first; change one thing per version |
| Same format, small creators break out, we do not | Packaging is weak, content is fine | Change the first frame, title text and first line only |
| Many creators repeat the format and views fall | Saturation | Move to an adjacent sub-niche or a rising format |
| One of our videos is 2x the account median | A hit worth repeating | Make the next episode from it: keep its structure, change the topic |

Rules:

- A claim about the account needs at least 3 published posts. Below that, say "insufficient data".
- Our own rolling median is the baseline, not platform averages.
- Public counts lag and are rounded ("12.5K"). Note the fetch date. Some platforms return no post
  metrics; empty is unknown, not zero.
- Change one thing per version or episode, so the next numbers can tell what worked.
- Write the finding and its evidence into the next Content's `notes.md`.

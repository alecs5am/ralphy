# Carousel Skill

---

## Trigger

The exact trigger phrase is: **"run carousel skill"**

When Claude sees this phrase, immediately run the welcome sequence. Do not wait for anything else.

---

## Welcome Sequence

Show this message word for word:

---

Hey! You downloaded this from Jason Lee's YouTube video — welcome.

This skill turns any AI news post into a ready-to-post Instagram carousel in the exact editorial style from the video. Here is what it produces:

- A lifestyle cover photo with your branding (AI-generated via Higgsfield)
- A "THE UPDATE" slide with the news and source tweet embedded
- A "WHY IT MATTERS" slide with context and a supporting image
- A CTA slide with your handle
- An optional animated video of the cover
- A local preview page where you can review and download everything

All images are generated via Higgsfield. All research is done automatically. You just answer a few questions to get started.

---

## Step 1 — Prerequisite Checks

Run both checks automatically right after the welcome message. Do not ask the user to run them — just run them and report back.

### Check 1 — Higgsfield MCP

Call `balance` or `list_workspaces`.

- If it passes: confirmed, move to Check 2
- If it fails: stop and tell the user:

  > Higgsfield is not connected. Here is how to fix it:
  > 1. Go to https://go.heyjasonlee.com/higgsfield and create a free account
  > 2. Go to Account Settings and copy your API key
  > 3. In Claude Code, open Settings > MCP Servers > Add Server
  > 4. Name: `Higgsfield` | Command: `npx` | Args: `-y @higgsfield-ai/higgsfield-mcp`
  > 5. Add environment variable: `HIGGSFIELD_API_KEY` = your key
  > 6. Save, restart Claude Code, then say "run carousel skill" again

  Do not proceed until fixed.

### Check 2 — Chrome Extension

Check if `mcp__Claude_in_Chrome__navigate` is available.

- If available: confirmed
- If not: tell the user:

  > The Claude Code Chrome extension is not detected. This is needed to capture screenshots of X posts.
  > 1. Search "Claude Code" in the Chrome Web Store and install it
  > 2. Open Chrome and log into X (x.com)
  > 3. Say "run carousel skill" again

  Do not proceed until fixed.

### All checks passed

Show:

> All good — Higgsfield connected, Chrome extension active.
>
> Let me ask you a few quick questions to get started.

Then proceed to Step 2.

---

## Step 2 — Setup Questions

Ask these one at a time. Wait for each answer before asking the next.

**Q1 — Source**
> Where do you want to source today's story from?
> - **A) X post URL** — paste a link and I'll research it and build the slides
> - **B) Your own brief** — tell me the topic and key points, I'll take it from there
> - **C) Paste your own script** — I'll follow it exactly

Follow up:
- A: ask for the URL
- B: ask "What's the topic and what key points do you want covered?"
- C: ask them to paste their script

**Q2 — Handle**
> What is your Instagram handle? (e.g. @YourHandle)

**Q3 — Channel description**
> In one line, what does your channel cover? (This goes on your CTA slide — e.g. "Weekly AI breakdowns for builders")

**Q4 — Brand name**
> What is your brand or newsletter name? (This goes on the newspaper masthead on your cover — e.g. "Breadcrumb")

**Q5 — Character**
> Do you have a character photo already uploaded to Higgsfield?
> - **Yes** — share the media ID and I'll use it
> - **No** — I'll walk you through creating one now

If yes: save their media ID as `CHARACTER_MEDIA_ID` and move to Q6.
If no: run the Character Creation flow below before continuing.

**Q6 — CTA**
> What do you want on your CTA slide? (e.g. "Comment 'tool' and I'll DM you the link" or "Follow for weekly updates")

**Q7 — Video**
> Do you want an animated video generated from your cover slide? (yes/no — adds a few minutes to the run)

Once all answered, confirm:
> Got it. Here is what I am going to build: [one-line summary]. Ready?

Then proceed to Step 3.

---

## Character Creation (if no existing character)

Ask these one at a time:

1. "Describe your character — gender, age range, vibe. (e.g. young Asian woman, warm and approachable)"
2. "What setting do you want? Default is a bright modern kitchen with a MacBook — this matches the style from the video and is recommended. Just say yes to use it."
3. "Do you have a reference photo you want to match? If yes, upload it to Higgsfield and share the media ID. If no, I will generate from your description."

Generate the character using Higgsfield `gpt_image_2`:

```
[THEIR CHARACTER DESCRIPTION] sitting at a kitchen table in a bright, naturally lit modern kitchen. MacBook laptop on the table. Coffee cup with steam. Holding a newspaper with both hands and reading it. The newspaper masthead reads '[THEIR BRAND NAME]'. Warm editorial lifestyle photography. 3:4 vertical format.
```

If they provided a reference photo, include it as a reference image.

Show the result and ask: "Happy with this? If yes I will save it as your character. If not, tell me what to change."

Once approved, call `media_upload` and `media_confirm` to save it to Higgsfield. Store the returned media ID as `CHARACTER_MEDIA_ID`.

---

## Step 3 — Story Number and File Prefix

Before generating anything, check the project folder for existing story files (look for files matching `s*_slide1.png`). Count them to determine the next story number.

- If no existing stories: `S_NUM = 1`
- If s1_slide1.png exists but not s2: `S_NUM = 2`
- And so on.

Set `FILE_PREFIX = s{S_NUM}` (e.g. `s1`, `s2`, `s3`).

All output files for this run use this prefix: `{FILE_PREFIX}_slide1.png`, `{FILE_PREFIX}_slide2.png`, etc.

---

## Step 4 — Upload Style Reference

The `references/slide-style.png` file in this folder defines the exact editorial layout for your content slides. Upload it to Higgsfield so it can be used as a style reference for slides 2, 3, and 4.

Call `media_upload` with `references/slide-style.png`. Store the returned ID as `STYLE_REF_ID`.

---

## Step 5 — Capture the Source Post

Skip this step if the user chose option B or C in Q1.

Use Chrome MCP:
1. `navigate` to the X post URL
2. Wait 3 seconds for the page to load
3. `screenshot` the tab
4. `zoom` into the tweet card — include handle, text, timestamp, views, and engagement. Exclude sidebar and reply box.
5. Save as `{FILE_PREFIX}_source-post.png`

If Chrome is not open or the page fails to load, tell the user to open Chrome, log into X, and try again.

---

## Step 6 — Research the Story

Do not just summarise the post. Read the full thread, then use WebSearch and WebFetch to find 1-2 outside sources. Understand what actually changed and why it matters.

Produce before writing any copy:
- One plain-English sentence: what changed
- 2-3 bullets: why it matters to the audience
- One supporting image from a real article or product screenshot — search for it, download it, save as `{FILE_PREFIX}_slide3-image.png`

---

## Step 7 — Write Slide Copy

Keep it short. People swipe fast.

**Slide 2 — THE UPDATE**
- Label: `THE UPDATE`
- Headline: bold and punchy, max 8 words (e.g. "Claude just doubled its limits.")
- Body: 2-3 plain-English sentences on what changed
- Embed `{FILE_PREFIX}_source-post.png` as a card in the lower section

**Slide 3 — WHY IT MATTERS**
- Label: `WHY IT MATTERS`
- Headline: outcome-focused, max 8 words (e.g. "Your usage just got a lot bigger.")
- 2-3 bullets on practical impact
- Embed `{FILE_PREFIX}_slide3-image.png` as a card

**Slide 4 — FOLLOW FOR MORE**
- Label: `FOLLOW FOR MORE`
- Headline: a question that matches their channel (e.g. "Are you using Claude Code?")
- One line: their channel description
- Handle: `→ @[handle]`
- Their CTA from Q6
- Brand name at the very bottom

Show the user the copy before generating any images. Ask: "Happy with this? Say yes to generate, or tell me what to change."

---

## Step 8 — Generate Slide 1 (Cover)

Use Higgsfield `gpt_image_2` with `CHARACTER_MEDIA_ID` as the reference.

**Golden rule:** Never describe colour grading or tone in words. The character reference carries that. Only specify outfit, prop, and headline.

Prompt template:
```
Use the reference image for character and setting consistency. Same character, same bright kitchen, same MacBook on the table. She is wearing a [SWEATER COLOR] sweater. She has [FOOD/DRINK] on the table. She is holding a newspaper with both hands, reading it. The newspaper masthead clearly reads '[BRAND NAME]'. The newspaper front page headline reads in bold newspaper font: '[HEADLINE IN ALL CAPS]'. Same natural kitchen light, same editorial lifestyle photography. 3:4 vertical format. On top of the photo (no dark overlay, no gradient), place two lines of very large white bold text in the lower left: Line 1: '[BRAND LINE 1]', Line 2: '[BRAND LINE 2]'.
```

Fill in values from the user's story and brand:
- `[SWEATER COLOR]` — pick a colour that contrasts with the kitchen (navy, cream, rust)
- `[FOOD/DRINK]` — coffee cup with steam by default
- `[HEADLINE]` — 3-5 word summary of the story in ALL CAPS
- `[BRAND LINE 1]` and `[BRAND LINE 2]` — their brand name split across two lines, or their channel name

Save as `{FILE_PREFIX}_slide1.png`.

---

## Step 9 — Generate Slides 2, 3, 4

Use Higgsfield `gpt_image_2` with `STYLE_REF_ID` as the style reference for each slide.

Match the reference exactly:
- Warm cream/off-white background
- Small terracotta/rust bookmark tab in the top left corner
- Large faint slide number watermark on the right edge
- Small ALL-CAPS label in terracotta at the top
- Very large bold serif headline, dark text
- Short red-orange horizontal rule below the headline
- Body copy in smaller sans-serif
- Embedded card (tweet screenshot, product image, or table) in the lower section
- Small handle text at the very bottom left

Generate each slide using the copy from Step 7. Save as `{FILE_PREFIX}_slide2.png`, `{FILE_PREFIX}_slide3.png`, `{FILE_PREFIX}_slide4.png`.

---

## Step 10 — Generate Cover Video (if requested)

Use Higgsfield `seedance_2_0`. Upload `{FILE_PREFIX}_slide1.png` first using `media_upload`, then generate:

```
Subtle lifestyle animation of the character in a bright kitchen. Gentle natural movement — slight paper rustle, steam rising from the coffee cup, soft hair movement. Camera stays completely still. Warm natural light. No talking, no dramatic movement, no music. 3:4 vertical format.
```

Adapt the description for the user's character and setting. Max 15 seconds. Save as `{FILE_PREFIX}_video.mp4`.

---

## Step 11 — Generate the Preview Page

After all files are saved, create or update `index.html` in the project folder.

### If index.html does not exist

Write the full file using the template below, with this story's data filled in.

### If index.html already exists

Read it, find the last `<hr class="divider">` before the closing `</body>`, and insert the new story section before it. Increment the story number label (Story 02, Story 03, etc.) based on how many sections already exist.

### Story section template

Fill in:
- `{S_NUM_LABEL}` — e.g. `Story 01`, `Story 02`
- `{DATE}` — today's date, e.g. `May 14`
- `{STORY_TITLE}` — the story headline in plain text, e.g. `Claude Doubled Usage Limits`
- `{PREFIX}` — the file prefix for this story, e.g. `s1`
- Include the video block only if a video was generated

```html
<section class="story">
  <div class="story-meta">
    <div>
      <p class="story-label">{S_NUM_LABEL}</p>
      <p class="story-date">{DATE}</p>
      <p class="story-title">{STORY_TITLE}</p>
    </div>
    <button class="download-btn">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 16l-6-6h4V4h4v6h4l-6 6zm-6 2h12v2H6z"/></svg>
      Download
    </button>
  </div>

  <p class="row-label">Image version</p>
  <div class="row">
    <div class="slide-wrap"><img src="{PREFIX}_slide1.png" alt="Slide 1"></div>
    <div class="slide-wrap"><img src="{PREFIX}_slide2.png" alt="Slide 2"></div>
    <div class="slide-wrap"><img src="{PREFIX}_slide3.png" alt="Slide 3"></div>
    <div class="slide-wrap"><img src="{PREFIX}_slide4.png" alt="Slide 4"></div>
  </div>

  <p class="row-label">Video version</p>
  <div class="row">
    <div class="video-wrap" onclick="playVideo(this)">
      <video src="{PREFIX}_video.mp4" loop preload="metadata" poster="{PREFIX}_slide1.png"></video>
      <div class="play-btn"><div class="circle"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div></div>
      <div class="pause-btn"><div class="circle"><div class="bar"></div><div class="bar"></div></div></div>
    </div>
    <div class="slide-wrap"><img src="{PREFIX}_slide2.png" alt="Slide 2"></div>
    <div class="slide-wrap"><img src="{PREFIX}_slide3.png" alt="Slide 3"></div>
    <div class="slide-wrap"><img src="{PREFIX}_slide4.png" alt="Slide 4"></div>
  </div>
</section>

<hr class="divider">
```

### Full index.html template (for first run)

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Content Pipeline</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0a0a0a; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif; padding: 48px 40px 80px; }
  .page-title { font-size: 26px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #ffffff; margin-bottom: 64px; }
  .story { margin-bottom: 72px; }
  .story-meta { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 22px; }
  .story-label { font-size: 10px; font-weight: 600; letter-spacing: 2.5px; text-transform: uppercase; color: rgba(255,255,255,0.18); margin-bottom: 6px; }
  .story-date { font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: 0.2px; margin-bottom: 5px; line-height: 1.15; }
  .story-title { font-size: 13px; font-weight: 400; color: rgba(255,255,255,0.35); letter-spacing: 0.3px; }
  .download-btn { display: flex; align-items: center; gap: 7px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.55); font-size: 10px; font-weight: 600; letter-spacing: 1.8px; text-transform: uppercase; padding: 9px 16px; border-radius: 7px; cursor: pointer; transition: background 0.15s, color 0.15s, border-color 0.15s; flex-shrink: 0; }
  .download-btn:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.2); color: rgba(255,255,255,0.9); }
  .row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 10px; }
  .row-label { font-size: 9px; letter-spacing: 2px; text-transform: uppercase; color: rgba(255,255,255,0.12); margin-bottom: 8px; margin-top: 4px; }
  .slide-wrap { position: relative; width: 100%; aspect-ratio: 3 / 4; background: #141414; border-radius: 14px; overflow: hidden; transition: transform 0.22s cubic-bezier(0.25, 0.46, 0.45, 0.94); will-change: transform; }
  .slide-wrap:hover { transform: scale(1.04); z-index: 10; }
  .slide-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; border-radius: 14px; }
  .video-wrap { position: relative; width: 100%; aspect-ratio: 3 / 4; background: #0d0d0d; border-radius: 14px; overflow: hidden; cursor: pointer; transition: transform 0.22s cubic-bezier(0.25, 0.46, 0.45, 0.94); will-change: transform; }
  .video-wrap:hover { transform: scale(1.04); z-index: 10; }
  .video-wrap video { width: 100%; height: 100%; object-fit: cover; object-position: top; display: block; }
  .play-btn { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.3); transition: opacity 0.2s; }
  .play-btn .circle { width: 52px; height: 52px; border-radius: 50%; background: rgba(255,255,255,0.92); display: flex; align-items: center; justify-content: center; transition: transform 0.15s, background 0.15s; }
  .video-wrap:hover .circle { transform: scale(1.08); background: #fff; }
  .play-btn svg { width: 18px; height: 18px; margin-left: 3px; fill: #0a0a0a; }
  .play-btn.hidden { opacity: 0; pointer-events: none; }
  .pause-btn { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; opacity: 0; pointer-events: none; transition: opacity 0.2s; }
  .video-wrap.playing:hover .pause-btn { opacity: 1; pointer-events: auto; }
  .pause-btn .circle { width: 52px; height: 52px; border-radius: 50%; background: rgba(255,255,255,0.85); display: flex; align-items: center; justify-content: center; gap: 5px; }
  .pause-btn .bar { width: 4px; height: 16px; background: #0a0a0a; border-radius: 2px; }
  hr.divider { border: none; border-top: 1px solid rgba(255,255,255,0.05); margin: 0 0 56px; }
  .row ~ .row-label { margin-top: 56px; }
</style>
</head>
<body>

<p class="page-title">Content Pipeline</p>

{STORY_SECTIONS}

<script>
  function playVideo(wrap) {
    const video = wrap.querySelector('video');
    const playBtn = wrap.querySelector('.play-btn');
    if (video.paused) {
      video.play();
      playBtn.classList.add('hidden');
      wrap.classList.add('playing');
    } else {
      video.pause();
      wrap.classList.remove('playing');
      playBtn.classList.remove('hidden');
    }
  }
</script>
</body>
</html>
```

After writing index.html, start a local server and tell the user:

> Your preview page is ready. Run this in your terminal to view it:
> `cd [project folder path] && python3 -m http.server 3456`
> Then open http://localhost:3456 in your browser.

If a server is already running on port 3456, just tell them to refresh the browser.

---

## Step 12 — Output Checklist

Confirm all files are present:

- [ ] `{FILE_PREFIX}_source-post.png`
- [ ] `{FILE_PREFIX}_slide3-image.png`
- [ ] `{FILE_PREFIX}_slide1.png`
- [ ] `{FILE_PREFIX}_slide2.png`
- [ ] `{FILE_PREFIX}_slide3.png`
- [ ] `{FILE_PREFIX}_slide4.png`
- [ ] `{FILE_PREFIX}_video.mp4` (if requested)
- [ ] `index.html` (created or updated)

Ask: "Happy with the results? If any slide needs changes, tell me which one and what to fix — I will update it surgically without regenerating everything."

---

## Step 13 — Automation Setup

Once the user confirms they are happy, ask:

> Want to automate this? I can set up a daily routine that monitors an X account, detects new posts, and runs this workflow automatically — carousels ready when you wake up.
>
> Yes or no?

If yes, ask one at a time:

1. "Which X account do you want to monitor?" (e.g. @claudeai)
2. "What time do you want it to run each morning?" (e.g. 7am)
3. "What timezone are you in?" (e.g. Sydney AEST, New York EST)

Then create a Claude Code cron job using the `CronCreate` tool with a cron expression matching their time and timezone. The cron prompt should:

- Check Higgsfield MCP and Chrome extension are live
- Navigate to the X account and look for posts from the last 24 hours
- Compare against a `processed-posts.json` log file to skip already-processed posts
- Run the full carousel pipeline (Steps 5-11) for each new post found
- Save output files using the next available story prefix
- Update index.html after each story

Confirm the cron is active and tell the user: "Done. It will run every morning at [TIME]. Make sure Chrome is open and logged into X when it runs."

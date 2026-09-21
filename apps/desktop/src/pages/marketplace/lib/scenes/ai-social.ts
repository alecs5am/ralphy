/**
 * Remocn scenes for the ai-social shard: three AI product surfaces (`claude-code`, `chat-gpt`,
 * `v0`) and three social ones (`x-follow-card`, `github-stars`, `logo-enter`).
 *
 * Every one of the six renders into upstream's own 1280x720 reference box (`logo-enter` is the
 * exception: it centres a flex row in an `AbsoluteFill` and hard-codes only the chip diameter, so
 * it gets the house 480x270 stage). Because `.rv-stage` makes `1em` exactly one authored stage
 * pixel, every literal below is the upstream number unchanged.
 *
 * Three families of timing recur and are taken from the survey's numerically solved spring tables
 * rather than guessed at: `introBounceIn` {14,110,0.7} for the three AI surfaces, `cardBounceIn`
 * {12,120,0.8} for the follow card, and the {13,130,0.8} chip spring for `logo-enter`. Percentages
 * in the CSS are always over `seconds + hold`, never over the moving part alone.
 *
 * The typewriter the three chat surfaces share is per-character `max-width` rather than a width
 * tween: upstream's `useTypewriter` reveals whole characters at `cps`, and an animated `max-width`
 * keeps a hidden character out of the flow so the caret is pushed along by the text exactly as it
 * is upstream. Each character carries its own `--rv-own` and the per-scene start frame is added in
 * the sheet.
 */
import { chars } from "./shared";
import { scene, type SceneSpec } from "./types";

/** Upstream `WHATS_NEW`, a module constant rather than a prop, so it is not declared in `params`. */
const WHATS_NEW = [
  "/agents to create subagents",
  "/security-review for review agent",
  "ctrl+b to background bashes",
];

const svg = (body: string, box = "0 0 24 24") =>
  `<svg viewBox="${box}" fill="none" aria-hidden="true">${body}</svg>`;
const stroked = (d: string, width = 1.8) =>
  `<path d="${d}" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;

const PLUS = svg(stroked("M12 5v14M5 12h14", 2));
const MIC = svg(`<rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" stroke-width="1.8"/>`
  + stroked("M5.5 11a6.5 6.5 0 0013 0M12 17.5V21M9 21h6"));
const ARROW_UP = svg(stroked("M12 19V6M12 6l-6 6M12 6l6 6", 2.2));
const CHEVRON = svg(stroked("M6 9l6 6 6-6", 2));

/** `claude-code`'s pixel-art mascot: one 24-viewBox path, recoloured by the accent. */
const MASCOT = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949zM6 10.949h1.488V8.102H6v2.847zm10.51 0H18V8.102h-1.49v2.847z"/></svg>`;

export const claudeCode = scene({
  id: "claude-code",
  group: "ai",
  shard: "ai-social",
  stage: { w: 1280, h: 720 },
  params: {
    title: "Claude Code v2.0.0",
    userName: "Meaghan",
    model: "Opus 4.8 • Max 20x",
    cwd: "/users/meaghan/code/apps",
    placeholder: 'Try "edit <filepath> to ..."',
    prompt: "edit src/theme.ts to add a dark mode toggle",
    accentColor: "#D97757",
    speed: 1,
  },
  palette: {
    text: "#E8E5DD", bg: "#2B2A28", accent: "#D97757", bar: "#3A3633", body: "#1B1A18",
    muted: "#8A857C", dim: "#6B6660", red: "#FF5F57", amber: "#FEBC2E", green: "#28C840",
    shadow: "#00000099",
  },
  motion: { kind: "cycle", seconds: 4, hold: 1.5 },
  still: 0.55,
  markup: (ctx, p) => {
    const dot = (key: string) => `<i style="--dot:var(--p-${key})"></i>`;
    const row = (text: string) => `<span>${ctx.esc(text)}</span>`;
    return `<div class="rv-win"><div class="rv-bar">${dot("red")}${dot("amber")}${dot("green")}</div>`
      + `<div class="rv-body"><div class="rv-box">`
      + `<span class="rv-legend">${ctx.esc(String(p.title))}</span><div class="rv-cols">`
      + `<div class="rv-left"><div class="rv-hi">Welcome back ${ctx.esc(String(p.userName))}!</div>`
      + `<div class="rv-mascot">${MASCOT}</div>`
      + `<div class="rv-meta">${row(String(p.model))}${row(String(p.cwd))}</div></div>`
      + `<div class="rv-right"><div class="rv-new">What's new</div>`
      + `<div class="rv-list">${WHATS_NEW.map(row).join("")}<span class="rv-dim">... /help for more</span></div>`
      + `</div></div></div><div class="rv-prompt"><div class="rv-rule"></div><div class="rv-line">`
      + `<span class="rv-sym">&gt;&nbsp;</span>`
      + `<span class="rv-type">${chars(String(p.prompt), 1000 / 18)}</span><i class="rv-caret"></i>`
      + `<span class="rv-ph">${ctx.esc(String(p.placeholder))}</span></div></div></div></div>`;
  },
});

const CHIP_ICONS = [
  svg(`<rect x="3" y="4" width="18" height="16" rx="3" stroke="currentColor" stroke-width="1.7"/>`
    + `<circle cx="8.5" cy="9" r="1.6" stroke="currentColor" stroke-width="1.7"/>`
    + stroked("M5 18l5-5 4 4 2-2 3 3", 1.7)),
  svg(stroked("M4 20h4L19 9a2.1 2.1 0 00-3-3L5 17v3z", 1.7) + stroked("M14 7l3 3", 1.7)),
  svg(`<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/>`
    + stroked("M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18", 1.7)),
];
const CHIP_LABELS = ["Create an image", "Write or edit", "Look something up"];
const WAVEFORM = svg([[3, 8], [8, 16], [13, 12], [18, 20]]
  .map(([x, h]) => `<rect x="${x}" y="${(24 - h) / 2}" width="2.4" height="${h}" rx="1.2" fill="currentColor"/>`)
  .join(""));

export const chatGpt = scene({
  id: "chat-gpt",
  group: "ai",
  shard: "ai-social",
  stage: { w: 1280, h: 720 },
  params: {
    greeting: "What's on your mind today?",
    placeholder: "Ask anything",
    prompt: "Make a sunset over a calm ocean",
    accentColor: "#2F6FED",
    speed: 1,
  },
  palette: {
    text: "#0D0D0D", bg: "#FFFFFF", accent: "#2F6FED", card: "#FFFFFF", border: "#E3E3E3",
    muted: "#9B9B9B", chip: "#5D5D5D", icon: "#5D5D5D", send: "#0D0D0D", sendFg: "#FFFFFF",
    shadow: "#0d0d0d24",
  },
  motion: { kind: "cycle", seconds: 2.8, hold: 1.2 },
  /** Before f42: the greeting, the composer and all three chips are up and nothing has typed yet.
   *  That is the frame the product is recognised by; after f42 the chips wipe out. */
  still: 0.33,
  markup: (ctx, p) =>
    `<div class="rv-head"><span>${ctx.esc(String(p.greeting))}</span></div>`
    + `<div class="rv-pill"><span class="rv-plus">${PLUS}</span><div class="rv-slot">`
    + `<span class="rv-type">${chars(String(p.prompt), 1000 / 22)}</span><i class="rv-caret"></i>`
    + `<span class="rv-ph">${ctx.esc(String(p.placeholder))}</span></div>`
    + `<div class="rv-tools"><span class="rv-mic">${MIC}</span><div class="rv-morph">`
    + `<i class="rv-voice">${WAVEFORM}</i><i class="rv-send">${ARROW_UP}</i></div></div></div>`
    + `<div class="rv-chips">${CHIP_LABELS
      .map((label, index) => `<span class="rv-chip">${CHIP_ICONS[index]}<span>${ctx.esc(label)}</span></span>`)
      .join("")}</div>`,
});

const V0_MARK = svg(`<rect x="2.5" y="2.5" width="19" height="19" rx="5" stroke="currentColor" stroke-width="1.8"/>`
  + `<rect x="7.5" y="7.5" width="9" height="9" rx="2.5" stroke="currentColor" stroke-width="1.8"/>`);

export const v0 = scene({
  id: "v0",
  group: "ai",
  shard: "ai-social",
  stage: { w: 1280, h: 720 },
  params: {
    greeting: "What do you want to create?",
    placeholder: "Ask v0 to build…",
    prompt: "a landing page for my SaaS with pricing and testimonials",
    modelName: "v0 Max",
    projectName: "Project",
    speed: 1,
  },
  palette: {
    text: "#EDEDED", bg: "#000000", panel: "#0A0A0A", border: "#2A2A2A",
    muted: "#8A8A8A", icon: "#A0A0A0", btn: "#FFFFFF", btnFg: "#0A0A0A", shadow: "#000000cc",
  },
  motion: { kind: "cycle", seconds: 3.933, hold: 1.067 },
  still: 0.55,
  markup: (ctx, p) =>
    `<div class="rv-head"><span>${ctx.esc(String(p.greeting))}</span></div>`
    + `<div class="rv-box"><div class="rv-area">`
    + `<span class="rv-type">${chars(String(p.prompt), 1000 / 22)}</span><i class="rv-caret"></i>`
    + `<span class="rv-ph">${ctx.esc(String(p.placeholder))}</span></div>`
    + `<div class="rv-tool"><div class="rv-grp">${PLUS}<span class="rv-model">${V0_MARK}`
    + `<span>${ctx.esc(String(p.modelName))}</span><span class="rv-chev">${CHEVRON}</span></span></div>`
    + `<div class="rv-right"><span class="rv-proj"><span>${ctx.esc(String(p.projectName))}</span>`
    + `<span class="rv-chev">${CHEVRON}</span></span>`
    + `<div class="rv-btn"><i class="rv-mic">${MIC}</i><i class="rv-arrow">${ARROW_UP}</i></div>`
    + `</div></div></div>`,
});

const filled = (d: string, box = "0 0 24 24") =>
  `<svg viewBox="${box}" aria-hidden="true"><path fill="currentColor" d="${d}"/></svg>`;
const BADGE = filled("M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z", "0 0 22 22");
const PIN = filled("M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z");
const LINK = filled("M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z");
const CAL = filled("M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z");
const MAIL = filled("M1.998 5.5c0-1.381 1.119-2.5 2.5-2.5h15c1.381 0 2.5 1.119 2.5 2.5v13c0 1.381-1.119 2.5-2.5 2.5h-15c-1.381 0-2.5-1.119-2.5-2.5v-13zm2.5-.5c-.276 0-.5.224-.5.5v2.764l8 3.638 8-3.638V5.5c0-.276-.224-.5-.5-.5h-15zm15.5 5.463l-8 3.638-8-3.638V18.5c0 .276.224.5.5.5h15c.276 0 .5-.224.5-.5v-8.037z");
/** Upstream `POINTER_PATH` from the `cursor` foundation, drawn with its 1.4 outline. */
const POINTER = `<svg class="rv-ptr" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 2.2 C8 1.3 8.7 0.7 9.5 0.7 C10.3 0.7 11 1.3 11 2.2 L11 9 C11 9 11.3 8.4 12.2 8.4 C13 8.4 13.4 9 13.4 9.6 C13.4 9.6 13.9 9.1 14.7 9.1 C15.5 9.1 15.9 9.7 15.9 10.3 C15.9 10.3 16.4 9.9 17.1 9.9 C17.9 9.9 18.3 10.5 18.3 11.2 L18.3 16.8 C18.3 19.8 16.3 22.3 12.8 22.3 L11.4 22.3 C9 22.3 7.9 21.2 6.6 19.2 L4 15.2 C3.5 14.4 3.7 13.4 4.5 12.9 C5.1 12.5 5.9 12.6 6.4 13.2 L8 15 Z" fill="var(--p-cursorFill)" stroke="var(--p-cursorStroke)" stroke-width="1.4" stroke-linejoin="round"/></svg>`;

/** `blurInSchedule()` verbatim: group g opens at frame 20 + 2g, each window six frames long. */
const GROUP_MS = [667, 733, 800, 867, 933, 1000, 1067, 1133, 1200];

export const xFollowCard = scene({
  id: "x-follow-card",
  group: "social",
  shard: "ai-social",
  stage: { w: 1280, h: 720 },
  params: {
    name: "remocn",
    handle: "remocn",
    bio: "Building the collaborative video toolkit for small teams.\nShip demos faster with ready-made motion.",
    avatarUrl: "/logo.svg",
    coverUrl: "",
    location: "Tunisia",
    website: "remocn.tn",
    joined: "January 2024",
    verified: true,
    accentColor: "#1d9bf0",
    orientation: "horizontal",
    speed: 1,
  },
  palette: {
    text: "#0f1419", bg: "#f5f7f9", accent: "#1d9bf0", card: "#ffffff", border: "#e6e9eb",
    muted: "#536471", divider: "#eff3f4", onAccent: "#ffffff", avatarBg: "#1d9bf033",
    accentSoft: "#1d9bf099", accentFaint: "#1d9bf055", shadow: "#0f14192e",
    cursorFill: "#0a0a0a", cursorStroke: "#ffffff", drop: "#0000004d",
  },
  motion: { kind: "cycle", seconds: 4.2, hold: 1.3 },
  still: 0.6,
  markup: (ctx, p) => {
    const group = (index: number, cls: string, inner: string, tag = "div") =>
      `<${tag} class="rv-g ${cls}" style="--rv-own:${GROUP_MS[index]}ms">${inner}</${tag}>`;
    const initial = ctx.esc(String(p.name).charAt(0).toUpperCase());
    const meta = (icon: string, text: string, cls = "") =>
      `<span class="rv-item">${icon}<span class="${cls}">${ctx.esc(text)}</span></span>`;
    const tabs = ["Posts", "Replies", "Media", "Likes"]
      .map((tab, index) => `<span class="rv-tab${index === 0 ? " rv-on" : ""}">${tab}</span>`).join("");
    return `<div class="rv-card">${group(0, "rv-cover", "")}<div class="rv-pad">`
      + group(1, "rv-avatar", `<span>${initial}</span>`)
      + group(2, "rv-name", `<span>${ctx.esc(String(p.name))}</span>${p.verified ? BADGE : ""}`)
      + group(3, "rv-handle", `@${ctx.esc(String(p.handle))}`)
      + group(4, "rv-bio", ctx.esc(String(p.bio)), "p")
      + group(5, "rv-meta", meta(PIN, String(p.location))
        + meta(LINK, String(p.website), "rv-link") + meta(CAL, `Joined ${String(p.joined)}`))
      + `<div class="rv-gap"></div>` + group(7, "rv-tabs", tabs)
      + group(8, "rv-post", `<i class="rv-pav"><span>${initial}</span></i><div class="rv-ptext">`
        + `<div class="rv-pwho"><b>${ctx.esc(String(p.name))}</b>`
        + `<span>@${ctx.esc(String(p.handle))} · 2d</span></div>`
        + `<p>Shipping something new today. Built entirely with Remotion and a lot of coffee. More soon.</p>`
        + `<div class="rv-pnums"><span>12</span><span>48</span><span>312</span></div></div>`)
      + `</div></div><div class="rv-btns">`
      + group(6, "rv-layer", `<div class="rv-msg">${MAIL}</div><div class="rv-follow">`
        + `<span class="rv-f1">Follow</span><span class="rv-f2">Following</span></div>`)
      + `</div><div class="rv-cursor"><i class="rv-ripple"></i>${POINTER}</div>`;
  },
});

const STAR = filled("M13.7276 3.44418L15.4874 6.99288C15.7274 7.48687 16.3673 7.9607 16.9073 8.05143L20.0969 8.58575C22.1367 8.92853 22.6167 10.4206 21.1468 11.8925L18.6671 14.3927C18.2471 14.8161 18.0172 15.6327 18.1471 16.2175L18.8571 19.3125C19.417 21.7623 18.1271 22.71 15.9774 21.4296L12.9877 19.6452C12.4478 19.3226 11.5579 19.3226 11.0079 19.6452L8.01827 21.4296C5.8785 22.71 4.57865 21.7522 5.13859 19.3125L5.84851 16.2175C5.97849 15.6327 5.74852 14.8161 5.32856 14.3927L2.84884 11.8925C1.389 10.4206 1.85895 8.92853 3.89872 8.58575L7.08837 8.05143C7.61831 7.9607 8.25824 7.48687 8.49821 6.99288L10.258 3.44418C11.2179 1.51861 12.7777 1.51861 13.7276 3.44418Z");

export const githubStars = scene({
  id: "github-stars",
  group: "social",
  shard: "ai-social",
  stage: { w: 1280, h: 720 },
  params: {
    repo: "remotion-dev/remotion",
    totalStars: 24813,
    stargazers: [
      "mojombo|Mar 4, 2021", "defunkt|Jun 12, 2021", "pjhyett|Sep 21, 2021", "wycats|Dec 8, 2021",
      "ezmobius|Mar 17, 2022", "ivey|Jun 29, 2022", "evanphx|Sep 14, 2022", "vanpelt|Dec 23, 2022",
      "wayneeseguin|Mar 9, 2023", "brynary|Jul 19, 2023", "kevinclark|Nov 2, 2023",
      "technoweenie|Feb 15, 2024",
    ],
    orientation: "horizontal",
    accentColor: "#ffbb00",
    speed: 1,
    theme: "light",
  },
  palette: {
    text: "#171717", bg: "#ffffff", accent: "#ffbb00", card: "#ffffff", subtle: "#fafafa",
    muted: "#737373", border: "#ededed",
  },
  motion: { kind: "cycle", seconds: 6, hold: 1 },
  /** After the counter locks at 80% of the timeline, so the frozen frame shows the final number
   *  rather than three wheels caught mid-roll. */
  still: 0.75,
  fidelity: {
    level: "approximate",
    note: "Scroll, counter ramp, underline and fade plates are upstream's; the 60-row downsample is "
      + "cut to 12 rows with the scroll distance scaled to match (the elastic curve is scale-free), "
      + "each odometer wheel turns a capped number of revolutions instead of the true 2481 for the "
      + "units place, the per-decade spring snap is replaced by one continuous eased roll, and the "
      + "last-row settle plate is omitted. Avatars use upstream's own initial-letter fallback.",
  },
  markup: (ctx, p) => {
    const digits = Array.from(String(p.totalStars));
    const odometer = digits.map((digit, index) => {
      const cells = index * 20 + Number(digit);
      const column = Array.from({ length: cells + 1 }, (_, step) => `<b>${step % 10}</b>`).join("");
      const comma = (digits.length - index) % 3 === 1 && index < digits.length - 1 ? `<i class="rv-comma">,</i>` : "";
      return `<i class="rv-wheel${index === 0 ? " rv-late" : ""}"><span style="--cells:${cells}">${column}</span></i>${comma}`;
    }).join("");
    const rows = (p.stargazers as readonly string[]).map((entry, index) => {
      const [login = "", date = ""] = String(entry).split("|");
      return `<div class="rv-row"><i class="rv-av"><span>${ctx.esc((login.charAt(0) || "?").toUpperCase())}</span></i>`
        + `<div class="rv-who"><div class="rv-login">${ctx.esc(login)}</div>`
        + `<div class="rv-date">${ctx.esc(date)}</div></div>`
        + `<div class="rv-rank">${STAR}<span>#${index + 1}</span></div></div>`;
    }).join("");
    return `<div class="rv-count"><span class="rv-star">${STAR}</span><div class="rv-odo">${odometer}</div>`
      + `<div class="rv-underline"></div><div class="rv-repo"><i></i>`
      + `<span>${ctx.esc(String(p.repo))}</span></div></div>`
      + `<div class="rv-view"><div class="rv-track">${rows}<div class="rv-spacer"></div></div>`
      + `<i class="rv-fade rv-fade-t"></i><i class="rv-fade rv-fade-b"></i></div>`;
  },
});

const CLAUDE_MARK = `<svg viewBox="0 0 256 257" preserveAspectRatio="xMidYMid" aria-hidden="true"><path fill="currentColor" d="m50.228 170.321 50.357-28.257.843-2.463-.843-1.361h-2.462l-8.426-.518-28.775-.778-24.952-1.037-24.175-1.296-6.092-1.297L0 125.796l.583-3.759 5.12-3.434 7.324.648 16.202 1.101 24.304 1.685 17.629 1.037 26.118 2.722h4.148l.583-1.685-1.426-1.037-1.101-1.037-25.147-17.045-27.22-18.017-14.258-10.37-7.713-5.25-3.888-4.925-1.685-10.758 7-7.713 9.397.649 2.398.648 9.527 7.323 20.35 15.75L94.817 91.9l3.889 3.24 1.555-1.102.195-.777-1.75-2.917-14.453-26.118-15.425-26.572-6.87-11.018-1.814-6.61c-.648-2.723-1.102-4.991-1.102-7.778l7.972-10.823L71.42 0 82.05 1.426l4.472 3.888 6.61 15.101 10.694 23.786 16.591 32.34 4.861 9.592 2.592 8.879.973 2.722h1.685v-1.556l1.36-18.211 2.528-22.36 2.463-28.776.843-8.1 4.018-9.722 7.971-5.25 6.222 2.981 5.12 7.324-.713 4.73-3.046 19.768-5.962 30.98-3.889 20.739h2.268l2.593-2.593 10.499-13.934 17.628-22.036 7.778-8.749 9.073-9.657 5.833-4.601h11.018l8.1 12.055-3.628 12.443-11.342 14.388-9.398 12.184-13.48 18.147-8.426 14.518.778 1.166 2.01-.194 30.46-6.481 16.462-2.982 19.637-3.37 8.88 4.148.971 4.213-3.5 8.62-20.998 5.184-24.628 4.926-36.682 8.685-.454.324.519.648 16.526 1.555 7.065.389h17.304l32.21 2.398 8.426 5.574 5.055 6.805-.843 5.184-12.962 6.611-17.498-4.148-40.83-9.721-14-3.5h-1.944v1.167l11.666 11.406 21.387 19.314 26.767 24.887 1.36 6.157-3.434 4.86-3.63-.518-23.526-17.693-9.073-7.972-20.545-17.304h-1.36v1.814l4.73 6.935 25.017 37.59 1.296 11.536-1.814 3.76-6.481 2.268-7.13-1.297-14.647-20.544-15.1-23.138-12.185-20.739-1.49.843-7.194 77.448-3.37 3.953-7.778 2.981-6.48-4.925-3.436-7.972 3.435-15.749 4.148-20.544 3.37-16.333 3.046-20.285 1.815-6.74-.13-.454-1.49.194-15.295 20.999-23.267 31.433-18.406 19.702-4.407 1.75-7.648-3.954.713-7.064 4.277-6.286 25.47-32.405 15.36-20.092 9.917-11.6-.065-1.686h-.583L44.07 198.125l-12.055 1.555-5.185-4.86.648-7.972 2.463-2.593 20.35-13.999-.064.065Z"/></svg>`;
const CODEX_MARK = `<svg viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd" aria-hidden="true"><path clip-rule="evenodd" d="M8.086.457a6.105 6.105 0 013.046-.415c1.333.153 2.521.72 3.564 1.7a.117.117 0 00.107.029c1.408-.346 2.762-.224 4.061.366l.063.03.154.076c1.357.703 2.33 1.77 2.918 3.198.278.679.418 1.388.421 2.126a5.655 5.655 0 01-.18 1.631.167.167 0 00.04.155 5.982 5.982 0 011.578 2.891c.385 1.901-.01 3.615-1.183 5.14l-.182.22a6.063 6.063 0 01-2.934 1.851.162.162 0 00-.108.102c-.255.736-.511 1.364-.987 1.992-1.199 1.582-2.962 2.462-4.948 2.451-1.583-.008-2.986-.587-4.21-1.736a.145.145 0 00-.14-.032c-.518.167-1.04.191-1.604.185a5.924 5.924 0 01-2.595-.622 6.058 6.058 0 01-2.146-1.781c-.203-.269-.404-.522-.551-.821a7.74 7.74 0 01-.495-1.283 6.11 6.11 0 01-.017-3.064.166.166 0 00.008-.074.115.115 0 00-.037-.064 5.958 5.958 0 01-1.38-2.202 5.196 5.196 0 01-.333-1.589 6.915 6.915 0 01.188-2.132c.45-1.484 1.309-2.648 2.577-3.493.282-.188.55-.334.802-.438.286-.12.573-.22.861-.304a.129.129 0 00.087-.087A6.016 6.016 0 015.635 2.31C6.315 1.464 7.132.846 8.086.457zm-.804 7.85a.848.848 0 00-1.473.842l1.694 2.965-1.688 2.848a.849.849 0 001.46.864l1.94-3.272a.849.849 0 00.007-.854l-1.94-3.393zm5.446 6.24a.849.849 0 000 1.695h4.848a.849.849 0 000-1.696h-4.848z"/></svg>`;
const CURSOR_MARK = `<svg viewBox="0 0 466.73 532.09" fill="currentColor" aria-hidden="true"><path d="M457.43,125.94L244.42,2.96c-6.84-3.95-15.28-3.95-22.12,0L9.3,125.94c-5.75,3.32-9.3,9.46-9.3,16.11v247.99c0,6.65,3.55,12.79,9.3,16.11l213.01,122.98c6.84,3.95,15.28,3.95,22.12,0l213.01-122.98c5.75-3.32,9.3-9.46,9.3-16.11v-247.99c0-6.65-3.55-12.79-9.3-16.11h-.01ZM444.05,151.99l-205.63,356.16c-1.39,2.4-5.06,1.42-5.06-1.36v-233.21c0-4.66-2.49-8.97-6.53-11.31L24.87,145.67c-2.4-1.39-1.42-5.06,1.36-5.06h411.26c5.84,0,9.49,6.33,6.57,11.39h-.01Z"/></svg>`;
const GROK_MARK = `<svg viewBox="0 0 1024 1024" fill="none" aria-hidden="true"><path fill="currentColor" d="M395.479 633.828L735.91 381.105C752.599 368.715 776.454 373.548 784.406 392.792C826.26 494.285 807.561 616.253 724.288 699.996C641.016 783.739 525.151 802.104 419.247 760.277L303.556 814.143C469.49 928.202 670.987 899.995 796.901 773.282C896.776 672.843 927.708 535.937 898.785 412.476L899.047 412.739C857.105 231.37 909.358 158.874 1016.4 10.6326C1018.93 7.11771 1021.47 3.60279 1024 0L883.144 141.651V141.212L395.392 633.916"/><path fill="currentColor" d="M325.226 695.251C206.128 580.84 226.662 403.776 328.285 301.668C403.431 226.097 526.549 195.254 634.026 240.596L749.454 186.994C728.657 171.88 702.007 155.623 671.424 144.2C533.19 86.9942 367.693 115.465 255.323 228.382C147.234 337.081 113.244 504.215 171.613 646.833C215.216 753.423 143.739 828.818 71.7385 904.916C46.2237 931.893 20.6216 958.87 0 987.429L325.139 695.339"/></svg>`;

/** `SAMPLE_LOGOS` verbatim: the Claude chip is cream with a warm mark, the other three are ink. */
const SAMPLE_LOGOS = [
  { mark: CLAUDE_MARK, bg: "cream", fg: "claude" },
  { mark: CODEX_MARK, bg: "ink", fg: "mark" },
  { mark: CURSOR_MARK, bg: "ink", fg: "mark" },
  { mark: GROK_MARK, bg: "ink", fg: "mark" },
];

export const logoEnter = scene({
  id: "logo-enter",
  group: "social",
  shard: "ai-social",
  stage: { w: 480, h: 270 },
  params: {
    diameter: 118,
    overlap: 38,
    ringColor: "#fff",
    orientation: "horizontal",
    stagger: 7,
    speed: 1,
  },
  palette: {
    text: "#0A0A0A", bg: "#F0EEE6", accent: "#D97757", ring: "#ffffff", cream: "#F0EEE6",
    ink: "#0A0A0A", claude: "#D97757", mark: "#ffffff", shadow: "#00000080",
  },
  motion: { kind: "cycle", seconds: 1.4, hold: 1 },
  still: 0.7,
  markup: (_ctx, p) => {
    const size = Number(p.diameter);
    const lead = Number(p.overlap);
    const step = (1000 / 30) * Number(p.stagger);
    return `<div class="rv-row" style="--d:${size}em;--mark:${(size * 0.52).toFixed(2)}em;--lead:${-lead}em">`
      + SAMPLE_LOGOS.map((logo, index) =>
        `<div class="rv-chip" style="--i:${index};--rv-own:${Math.round(index * step)}ms;`
        + `--chip-bg:var(--p-${logo.bg});--chip-fg:var(--p-${logo.fg});z-index:${SAMPLE_LOGOS.length - index}">`
        + `${logo.mark}</div>`).join("")
      + `</div>`;
  },
});

export const aiSocial: readonly SceneSpec[] = [claudeCode, chatGpt, v0, xFollowCard, githubStars, logoEnter];

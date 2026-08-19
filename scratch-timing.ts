// Compute honest beat durations from word count. 2.6 words/sec is a comfortable
// warm-corporate read; each beat gets a small pause allowance on top.
const WPS = 2.6;

type Beat = { id: string; shot: string; text: string; vo: string; pause?: number };

const BEATS: Beat[] = [
  // ACT 1 — THE HIRE
  { id: "01", shot: "badge-printer", text: "YOU ARE OUR ONLY EMPLOYEE", vo: "Your badge is ready. Your job title is pending legal review.", pause: 0.5 },
  { id: "02", shot: "HOST", text: "welcome to humanly", vo: "Welcome to Humanly. It was legally important that you said yes.", pause: 0.4 },
  { id: "03", shot: "office-empty dolly", text: "TEAM OF 9,000", vo: "You are joining a team of nine thousand.", pause: 0.3 },
  { id: "04", shot: "office-empty balloon chair", text: "→ TEAM OF 1", vo: "A platform of nine thousand. A team of one.", pause: 0.5 },
  { id: "05", shot: "HOST", text: "your manager is the codebase", vo: "The codebase is your manager.", pause: 0.4 },

  // ACT 2 — WHY THE ROLE EXISTS
  { id: "06", shot: "benefits tablet UI", text: "DENTAL ✓  VISION ~  LIABILITY ABSORPTION ✓", vo: "Full dental. Partial vision. Designated human point of failure, fifty states.", pause: 0.4 },
  { id: "07", shot: "HOST", text: "this is why the role exists", vo: "That one is not optional. It is why the role exists.", pause: 0.5 },
  { id: "08", shot: "HOST", text: "regulators need a person", vo: "Regulators need a person to speak to.", pause: 0.2 },
  { id: "09", shot: "HOST", text: "customers need a person", vo: "Customers need a person to yell at.", pause: 0.3 },
  { id: "10", shot: "HOST", text: "the budget was clear", vo: "We checked whether those could be two people. The budget was clear.", pause: 0.5 },

  // ACT 3 — THE PREDECESSOR
  { id: "11", shot: "HOST", text: "eleven months", vo: "Your predecessor lasted eleven months. We are so proud of her.", pause: 0.4 },
  { id: "12", shot: "HOST", text: "she signed something", vo: "She is resting now. Not in a— she is fine. She signed something.", pause: 0.6 },
  { id: "13", shot: "empty desk, mouse replaying", text: "FIRST TASK", vo: "First task. Do your old job once, slowly.", pause: 0.3 },
  { id: "14", shot: "screen recording playback", text: "SO THE MODEL LEARNS WHAT MADE YOU EXPENSIVE", vo: "So the model learns what made you expensive.", pause: 0.5 },

  // ACT 4 — THE BENEFITS
  { id: "15", shot: "ticket UI: open → SENTIMENT → closed", text: "FLAGGED AS SENTIMENT · CLOSED", vo: "You report to the platform. It files your concerns as sentiment and closes them.", pause: 0.3 },
  { id: "16", shot: "ticket timestamp 4ms", text: "4ms", vo: "That takes four milliseconds. Do not wait for a reply.", pause: 0.5 },
  { id: "17", shot: "HOST", text: "your mentor is the platform", vo: "Your mentor is the platform. Your therapist is also the platform.", pause: 0.3 },
  { id: "18", shot: "two identical org cards", text: "MENTOR · THERAPIST", vo: "They run on different servers. We felt that mattered.", pause: 0.5 },
  { id: "19", shot: "garage, one lit bay", text: "B1-0001", vo: "Your parking spot is the only lit one.", pause: 0.3 },
  { id: "20", shot: "garage wide, dark", text: "ELECTRICITY IS A VARIABLE COST", vo: "Electricity is a variable cost, and you are the only one with a body.", pause: 0.5 },

  // ACT 5 — OBVIOUS INSANITY
  { id: "21", shot: "HOST", text: "in a PR crisis you say 'we'", vo: "In a crisis you go on camera and say we.", pause: 0.3 },
  { id: "22", shot: "empty lectern, one mic", text: "BLINK NATURALLY AND MEAN IT", vo: "The platform writes it. You blink naturally and mean it.", pause: 0.5 },
  { id: "23", shot: "corner-office, spinner", text: "RECONNECTING…", vo: "Our founder sends his welcome.", pause: 0.3 },
  { id: "24", shot: "corner-office, held", text: "NO EXTRADITION FRAMEWORK", vo: "He is at a latitude with no extradition treaty. The wifi is bad.", pause: 0.5 },
  { id: "25", shot: "equity schedule UI", text: "VESTS: 4 YEARS  —or—  WHEN EMPLOYMENT IS NO LONGER LEGALLY REQUIRED", vo: "Your equity vests in four years, or when employment stops being legally required.", pause: 0.3 },
  { id: "26", shot: "equity schedule, second row highlights", text: "HISTORICALLY: THE SECOND ONE", vo: "Historically, it is the second one.", pause: 0.6 },

  // ACT 6 — THE ENDING
  { id: "27", shot: "HOST — push-in has arrived, very close", text: "this video is your first performance review", vo: "One last thing. This video was your first performance review.", pause: 0.4 },
  { id: "28", shot: "HOST — closer", text: "since you pressed play", vo: "We have been reading your biometrics since you pressed play.", pause: 0.5 },
  { id: "29", shot: "HOST — closer, glances down then up", text: "adequate", vo: "Your engagement was— adequate. Welcome aboard.", pause: 0.8 },
  { id: "30", shot: "TYPE — silent", text: "YOUR ENGAGEMENT SCORE HAS BEEN RECORDED. / THIS VIDEO IS NOW PART OF YOUR FILE.", vo: "", pause: 2.5 },
  { id: "31", shot: "BRAND — silent", text: "HUMANLY(TM) / People-first. Then just first.", vo: "", pause: 2.5 },
];

let t = 0;
const rows: string[] = [];
let totalWords = 0;
let hostSeconds = 0;
for (const b of BEATS) {
  const words = b.vo.trim() ? b.vo.trim().split(/\s+/).length : 0;
  const dur = Math.round((words / WPS + (b.pause ?? 0.4)) * 10) / 10;
  const start = Math.round(t * 10) / 10;
  t += dur;
  totalWords += words;
  if (b.shot.includes("HOST")) hostSeconds += dur;
  rows.push(
    `| **${b.id}** | ${start.toFixed(1)}–${(Math.round(t * 10) / 10).toFixed(1)} | ${dur.toFixed(1)} | ${words} | ${b.shot} | ${b.vo ? `*"${b.vo}"*` : "— *(silent)*"} | \`${b.text}\` |`,
  );
}

console.log("| S | t | dur | w | shot | spoken | on-screen |");
console.log("|---|---|--:|--:|---|---|---|");
for (const r of rows) console.log(r);
const speech = t - 5.0;
console.log(`\nTOTAL: ${t.toFixed(1)}s · ${BEATS.length} beats · ${totalWords} words`);
console.log(`speech window ${speech.toFixed(1)}s → ${(totalWords / speech).toFixed(2)} words/sec`);
console.log(`HOST on screen: ${hostSeconds.toFixed(1)}s (${((hostSeconds / t) * 100).toFixed(0)}%)`);

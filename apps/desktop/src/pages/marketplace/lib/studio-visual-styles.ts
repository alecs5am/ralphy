/* Original media composition styles, shared verbatim by the live preview and portable artifact. */
export const studioVisualCss = String.raw`
/* Original reusable compositions: their complete HTML and these keyframes travel to the agent. */
.sv-scene { --sv-speed: 1; --sv-period: 14s; position: relative; isolation: isolate; width: 100%; aspect-ratio: 1; overflow: hidden; container-type: inline-size; color: #eeeae2; background: #172a25; font-family: Arial, sans-serif; text-align: left; }
.sv-scene *, .sv-scene *::before, .sv-scene *::after { box-sizing: border-box; }
.sv-scene figure { margin: 0; }
.sv-photo { width: 100%; height: 100%; display: block; object-fit: cover; }
.sv-eyebrow, .sv-footnote { position: absolute; left: 7%; font-size: 2.2cqw; font-weight: 600; letter-spacing: .12em; line-height: 1.4; }
.sv-eyebrow { top: 7%; }
.sv-footnote { bottom: 6%; }
.sv-scene [class*="sv-"] { animation-play-state: inherit; }
.sv-scene[data-playing="false"] { animation-play-state: paused; }
.sv-scene[data-playing="true"] { animation-play-state: running; }
.sv-scene em { font-family: Georgia, serif; font-weight: 400; }
.sv-photo-orbit { background: #ecece3; color: #243c32; }
.sv-orbit { position: absolute; inset: 17% 0 21%; }
.sv-orbit-photo { position: absolute; width: 29%; height: 42%; offset-path: ellipse(31% 27% at 50% 44%); offset-distance: calc(var(--sv-index) * 20%); offset-rotate: 0deg; border: .65cqw solid #fffdf8; box-shadow: 0 1.5cqw 4cqw #15251b26; animation: sv-photo-orbit calc(18s / var(--sv-speed)) linear infinite; animation-delay: calc(var(--sv-index) * -3.6s / var(--sv-speed)); }
.sv-orbit-title { position: absolute; bottom: 11%; left: 7%; font-size: 7cqw; line-height: .95; letter-spacing: -.055em; font-weight: 600; }
@keyframes sv-photo-orbit { from { offset-distance: 0%; } to { offset-distance: 100%; } }
.sv-cascading-stack { background: #d8bda6; color: #36291f; }
.sv-stack { position: absolute; inset: 8% 0 10%; }
.sv-stack-photo { position: absolute; width: 52%; height: 61%; left: 24%; top: 9%; padding: 2%; background: #f5eee5; transform-origin: 50% 82%; transform: translate(calc((var(--sv-index) - 1.5) * 4%), calc(var(--sv-index) * -3%)) rotate(calc((var(--sv-index) - 1.5) * 5deg)); box-shadow: 0 2cqw 4cqw #3726192b; animation: sv-stack calc(12s / var(--sv-speed)) cubic-bezier(.3,.05,.2,1) infinite; animation-delay: calc(var(--sv-index) * -3s / var(--sv-speed)); }
.sv-stack-photo .sv-photo { height: 88%; }
.sv-stack-photo figcaption { font-size: 1.7cqw; letter-spacing: .12em; padding: 5% 1% 0; }
.sv-bottom-title { position: absolute; bottom: 7%; left: 7%; font-size: 7.4cqw; letter-spacing: -.055em; line-height: .97; font-weight: 600; }
@keyframes sv-stack { 0%,18% { transform: translate(0,-2%) rotate(-5deg); z-index: 4; opacity: 1; } 24%,31% { transform: translate(105%,-23%) rotate(17deg); z-index: 4; opacity: 0; } 32% { transform: translate(-7%,-5%) rotate(7deg); z-index: 1; opacity: 0; } 38%,65% { transform: translate(-7%,-5%) rotate(7deg); z-index: 1; opacity: 1; } 80%,100% { transform: translate(0,-2%) rotate(-5deg); z-index: 3; opacity: 1; } }
.sv-filmstrip { background: #252e37; color: #f1eddb; }
.sv-film-title { position: absolute; top: 16%; left: 7%; font-size: 9cqw; line-height: .95; letter-spacing: -.055em; font-weight: 600; }
.sv-film-window { position: absolute; left: -5%; right: -5%; top: 43%; height: 36%; transform: rotate(-8deg); }
.sv-film-track { display: flex; gap: 1.6cqw; width: max-content; height: 100%; animation: sv-filmstrip calc(30s / var(--sv-speed)) linear infinite; }
.sv-film-track figure { width: 27cqw; height: 100%; flex: none; padding: 1cqw 1cqw 3.5cqw; color: #1e292e; background: #f1eddb; }
.sv-film-track figcaption { padding-top: .8cqw; font-size: 1.5cqw; letter-spacing: .08em; }
@keyframes sv-filmstrip { to { transform: translateX(calc(-50% - .8cqw)); } }
.sv-split-reveal { background: #292729; }
.sv-split-background, .sv-split-cover { position: absolute; inset: 0; }
.sv-split-background .sv-photo { object-position: 53% 50%; }
.sv-split-cover { clip-path: inset(0 50% 0 0); animation: sv-split calc(9s / var(--sv-speed)) cubic-bezier(.45,0,.2,1) infinite; }
.sv-split-cover .sv-photo { object-position: 46% 50%; }
.sv-split-copy { position: absolute; inset: 0; padding: 7%; display: flex; flex-direction: column; justify-content: space-between; background: linear-gradient(180deg,#0006,transparent 38%,#0009); }
.sv-split-copy span, .sv-split-copy small { font-size: 2.1cqw; letter-spacing: .1em; }
.sv-split-copy strong { margin-top: auto; margin-bottom: 5%; font-size: 10cqw; line-height: .94; font-weight: 500; letter-spacing: -.055em; text-shadow: 0 .25cqw 2cqw #0004; }
@keyframes sv-split { 0%,12%,100% { clip-path: inset(0 74% 0 0); } 44%,62% { clip-path: inset(0 16% 0 0); } }
.sv-contact-sheet { color: #273323; background: #e8ebde; }
.sv-contact { position: absolute; left: 7%; right: 7%; top: 16%; height: 54%; display: grid; grid-template-columns: repeat(3,1fr); gap: 3%; }
.sv-contact figure { position: relative; min-height: 0; overflow: hidden; transform-origin: bottom; animation: sv-contact calc(10s / var(--sv-speed)) ease-in-out infinite; animation-delay: calc(var(--sv-index) * -.7s / var(--sv-speed)); }
.sv-contact figcaption { position: absolute; bottom: 5%; right: 6%; font-size: 2cqw; color: #fff; background: #17281c88; padding: 1% 3%; }
.sv-contact-title { position: absolute; left: 7%; bottom: 7%; font-size: 7.1cqw; line-height: .95; letter-spacing: -.045em; }
@keyframes sv-contact { 0%,8%,100% { transform: translateY(0) scale(1); } 22%,38% { transform: translateY(-8%) scale(.94); } 55%,75% { transform: translateY(0) scale(1); } }
.sv-type-opener { color: #213b2a; background: #e9e9dc; }
.sv-type { position: absolute; left: 6.5%; top: 31%; font-size: 18cqw; line-height: 1.02; font-weight: 700; letter-spacing: -.075em; }
.sv-type span { display: block; overflow: hidden; }
.sv-type b { display: block; animation: sv-type calc(7s / var(--sv-speed)) cubic-bezier(.22,1,.36,1) infinite; animation-delay: calc(-1.8s / var(--sv-speed)); }
.sv-type span + span b { animation-delay: calc(-1.65s / var(--sv-speed)); }
.sv-type-rule { position: absolute; left: 7%; right: 7%; top: 73%; height: 1.8%; background: #de7841; transform-origin: left; animation: sv-rule calc(7s / var(--sv-speed)) cubic-bezier(.22,1,.36,1) infinite; }
@keyframes sv-type { 0%,8% { transform: translateY(108%); } 24%,75% { transform: translateY(0); } 93%,100% { transform: translateY(-110%); } }
@keyframes sv-rule { 0%,15%,100% { transform: scaleX(.05); } 30%,75% { transform: scaleX(1); } 94% { transform: scaleX(.05); } }
.sv-aurora-field { color: #183d38; background: #99bbb2; }
.sv-aurora { position: absolute; inset: -30%; filter: blur(4cqw); }
.sv-aurora i { position: absolute; inset: 10%; border-radius: 50%; background: radial-gradient(ellipse,#d8dfa8 0%,#d8dfa800 68%); animation: sv-aurora calc(17s / var(--sv-speed)) ease-in-out infinite alternate; }
.sv-aurora i:nth-child(2) { background: radial-gradient(ellipse,#246869 0%,#24686900 68%); animation-delay: -8s; inset: 32% -5% -10% 15%; }
.sv-aurora i:nth-child(3) { background: radial-gradient(ellipse,#e4b997 0%,#e4b99700 68%); animation-delay: -4s; inset: -10% 15% 32% -5%; }
.sv-aurora-type { position: absolute; inset: 7%; display: flex; flex-direction: column; justify-content: space-between; }
.sv-aurora-type span,.sv-aurora-type small { font-size: 2.2cqw; letter-spacing: .1em; }
.sv-aurora-type strong { font-size: 13cqw; line-height: .92; font-weight: 400; letter-spacing: -.055em; }
@keyframes sv-aurora { from { transform: translate(-9%,-8%) rotate(-30deg) scale(.95); } to { transform: translate(11%,12%) rotate(60deg) scale(1.15); } }
.sv-orbit-mark { color: #243c3c; background: #e4e8df; }
.sv-orbital { position: absolute; inset: 15% 10% 21%; perspective: 50cqw; }
.sv-ring { position: absolute; top: 14%; left: 0; width: 100%; height: 63%; border: .35cqw solid #506b69; border-radius: 50%; animation: sv-ring calc(14s / var(--sv-speed)) linear infinite; }
.sv-ring-one { transform: rotate(-30deg) rotateY(38deg); }
.sv-ring-two { transform: rotate(40deg) rotateY(65deg); animation-direction: reverse; }
.sv-ring-three { transform: rotate(80deg) rotateY(50deg); animation-delay: -5s; }
.sv-orbital-core { position: absolute; top: 30%; left: 37%; width: 26%; aspect-ratio: 1; border-radius: 50%; background: #df623f; box-shadow: inset -2cqw -1cqw 4cqw #993b2622; }
.sv-satellite { position: absolute; width: 4%; aspect-ratio: 1; border-radius: 50%; background: #243a3b; offset-path: ellipse(45% 27% at 50% 45%); offset-rotate: 0deg; animation: sv-photo-orbit calc(10s / var(--sv-speed)) linear infinite; }
.sv-orbital-caption { position: absolute; left: 7%; bottom: 7%; font-size: 7cqw; line-height: 1; letter-spacing: -.045em; }
@keyframes sv-ring { to { transform: rotate(330deg) rotateY(38deg); } }
.sv-scene { aspect-ratio: var(--sv-aspect, 1); background: var(--sv-bg-color, #172a25); color: var(--sv-text-color, #eeeae2); --sv-format-type-scale: 1; }
.sv-orbit-title { --sv-title-size: 7cqw; }
.sv-bottom-title { --sv-title-size: 7.4cqw; }
.sv-film-title { --sv-title-size: 9cqw; }
.sv-split-copy strong { --sv-title-size: 10cqw; }
.sv-contact-title { --sv-title-size: 7.1cqw; }
.sv-type { --sv-title-size: 18cqw; }
.sv-aurora-type strong { --sv-title-size: 13cqw; }
.sv-orbital-caption { --sv-title-size: 7cqw; }
.sv-scene :is(.sv-orbit-title,.sv-bottom-title,.sv-film-title,.sv-split-copy strong,.sv-contact-title,.sv-type,.sv-aurora-type strong,.sv-orbital-caption) { font-size: calc(var(--sv-title-size) * var(--sv-font-scale, 1) * var(--sv-format-type-scale)); font-weight: var(--sv-font-weight, 500); }
.sv-scene em, .sv-type b { font-weight: inherit; }
.sv-ring { border-color: color-mix(in srgb,var(--sv-text-color, #243c3c) 65%,transparent); }
.sv-satellite { background: var(--sv-text-color, #243c3c); }
.sv-aurora i { background: radial-gradient(ellipse,var(--sv-bg-color, #99bbb2) 0%,transparent 68%); }
.sv-aurora i:nth-child(2) { background: radial-gradient(ellipse,color-mix(in srgb,var(--sv-bg-color, #99bbb2) 40%,#246869) 0%,transparent 68%); }
.sv-aurora i:nth-child(3) { background: radial-gradient(ellipse,color-mix(in srgb,var(--sv-bg-color, #99bbb2) 40%,#e4b997) 0%,transparent 68%); }
.sv-scene[data-format="wide"] { --sv-format-type-scale: .65; }
.sv-scene[data-format="wide"] .sv-orbit { inset: 3% 0 3% 38%; }
.sv-scene[data-format="wide"] .sv-orbit-photo { width: 36%; height: 48%; offset-path: ellipse(29% 27% at 50% 50%); }
.sv-scene[data-format="wide"] .sv-orbit-title, .sv-scene[data-format="wide"] .sv-bottom-title { bottom: 29%; max-width: 34%; }
.sv-scene[data-format="wide"] .sv-stack { inset: 0 3% 0 41%; }
.sv-scene[data-format="wide"] .sv-stack-photo { width: 66%; height: 73%; left: 14%; top: 8%; }
.sv-scene[data-format="wide"] .sv-contact { left: 43%; right: 7%; top: 15%; height: 70%; }
.sv-scene[data-format="wide"] .sv-contact-title { bottom: 34%; max-width: 31%; }
.sv-scene[data-format="wide"] .sv-eyebrow, .sv-scene[data-format="wide"] .sv-footnote { font-size: 1.3cqw; }
.sv-scene[data-format="wide"] .sv-orbital { inset: 8% 25% 17%; }
.sv-scene[data-format="wide"] .sv-orbital-caption { bottom: 6%; }
.sv-scene[data-format="wide"] .sv-film-window { top: 46%; height: 34%; }
.sv-scene[data-format="wide"] .sv-film-track figure { width: 18cqw; padding-bottom: 2.5cqw; }
.sv-scene[data-format="wide"] .sv-film-track figcaption { font-size: 1cqw; }
.sv-scene[data-format="wide"] .sv-aurora-type span, .sv-scene[data-format="wide"] .sv-aurora-type small { font-size: 1.3cqw; }
.sv-scene[data-format="wide"] .sv-type { top: 25%; }
.sv-scene[data-format="wide"] .sv-type-rule { top: 85%; }
.sv-scene[data-format="portrait"] .sv-type { top: 39%; }
.sv-scene[data-format="portrait"] .sv-type-rule { top: 64%; }
.sv-scene[data-playing="false"] *, .sv-scene[data-playing="false"] *::before, .sv-scene[data-playing="false"] *::after { animation-play-state: paused !important; }
@media (prefers-reduced-motion: reduce) { .sv-scene:not([data-motion="manual"]) *, .sv-scene:not([data-motion="manual"]) *::before, .sv-scene:not([data-motion="manual"]) *::after { animation: none !important; } }
`;

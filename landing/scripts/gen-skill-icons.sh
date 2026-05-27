#!/usr/bin/env bash
# Regenerate the green-screen source images for the skill-icon tiles.
#
# Pipeline:
#   1. this script -> green-screen PNGs in the throwaway ralphy project
#      `landing-skill-icons-001` (workspace/, gitignored). Needs OPENROUTER_API_KEY.
#   2. build-skill-icons.py -> chroma-key + composite -> public/assets/skills/*.webp
#      (the committed artifacts; ~0.2 MB total).
#
# The 1024px green-screen sources are NOT committed (~18 MB). The webp tiles are
# the source of truth in-repo; re-run this only to change an icon's subject.
#
# Usage (from the repo root):
#   bash landing/scripts/gen-skill-icons.sh           # all icons
#   bash landing/scripts/gen-skill-icons.sh <slug>    # one icon (re-roll)
set -u
cd "$(dirname "$0")/../.." || exit 1   # repo root

PROJ=landing-skill-icons-001
A="Retro pixel-art video-game item icon, a single centered "
B=", chunky 32x32 pixel aesthetic with a bold dark outline, limited vibrant palette, flat shading, crisp hard pixels, no anti-aliasing, the object floating directly on a perfectly flat uniform pure chroma-key green background hex #00FF00, NO white card, NO panel, NO frame, NO rounded box behind the object, nothing but the object on pure green, no gradient, no texture, no drop shadow"

# slug | icon subject. Background tile colour is chosen by category in
# build-skill-icons.py (by slug prefix), NOT here.
ITEMS=(
"ralphy-ugc-unboxing|open cardboard delivery box with flaps open"
"ralphy-ugc-ad|glowing yellow megaphone"
"ralphy-ugc-model-swap|two overlapping person head silhouettes with circular swap arrows"
"ralphy-ugc-rockstar|gold five-pointed star badge with a tiny palm tree"
"ralphy-researcher|magnifying glass"
"ralphy-evaluator|white clipboard with a checkmark and a star rating"
"ralphy-install|downward download arrow dropping into an open tray"
"ralphy-postmortem|open notebook with a wooden pencil"
"ralphy-templater|stack of three layered blueprint cards"
"ralphy-audio-explainer|blue headphones with an orange sound waveform"
"ralphy-dev-release|launching rocket with an orange flame"
"animejs|orange bouncing ball with a dotted motion arc trail"
"contribute-catalog|jigsaw puzzle piece with a plus sign"
"css-animations|curly braces with small orange motion speed lines"
"gsap|orange play triangle button with an easing curve line"
"hyperframes|black and white film clapperboard"
"hyperframes-cli|dark terminal command window with a blinking cursor prompt"
"hyperframes-media|film strip combined with a blue speaker sound icon"
"hyperframes-registry|grid of stacked colorful building blocks"
"lottie|three orange loading dots in a horizontal row"
"tailwind|stylized cyan wind gust swoosh"
"three|blue 3D wireframe cube"
"typegpu|computer GPU chip with circuit lines"
"waapi|horizontal timeline bar with keyframe diamonds"
"website-to-hyperframes|browser window with a play button turning into a film frame"
)

bun run cli/index.ts project create --id "$PROJ" --name "Landing skill icons" >/dev/null 2>&1 || true

only="${1:-}"
MAX=5
for entry in "${ITEMS[@]}"; do
  slug="${entry%%|*}"; subj="${entry#*|}"
  [ -n "$only" ] && [ "$slug" != "$only" ] && continue
  ( bun run cli/index.ts generate image --project "$PROJ" --slot "$slug" \
      --force-overwrite --size 1024x1024 --prompt "${A}${subj}${B}" >/dev/null 2>&1 \
      && echo "ok: $slug" || echo "FAIL: $slug" ) &
  while [ "$(jobs -rp | wc -l)" -ge "$MAX" ]; do sleep 1; done
done
wait
echo "generation done — now run: python3 landing/scripts/build-skill-icons.py"

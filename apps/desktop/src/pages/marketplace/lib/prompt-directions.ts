import { fillPrompt } from "./prompt-variables";
import type { MarketplaceItemPresentation } from "./presentation";

type Direction = { label: string; intent: string; values: Record<string, string>; treatment: string };

const directions: Record<string, Direction[]> = {
  "human-editorial": [
    { label: "The maker", intent: "A warm profile for a creative practice", values: { subject: "a ceramic artist in a work apron", setting: "a quiet pottery studio beside a large window" }, treatment: "Include a single unfinished ceramic piece low in the frame. Keep the studio softly out of focus and the expression thoughtful." },
    { label: "Sunday morning", intent: "A relaxed lifestyle story", values: { subject: "an adult reader in a simple cream knit", setting: "a lived-in apartment with a tall north-facing window" }, treatment: "Use an informal seated pose, an open book resting below the face and a calm, unhurried expression. Keep the framing intimate." },
    { label: "At the desk", intent: "An approachable professional portrait", values: { subject: "an independent architect in charcoal workwear", setting: "a modest design studio beside a daylight window" }, treatment: "Leave a little negative space to the right for a name added later. Avoid a corporate headshot pose or visible client documents." },
  ],
  "liminal-tension": [
    { label: "Last train", intent: "Suspense through distance and repetition", values: { location: "subway platform with repeating tiled columns" }, treatment: "Make the ambiguous shape a distant, stationary silhouette beyond the last column. Keep the near platform empty and the tracks readable." },
    { label: "Night shift", intent: "An ordinary workplace that feels wrong", values: { location: "office corridor with closed doors and a polished floor" }, treatment: "Let one door at the far end stand slightly open. Its light should feel inconsistent with the rest of the corridor; show no person clearly." },
    { label: "Empty pool", intent: "A quiet, architectural horror frame", values: { location: "indoor swimming pool viewed along the water's edge" }, treatment: "Use still water and repeating lane markings to lead the eye toward a dark doorway. The reflection should reveal the distant shape only subtly." },
  ],
  "chrome-still-life": [
    { label: "Coffee ritual", intent: "A precise product launch image", values: { product: "a polished stainless-steel manual coffee grinder" }, treatment: "Frame the grinder upright at a three-quarter angle. Let the reflection describe the cylinder without washing out its edges." },
    { label: "Listening object", intent: "A sculptural audio campaign", values: { product: "a compact chrome desktop speaker with an unbranded grille" }, treatment: "Use a low three-quarter view so the grille and outer shell are both legible. Keep the plinth plain and reflections broad." },
    { label: "Small essentials", intent: "An understated accessory still life", values: { product: "a closed polished-metal watch case without a visible brand" }, treatment: "Keep the lid closed and emphasize the hinge and seam through edge lighting. Use a horizontal composition with generous breathing room." },
  ],
  "rain-city": [
    { label: "Tokyo side street", intent: "A layered, intimate city scene", values: { city: "Tokyo, along a narrow residential shopping lane" }, treatment: "Frame from under a shallow awning. Keep storefronts small, utility lines plausible and the distant pedestrian near the vanishing point." },
    { label: "Lisbon after hours", intent: "Warm architecture and reflected light", values: { city: "Lisbon, on a sloping cobbled street with tiled facades" }, treatment: "Let warm window light run across the wet stone. Include the street's gentle incline and avoid adding landmarks that do not belong together." },
    { label: "Seoul corner", intent: "A quiet music-release backdrop", values: { city: "Seoul, at a small late-night cafe on a side street" }, treatment: "Keep the cafe on one side of the frame and leave the opposite side dark and open. Preserve a calm composition with one distant pedestrian." },
  ],
  "retro-racer": [
    { label: "Dust trail", intent: "A clear hero frame for a game concept", values: {}, treatment: "Use an off-white unbranded rally coupe and a broad dusty straightaway. Keep the car fully visible; use its dust trail to lead back toward the checkpoint." },
    { label: "Rocky turn", intent: "A more dynamic action beat", values: {}, treatment: "Place the checkpoint on a wide bend between low sandstone outcrops. Turn the front wheels into the curve and keep every wheel grounded; preserve a readable three-quarter silhouette." },
    { label: "Checkpoint approach", intent: "A composed teaser-cover direction", values: {}, treatment: "Place a simple checkpoint gantry behind the car with no lettering. Keep the vehicle in the lower half and leave clear sky above for a title added later." },
  ],
  "botanical-plate": [
    { label: "Fern study", intent: "A lesson in repeating structure", values: { plant: "one unfurling fern frond with a short stem" }, treatment: "Show both the curled tip and the repeated leaflets. Leave space around the specimen so later annotations can sit outside it." },
    { label: "Ginkgo detail", intent: "A simple silhouette with fine texture", values: { plant: "a small ginkgo branch carrying three fan-shaped leaves" }, treatment: "Arrange the leaves with minimal overlap so each vein pattern remains visible. Keep leaf color naturally varied rather than uniform." },
    { label: "Seed capsule", intent: "An educational close-up of form", values: { plant: "a dried poppy seed capsule with a short section of stem" }, treatment: "Focus on the crown, pores and dry surface texture. Keep the specimen whole, with enough depth of field to read its structure." },
  ],
  "wide-escape": [
    { label: "Ridge traverse", intent: "A travel opener with clear scale", values: {}, treatment: "Let the winding trail follow a narrow but plausible ridge. Place the tiny hiker near a bend in the lower third, wearing an unbranded rust-colored jacket." },
    { label: "Alpine water", intent: "A quieter landscape cover", values: {}, treatment: "Include a small alpine lake in the middle distance and route the winding trail along its shore. Keep the tiny hiker separate from the reflection." },
    { label: "Valley layers", intent: "A spacious establishing frame", values: {}, treatment: "Use a high overlook into a long valley. Let soft morning mist separate the distant ridges, while the foreground trail and tiny hiker remain sharply readable." },
  ],
  "late-fashion": [
    { label: "Sculpted coat", intent: "A silhouette-led collection image", values: { look: "a long charcoal wool coat over simple straight-leg trousers" }, treatment: "Use a relaxed standing pose with the coat slightly open. Keep the hem and shoulders fully visible, with the shadow falling away from the garment." },
    { label: "Evening movement", intent: "A tactile story about fabric", values: { look: "a muted burgundy pleated dress with a clean neckline" }, treatment: "Capture a small natural turn that opens the pleats without obscuring the full silhouette. Keep the fabric construction accurate and the pose grounded." },
    { label: "Soft tailoring", intent: "A restrained modern campaign", values: { look: "a cream tailored suit with a softly structured jacket" }, treatment: "Use a quiet leaning pose beside a concrete column. Preserve the jacket's seams, trouser crease and full garment outline." },
  ],
  "baseball-broadcast-image": [
    { label: "Day game", intent: "An easygoing afternoon in the stands", values: { "jersey colors": "cream with navy trim", "stadium lighting": "clear afternoon daylight with soft open shade across the seating section" }, treatment: "Keep the cream jersey separate from the brighter seats behind it. Use a few sunlit rows in the distance to establish the daytime game while keeping the reference face evenly exposed." },
    { label: "Under the lights", intent: "A natural evening broadcast frame", values: { "jersey colors": "forest green with white trim", "stadium lighting": "neutral stadium floodlights after dusk, with consistent highlights on the fan and nearby spectators" }, treatment: "Let the distant stands fall slightly darker than the subject while retaining visible spectators. Keep skin color natural and the floodlight reflections small; the image should feel like a live game rather than a spotlighted portrait." },
    { label: "Golden inning", intent: "A warmer late-afternoon fan moment", values: { "jersey colors": "burgundy with pale gold trim", "stadium lighting": "low late-afternoon sunlight softened by the stadium structure, with warm highlights and gently filled shadows" }, treatment: "Place a restrained warm rim on the hair and shoulder while preserving detail across the face. Carry the same light direction through the surrounding rows and keep the background colors quieter than the jersey." },
  ],
  "baseball-broadcast-motion": [
    { label: "Quiet crowd", intent: "Keep attention on the fan's recognition", values: {}, treatment: "Within the same ten-second timing, limit the surrounding crowd to quiet breathing and occasional independent blinks. Keep nearby hands low so the subject's single wave at 6–9 seconds remains the clearest movement. Preserve the locked camera and all existing background identities." },
    { label: "Soft broadcast", intent: "A small reaction with a consistent television texture", values: {}, treatment: "Keep the starting frame's mild broadcast softness and exposure consistent throughout. During the existing 4–6 second recognition beat, let the eyes lead the small head turn, with a brief natural pause before the smile. Retain the same 6–9 second wave, 9–10 second settling beat and fixed camera." },
    { label: "Relaxed reaction", intent: "A shy, unhurried acknowledgment of the camera", values: {}, treatment: "Let the smile develop gently rather than becoming a broad grin. Keep the one wave compact and comfortable near shoulder height during 6–9 seconds, using a small wrist movement with relaxed fingers. Lower the hand during 9–10 seconds; preserve the earlier watching and recognition beats, the full ten-second duration and the static framing." },
  ],
};

/** Directions change the prompt, never the sample image beside it. */
export function promptDirections(item?: MarketplaceItemPresentation) {
  if (!item?.key.startsWith("studio:prompts:") || !item.studio?.body) return [];
  return (directions[item.key.slice("studio:prompts:".length)] ?? []).map((direction) => {
    const source = `${item.studio!.body}\n\n${direction.treatment}`;
    return { ...direction, source, prompt: fillPrompt(source, direction.values) };
  });
}

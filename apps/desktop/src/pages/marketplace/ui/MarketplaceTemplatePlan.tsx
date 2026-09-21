import { useId, useState } from "react";
import { ArrowRight } from "@/shared/ui/icons";
import type { MarketplaceItemPresentation } from "../lib/presentation";
import { MarketplaceTemplateModules } from "./MarketplaceTemplateModules";

type Plan = { inputs: string[]; output: string; beats: [time: string, direction: string, input: string, output: string][] };
const plans: Record<string, Plan> = {
  "baseball-broadcast": { inputs: ["Portrait photo", "Jersey colors"], output: "10-second 16:9 reaction video · Approved still + motion clip", beats: [
    ["Photo", "Choose a clear portrait and the jersey colors. Confirm that the face is readable before building the broadcast scene.", "A portrait photo and two jersey colors", "An approved identity reference and a clear wardrobe direction"],
    ["Still", "Use the still-image prompt with GPT Image to create the broadcast frame. Review the face, jersey and composition before animating.", "The portrait, jersey colors and included still-image prompt", "An approved 16:9 broadcast frame with the person recognizable"],
    ["0–10s", "Pass the approved frame to the image-to-video prompt. Generate one ten-second reaction while keeping the face and broadcast framing consistent.", "The approved still and included motion prompt", "A ten-second 16:9 reaction clip with consistent identity"],
    ["Review", "Watch the complete reaction and check the face, hands and clothing. Export the approved clip and keep its source frame together.", "The generated reaction clip and its approved source frame", "An approved still and a ten-second widescreen video"],
  ] },
  "product-reveal": { inputs: ["Product image", "Product name", "One benefit"], output: "15-second vertical film · Clean master + captions", beats: [
    ["0–3s", "Open on a close material detail. Give the viewer one clear reason to keep watching.", "Approved product image with readable surface detail", "One close-up that establishes material and quality"],
    ["3–7s", "Reveal the complete product with subtle camera motion. Preserve its actual shape and branding.", "The same approved product reference", "A complete, recognizable product view"],
    ["7–12s", "Show one verified benefit in use. Keep essential copy clear of the bottom safe area.", "One supported benefit and an accurate use reference", "A single benefit shown clearly in five seconds"],
    ["12–15s", "Hold the product and a concise closing line. Review the first frame and export the finished cut.", "Product name and approved closing copy", "A readable end frame; clean and captioned masters"],
  ] },
  "found-footage": { inputs: ["A location", "A fictional anomaly", "Final line"], output: "20-second horror short · Clean + VHS versions", beats: [
    ["0–6s", "Establish an ordinary place. Let room tone and a steady frame make it feel believable.", "A location reference and quiet room tone", "A stable establishing shot without the anomaly"],
    ["6–13s", "Return to the same view with one subtle change. The anomaly should read before adding texture.", "The opening composition and one fictional change", "A matching shot with a readable, restrained anomaly"],
    ["13–18s", "Stay with the unsettling detail. Add one distant sound and leave space around it.", "The anomaly shot and one distant impact sound", "A five-second hold that builds tension"],
    ["18–20s", "Cut to black and silence. Keep a clean master alongside the VHS-treated revision.", "The assembled clean sequence", "A silent black ending; clean and VHS-treated versions"],
  ] },
  "editorial-profile": { inputs: ["Approved portrait", "Short biography", "Exact quote"], output: "30-second profile · Clean + captioned versions", beats: [
    ["0–5s", "Introduce the person with a portrait and their name. Keep the image unobstructed.", "Approved portrait and exact name", "A clear five-second introduction"],
    ["5–20s", "Show three details, each paired with one sourced fact and enough reading time.", "Three factual details and matching visual references", "Three short scenes with one fact each"],
    ["20–27s", "Give the exact quote a quiet frame. Add captions if the line is narrated.", "An exact, approved quote", "One readable quote frame with matching captions"],
    ["27–30s", "Return to the portrait and name. Export a clean version and one with captions.", "The opening portrait and assembled sequence", "A consistent closing frame and two final versions"],
  ] },
  "travel-postcard": { inputs: ["One destination", "Six owned or licensed shots"], output: "24-second widescreen postcard · Video + timeline", beats: [
    ["0–4s", "Establish the destination with an uncluttered wide shot and natural ambience.", "Wide footage and local ambience from one destination", "A four-second establishing shot"],
    ["4–8s", "Move closer to a material or surface that belongs to this place.", "A texture shot from the same location", "A closer view that adds a sense of touch"],
    ["8–12s", "Include a human figure to establish scale while retaining geographic continuity.", "A shot with a person in the landscape", "A readable human scale reference"],
    ["12–16s", "Choose a shot with clear movement and cut on an intentional rhythm.", "Footage of one simple local movement", "A rhythmic transition without a distracting effect"],
    ["16–20s", "Pause on a small local detail. Keep the time of day consistent.", "A detail filmed in compatible light", "A quiet four-second pause"],
    ["20–24s", "Return to a wide frame and introduce the place name. Check horizons and audio transitions.", "Final wide shot and exact place name", "A named closing frame, timeline and finished postcard"],
  ] },
  "fashion-drop": { inputs: ["Three outfit images", "Collection name", "Release date"], output: "12-second launch · Silent preview + mixed master", beats: [
    ["0–2s", "Lead with the silhouette. Keep the clothing construction true to the references.", "An approved image with the complete outfit visible", "A silhouette-led opening frame"],
    ["2–5s", "Give the fabric and finish their own close-up. Cut to a clear beat.", "A fabric-detail reference and the chosen beat", "A tactile close-up with a deliberate cut"],
    ["5–9s", "Hold the full look with concise typography outside the garment.", "Full-look image and collection name", "Four seconds to read the outfit and name"],
    ["9–12s", "Finish with the exact drop date and collection name. Save silent and mixed versions.", "Approved release date and final audio mix", "A clear date card; silent preview and mixed master"],
  ] },
  "carousel-explainer": { inputs: ["A topic", "Three sourced facts", "One takeaway"], output: "Six 4:5 slides · Numbered PNGs + review sheet", beats: [
    ["Slide 1", "Ask one clear question with a strong visual hook.", "One topic and a question the audience recognizes", "A cover slide that promises a specific lesson"],
    ["Slide 2", "Set the context in one headline and no more than two short sentences.", "The minimum context needed to understand the topic", "One short, readable context slide"],
    ["Slides 3–5", "Give each sourced fact its own frame. Repeat the same type and image system.", "Three facts with their source references", "Three lesson slides, each with one idea"],
    ["Slide 6", "End with a useful takeaway. Verify reading order and add citations to the caption.", "One actionable takeaway and the source list", "Six numbered PNGs, a review sheet and cited caption"],
  ] },
  "game-teaser": { inputs: ["Game concept", "An environment", "One action"], output: "18-second concept teaser · Clean + styled versions", beats: [
    ["0–5s", "Sell the atmosphere of the fictional world with a clear establishing frame.", "Game concept and one environment reference", "A five-second introduction to the world"],
    ["5–11s", "Show one readable action with a strong silhouette and consistent screen direction.", "One action and a consistent character or vehicle reference", "An action beat that is clear at a glance"],
    ["11–15s", "Hold a distinctive detail. Apply any retro treatment consistently to the assembled shots.", "A world detail and the chosen visual treatment", "A memorable detail with a consistent finish"],
    ["15–18s", "Reveal the title and identify the piece as a concept teaser. Check rapid flashes before export.", "Exact title and the label 'Concept teaser'", "A labelled title card; clean and styled exports"],
  ] },
  "night-city-loop": { inputs: ["Night-city image", "An original or licensed audio loop"], output: "8-second square loop · Clean source + looping master", beats: [
    ["Frame", "Choose a strong night-city composition. Keep architecture and any lettering stable.", "One square night-city image", "A clean source composition with a defined focal point"],
    ["Motion", "Animate a small area such as reflections, light or a passing silhouette.", "The source frame and one chosen area of motion", "Eight seconds of restrained local movement"],
    ["Loop", "Match the first and last frame. Remove clicks at the audio boundary.", "The motion clip and an original or licensed audio loop", "A seamless picture and sound boundary"],
    ["Export", "Review three consecutive loops at actual size, then save the clean source and final loop.", "The completed loop and its clean source", "A square looping master saved as a new revision"],
  ] },
};

export function MarketplaceTemplatePlan({ item, items, onOpenItem }: {
  item: MarketplaceItemPresentation;
  items?: MarketplaceItemPresentation[];
  onOpenItem?(key: string): void;
}) {
  const [selected, setSelected] = useState(0);
  const sequenceId = useId();
  const plan = plans[item.key.split(":").at(-1) ?? ""];
  const steps = item.studio?.steps;
  if (!steps?.length) return null;
  const current = Math.min(selected, steps.length - 1);
  const beat = plan?.beats[current];
  return <section className="explore-template-plan">
    {plan && <div className="explore-template-inputs"><h3>What you’ll need</h3><ul>{plan.inputs.map((input) => <li key={input}>{input}</li>)}</ul></div>}
    <MarketplaceTemplateModules item={item} items={items} selectedStep={current} onOpenItem={onOpenItem} />
    <div className="explore-inspector-heading"><h3>The sequence</h3><span>{steps.length} steps</span></div>
    <ol className="explore-template-timeline" aria-label="Template workflow">
      {steps.map((step, index) => <li key={step}>
        <button type="button" id={`${sequenceId}-step-${index}`} onClick={() => setSelected(index)} aria-pressed={current === index} aria-controls={`${sequenceId}-detail`}>
          <span className="explore-timeline-position"><span>{String(index + 1).padStart(2, "0")}</span><span>{plan?.beats[index]?.[0]}</span></span>
          <strong>{step}</strong><small>{plan?.beats[index]?.[3]}</small>
        </button>
      </li>)}
    </ol>
    {beat && <section className="explore-template-beat" id={`${sequenceId}-detail`} aria-labelledby={`${sequenceId}-step-${current}`}>
      <div className="explore-beat-heading"><h3>{steps[current]}</h3><span>{beat[0]}</span></div>
      <p>{beat[1]}</p>
      <dl className="explore-beat-handoff"><div><dt>Start with</dt><dd>{beat[2]}</dd></div><ArrowRight className="size-4" aria-hidden="true" /><div><dt>Make</dt><dd>{beat[3]}</dd></div></dl>
    </section>}
    {plan && <div className="explore-template-output"><h3>You’ll make</h3><p>{plan.output}</p></div>}
  </section>;
}

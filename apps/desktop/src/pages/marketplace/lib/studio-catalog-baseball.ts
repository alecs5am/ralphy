import type { StudioEntry } from "./studio-catalog";

const asset = (name: string) => `${import.meta.env.BASE_URL}explore/studio/${name}`;
const reference = {
  title: "Baseball broadcast trend guide · YouCam",
  url: "https://yce.perfectcorp.com/use-case/ai-baseball-broadcast-trend",
};
const mediaCredit = "User-provided example video; media rights not specified.";

const imagePrompt = `Use the attached portrait as the identity reference for a realistic baseball fan-camera still. Preserve the person's facial structure, apparent age, skin tone, hairstyle and distinctive features. Seat them naturally among spectators in a busy baseball stadium, wearing a simple jersey in [jersey colors]. Use [stadium lighting] consistently on the person and crowd. Frame the complete head, shoulders and upper torso from a fixed, distant telephoto camera at seated eye level. The person is watching the field, not looking at the camera yet, with a relaxed expression and their hands resting naturally. Leave room near shoulder height for a small wave in a later animation. Keep photographic skin detail and plausible hands; avoid beauty retouching or a posed advertising look. Surrounding fans are distinct people, softly out of focus, with believable seating and clothing. A restrained fictional score graphic may occupy the upper corners, clear of the face; do not add a broadcaster watermark. Compose a horizontal 16:9 frame with mild sports-broadcast softness and no camera tilt. This is the starting image for a reaction sequence, so do not depict the wave or final smile yet.`;

const motionPrompt = `Use the supplied, approved stadium still as the first frame of one continuous 10-second, horizontal 16:9 reaction shot. Keep the telephoto camera locked in place: no zoom, pan, push-in, reframing or cuts. From 0–4 seconds, the fan watches the field with quiet breathing and an occasional natural blink. From 4–6 seconds, their eyes find the camera, followed by a small head turn and a brief look of recognition. From 6–9 seconds, they smile naturally and give one relaxed wave near shoulder height. From 9–10 seconds, the hand lowers and the expression settles into a gentle smile. Preserve the reference face, hairstyle, jersey design, skin tone and body proportions throughout. Keep hand anatomy consistent as the fingers move together through the wave. Retain the same seats, spectators and lighting; background movement should be small and independent, without replacing people or changing the setting. If score graphics are present, keep their position, lettering and values fixed. Do not invent dialogue, music, extra objects, new text or additional actions. Maintain natural motion and the original image composition for the full ten seconds.`;

export function studioBaseballTemplate(): StudioEntry {
  return {
    id: "baseball-broadcast",
    name: "Baseball fan cam",
    summary: "Turn a portrait into a baseball fan-camera moment: watching the game, then noticing the camera and waving.",
    tags: ["baseball", "trend", "sports", "fan-cam", "broadcast", "reaction", "portrait", "identity-reference", "image-to-video", "16:9"],
    format: "16:9",
    duration: "10 sec",
    preview: { kind: "video", url: asset("baseball-broadcast-example.mp4"), posterUrl: asset("baseball-broadcast-poster.jpg") },
    steps: ["Choose a portrait", "Build the broadcast frame", "Animate the reaction", "Review and export"],
    modules: [
      { key: "studio:prompts:baseball-broadcast-image", step: 1, role: "Create the still · GPT Image" },
      { key: "studio:prompts:baseball-broadcast-motion", step: 2, role: "Animate the still · Image to video" },
    ],
    body: `Start with a clear portrait reference, the desired jersey colors and stadium lighting. The supplied example shows a fan in a white-and-blue jersey watching a game before noticing the camera, smiling and waving; it illustrates the intended timing, not a guarantee of an identical result.

1. Choose a portrait with a clear face and natural expression. Use it as the person's identity reference, not as the first frame of the video.
2. Open the linked "Your baseball broadcast frame" image prompt and use GPT Image with the portrait attached. Fill in jersey colors and stadium lighting. Generate a 16:9 stadium still with the person watching the field. Check the face, jersey, hands and framing, then select the still to use.
3. Open the linked "The camera finds you" motion prompt. Pass the approved stadium still to an image-to-video model; do not skip directly from the original portrait to animation. Keep the camera static: watch the game at 0–4s, notice the camera at 4–6s, smile and wave at 6–9s, then settle at 9–10s. Preserve any existing score overlay.
4. Review the full clip for identity drift, changing clothing, malformed hands and unstable background or scoreboard details. Deliver a 10-second 1920×1080 video, retaining the approved still and source portrait. Save the new clip as a separate revision. Add audio only when requested and from a supplied or licensed source.

The linked prompts are original Ralphy instructions inspired by the referenced workflow and the supplied example. The example video's generation model is not known; it is not presented as an output made with these prompts.`,
    reference,
    mediaCredit,
  };
}

export function studioBaseballPrompts(): StudioEntry[] {
  return [
    {
      id: "baseball-broadcast-image",
      name: "Your baseball broadcast frame",
      summary: "Use GPT Image and a portrait reference to build the still before animating the reaction.",
      tags: ["baseball", "broadcast", "fan-cam", "portrait", "identity-reference", "gpt-image", "image-prompt", "16:9"],
      format: "GPT Image · Image prompt",
      preview: { kind: "image", url: asset("baseball-broadcast-poster.jpg") },
      body: imagePrompt,
      artifact: imagePrompt,
      reference,
      mediaCredit,
    },
    {
      id: "baseball-broadcast-motion",
      name: "The camera finds you",
      summary: "Animate an approved stadium still into a small, natural reaction with a locked camera.",
      tags: ["baseball", "broadcast", "fan-cam", "reaction", "image-to-video", "motion-prompt", "static-camera", "16:9"],
      format: "Image to video · Motion prompt",
      duration: "10 sec",
      preview: { kind: "video", url: asset("baseball-broadcast-example.mp4"), posterUrl: asset("baseball-broadcast-poster.jpg") },
      body: motionPrompt,
      artifact: motionPrompt,
      reference,
      mediaCredit,
    },
  ];
}

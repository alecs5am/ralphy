// Print ready-to-paste UTM share links for library units, one per promotion
// channel. Use when writing a Reddit / Medium / X post: copy the link for that
// channel so the inbound visit is attributed in GA4 + PostHog.
//
//   bun run share-links                 # links for every unit, all channels
//   bun run share-links choose-backrooms  # links for one unit
//   bun run share-links --campaign launch # override the campaign tag
//
// Relative imports (not the "@/" alias) so it runs standalone under `bun run`.

import { getUnits } from "../lib/library-v2/source";
import { templateGrabLink } from "../lib/utm";

const CHANNELS = ["reddit", "medium", "x", "devto", "hackernews", "linkedin"];

async function main() {
  const args = process.argv.slice(2);
  const campaignFlag = args.indexOf("--campaign");
  const campaign =
    campaignFlag >= 0 ? args[campaignFlag + 1] : "grab-template";
  const idArg = args.find((a) => !a.startsWith("--") && a !== campaign);

  const units = await getUnits();
  const selected = idArg ? units.filter((u) => u.id === idArg) : units;

  if (!selected.length) {
    console.error(
      idArg
        ? `No unit with id "${idArg}". Run without an id to list all.`
        : "No units found.",
    );
    process.exit(1);
  }

  for (const u of selected) {
    console.log(`\n## ${u.title}  (${u.id})`);
    for (const ch of CHANNELS) {
      console.log(`${ch.padEnd(11)} ${templateGrabLink(u.id, ch, campaign)}`);
    }
  }
}

main();

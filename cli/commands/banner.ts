import { Command } from "commander";
import { printBanner } from "../lib/banner.js";

export function bannerCmd(): Command {
  const cmd = new Command("banner");
  cmd
    .description("Print the Ralphy ASCII banner")
    .action(() => {
      printBanner();
    });
  return cmd;
}

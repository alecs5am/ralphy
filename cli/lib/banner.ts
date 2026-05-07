const NO_COLOR = process.env.NO_COLOR || !process.stdout.isTTY;

const c = {
  reset: NO_COLOR ? "" : "\x1b[0m",
  dim: NO_COLOR ? "" : "\x1b[2m",
  bold: NO_COLOR ? "" : "\x1b[1m",
  yellow: NO_COLOR ? "" : "\x1b[33m",
  cyan: NO_COLOR ? "" : "\x1b[36m",
  magenta: NO_COLOR ? "" : "\x1b[35m",
};

const LOGO = `
${c.yellow}    ____        __      __         ${c.reset}
${c.yellow}   / __ \\____ _/ /___  / /_  __  __${c.reset}
${c.yellow}  / /_/ / __ \`/ / __ \\/ __ \\/ / / /${c.reset}
${c.yellow} / _, _/ /_/ / / /_/ / / / / /_/ / ${c.reset}
${c.yellow}/_/ |_|\\__,_/_/ .___/_/ /_/\\__, /  ${c.reset}
${c.yellow}             /_/          /____/   ${c.reset}
`;

const TAGLINE = `${c.dim}        UGC video pipeline · ralphy.dev${c.reset}`;

export function bannerString(): string {
  return `${LOGO}${TAGLINE}\n`;
}

export function printBanner(): void {
  process.stdout.write(bannerString() + "\n");
}

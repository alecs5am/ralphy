import { join } from "node:path";

export function resolveRalphyExecutable(input: {
  isPackaged: boolean;
  appPath: string;
  resourcesPath: string;
  env: NodeJS.ProcessEnv;
}): string {
  if (input.isPackaged) return join(input.resourcesPath, "bin", "ralphy");
  return input.env.RALPHY_BIN || join(input.appPath, "..", "..", "cli", "index.ts");
}

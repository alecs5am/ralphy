import { join } from "node:path";

export function resolveRalphyExecutable(input: {
  isPackaged: boolean;
  resourcesPath: string;
  env: NodeJS.ProcessEnv;
}): string | undefined {
  if (input.isPackaged) return join(input.resourcesPath, "bin", "ralphy");
  return input.env.RALPHY_BIN || undefined;
}

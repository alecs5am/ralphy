const PROVIDERS = { openrouter: "OPENROUTER_API_KEY", elevenlabs: "ELEVENLABS_API_KEY", fal: "FAL_KEY" } as const;

/** One app-owned credential snapshot for Create, Canvas and both agent harnesses. */
export function appCredentialEnvironment(source: NodeJS.ProcessEnv, selected: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...source };
  const providers: string[] = [];
  for (const [id, name] of Object.entries(PROVIDERS)) {
    delete env[name];
    delete env[`RALPHY_APP_${name}`];
    if (selected[name]) { env[name] = selected[name]; env[`RALPHY_APP_${name}`] = selected[name]; providers.push(id); }
  }
  env.RALPHY_APP_CREDENTIALS = providers.join(",");
  return env;
}

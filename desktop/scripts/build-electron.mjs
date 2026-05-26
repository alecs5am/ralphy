// Bundle the Electron main + preload TypeScript to dist-electron/*.cjs.
// CJS so the .cjs extension forces CommonJS even though package.json is "module".
import { build } from "esbuild";

await build({
  entryPoints: ["electron/main.ts", "electron/preload.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  outdir: "dist-electron",
  outExtension: { ".js": ".cjs" },
  external: ["electron"],
  logLevel: "info",
});

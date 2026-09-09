// Bundle the Electron main + preload TypeScript to dist-electron/*.cjs.
// CJS so the .cjs extension forces CommonJS even though package.json is "module".
import { build } from "esbuild";

await build({
  entryPoints: {
    main: "electron/main.ts",
    preload: "electron/preload.ts",
    "media/worker": "electron/media/worker.ts",
  },
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  outdir: "dist-electron",
  outExtension: { ".js": ".cjs" },
  external: ["electron"],
  logLevel: "info",
});

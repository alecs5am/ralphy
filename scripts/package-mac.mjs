import { execFileSync } from "node:child_process";
import {
  cp,
  chmod,
  mkdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  APPROVED_CORE_SHA256,
  APPROVED_CORE_SOURCE,
  APPROVED_CORE_VERSION,
  readApprovedCoreBytes,
} from "./bundled-core.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const electronApp = join(root, "node_modules/electron/dist/Electron.app");
const output = process.env.RALPHY_PACKAGE_OUTPUT
  ? resolve(root, process.env.RALPHY_PACKAGE_OUTPUT)
  : join(root, "release/Ralphy Media.app");
const contents = join(output, "Contents");
const resources = join(contents, "Resources");
const application = join(resources, "app");
const coreSource = process.env.RALPHY_CORE_BIN ?? APPROVED_CORE_SOURCE;
if (!isAbsolute(coreSource)) throw new Error("RALPHY_CORE_BIN must be an absolute path");
const coreBytes = await readApprovedCoreBytes(coreSource);

await rm(output, { recursive: true, force: true });
await mkdir(dirname(output), { recursive: true });
execFileSync("ditto", [electronApp, output]);
await rename(
  join(contents, "MacOS/Electron"),
  join(contents, "MacOS/Ralphy Media"),
);

await mkdir(application, { recursive: true });
await cp(join(root, "dist"), join(application, "dist"), { recursive: true });
await cp(join(root, "dist-electron"), join(application, "dist-electron"), {
  recursive: true,
});
const packagedNodePty = join(application, "node_modules/node-pty");
await mkdir(join(application, "node_modules"), { recursive: true });
await cp(join(root, "node_modules/node-pty"), packagedNodePty, {
  recursive: true,
});
for (const architecture of ["darwin-arm64", "darwin-x64"]) {
  await chmod(join(packagedNodePty, "prebuilds", architecture, "spawn-helper"), 0o755);
}
await writeFile(
  join(application, "package.json"),
  JSON.stringify({
    name: "ralphy-media",
    version: "0.1.0",
    private: true,
    main: "dist-electron/main.cjs",
  }, null, 2),
);
await cp(join(root, "build/RalphyMedia.icns"), join(resources, "RalphyMedia.icns"));
await cp(
  join(root, "build/RalphyMedia.iconset/icon_128x128.png"),
  join(resources, "RalphyMedia-drag.png"),
);
const bundledCore = join(resources, "bin/ralphy");
await mkdir(dirname(bundledCore), { recursive: true });
await writeFile(bundledCore, coreBytes);
await chmod(bundledCore, 0o755);
await writeFile(
  join(resources, "ralphy-core.json"),
  `${JSON.stringify({
    version: APPROVED_CORE_VERSION,
    sha256: APPROVED_CORE_SHA256,
  }, null, 2)}\n`,
  { mode: 0o600 },
);

const plist = join(contents, "Info.plist");
const replace = (key, type, value) => {
  execFileSync("plutil", ["-replace", key, `-${type}`, value, plist]);
};
replace("CFBundleDisplayName", "string", "Ralphy Media");
replace("CFBundleName", "string", "Ralphy Media");
replace("CFBundleExecutable", "string", "Ralphy Media");
replace("CFBundleIdentifier", "string", "dev.ralphy.media");
replace("CFBundleShortVersionString", "string", "0.1.0");
replace("CFBundleVersion", "string", "1");
replace("CFBundleIconFile", "string", "RalphyMedia.icns");
execFileSync("codesign", ["--force", "--deep", "--sign", "-", output], {
  stdio: "inherit",
});
console.log(output);

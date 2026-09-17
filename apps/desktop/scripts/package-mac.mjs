import { execFileSync } from "node:child_process";
import {
  cp,
  chmod,
  mkdir,
  rename,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  readApprovedCoreBytes,
  sha256File,
} from "./bundled-core.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const electronApp = join(root, "node_modules/electron/dist/Electron.app");
const output = process.env.RALPHY_PACKAGE_OUTPUT
  ? resolve(root, process.env.RALPHY_PACKAGE_OUTPUT)
  : join(root, "release/Ralphy Media.app");
const contents = join(output, "Contents");
const resources = join(contents, "Resources");
const application = join(resources, "app");
const repository = resolve(root, "../..");
const metadata = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const version = metadata.version;
if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) throw new Error("Desktop package version must be semantic");
const buildVersion = process.env.RALPHY_BUILD_NUMBER || version.split("-")[0];
if (!/^\d+(?:\.\d+){0,2}$/.test(buildVersion)) throw new Error("RALPHY_BUILD_NUMBER must contain one to three numeric components");
const signingIdentity = process.env.RALPHY_SIGNING_IDENTITY || "-";
const notaryProfile = process.env.RALPHY_NOTARY_PROFILE;
if (notaryProfile && signingIdentity === "-") throw new Error("Notarization requires a Developer ID signing identity");
if (!process.env.RALPHY_CORE_BIN) {
  execFileSync("bun", ["scripts/build-binaries.ts", "--current", "--smoke"], { cwd: repository, stdio: "inherit" });
}
const coreSource = process.env.RALPHY_CORE_BIN ?? join(repository, "dist/binaries", `ralphy-${process.platform}-${process.arch}`);
if (!isAbsolute(coreSource)) throw new Error("RALPHY_CORE_BIN must be an absolute path");
const coreBytes = process.env.RALPHY_CORE_BIN ? await readApprovedCoreBytes(coreSource) : await readFile(coreSource);
const coreVersion = execFileSync(coreSource, ["--version"], { encoding: "utf8" }).trim();
const coreSha256 = await sha256File(coreSource);

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
await writeFile(
  join(application, "package.json"),
  JSON.stringify({
    name: "ralphy-media",
    version,
    private: true,
    main: "dist-electron/main.cjs",
  }, null, 2),
);
await cp(join(root, "build/RalphyMedia.icns"), join(resources, "RalphyMedia.icns"));
await cp(
  join(root, "build/RalphyMedia.iconset/icon_128x128.png"),
  join(resources, "RalphyMedia-drag.png"),
);
/* The routing pack travels with the app. A user who downloads only this app has
   no ugc-cli checkout, and the block Ralphy writes into their agent's
   instruction file names the installed copy -- so a build without the pack ships
   a router that points at nothing. Refuse rather than ship that. */
const packSource = join(root, "resources/prompt-pack");
if (!existsSync(join(packSource, "manifest.json"))) {
  throw new Error(
    "resources/prompt-pack is missing or has no manifest. Run `bun scripts/vendor-prompt-pack.mjs` first.",
  );
}
await cp(packSource, join(resources, "prompt-pack"), { recursive: true });
if (!process.env.RALPHY_CORE_BIN) {
  execFileSync("bun", ["scripts/vendor-prompt-pack.mjs", "--bin", join(repository, "cli/index.ts"), "--out", join(resources, "prompt-pack")], { cwd: root, stdio: "inherit" });
}

const bundledCore = join(resources, "bin/ralphy");
await mkdir(dirname(bundledCore), { recursive: true });
await writeFile(bundledCore, coreBytes);
await chmod(bundledCore, 0o755);
await writeFile(
  join(resources, "ralphy-core.json"),
  `${JSON.stringify({
    version: coreVersion,
    sha256: coreSha256,
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
replace("CFBundleShortVersionString", "string", version.split("-")[0]);
replace("CFBundleVersion", "string", buildVersion);
replace("CFBundleIconFile", "string", "RalphyMedia.icns");
execFileSync("codesign", ["--force", "--deep", "--sign", signingIdentity,
  ...(signingIdentity === "-" ? [] : ["--options", "runtime", "--timestamp", "--entitlements", join(root, "scripts/entitlements.mac.plist")]), output], {
  stdio: "inherit",
});
execFileSync("codesign", ["--verify", "--deep", "--strict", output], { stdio: "inherit" });
if (notaryProfile) {
  const archive = `${output}.notarization.zip`;
  try {
    execFileSync("ditto", ["-c", "-k", "--keepParent", output, archive]);
    execFileSync("xcrun", ["notarytool", "submit", archive, "--keychain-profile", notaryProfile, "--wait"], { stdio: "inherit" });
    execFileSync("xcrun", ["stapler", "staple", output], { stdio: "inherit" });
    execFileSync("spctl", ["--assess", "--type", "execute", "--verbose", output], { stdio: "inherit" });
  } finally { await rm(archive, { force: true }); }
} else {
  console.warn("Development build: not notarized. Use Developer ID signing and notarization before public distribution.");
}
console.log(output);

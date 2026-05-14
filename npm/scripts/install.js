#!/usr/bin/env node
// Postinstall: download the platform-specific ralphy binary from the
// matching GitHub Release into ../vendor/. Runs on `npm install` /
// `npm i -g` / `npx`.
//
// Env overrides:
//   RALPHY_DOWNLOAD_HOST   e.g. https://github.com (proxies for CI)
//   RALPHY_REPO            alecs5am/ralphy by default
//   RALPHY_FORCE           "1" forces re-download even if vendor/ already
//                          has the binary

"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const { pipeline } = require("stream");
const { promisify } = require("util");

const streamPipeline = promisify(pipeline);

const pkg = require("../package.json");
const VERSION = pkg.version;
const REPO = process.env.RALPHY_REPO || "alecs5am/ralphy";
const HOST = process.env.RALPHY_DOWNLOAD_HOST || "https://github.com";
const FORCE = process.env.RALPHY_FORCE === "1";

const OS_MAP = { darwin: "darwin", linux: "linux", win32: "windows" };
const ARCH_MAP = { arm64: "arm64", x64: "x64" };

const os = OS_MAP[process.platform];
const arch = ARCH_MAP[process.arch];

if (!os || !arch) {
  console.error(`[ralphy] unsupported platform: ${process.platform}/${process.arch}`);
  process.exit(1);
}

const ext = os === "windows" ? ".exe" : "";
const asset = `ralphy-${os}-${arch}${ext}`;
const url = `${HOST}/${REPO}/releases/download/v${VERSION}/${asset}`;

const vendorDir = path.join(__dirname, "..", "vendor");
const dest = path.join(vendorDir, `ralphy${ext}`);

fs.mkdirSync(vendorDir, { recursive: true });

if (!FORCE && fs.existsSync(dest) && fs.statSync(dest).size > 0) {
  console.log(`[ralphy] already installed at ${dest}`);
  process.exit(0);
}

function fetchToFile(targetUrl, outPath, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) {
      reject(new Error("too many redirects"));
      return;
    }
    const req = https.get(
      targetUrl,
      {
        headers: {
          "User-Agent": `ralphy-npm-postinstall/${VERSION}`,
          Accept: "application/octet-stream",
        },
      },
      (res) => {
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
          res.resume();
          fetchToFile(res.headers.location, outPath, redirects + 1).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} fetching ${targetUrl}`));
          return;
        }
        const out = fs.createWriteStream(outPath);
        streamPipeline(res, out).then(resolve, reject);
      },
    );
    req.on("error", reject);
    req.setTimeout(60_000, () => {
      req.destroy(new Error("timeout after 60s"));
    });
  });
}

console.log(`[ralphy] downloading ${asset} (v${VERSION})`);
console.log(`         ${url}`);

fetchToFile(url, dest)
  .then(() => {
    // Make the binary executable on POSIX. No-op for Windows .exe.
    if (os !== "windows") {
      fs.chmodSync(dest, 0o755);
    }
    const size = (fs.statSync(dest).size / (1024 * 1024)).toFixed(1);
    console.log(`[ralphy] installed at ${dest} (${size} MB)`);
    console.log(`         run \`ralphy --version\` to verify`);
  })
  .catch((err) => {
    // Don't fail the entire `npm install` if the binary download fails —
    // the launcher (bin/ralphy.js) prints a clear error when invoked, and
    // CI tooling that pre-fetches deps shouldn't blow up here.
    console.error(`[ralphy] download failed: ${err.message}`);
    console.error(`         run \`npm install --force\` once network resolves`);
    process.exit(0);
  });

// License normalization for stock candidates (#596).
//
// Sources describe licenses three ways: a Creative Commons code plus version
// (Openverse: `by-sa` + `4.0`), a license URL (Internet Archive `licenseurl`),
// or a free-text short name (Wikimedia Commons `LicenseShortName`). All three
// end up as one StockLicense with explicit commercial / modification /
// attribution flags. Anything this module does not recognize is UNKNOWN and
// fails the default `--license commercial` filter: an unknown license is never
// assumed to be free.

import type { StockLicense, StockLicenseFilter } from "./types.js";

const CC_BASE = "https://creativecommons.org";

/** Fails the commercial filter; attribution is still asked for. */
export const UNKNOWN_LICENSE: StockLicense = Object.freeze({
  license: "unknown",
  licenseUrl: null,
  commercialOk: false,
  modificationOk: false,
  attributionRequired: true,
  shareAlike: false,
});

const PUBLIC_DOMAIN: StockLicense = Object.freeze({
  license: "Public domain",
  licenseUrl: null,
  commercialOk: true,
  modificationOk: true,
  attributionRequired: false,
  shareAlike: false,
});

/** Usable in commercial work that edits the item (the default search filter). */
export function allowsCommercialEdit(license: Pick<StockLicense, "commercialOk" | "modificationOk">): boolean {
  return license.commercialOk && license.modificationOk;
}

/** Whether a license passes a `--license` filter (see STOCK_LICENSE_FILTERS). */
export function passesLicenseFilter(license: Pick<StockLicense, "commercialOk" | "modificationOk" | "shareAlike">, filter: StockLicenseFilter): boolean {
  if (filter === "any") return true;
  if (!allowsCommercialEdit(license)) return false;
  return filter === "commercial" || !license.shareAlike;
}

/**
 * A Creative Commons license from its code (`by`, `by-sa`, `by-nc-nd`, `cc0`,
 * `pdm`, `sampling+`, ...) and version. Unknown codes return UNKNOWN_LICENSE.
 */
export function ccLicense(codeRaw: string, versionRaw?: string | null, urlRaw?: string | null): StockLicense {
  const code = codeRaw.trim().toLowerCase();
  const version = versionRaw?.trim() || null;
  const url = cleanUrl(urlRaw);
  if (code === "cc0" || code === "zero") {
    return { license: `CC0 ${version ?? "1.0"}`, licenseUrl: url ?? `${CC_BASE}/publicdomain/zero/1.0/`, commercialOk: true, modificationOk: true, attributionRequired: false, shareAlike: false };
  }
  if (code === "pdm" || code === "mark") {
    return { license: `Public Domain Mark ${version ?? "1.0"}`, licenseUrl: url ?? `${CC_BASE}/publicdomain/mark/1.0/`, commercialOk: true, modificationOk: true, attributionRequired: false, shareAlike: false };
  }
  if (code === "publicdomain" || code === "pd") {
    return { ...PUBLIC_DOMAIN, licenseUrl: url };
  }
  if (code === "sampling+" || code === "nc-sampling+" || code === "sampling") {
    // Sampling+ allows commercial use of samples only, never of the whole work.
    const name = code === "nc-sampling+" ? "NC-Sampling+" : "Sampling+";
    return { license: `CC ${name}${version ? ` ${version}` : ""}`, licenseUrl: url, commercialOk: false, modificationOk: true, attributionRequired: true, shareAlike: false };
  }
  const parts = code.split("-");
  if (parts[0] !== "by" || parts.some((p) => !["by", "sa", "nc", "nd"].includes(p))) return { ...UNKNOWN_LICENSE, licenseUrl: url };
  const nc = parts.includes("nc");
  const nd = parts.includes("nd");
  const sa = parts.includes("sa");
  const name = ["BY", ...(nc ? ["NC"] : []), ...(nd ? ["ND"] : []), ...(sa ? ["SA"] : [])].join("-");
  const canonical = ["by", ...(nc ? ["nc"] : []), ...(nd ? ["nd"] : []), ...(sa ? ["sa"] : [])].join("-");
  return {
    license: `CC ${name}${version ? ` ${version}` : ""}`,
    licenseUrl: url ?? (version ? `${CC_BASE}/licenses/${canonical}/${version}/` : null),
    commercialOk: !nc,
    modificationOk: !nd,
    attributionRequired: true,
    shareAlike: sa,
  };
}

/**
 * A license from its URL: creativecommons.org `/licenses/<code>/<version>/`,
 * `/publicdomain/zero|mark/1.0/`, the retired `/licenses/publicdomain/`. Null
 * when the URL names no license this module knows.
 */
export function licenseFromUrl(urlRaw: string | null | undefined): StockLicense | null {
  const url = cleanUrl(urlRaw);
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!/(^|\.)creativecommons\.org$/i.test(parsed.hostname)) return null;
  const segments = parsed.pathname.split("/").filter(Boolean).map((s) => s.toLowerCase());
  if (segments[0] === "publicdomain") {
    if (segments[1] === "zero") return ccLicense("cc0", segments[2] ?? "1.0", url);
    if (segments[1] === "mark") return ccLicense("pdm", segments[2] ?? "1.0", url);
    return { ...PUBLIC_DOMAIN, licenseUrl: url };
  }
  if (segments[0] === "licenses") {
    const code = segments[1];
    if (!code) return null;
    if (code === "publicdomain") return { ...PUBLIC_DOMAIN, licenseUrl: url };
    const license = ccLicense(code, segments[2] ?? null, url);
    return license.license === "unknown" ? null : license;
  }
  return null;
}

/**
 * A license from a free-text short name (Wikimedia Commons `LicenseShortName`:
 * "CC BY-SA 4.0", "CC0", "Public domain", "GFDL", "Attribution", ...), with
 * the license URL as a fallback signal.
 */
export function licenseFromShortName(nameRaw: string | null | undefined, urlRaw?: string | null): StockLicense {
  const name = (nameRaw ?? "").replace(/\s+/g, " ").trim();
  const url = cleanUrl(urlRaw);
  const upper = name.toUpperCase();
  if (/^CC0\b/.test(upper) || upper === "CC ZERO") return ccLicense("cc0", null, url);
  if (/^PUBLIC DOMAIN MARK\b/.test(upper)) return ccLicense("pdm", null, url);
  const cc = /^CC[- ]((?:BY|NC|ND|SA)(?:[- ](?:BY|NC|ND|SA))*)(?:[- ](\d+(?:\.\d+)?))?/.exec(upper);
  if (cc) {
    const license = ccLicense(cc[1]!.replace(/ /g, "-").toLowerCase(), cc[2] ?? null, url);
    if (license.license !== "unknown") return { ...license, license: name.length <= 40 ? name : license.license };
  }
  if (/^(PUBLIC DOMAIN|PD\b|PD-)/.test(upper)) return { ...PUBLIC_DOMAIN, license: name || PUBLIC_DOMAIN.license, licenseUrl: url };
  if (upper === "NO RESTRICTIONS" || upper === "NO KNOWN COPYRIGHT RESTRICTIONS" || upper === "COPYRIGHTED FREE USE") {
    return { license: name, licenseUrl: url, commercialOk: true, modificationOk: true, attributionRequired: false, shareAlike: false };
  }
  if (upper === "ATTRIBUTION" || upper === "ATTRIBUTION ONLY") {
    return { license: name, licenseUrl: url, commercialOk: true, modificationOk: true, attributionRequired: true, shareAlike: false };
  }
  if (/^GFDL\b/.test(upper)) {
    return { license: name, licenseUrl: url ?? "https://www.gnu.org/licenses/fdl-1.3.html", commercialOk: true, modificationOk: true, attributionRequired: true, shareAlike: true };
  }
  return licenseFromUrl(url) ?? { ...UNKNOWN_LICENSE, license: name || UNKNOWN_LICENSE.license, licenseUrl: url };
}

/** License caveats a short name does not carry, for `StockCandidate.notes`. */
export function licenseNotes(license: StockLicense): string[] {
  const notes: string[] = [];
  if (license.shareAlike) notes.push(`${license.license} is ShareAlike: an adaptation that builds on this item must be shared under the same license.`);
  if (/^GFDL\b/i.test(license.license)) notes.push("GFDL requires the full license text with the work; prefer a CC or public domain item when one exists.");
  if (license.license === "unknown") notes.push("The source states no license Ralphy recognizes; treat it as all rights reserved.");
  return notes;
}

/**
 * The attribution line to paste into a caption or description (title, author,
 * license, source; the TASL convention). `license` is the short name.
 */
export function buildAttribution(input: {
  title: string;
  author: string | null;
  license: string;
  licenseUrl: string | null;
  sourceLabel: string;
  pageUrl: string;
}): string {
  const title = `"${oneLine(input.title)}"`;
  const by = input.author ? ` by ${oneLine(input.author)}` : "";
  const license = input.licenseUrl ? `${input.license} (${input.licenseUrl})` : input.license;
  return `${title}${by}, ${license}. Source: ${input.sourceLabel}, ${input.pageUrl}`;
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function cleanUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

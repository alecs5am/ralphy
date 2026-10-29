// Headless geometry probe for `ralphy editor lint-safe-zones` (#564).
//
// Loads a HyperFrames composition in headless Chromium (Playwright, already a
// dependency), seeks the root GSAP timeline to each sample time, emulates clip
// visibility from `data-start` / `data-duration`, and returns the box of every
// element the lint should check:
//   - elements tagged `data-safe-zone="caption|cta|face|product|text"`;
//   - every other visible leaf text element (role `text`, or `caption` when it
//     sits inside an element whose class or id says caption / subtitle).
// `data-safe-zone="ignore"` excludes an element and its subtree (decorative
// ghost type, intentional off-frame motion). Zero provider calls.

import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ProbeSample, SafeZoneRole } from "./safe-zones.js";

export type ProbeResult = { duration: number; compositionId: string | null; samples: ProbeSample[]; warnings: string[] };

/** Runs inside the page. Kept dependency-free and serializable. */
function pageProbe(args: { t: number; roles: string[] }) {
  const w = window as unknown as { __timelines?: Record<string, { totalTime: (t: number, s?: boolean) => void }> };
  const root =
    document.querySelector("[data-composition-id][data-width][data-height]") || document.querySelector("[data-composition-id]") || document.body;
  const id = root.getAttribute("data-composition-id") || "main";
  const tl = w.__timelines && (w.__timelines[id] || Object.values(w.__timelines)[0]);
  if (tl) tl.totalTime(args.t, false);
  // Clip windows: an element with data-start is only on screen inside its window.
  const clips = Array.from(root.querySelectorAll("[data-start]")) as HTMLElement[];
  for (const el of clips) {
    if (el === root || el.tagName === "AUDIO") continue;
    const start = parseFloat(el.getAttribute("data-start") || "");
    const dur = parseFloat(el.getAttribute("data-duration") || "");
    if (!Number.isFinite(start)) continue;
    const on = args.t >= start && (!Number.isFinite(dur) || args.t < start + dur);
    el.style.setProperty("visibility", on ? "" : "hidden");
  }
  const rootRect = root.getBoundingClientRect();
  const W = parseFloat(root.getAttribute("data-width") || "") || rootRect.width;
  const sx = rootRect.width > 0 ? W / rootRect.width : 1;
  function opacityChain(el: Element | null): number {
    let o = 1;
    for (let c = el; c; c = c.parentElement) {
      const v = parseFloat(getComputedStyle(c).opacity || "1");
      if (Number.isFinite(v)) o *= v;
    }
    return o;
  }
  function visible(el: Element): boolean {
    const st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden" || st.visibility === "collapse") return false;
    if (opacityChain(el) < 0.2) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0.5 && r.height > 0.5;
  }
  function sel(el: Element): string {
    if (el.id) return "#" + el.id;
    const cls = Array.from(el.classList).slice(0, 2);
    const base = el.tagName.toLowerCase() + (cls.length ? "." + cls.join(".") : "");
    const parent = el.parentElement;
    if (!parent || parent === document.body) return base;
    const same = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
    const nth = same.length > 1 ? `:nth-of-type(${same.indexOf(el) + 1})` : "";
    return `${sel(parent)} > ${base}${nth}`;
  }
  function rectOf(r: DOMRect | { left: number; top: number; width: number; height: number }) {
    return {
      left: Math.round((r.left - rootRect.left) * sx * 100) / 100,
      top: Math.round((r.top - rootRect.top) * sx * 100) / 100,
      width: Math.round(r.width * sx * 100) / 100,
      height: Math.round(r.height * sx * 100) / 100,
    };
  }
  /** Text nodes under `el` whose element is actually on screen (hidden caption chunks keep their layout boxes). */
  function visibleTextNodes(el: Element): Text[] {
    const out: Text[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!(n.textContent || "").trim()) continue;
      if (n.parentElement && visible(n.parentElement)) out.push(n as Text);
    }
    return out;
  }
  function textRect(el: Element) {
    const rs: DOMRect[] = [];
    for (const node of visibleTextNodes(el)) {
      const range = document.createRange();
      range.selectNodeContents(node);
      rs.push(...Array.from(range.getClientRects()).filter((r) => r.width > 0.5 && r.height > 0.5));
      range.detach();
    }
    if (rs.length === 0) return null;
    const l = Math.min(...rs.map((r) => r.left));
    const t = Math.min(...rs.map((r) => r.top));
    const rr = Math.max(...rs.map((r) => r.right));
    const b = Math.max(...rs.map((r) => r.bottom));
    return { left: l, top: t, width: rr - l, height: b - t };
  }
  const textOf = (el: Element) => ((el as HTMLElement).innerText || el.textContent || "").replace(/\s+/g, " ").trim();
  const out: Array<{ selector: string; role: string; text: string | null; rect: { left: number; top: number; width: number; height: number } }> = [];
  const tagged = Array.from(root.querySelectorAll("[data-safe-zone]"));
  const ignoredRoots = tagged.filter((e) => e.getAttribute("data-safe-zone") === "ignore");
  const isIgnored = (el: Element) => ignoredRoots.some((r) => r === el || r.contains(el));
  const roleRoots = tagged.filter((e) => args.roles.includes(e.getAttribute("data-safe-zone") || ""));
  for (const el of roleRoots) {
    if (isIgnored(el) || !visible(el)) continue;
    const role = el.getAttribute("data-safe-zone") as string;
    const isText = role === "text" || role === "caption" || role === "cta";
    let r: DOMRect | { left: number; top: number; width: number; height: number } = el.getBoundingClientRect();
    let text = textOf(el);
    if (isText) {
      const nodes = visibleTextNodes(el);
      // An empty caption container (between chunks) has nothing on screen to check.
      if (nodes.length === 0 && text) continue;
      text = nodes.map((n) => n.textContent || "").join(" ").replace(/\s+/g, " ").trim();
      r = textRect(el) || r;
    }
    out.push({ selector: sel(el), role, text: text.slice(0, 80) || null, rect: rectOf(r) });
  }
  const covered = (el: Element) => roleRoots.some((r) => r === el || r.contains(el));
  const all = Array.from(root.querySelectorAll("*"));
  for (const el of all) {
    if (["SCRIPT", "STYLE", "TEMPLATE", "AUDIO", "VIDEO", "svg", "SVG"].includes(el.tagName)) continue;
    if (isIgnored(el) || covered(el)) continue;
    // Leaf text candidate: carries a direct text node, and no visible child carries text of its own.
    const ownText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent || "").trim() !== "");
    if (!ownText) continue;
    const text = textOf(el);
    if (!text) continue;
    if (Array.from(el.children).some((c) => visible(c) && textOf(c))) continue;
    if (!visible(el)) continue;
    const r = textRect(el);
    if (!r) continue;
    let role = "text";
    for (let c: Element | null = el; c && c !== root; c = c.parentElement) {
      const tag = ((c as HTMLElement).className && String((c as HTMLElement).className)) + " " + (c.id || "");
      if (/caption|subtitle|\bcap-/i.test(tag)) {
        role = "caption";
        break;
      }
    }
    out.push({ selector: sel(el), role, text: text.slice(0, 80), rect: rectOf(r) });
  }
  return { elements: out, id, hasTimeline: Boolean(tl) };
}

export async function probeComposition(htmlPath: string, opts: { times?: number[]; samples?: number; timeoutMs?: number }): Promise<ProbeResult> {
  const { chromium } = await import("playwright");
  const { sampleTimes } = await import("./safe-zones.js");
  const browser = await chromium.launch();
  const warnings: string[] = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(path.resolve(htmlPath)).href, { waitUntil: "load", timeout: opts.timeoutMs ?? 20000 });
    await page.waitForTimeout(150);
    const meta = await page.evaluate(() => {
      const root = document.querySelector("[data-composition-id]");
      const w = window as unknown as { __timelines?: Record<string, { duration: () => number }> };
      const id = root?.getAttribute("data-composition-id") ?? null;
      const tl = w.__timelines && id ? w.__timelines[id] || Object.values(w.__timelines)[0] : undefined;
      const d = parseFloat(root?.getAttribute("data-duration") || "");
      return { id, duration: Number.isFinite(d) ? d : tl ? tl.duration() : 0, hasTimeline: Boolean(tl), gsap: typeof (window as unknown as { gsap?: unknown }).gsap !== "undefined" };
    });
    if (!meta.gsap) warnings.push("GSAP did not load (offline?); boxes are the static layout, not the animated one");
    if (!meta.hasTimeline) warnings.push("no window.__timelines entry; sampled the static layout only");
    const times = opts.times && opts.times.length > 0 ? opts.times : sampleTimes(meta.duration || 1, opts.samples ?? 9);
    const samples: ProbeSample[] = [];
    const roles: SafeZoneRole[] = ["text", "caption", "cta", "face", "product"];
    for (const t of times) {
      const r = await page.evaluate(pageProbe, { t, roles });
      samples.push({ t, elements: r.elements as ProbeSample["elements"] });
    }
    return { duration: meta.duration, compositionId: meta.id, samples, warnings };
  } finally {
    await browser.close();
  }
}

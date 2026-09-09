import runtime from "@hyperframes/core/runtime?raw";
import gsap from "gsap/dist/gsap.min.js?raw";
import { INSTRUMENT_PALETTE } from "@/shared/instrument/palette";
import type { VideoWorkspaceAsset } from "../../../../shared/video-workspace";

/** Only preview URLs enter this copy. The SDK serializes the original relative source paths. */
export function videoPreviewHtml(html: string, assets: VideoWorkspaceAsset[]): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("meta[http-equiv],base,iframe,object,embed").forEach((item) => item.remove());
  const urls = new Map(assets.filter((asset) => asset.previewUrl).map((asset) => [asset.src.replace(/^\.\//, ""), asset.previewUrl!]));
  for (const item of doc.querySelectorAll<HTMLElement>("[src],[href],[poster]")) {
    for (const attr of ["src", "href", "poster"]) {
      const source = item.getAttribute(attr);
      if (source && urls.has(source.replace(/^\.\//, ""))) item.setAttribute(attr, urls.get(source.replace(/^\.\//, ""))!);
    }
  }
  // Dependencies execute only inside the opaque, network-restricted preview frame.
  doc.querySelectorAll("script[src]").forEach((item) => item.remove());
  const scripts = [gsap, runtime];
  for (const source of scripts.reverse()) { const script = doc.createElement("script"); script.textContent = source; doc.head.prepend(script); }
  const selection = doc.createElement("script");
  selection.textContent = `(() => {
    let drag = null;
    document.addEventListener('pointerdown', event => {
      const el = event.target.closest('[data-hf-id]');
      if (!el || el.hasAttribute('data-composition-id')) return;
      parent.postMessage({source:'ralphy-video-selection',id:el.getAttribute('data-hf-id'),shift:event.shiftKey}, '*');
      if (!['P','H1','H2','H3'].includes(el.tagName) || !el.parentElement?.hasAttribute('data-composition-id') || getComputedStyle(el).transform !== 'none') return;
      const rect = el.getBoundingClientRect();
      drag = {el,x:event.clientX,y:event.clientY,left:rect.left,top:rect.top};
      el.setPointerCapture(event.pointerId);
    });
    document.addEventListener('pointermove', event => { if (drag) drag.el.style.translate = (event.clientX-drag.x)+'px '+(event.clientY-drag.y)+'px'; });
    document.addEventListener('pointerup', event => {
      if (!drag) return;
      const {el,x,y,left,top}=drag; drag=null; el.style.translate='';
      if (Math.abs(event.clientX-x)+Math.abs(event.clientY-y)<3) return;
      parent.postMessage({source:'ralphy-video-move',id:el.getAttribute('data-hf-id'),x:left+event.clientX-x,y:top+event.clientY-y}, '*');
    });
    document.addEventListener('pointercancel', () => { if(drag) drag.el.style.translate=''; drag=null; });
    addEventListener('message', event => {
      if (event.source !== parent || event.data?.source !== 'ralphy-video-highlight') return;
      for (const el of document.querySelectorAll('[data-hf-id]')) {
        el.style.outline = event.data.ids.includes(el.getAttribute('data-hf-id')) ? '3px solid ${INSTRUMENT_PALETTE.light.generationBrand}' : '';
        el.style.outlineOffset = '8px';
      }
    });
  })();`;
  doc.body.append(selection);
  return `<!doctype html>${doc.documentElement.outerHTML}`;
}

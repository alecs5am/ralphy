/*! @hyperframes/player 0.6.31, dist/hyperframes-player.global.js, Apache-2.0 (LICENSE-hyperframes.txt), https://github.com/heygen-com/hyperframes */
"use strict";var HyperframesPlayer=(()=>{var q=Object.defineProperty;var Pe=Object.getOwnPropertyDescriptor;var Re=Object.getOwnPropertyNames;var De=Object.prototype.hasOwnProperty;var Ie=(r,e)=>{for(var t in e)q(r,t,{get:e[t],enumerable:!0})},Oe=(r,e,t,i)=>{if(e&&typeof e=="object"||typeof e=="function")for(let n of Re(e))!De.call(r,n)&&n!==t&&q(r,n,{get:()=>e[n],enumerable:!(i=Pe(e,n))||i.enumerable});return r};var He=r=>Oe(q({},"__esModule",{value:!0}),r);var Xe={};Ie(Xe,{HyperframesPlayer:()=>W,SPEED_PRESETS:()=>Y,formatSpeed:()=>L,formatTime:()=>N});function ue(r){return r.hasRuntime||r.runtimeInjected?!1:!!(r.hasNestedCompositions||r.hasTimelines&&r.attempts>=5)}function k(r){return typeof r=="object"&&r!==null}function ce(r){return k(r)&&typeof r.getDuration=="function"}function he(r){return k(r)&&typeof r.duration=="function"&&typeof r.time=="function"&&typeof r.seek=="function"&&typeof r.play=="function"&&typeof r.pause=="function"}var Ne="https://cdn.jsdelivr.net/npm/@hyperframes/core/dist/hyperframe.runtime.iife.js",H=class{constructor(e,t){this._iframe=e;this._callbacks=t}_iframe;_callbacks;_interval=null;_runtimeInjected=!1;get runtimeInjected(){return this._runtimeInjected}start(){this.stop(),this._runtimeInjected=!1;let e=0;this._interval=setInterval(()=>{e++;try{let t=this._iframe.contentWindow;if(!t)return;let i=!!(t.__hf||t.__player),n=!!(t.__timelines&&Object.keys(t.__timelines).length>0),o=!!this._iframe.contentDocument?.querySelector("[data-composition-src]");if(ue({hasRuntime:i,hasTimelines:n,hasNestedCompositions:o,runtimeInjected:this._runtimeInjected,attempts:e})){this._injectRuntime();return}if(this._runtimeInjected&&!i)return;let s=this._resolvePlaybackDurationAdapter(t);if(s&&s.getDuration()>0){this.stop();let l=this._iframe.contentDocument,p=null,c=l?.querySelector("[data-composition-id]");if(c){let u=parseInt(c.getAttribute("data-width")||"0",10),f=parseInt(c.getAttribute("data-height")||"0",10);u>0&&f>0&&(p={width:u,height:f})}this._callbacks.onReady({duration:s.getDuration(),adapter:s,compositionSize:p});return}}catch{}e>=40&&(this.stop(),this._callbacks.onError("Composition timeline not found after 8s"))},200)}stop(){this._interval!==null&&(clearInterval(this._interval),this._interval=null)}resolveDirectTimelineAdapter(){try{let e=this._iframe.contentWindow;return e?this._resolveDirectTimelineAdapterFromWindow(e):null}catch{return null}}resolveDirectTimelineAdapterFromWindow(e){return this._resolveDirectTimelineAdapterFromWindow(e)}hasRuntimeBridge(e){return Reflect.get(e,"__hf")!==void 0||k(Reflect.get(e,"__player"))}_injectRuntime(){this._runtimeInjected=!0;try{let e=this._iframe.contentDocument;if(!e)return;let t=e.createElement("script");t.src=Ne,(e.head||e.documentElement).appendChild(t),this._callbacks.onRuntimeInjected?.()}catch{}}_resolveDirectTimelineAdapterFromWindow(e){if(this.hasRuntimeBridge(e))return null;let t=Reflect.get(e,"__timelines");if(!k(t))return null;let i=Object.keys(t);if(i.length===0)return null;let n=this._iframe.contentDocument?.querySelector("[data-composition-id]")?.getAttribute("data-composition-id"),o=n&&n in t?n:i[i.length-1],s=t[o];return he(s)?s:null}_resolvePlaybackDurationAdapter(e){let t=Reflect.get(e,"__player");if(ce(t))return{kind:"runtime",getDuration:()=>t.getDuration()};let i=this._resolveDirectTimelineAdapterFromWindow(e);return i?{kind:"direct-timeline",timeline:i,getDuration:()=>i.duration()}:null}};var me=`
  :host {
    display: block;
    position: relative;
    overflow: hidden;
    background: #000;
    contain: layout style;
  }

  .hfp-container {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }


  .hfp-iframe {
    position: absolute;
    top: 50%;
    left: 50%;
    border: none;
    pointer-events: none;
  }

  .hfp-poster {
    position: absolute;
    inset: 0;
    object-fit: contain;
    z-index: 1;
    pointer-events: none;
  }

  .hfp-shader-loader {
    position: absolute;
    inset: 0;
    z-index: 20;
    display: grid;
    place-items: center;
    visibility: hidden;
    opacity: 0;
    pointer-events: none;
    background: #030504;
    color: #f4f7fb;
    cursor: default;
    user-select: none;
    -webkit-user-select: none;
    transition: opacity 420ms ease-out, visibility 420ms ease-out;
  }

  .hfp-shader-loader.hfp-visible,
  .hfp-shader-loader.hfp-hiding {
    visibility: visible;
  }

  .hfp-shader-loader.hfp-visible {
    opacity: 1;
    pointer-events: auto;
  }

  .hfp-shader-loader.hfp-hiding {
    opacity: 0;
    pointer-events: none;
  }

  .hfp-shader-loader-panel {
    display: grid;
    grid-template-rows: 86px 40px 26px 12px 44px;
    justify-items: center;
    align-items: center;
    gap: 8px;
    width: min(620px, 82%);
    text-align: center;
    font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .hfp-shader-loader-mark {
    width: 86px;
    height: 86px;
    display: grid;
    place-items: center;
    overflow: visible;
  }

  .hfp-shader-loader-mark svg {
    display: block;
    overflow: visible;
    filter: drop-shadow(0 0 5px rgba(79, 219, 94, 0.16));
    pointer-events: none;
  }

  .hfp-shader-loader-title {
    width: 100%;
    height: 40px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 26px;
    line-height: 40px;
    font-weight: 700;
    letter-spacing: 0;
  }

  .hfp-shader-loader-title-text {
    color: transparent;
    background: linear-gradient(
      90deg,
      rgba(244, 247, 251, 0.84) 0%,
      #ffffff 42%,
      #80efe4 52%,
      #ffffff 62%,
      rgba(244, 247, 251, 0.84) 100%
    );
    background-size: 220% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    animation: hfp-shader-loader-sheen 1.9s linear infinite;
  }

  .hfp-shader-loader-detail {
    width: 100%;
    height: 26px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: rgba(244, 247, 251, 0.62);
    font-size: 15px;
    line-height: 26px;
    font-weight: 500;
  }

  .hfp-shader-loader-track {
    width: min(360px, 100%);
    height: 8px;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
  }

  .hfp-shader-loader-fill {
    width: 100%;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #06e3fa, #4fdb5e);
    transform: scaleX(0);
    transform-origin: left center;
    transition: transform 160ms ease;
  }

  .hfp-shader-loader-progress {
    width: min(420px, 100%);
    height: 44px;
    display: grid;
    grid-template-rows: repeat(2, 22px);
    color: rgba(244, 247, 251, 0.48);
    font: 600 13px/22px "IBM Plex Mono", "SF Mono", "Fira Code", "Courier New", monospace;
    font-variant-numeric: tabular-nums;
  }

  .hfp-shader-loader-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 74px;
    align-items: center;
    column-gap: 20px;
    width: 100%;
    white-space: nowrap;
  }

  .hfp-shader-loader-label {
    min-width: 0;
    overflow: hidden;
    text-align: left;
    text-overflow: ellipsis;
  }

  .hfp-shader-loader-value {
    text-align: right;
  }

  @keyframes hfp-shader-loader-sheen {
    from {
      background-position: 140% 0;
    }
    to {
      background-position: -140% 0;
    }
  }

  /* \u2500\u2500 Theming via CSS custom properties \u2500\u2500
   *
   * Override from outside the shadow DOM:
   *   hyperframes-player {
   *     --hfp-controls-bg: linear-gradient(transparent, rgba(0,0,0,0.9));
   *     --hfp-accent: #ff6b6b;
   *     --hfp-font: "Inter", sans-serif;
   *   }
   */

  .hfp-controls {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    gap: var(--hfp-controls-gap, 12px);
    padding: var(--hfp-controls-padding, 8px 16px);
    background: var(--hfp-controls-bg, linear-gradient(transparent, rgba(0, 0, 0, 0.7)));
    color: var(--hfp-color, #fff);
    font-family: var(--hfp-font, system-ui, -apple-system, sans-serif);
    font-size: var(--hfp-font-size, 13px);
    z-index: 10;
    pointer-events: auto;
    opacity: 1;
    transition: opacity 0.3s ease;
    user-select: none;
  }

  .hfp-controls.hfp-hidden {
    opacity: 0;
    pointer-events: none;
  }

  .hfp-play-btn {
    background: none;
    border: none;
    color: var(--hfp-color, #fff);
    cursor: pointer;
    padding: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    z-index: 10;
  }

  .hfp-play-btn:hover {
    opacity: 0.8;
  }

  .hfp-play-btn svg,
  .hfp-play-btn svg * {
    pointer-events: none;
  }

  .hfp-scrubber {
    flex: 1;
    min-width: 0;
    height: var(--hfp-scrubber-height, 4px);
    background: var(--hfp-scrubber-bg, rgba(255, 255, 255, 0.3));
    border-radius: var(--hfp-scrubber-radius, 2px);
    cursor: pointer;
    position: relative;
    overflow: hidden;
  }

  .hfp-scrubber:hover {
    height: var(--hfp-scrubber-height-hover, 6px);
  }

  .hfp-progress {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background: var(--hfp-accent, #fff);
    pointer-events: none;
  }

  .hfp-time {
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
    opacity: 0.9;
  }

  .hfp-speed-wrap {
    position: relative;
    flex-shrink: 0;
  }

  .hfp-speed-btn {
    background: var(--hfp-speed-btn-bg, rgba(255, 255, 255, 0.15));
    border: none;
    border-radius: var(--hfp-speed-btn-radius, 4px);
    color: var(--hfp-color, #fff);
    cursor: pointer;
    font-family: var(--hfp-font, system-ui, -apple-system, sans-serif);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    padding: 4px 8px;
    min-width: 40px;
    text-align: center;
    transition: background 0.15s ease;
  }

  .hfp-speed-btn:hover {
    background: var(--hfp-speed-btn-bg-hover, rgba(255, 255, 255, 0.3));
  }

  .hfp-speed-menu {
    position: absolute;
    bottom: calc(100% + 8px);
    right: 0;
    background: var(--hfp-menu-bg, rgba(20, 20, 20, 0.95));
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid var(--hfp-menu-border, rgba(255, 255, 255, 0.1));
    border-radius: var(--hfp-menu-radius, 8px);
    padding: 4px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 80px;
    opacity: 0;
    visibility: hidden;
    transform: translateY(4px);
    transition: opacity 0.15s ease, transform 0.15s ease, visibility 0.15s;
    box-shadow: var(--hfp-menu-shadow, 0 8px 24px rgba(0, 0, 0, 0.4));
  }

  .hfp-speed-menu.hfp-open {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
  }

  .hfp-speed-option {
    background: none;
    border: none;
    border-radius: 4px;
    color: var(--hfp-menu-color, rgba(255, 255, 255, 0.7));
    cursor: pointer;
    font-family: var(--hfp-font, system-ui, -apple-system, sans-serif);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    padding: 6px 12px;
    text-align: left;
    transition: background 0.1s ease, color 0.1s ease;
    white-space: nowrap;
  }

  .hfp-speed-option:hover {
    background: var(--hfp-menu-hover-bg, rgba(255, 255, 255, 0.1));
    color: var(--hfp-color, #fff);
  }

  .hfp-speed-option.hfp-active {
    color: var(--hfp-accent, #fff);
    font-weight: 600;
  }

  .hfp-volume-wrap {
    position: relative;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 0;
  }

  .hfp-mute-btn {
    background: none;
    border: none;
    color: var(--hfp-color, #fff);
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    flex-shrink: 0;
  }

  .hfp-mute-btn:hover {
    opacity: 0.8;
  }

  .hfp-mute-btn svg,
  .hfp-mute-btn svg * {
    pointer-events: none;
  }

  .hfp-volume-slider-wrap {
    width: 0;
    overflow: hidden;
    transition: width 0.2s ease;
    display: flex;
    align-items: center;
  }

  .hfp-volume-wrap:hover .hfp-volume-slider-wrap {
    width: 64px;
  }

  .hfp-volume-slider {
    width: 56px;
    height: var(--hfp-scrubber-height, 4px);
    background: var(--hfp-scrubber-bg, rgba(255, 255, 255, 0.3));
    border-radius: var(--hfp-scrubber-radius, 2px);
    cursor: pointer;
    position: relative;
    overflow: hidden;
    margin-left: 4px;
    margin-right: 4px;
  }

  .hfp-volume-fill {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background: var(--hfp-accent, #fff);
    pointer-events: none;
  }
`,B='<svg width="24" height="24" viewBox="0 0 18 18" fill="currentColor"><polygon points="4,2 16,9 4,16"/></svg>',fe='<svg width="24" height="24" viewBox="0 0 18 18" fill="currentColor"><rect x="3" y="2" width="4" height="14"/><rect x="11" y="2" width="4" height="14"/></svg>',G='<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3z"/><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/><path d="M14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>',X='<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3z"/><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>',be='<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3z"/><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" opacity="0.3"/><line x1="18" y1="7" x2="14" y2="17" stroke="currentColor" stroke-width="2"/></svg>';var Y=[.25,.5,1,1.5,2,4];function L(r){return Number.isInteger(r)?`${r}x`:`${r}x`}function N(r){if(!Number.isFinite(r)||r<0)return"0:00";let e=Math.floor(r),t=Math.floor(e/60),i=e%60;return`${t}:${i.toString().padStart(2,"0")}`}function ve(r,e,t={}){let i=t.speedPresets??Y,n=document.createElement("div");n.className="hfp-controls",n.addEventListener("click",a=>{a.stopPropagation()});let o=document.createElement("button");o.className="hfp-play-btn",o.type="button",o.innerHTML=B,o.setAttribute("aria-label","Play");let s=document.createElement("div");s.className="hfp-scrubber";let l=document.createElement("div");l.className="hfp-progress",l.style.width="0%",s.appendChild(l);let p=document.createElement("span");p.className="hfp-time",p.textContent="0:00 / 0:00";let c=document.createElement("div");c.className="hfp-speed-wrap";let u=document.createElement("button");u.className="hfp-speed-btn",u.type="button",u.textContent="1x",u.setAttribute("aria-label","Playback speed");let f=document.createElement("div");f.className="hfp-speed-menu",f.setAttribute("role","menu");for(let a of i){let d=document.createElement("button");d.className="hfp-speed-option",d.type="button",d.setAttribute("role","menuitem"),d.dataset.speed=String(a),d.textContent=L(a),a===1&&d.classList.add("hfp-active"),f.appendChild(d)}c.appendChild(f),c.appendChild(u);let _=document.createElement("div");_.className="hfp-volume-wrap";let m=document.createElement("button");m.className="hfp-mute-btn",m.type="button",m.innerHTML=G,m.setAttribute("aria-label","Mute");let g=document.createElement("div");g.className="hfp-volume-slider-wrap";let h=document.createElement("div");h.className="hfp-volume-slider",h.setAttribute("role","slider"),h.setAttribute("aria-label","Volume"),h.setAttribute("aria-valuemin","0"),h.setAttribute("aria-valuemax","100"),h.setAttribute("aria-valuenow","100"),h.tabIndex=0;let v=document.createElement("div");v.className="hfp-volume-fill",v.style.width="100%",h.appendChild(v),g.appendChild(h),_.appendChild(g),_.appendChild(m),n.appendChild(o),n.appendChild(s),n.appendChild(p),n.appendChild(_),n.appendChild(c),r.appendChild(n);let P=!1,S=!1,y=1,M=null,R=i.indexOf(1);R===-1&&(R=0);let D=(a,d)=>a?be:d===0?X:d<.5?X:G;o.addEventListener("click",a=>{a.stopPropagation(),P?e.onPause():e.onPlay()}),m.addEventListener("click",a=>{a.stopPropagation(),e.onMuteToggle()});let T=!1,I=a=>{let d=h.getBoundingClientRect(),b=Math.max(0,Math.min(1,(a-d.left)/d.width));y=b,v.style.width=`${b*100}%`,h.setAttribute("aria-valuenow",String(Math.round(b*100))),S&&b>0&&e.onMuteToggle(),m.innerHTML=D(S,b),e.onVolumeChange(b)};h.addEventListener("mousedown",a=>{a.stopPropagation(),T=!0,I(a.clientX)});let Z=a=>{T&&I(a.clientX)},K=()=>{T=!1};document.addEventListener("mousemove",Z),document.addEventListener("mouseup",K),h.addEventListener("touchstart",a=>{T=!0;let d=a.touches[0];d&&I(d.clientX)},{passive:!0});let ee=a=>{if(T){let d=a.touches[0];d&&I(d.clientX)}},te=()=>{T=!1};document.addEventListener("touchmove",ee,{passive:!0}),document.addEventListener("touchend",te);let ie=.05;h.addEventListener("keydown",a=>{let d=y;if(a.key==="ArrowRight"||a.key==="ArrowUp")d=Math.min(1,y+ie);else if(a.key==="ArrowLeft"||a.key==="ArrowDown")d=Math.max(0,y-ie);else return;a.preventDefault(),a.stopPropagation(),y=d,v.style.width=`${d*100}%`,h.setAttribute("aria-valuenow",String(Math.round(d*100))),S&&d>0&&e.onMuteToggle(),m.innerHTML=D(S,d),e.onVolumeChange(d)});let re=a=>{for(let d of f.querySelectorAll(".hfp-speed-option"))d.classList.toggle("hfp-active",d.dataset.speed===String(a))};u.addEventListener("click",a=>{a.stopPropagation();let d=f.classList.toggle("hfp-open");u.setAttribute("aria-expanded",String(d))}),f.addEventListener("click",a=>{a.stopPropagation();let d=a.target.closest(".hfp-speed-option");if(!d)return;let b=parseFloat(d.dataset.speed);R=i.indexOf(b),u.textContent=L(b),re(b),f.classList.remove("hfp-open"),u.setAttribute("aria-expanded","false"),e.onSpeedChange(b)});let ne=()=>{f.classList.remove("hfp-open"),u.setAttribute("aria-expanded","false")};document.addEventListener("click",ne);let O=a=>{let d=s.getBoundingClientRect(),b=Math.max(0,Math.min(1,(a-d.left)/d.width));e.onSeek(b)},w=!1;s.addEventListener("mousedown",a=>{a.stopPropagation(),w=!0,O(a.clientX)});let oe=a=>{w&&O(a.clientX)},ae=()=>{w=!1};document.addEventListener("mousemove",oe),document.addEventListener("mouseup",ae),s.addEventListener("touchstart",a=>{w=!0;let d=a.touches[0];d&&O(d.clientX)},{passive:!0});let se=a=>{if(w){let d=a.touches[0];d&&O(d.clientX)}},le=()=>{w=!1};document.addEventListener("touchmove",se,{passive:!0}),document.addEventListener("touchend",le);let de=()=>{M&&clearTimeout(M),M=setTimeout(()=>{P&&n.classList.add("hfp-hidden")},3e3)},pe=r instanceof ShadowRoot?r.host:r;return pe.addEventListener("mousemove",()=>{n.classList.remove("hfp-hidden"),de()}),pe.addEventListener("mouseleave",()=>{P&&n.classList.add("hfp-hidden")}),{updateTime(a,d){let b=d>0?Math.min(a,d):a,Le=d>0?b/d*100:0;l.style.width=`${Le}%`,p.textContent=`${N(b)} / ${N(d)}`},updatePlaying(a){P=a,o.innerHTML=a?fe:B,o.setAttribute("aria-label",a?"Pause":"Play"),a?de():n.classList.remove("hfp-hidden")},updateSpeed(a){let d=i.indexOf(a);d!==-1&&(R=d),u.textContent=L(a),re(a)},updateMuted(a){S=a,m.innerHTML=D(a,y),m.setAttribute("aria-label",a?"Unmute":"Mute")},updateVolume(a){y=a,v.style.width=`${a*100}%`,h.setAttribute("aria-valuenow",String(Math.round(a*100))),m.innerHTML=D(S,a)},show(){n.style.display=""},hide(){n.style.display="none"},destroy(){document.removeEventListener("mousemove",oe),document.removeEventListener("mouseup",ae),document.removeEventListener("touchmove",se),document.removeEventListener("touchend",le),document.removeEventListener("mousemove",Z),document.removeEventListener("mouseup",K),document.removeEventListener("touchmove",ee),document.removeEventListener("touchend",te),document.removeEventListener("click",ne),M&&clearTimeout(M)}}}function ge(r,e,t,i,n){let o=i?i.split(",").map(Number).filter(p=>!isNaN(p)&&p>0):void 0,l=ve(r,n,o?{speedPresets:o}:{});return l.updateMuted(e),l.updateVolume(t),l}function Q(r,e,t){return e?(t||(t=document.createElement("img"),t.className="hfp-poster",r.appendChild(t)),t.src=e,t):(t?.remove(),null)}function _e(r){return r.composedPath().some(e=>e instanceof HTMLElement&&e.classList.contains("hfp-controls"))}var F=null;function ye(r,e){if(typeof CSSStyleSheet<"u")try{F||(F=new CSSStyleSheet,F.replaceSync(e)),r.adoptedStyleSheets=[F];return}catch{}let t=document.createElement("style");t.textContent=e,r.appendChild(t)}function Ee(){let r=document.createElement("div");r.className="hfp-container";let e=document.createElement("iframe");return e.className="hfp-iframe",e.sandbox.add("allow-scripts","allow-same-origin"),e.allow="autoplay; fullscreen",e.referrerPolicy="no-referrer",e.title="HyperFrames Composition",r.appendChild(e),{container:r,iframe:e}}function Se(r,e,t,i){let n=r.offsetWidth,o=r.offsetHeight;if(n===0||o===0)return;let s=Math.min(n/t,o/i);e.style.width=`${t}px`,e.style.height=`${i}px`,e.style.transform=`translate(-50%, -50%) scale(${s})`}var U=class{constructor(e){this._callbacks=e}_callbacks;_raf=null;_lastUpdateMs=0;start(e,t,i,n){this.stop();let o=()=>{if(n()){this._raf=null;return}let s;try{s=e.time()}catch{this._raf=null;return}let l=i();l>0&&(s=Math.min(s,l));let p=l>0&&s>=l,c=performance.now();if((c-this._lastUpdateMs>100||p)&&(this._lastUpdateMs=c,this._callbacks.onTimeUpdate(s,l)),p){if(this._callbacks.getLoop()){this._callbacks.restart();return}try{e.pause()}catch{}this._callbacks.onPaused(),this._raf=null;return}this._raf=requestAnimationFrame(o)};this._raf=requestAnimationFrame(o)}stop(){this._raf!==null&&(cancelAnimationFrame(this._raf),this._raf=null)}get isRunning(){return this._raf!==null}};function Te(r){let e=Array.from(r.querySelectorAll("[data-composition-id]"));if(e.length===0)return r.body?[r.body]:[];let t=[];for(let i of e)Ue(i)||t.push(i);return Fe(r),t}function Fe(r){let e=r.body;if(!e||typeof console>"u"||typeof console.warn!="function")return;let t=e.querySelectorAll("audio[data-start], video[data-start]");if(t.length===0)return;let i=[];for(let n of t)n.closest("[data-composition-id]")||i.push(n);i.length!==0&&console.warn(`[hyperframes-player] selectMediaObserverTargets: composition hosts are present, but ${i.length} body-level timed media element(s) sit outside every [data-composition-id] subtree and will not be observed. Move them inside a composition host or the parent-frame proxy will never adopt them.`,i)}function Ue(r){let e=r.parentElement;for(;e;){if(e.hasAttribute("data-composition-id"))return!0;e=e.parentElement}return!1}var Ve=.05,je=2,V=class{_entries=[];_mediaObserver;_playbackErrorPosted=!1;_audioOwner="runtime";_dispatchEvent;_getMuted;_getVolume;_getPlaybackRate;_getCurrentTime;_isPaused;constructor(e){this._dispatchEvent=e.dispatchEvent,this._getMuted=e.getMuted,this._getVolume=e.getVolume,this._getPlaybackRate=e.getPlaybackRate,this._getCurrentTime=e.getCurrentTime,this._isPaused=e.isPaused}get audioOwner(){return this._audioOwner}get entries(){return this._entries}get playbackErrorPosted(){return this._playbackErrorPosted}resetForIframeLoad(){this._playbackErrorPosted=!1;let e=this._audioOwner==="parent";this._audioOwner="runtime",this.pauseAll(),this.teardownObserver(),e&&this._dispatchEvent(new CustomEvent("audioownershipchange",{detail:{owner:"runtime",reason:"iframe-reload"}}))}destroy(){this.teardownObserver();for(let e of this._entries)e.el.pause(),e.el.src="";this._entries=[]}updateMuted(e){for(let t of this._entries)t.el.muted=e}updateVolume(e){for(let t of this._entries)t.el.volume=e}updatePlaybackRate(e){for(let t of this._entries)t.el.playbackRate=e}playAll(){for(let e of this._entries)e.el.src&&e.el.play().catch(t=>this._reportPlaybackError(t))}pauseAll(){for(let e of this._entries)e.el.pause()}seekAll(e){for(let t of this._entries){let i=e-t.start;i>=0&&i<t.duration&&(t.el.currentTime=i)}}mirrorTime(e,t){let i=t?.force===!0;for(let n of this._entries){let o=e-n.start;if(o<0||o>=n.duration){n.driftSamples=0;continue}Math.abs(n.el.currentTime-o)>Ve?(n.driftSamples+=1,(i||n.driftSamples>=je)&&(n.el.currentTime=o,n.driftSamples=0)):n.driftSamples=0}}promoteToParentProxy(e,t){if(this._audioOwner==="parent")return;if(this._audioOwner="parent",e)for(let n of e.querySelectorAll("video, audio"))n.muted=!0;let i=this._getCurrentTime();t?t(i,{force:!0}):this.mirrorTime(i,{force:!0}),this._isPaused()||this.playAll(),this._dispatchEvent(new CustomEvent("audioownershipchange",{detail:{owner:"parent",reason:"autoplay-blocked"}}))}setupFromIframe(e){let t=e.querySelectorAll("audio[data-start], video[data-start]");for(let i of t)this._adoptIframeMedia(i);this._observeDynamicMedia(e)}setupFromUrl(e){this._createEntry(e,"audio",0,1/0)}teardownObserver(){this._mediaObserver?.disconnect(),this._mediaObserver=void 0}_reportPlaybackError(e){this._playbackErrorPosted||(this._playbackErrorPosted=!0,this._dispatchEvent(new CustomEvent("playbackerror",{detail:{source:"parent-proxy",error:e}})))}_createEntry(e,t,i,n){if(this._entries.some(p=>p.el.src===e))return null;let o=t==="video"?document.createElement("video"):new Audio;o.preload="auto",o.src=e,o.load(),o.muted=this._getMuted(),o.volume=this._getVolume();let s=this._getPlaybackRate();s!==1&&(o.playbackRate=s);let l={el:o,start:i,duration:n,driftSamples:0};return this._entries.push(l),l}_adoptIframeMedia(e){if(e.preload==="metadata"||e.preload==="none")return;let t=e.getAttribute("src")||e.querySelector("source")?.getAttribute("src");if(!t)return;let i=new URL(t,e.ownerDocument.baseURI).href,n=parseFloat(e.getAttribute("data-start")||"0"),o=parseFloat(e.getAttribute("data-duration")||"Infinity"),s=e.tagName==="VIDEO"?"video":"audio",l=this._createEntry(i,s,n,o);l&&this._audioOwner==="parent"&&(this.mirrorTime(this._getCurrentTime(),{force:!0}),!this._isPaused()&&l.el.src&&l.el.play().catch(p=>this._reportPlaybackError(p)))}_detachIframeMedia(e){let t=e.getAttribute("src")||e.querySelector("source")?.getAttribute("src");if(!t)return;let i=new URL(t,e.ownerDocument.baseURI).href,n=this._entries.findIndex(s=>s.el.src===i);if(n===-1)return;let o=this._entries[n];o.el.pause(),o.el.src="",this._entries.splice(n,1)}_observeDynamicMedia(e){if(this.teardownObserver(),typeof MutationObserver>"u"||!e.body)return;let t=new MutationObserver(o=>{for(let s of o){if(s.type==="attributes"&&s.attributeName==="preload"){let l=s.target;l instanceof HTMLMediaElement&&l.matches("audio[data-start], video[data-start]")&&l.preload==="auto"&&this._adoptIframeMedia(l);continue}for(let l of s.addedNodes){if(!(l instanceof Element))continue;let p=[];l.matches?.("audio[data-start], video[data-start]")&&p.push(l);let c=l.querySelectorAll?.("audio[data-start], video[data-start]");if(c)for(let u of c)p.push(u);for(let u of p)this._adoptIframeMedia(u)}for(let l of s.removedNodes){if(!(l instanceof Element))continue;let p=[];l.matches?.("audio[data-start], video[data-start]")&&p.push(l);let c=l.querySelectorAll?.("audio[data-start], video[data-start]");if(c)for(let u of c)p.push(u);for(let u of p)this._detachIframeMedia(u)}}}),i={childList:!0,subtree:!0,attributes:!0,attributeFilter:["preload"]},n=Te(e);for(let o of n)t.observe(o,i);this._mediaObserver=t}};function we(r,e,t,i){let n=(r.frame??0)/e,o=t.duration>0?Math.min(n,t.duration):n,s=!t.paused,l=!r.isPlaying,p=t.duration>0&&o>=t.duration&&(s||r.isPlaying);if(p&&i.getLoop())return i.media.audioOwner==="parent"&&i.media.pauseAll(),i.seek(0),i.play(),{...t,currentTime:o,paused:!1};let c={...t,currentTime:o,paused:l};i.media.audioOwner==="parent"&&(s&&l?i.media.pauseAll():!s&&!l&&i.media.playAll(),i.media.mirrorTime(o));let u=performance.now(),f=l!==t.paused;return(u-t.lastUpdateMs>100||f)&&(c.lastUpdateMs=u,i.updateControlsTime(o,t.duration),i.updateControlsPlaying(!l),i.dispatchEvent(new CustomEvent("timeupdate",{detail:{currentTime:o}}))),p&&(i.media.audioOwner==="parent"&&i.media.pauseAll(),c.paused=!0,i.updateControlsPlaying(!1),i.dispatchEvent(new Event("ended"))),c}var xe=30;function Ce(r,e,t){if(r.source!==e)return;let i=r.data;if(!(!i||i.source!=="hf-preview")){if(i.type==="shader-transition-state"){let n=i.state&&typeof i.state=="object"?i.state:{};t.shaderLoader.update(n,t.getShaderLoadingMode()),t.dispatchEvent(new CustomEvent("shadertransitionstate",{detail:{compositionId:i.compositionId,state:n}}));return}if(i.type==="state"){t.setPlaybackState(we({frame:i.frame??0,isPlaying:!!i.isPlaying},xe,t.getPlaybackState(),t));return}if(i.type==="media-autoplay-blocked"){let n=null;try{n=t.getIframeDoc()}catch{}t.media.promoteToParentProxy(n,(o,s)=>t.media.mirrorTime(o,s)),t.sendControl("set-media-output-muted",{muted:!0});return}if(i.type==="timeline"&&i.durationInFrames>0){if(Number.isFinite(i.durationInFrames)){let n=t.getPlaybackState(),o=i.durationInFrames/xe;t.setPlaybackState({...n,duration:o}),t.updateControlsTime(n.currentTime,o)}return}i.type==="stage-size"&&i.width>0&&i.height>0&&t.setCompositionSize(i.width,i.height)}}var E="shader-capture-scale",x="shader-loading",ze="__hf_shader_capture_scale",$e="__hf_shader_loading",C=["Preparing scene transitions","Sampling outgoing scene motion","Sampling incoming scene motion","Caching transition frames","Finalizing transition preview"];function J(r){if(r===null)return null;let e=Number(r);return!Number.isFinite(e)||e<=0?null:String(Math.min(1,Math.max(.25,e)))}function We(r){if(r===null||r.trim()==="")return"composition";let e=r.trim().toLowerCase();return e==="none"||e==="false"||e==="0"||e==="off"?"none":e==="player"||e==="true"||e==="1"||e==="on"?"player":"composition"}function Ae(r,e,t){t===null?r.delete(e):r.set(e,t)}function qe(r,e,t){let i=r.indexOf("#"),n=i>=0?r.slice(0,i):r,o=i>=0?r.slice(i):"",s=n.indexOf("?"),l=s>=0?n.slice(0,s):n,p=s>=0?n.slice(s+1):"",c=new URLSearchParams(p);Ae(c,ze,e),Ae(c,$e,t==="composition"?null:t);let u=c.toString();return`${l}${u?`?${u}`:""}${o}`}function Be(r,e,t){if(e===null&&t==="composition")return r;let i=[];e!==null&&i.push(`window.__HF_SHADER_CAPTURE_SCALE=${JSON.stringify(e)};`),t!=="composition"&&i.push(`window.__HF_SHADER_LOADING=${JSON.stringify(t)};`);let n=`<script data-hyperframes-player-shader-options>${i.join("")}</script>`;return/<head\b[^>]*>/i.test(r)?r.replace(/<head\b[^>]*>/i,o=>`${o}${n}`):/<html\b[^>]*>/i.test(r)?r.replace(/<html\b[^>]*>/i,o=>`${o}${n}`):`${n}${r}`}function A(r){return We(r.getAttribute(x))}function Me(r){return Number(J(r.getAttribute(E))??"1")}function j(r,e){return qe(e,J(r.getAttribute(E)),A(r))}function z(r,e){return Be(e,J(r.getAttribute(E)),A(r))}function ke(){let r=document.createElement("div");r.className="hfp-shader-loader",r.setAttribute("role","status"),r.setAttribute("aria-live","polite"),r.setAttribute("aria-label","Preparing scene transitions"),r.setAttribute("data-hyperframes-ignore",""),r.draggable=!1;let e=m=>{m.preventDefault(),m.stopPropagation()};for(let m of["selectstart","dragstart","pointerdown","mousedown","click","dblclick","contextmenu","touchstart"])r.addEventListener(m,e,{capture:!0});let t=document.createElement("div");t.className="hfp-shader-loader-panel",t.draggable=!1;let i=document.createElement("div");i.className="hfp-shader-loader-mark",i.draggable=!1,i.innerHTML=['<svg width="78" height="78" viewBox="0 0 100 100" fill="none" aria-hidden="true" draggable="false">','<path d="M10.1851 57.8021L33.1145 73.8313C36.2202 75.9978 41.5173 73.5433 42.4816 69.4984L51.7611 30.4271C52.7253 26.3822 48.5802 23.9277 44.4602 26.0942L13.917 42.1235C6.96677 45.7676 4.97564 54.1579 10.1851 57.8021Z" fill="url(#hfp-shader-loader-grad-left)"/>','<path d="M87.5129 57.5141L56.9696 73.5433C52.8371 75.7098 48.7046 73.2553 49.6688 69.2104L58.9483 30.1391C59.9125 26.0942 65.2097 23.6397 68.3154 25.8062L91.2447 41.8354C96.4668 45.4796 94.4631 53.8699 87.5129 57.5141Z" fill="url(#hfp-shader-loader-grad-right)"/>',"<defs>",'<linearGradient id="hfp-shader-loader-grad-left" x1="48.5676" y1="25" x2="44.7804" y2="71.9384" gradientUnits="userSpaceOnUse">','<stop stop-color="#06E3FA"/>','<stop offset="1" stop-color="#4FDB5E"/>',"</linearGradient>",'<linearGradient id="hfp-shader-loader-grad-right" x1="54.8282" y1="73.8392" x2="72.0989" y2="32.8932" gradientUnits="userSpaceOnUse">','<stop stop-color="#06E3FA"/>','<stop offset="1" stop-color="#4FDB5E"/>',"</linearGradient>","</defs>","</svg>"].join("");let n=document.createElement("div");n.className="hfp-shader-loader-title";let o=document.createElement("span");o.className="hfp-shader-loader-title-text",o.textContent=C[0]||"Preparing scene transitions",n.appendChild(o);let s=document.createElement("div");s.className="hfp-shader-loader-detail",s.textContent="Rendering animated scene samples for shader transitions.";let l=document.createElement("div");l.className="hfp-shader-loader-track",l.setAttribute("aria-hidden","true");let p=document.createElement("div");p.className="hfp-shader-loader-fill",l.appendChild(p);let c=document.createElement("div");c.className="hfp-shader-loader-progress";let u=m=>{let g=document.createElement("div");g.className="hfp-shader-loader-row";let h=document.createElement("span");h.className="hfp-shader-loader-label",h.textContent=m;let v=document.createElement("span");return v.className="hfp-shader-loader-value",g.appendChild(h),g.appendChild(v),c.appendChild(g),{row:g,label:h,value:v}},f=u("transition"),_=u("transition frame");return t.appendChild(i),t.appendChild(n),t.appendChild(s),t.appendChild(l),t.appendChild(c),r.appendChild(t),{root:r,fill:p,title:o,detail:s,transitionValue:f.value,frameLabel:_.label,frameValue:_.value,frameRow:_.row}}var Ge=420,$=class{_el;_hideTimeout=null;constructor(e){this._el=e}show(){this._hideTimeout&&(clearTimeout(this._hideTimeout),this._hideTimeout=null),this._el.root.classList.remove("hfp-hiding"),this._el.root.classList.add("hfp-visible")}hide(){if(this._el.root.classList.contains("hfp-hiding")){this._hideTimeout||this._scheduleCleanup();return}this._el.root.classList.contains("hfp-visible")&&(this._el.root.classList.add("hfp-hiding"),this._el.root.classList.remove("hfp-visible"),this._scheduleCleanup())}reset(){this._hideTimeout&&(clearTimeout(this._hideTimeout),this._hideTimeout=null),this._el.root.classList.remove("hfp-visible","hfp-hiding"),this._el.fill.style.transform="scaleX(0)",this._el.transitionValue.textContent="",this._el.frameValue.textContent="",this._el.frameRow.style.visibility="hidden"}update(e,t){if(t!=="player"){this.reset();return}if(e.ready||!e.loading){this.hide();return}let i=typeof e.progress=="number"&&Number.isFinite(e.progress)?e.progress:0,n=typeof e.total=="number"&&Number.isFinite(e.total)?e.total:0,o=n>0?Math.min(1,Math.max(0,i/n)):0,s=Math.min(C.length-1,Math.floor(o*C.length));this._el.title.textContent=C[s]||"Preparing scene transitions",this._el.detail.textContent=e.phase==="cached"?"Loading cached transition frames before playback.":e.phase==="finalizing"?"Uploading transition textures for smooth playback.":"Rendering animated scene samples for shader transitions.",this._el.fill.style.transform=`scaleX(${o})`,this._el.transitionValue.textContent=e.currentTransition!==void 0&&e.transitionTotal!==void 0?`${e.currentTransition}/${e.transitionTotal}`:n>0?`${i}/${n}`:"";let l=e.transitionFrame!==void 0&&e.transitionFrames!==void 0?`${e.transitionFrame}/${e.transitionFrames}`:"";this._el.frameLabel.textContent=e.phase==="cached"?"cached transition frames":e.phase==="finalizing"?"finalizing transition frames":"rendering transition frames",this._el.frameValue.textContent=l,this._el.frameRow.style.visibility=l?"visible":"hidden",this._el.root.setAttribute("aria-valuenow",String(Math.round(o*100))),this.show()}get hideTimeout(){return this._hideTimeout}destroy(){this._hideTimeout&&(clearTimeout(this._hideTimeout),this._hideTimeout=null)}_scheduleCleanup(){this._hideTimeout&&clearTimeout(this._hideTimeout),this._hideTimeout=setTimeout(()=>{this._el.root.classList.remove("hfp-hiding"),this._hideTimeout=null},Ge)}};var W=class extends HTMLElement{static get observedAttributes(){return["src","srcdoc","width","height","controls","muted","volume","poster","playback-rate","audio-src",E,x]}shadow;container;iframe;posterEl=null;controlsApi=null;resizeObserver;shaderLoader;probe;_ready=!1;_currentTime=0;_duration=0;_paused=!0;_lastUpdateMs=0;_volume=1;_compositionWidth=1920;_compositionHeight=1080;_directTimelineAdapter=null;_directTimelineClock;_parentTickRaf=null;_media;constructor(){super(),this.shadow=this.attachShadow({mode:"open"}),ye(this.shadow,me),{container:this.container,iframe:this.iframe}=Ee(),this.shadow.appendChild(this.container);let e=ke();this.shadow.appendChild(e.root),this.shaderLoader=new $(e),this._media=new V({dispatchEvent:t=>this.dispatchEvent(t),getMuted:()=>this.muted,getVolume:()=>this._volume,getPlaybackRate:()=>this.playbackRate,getCurrentTime:()=>this._currentTime,isPaused:()=>this._paused}),this._directTimelineClock=new U({onTimeUpdate:(t,i)=>{this._currentTime=t,this.controlsApi?.updateTime(t,i),this.dispatchEvent(new CustomEvent("timeupdate",{detail:{currentTime:t}}))},getLoop:()=>this.loop,restart:()=>{this.seek(0),this.play()},onPaused:()=>{this._media.audioOwner==="parent"&&this._media.pauseAll(),this._paused=!0,this.controlsApi?.updatePlaying(!1),this.dispatchEvent(new Event("ended"))},onEnded:()=>this.loop}),this.probe=new H(this.iframe,{onReady:t=>this._onProbeReady(t),onError:t=>this.dispatchEvent(new CustomEvent("error",{detail:{message:t}}))}),this.addEventListener("click",t=>{_e(t)||(this._paused?this.play():this.pause())}),this.resizeObserver=new ResizeObserver(()=>this._rescale()),this._onMessage=this._onMessage.bind(this),this._onIframeLoad=this._onIframeLoad.bind(this)}connectedCallback(){this.resizeObserver.observe(this),window.addEventListener("message",this._onMessage),this.iframe.addEventListener("load",this._onIframeLoad),this.hasAttribute("controls")&&this._setupControls(),this.hasAttribute("poster")&&(this.posterEl=Q(this.shadow,this.getAttribute("poster"),this.posterEl)),this.hasAttribute("audio-src")&&this._media.setupFromUrl(this.getAttribute("audio-src")),this.hasAttribute("srcdoc")&&(this.iframe.srcdoc=z(this,this.getAttribute("srcdoc"))),this.hasAttribute("src")&&(this.iframe.src=j(this,this.getAttribute("src")))}disconnectedCallback(){this.resizeObserver.disconnect(),window.removeEventListener("message",this._onMessage),this.iframe.removeEventListener("load",this._onIframeLoad),this.probe.stop(),this._directTimelineClock.stop(),this._stopParentTickClock(),this._directTimelineAdapter=null,this.shaderLoader.destroy(),this._media.destroy(),this.controlsApi?.destroy()}attributeChangedCallback(e,t,i){switch(e){case"src":i&&(this._ready=!1,this.iframe.src=j(this,i));break;case"srcdoc":this._ready=!1,i!==null?this.iframe.srcdoc=z(this,i):this.iframe.removeAttribute("srcdoc");break;case"width":this._compositionWidth=parseInt(i||"1920",10),this._rescale();break;case"height":this._compositionHeight=parseInt(i||"1080",10),this._rescale();break;case"controls":i!==null?this._setupControls():(this.controlsApi?.destroy(),this.controlsApi=null);break;case"poster":this.posterEl=Q(this.shadow,i,this.posterEl);break;case"playback-rate":{let n=parseFloat(i||"1");this._media.updatePlaybackRate(n),this._sendControl("set-playback-rate",{playbackRate:n}),this._directTimelineAdapter?.timeScale?.(n),this.controlsApi?.updateSpeed(n),this.dispatchEvent(new Event("ratechange"));break}case"muted":this._media.updateMuted(i!==null),this._sendControl("set-muted",{muted:i!==null}),this.controlsApi?.updateMuted(i!==null),this.dispatchEvent(new Event("volumechange"));break;case"volume":{let n=Math.max(0,Math.min(1,parseFloat(i||"1")));this._volume=n,this._media.updateVolume(n),this._sendControl("set-volume",{volume:n}),this.controlsApi?.updateVolume(n),this.dispatchEvent(new Event("volumechange"));break}case"audio-src":i&&this._media.setupFromUrl(i);break;case E:case x:this._reloadShaderOptions();break}}get iframeElement(){return this.iframe}play(){this.posterEl?.remove(),this.posterEl=null,this._duration>0&&this._currentTime>=this._duration&&this.seek(0),this._paused=!1;let e=this._tryDirectTimelinePlay();e||(this._sendControl("play"),this._ready&&!this._directTimelineAdapter&&this._startParentTickClock()),this._media.audioOwner==="parent"&&this._media.playAll(),this.controlsApi?.updatePlaying(!0),this.dispatchEvent(new Event("play")),e&&this._directTimelineAdapter&&this._directTimelineClock.start(this._directTimelineAdapter,()=>this._currentTime,()=>this._duration,()=>this._paused)}pause(){this._tryDirectTimelinePause()||this._sendControl("pause"),this._directTimelineClock.stop(),this._stopParentTickClock(),this._media.audioOwner==="parent"&&this._media.pauseAll(),this._paused=!0,this.controlsApi?.updatePlaying(!1),this.dispatchEvent(new Event("pause"))}seek(e){!this._trySyncSeek(e)&&!this._tryDirectTimelineSeek(e)&&this._sendControl("seek",{frame:Math.round(e*30)}),this._directTimelineClock.stop(),this._stopParentTickClock(),this._currentTime=e,this._media.audioOwner==="parent"&&(this._media.pauseAll(),this._media.seekAll(e)),this._paused=!0,this.controlsApi?.updatePlaying(!1),this.controlsApi?.updateTime(this._currentTime,this._duration)}get currentTime(){return this._currentTime}set currentTime(e){this.seek(e)}get duration(){return this._duration}get paused(){return this._paused}get ready(){return this._ready}get playbackRate(){return parseFloat(this.getAttribute("playback-rate")||"1")}set playbackRate(e){this.setAttribute("playback-rate",String(e))}get shaderCaptureScale(){return Me(this)}set shaderCaptureScale(e){this.setAttribute(E,String(e))}get shaderLoading(){return A(this)}set shaderLoading(e){e==="composition"?this.removeAttribute(x):this.setAttribute(x,e)}get muted(){return this.hasAttribute("muted")}set muted(e){e?this.setAttribute("muted",""):this.removeAttribute("muted")}get volume(){return this._volume}set volume(e){this.setAttribute("volume",String(Math.max(0,Math.min(1,e))))}get loop(){return this.hasAttribute("loop")}set loop(e){e?this.setAttribute("loop",""):this.removeAttribute("loop")}_sendControl(e,t={}){try{this.iframe.contentWindow?.postMessage({source:"hf-parent",type:"control",action:e,...t},"*")}catch{}}_reloadShaderOptions(){if(A(this)!=="player"&&this.shaderLoader.reset(),this.hasAttribute("srcdoc")){this.iframe.srcdoc=z(this,this.getAttribute("srcdoc")||"");return}this.hasAttribute("src")&&(this.iframe.src=j(this,this.getAttribute("src")||""))}_trySyncSeek(e){try{let i=this.iframe.contentWindow?.__player;return typeof i?.seek!="function"?!1:(i.seek.call(i,e),!0)}catch{return!1}}_withDirectTimeline(e){let t=this._directTimelineAdapter||this.probe.resolveDirectTimelineAdapter();if(!t)return!1;try{return e(t),this._directTimelineAdapter=t,!0}catch{return!1}}_tryDirectTimelineSeek(e){return this._withDirectTimeline(t=>{t.seek(e),t.pause()})}_tryDirectTimelinePlay(){return this._withDirectTimeline(e=>{e.play()})}_tryDirectTimelinePause(){return this._withDirectTimeline(e=>{e.pause()})}_startParentTickClock(){this._stopParentTickClock();let e=()=>{if(this._paused){this._parentTickRaf=null;return}this._sendControl("tick"),this._parentTickRaf=requestAnimationFrame(e)};this._parentTickRaf=requestAnimationFrame(e)}_stopParentTickClock(){this._parentTickRaf!==null&&(cancelAnimationFrame(this._parentTickRaf),this._parentTickRaf=null)}_onMessage(e){Ce(e,this.iframe.contentWindow,{getPlaybackState:()=>({currentTime:this._currentTime,duration:this._duration,paused:this._paused,lastUpdateMs:this._lastUpdateMs}),setPlaybackState:({currentTime:t,duration:i,paused:n,lastUpdateMs:o})=>{this._currentTime=t,this._duration=i,this._paused=n,this._lastUpdateMs=o},getShaderLoadingMode:()=>A(this),shaderLoader:this.shaderLoader,setCompositionSize:(t,i)=>{this._compositionWidth=t,this._compositionHeight=i,this._rescale()},sendControl:(t,i)=>this._sendControl(t,i),getIframeDoc:()=>this.iframe.contentDocument,updateControlsTime:(t,i)=>this.controlsApi?.updateTime(t,i),updateControlsPlaying:t=>this.controlsApi?.updatePlaying(t),dispatchEvent:t=>this.dispatchEvent(t),seek:t=>this.seek(t),play:()=>this.play(),getLoop:()=>this.loop,media:this._media})}_onProbeReady({duration:e,adapter:t,compositionSize:i}){this._duration=e,this._directTimelineAdapter=t.kind==="direct-timeline"?t.timeline:null,this._ready=!0,this.controlsApi?.updateTime(0,e),this.dispatchEvent(new CustomEvent("ready",{detail:{duration:e}})),i&&(this._compositionWidth=i.width,this._compositionHeight=i.height,this._rescale());try{let n=this.iframe.contentDocument;n&&this._media.setupFromIframe(n)}catch{}this.hasAttribute("autoplay")&&this.play()}_rescale(){Se(this,this.iframe,this._compositionWidth,this._compositionHeight)}_onIframeLoad(){this._directTimelineAdapter=null,this._directTimelineClock.stop(),this._stopParentTickClock(),this.shaderLoader.reset(),this._media.resetForIframeLoad(),this.probe.start()}_setupControls(){this.controlsApi||(this.controlsApi=ge(this.shadow,this.muted,this._volume,this.getAttribute("speed-presets"),{onPlay:()=>this.play(),onPause:()=>this.pause(),onSeek:e=>this.seek(e*this._duration),onSpeedChange:e=>{this.playbackRate=e},onMuteToggle:()=>{this.muted=!this.muted},onVolumeChange:e=>{this.volume=e}}))}get _audioOwner(){return this._media.audioOwner}get _parentMedia(){return this._media.entries}_mirrorParentMediaTime(e,t){this._media.mirrorTime(e,t)}_promoteToParentProxy(){let e=null;try{e=this.iframe.contentDocument}catch{}this._media.promoteToParentProxy(e,(t,i)=>this._mirrorParentMediaTime(t,i)),this._sendControl("set-media-output-muted",{muted:!0})}_observeDynamicMedia(e){this._media.setupFromIframe(e)}};customElements.get("hyperframes-player")||customElements.define("hyperframes-player",W);return He(Xe);})();

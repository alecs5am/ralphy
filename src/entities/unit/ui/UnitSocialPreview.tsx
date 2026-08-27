import {
  Bookmark,
  Camera,
  ChevronLeft,
  ChevronRight,
  Heart,
  MessageCircle,
  MoreHorizontal,
  MoreVertical,
  Music2,
  Play,
  Repeat2,
  Search,
  Send,
  Share2,
  Shuffle,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { useEffect, useState } from "react";

import { AudioWaveform } from "@/entities/media/ui/AudioWaveform";
import { VideoPlayer } from "@/entities/media/ui/VideoPlayer";
import { type SocialTarget, type UnitMedia } from "../lib/unit-previews";
import { DocumentContent } from "@/pages/project/ui/DocumentsPanel";

export type SocialPreviewProps = {
  media: UnitMedia[];
  slug: string;
  caption?: string;
  previewMode?: "post" | "clean";
  guides?: boolean;
};

// Every social frame is a black widget in both themes, so its ink is the on-instrument family
// throughout: the theme ink would be black on black in the light theme. The frame also owns the
// media it mounts -- a borrowed player fills it and keeps none of its own transport.
const FRAME = "relative size-full min-h-0 overflow-hidden bg-device-body text-on-instrument [&_.custom-video-player]:size-full [&_.custom-video-player]:min-h-0 [&_.video-controls]:hidden [&_.viewer-video]:size-full [&_.viewer-video]:min-h-0 [&_.viewer-video]:object-cover [&_img]:size-full [&_img]:object-cover";
const MEDIA = "unit-social-media size-full min-h-0 [&>*]:size-full [&>*]:min-h-0";
// The feed chrome stands over the media, so its glyphs and labels carry their own shadow.
const OVER_MEDIA = "[&_svg]:size-4.5 [&_svg]:[filter:drop-shadow(0_1px_2px_color-mix(in_srgb,var(--instrument-media-frame)_50%,transparent))]";
const TOP_ROW = `unit-social-top absolute inset-x-4 top-10.5 z-4 flex min-h-5.25 items-center gap-3.5 type-label [text-shadow:0_1px_3px_color-mix(in_srgb,var(--instrument-media-frame)_55%,transparent)] ${OVER_MEDIA}`;
const RAIL_ACTION = "unit-social-action grid justify-items-center gap-0.5";
const AVATAR = "unit-social-avatar grid place-items-center rounded-full bg-device-edge type-sm text-on-instrument";
const EMPTY = "preview-empty grid place-items-center text-on-instrument-muted";

export function UnitMediaView({ item }: { item: UnitMedia }) {
  if ("text" in item.preview) return <DocumentContent format={item.preview.format} text={item.preview.text} />;
  if (item.kind === "image") return <img src={item.preview.url} alt={item.role} />;
  /* The social mockup is a black screen. */
  if (item.kind === "video") return <VideoPlayer src={item.preview.url} name={item.role} compact tone="instrument" />;
  if (item.kind === "audio") return <AudioWaveform src={item.preview.url} name={item.role} sizeBytes={item.preview.sizeBytes} compact tone="instrument" />;
  return <a href={item.preview.url}>Open {item.role}</a>;
}

function FirstMedia({ media }: Pick<SocialPreviewProps, "media">) {
  const item = media.find((candidate) => candidate.kind === "video") ?? media[0];
  return item ? <UnitMediaView item={item} /> : <div className={EMPTY}>No media in this revision.</div>;
}

function Carousel({ media }: Pick<SocialPreviewProps, "media">) {
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [media]);
  const move = (delta: number) => setIndex((value) => (value + delta + media.length) % media.length);
  return <div className="unit-stage-carousel relative size-full min-h-0 overflow-hidden">
    <div className="unit-stage-slides flex size-full [transition:transform_var(--dur-slow)_var(--ease)] motion-reduce:[transition:none] motion-reduce:duration-0" style={{ transform: `translateX(-${index * 100}%)` }}>
      {media.map((item) => <div className="size-full shrink-0 grow-0 basis-full overflow-hidden" key={item.id}><UnitMediaView item={item} /></div>)}
      {media.length === 0 && <div className={EMPTY}>No media in this revision.</div>}
    </div>
    {media.length > 1 && <>
      <button className="absolute left-2 top-1/2 z-3 grid size-6.5 -translate-y-1/2 place-items-center rounded-full bg-media-plate text-on-instrument [&_svg]:size-3.75" type="button" aria-label="Previous slide" onClick={() => move(-1)}><ChevronLeft /></button>
      <button className="absolute right-2 top-1/2 z-3 grid size-6.5 -translate-y-1/2 place-items-center rounded-full bg-media-plate text-on-instrument [&_svg]:size-3.75" type="button" aria-label="Next slide" onClick={() => move(1)}><ChevronRight /></button>
      <span className="unit-stage-slide-count absolute right-2 top-2 z-3 h-5 rounded-control bg-media-plate px-2 font-code type-meta leading-5 text-on-instrument">{index + 1} / {media.length}</span>
      <span className="unit-stage-dots absolute bottom-2 left-1/2 z-3 flex -translate-x-1/2 gap-1" aria-hidden="true">{media.map((item, itemIndex) => <i className={`size-1.5 rounded-full ${itemIndex === index ? "is-active bg-on-instrument" : "bg-on-instrument/32"}`} key={item.id} />)}</span>
    </>}
  </div>;
}

function Actions() {
  return <span className="unit-social-actions flex items-center gap-3.25 px-2.75 py-2 [&_svg]:size-5.25 [&_svg:last-child]:ml-auto" aria-hidden="true"><Heart /><MessageCircle /><Send /><Bookmark /></span>;
}

function VerticalShell({ platform, slug, caption, media, guides }: SocialPreviewProps & { platform: string }) {
  const tiktok = platform === "tiktok";
  const reels = platform === "instagram";
  const youtube = platform === "youtube";
  return <article className={`unit-social-preview is-vertical is-${platform} ${FRAME}`} aria-label={`${platform} preview`}>
    <div className={MEDIA}><FirstMedia media={media} /></div>
    <span className="pointer-events-none absolute inset-x-0 top-0 z-raised h-1/4 bg-linear-to-b from-frame/42 to-transparent" aria-hidden="true" />
    <span className="pointer-events-none absolute inset-x-0 bottom-0 z-raised h-1/4 bg-linear-to-t from-frame/72 to-transparent" aria-hidden="true" />
    <header className={`${TOP_ROW} ${tiktok || youtube ? "justify-end" : "justify-between"}`}>
      {tiktok ? <><span className="unit-social-top-tabs absolute left-1/2 flex -translate-x-1/2 items-center gap-3.5 whitespace-nowrap"><span>Following</span><strong>For You</strong></span><Search /></>
        : reels ? <><strong>Reels</strong><Camera /></>
          : <span className="unit-social-top-actions flex items-center gap-3.5"><Search /><MoreVertical /></span>}
    </header>
    <aside className={`unit-social-rail absolute right-3 z-4 grid justify-items-center ${youtube ? "bottom-13.5 gap-2.5" : "bottom-18.75 gap-2.25"} [&_small]:type-xs [&_small]:text-on-instrument [&_small]:[text-shadow:0_1px_2px_var(--instrument-media-frame)] [&_svg]:size-6.25 [&_svg]:[filter:drop-shadow(0_1px_3px_var(--instrument-media-frame))]`} aria-hidden="true">
      {tiktok || reels ? <span className={`${AVATAR} size-8.5`}>R</span> : null}
      {tiktok ? <>
        <span className={RAIL_ACTION}><Heart /><small>12.4K</small></span>
        <span className={RAIL_ACTION}><MessageCircle /><small>214</small></span>
        <span className={RAIL_ACTION}><Bookmark /><small>1 208</small></span>
        <span className={RAIL_ACTION}><Send /><small>486</small></span>
      </> : reels ? <>
        <span className={RAIL_ACTION}><Heart /><small>8 902</small></span>
        <span className={RAIL_ACTION}><MessageCircle /><small>146</small></span>
        <span className={RAIL_ACTION}><Send /><small>389</small></span>
        <span className={RAIL_ACTION}><MoreVertical /></span>
      </> : <>
        <span className={RAIL_ACTION}><ThumbsUp /><small>12K</small></span>
        <span className={RAIL_ACTION}><ThumbsDown /><small>Dislike</small></span>
        <span className={RAIL_ACTION}><MessageCircle /><small>214</small></span>
        <span className={RAIL_ACTION}><Send /><small>Share</small></span>
        <span className={RAIL_ACTION}><Shuffle /><small>Remix</small></span>
      </>}
    </aside>
    <footer className={`absolute left-3 right-14.5 z-4 ${youtube ? "bottom-4.5" : "bottom-7"}`}>
      <span className="unit-social-profile flex items-center gap-1.75"><span className="unit-social-handle type-ui">@ralphy</span>{reels && <b className="rounded-control bg-on-instrument/20 px-2 py-0.75 font-code type-mono-md">Follow</b>}{!tiktok && !reels && <b className="rounded-control bg-on-instrument px-2 py-0.75 font-code type-mono-md text-device-body">Subscribe</b>}</span>
      <p className="my-1 line-clamp-2 type-label leading-caption">{caption ?? slug}</p>
      {tiktok || reels ? <span className="unit-social-audio flex items-center gap-1 type-xs [&_svg]:size-2.75"><Music2 /> Original audio · Ralphy</span> : null}
    </footer>
    {!reels && <span className="unit-social-progress absolute inset-x-0 bottom-0 z-5 h-0.5 bg-on-instrument/22" aria-hidden="true"><i className="block h-full w-social-progress bg-on-instrument/85" /></span>}
    {guides && <span className="unit-safe-area pointer-events-none absolute bottom-safe-bottom left-safe-x right-safe-x top-safe-top z-6 rounded-cell outline-1 outline-dashed outline-on-instrument/32" aria-hidden="true"><em className="absolute -top-2 left-2.5 bg-media-plate px-1 py-0.5 font-code type-mono-xs not-italic tracking-caps text-on-instrument/72">SAFE AREA</em></span>}
  </article>;
}

function InstagramPost({ slug, caption, media }: SocialPreviewProps) {
  return <article className={`unit-social-preview is-instagram-post ${FRAME} grid grid-rows-(--project-instagram-rows) bg-frame`} aria-label="instagram preview">
    <header className="flex items-center gap-2 px-3 py-2.25 [&>svg]:ml-auto [&>svg]:size-4.5"><span className={`${AVATAR} size-7.5`}>R</span><strong>@ralphy</strong><MoreHorizontal /></header>
    <Carousel media={media} />
    <Actions />
    <footer className="grid gap-0.75 px-2.75 pb-5 type-xs"><strong>18,412 likes</strong><p className="m-0 truncate"><b>@ralphy</b> {caption ?? slug}</p><small className="type-xs text-on-instrument-muted">8 minutes ago</small></footer>
  </article>;
}

function XPost({ slug, caption, media }: SocialPreviewProps) {
  return <article className={`unit-social-preview is-x-post ${FRAME} grid grid-rows-(--project-x-post-rows) bg-frame px-2.75`} aria-label="x preview">
    <header className="flex items-center"><strong>← Post</strong></header>
    <div className="unit-x-copy grid grid-cols-(--project-agent-row-columns) gap-2 [&>svg]:size-4"><span className={`${AVATAR} size-8.5`}>R</span><p className="m-0 grid type-sm"><strong>Ralphy</strong><small className="type-xs text-on-instrument-muted">@ralphy</small>{caption ?? slug}</p><MoreHorizontal /></div>
    <div className="unit-x-media mt-2.25 min-h-0 overflow-hidden rounded-cell"><Carousel media={media} /></div>
    <footer className="flex items-center justify-around text-on-instrument-muted [&_svg]:size-4" aria-hidden="true"><MessageCircle /><Repeat2 /><Heart /><Share2 /></footer>
  </article>;
}

function YouTubePlayer({ slug, media }: SocialPreviewProps) {
  return <article className={`unit-social-preview is-youtube-player ${FRAME} grid h-auto w-social-player grid-rows-(--project-player-rows) rounded-widget`} aria-label="youtube preview">
    <div className="unit-social-media relative aspect-video h-auto min-h-0 overflow-hidden [&>*]:size-full [&>*]:min-h-0"><FirstMedia media={media} /><Play className="unit-youtube-play absolute left-1/2 top-1/2 size-14.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-media-plate p-4.5" /></div>
    <footer className="grid grid-cols-(--project-row-columns) gap-1.25 p-2.5 [&_svg]:size-3"><strong className="col-span-full type-md">{slug}</strong><span className="flex items-center gap-1 font-code type-meta text-on-instrument-muted">Ralphy · 128K subscribers</span><span className="flex items-center gap-1 font-code type-meta text-on-instrument-muted"><ThumbsUp /> 12K　<Share2 /> Share</span></footer>
  </article>;
}

function CleanPreview({ media }: Pick<SocialPreviewProps, "media">) {
  return <article className={`unit-clean-preview ${FRAME}`} aria-label="Clean media preview"><FirstMedia media={media} /><span className="absolute bottom-2.5 right-2.5 rounded-control bg-media-plate px-1.75 py-1 font-code type-mono-md text-on-instrument">00:24</span></article>;
}

function GenericPreview({ media, slug }: SocialPreviewProps) {
  return <article className={`unit-social-preview is-generic ${FRAME} grid h-social-post-height w-social-post grid-rows-(--project-generic-rows) rounded-widget`} aria-label="generic preview"><FirstMedia media={media} /><footer className="p-3"><strong>{slug}</strong></footer></article>;
}

export function UnitSocialPreview({ target, ...props }: SocialPreviewProps & { target: SocialTarget }) {
  if (props.previewMode === "clean") return target.variant === "carousel" ? <article className={`unit-clean-preview ${FRAME}`} aria-label="Clean media preview"><Carousel media={props.media} /></article> : <CleanPreview media={props.media} />;
  if (target.platform === "instagram" && (target.variant === "carousel" || target.variant === "post")) return <InstagramPost {...props} />;
  if (target.platform === "x") return <XPost {...props} />;
  if (target.platform === "youtube" && target.variant === "video") return <YouTubePlayer {...props} />;
  if (target.platform === "tiktok" || target.platform === "instagram" || target.platform === "youtube") return <VerticalShell platform={target.platform} {...props} />;
  return <GenericPreview {...props} />;
}

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

import { AudioWaveform } from "../../components/media/AudioWaveform";
import { VideoPlayer } from "../../components/media/VideoPlayer";
import { type SocialTarget, type UnitMedia } from "../../lib/unit-previews";
import { DocumentContent } from "./DocumentsPanel";

export type SocialPreviewProps = {
  media: UnitMedia[];
  slug: string;
  caption?: string;
  previewMode?: "post" | "clean";
  guides?: boolean;
};

export function UnitMediaView({ item }: { item: UnitMedia }) {
  if ("text" in item.preview) return <DocumentContent format={item.preview.format} text={item.preview.text} />;
  if (item.kind === "image") return <img src={item.preview.url} alt={item.role} />;
  if (item.kind === "video") return <VideoPlayer src={item.preview.url} name={item.role} compact />;
  if (item.kind === "audio") return <AudioWaveform src={item.preview.url} name={item.role} sizeBytes={item.preview.sizeBytes} compact />;
  return <a href={item.preview.url}>Open {item.role}</a>;
}

function FirstMedia({ media }: Pick<SocialPreviewProps, "media">) {
  const item = media.find((candidate) => candidate.kind === "video") ?? media[0];
  return item ? <UnitMediaView item={item} /> : <div className="preview-empty">No media in this revision.</div>;
}

function Carousel({ media }: Pick<SocialPreviewProps, "media">) {
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [media]);
  const move = (delta: number) => setIndex((value) => (value + delta + media.length) % media.length);
  return <div className="unit-stage-carousel">
    <div className="unit-stage-slides" style={{ transform: `translateX(-${index * 100}%)` }}>
      {media.map((item) => <div key={item.id}><UnitMediaView item={item} /></div>)}
      {media.length === 0 && <div className="preview-empty">No media in this revision.</div>}
    </div>
    {media.length > 1 && <>
      <button type="button" aria-label="Previous slide" onClick={() => move(-1)}><ChevronLeft /></button>
      <button type="button" aria-label="Next slide" onClick={() => move(1)}><ChevronRight /></button>
      <span className="unit-stage-slide-count">{index + 1} / {media.length}</span>
      <span className="unit-stage-dots" aria-hidden="true">{media.map((item, itemIndex) => <i className={itemIndex === index ? "is-active" : ""} key={item.id} />)}</span>
    </>}
  </div>;
}

function Actions() {
  return <span className="unit-social-actions" aria-hidden="true"><Heart /><MessageCircle /><Send /><Bookmark /></span>;
}

function VerticalShell({ platform, slug, caption, media, guides }: SocialPreviewProps & { platform: string }) {
  const tiktok = platform === "tiktok";
  const reels = platform === "instagram";
  return <article className={`unit-social-preview is-vertical is-${platform}`} aria-label={`${platform} preview`}>
    <div className="unit-social-media"><FirstMedia media={media} /></div>
    <header className="unit-social-top">
      {tiktok ? <><span className="unit-social-top-tabs"><span>Following</span><strong>For You</strong></span><Search /></>
        : reels ? <><strong>Reels</strong><Camera /></>
          : <span className="unit-social-top-actions"><Search /><MoreVertical /></span>}
    </header>
    <aside className="unit-social-rail" aria-hidden="true">
      {tiktok || reels ? <span className="unit-social-avatar">R</span> : null}
      {tiktok ? <>
        <span className="unit-social-action"><Heart /><small>12.4K</small></span>
        <span className="unit-social-action"><MessageCircle /><small>214</small></span>
        <span className="unit-social-action"><Bookmark /><small>1 208</small></span>
        <span className="unit-social-action"><Send /><small>486</small></span>
      </> : reels ? <>
        <span className="unit-social-action"><Heart /><small>8 902</small></span>
        <span className="unit-social-action"><MessageCircle /><small>146</small></span>
        <span className="unit-social-action"><Send /><small>389</small></span>
        <span className="unit-social-action"><MoreVertical /></span>
      </> : <>
        <span className="unit-social-action"><ThumbsUp /><small>12K</small></span>
        <span className="unit-social-action"><ThumbsDown /><small>Dislike</small></span>
        <span className="unit-social-action"><MessageCircle /><small>214</small></span>
        <span className="unit-social-action"><Send /><small>Share</small></span>
        <span className="unit-social-action"><Shuffle /><small>Remix</small></span>
      </>}
    </aside>
    <footer>
      <span className="unit-social-profile"><span className="unit-social-handle">@ralphy</span>{reels && <b>Follow</b>}{!tiktok && !reels && <b>Subscribe</b>}</span>
      <p>{caption ?? slug}</p>
      {tiktok || reels ? <span className="unit-social-audio"><Music2 /> Original audio · Ralphy</span> : null}
    </footer>
    {!reels && <span className="unit-social-progress" aria-hidden="true"><i /></span>}
    {guides && <span className="unit-safe-area" aria-hidden="true"><em>SAFE AREA</em></span>}
  </article>;
}

function InstagramPost({ slug, caption, media }: SocialPreviewProps) {
  return <article className="unit-social-preview is-instagram-post" aria-label="instagram preview">
    <header><span className="unit-social-avatar">R</span><strong>@ralphy</strong><MoreHorizontal /></header>
    <Carousel media={media} />
    <Actions />
    <footer><strong>18,412 likes</strong><p><b>@ralphy</b> {caption ?? slug}</p><small>8 minutes ago</small></footer>
  </article>;
}

function XPost({ slug, caption, media }: SocialPreviewProps) {
  return <article className="unit-social-preview is-x-post" aria-label="x preview">
    <header><strong>← Post</strong></header>
    <div className="unit-x-copy"><span className="unit-social-avatar">R</span><p><strong>Ralphy</strong><small>@ralphy</small>{caption ?? slug}</p><MoreHorizontal /></div>
    <div className="unit-x-media"><Carousel media={media} /></div>
    <footer aria-hidden="true"><MessageCircle /><Repeat2 /><Heart /><Share2 /></footer>
  </article>;
}

function YouTubePlayer({ slug, media }: SocialPreviewProps) {
  return <article className="unit-social-preview is-youtube-player" aria-label="youtube preview">
    <div className="unit-social-media"><FirstMedia media={media} /><Play className="unit-youtube-play" /></div>
    <footer><strong>{slug}</strong><span>Ralphy · 128K subscribers</span><span><ThumbsUp /> 12K　<Share2 /> Share</span></footer>
  </article>;
}

function CleanPreview({ media }: Pick<SocialPreviewProps, "media">) {
  return <article className="unit-clean-preview" aria-label="Clean media preview"><FirstMedia media={media} /><span>00:24</span></article>;
}

function GenericPreview({ media, slug }: SocialPreviewProps) {
  return <article className="unit-social-preview is-generic" aria-label="generic preview"><FirstMedia media={media} /><footer><strong>{slug}</strong></footer></article>;
}

export function UnitSocialPreview({ target, ...props }: SocialPreviewProps & { target: SocialTarget }) {
  if (props.previewMode === "clean") return target.variant === "carousel" ? <article className="unit-clean-preview" aria-label="Clean media preview"><Carousel media={props.media} /></article> : <CleanPreview media={props.media} />;
  if (target.platform === "instagram" && (target.variant === "carousel" || target.variant === "post")) return <InstagramPost {...props} />;
  if (target.platform === "x") return <XPost {...props} />;
  if (target.platform === "youtube" && target.variant === "video") return <YouTubePlayer {...props} />;
  if (target.platform === "tiktok" || target.platform === "instagram" || target.platform === "youtube") return <VerticalShell platform={target.platform} {...props} />;
  return <GenericPreview {...props} />;
}

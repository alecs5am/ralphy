"use client";

// MediaPlayer — uniform shell for images + videos in the library lightbox
// and the remix-hero. Adapted from the reference shadcn/Tailwind player
// (provided by the user) to the landing's CSS stack: framer-motion stays,
// shadcn Button + lucide-react replaced with native button + inline SVGs,
// Tailwind classes replaced with the `.mp-*` rules in globals.css.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";

interface BaseProps {
  src: string;
  alt?: string;
  className?: string;
  /** If set, the player is rendered at this fixed aspect-ratio (CSS form
   *  "W / H"). Otherwise the media's natural size drives the layout. */
  aspect?: string;
  poster?: string;
  /** Auto-play the video on mount. Useful for the remix-hero, where we
   *  want the clip running by default (muted). */
  autoPlay?: boolean;
  /** Start muted. Required for autoplay in most browsers. */
  defaultMuted?: boolean;
}

interface VideoProps extends BaseProps { kind: "video" }
interface ImageProps extends BaseProps { kind: "image" }
export type MediaPlayerProps = VideoProps | ImageProps;

const SPEEDS = [0.5, 1, 1.5, 2] as const;

function formatTime(sec: number): string {
  if (!isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function Slider({
  value,
  onChange,
  className = "",
}: { value: number; onChange: (v: number) => void; className?: string }) {
  return (
    <div
      className={`mp-slider ${className}`}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const pct = ((e.clientX - rect.left) / rect.width) * 100;
        onChange(Math.min(Math.max(pct, 0), 100));
      }}
      role="slider"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
    >
      <motion.div
        className="mp-slider-fill"
        style={{ width: `${value}%` }}
        animate={{ width: `${value}%` }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      />
    </div>
  );
}

export function MediaPlayer(props: MediaPlayerProps) {
  const [expanded, setExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Portal target only after mount (SSR safe).
  useEffect(() => { setMounted(true); }, []);

  // Body scroll-lock + Esc-to-close + `mp-modal-open` class. The class lets
  // CSS hide other fixed/sticky elements (nav) which sit in their own
  // stacking contexts and would otherwise leak through the overlay.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("mp-modal-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      document.body.classList.remove("mp-modal-open");
    };
  }, [expanded]);

  const inline = props.kind === "image"
    ? <ImagePlayer {...props} onExpand={() => setExpanded(true)} />
    : <VideoPlayer {...props} onExpand={() => setExpanded(true)} />;

  // Render the fullscreen overlay through a portal to document.body so it
  // escapes any transformed / filtered ancestor (framer-motion wraps its
  // animated elements with `transform`, which would otherwise re-root
  // `position: fixed` and let page content bleed through).
  const overlay = (
    <AnimatePresence>
      {expanded && (
        <motion.div
          className="mp-fullscreen"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          onClick={() => setExpanded(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Fullscreen media"
        >
          <button
            type="button"
            className="mp-fullscreen-close"
            onClick={() => setExpanded(false)}
            aria-label="Close fullscreen"
          >
            <CloseIcon />
          </button>
          <div
            className="mp-fullscreen-stage"
            onClick={(e) => e.stopPropagation()}
          >
            {props.kind === "image"
              ? <ImagePlayer {...props} variant="fullscreen" />
              : <VideoPlayer {...props} variant="fullscreen" autoPlay defaultMuted={false} />}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      {inline}
      {mounted ? createPortal(overlay, document.body) : null}
    </>
  );
}

type InlineProps = { onExpand?: () => void; variant?: "inline" | "fullscreen" };

function ImagePlayer({ src, alt, className, aspect, onExpand, variant = "inline" }: ImageProps & InlineProps) {
  const isFs = variant === "fullscreen";
  const clickable = !isFs && !!onExpand;
  return (
    <motion.div
      className={`mp-shell mp-shell-image ${clickable ? "mp-shell-clickable" : ""} ${isFs ? "mp-shell-fs" : ""} ${className ?? ""}`}
      style={!isFs && aspect ? { aspectRatio: aspect } : undefined}
      onClick={clickable ? onExpand : undefined}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onExpand?.(); } } : undefined}
      aria-label={clickable ? `Expand ${alt ?? "image"} to fullscreen` : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt ?? ""} className="mp-image" />
      {onExpand && !isFs && (
        <span className="mp-expand mp-expand-static" aria-hidden>
          <ExpandIcon />
        </span>
      )}
    </motion.div>
  );
}

function VideoPlayer({ src, alt, className, aspect, poster, autoPlay = false, defaultMuted = true, onExpand, variant = "inline" }: VideoProps & InlineProps) {
  const isFs = variant === "fullscreen";
  const videoRef = useRef<HTMLVideoElement>(null);

  // Native fullscreen API path. Reuses the existing <video> element +
  // its already-buffered frames (no reload, no flash). Falls back to the
  // parent's custom modal when the API isn't available (older Safari,
  // etc.). iOS Safari uses `webkitEnterFullscreen` on the video itself.
  const enterFullscreen = () => {
    const v = videoRef.current;
    if (!v) return;
    type FsVideo = HTMLVideoElement & {
      webkitEnterFullscreen?: () => void;
      webkitSupportsFullscreen?: boolean;
    };
    const fv = v as FsVideo;
    if (v.requestFullscreen) {
      void v.requestFullscreen().catch(() => onExpand?.());
      return;
    }
    if (fv.webkitEnterFullscreen) {
      fv.webkitEnterFullscreen();
      return;
    }
    onExpand?.();
  };
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [volume, setVolume] = useState(defaultMuted ? 0 : 1);
  const [progress, setProgress] = useState(0);
  const [isMuted, setIsMuted] = useState(defaultMuted);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showControls, setShowControls] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => { /* swallow */ });
    else v.pause();
  };

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onVol = () => { setVolume(v.muted ? 0 : v.volume); setIsMuted(v.muted); };
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("volumechange", onVol);
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("volumechange", onVol);
    };
  }, []);

  const handleVolumeChange = (value: number) => {
    const v = videoRef.current;
    if (!v) return;
    const newVolume = value / 100;
    v.volume = newVolume;
    v.muted = newVolume === 0;
  };

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    setProgress((v.currentTime / v.duration) * 100);
    setCurrentTime(v.currentTime);
    setDuration(v.duration);
  };

  const handleSeek = (value: number) => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    const time = (value / 100) * v.duration;
    if (isFinite(time)) {
      v.currentTime = time;
      setProgress(value);
    }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.muted) {
      v.muted = false;
      if (v.volume === 0) v.volume = 1;
    } else {
      v.muted = true;
    }
  };

  const setSpeed = (speed: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = speed;
    setPlaybackSpeed(speed);
  };

  return (
    <motion.div
      className={`mp-shell mp-shell-video ${isFs ? "mp-shell-fs" : ""} ${className ?? ""}`}
      style={!isFs && aspect ? { aspectRatio: aspect } : undefined}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
      onTouchStart={() => setShowControls(true)}
    >
      <video
        ref={videoRef}
        className="mp-video"
        onTimeUpdate={handleTimeUpdate}
        onClick={togglePlay}
        src={src}
        poster={poster}
        autoPlay={autoPlay}
        muted={defaultMuted}
        loop
        playsInline
        aria-label={alt}
      />

      <AnimatePresence>
        {showControls && (
          <motion.div
            className="mp-controls"
            initial={{ y: 16, opacity: 0, filter: "blur(8px)" }}
            animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
            exit={{ y: 16, opacity: 0, filter: "blur(8px)" }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mp-row mp-row-progress">
              <span className="mp-time">{formatTime(currentTime)}</span>
              <Slider value={progress} onChange={handleSeek} className="mp-progress" />
              <span className="mp-time">{formatTime(duration)}</span>
            </div>

            <div className="mp-row mp-row-bottom">
              <div className="mp-group">
                <motion.button
                  type="button"
                  className="mp-btn"
                  onClick={togglePlay}
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.92 }}
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? <PauseIcon /> : <PlayIcon />}
                </motion.button>
                <motion.button
                  type="button"
                  className="mp-btn"
                  onClick={toggleMute}
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.92 }}
                  aria-label={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted ? <VolumeXIcon /> : volume > 0.5 ? <Volume2Icon /> : <Volume1Icon />}
                </motion.button>
                <div className="mp-vol-slider">
                  <Slider value={volume * 100} onChange={handleVolumeChange} />
                </div>
              </div>

              <div className="mp-group mp-right">
                <div className="mp-speeds">
                  {SPEEDS.map((speed) => (
                    <motion.button
                      type="button"
                      key={speed}
                      className={`mp-speed ${playbackSpeed === speed ? "is-active" : ""}`}
                      onClick={() => setSpeed(speed)}
                      whileHover={{ scale: 1.08 }}
                      whileTap={{ scale: 0.92 }}
                    >
                      {speed}x
                    </motion.button>
                  ))}
                </div>
                {!isFs && (
                  <motion.button
                    type="button"
                    className="mp-btn"
                    onClick={(e) => { e.stopPropagation(); enterFullscreen(); }}
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.92 }}
                    aria-label="Expand to fullscreen"
                  >
                    <ExpandIcon />
                  </motion.button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ─── inline icons (replace lucide-react) ─────────────────────────────── */

function PlayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M5 3.5L14 9L5 14.5V3.5Z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect x="4.5" y="3.5" width="3" height="11" rx="1" fill="currentColor" />
      <rect x="10.5" y="3.5" width="3" height="11" rx="1" fill="currentColor" />
    </svg>
  );
}

function VolumeXIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M3 7v4h2.5L9 14V4L5.5 7H3Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M12 7l4 4M16 7l-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function Volume1Icon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M3 7v4h2.5L9 14V4L5.5 7H3Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M11.5 6.5C12.5 7.4 12.5 10.6 11.5 11.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function Volume2Icon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M3 7v4h2.5L9 14V4L5.5 7H3Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M11.5 6.5C12.5 7.4 12.5 10.6 11.5 11.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M13.5 4.5C15.2 6.2 15.2 11.8 13.5 13.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 6V3H6M13 6V3H10M3 10V13H6M13 10V13H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <line x1="3" y1="3" x2="15" y2="15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="15" y1="3" x2="3" y2="15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

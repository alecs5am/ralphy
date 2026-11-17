"""What Ralphy knows about each platform without opening a browser: URLs, caption limits, media limits.

The media limits are the web-upload limits as the platforms' help pages state them in 2026 and are
approximate; a video Ralphy produces (vertical, under a minute) is far inside all of them. When a
platform rejects an upload that passed these checks, tighten the numbers here.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import urlparse

from ..errors import RalphyError

GB = 1_000_000_000
MB = 1_000_000


@dataclass(frozen=True)
class Limits:
    min_duration: float  # seconds
    max_duration: float
    max_bytes: int
    min_aspect: float  # width / height, after rotation
    max_aspect: float


@dataclass(frozen=True)
class Platform:
    name: str
    label: str
    home: str
    login_url: str
    profile_template: str  # `{handle}` is the bare handle, without `@`
    caption_limit: int
    limits: Limits
    hosts: tuple[str, ...]  # hosts a post URL of this platform lives on
    scripted_upload: bool
    title_limit: int | None = None  # YouTube: the first caption line is the title

    def profile_url(self, handle: str | None) -> str:
        bare = bare_handle(handle)
        return self.profile_template.format(handle=bare) if bare else self.home

    def owns_url(self, url: str) -> bool:
        host = (urlparse(url).hostname or "").lower()
        return any(host == h or host.endswith("." + h) for h in self.hosts)


PLATFORMS: dict[str, Platform] = {
    "tiktok": Platform(
        name="tiktok",
        label="TikTok",
        home="https://www.tiktok.com/",
        login_url="https://www.tiktok.com/login",
        profile_template="https://www.tiktok.com/@{handle}",
        caption_limit=2200,
        limits=Limits(min_duration=1, max_duration=3600, max_bytes=10 * GB, min_aspect=0.5, max_aspect=16 / 9 + 0.01),
        hosts=("tiktok.com",),
        scripted_upload=True,
    ),
    "instagram": Platform(
        name="instagram",
        label="Instagram",
        home="https://www.instagram.com/",
        login_url="https://www.instagram.com/accounts/login/",
        profile_template="https://www.instagram.com/{handle}/",
        caption_limit=2200,
        limits=Limits(min_duration=3, max_duration=900, max_bytes=4 * GB, min_aspect=0.5, max_aspect=1.92),
        hosts=("instagram.com",),
        scripted_upload=True,
    ),
    "youtube": Platform(
        name="youtube",
        label="YouTube Shorts",
        home="https://studio.youtube.com/",
        login_url="https://accounts.google.com/ServiceLogin?service=youtube&continue=https://studio.youtube.com/",
        profile_template="https://www.youtube.com/@{handle}/shorts",
        caption_limit=5000,
        title_limit=100,
        # A Short is at most 3 minutes and square or vertical; anything else uploads as a regular video.
        limits=Limits(min_duration=1, max_duration=180, max_bytes=256 * GB, min_aspect=0.3, max_aspect=1.0),
        hosts=("youtube.com", "youtu.be"),
        scripted_upload=True,
    ),
    "x": Platform(
        name="x",
        label="X",
        home="https://x.com/home",
        login_url="https://x.com/i/flow/login",
        profile_template="https://x.com/{handle}",
        caption_limit=280,
        limits=Limits(min_duration=0.5, max_duration=140, max_bytes=512 * MB, min_aspect=1 / 3, max_aspect=3.0),
        hosts=("x.com", "twitter.com"),
        scripted_upload=False,
    ),
}
NAMES = tuple(PLATFORMS)

_HANDLE = re.compile(r"^@?([A-Za-z0-9._-]{1,64})$")


def get(name: str) -> Platform:
    key = (name or "").strip().lower()
    if key not in PLATFORMS:
        raise RalphyError("E_PLATFORM_UNKNOWN", f"Unknown platform '{name}'", f"Platforms: {', '.join(NAMES)}.")
    return PLATFORMS[key]


def normalize_handle(handle: str | None) -> str | None:
    """`ui.effects` or `@ui.effects` -> `@ui.effects`; empty -> None."""
    if handle is None or not str(handle).strip():
        return None
    match = _HANDLE.match(str(handle).strip())
    if not match:
        raise RalphyError("E_BAD_HANDLE", f"'{handle}' is not a handle",
                          "Handles are letters, digits, dots, dashes and underscores, e.g. @ui.effects.")
    return "@" + match.group(1)


def bare_handle(handle: str | None) -> str:
    return str(handle or "").strip().lstrip("@")


def same_handle(a: str | None, b: str | None) -> bool:
    return bare_handle(a).lower() == bare_handle(b).lower()


_POST_ID = {
    "instagram": re.compile(r"/(?:reel|reels|p)/([A-Za-z0-9_-]+)"),
    "youtube": re.compile(r"(?:youtu\.be/|shorts/|v=)([A-Za-z0-9_-]{6,})"),
    "tiktok": re.compile(r"/video/(\d+)"),
}


def post_id(platform: str, url: str | None) -> str | None:
    """The platform's own id in a post URL: the Instagram code, the YouTube video id, the TikTok video id."""
    pattern = _POST_ID.get(platform)
    match = pattern.search(url or "") if pattern else None
    return match.group(1) if match else None

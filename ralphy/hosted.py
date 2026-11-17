"""Read the hosted trend base and library over HTTPS, with a cache under the cache dir.

A cached copy younger than the TTL is served without a request. An older one is refreshed; when the host
is unreachable the cached copy is served with `stale: true` and a warning. With no cached copy an
unreachable host is an error. Cache entries remember their URL, so switching hosts never serves the
wrong data.
"""

from __future__ import annotations

import hashlib
import json
import time
import urllib.error
import urllib.request
from pathlib import Path

from . import __version__, files
from .errors import RalphyError

TTL_SECONDS = 6 * 3600
TIMEOUT_SECONDS = 20


class NotFound(Exception):
    pass


class Unreachable(Exception):
    pass


def _request(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": f"ralphy/{__version__}"})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            return response.read()
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            raise NotFound(url) from exc
        raise Unreachable(f"HTTP {exc.code} from {url}") from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        reason = getattr(exc, "reason", exc)
        raise Unreachable(f"{url}: {reason}") from exc


def fetch_json(url: str, cache_file: Path, *, refresh: bool = False, ttl: int = TTL_SECONDS,
               unreachable_code: str = "E_HOST_UNREACHABLE", not_found: RalphyError | None = None) -> tuple[dict, dict]:
    """Return `(data, meta)`; meta has `source` (`network` or `cache`), `fetched_at`, `stale`, `warning`."""
    cached = _read_cache(cache_file, url)
    if cached and not refresh and time.time() - cached["fetched"] < ttl:
        return cached["data"], _meta("cache", cached, stale=False)
    try:
        body = _request(url)
        data = json.loads(body)
    except NotFound:
        if not_found is not None:
            raise not_found from None
        raise RalphyError("E_NOT_FOUND", f"{url} does not exist") from None
    except (Unreachable, ValueError) as exc:
        problem = f"invalid JSON from {url}" if isinstance(exc, ValueError) else str(exc)
        if cached:
            meta = _meta("cache", cached, stale=True)
            meta["warning"] = f"{problem}; serving the cached copy from {meta['fetched_at']}"
            return cached["data"], meta
        raise RalphyError(unreachable_code, f"Cannot reach the hosted data: {problem}",
                          "Check the network (or the RALPHY_*_URL override) and retry; nothing is cached yet.",
                          ) from None
    if not isinstance(data, dict):
        raise RalphyError("E_BAD_RESPONSE", f"{url} did not return a JSON object")
    entry = {"url": url, "fetched": time.time(), "fetched_at": files.utc_now(), "data": data}
    cache_file.parent.mkdir(parents=True, exist_ok=True)
    files.atomic_write_text(cache_file, json.dumps(entry, ensure_ascii=False))
    return data, _meta("network", entry, stale=False)


def _read_cache(cache_file: Path, url: str) -> dict | None:
    try:
        entry = json.loads(cache_file.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(entry, dict) or entry.get("url") != url or not isinstance(entry.get("data"), dict):
        return None
    return entry


def _meta(source: str, entry: dict, *, stale: bool) -> dict:
    return {"source": source, "url": entry["url"], "fetched_at": entry.get("fetched_at"), "stale": stale}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(url: str, target: Path, expected_sha256: str | None = None) -> str:
    """Download `url` to `target`. Returns `cache` (a cached file with the expected hash), `network`, or `stale`
    (unreachable host, an earlier download is kept). Raises `NotFound` and `Unreachable` for the caller to map.
    """
    expected = expected_sha256.lower() if expected_sha256 else None
    if target.is_file() and expected and sha256(target) == expected:
        return "cache"
    try:
        body = _request(url)
    except Unreachable:
        if target.is_file():
            return "stale"
        raise
    if expected and hashlib.sha256(body).hexdigest() != expected:
        raise RalphyError("E_CHECKSUM", f"{url} does not match its sha256",
                          "Retry later; the library may be mid-update.")
    target.parent.mkdir(parents=True, exist_ok=True)
    files.atomic_write_bytes(target, body)
    return "network"

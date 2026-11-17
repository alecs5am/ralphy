"""The only writes the panel makes: approve or cancel a planned post.

They reuse the verbs' own code (`ralphy.post.posts.approve|cancel`), so the panel follows the same rules.
Everything else in the panel (render, save, restore, plan) is a command the person copies to their agent.
"""

from __future__ import annotations

from pathlib import Path

from .. import paths
from ..errors import RalphyError


def change_post(home: Path, post_id: str, action: str) -> dict:
    """`ralphy post approve <id>` (planned only) or `ralphy post cancel <id>`, through the same functions.

    The post verbs read `RALPHY_HOME`; the panel serves that same home, so `home` only guards the case
    where the two differ.
    """
    from ..post import posts

    if Path(home).resolve() != paths.home().resolve():
        raise RalphyError("E_USAGE", f"The panel serves {home}, but RALPHY_HOME is {paths.home()}",
                          "Start the panel without overriding its home.")
    if action not in ("approve", "cancel"):
        raise RalphyError("E_USAGE", f"Unknown post action '{action}'", "Use approve or cancel.")
    _account, row = posts.find(post_id)
    previous = row.get("status") or ""
    if action == "cancel":
        return {"post": posts.cancel(post_id)["post"], "previous": previous}
    if previous != "planned":
        raise posts.StateError(row["id"], previous, ("planned",))
    return {"post": posts.approve([post_id])["approved"][0], "previous": previous}

"""The one error type every verb raises; `cli` maps it to the JSON error shape and exit code 1."""

from __future__ import annotations


class RalphyError(Exception):
    """A user-facing failure with a stable `E_...` code, a message and an optional hint."""

    def __init__(self, code: str, message: str, hint: str | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.hint = hint

    def to_dict(self) -> dict:
        return {"code": self.code, "message": self.message, "hint": self.hint or ""}

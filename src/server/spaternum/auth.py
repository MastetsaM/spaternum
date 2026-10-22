"""API token check for every /api route."""

import secrets

from fastapi import Header, HTTPException, Request


def require_token(request: Request, authorization: str = Header("")) -> None:
    expected = f"Bearer {request.app.state.settings.api_token}"
    if not secrets.compare_digest(authorization.encode(), expected.encode()):
        raise HTTPException(401, "bad or missing token")

import time
from typing import Annotated
from uuid import uuid4

import bcrypt
import jwt
from fastapi import APIRouter, Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from backend.db import Database
from backend.errors import ApiError
from backend.models import CurrentUserResponse, Login, Registration, Session

router = APIRouter(prefix="/api/auth", tags=["Authentication"])
bearer = HTTPBearer(auto_error=False)
dummy_hash = bcrypt.hashpw(b"not-a-real-user-password", bcrypt.gensalt(rounds=12))


def current_user(
    request: Request,
    db: Database,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> dict:
    message = "Session expired or invalid. Please sign in again."
    if credentials is None:
        raise ApiError(401, "UNAUTHORIZED", "Please sign in to continue.")
    try:
        payload = jwt.decode(
            credentials.credentials,
            request.app.state.settings.jwt_secret,
            algorithms=["HS256"],
            issuer="forecourt",
            audience="forecourt-web",
            options={"require": ["sub", "exp", "iss", "aud"]},
        )
    except jwt.InvalidTokenError as exc:
        raise ApiError(401, "UNAUTHORIZED", message) from exc
    # Permissions are read on every request, so role demotion invalidates admin access immediately.
    user = db.execute(
        "SELECT id, name, email, role FROM users WHERE id = ?", (payload["sub"],)
    ).fetchone()
    if user is None:
        raise ApiError(401, "UNAUTHORIZED", message)
    return dict(user)


AuthenticatedUser = Annotated[dict, Depends(current_user)]


def require_admin(user: AuthenticatedUser) -> dict:
    if user["role"] != "admin":
        raise ApiError(403, "FORBIDDEN", "Administrator access is required.")
    return user


AdminUser = Annotated[dict, Depends(require_admin)]


def issue_session(user: dict, secret: str) -> dict:
    now = int(time.time())
    token = jwt.encode(
        {
            "sub": user["id"],
            "iss": "forecourt",
            "aud": "forecourt-web",
            "iat": now,
            "exp": now + 7200,
        },
        secret,
        algorithm="HS256",
    )
    return {"token": token, "user": user}


@router.post("/register", status_code=201, response_model=Session)
def register(data: Registration, request: Request, db: Database):
    password_hash = bcrypt.hashpw(data.password.encode(), bcrypt.gensalt(rounds=12)).decode()
    user = {"id": str(uuid4()), "name": data.name, "email": data.email, "role": "user"}
    result = db.execute(
        "INSERT OR IGNORE INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)",
        (user["id"], user["name"], user["email"], password_hash),
    )
    if not result.rowcount:
        raise ApiError(409, "EMAIL_EXISTS", "An account with this email already exists.")
    return issue_session(user, request.app.state.settings.jwt_secret)


@router.post("/login", response_model=Session)
def login(data: Login, request: Request, db: Database):
    row = db.execute(
        "SELECT id, name, email, role, password_hash FROM users WHERE email = ?", (data.email,)
    ).fetchone()
    stored = row["password_hash"].encode() if row else dummy_hash
    try:
        matches = bcrypt.checkpw(data.password.encode(), stored)
    except ValueError:
        matches = False
    if row is None or not matches:
        raise ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.")
    user = {key: row[key] for key in ("id", "name", "email", "role")}
    return issue_session(user, request.app.state.settings.jwt_secret)


@router.get("/me", response_model=CurrentUserResponse)
def me(user: AuthenticatedUser):
    return {"user": user}

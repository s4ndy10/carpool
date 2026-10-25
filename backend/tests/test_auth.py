from time import time

import bcrypt
import jwt
import pytest
from conftest import SECRET
from fastapi.testclient import TestClient

from backend.app import create_app
from backend.config import Settings

ACCOUNT = {"name": "Alex Morgan", "email": "alex@example.com", "password": "A-secure-password-42"}


def test_registration_normalizes_email_hashes_password_and_issues_token(client, db):
    response = client.post("/api/auth/register", json={**ACCOUNT, "email": " ALEX@Example.com "})
    assert response.status_code == 201, response.text
    body = response.json()
    assert set(body) == {"user", "token"}
    assert set(body["user"]) == {"id", "name", "email", "role"}
    assert body["user"] == {
        "id": body["user"]["id"],
        "name": ACCOUNT["name"],
        "email": ACCOUNT["email"],
        "role": "user",
    }
    payload = jwt.decode(
        body["token"],
        SECRET,
        algorithms=["HS256"],
        issuer="forecourt",
        audience="forecourt-web",
        options={"require": ["exp", "sub", "iss", "aud"]},
    )
    assert payload["sub"] == body["user"]["id"]
    password_hash = db.execute(
        "SELECT password_hash FROM users WHERE email = ?", (ACCOUNT["email"],)
    ).fetchone()["password_hash"]
    assert password_hash.startswith(("$2a$12$", "$2b$12$", "$2y$12$"))
    assert bcrypt.checkpw(ACCOUNT["password"].encode(), password_hash.encode())


def test_registration_rejects_role_escalation(client, db):
    response = client.post("/api/auth/register", json={**ACCOUNT, "role": "admin"})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert db.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0


def test_duplicate_email_is_case_insensitive(client):
    assert client.post("/api/auth/register", json=ACCOUNT).status_code == 201
    response = client.post("/api/auth/register", json={**ACCOUNT, "email": "ALEX@example.com"})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "EMAIL_EXISTS"


@pytest.mark.parametrize(
    "invalid",
    [
        {"name": "A"},
        {"name": "   "},
        {"email": "not-an-email"},
        {"password": "short"},
        {"password": "x" * 73},
        {"password": "\U0001f6fb" * 20},
        {"name": True},
        {"email": False},
        {"password": 123456789012},
    ],
)
def test_registration_validates_fields(client, invalid):
    response = client.post("/api/auth/register", json={**ACCOUNT, **invalid})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_login_and_me_return_same_public_user(client):
    assert client.post("/api/auth/register", json=ACCOUNT).status_code == 201
    response = client.post(
        "/api/auth/login", json={"email": "ALEX@example.com", "password": ACCOUNT["password"]}
    )
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body["token"], str)
    assert set(body["user"]) == {"id", "name", "email", "role"}
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {body['token']}"})
    assert me.status_code == 200
    assert me.json() == {"user": body["user"]}


def test_login_does_not_reveal_account_existence(client):
    client.post("/api/auth/register", json=ACCOUNT)
    wrong = client.post(
        "/api/auth/login", json={"email": ACCOUNT["email"], "password": "incorrect-password"}
    )
    missing = client.post(
        "/api/auth/login", json={"email": "nobody@example.com", "password": "incorrect-password"}
    )
    assert wrong.status_code == missing.status_code == 401
    assert wrong.json() == missing.json()


@pytest.mark.parametrize(
    "kind",
    [
        "empty",
        "malformed",
        "signature",
        "expired",
        "issuer",
        "audience",
        "algorithm",
        "missing-exp",
        "missing-sub",
        "missing-iss",
        "missing-aud",
    ],
)
def test_invalid_tokens_are_rejected(client, identities, kind):
    claims = {
        "sub": identities["user"]["id"],
        "iss": "forecourt",
        "aud": "forecourt-web",
        "exp": int(time()) + 3600,
    }
    key, algorithm = SECRET, "HS256"
    if kind == "signature":
        key = "wrong-signing-secret-that-is-at-least-32-characters"
    elif kind == "expired":
        claims["exp"] = int(time()) - 60
    elif kind == "issuer":
        claims["iss"] = "someone-else"
    elif kind == "audience":
        claims["aud"] = "another-client"
    elif kind == "algorithm":
        algorithm = "HS384"
    elif kind.startswith("missing-"):
        del claims[kind.removeprefix("missing-")]
    token = jwt.encode(claims, key, algorithm=algorithm)
    if kind in ("empty", "malformed"):
        token = "" if kind == "empty" else "not-a-token"
    assert (
        client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401
    )


def test_deleted_user_invalidates_token(client, db, identities, member):
    db.execute("DELETE FROM users WHERE id = ?", (identities["user"]["id"],))
    assert client.get("/api/auth/me", headers=member).status_code == 401


def test_limiter_is_per_app_and_counts_invalid_attempts(settings):
    limited = Settings(jwt_secret=SECRET, database_path=settings.database_path, auth_rate_limit=2)
    with TestClient(create_app(limited)) as client:
        for _ in range(2):
            assert client.post("/api/auth/login", json={}).status_code == 400
        response = client.post("/api/auth/login", json={})
        assert response.status_code == 429
        assert response.json()["error"]["code"] == "RATE_LIMITED"
    with TestClient(create_app(limited)) as independent:
        assert independent.post("/api/auth/login", json={}).status_code == 400


def test_malformed_json_and_unknown_api_routes(client):
    response = client.post(
        "/api/auth/login", content="{", headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_JSON"
    response = client.get("/api/does-not-exist")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"

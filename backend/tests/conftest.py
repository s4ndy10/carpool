from contextlib import closing
from time import time
from uuid import uuid4

import jwt
import pytest
from fastapi.testclient import TestClient

from backend.app import create_app
from backend.config import Settings
from backend.db import open_database

SECRET = "test-only-jwt-secret-that-is-at-least-32-characters"
VEHICLE = {
    "make": "Porsche",
    "model": "911 Carrera",
    "category": "Coupe",
    "price": 114400.29,
    "quantity": 3,
}


@pytest.fixture
def settings(tmp_path):
    return Settings(jwt_secret=SECRET, database_path=str(tmp_path / "test.db"))


@pytest.fixture
def app(settings):
    return create_app(settings)


@pytest.fixture
def client(app):
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def db(app, settings):
    with closing(open_database(settings.database_path)) as connection:
        yield connection


@pytest.fixture
def identities(db):
    users = {}
    for role in ("user", "admin"):
        user_id = str(uuid4())
        db.execute(
            "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)",
            (user_id, "Test User", f"{role}@example.com", "unused-test-hash", role),
        )
        token = jwt.encode(
            {"sub": user_id, "iss": "forecourt", "aud": "forecourt-web", "exp": int(time()) + 3600},
            SECRET,
            algorithm="HS256",
        )
        users[role] = {
            "id": user_id,
            "token": token,
            "headers": {"Authorization": f"Bearer {token}"},
        }
    return users


@pytest.fixture
def member(identities):
    return identities["user"]["headers"]


@pytest.fixture
def admin(identities):
    return identities["admin"]["headers"]


@pytest.fixture
def add_vehicle(client, admin):
    def add(**overrides):
        response = client.post("/api/vehicles", headers=admin, json={**VEHICLE, **overrides})
        assert response.status_code == 201, response.text
        return response.json()["vehicle"]

    return add

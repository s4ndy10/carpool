from contextlib import closing
from uuid import uuid4

import bcrypt
import pytest
from conftest import SECRET

from backend.config import Settings
from backend.db import open_database
from backend.seed import seed_database


@pytest.fixture
def clean_env(monkeypatch):
    for key in ("JWT_SECRET", "DATABASE_PATH", "PORT", "AUTH_RATE_LIMIT", "CLIENT_DIRECTORY"):
        monkeypatch.delenv(key, raising=False)
    return monkeypatch


@pytest.mark.parametrize(
    "secret", [None, "short", "replace-with-a-random-secret-at-least-32-characters"]
)
def test_environment_rejects_missing_weak_or_placeholder_secrets(clean_env, secret):
    if secret is not None:
        clean_env.setenv("JWT_SECRET", secret)
    with pytest.raises(ValueError, match="JWT_SECRET"):
        Settings.from_env()


@pytest.mark.parametrize(
    "secret", ["", "short", "replace-with-a-random-secret-at-least-32-characters"]
)
def test_constructor_validates_secrets(tmp_path, secret):
    with pytest.raises(ValueError, match="JWT_SECRET"):
        Settings(jwt_secret=secret, database_path=str(tmp_path / "test.db"))


def test_environment_defaults_and_overrides(clean_env):
    clean_env.setenv("JWT_SECRET", SECRET)
    settings = Settings.from_env()
    assert settings.jwt_secret == SECRET
    assert settings.port == 3001
    assert settings.database_path == "./data/forecourt.db"
    assert settings.auth_rate_limit == 20
    clean_env.setenv("PORT", "4000")
    clean_env.setenv("DATABASE_PATH", "./custom.db")
    settings = Settings.from_env()
    assert settings.port == 4000
    assert settings.database_path == "./custom.db"


@pytest.mark.parametrize("port", ["0", "65536", "3001abc", "1.2", ""])
def test_environment_rejects_invalid_ports(clean_env, port):
    clean_env.setenv("JWT_SECRET", SECRET)
    clean_env.setenv("PORT", port)
    with pytest.raises(ValueError, match="PORT"):
        Settings.from_env()


@pytest.mark.parametrize("port", [0, 65536, 1.2, True])
def test_constructor_rejects_invalid_ports(tmp_path, port):
    with pytest.raises(ValueError, match="PORT"):
        Settings(jwt_secret=SECRET, database_path=str(tmp_path / "test.db"), port=port)


@pytest.mark.parametrize("path", [":memory:", "", "   "])
def test_settings_require_persistent_database_path(path):
    with pytest.raises(ValueError, match="file-backed"):
        Settings(jwt_secret=SECRET, database_path=path)


def test_database_rejects_memory_storage():
    with pytest.raises(ValueError, match="file-backed"):
        open_database(":memory:")


def test_seed_initializes_schema_and_is_idempotent(tmp_path):
    path = str(tmp_path / "seed.db")
    seed_database(path, "ADMIN@example.com", "original-admin-password")
    with closing(open_database(path)) as db:
        admin = db.execute("SELECT * FROM users").fetchone()
        assert admin["role"] == "admin"
        assert admin["email"] == "admin@example.com"
        assert bcrypt.checkpw(b"original-admin-password", admin["password_hash"].encode())
        count = db.execute("SELECT COUNT(*) FROM vehicles").fetchone()[0]
        assert count == 13
        assert {row[0] for row in db.execute("SELECT DISTINCT category FROM vehicles")} == {
            "Sedan",
            "SUV",
            "Coupe",
            "Hatchback",
            "Truck",
            "Wagon",
            "Convertible",
        }
        assert db.execute("SELECT COUNT(*) FROM vehicles WHERE quantity = 0").fetchone()[0] >= 1
        db.execute("UPDATE vehicles SET quantity = 7, price_cents = 123456")
    seed_database(path, "admin@example.com", "another-admin-password")
    with closing(open_database(path)) as db:
        assert db.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1
        assert db.execute("SELECT COUNT(*) FROM vehicles").fetchone()[0] == count
        assert db.execute("SELECT MIN(quantity) FROM vehicles").fetchone()[0] == 7
        assert db.execute("SELECT DISTINCT price_cents FROM vehicles").fetchall()[0][0] == 123456
        assert db.execute("SELECT COUNT(DISTINCT price_cents) FROM vehicles").fetchone()[0] == 1
        assert db.execute("SELECT password_hash FROM users").fetchone()[0] == admin["password_hash"]


def test_seed_never_promotes_existing_member(settings, db):
    db.execute(
        "INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)",
        (str(uuid4()), "Member", "admin@example.com", "hash"),
    )
    with pytest.raises(ValueError, match="already belongs to a member"):
        seed_database(settings.database_path, "admin@example.com", "valid-password-for-seed")
    assert db.execute("SELECT role FROM users").fetchone()[0] == "user"
    assert db.execute("SELECT password_hash FROM users").fetchone()[0] == "hash"
    assert db.execute("SELECT COUNT(*) FROM vehicles").fetchone()[0] == 0


@pytest.mark.parametrize(
    "email,password",
    [("not-an-email", "short"), ("admin@example.com", "replace-with-a-strong-admin-password")],
)
def test_seed_rejects_unsafe_credentials(tmp_path, email, password):
    with pytest.raises(ValueError):
        seed_database(str(tmp_path / "seed.db"), email, password)


def test_health_security_headers_and_body_limit(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["cache-control"] == "no-store"
    response = client.post("/api/auth/login", json={"email": "x" * 20000})
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "BODY_TOO_LARGE"


def test_fastapi_docs_and_openapi_are_available(client):
    assert client.get("/docs").status_code == 200
    response = client.get("/openapi.json")
    assert response.status_code == 200
    assert "openapi" in response.json()

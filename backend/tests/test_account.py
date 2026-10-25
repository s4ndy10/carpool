import sqlite3
from contextlib import closing

import pytest
from fastapi.testclient import TestClient

from backend.app import create_app
from backend.db import initialize_database, open_database


def test_account_requires_authentication(client):
    assert client.get("/api/account").status_code == 401


def test_account_has_public_details_and_empty_history(client, member, identities):
    response = client.get("/api/account", headers=member)
    assert response.status_code == 200
    data = response.json()
    assert data["user"]["id"] == identities["user"]["id"]
    assert data["user"]["email"] == "user@example.com"
    assert data["user"]["joinedAt"].endswith("Z")
    assert "password_hash" not in data["user"]
    assert data["currency"] == "INR"
    assert data["purchases"] == []
    assert data["summary"] == {"orders": 0, "vehicles": 0, "totalSpent": 0}


def test_purchase_history_is_private_durable_and_survives_vehicle_deletion(
    client, member, admin, add_vehicle, settings
):
    vehicle = add_vehicle(price=123456.78)
    path = f"/api/vehicles/{vehicle['id']}"
    assert client.post(path + "/purchase", headers=member, json={"quantity": 2}).status_code == 200
    assert client.get("/api/account", headers=admin).json()["purchases"] == []
    assert client.delete(path, headers=admin).status_code == 204
    with TestClient(create_app(settings)) as reopened:
        data = reopened.get("/api/account", headers=member).json()
    assert data["summary"] == {"orders": 1, "vehicles": 2, "totalSpent": 246913.56}
    purchase = data["purchases"][0]
    assert purchase["vehicleId"] == vehicle["id"]
    assert purchase["make"] == vehicle["make"]
    assert purchase["unitPrice"] == 123456.78
    assert purchase["totalPrice"] == 246913.56
    assert purchase["quantity"] == 2
    assert purchase["purchasedAt"].endswith("Z")


def test_failed_purchase_creates_no_history(client, member, add_vehicle):
    vehicle = add_vehicle(quantity=0)
    assert client.post(f"/api/vehicles/{vehicle['id']}/purchase", headers=member).status_code == 409
    assert client.get("/api/account", headers=member).json()["purchases"] == []


def test_history_failure_rolls_back_stock(client, db, member, add_vehicle):
    vehicle = add_vehicle(quantity=3)
    db.execute(
        "CREATE TRIGGER fail_purchase BEFORE INSERT ON purchases BEGIN SELECT RAISE(ABORT, 'test failure'); END"
    )
    with pytest.raises(sqlite3.IntegrityError):
        client.post(f"/api/vehicles/{vehicle['id']}/purchase", headers=member)
    assert (
        db.execute("SELECT quantity FROM vehicles WHERE id = ?", (vehicle["id"],)).fetchone()[0]
        == 3
    )


def test_legacy_usd_inventory_is_converted_to_inr_exactly_once(tmp_path):
    path = str(tmp_path / "legacy.db")
    with closing(sqlite3.connect(path)) as db:
        db.execute(
            "CREATE TABLE vehicles (id TEXT PRIMARY KEY, make TEXT, model TEXT, category TEXT, price_cents INTEGER, quantity INTEGER)"
        )
        db.execute("INSERT INTO vehicles VALUES ('old', 'Honda', 'Civic', 'Sedan', 12345, 2)")
        db.commit()
    initialize_database(path)
    initialize_database(path)
    with closing(open_database(path)) as db:
        assert db.execute("SELECT price_cents FROM vehicles").fetchone()[0] == 12345 * 85
        assert (
            db.execute("SELECT value FROM app_metadata WHERE key = 'currency'").fetchone()[0]
            == "INR"
        )


def test_inr_prices_are_not_reconverted_on_restart(settings, add_vehicle):
    vehicle = add_vehicle(price=222222.22)
    initialize_database(settings.database_path)
    with closing(open_database(settings.database_path)) as db:
        assert (
            db.execute(
                "SELECT price_cents FROM vehicles WHERE id = ?", (vehicle["id"],)
            ).fetchone()[0]
            == 22222222
        )

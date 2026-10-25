import sqlite3
from concurrent.futures import ThreadPoolExecutor
from contextlib import ExitStack
from threading import Barrier
from uuid import UUID, uuid4

import pytest
from conftest import VEHICLE
from fastapi.testclient import TestClient

from backend.app import create_app


@pytest.mark.parametrize(
    "method,path",
    [
        ("GET", "/api/vehicles"),
        ("GET", "/api/vehicles/search"),
        ("GET", "/api/vehicles/options"),
        ("POST", "/api/vehicles"),
        ("PUT", "/api/vehicles/id"),
        ("DELETE", "/api/vehicles/id"),
        ("POST", "/api/vehicles/id/purchase"),
        ("POST", "/api/vehicles/id/restock"),
    ],
)
def test_inventory_routes_require_authentication(client, method, path):
    assert client.request(method, path, json=VEHICLE).status_code == 401


def test_create_stores_exact_cents_and_lists_exact_public_fields(client, db, member, add_vehicle):
    created = add_vehicle()
    assert created == {"id": created["id"], **VEHICLE}
    assert str(UUID(created["id"])) == created["id"]
    assert (
        db.execute("SELECT price_cents FROM vehicles WHERE id = ?", (created["id"],)).fetchone()[0]
        == 11440029
    )
    response = client.get("/api/vehicles", headers=member)
    assert response.status_code == 200
    assert response.json() == {"vehicles": [created]}


def test_vehicle_options_empty_database(client, member):
    response = client.get("/api/vehicles/options", headers=member)
    assert response.status_code == 200
    assert response.json() == {"makes": [], "models": {}, "categories": []}


def test_vehicle_options_are_persisted_distinct_sorted_and_include_sold_out(
    settings, member, add_vehicle
):
    for make, model, category, quantity in (
        ("Toyota", "Corolla", "Sedan", 2),
        ("Volkswagen", "Golf", "Hatchback", 0),
        ("Toyota", "Camry", "Sedan", 1),
        ("Honda", "Civic", "Sedan", 3),
        ("Toyota", "Corolla", "Sedan", 5),
    ):
        add_vehicle(make=make, model=model, category=category, quantity=quantity)
    with TestClient(create_app(settings)) as reopened:
        response = reopened.get("/api/vehicles/options", headers=member)
        assert response.status_code == 200
        assert response.json() == {
            "makes": ["Honda", "Toyota", "Volkswagen"],
            "models": {
                "Honda": ["Civic"],
                "Toyota": ["Camry", "Corolla"],
                "Volkswagen": ["Golf"],
            },
            "categories": ["Hatchback", "Sedan"],
        }


def test_members_can_add_and_edit_details_but_not_stock(client, member, db):
    response = client.post("/api/vehicles", headers=member, json=VEHICLE)
    assert response.status_code == 201
    vehicle_id = response.json()["vehicle"]["id"]
    updated = {**VEHICLE, "model": "911 Targa", "price": 125000}
    response = client.put(f"/api/vehicles/{vehicle_id}", headers=member, json=updated)
    assert response.status_code == 200
    assert response.json() == {"vehicle": {"id": vehicle_id, **updated}}
    response = client.put(
        f"/api/vehicles/{vehicle_id}",
        headers=member,
        json={**updated, "quantity": 100, "expectedQuantity": 3},
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"
    assert (
        db.execute("SELECT quantity FROM vehicles WHERE id = ?", (vehicle_id,)).fetchone()[0] == 3
    )


@pytest.mark.parametrize(
    "invalid",
    [
        {"make": ""},
        {"model": " "},
        {"category": "Spaceship"},
        {"category": "coupe"},
        {"price": -1},
        {"price": "100"},
        {"price": 10.001},
        {"price": 100000001},
        {"price": True},
        {"price": False},
        {"quantity": True},
        {"quantity": False},
        {"quantity": -1},
        {"quantity": 1.5},
        {"quantity": "3"},
        {"quantity": 1000001},
        {"id": "provided-id"},
        {"expectedQuantity": 3},
    ],
)
def test_vehicle_validation_is_strict(client, admin, invalid):
    response = client.post("/api/vehicles", headers=admin, json={**VEHICLE, **invalid})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


@pytest.mark.parametrize(
    "category", ["Sedan", "SUV", "Coupe", "Hatchback", "Truck", "Wagon", "Convertible"]
)
def test_all_existing_categories_are_supported(add_vehicle, category):
    assert add_vehicle(category=category)["category"] == category


def test_zero_values_remain_visible(client, member, add_vehicle):
    created = add_vehicle(price=0, quantity=0)
    assert created in client.get("/api/vehicles", headers=member).json()["vehicles"]


def test_search_combines_case_insensitive_text_and_inclusive_prices(client, member, add_vehicle):
    target = add_vehicle()
    add_vehicle(make="Volvo", model="XC60", category="SUV", price=52000)
    response = client.get(
        "/api/vehicles/search",
        headers=member,
        params={
            "make": "pors",
            "model": "CARRERA",
            "category": "Coupe",
            "minPrice": "114400.29",
            "maxPrice": "114400.29",
        },
    )
    assert response.status_code == 200
    assert response.json() == {"vehicles": [target]}


def test_search_combined_name_and_literal_sql_wildcards(client, member, add_vehicle):
    target = add_vehicle()
    response = client.get("/api/vehicles/search", headers=member, params={"q": "porsche 911"})
    assert response.json() == {"vehicles": [target]}
    for query in ("' OR 1=1 --", "%", "_", "\\"):
        response = client.get("/api/vehicles/search", headers=member, params={"q": query})
        assert response.status_code == 200
        assert response.json() == {"vehicles": []}


@pytest.mark.parametrize(
    "query",
    [
        {"minPrice": "-1"},
        {"maxPrice": "abc"},
        {"minPrice": "20", "maxPrice": "10"},
        {"minPrice": ""},
        {"maxPrice": "10.123"},
        {"category": "coupe"},
        {"unknown": "value"},
    ],
)
def test_invalid_search_queries_return_400(client, member, query):
    response = client.get("/api/vehicles/search", headers=member, params=query)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_admin_stock_correction_and_deletion(client, member, admin, add_vehicle):
    created = add_vehicle()
    path = f"/api/vehicles/{created['id']}"
    response = client.put(
        path, headers=admin, json={**VEHICLE, "price": 99999, "quantity": 4, "expectedQuantity": 3}
    )
    assert response.status_code == 200
    assert response.json() == {"vehicle": {**created, "price": 99999, "quantity": 4}}
    assert client.delete(path, headers=member).status_code == 403
    deleted = client.delete(path, headers=admin)
    assert deleted.status_code == 204
    assert deleted.content == b""
    missing = client.delete(path, headers=admin)
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "VEHICLE_NOT_FOUND"


def test_stale_admin_form_cannot_restore_purchased_stock(client, member, admin, db, add_vehicle):
    created = add_vehicle()
    path = f"/api/vehicles/{created['id']}"
    assert client.post(f"{path}/purchase", headers=member).status_code == 200
    response = client.put(
        path, headers=admin, json={**VEHICLE, "model": "Revised name", "expectedQuantity": 3}
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "STOCK_CHANGED"
    stored = db.execute(
        "SELECT model, quantity FROM vehicles WHERE id = ?", (created["id"],)
    ).fetchone()
    assert stored["quantity"] == 2
    assert stored["model"] == VEHICLE["model"]


def test_changed_admin_stock_requires_expected_quantity(client, admin, add_vehicle):
    created = add_vehicle()
    path = f"/api/vehicles/{created['id']}"
    response = client.put(path, headers=admin, json={**VEHICLE, "quantity": 4})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "STOCK_CHANGED"
    assert (
        client.put(
            path, headers=admin, json={**VEHICLE, "quantity": 4, "expectedQuantity": 3}
        ).status_code
        == 200
    )


@pytest.mark.parametrize("value", [True, False, "3", -1, 1.5, 1000001, None])
def test_expected_quantity_is_strict(client, admin, add_vehicle, value):
    created = add_vehicle()
    response = client.put(
        f"/api/vehicles/{created['id']}", headers=admin, json={**VEHICLE, "expectedQuantity": value}
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_role_demotion_applies_to_existing_token(client, db, admin, identities, add_vehicle):
    created = add_vehicle()
    db.execute("UPDATE users SET role = 'user' WHERE id = ?", (identities["admin"]["id"],))
    assert client.delete(f"/api/vehicles/{created['id']}", headers=admin).status_code == 403
    assert (
        client.post(
            f"/api/vehicles/{created['id']}/restock", headers=admin, json={"quantity": 1}
        ).status_code
        == 403
    )


def test_missing_vehicles_return_404(client, admin):
    path = f"/api/vehicles/{uuid4()}"
    for method, suffix, body in (
        ("PUT", "", VEHICLE),
        ("POST", "/purchase", {}),
        ("POST", "/restock", {"quantity": 1}),
        ("DELETE", "", None),
    ):
        response = client.request(method, path + suffix, headers=admin, json=body)
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "VEHICLE_NOT_FOUND"


@pytest.mark.parametrize(
    "vehicle_id",
    [
        "not-a-uuid",
        "1234",
        "00000000000040008000000000000001",
        "{00000000-0000-4000-8000-000000000001}",
    ],
)
def test_noncanonical_vehicle_ids_return_400(client, admin, vehicle_id):
    response = client.delete(f"/api/vehicles/{vehicle_id}", headers=admin)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_users_and_inventory_persist_across_app_instances(settings, member, add_vehicle):
    created = add_vehicle()
    with TestClient(create_app(settings)) as reopened:
        response = reopened.get("/api/vehicles", headers=member)
        assert response.status_code == 200
        assert response.json() == {"vehicles": [created]}


@pytest.mark.parametrize(
    "content_type", ["text/plain", "application/x-www-form-urlencoded", "application/octet-stream"]
)
def test_unsupported_purchase_body_does_not_mutate_stock(
    client, db, member, add_vehicle, content_type
):
    created = add_vehicle()
    response = client.post(
        f"/api/vehicles/{created['id']}/purchase",
        headers={**member, "Content-Type": content_type},
        content="quantity=-1",
    )
    assert response.status_code == 415
    assert response.json()["error"]["code"] == "UNSUPPORTED_MEDIA_TYPE"
    assert (
        db.execute("SELECT quantity FROM vehicles WHERE id = ?", (created["id"],)).fetchone()[0]
        == 3
    )


def test_purchase_defaults_to_one_and_reports_sold_out(client, member, add_vehicle):
    created = add_vehicle()
    path = f"/api/vehicles/{created['id']}/purchase"
    response = client.post(path, headers=member)
    assert response.status_code == 200
    assert response.json() == {"vehicle": {**created, "quantity": 2}}
    response = client.post(path, headers=member, json={"quantity": 2})
    assert response.status_code == 200
    assert response.json() == {"vehicle": {**created, "quantity": 0}}
    response = client.post(path, headers=member, json={})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "INSUFFICIENT_STOCK"


@pytest.mark.parametrize("raw_body", ["null", "[]", "1", "true", '"text"'])
def test_explicit_nonobject_purchase_body_is_not_missing(client, db, member, add_vehicle, raw_body):
    created = add_vehicle()
    response = client.post(
        f"/api/vehicles/{created['id']}/purchase",
        headers={**member, "Content-Type": "application/json"},
        content=raw_body,
    )
    assert response.status_code == 400
    assert (
        db.execute("SELECT quantity FROM vehicles WHERE id = ?", (created["id"],)).fetchone()[0]
        == 3
    )


def test_excess_purchase_does_not_change_stock(client, db, member, add_vehicle):
    created = add_vehicle()
    response = client.post(
        f"/api/vehicles/{created['id']}/purchase", headers=member, json={"quantity": 4}
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "INSUFFICIENT_STOCK"
    assert (
        db.execute("SELECT quantity FROM vehicles WHERE id = ?", (created["id"],)).fetchone()[0]
        == 3
    )


def test_concurrent_purchases_on_separate_apps_and_connections_never_oversell(
    settings, db, member, add_vehicle
):
    created = add_vehicle(quantity=2)
    barrier = Barrier(8)
    # Separate app lifespans and clients prevent a shared client/connection from serializing this race.
    with ExitStack() as stack:
        clients = [stack.enter_context(TestClient(create_app(settings))) for _ in range(8)]

        def purchase(client):
            barrier.wait(timeout=15)
            return client.post(
                f"/api/vehicles/{created['id']}/purchase", headers=member, json={"quantity": 1}
            )

        with ThreadPoolExecutor(max_workers=8) as executor:
            responses = list(executor.map(purchase, clients))
    assert sorted(response.status_code for response in responses) == [
        200,
        200,
        409,
        409,
        409,
        409,
        409,
        409,
    ]
    assert sorted(
        response.json()["vehicle"]["quantity"]
        for response in responses
        if response.status_code == 200
    ) == [0, 1]
    assert all(
        response.json()["error"]["code"] == "INSUFFICIENT_STOCK"
        for response in responses
        if response.status_code == 409
    )
    assert (
        db.execute("SELECT quantity FROM vehicles WHERE id = ?", (created["id"],)).fetchone()[0]
        == 0
    )


@pytest.mark.parametrize("quantity", [0, -1, 1.5, "2", 1000001, None, True, False])
def test_purchase_and_restock_require_strict_positive_numbers(
    client, db, admin, add_vehicle, quantity
):
    created = add_vehicle()
    for operation in ("purchase", "restock"):
        response = client.post(
            f"/api/vehicles/{created['id']}/{operation}", headers=admin, json={"quantity": quantity}
        )
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert (
        db.execute("SELECT quantity FROM vehicles WHERE id = ?", (created["id"],)).fetchone()[0]
        == 3
    )


def test_restock_requires_admin_and_explicit_quantity(client, member, admin, add_vehicle):
    created = add_vehicle(quantity=0)
    path = f"/api/vehicles/{created['id']}/restock"
    assert client.post(path, headers=member, json={"quantity": 5}).status_code == 403
    assert client.post(path, headers=admin, json={}).status_code == 400
    assert client.post(path, headers=admin).status_code == 400
    response = client.post(path, headers=admin, json={"quantity": 5})
    assert response.status_code == 200
    assert response.json() == {"vehicle": {**created, "quantity": 5}}


def test_restock_overflow_is_rejected(client, db, admin, add_vehicle):
    created = add_vehicle(quantity=1000000)
    response = client.post(
        f"/api/vehicles/{created['id']}/restock", headers=admin, json={"quantity": 1}
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "STOCK_LIMIT"
    assert (
        db.execute("SELECT quantity FROM vehicles WHERE id = ?", (created["id"],)).fetchone()[0]
        == 1000000
    )


def test_database_itself_enforces_currency_and_stock_invariants(db, add_vehicle):
    created = add_vehicle()
    for statement in (
        "UPDATE vehicles SET quantity = -1 WHERE id = ?",
        "UPDATE vehicles SET price_cents = -1 WHERE id = ?",
    ):
        with pytest.raises(sqlite3.IntegrityError):
            db.execute(statement, (created["id"],))

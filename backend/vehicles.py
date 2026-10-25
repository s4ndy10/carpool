from decimal import Decimal
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Body, Depends, Query, Request, Response

from backend.auth import AdminUser, AuthenticatedUser
from backend.db import Database
from backend.errors import ApiError
from backend.models import (
    Purchase,
    Restock,
    Search,
    VehicleInput,
    VehicleList,
    VehicleResponse,
    VehicleUpdate,
)

router = APIRouter(prefix="/api/vehicles", tags=["Vehicles"])
FIELDS = "id, make, model, category, price_cents / 100.0 AS price, quantity"


def valid_id(value: str) -> str:
    try:
        if str(UUID(value)) != value:
            raise ValueError
    except ValueError as exc:
        raise ApiError(400, "VALIDATION_ERROR", "Vehicle ID must be a canonical UUID.") from exc
    return value


def not_found():
    return ApiError(404, "VEHICLE_NOT_FOUND", "This vehicle is no longer in the collection.")


def stock_changed():
    return ApiError(
        409,
        "STOCK_CHANGED",
        "Stock has changed. Refresh the collection and reopen this vehicle before saving.",
    )


@router.get("/options")
def vehicle_options(user: AuthenticatedUser, db: Database):
    rows = db.execute("SELECT DISTINCT make, model, category FROM vehicles").fetchall()
    makes = sorted({row["make"] for row in rows}, key=str.casefold)
    return {
        "makes": makes,
        "models": {
            make: sorted({row["model"] for row in rows if row["make"] == make}, key=str.casefold)
            for make in makes
        },
        "categories": sorted({row["category"] for row in rows}, key=str.casefold),
    }


@router.get("", response_model=VehicleList)
@router.get("/search", response_model=VehicleList)
def list_vehicles(user: AuthenticatedUser, db: Database, filters: Annotated[Search, Query()]):
    clauses, params = [], []
    for column, value in (
        ("(make || ' ' || model)", filters.q),
        ("make", filters.make),
        ("model", filters.model),
    ):
        if value:
            clauses.append(f"{column} LIKE ? ESCAPE '\\'")
            literal = value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            params.append(f"%{literal}%")
    if filters.category:
        clauses.append("category = ?")
        params.append(filters.category)
    for operator, amount in ((">=", filters.minPrice), ("<=", filters.maxPrice)):
        if amount is not None:
            clauses.append(f"price_cents {operator} ?")
            params.append(int(amount * 100))
    where = "WHERE " + " AND ".join(clauses) if clauses else ""
    rows = db.execute(
        f"SELECT {FIELDS} FROM vehicles {where} ORDER BY make COLLATE NOCASE, model COLLATE NOCASE, id",
        params,
    ).fetchall()
    return {"vehicles": [dict(row) for row in rows]}


@router.post("", status_code=201, response_model=VehicleResponse)
def add_vehicle(data: VehicleInput, user: AuthenticatedUser, db: Database):
    row = db.execute(
        f"INSERT INTO vehicles (id, make, model, category, price_cents, quantity) VALUES (?, ?, ?, ?, ?, ?) RETURNING {FIELDS}",
        (
            str(uuid4()),
            data.make,
            data.model,
            data.category,
            int(Decimal(str(data.price)) * 100),
            data.quantity,
        ),
    ).fetchone()
    return {"vehicle": dict(row)}


@router.put("/{vehicle_id}", response_model=VehicleResponse)
def update_vehicle(vehicle_id: str, data: VehicleUpdate, user: AuthenticatedUser, db: Database):
    vehicle_id = valid_id(vehicle_id)
    current = db.execute("SELECT quantity FROM vehicles WHERE id = ?", (vehicle_id,)).fetchone()
    if current is None:
        raise not_found()
    admin = user["role"] == "admin"
    if not admin and data.quantity != current["quantity"]:
        raise ApiError(
            403,
            "FORBIDDEN",
            "Only administrators can adjust stock directly. Use Purchase to buy a vehicle.",
        )
    expected = data.expectedQuantity if data.expectedQuantity is not None else data.quantity
    if admin and expected != current["quantity"]:
        raise stock_changed()
    # Members never write stock; admin corrections use an atomic compare-and-set.
    params = [data.make, data.model, data.category, int(Decimal(str(data.price)) * 100)]
    stock_sql = ", quantity = ?" if admin else ""
    condition = " AND quantity = ?" if admin else ""
    if admin:
        params.append(data.quantity)
    params.append(vehicle_id)
    if admin:
        params.append(expected)
    row = db.execute(
        f"UPDATE vehicles SET make = ?, model = ?, category = ?, price_cents = ?{stock_sql} WHERE id = ?{condition} RETURNING {FIELDS}",
        params,
    ).fetchone()
    if row is None:
        if not db.execute("SELECT id FROM vehicles WHERE id = ?", (vehicle_id,)).fetchone():
            raise not_found()
        raise stock_changed()
    return {"vehicle": dict(row)}


@router.delete("/{vehicle_id}", status_code=204)
def delete_vehicle(vehicle_id: str, user: AdminUser, db: Database):
    if not db.execute("DELETE FROM vehicles WHERE id = ?", (valid_id(vehicle_id),)).rowcount:
        raise not_found()
    return Response(status_code=204)


async def purchase_input(request: Request, data: Annotated[Purchase | None, Body()] = None):
    if data is None and await request.body():
        raise ApiError(400, "VALIDATION_ERROR", "Purchase body must be a JSON object.")
    return data if data is not None else Purchase()


@router.post("/{vehicle_id}/purchase", response_model=VehicleResponse)
def purchase_vehicle(
    vehicle_id: str,
    user: AuthenticatedUser,
    db: Database,
    data: Annotated[Purchase, Depends(purchase_input)],
):
    vehicle_id = valid_id(vehicle_id)
    # Stock and the immutable receipt commit together or both roll back.
    db.execute("BEGIN IMMEDIATE")
    try:
        row = db.execute(
            f"UPDATE vehicles SET quantity = quantity - ? WHERE id = ? AND quantity >= ? RETURNING {FIELDS}, price_cents",
            (data.quantity, vehicle_id, data.quantity),
        ).fetchone()
        if row is None:
            if not db.execute("SELECT id FROM vehicles WHERE id = ?", (vehicle_id,)).fetchone():
                raise not_found()
            raise ApiError(
                409,
                "INSUFFICIENT_STOCK",
                "There are not enough vehicles in stock for this purchase.",
            )
        db.execute(
            "INSERT INTO purchases (id, user_id, vehicle_id, make, model, category, unit_price_paise, quantity, total_paise) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                str(uuid4()),
                user["id"],
                vehicle_id,
                row["make"],
                row["model"],
                row["category"],
                row["price_cents"],
                data.quantity,
                row["price_cents"] * data.quantity,
            ),
        )
        db.execute("COMMIT")
    except Exception:
        db.execute("ROLLBACK")
        raise
    vehicle = dict(row)
    del vehicle["price_cents"]
    return {"vehicle": vehicle}


@router.post("/{vehicle_id}/restock", response_model=VehicleResponse)
def restock_vehicle(vehicle_id: str, data: Restock, user: AdminUser, db: Database):
    vehicle_id = valid_id(vehicle_id)
    row = db.execute(
        f"UPDATE vehicles SET quantity = quantity + ? WHERE id = ? AND quantity <= 1000000 - ? RETURNING {FIELDS}",
        (data.quantity, vehicle_id, data.quantity),
    ).fetchone()
    if row is None:
        if not db.execute("SELECT id FROM vehicles WHERE id = ?", (vehicle_id,)).fetchone():
            raise not_found()
        raise ApiError(409, "STOCK_LIMIT", "Stock cannot exceed 1,000,000 units per vehicle.")
    return {"vehicle": dict(row)}

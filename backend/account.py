from fastapi import APIRouter

from backend.auth import AuthenticatedUser
from backend.db import Database

router = APIRouter(prefix="/api/account", tags=["Account"])


@router.get("")
def account(user: AuthenticatedUser, db: Database):
    details = db.execute(
        "SELECT strftime('%Y-%m-%dT%H:%M:%SZ', created_at) AS joinedAt FROM users WHERE id = ?",
        (user["id"],),
    ).fetchone()
    rows = db.execute(
        """SELECT id, vehicle_id AS vehicleId, make, model, category,
           unit_price_paise / 100.0 AS unitPrice, quantity,
           total_paise / 100.0 AS totalPrice, purchased_at AS purchasedAt
           FROM purchases WHERE user_id = ? ORDER BY purchased_at DESC, rowid DESC""",
        (user["id"],),
    ).fetchall()
    summary = db.execute(
        """SELECT COUNT(*) AS orders, COALESCE(SUM(quantity), 0) AS vehicles,
           COALESCE(SUM(total_paise), 0) / 100.0 AS totalSpent
           FROM purchases WHERE user_id = ?""",
        (user["id"],),
    ).fetchone()
    return {
        "user": {**user, "joinedAt": details["joinedAt"]},
        "currency": "INR",
        "purchases": [dict(row) for row in rows],
        "summary": dict(summary),
    }

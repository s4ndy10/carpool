import sqlite3
from collections.abc import Iterator
from contextlib import closing
from pathlib import Path
from typing import Annotated

from fastapi import Depends, Request

DEMO_USD_TO_INR = 85


def open_database(filename: str) -> sqlite3.Connection:
    if not str(filename).strip() or str(filename) == ":memory:":
        raise ValueError("A file-backed SQLite database is required.")
    path = Path(filename).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=5, isolation_level=None, check_same_thread=False)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    db.execute("PRAGMA busy_timeout = 5000")
    return db


def initialize_database(filename: str) -> None:
    with closing(open_database(filename)) as db:
        # Schema remains compatible with inventory and accounts saved by the original API.
        db.executescript("""
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            ) STRICT;
            CREATE TABLE IF NOT EXISTS vehicles (
                id TEXT PRIMARY KEY,
                make TEXT NOT NULL,
                model TEXT NOT NULL,
                category TEXT NOT NULL CHECK (category IN ('Sedan', 'SUV', 'Coupe', 'Hatchback', 'Truck', 'Wagon', 'Convertible')),
                price_cents INTEGER NOT NULL CHECK (price_cents BETWEEN 0 AND 10000000000),
                quantity INTEGER NOT NULL CHECK (quantity BETWEEN 0 AND 1000000),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            ) STRICT;
            CREATE INDEX IF NOT EXISTS vehicles_category_price ON vehicles(category, price_cents);
            CREATE TABLE IF NOT EXISTS app_metadata (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            ) STRICT;
            CREATE TABLE IF NOT EXISTS purchases (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                vehicle_id TEXT NOT NULL,
                make TEXT NOT NULL,
                model TEXT NOT NULL,
                category TEXT NOT NULL,
                unit_price_paise INTEGER NOT NULL CHECK (unit_price_paise >= 0),
                quantity INTEGER NOT NULL CHECK (quantity > 0),
                total_paise INTEGER NOT NULL CHECK (total_paise = unit_price_paise * quantity),
                purchased_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            ) STRICT;
            CREATE INDEX IF NOT EXISTS purchases_user_date ON purchases(user_id, purchased_at DESC);
        """)
        # Existing deployments stored USD cents. Keep the column name, but migrate to INR paise once.
        db.execute("BEGIN IMMEDIATE")
        try:
            currency = db.execute(
                "SELECT value FROM app_metadata WHERE key = 'currency'"
            ).fetchone()
            if currency is None:
                too_large = db.execute(
                    "SELECT id FROM vehicles WHERE price_cents * ? > 10000000000 LIMIT 1",
                    (DEMO_USD_TO_INR,),
                ).fetchone()
                if too_large:
                    raise ValueError(
                        "INR conversion exceeds the supported price limit. Review inventory before migrating."
                    )
                db.execute("UPDATE vehicles SET price_cents = price_cents * ?", (DEMO_USD_TO_INR,))
                db.execute("INSERT INTO app_metadata (key, value) VALUES ('currency', 'INR')")
            elif currency["value"] != "INR":
                raise ValueError("Unsupported database currency.")
            db.execute("COMMIT")
        except Exception:
            db.execute("ROLLBACK")
            raise


def get_db(request: Request) -> Iterator[sqlite3.Connection]:
    # Each request owns its connection; concurrent worker threads never share one.
    with closing(open_database(request.app.state.settings.database_path)) as db:
        yield db


Database = Annotated[sqlite3.Connection, Depends(get_db)]

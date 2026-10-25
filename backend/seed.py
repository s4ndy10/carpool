import os
from contextlib import closing
from uuid import uuid4

import bcrypt
from dotenv import load_dotenv

from backend.db import DEMO_USD_TO_INR, initialize_database, open_database
from backend.models import Registration

# Real vehicle names; prices and stock are illustrative demo inventory, not a live market feed.
COLLECTION = [
    ("00000000-0000-4000-8000-000000000001", "Porsche", "911 Carrera", "Coupe", 11440000, 3),
    ("00000000-0000-4000-8000-000000000002", "Land Rover", "Defender 110", "SUV", 6890000, 5),
    ("00000000-0000-4000-8000-000000000003", "BMW", "M3 Competition", "Sedan", 8490000, 2),
    ("00000000-0000-4000-8000-000000000004", "Volvo", "V60 Cross Country", "Wagon", 5090000, 4),
    (
        "00000000-0000-4000-8000-000000000005",
        "Mercedes-Benz",
        "SL 43 Roadster",
        "Convertible",
        11180000,
        0,
    ),
    ("00000000-0000-4000-8000-000000000006", "Audi", "Q5 quattro", "SUV", 5290000, 6),
    ("00000000-0000-4000-8000-000000000007", "Honda", "Civic Sport", "Sedan", 2645000, 8),
    ("00000000-0000-4000-8000-000000000008", "Toyota", "Corolla LE", "Sedan", 2290000, 10),
    ("00000000-0000-4000-8000-000000000009", "Toyota", "RAV4 XLE", "SUV", 3290000, 6),
    ("00000000-0000-4000-8000-000000000010", "Mazda", "MX-5 Miata", "Convertible", 2990000, 4),
    ("00000000-0000-4000-8000-000000000011", "Volkswagen", "Golf GTI", "Hatchback", 3190000, 5),
    ("00000000-0000-4000-8000-000000000012", "Ford", "F-150 XLT", "Truck", 4590000, 7),
    ("00000000-0000-4000-8000-000000000013", "Tesla", "Model 3", "Sedan", 3890000, 4),
]


def seed_database(database_path: str, email: str, password: str):
    account = Registration(name="Showroom Manager", email=email, password=password)
    if password.startswith("replace-with-"):
        raise ValueError("Replace the ADMIN_PASSWORD placeholder before seeding.")
    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()
    initialize_database(database_path)
    with closing(open_database(database_path)) as db:
        db.execute("BEGIN IMMEDIATE")
        try:
            existing = db.execute(
                "SELECT role FROM users WHERE email = ?", (account.email,)
            ).fetchone()
            if existing and existing["role"] != "admin":
                raise ValueError(
                    "ADMIN_EMAIL already belongs to a member. Choose a different admin email."
                )
            if not existing:
                db.execute(
                    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, 'admin')",
                    (str(uuid4()), account.name, account.email, password_hash),
                )
            db.executemany(
                "INSERT OR IGNORE INTO vehicles (id, make, model, category, price_cents, quantity) VALUES (?, ?, ?, ?, ?, ?)",
                [
                    (*vehicle[:4], vehicle[4] * DEMO_USD_TO_INR, vehicle[5])
                    for vehicle in COLLECTION
                ],
            )
            db.execute("COMMIT")
        except Exception:
            db.execute("ROLLBACK")
            raise


if __name__ == "__main__":
    load_dotenv()
    email, password = os.environ.get("ADMIN_EMAIL"), os.environ.get("ADMIN_PASSWORD")
    if not email or not password:
        raise SystemExit("Set ADMIN_EMAIL and ADMIN_PASSWORD in .env before seeding.")
    seed_database(os.environ.get("DATABASE_PATH", "./data/forecourt.db"), email, password)
    print("Showroom seeded. Existing credentials and stock were preserved.")

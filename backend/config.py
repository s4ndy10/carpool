import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    jwt_secret: str
    database_path: str = "./data/forecourt.db"
    port: int = 3001
    auth_rate_limit: int = 20
    client_directory: Path | None = None

    def __post_init__(self):
        if len(self.jwt_secret) < 32 or self.jwt_secret.startswith("replace-with-"):
            raise ValueError(
                "JWT_SECRET must be a unique secret of at least 32 characters, not a placeholder."
            )
        if type(self.port) is not int or not 1 <= self.port <= 65535:
            raise ValueError("PORT must be an integer between 1 and 65535.")
        if not str(self.database_path).strip() or str(self.database_path) == ":memory:":
            raise ValueError("DATABASE_PATH must point to a file-backed database.")
        if type(self.auth_rate_limit) is not int or self.auth_rate_limit < 1:
            raise ValueError("AUTH_RATE_LIMIT must be a positive integer.")

    @classmethod
    def from_env(cls):
        port = os.environ.get("PORT", "3001")
        if not port.isascii() or not port.isdigit():
            raise ValueError("PORT must be an integer between 1 and 65535.")
        return cls(
            jwt_secret=os.environ.get("JWT_SECRET", ""),
            database_path=os.environ.get("DATABASE_PATH", "./data/forecourt.db"),
            port=int(port),
        )

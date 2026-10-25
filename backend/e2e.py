from pathlib import Path
from tempfile import TemporaryDirectory

import uvicorn

from backend.app import create_app
from backend.config import Settings
from backend.seed import seed_database


def main():
    client = Path(__file__).resolve().parent.parent / "dist" / "client"
    if not (client / "index.html").is_file():
        raise SystemExit("Run npm run build before browser tests.")
    with TemporaryDirectory(prefix="forecourt-e2e-") as directory:
        path = str(Path(directory) / "browser.db")
        seed_database(path, "manager@forecourt.test", "browser-tests-only-password")
        settings = Settings(
            jwt_secret="browser-tests-only-secret-at-least-32-characters",
            database_path=path,
            port=4173,
            auth_rate_limit=100,
            client_directory=client,
        )
        uvicorn.run(create_app(settings), host="127.0.0.1", port=4173, proxy_headers=False)


if __name__ == "__main__":
    main()

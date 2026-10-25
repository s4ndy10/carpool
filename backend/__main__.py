import argparse
from dataclasses import replace
from pathlib import Path

import uvicorn
from dotenv import load_dotenv

from backend.app import create_app
from backend.config import Settings


def application():
    load_dotenv()
    settings = Settings.from_env()
    client = Path(__file__).resolve().parent.parent / "dist" / "client"
    if (client / "index.html").is_file():
        settings = replace(settings, client_directory=client)
    return create_app(settings)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the Carpool FastAPI server.")
    parser.add_argument("--reload", action="store_true", help="Reload on Python source changes.")
    args = parser.parse_args()
    load_dotenv()
    settings = Settings.from_env()
    uvicorn.run(
        "backend.__main__:application",
        factory=True,
        host="0.0.0.0",
        port=settings.port,
        reload=args.reload,
        reload_dirs=[str(Path(__file__).parent)] if args.reload else None,
        proxy_headers=False,
    )

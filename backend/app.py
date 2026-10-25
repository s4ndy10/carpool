import logging
import sqlite3
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from pydantic import ValidationError
from starlette.exceptions import HTTPException

from backend.account import router as account_router
from backend.auth import router as auth_router
from backend.config import Settings
from backend.db import Database, initialize_database
from backend.errors import ApiError, error_body
from backend.middleware import ApiBoundary
from backend.vehicles import router as vehicle_router


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    initialize_database(settings.database_path)
    app = FastAPI(title="Carpool Inventory API", version="2.0.0")
    app.state.settings = settings
    app.add_middleware(ApiBoundary, auth_rate_limit=settings.auth_rate_limit)

    @app.exception_handler(ApiError)
    async def api_error(request: Request, error: ApiError):
        return JSONResponse(error_body(error.code, error.message), status_code=error.status)

    @app.exception_handler(RequestValidationError)
    @app.exception_handler(ValidationError)
    async def invalid_input(request: Request, error):
        if any(issue["type"] == "json_invalid" for issue in error.errors()):
            return JSONResponse(
                error_body("INVALID_JSON", "The request body must be valid JSON."), status_code=400
            )
        body = error_body("VALIDATION_ERROR", "Please check the submitted fields.")
        body["error"]["details"] = [
            {"field": ".".join(map(str, issue["loc"])), "message": issue["msg"]}
            for issue in error.errors()
        ]
        return JSONResponse(body, status_code=400)

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, error: HTTPException):
        code = "NOT_FOUND" if error.status_code == 404 else "HTTP_ERROR"
        return JSONResponse(
            error_body(code, str(error.detail)),
            status_code=error.status_code,
            headers=error.headers,
        )

    @app.exception_handler(sqlite3.OperationalError)
    async def database_error(request: Request, error):
        if "locked" in str(error).lower():
            return JSONResponse(
                error_body("DATABASE_BUSY", "Inventory is busy. Please try again."),
                status_code=503,
                headers={"Retry-After": "1"},
            )
        logging.exception("Database request failed")
        return JSONResponse(
            error_body("INTERNAL_ERROR", "Something went wrong. Please try again."), status_code=500
        )

    @app.exception_handler(Exception)
    async def unexpected_error(request: Request, error):
        logging.exception("Unhandled request error")
        return JSONResponse(
            error_body("INTERNAL_ERROR", "Something went wrong. Please try again."), status_code=500
        )

    @app.get("/api/health", tags=["Health"])
    def health(db: Database):
        db.execute("SELECT 1").fetchone()
        return {"status": "ok"}

    app.include_router(auth_router)
    app.include_router(account_router)
    app.include_router(vehicle_router)

    @app.api_route(
        "/api/{path:path}",
        methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
        include_in_schema=False,
    )
    def missing_api(path: str):
        raise ApiError(404, "NOT_FOUND", "API endpoint not found.")

    if settings.client_directory:
        root = Path(settings.client_directory).resolve()

        @app.get("/{path:path}", include_in_schema=False)
        def frontend(path: str):
            candidate = (root / path).resolve()
            if not candidate.is_relative_to(root):
                raise ApiError(404, "NOT_FOUND", "File not found.")
            if candidate.is_file():
                return FileResponse(candidate)
            if Path(path).suffix:
                raise ApiError(404, "NOT_FOUND", "File not found.")
            return FileResponse(root / "index.html", headers={"Cache-Control": "no-cache"})

    return app

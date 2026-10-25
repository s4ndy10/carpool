from threading import Lock
from time import monotonic

from starlette.responses import JSONResponse

from backend.errors import error_body


class ApiBoundary:
    """Bound request memory, validate media types, and rate-limit authentication."""

    def __init__(self, app, auth_rate_limit: int):
        self.app = app
        self.limit = auth_rate_limit
        self.attempts = {}
        self.lock = Lock()

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        path = scope["path"]

        async def secure_send(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.extend(
                    [
                        (b"x-content-type-options", b"nosniff"),
                        (b"x-frame-options", b"DENY"),
                        (b"referrer-policy", b"no-referrer"),
                    ]
                )
                if path.startswith("/api"):
                    headers.append((b"cache-control", b"no-store"))
                if path not in ("/docs", "/redoc"):
                    headers.append(
                        (
                            b"content-security-policy",
                            b"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
                        )
                    )
                message["headers"] = headers
            await send(message)

        async def reject(status, code, message, headers=None):
            await JSONResponse(error_body(code, message), status_code=status, headers=headers)(
                scope, receive, secure_send
            )

        if not path.startswith("/api"):
            return await self.app(scope, receive, secure_send)
        if scope["method"] == "POST" and path.rstrip("/") in (
            "/api/auth/login",
            "/api/auth/register",
        ):
            ip = scope.get("client", ("unknown", 0))[0]
            now = monotonic()
            with self.lock:
                self.attempts = {
                    key: value for key, value in self.attempts.items() if value[0] > now
                }
                expires, count = self.attempts.get(ip, (now + 900, 0))
                self.attempts[ip] = (expires, count + 1)
            if count >= self.limit:
                return await reject(
                    429,
                    "RATE_LIMITED",
                    "Too many authentication attempts. Please try again later.",
                    {"Retry-After": str(max(1, int(expires - now)))},
                )
        chunks, size = [], 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            size += len(chunk)
            if size > 16 * 1024:
                return await reject(413, "BODY_TOO_LARGE", "The request body is too large.")
            chunks.append(chunk)
            if not message.get("more_body", False):
                break
        body = b"".join(chunks)
        content_type = (
            dict(scope["headers"]).get(b"content-type", b"").split(b";", 1)[0].strip().lower()
        )
        if body and content_type != b"application/json":
            return await reject(
                415,
                "UNSUPPORTED_MEDIA_TYPE",
                "Request bodies must use Content-Type: application/json.",
            )
        sent = False

        async def replay():
            nonlocal sent
            if not sent:
                sent = True
                return {"type": "http.request", "body": body, "more_body": False}
            return await receive()

        await self.app(scope, replay, secure_send)

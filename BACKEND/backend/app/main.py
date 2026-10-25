"""FastAPI application entry point."""

from fastapi import FastAPI
from starlette.middleware.trustedhost import TrustedHostMiddleware
from fastapi.middleware.cors import CORSMiddleware
import os
from app.api.routes.health import router as health_router
from app.api.routes.reviews import router as reviews_router
from app.core.config import get_settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging
from app.middleware.request_context import RequestContextMiddleware

settings = get_settings()
configure_logging(settings)

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description=(
        "Rule-based Journal Reviewer Simulator. Reports are simulated checklist guidance, not expert peer review."
    ),
    # Keep debug tracebacks out of HTTP responses in every environment.
    debug=False,
)

cors_origins = [origin.strip() for origin in os.getenv(
    "JRS_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
).split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-Request-ID"],
)
app.add_middleware(RequestContextMiddleware)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts)
register_exception_handlers(app)
app.include_router(health_router, prefix=settings.api_prefix)
app.include_router(reviews_router, prefix=settings.api_prefix)

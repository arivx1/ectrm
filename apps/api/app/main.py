from __future__ import annotations

import uuid
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from apps.api.app.routes.events import router as events_router
from apps.api.app.routes.trades import router as trades_router

APP_VERSION = "0.0.0-dev"

app = FastAPI(title="E/CTRM API", version=APP_VERSION)
app.include_router(events_router)
app.include_router(trades_router)


@app.middleware("http")
async def add_correlation_id(request: Request, call_next):
    correlation_id = request.headers.get("x-correlation-id") or str(uuid.uuid4())
    response = await call_next(request)
    response.headers["x-correlation-id"] = correlation_id
    return response


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/version")
def version():
    return {"version": APP_VERSION}


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    correlation_id = request.headers.get("x-correlation-id")
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "UNHANDLED_EXCEPTION",
                "message": "Unexpected server error.",
                "correlation_id": correlation_id,
            }
        },
    )

from __future__ import annotations

import uuid
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from apps.api.app.routes.events import router as events_router
from apps.api.app.routes.reference_data import router as reference_data_router
from apps.api.app.routes.trades import router as trades_router
from apps.api.app.routes.positions import router as positions_router

APP_VERSION = "0.0.0-dev"

app = FastAPI(title="E/CTRM API", version=APP_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(events_router)
app.include_router(reference_data_router)
app.include_router(trades_router)
app.include_router(positions_router)


@app.middleware("http")
async def add_correlation_id(request: Request, call_next):
    correlation_id = request.headers.get("x-correlation-id") or str(uuid.uuid4())
    request.state.correlation_id = correlation_id
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
    correlation_id = getattr(request.state, "correlation_id", None) or request.headers.get("x-correlation-id")
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

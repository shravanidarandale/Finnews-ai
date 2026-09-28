"""FinNews AI - FastAPI application entrypoint."""
import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import get_settings
from models import ServiceError
from routes import ai, health, news

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("finnews")
settings = get_settings()

app = FastAPI(
    title="FinNews AI API",
    description="Fetches financial news and simplifies it with Llama 3.3 70B (Groq). "
    "AI output is informational only and is not financial advice.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

app.include_router(health.router)
app.include_router(news.router)
app.include_router(ai.router)


@app.exception_handler(ServiceError)
async def service_error_handler(_: Request, exc: ServiceError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"status": "error", "message": exc.message})


@app.exception_handler(RequestValidationError)
async def validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    first = exc.errors()[0] if exc.errors() else {}
    msg = str(first.get("msg", "Invalid input.")).removeprefix("Value error, ")
    return JSONResponse(status_code=422, content={"status": "error", "message": f"Invalid input: {msg}"})


@app.exception_handler(Exception)
async def unhandled_handler(_: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error: %s", type(exc).__name__)
    return JSONResponse(status_code=500, content={"status": "error", "message": "Something went wrong on our side. Please try again."})

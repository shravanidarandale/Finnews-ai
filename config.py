"""Central configuration. All secrets come from environment variables."""
import os
from dataclasses import dataclass
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()

_PLACEHOLDERS = {"", "your_newsapi_key", "your_groq_api_key"}


def _clean(value: str | None) -> str:
    value = (value or "").strip()
    return "" if value in _PLACEHOLDERS else value


@dataclass(frozen=True)
class Settings:
    news_api_key: str
    groq_api_key: str
    groq_model: str
    frontend_url: str
    news_cache_ttl: int
    request_timeout: float

    @property
    def news_demo_mode(self) -> bool:
        return not self.news_api_key

    @property
    def ai_demo_mode(self) -> bool:
        return not self.groq_api_key

    @property
    def cors_origins(self) -> list[str]:
        origin = self.frontend_url.rstrip("/")
        origins = {origin}
        if "localhost" in origin:
            origins.add(origin.replace("localhost", "127.0.0.1"))
        elif "127.0.0.1" in origin:
            origins.add(origin.replace("127.0.0.1", "localhost"))
        return sorted(origins)


@lru_cache
def get_settings() -> Settings:
    return Settings(
        news_api_key=_clean(os.getenv("NEWS_API_KEY")),
        groq_api_key=_clean(os.getenv("GROQ_API_KEY")),
        groq_model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile").strip(),
        frontend_url=os.getenv("FRONTEND_URL", "http://localhost:5500").strip(),
        news_cache_ttl=int(os.getenv("NEWS_CACHE_TTL", "300")),
        request_timeout=float(os.getenv("REQUEST_TIMEOUT", "20")),
    )

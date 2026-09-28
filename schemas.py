"""Pydantic request/response schemas."""
from typing import Literal

from pydantic import BaseModel, Field, model_validator

DISCLAIMER = "AI-generated summary for informational purposes only. This is not financial advice."

Category = Literal[
    "all", "business", "markets", "stocks", "economy",
    "technology", "banking", "cryptocurrency",
]


class Article(BaseModel):
    id: str
    title: str
    description: str = ""
    content: str = ""
    source: str = "Unknown source"
    author: str | None = None
    published_at: str | None = None
    url: str
    image_url: str | None = None


class NewsResponse(BaseModel):
    status: Literal["success"] = "success"
    demo: bool = False
    cached: bool = False
    total_results: int = 0
    page: int = 1
    articles: list[Article]


class SimplifyRequest(BaseModel):
    title: str = Field("", max_length=500)
    description: str = Field("", max_length=2000)
    content: str = Field("", max_length=20000)

    @model_validator(mode="after")
    def _needs_text(self) -> "SimplifyRequest":
        combined = f"{self.title} {self.description} {self.content}".strip()
        if len(combined) < 40:
            raise ValueError("Not enough article text to simplify (need at least 40 characters).")
        return self


class FinancialTerm(BaseModel):
    term: str
    meaning: str


class SimplifiedSummary(BaseModel):
    simple_summary: str
    what_happened: str
    why_it_matters: str
    financial_terms: list[FinancialTerm] = Field(default_factory=list)
    key_takeaways: list[str] = Field(default_factory=list)
    market_context: str = ""
    disclaimer: str = DISCLAIMER


class SimplifyResponse(BaseModel):
    status: Literal["success"] = "success"
    demo: bool = False
    cached: bool = False
    summary: SimplifiedSummary


class ErrorResponse(BaseModel):
    status: Literal["error"] = "error"
    message: str


class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "FinNews AI"
    news_mode: Literal["live", "demo"]
    ai_mode: Literal["live", "demo"]

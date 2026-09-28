# FinNews AI

AI-powered financial news simplification. Fetches news from **NewsAPI** and uses **Groq (Llama 3.3 70B)** to turn complex financial stories into short, beginner-friendly, structured explanations.

> AI-generated summaries are informational only and are **not financial advice**.

## Features
- "Fetch & Simplify": loads 6 articles and summarizes them automatically (2 AI requests at a time)
- Per-article "Simplify with AI", expand/collapse summaries
- Search and category filters (All, Business, Markets, Stocks, Economy, Technology, Banking, Cryptocurrency)
- Structured JSON from the model, validated with Pydantic, with robust parsing fallback
- In-memory caching, timeouts, friendly error messages, toast notifications
- Demo mode (clearly labelled "Demo Data") when API keys are missing
- Responsive, accessible dark fintech UI (vanilla HTML/CSS/JS)

## Architecture
```
Browser (static frontend, :5500)  --REST-->  FastAPI (:8000)  --> NewsAPI
                                                          \--> Groq (Llama 3.3 70B)
```
API keys live only in `backend/.env`; the frontend never sees them.

## Folder structure
```
finnews-ai/
├── backend/
│   ├── main.py            # app, CORS, error handlers
│   ├── config.py          # env settings
│   ├── models.py          # ServiceError
│   ├── schemas.py         # Pydantic request/response models
│   ├── routes/            # health.py, news.py, ai.py
│   ├── services/          # news_service.py, ai_service.py, cache.py, demo_data.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/              # index.html, styles.css, app.js
├── docker-compose.yml
├── .gitignore
└── README.md
```

## Prerequisites
Python 3.11+, a free NewsAPI key, a free Groq key. (Docker optional.)

## Get API keys
- **NewsAPI**: register at https://newsapi.org/register and copy your key. (The free Developer plan is for development use and delays articles ~24h.)
- **Groq**: create a key at https://console.groq.com/keys.

## Setup
```bash
cd backend
python -m venv venv
# macOS/Linux:
source venv/bin/activate
# Windows (PowerShell):
# venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env        # Windows: copy .env.example .env
# edit .env and paste your keys
uvicorn main:app --reload
```
Backend: http://localhost:8000 (Swagger `/docs`, ReDoc `/redoc`).

In a **second terminal**:
```bash
cd frontend
python -m http.server 5500
```
Open http://localhost:5500. `FRONTEND_URL` in `.env` must match this origin (CORS). If you deploy the API elsewhere, set `window.FINNEWS_API_BASE` or edit `API_BASE` at the top of `frontend/app.js`.

## Environment variables
| Variable | Purpose | Default |
|---|---|---|
| `NEWS_API_KEY` | NewsAPI key (blank = demo news) | – |
| `GROQ_API_KEY` | Groq key (blank = demo summary) | – |
| `GROQ_MODEL` | Model name | `llama-3.3-70b-versatile` |
| `FRONTEND_URL` | Allowed CORS origin | `http://localhost:5500` |
| `NEWS_CACHE_TTL` | News cache seconds | `300` |
| `REQUEST_TIMEOUT` | External request timeout (s) | `20` |

## API
```bash
curl http://localhost:8000/api/health
curl "http://localhost:8000/api/news?category=business&page_size=5"
curl "http://localhost:8000/api/news?q=Tesla"
curl -X POST http://localhost:8000/api/simplify -H "Content-Type: application/json" \
  -d '{"title":"Fed holds rates","description":"The Federal Reserve left interest rates unchanged and signalled patience on cuts.","content":""}'
```
`GET /api/news` params: `category`, `country` (2 letters), `q`, `page`, `page_size` (max 20).
`POST /api/simplify` returns `summary` with `simple_summary`, `what_happened`, `why_it_matters`, `financial_terms[]`, `key_takeaways[]`, `market_context`, `disclaimer`.

## Caching and performance tradeoffs
- **News cache**: normalised NewsAPI responses, keyed by endpoint + query params, kept **5 minutes** (`NEWS_CACHE_TTL`). Entries expire by time; there is no manual invalidation (restart clears it). Max 200 entries.
- **Summary cache**: AI results keyed by a hash of the article text, kept **1 hour**, so re-simplifying the same article costs nothing.
- The frontend blocks duplicate in-flight requests per article. Bulk mode summarizes 6 articles with 2 parallel AI calls and stops if a rate limit (429) occurs. More articles = slower and more API usage; adjust `BULK_COUNT` / `BULK_CONCURRENCY` in `app.js`.
- The cache is per-process memory. For multiple workers/servers, switch to Redis.

## Docker
```bash
cp backend/.env.example backend/.env   # add keys
docker compose up --build
```
Frontend: http://localhost:5500, API: http://localhost:8000/docs.

## Troubleshooting
- **"Network problem — is the backend running?"**: start uvicorn; check `API_BASE` in `app.js`.
- **CORS error in console**: `FRONTEND_URL` must exactly match the browser origin (scheme + host + port).
- **Demo Data banner**: `NEWS_API_KEY` missing or still the placeholder.
- **"not configured correctly on the server"**: invalid API key.
- **Rate limit messages**: wait and retry; reduce bulk size.
- **NewsAPI free plan** may return few or delayed results, and blocks browser-origin requests in production, which is why requests go through the backend.

## Security notes
Keys only in backend env vars; NewsAPI key sent via header, never logged or returned; the backend fetches only from fixed NewsAPI/Groq hosts (no user-supplied URLs); inputs are validated with length limits; article text is treated as untrusted data in the prompt; frontend renders via `textContent`; raw errors and stack traces are never returned; `.env` is git-ignored. Add rate limiting (e.g. slowapi) before public deployment.

## Disclaimer
AI-generated content may contain errors. This project is for informational and educational purposes only and does not provide financial advice.

# Review Intelligence MVP — URL collection and dataset import

A prototype for collecting accessible Amazon product reviews from a product page URL, classifying the collected reviews with a Groq-hosted model, filtering them, and exporting the selected results.

## What this version does
- Accepts an Amazon product page URL or a user-supplied review CSV/XLSX file. File upload is a no-provider-fee option when Amazon requires sign-in.
- Extracts the ASIN and requests reviews from the matching Amazon marketplace.
- Includes a best-effort parser for ordinary public Amazon review HTML. It stops if access is denied, redirected, rate-limited, or a bot-check page is returned. It does not bypass access controls.
- Supports Rainforest as primary, ScraperAPI and Bright Data as managed alternatives, DataForSEO after those, and ordinary public Amazon HTML as a last resort.
- Normalizes review title/text, rating, date, variant, verified-purchase indicator, source URL, and review ID when available.
- Uses Groq to classify individual reviews by sentiment, aspects, pros, and cons, then creates an overall evidence-based report.
- Supports collection-time star selection (for example, collect only 4-star reviews) and combined post-analysis filters: stars, sentiment, pros/cons, aspect, keyword, verified purchase, and date range.
- Exports the currently filtered reviews to CSV or XLSX, and downloads the report as text.
- Accepts optional PDF, DOCX, XLSX, CSV, TXT, Markdown, or JSON task instructions/templates.

If Amazon requires sign-in and automated collection stops, upload a CSV or XLSX of review data you are authorized to use. Include a review text column named `review_text`, `review`, `body`, `content`, or `text`; optional columns include title, rating, date, verified purchase, variant, and review ID. The upload is limited by `MAX_UPLOAD_MB` and `MAX_REVIEWS`. This avoids additional review-provider charges, though AI analysis still uses the configured Groq API.

## Important review-source limitations
Amazon does not guarantee that arbitrary review pages expose raw review content to automated requests. The direct HTML collector may return no reviews or be blocked, and it does not use proxies, CAPTCHA solving, login automation, or anti-bot evasion. The optional managed-provider adapters require your own provider accounts and credentials. Provider usage may incur charges; check current pricing, coverage, and terms before use. The count shown is the count actually collected, not a promise that the requested number is available or representative of all customers.

The Rainforest adapter uses its `reviews` API request type. Set `RAINFOREST_API_KEY` only if you have a valid account and permission to use that source. On retryable Rainforest server errors or empty results, the app tries ScraperAPI, Scrape.ly, Bright Data, DataForSEO, then ordinary public Amazon review pages. ScraperAPI uses its structured Amazon Product endpoint; configure `SCRAPERAPI_API_KEY`. Scrape.ly runs its `shelfbright/amazon-reviews-scraper` Actor through its asynchronous API; configure `SCRAPELY_TOKEN`. Each run is capped by `SCRAPELY_MAX_CHARGE_USD` (default $1.00) and polls until completion by default. Bright Data uses the Amazon Reviews-by-URL dataset scraper and returns rows from an asynchronous snapshot; configure `BRIGHTDATA_API_TOKEN`. Bright Data's documented scraper ID is `gd_le8e811kzy4ggddlq`; override it with `BRIGHTDATA_AMAZON_REVIEWS_DATASET_ID` if your account uses a different scraper. Requests may consume records/credits; review current provider coverage, billing, terms, and output in your provider dashboard. DataForSEO's Amazon ASIN endpoint supplies a bounded top local/global review sample, not a full review history.

For an isolated ScraperAPI check, set `SCRAPERAPI_ONLY=true`; the app then makes no Rainforest, DataForSEO, or direct Amazon HTML collection requests. Set it back to `false` to restore automatic failover.

For an isolated Bright Data check, set `BRIGHTDATA_ONLY=true` and configure `BRIGHTDATA_API_TOKEN`; this disables the other collection providers. Snapshot polling follows `BRIGHTDATA_MAX_WAIT_SECONDS` (`0` waits until the job reaches a terminal state).

For an isolated Scrape.ly check, set `SCRAPELY_ONLY=true` and configure `SCRAPELY_TOKEN`; this disables the other collection providers. `SCRAPELY_MAX_CHARGE_USD` sets a per-run spend cap (default `$1.00`), and `SCRAPELY_MAX_WAIT_SECONDS=0` waits until the Actor run completes or fails.

## Requirements
- Python 3.11+
- Node.js 20+
- Groq API key: https://console.groq.com/
- Optional Rainforest, ScraperAPI, Scrape.ly, and/or DataForSEO credentials for provider-backed review collection

## Deploy to Vercel

This repository contains two applications, so create two Vercel projects from the same Git repository:

1. **Backend:** import the repository and set **Root Directory** to `backend`. Vercel detects the FastAPI app in `app/main.py`, installs `requirements.txt`, and uses `backend/vercel.json` to allow up to 300 seconds per function. The Python runtime is currently in Beta on Vercel.
2. Add backend environment variables in Vercel Project Settings. Set `GROQ_API_KEY`, `FRONTEND_ORIGIN` to the frontend's deployed `https://...vercel.app` origin, and the provider credentials you use. For Scrape.ly, set `SCRAPELY_TOKEN`, `SCRAPELY_ONLY=true`, `SCRAPELY_MAX_CHARGE_USD=1.00`, and `SCRAPELY_MAX_WAIT_SECONDS=180`. Set `MAX_UPLOAD_MB=4`; the app clamps this to 4 MB on Vercel because Vercel Functions have a 4.5 MB request and response body limit.
3. Deploy the backend and copy its deployment URL.
4. **Frontend:** create another Vercel project from the same repository with **Root Directory** set to `frontend`. Set `NEXT_PUBLIC_API_URL` to the backend URL (for example `https://your-api.vercel.app`), then deploy. This variable is checked during Vercel builds so a missing setting does not silently ship a frontend that calls localhost.
5. If you use frontend Preview domains, add their exact origins as a comma-separated list in backend `FRONTEND_ORIGINS`. Redeploy the backend after changing CORS settings.

Vercel project root directories cannot read files outside their root, which is why the frontend and backend are deployed as separate projects. Keep secrets in Vercel's environment-variable settings; never add local `.env` files to Git. The backend's `BRIGHTDATA_MAX_WAIT_SECONDS` and `SCRAPELY_MAX_WAIT_SECONDS` should be finite on Vercel because a function cannot wait longer than its configured maximum duration. Long AI analysis or scraping jobs may need a durable background-job service if they exceed that limit.

Vercel references: [Python runtime and FastAPI](https://vercel.com/docs/functions/runtimes/python), [monorepo root directories](https://vercel.com/docs/monorepos), [function duration](https://vercel.com/docs/functions/configuring-functions/duration), and [function body-size limits](https://vercel.com/docs/functions/limitations).

## Backend setup
```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit backend/.env and set GROQ_API_KEY
uvicorn app.main:app --reload --port 8000
```

On Windows PowerShell, use `Copy-Item .env.example .env` if `cp` is unavailable.

## Frontend setup
In another terminal:
```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```
Open http://localhost:3000.

## Environment variables
- `GROQ_API_KEY` — required for AI classification and report generation.
- `GROQ_MODEL` — model ID available to your Groq account.
- `FRONTEND_ORIGIN` — frontend origin allowed by CORS; defaults to local development.
- `MAX_REVIEWS` — server-side maximum, capped at 500; default 200.
- `RAINFOREST_API_KEY` — optional authorized review-provider API key.
- `SCRAPERAPI_API_KEY` — optional ScraperAPI key for its structured Amazon Product endpoint.
- `SCRAPERAPI_ONLY` — set `true` to test ScraperAPI alone; disables Rainforest, DataForSEO, and public HTML fallbacks. Default `false`.
- `SCRAPELY_TOKEN` — optional Scrape.ly API token for the Amazon Reviews Actor.
- `SCRAPELY_ONLY` — set `true` to test Scrape.ly alone; disables other collection providers. Default `false`.
- `SCRAPELY_MAX_CHARGE_USD` — per-run Scrape.ly charge cap in USD; default `$1.00`.
- `SCRAPELY_MAX_WAIT_SECONDS` — maximum Scrape.ly run wait; `0` (default) waits until the run reaches a terminal state.
- `BRIGHTDATA_API_TOKEN` — optional Bright Data API key for its Amazon Reviews scraper.
- `BRIGHTDATA_ONLY` — set `true` to test Bright Data alone; disables other collection providers. Default `false`.
- `BRIGHTDATA_AMAZON_REVIEWS_DATASET_ID` — Bright Data dataset ID; defaults to the Amazon Reviews-by-URL scraper.
- `BRIGHTDATA_MAX_WAIT_SECONDS` — maximum time to wait for a Bright Data snapshot; `0` (default) keeps polling until Bright Data reports ready, failed, or canceled. Set a positive number to stop waiting after that many seconds; the error includes the snapshot ID.
- `DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD` — optional DataForSEO API credentials for failover or primary provider use.
- `DATAFORSEO_MAX_WAIT_SECONDS` — maximum time to wait for a DataForSEO ASIN task; default 120 seconds.
- `REQUEST_TIMEOUT_SECONDS` — network request timeout.

No additional credentials are needed for the public-page fallback. If managed providers fail or return no reviews, the app attempts the public Amazon review page and returns a clear access error if Amazon requires sign-in or otherwise blocks that request.

## API overview
- `GET /health` — configuration status.
- `POST /api/analyze` — form fields `url` (unless `review_file` is supplied), optional CSV/XLSX `review_file`, `prompt`, `max_reviews`, optional comma-separated `star_ratings` (for example `4` or `3,4,5`), and optional repeated `instructions` files. Collects or imports matching reviews and analyzes them.
- `POST /api/export/csv` — JSON body `{ "reviews": [...] }`, returns a CSV attachment.
- `POST /api/export/xlsx` — JSON body `{ "reviews": [...] }`, returns an XLSX attachment.

## Known prototype limitations
- No login, tenant isolation, database persistence, background job queue, or per-user task history.
- Direct Amazon HTML extraction is best-effort and selector-dependent.
- Review classification runs synchronously and makes multiple model calls for larger samples; quota and latency vary.
- Date strings from some providers may be human-readable rather than ISO dates, so date filtering is most reliable when the source returns ISO-like dates.
- The report download is a plain text report. PDF/DOCX report generation can be added in a subsequent iteration.
- A polished 3D character and production-grade deployment hardening are not included yet.

This is a demo scaffold, not a production-ready commercial SaaS. Before launch, add authentication, tenant-scoped persistent storage, rate limits, job processing, observability, data-retention controls, security review, and source/provider compliance checks. Never expose API keys through `NEXT_PUBLIC_` environment variables.

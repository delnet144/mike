# Mike

Open-source release containing the Mike frontend and backend.

This fork is configured for **single-player local-only mode** — no cloud accounts required.

## What's different

- **SQLite** replaces Supabase Postgres
- **Local filesystem** replaces R2/S3 object storage
- **Auto-login** — no auth screens, you are `local-user` automatically
- **Hermes adapter** — LLM calls route through your local `~/.hermes/config.yaml`
- **One-command launcher** — `./mike start` runs everything headlessly

## Contents

- `frontend/` — Next.js application
- `backend/` — Express API, SQLite database, document processing
- `mike` — CLI launcher (`start` | `stop` | `restart` | `status` | `logs`)
- `backend/migrations/000_one_shot_schema.sql` — schema reference (auto-created in SQLite on first run)

## Quick start

Install dependencies once:

```bash
cd backend  && npm install
cd ../frontend && npm install --legacy-peer-deps
```

Launch everything with the `mike` CLI:

```bash
./mike start
```

Open `http://192.168.2.204:3000` (or set `MIKE_HOST` to override).

## `mike` CLI

```bash
./mike start     # Launch backend + frontend headlessly
./mike stop      # Kill both processes
./mike restart   # Stop then start
./mike status    # Show running state and URLs
./mike logs      # Follow tail of both log files
```

Processes write logs to `backend.log` and `frontend.log` in the repo root.

## Data locations

- **Database:** `backend/data/mike.sqlite`
- **File storage:** `backend/data/storage/`
- **LLM config:** auto-detected from `~/.hermes/config.yaml`

## LLM setup

Mike detects your Hermes configuration automatically. If you have `~/.hermes/config.yaml`, it will read the active model and base URL from it. Otherwise you can set explicit env vars in `backend/.env`:

```
LOCAL_LLM_BASE_URL=http://localhost:8000/v1
LOCAL_LLM_API_KEY=your-key
```

## Optional: original cloud mode

If you want Supabase + R2 instead, restore the upstream `.env` files and set real credentials for `SUPABASE_URL`, `R2_ENDPOINT_URL`, etc. The codebase still supports it — the local overrides are transparent fallbacks.

## Required tools

- Node.js 20+
- LibreOffice (for DOC/DOCX to PDF conversion)
- (Optional) Hermes agent for local LLM inference

## Checks

```bash
npm run build --prefix backend
npm run build --prefix frontend
npm run lint --prefix frontend
```

## License

AGPL-3.0-only. See `LICENSE`.

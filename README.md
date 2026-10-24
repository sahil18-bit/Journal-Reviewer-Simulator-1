# Journal Reviewer Simulator

A small React + FastAPI application that creates **rule-based simulated review reports** from manuscript text. It checks common structure/reporting signals (for example, abstract, methods, results, references, limitations and data availability). It is a learning aid, not a real peer reviewer, an AI model, or a substitute for expert assessment.

## Requirements

- Python 3.11–3.14
- Node.js 20 or newer (LTS recommended)
- Windows PowerShell, macOS Terminal, or Linux shell

## Run locally on Windows

Open two PowerShell windows.

### 1. Start the backend

```powershell
cd path	o\JournalReviewerProject\BACKEND
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -e ".[dev]"
Copy-Item .env.example .env
python -m uvicorn app.main:app --app-dir backend --reload --port 8000
```

If PowerShell blocks activation, run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` in that window and activate again. If `py` is not available, use `python` in place of `py` to create the virtual environment.

Check `http://127.0.0.1:8000/api/v1/health` and `http://127.0.0.1:8000/docs`.

### 2. Start the frontend in the second window

```powershell
cd path	o\JournalReviewerProjectrontend
npm install
npm run dev
```

Open the URL Vite prints, usually `http://localhost:5173`.

## Features

- Upload a PDF, DOCX, or TXT manuscript (20 MB limit), or paste manuscript text.
- Choose 1–3 reviewer reports, a reviewer panel, and review strictness.
- View simulated recommendations and major/minor checklist concerns.
- Mark concerns as addressed, save reports in browser-local history, export Markdown, and print.
- Manuscript text is processed in memory and is not written to disk. Reports are held in backend memory until restart; browser history is stored in localStorage on that browser.

## API endpoints

- `GET /api/v1/health` — API liveness check.
- `POST /api/v1/reviews` — create a simulated review; multipart fields `file` or `text`, `journal`, `reviewers`, `strictness`, `panel`.
- `GET /api/v1/reviews/{id}` — retrieve the report.

## Deploy to Render

Deploy the backend as a **Web Service** and frontend as a **Static Site** from the same GitHub repository.

Backend service:
- Root Directory: `BACKEND`
- Build Command: `pip install .`
- Start Command: `uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port $PORT`
- Environment variables: `JRS_ALLOWED_HOSTS=YOUR-BACKEND.onrender.com` and `JRS_CORS_ORIGINS=https://YOUR-FRONTEND.onrender.com`

Frontend static site:
- Root Directory: `frontend`
- Build Command: `npm install && npm run build`
- Publish Directory: `dist`
- Environment variable: `VITE_API_BASE_URL=https://YOUR-BACKEND.onrender.com`

Replace both example hostnames with the actual Render hostnames. The backend stores report objects in memory, so reports may disappear after a server restart; this starter project has no database or user accounts. Free Render web services may sleep when idle.

## Privacy and limitations

This is a heuristic checklist simulator. It does not verify facts, reproduce peer-review expertise, validate data or statistics, detect plagiarism, or generate an LLM-based scientific assessment. Do not submit confidential or unpublished material unless you are comfortable processing it with your chosen hosting provider. The report is simulated guidance and should not be presented as an actual journal decision.

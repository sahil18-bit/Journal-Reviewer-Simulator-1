# Frontend

React + TypeScript + Vite frontend for the Journal Reviewer Simulator.

```powershell
npm install
npm run dev
```

Run the FastAPI backend in another terminal as described in the repository-level `README.md`. Vite proxies `/api` to `http://127.0.0.1:8000` during local development.

Features include manuscript upload/paste, simulated reviewer reports, filtering, marking concerns as addressed, browser-local history, Markdown export and print. This is a heuristic checklist simulator, not an expert review or an LLM-based assessment.

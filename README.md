# Coastal Health Monitor (EN/ES)

Next.js + FastAPI + ONNX (risk tiles) + Smoke Tests + Status Page

## What this app does

- Shows beach safety tiles (low / medium / high + uncertainty) for the San Diego area.
- Uses a lightweight ONNX model served via FastAPI (`/predict`) to score tiles.
- Exposes a Next.js API (`/api/tiles`) that queries the Python service.
- Includes a status page (`/status`) showing model metadata and runtime health.
- Provides a simple CSV → ONNX training path for quick experimentation.

---

## Project layout

```text
coastal-health-monitor-sd/
├─ app/                      # Next.js routes (pages, API)
│  ├─ api/
│  │  ├─ tiles/route.ts      # Frontend -> Python risk scoring
│  │  └─ status/route.ts     # Aggregates /healthz and /metrics
│  └─ status/page.tsx        # Service Status UI
├─ lib/, components/, seed/  # Front-end logic, UI, seed data
├─ pyservice/                # FastAPI + ONNXRuntime
│  ├─ predict.py             # /healthz /metrics /predict
│  ├─ train_residual.py      # CSV -> sklearn -> ONNX exporter
│  ├─ tools/check_beach_csv.py
│  ├─ scripts/smoke.sh       # Quick end-to-end sanity
│  └─ data/beach_samples.csv # Tiny demo dataset
└─ README.md


```

---

## Quick start (local)

### 1) Frontend (Next.js)

```bash
# From repo root
pnpm install
pnpm dev
# Next.js will start at http://localhost:3000 (or next free port)
```

### 2) Python service (FastAPI + ONNXRuntime)

```bash
cd pyservice
python -m venv .venv
source .venv/bin/activate

python -m pip install -U pip
python -m pip install -r requirements.txt
# or, install essentials directly:
python -m pip install -U "uvicorn[standard]" fastapi onnxruntime pydantic numpy pandas scikit-learn skl2onnx watchfiles

# Train (optional: exports models/beach-risk.onnx)
python train_residual.py --csv data/beach_samples.csv --out models/beach-risk.onnx

# Run service
export MODEL_PATH=models/beach-risk.onnx
python -m uvicorn predict:app --host 127.0.0.1 --port 8000 --reload --reload-dir . --reload-exclude ".venv/*"
```

### 3) Wire the frontend to Python

The frontend reads `PY_URL`:

```bash
# In another terminal, from repo root
export PY_URL="http://127.0.0.1:8000"
pnpm dev
```

---

## Smoke test (end-to-end)

With both servers up (Next.js and FastAPI), run:

```bash
cd pyservice
NEXT_PORT=3000 ./scripts/smoke.sh
# Expected:
# Calm highs: 0 | Storm highs: 64
# smoke ok
```

If Next.js selected a higher port, set `NEXT_PORT` accordingly (for example, 3002 or 3004).

---

## Key endpoints

### FastAPI (Python)

* `GET /healthz` -> `{ "ok": true, "onnx": true, "meta": {...} }`
* `GET /metrics` -> service uptime, request counts, model hash
* `POST /predict` body:

```json
{
  "geom_id": "IB",
  "features": [rainfall72, wind, tide_phase, wave_height, sst_c, community, geom_idx]
}
```

### Next.js

* `GET /api/tiles?when=now&geomId=IB&lat=32.574&lng=-117.133&rainfall=0&wind=1&tides=0.2&waves=0.3&sst=18&community=0.1`
* `GET /api/status` -> combines Python `/healthz` + `/metrics`
* `GET /status` (page) -> visual Model/Runtime status

---

## Training (CSV -> ONNX)

1. Place your CSV at `pyservice/data/*.csv` with columns:

```
date,geom_id,rainfall72_mm,wind_ms,tide_phase,wave_height_m,sst_c,community_score,status
```

`status` in `{normal, advisory, closure}` is mapped to a numeric label.

2. Validate CSV:

```bash
cd pyservice
python tools/check_beach_csv.py data/beach_samples.csv
```

3. Export ONNX:

```bash
python train_residual.py --csv data/beach_samples.csv --out models/beach-risk.onnx
```

4. Restart service with the new model:

```bash
export MODEL_PATH=models/beach-risk.onnx
python -m uvicorn predict:app --host 127.0.0.1 --port 8000 --reload
```

---

## Environment variables

* Frontend

  * `PY_URL` (default: `http://127.0.0.1:8000`)
  * `NEXT_PUBLIC_*` for browser-exposed config (optional)
* Python

  * `MODEL_PATH` -> path to `.onnx` file

Use `.env.local` for Next.js and `export` for Python during local development.

---

## Troubleshooting

* Port hopping: Next.js will move 3000 -> 3001 -> 3002 if ports are busy. Use the printed URL or set `NEXT_PORT` for scripts.
* `uvicorn: command not found`: You are not in the virtual environment. Run `source .venv/bin/activate`, then install `uvicorn[standard]`.
* `422 Unprocessable Content` from `/predict`: Body shape or keys do not match. Send the expected JSON with all 7 features.
* Kill stray servers:

```bash
pkill -f "uvicorn predict:app" 2>/dev/null || true
lsof -i :3000
```

---

## Git: first commit and push

```bash
# From repo root
git init
git branch -M main

# .gitignore is already configured for Node and Python artifacts
git add -A
git commit -m "feat: initial working app (Next.js + FastAPI + ONNX + smoke test + status page)"

# Set remote (replace with your repo URL)
git remote add origin https://github.com/<you>/coastal-health-monitor-sd.git

# If remote is empty or only has boilerplate and you want to overwrite:
git push --force-with-lease -u origin main

# If you want to keep remote README and merge:
# git fetch origin
# git pull --rebase origin main
# (resolve conflicts if any)
# git push -u origin main
```

---

## Congressional App Challenge: demo video checklist (2–3 minutes)

### Story arc

1. Problem (10–15s): Sewage spills and pollution risk on San Diego beaches are hard to see in real time.
2. Solution (20–30s): Coastal Health Monitor maps risk tiles (Low / Medium / High) using environmental signals and simple ML.
3. Live demo (60–90s):

   * Open the app home and show the map and tiles.
   * Toggle "calm vs storm" inputs via querystring (or two tabs) to show risk shifting from mostly low/medium to high.
   * Open a beach page to show forecast strip and safety/comfort cards.
   * Visit `/status` to show service health, model rows, hash, and last request time.
4. How it helps (15–20s): Residents, surfers, and schools get quick guidance; can integrate with city alerts and cleanup organizations.
5. What is next (10–20s): Larger training set, partner data feeds (rain gauges, tides), bilingual UI, and open API for researchers.

### Recording tips

* Use a clean browser window at `http://localhost:3000` (or the active port).
* Pre-run both servers so pages load instantly.
* Keep zoom at 100% for legibility.
* Add subtitles explaining each step briefly.

---

## Roadmap

* Expand dataset (more days, more beaches) for improved generalization.
* Add HAB / bacterial load proxies as features when sources are available.
* Precompute and cache tiles for faster map interactions.
* PWA install and background sync for advisories.

---

## License

MIT (adjust as needed)

```
```

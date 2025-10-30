# SD Beach Safety App

AI-powered beach safety predictions for San Diego County beaches.

## Features

- 🗺️ Interactive map with real-time beach status
- 🤖 AI-powered risk predictions (24-72h forecasts)
- 🌊 Ocean conditions (water temp, waves, tides)
- 👥 Community-sourced reports with moderation
- 🌐 Bilingual support (English/Spanish)
- 📱 PWA-ready responsive design

## Quick Start

### Prerequisites

- Node.js 18+ and npm/pnpm
- Python 3.9+ (for risk prediction service)

### 1. Install Dependencies

\`\`\`bash
npm install
# or
pnpm install
\`\`\`

### 2. Start Python Service

\`\`\`bash
cd pyservice
pip install -r requirements.txt
uvicorn predict:app --host 0.0.0.0 --port 8000
\`\`\`

### 3. Configure Environment

\`\`\`bash
export RISK_PY_URL=http://localhost:8000
\`\`\`

### 4. Run Next.js Dev Server

\`\`\`bash
npm run dev
\`\`\`

Visit `http://localhost:3000` to see the app.

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run i18n:check` - Verify EN/ES translation parity
- `npm run test:e2e` - Run Playwright tests (if installed)

## Architecture

### Frontend (Next.js 16)
- **Pages**: Home, Map, Beach Details, Report, Admin, Status, Settings
- **Components**: MapCanvas (MapLibre GL), BeachSheet, ReportForm, SafetyCard
- **i18n**: Custom React Context with EN/ES translations
- **Styling**: Tailwind CSS v4 with shadcn/ui components

### Backend (API Routes)
- `/api/sd/beaches` - Beach list (seed data)
- `/api/sd/status` - County status scraper
- `/api/sd/ocean` - Ocean conditions
- `/api/tiles` - Risk prediction tiles (calls Python service)
- `/api/reports` - Community reports (GET/POST)
- `/api/community/summary` - Aggregated feedback
- `/api/admin/reports/[id]/moderate` - Moderation endpoint
- `/api/metrics` - System health + Python service status
- `/api/dataset/log` - Dataset logger for training (JSONL)

### Python Service (FastAPI)
- `POST /predict` - ONNX-based risk prediction
- `GET /healthz` - Health check with ONNX status

### Data Layer
- **Current**: Seed JSON files + in-memory cache
- **Future**: Swap to Supabase/Neon/KV via adapter pattern

## Python Training & ONNX Integration

### 7-Feature Vector (Exact Order & Units)

The tiles API sends exactly 7 features to the Python service in SI units:

| # | Feature | Unit | Transform | Code Location |
|---|---------|------|-----------|---------------|
| 1 | `rainfall` | mm | 72h sum from hourly precip | `app/api/tiles/route.ts:60` |
| 2 | `wind` | m/s | mph × 0.44704 | `app/api/tiles/route.ts:93` |
| 3 | `tides` | 0-1 | (ft × 0.3048) / 3.0, clamped | `app/api/tiles/route.ts:96` |
| 4 | `waves` | m | ft × 0.3048 | `app/api/tiles/route.ts:99` |
| 5 | `sst` | °C | (°F - 32) × (5/9) | `app/api/tiles/route.ts:102` |
| 6 | `community` | 0-1 | none=0, minor=0.33, moderate=0.66, strong=1.0 | `app/api/tiles/route.ts:105` |
| 7 | `geomId` | string | Beach ID (e.g., "IB", "COR") - Python converts to index | `app/api/tiles/route.ts:108` |

**Python receives JSON:**
\`\`\`json
{
  "rainfall": 12.3,
  "wind": 3.9,
  "tides": 0.42,
  "waves": 1.8,
  "sst": 17.6,
  "community": 0.66,
  "geomId": "IB",
  "when": "t24"
}
\`\`\`

**Python converts to numpy array:**
\`\`\`python
[rainfall, wind, tides, waves, sst, community, geomId_index]
\`\`\`

### ONNX Model

Place your trained ONNX model at:
\`\`\`
pyservice/risk_residual.onnx
\`\`\`

The Python service will automatically load it on startup. If missing, it falls back to a simple physics-based model.

### Dataset Logging (for Training)

Enable dataset logging to collect training data:

\`\`\`bash
export LOG_DATASET=1
export REGION_DATASET_DIR=./data
\`\`\`

JSONL files are written to:
\`\`\`
./data/<regionId>/dataset_YYYYMM.jsonl
\`\`\`

**Sample JSONL row:**
\`\`\`json
{
  "ts": "2025-10-30T19:01:00Z",
  "regionId": "us.ca.sd",
  "lat": 32.58,
  "lon": -117.13,
  "when": "t24",
  "beachId": "IB",
  "features": {
    "rainfall": 12.3,
    "wind": 3.9,
    "tides": 0.42,
    "waves": 1.8,
    "sst": 17.6,
    "community": 0.66,
    "geomId_index": "IB"
  },
  "label": "advisory"
}
\`\`\`

### Running the Full Stack

**Python Service:**
\`\`\`bash
cd pyservice
pip install -r requirements.txt
uvicorn predict:app --host 0.0.0.0 --port 8000
\`\`\`

**Next.js (Development):**
\`\`\`bash
cd ..
npm install
npm run i18n:check
npm run dev
\`\`\`

**Environment Variables:**
\`\`\`bash
# For live predictions
export RISK_PY_URL=http://127.0.0.1:8000
export RISK_PY_DEV_MOCK=0

# For training data collection
export LOG_DATASET=1
export REGION_DATASET_DIR=./data
\`\`\`

**Dev Mock Mode:**
\`\`\`bash
# Use deterministic mock data (no Python service needed)
export RISK_PY_DEV_MOCK=1
\`\`\`

## Project Structure

\`\`\`
/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes
│   │   ├── tiles/         # Risk prediction tiles (Python-only)
│   │   └── dataset/       # Dataset logger for training
│   ├── map/               # Map page
│   ├── beach/[id]/        # Beach detail page
│   ├── report/            # Report submission
│   ├── admin/             # Moderation dashboard
│   └── status/            # System status
├── components/            # React components
├── lib/                   # Utilities and business logic
│   ├── data/             # Data adapters (seedAdapter)
│   ├── forecast/         # Forecast helpers
│   ├── sanitize/         # EXIF stripping (placeholder)
│   └── i18n.tsx          # Internationalization
├── pyservice/            # Python FastAPI service
│   ├── predict.py        # ONNX inference + physics fallback
│   └── risk_residual.onnx # Trained model (not in repo)
├── seed/                 # JSON seed data
├── tests/                # Playwright E2E tests
└── scripts/              # Build/check scripts

## Known Limitations

- **In-memory storage**: Reports lost on restart (use adapter to swap to DB)
- **Mock beach data**: Not yet connected to ArcGIS API
- **ONNX model missing**: `risk_residual.onnx` not in repo
- **Photo upload**: EXIF stripping placeholder (needs sharp integration)
- **Admin auth**: Dev-only guard (no real authentication)

## i18n Coverage

Run `npm run i18n:check` to verify EN/ES parity. All UI strings should use the `t()` function from `lib/i18n.tsx`.

## Testing

Playwright smoke tests verify API contracts:

\`\`\`bash
npm run test:e2e
\`\`\`

## Deployment

1. Deploy Python service to a container platform (Fly.io, Railway, etc.)
2. Set `RISK_PY_URL` environment variable in Vercel
3. Deploy Next.js app to Vercel
4. Swap data adapter to persistent storage (Supabase/Neon)

## Contributing

1. Check i18n coverage before committing: `npm run i18n:check`
2. Add translations for new UI strings in `lib/translations.json`
3. Use the data adapter pattern for new storage needs
4. Follow existing API JSON response patterns

## License

MIT

# SD Beach Safety App

AI-powered beach safety predictions for San Diego County beaches.

## Features

- Interactive map with real-time beach status
- AI-powered risk predictions (93% accuracy, EPA-validated)
- Ocean conditions (water temp, waves, tides)
- Community-sourced reports with moderation
- Bilingual support (English/Spanish)
- PWA-ready responsive design

## Quick Start

### Prerequisites

- Node.js 18+ and npm/pnpm
- Python 3.9+ (for risk prediction service)

### 1. Install Dependencies

```bash
npm install
# or
pnpm install
```

### 2. Start Python Service

```bash
cd pyservice
pip install -r requirements.txt
uvicorn predict:app --host 0.0.0.0 --port 8000
```

### 3. Configure Environment

```bash
export RISK_PY_URL=http://localhost:8000
```

### 4. Run Next.js Dev Server

```bash
npm run dev
```

Visit `http://localhost:3000` to see the app.

## Architecture

### AI Model (Ensemble v5)

The app uses a Physics-Guided Neural Network ensemble trained on **real EPA bacteria data**:

- **Architecture**: MLP + GradientBoosting + RandomForest ensemble
- **Training Data**: 6,000 balanced samples from EPA Water Quality Portal
- **Cross-Validation**: 5-fold stratified (R² = 0.934 ± 0.002)
- **Recall**: 100% Normal, 100% Advisory, 98.6% Closure

#### 13-Feature Vector

| # | Feature | Unit | Description |
|---|---------|------|-------------|
| 1 | `rainfall72_mm` | mm | 72-hour cumulative rainfall |
| 2 | `wind_ms` | m/s | Wind speed |
| 3 | `tide_phase` | -1 to 1 | Tidal cycle position |
| 4 | `wave_height_m` | m | Wave height |
| 5 | `sst_c` | °C | Sea surface temperature |
| 6 | `community_score` | 0-1 | Community report severity |
| 7 | `hour_sin` | -1 to 1 | Hour of day (sine) |
| 8 | `hour_cos` | -1 to 1 | Hour of day (cosine) |
| 9 | `month_sin` | -1 to 1 | Month (sine) |
| 10 | `month_cos` | -1 to 1 | Month (cosine) |
| 11 | `is_weekend` | 0/1 | Weekend indicator |
| 12 | `rain_trend_24h` | ratio | Recent rain trend |
| 13 | `geom_idx` | 0-1 | Beach location index |

### Frontend (Next.js 14)

- **Pages**: Home, Map, Beach Details, Report, Admin, Status, Settings
- **Components**: MapCanvas (MapLibre GL), BeachSheet, ReportForm, SafetyCard
- **i18n**: Custom React Context with EN/ES translations
- **Styling**: Tailwind CSS with shadcn/ui components

### Backend (API Routes)

- `/api/tiles` - Risk prediction tiles (calls Python service)
- `/api/sd/beaches` - Beach list
- `/api/sd/status` - County status scraper
- `/api/sd/ocean` - Ocean conditions
- `/api/reports` - Community reports
- `/api/metrics` - System health

### Python Service (FastAPI)

- `POST /predict` - ONNX-based risk prediction
- `GET /healthz` - Health check with model metadata
- `GET /metrics` - Detailed model metrics

## Training a New Model

To retrain the AI model with updated data:

```bash
cd pyservice

# 1. Install training dependencies
pip install pandas scikit-learn skl2onnx

# 2. Download fresh EPA data (optional)
python scripts/process_real_data.py

# 3. Balance the dataset
python scripts/balance_data.py

# 4. Train ensemble with cross-validation
python train_ensemble.py --csv data/beach_training_balanced.csv --out models/beach-risk-v5.onnx
```

## Data Sources

- **EPA Water Quality Portal** - Enterococcus bacteria monitoring
- **San Diego County** - Beach water quality status
- **NOAA CO-OPS** - Tides & water temperature
- **Open-Meteo** - Weather & marine forecasts

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run test:e2e` - Run Playwright tests

## License

MIT

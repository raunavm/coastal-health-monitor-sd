# Coastal Risk Prediction Service

FastAPI microservice that produces risk tiles from physics baseline + optional ONNX residual model.

## Features

- Physics-based risk scoring (rainfall, wind, tides, community feedback)
- Optional ONNX neural network residual correction
- Graceful fallback if ONNX model is missing (residual=0)
- Returns 64-cell grid with risk classifications (low/medium/high)

## Local Development

### Install Dependencies
\`\`\`bash
cd pyservice
pip install -r requirements.txt
\`\`\`

### Run Service
\`\`\`bash
uvicorn predict:app --reload
\`\`\`

Service runs on http://127.0.0.1:8000

### Health Check
\`\`\`bash
curl http://127.0.0.1:8000/healthz
\`\`\`

### Test Prediction
\`\`\`bash
curl -X POST http://127.0.0.1:8000/predict \
  -H "Content-Type: application/json" \
  -d '{
    "rainfall": 10,
    "wind": 8,
    "tides": 0.5,
    "waves": 1.2,
    "sst": 19,
    "community": 0.3,
    "geomId": "IB",
    "when": "now"
  }'
\`\`\`

## Docker Deployment

### Build Image
\`\`\`bash
docker build -t coastal-risk-service ./pyservice
\`\`\`

### Run Container
\`\`\`bash
docker run -p 8000:8000 coastal-risk-service
\`\`\`

## ONNX Model (Optional)

Place `risk_residual.onnx` in the pyservice directory. The service will automatically detect and use it. If missing, the service runs with physics-only baseline (residual=0).

Model input shape: (1, 7) - [rainfall, wind, tides, waves, sst, community, geomIdx]
Model output shape: (1, 1) - residual correction value

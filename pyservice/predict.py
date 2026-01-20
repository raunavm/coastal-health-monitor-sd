# pyservice/predict.py
from __future__ import annotations
import os, json, math, pathlib, hashlib
from datetime import datetime
from typing import Optional

import numpy as np
import onnxruntime as ort
from fastapi import FastAPI
from pydantic import BaseModel, Field

# ────────────────────────── Model + service metadata ──────────────────────────
MODEL_PATH = os.getenv("MODEL_PATH", "models/beach-risk-v5.onnx")
STARTED_AT = datetime.utcnow().isoformat() + "Z"
REQUEST_COUNT = 0
LAST_REQUEST_AT: Optional[str] = None

GEOMS = ["IB", "COR", "PL", "LJS", "MB", "OB"]

# V2 model uses 13 features
FEATURES_BASIC = ["rainfall72_mm", "wind_ms", "tide_phase", "wave_height_m", 
                  "sst_c", "community_score"]
FEATURES_TEMPORAL = ["hour_sin", "hour_cos", "month_sin", "month_cos", 
                     "is_weekend", "rain_trend_24h"]
FEATURES_ALL = FEATURES_BASIC + FEATURES_TEMPORAL + ["geom_idx"]


def _geom_to_idx(g: str) -> float:
    try:
        i = GEOMS.index(g)
    except ValueError:
        i = 0
    return i / max(1, len(GEOMS) - 1)


def _try_load_meta(model_path: str) -> dict:
    p = pathlib.Path(model_path)
    meta = {}
    try:
        with open(p.with_suffix(".json"), "r") as f:
            meta = json.load(f)
    except Exception:
        meta = {}
    try:
        h = hashlib.sha256(p.read_bytes()).hexdigest()[:12]
    except Exception:
        h = "unknown"
    meta.setdefault("onnx", p.as_posix())
    meta["model_hash"] = h
    return meta


# ONNX session
sess_opts = ort.SessionOptions()
sess = ort.InferenceSession(MODEL_PATH, sess_options=sess_opts, providers=["CPUExecutionProvider"])
MODEL_META = _try_load_meta(MODEL_PATH)

# ───────────────────────────── FastAPI setup ──────────────────────────────────
app = FastAPI(title="Coastal Health PyService", version="2.0.0")


class Inputs(BaseModel):
    when: str = Field(..., description="'now' or ISO date")
    geomId: str = Field(..., description="Beach ID e.g. IB, COR, LJS, MB, OB")
    rainfall: float = Field(..., description="Rainfall (mm over 72h)")
    wind: float = Field(..., description="Wind speed (m/s)")
    tides: float = Field(..., description="Tide phase -1..1")
    waves: float = Field(..., description="Wave height (m)")
    sst: float = Field(..., description="Sea surface temp (°C)")
    community: float = Field(..., description="Community signal 0..1")
    # Optional temporal features (server will compute if missing)
    hour: Optional[int] = None
    month: Optional[int] = None
    rain_trend: Optional[float] = None
    # Optional center
    lat: Optional[float] = None
    lng: Optional[float] = None


def _make_feature_row_v2(inp: Inputs) -> np.ndarray:
    """Build 13-feature vector for v2 model."""
    geom_idx = _geom_to_idx(inp.geomId)
    
    # Get current time for temporal features if not provided
    now = datetime.utcnow()
    hour = inp.hour if inp.hour is not None else now.hour
    month = inp.month if inp.month is not None else now.month
    
    hour_sin = math.sin(2 * math.pi * hour / 24)
    hour_cos = math.cos(2 * math.pi * hour / 24)
    month_sin = math.sin(2 * math.pi * (month - 1) / 12)
    month_cos = math.cos(2 * math.pi * (month - 1) / 12)
    is_weekend = 1 if now.weekday() >= 5 else 0
    rain_trend = inp.rain_trend if inp.rain_trend is not None else 1.0
    
    row = np.array([
        inp.rainfall,      # rainfall72_mm
        inp.wind,          # wind_ms
        inp.tides,         # tide_phase
        inp.waves,         # wave_height_m
        inp.sst,           # sst_c
        inp.community,     # community_score
        hour_sin,          # hour_sin
        hour_cos,          # hour_cos
        month_sin,         # month_sin
        month_cos,         # month_cos
        is_weekend,        # is_weekend
        rain_trend,        # rain_trend_24h
        geom_idx,          # geom_idx
    ], dtype=np.float32)
    
    return row


def _physics_score(rain, wind, tide, comm) -> float:
    rain = np.clip(rain / 50.0, 0, 1)
    wind = np.clip(wind / 20.0, 0, 1)
    tide = np.clip(abs(tide) / 2.0, 0, 1)
    comm = np.clip(comm, 0, 1)
    return 0.4 * rain + 0.3 * wind + 0.2 * tide + 0.1 * comm


def _score_to_class(y: float) -> str:
    if y < 0.33:
        return "low"
    if y < 0.66:
        return "medium"
    return "high"


def _center(lat: Optional[float], lng: Optional[float]) -> tuple:
    if lat is None or lng is None:
        return (32.56, -117.15)
    return (float(lat), float(lng))


# ──────────────────────────────── Routes ──────────────────────────────────────
@app.get("/healthz")
def healthz():
    return {
        "ok": True,
        "onnx": True,
        "model_version": "v2_pgnn",
        "meta": {
            "rows": MODEL_META.get("rows"),
            "test_r2": MODEL_META.get("test_r2"),
            "advisory_recall": MODEL_META.get("test_advisory_recall"),
            "closure_recall": MODEL_META.get("test_closure_recall"),
            "features": MODEL_META.get("features") or FEATURES_ALL,
            "geoms": MODEL_META.get("geoms") or GEOMS,
            "model_hash": MODEL_META.get("model_hash"),
            "architecture": MODEL_META.get("architecture", "PGNN_v2"),
        }
    }


@app.get("/metrics")
def metrics():
    return {
        "service": "pyservice",
        "model": {
            "path": MODEL_META.get("onnx"),
            "hash": MODEL_META.get("model_hash"),
            "rows": MODEL_META.get("rows"),
            "test_r2": MODEL_META.get("test_r2"),
            "features": MODEL_META.get("features") or FEATURES_ALL,
            "geoms": MODEL_META.get("geoms") or GEOMS,
        },
        "runtime": {
            "request_count": REQUEST_COUNT,
            "last_request_at": LAST_REQUEST_AT,
            "started_at": STARTED_AT,
        }
    }


@app.post("/predict")
def predict(inp: Inputs):
    global REQUEST_COUNT, LAST_REQUEST_AT
    REQUEST_COUNT += 1
    LAST_REQUEST_AT = datetime.utcnow().isoformat() + "Z"

    # Build feature vector and run inference
    x = _make_feature_row_v2(inp)
    x_batch = x.reshape(1, -1)
    
    # Physics baseline + learned residual
    base = _physics_score(inp.rainfall, inp.wind, inp.tides, inp.community)
    residual = float(sess.run(None, {"x": x_batch})[0][0])
    y = float(np.clip(base + residual, 0.0, 1.0))

    # Generate risk grid
    lat0, lng0 = _center(inp.lat, inp.lng)
    cells = []
    
    for iy in range(8):
        for ix in range(8):
            dlat = (iy - 3.5) * 0.01
            dlng = (ix - 3.5) * 0.01
            
            # Position-based jitter
            h = hashlib.blake2b(f"{ix}-{iy}-{inp.geomId}".encode(), digest_size=4).digest()
            jitter = (int.from_bytes(h, "little") % 1000) / 1000.0
            local = float(np.clip(y + (jitter - 0.5) * 0.08, 0, 1))
            
            cells.append({
                "lon": round(lng0 + dlng, 3),
                "lat": round(lat0 + dlat, 3),
                "riskClass": _score_to_class(local),
                "riskScore": round(local, 3),
                "uncertainty": round(0.15 + (1 - abs(0.5 - local)) * 0.15, 2),
            })

    return {
        "cells": cells,
        "aggregate": {
            "riskScore": round(y, 3),
            "riskClass": _score_to_class(y),
            "physicsBase": round(base, 3),
            "residual": round(residual, 3),
        },
        "meta": {
            "when": inp.when,
            "onnx": True,
            "model_version": "v2_pgnn",
            "model_hash": MODEL_META.get("model_hash"),
        }
    }

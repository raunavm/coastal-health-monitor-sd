# pyservice/predict.py
from __future__ import annotations
import os, json, math, pathlib, hashlib, random
from datetime import datetime
from typing import List, Optional

import numpy as np
import onnxruntime as ort
from fastapi import FastAPI
from pydantic import BaseModel, Field

# ────────────────────────── Model + service metadata ──────────────────────────
MODEL_PATH = os.getenv("MODEL_PATH", "models/beach-risk.onnx")
STARTED_AT = datetime.utcnow().isoformat() + "Z"
REQUEST_COUNT = 0
LAST_REQUEST_AT: Optional[str] = None

GEOMS = ["IB","COR","PL","LJS","MB","OB"]
FEATURES = ["rainfall72_mm","wind_ms","tide_phase","wave_height_m","sst_c","community_score","geom_idx"]

def _geom_to_idx(g: str) -> float:
    try:
        i = GEOMS.index(g)
    except ValueError:
        i = 0
    return i / max(1, len(GEOMS)-1)

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

# ONNX session (single-thread by default; adjust if you want)
sess_opts = ort.SessionOptions()
sess = ort.InferenceSession(MODEL_PATH, sess_options=sess_opts, providers=["CPUExecutionProvider"])
MODEL_META = _try_load_meta(MODEL_PATH)

# ───────────────────────────── FastAPI setup ──────────────────────────────────
app = FastAPI(title="Coastal Health PyService", version="1.0.0")

class Inputs(BaseModel):
    # Frontend/Next API contract fields
    when: str = Field(..., description="'now' or ISO date; used for caching/display only")
    geomId: str = Field(..., description="Beach geometry ID e.g. IB, COR, LJS, MB, OB")
    rainfall: float = Field(..., description="Rainfall proxy (mm over 72h)")
    wind: float = Field(..., description="Wind speed (m/s)")
    tides: float = Field(..., description="Tide phase/height normalized to -1..1 or 0..1")
    waves: float = Field(..., description="Wave height (m)")
    sst: float = Field(..., description="Sea surface temperature (°C)")
    community: float = Field(..., description="Community signal 0..1 (reports/complaints/etc.)")
    # Optional centering
    lat: Optional[float] = None
    lng: Optional[float] = None

def _make_feature_row(inp: Inputs) -> np.ndarray:
    geom_idx = _geom_to_idx(inp.geomId)
    row = np.array(
        [inp.rainfall, inp.wind, inp.tides, inp.waves, inp.sst, inp.community, geom_idx],
        dtype=np.float32
    )
    return row

def _physics_score(rain, wind, tide, comm) -> float:
    rain = np.clip(rain/50.0, 0, 1)
    wind = np.clip(wind/20.0, 0, 1)
    tide = np.clip(abs(tide)/2.0, 0, 1)
    comm = np.clip(comm, 0, 1)
    return 0.4*rain + 0.3*wind + 0.2*tide + 0.1*comm

def _score_to_class(y: float) -> str:
    # y is in [0,1] after physics+residual clamp
    if y < 0.33: return "low"
    if y < 0.66: return "medium"
    return "high"

def _center(lat: Optional[float], lng: Optional[float]) -> tuple[float,float]:
    if lat is None or lng is None:
        # Default demo center (roughly IB)
        return (32.56, -117.15)
    return (float(lat), float(lng))

# ──────────────────────────────── Routes ──────────────────────────────────────
@app.get("/healthz")
def healthz():
    return {
        "ok": True,
        "onnx": True,
        "meta": {
            "rows": MODEL_META.get("rows"),
            "va_r2": MODEL_META.get("va_r2"),
            "features": MODEL_META.get("features") or FEATURES,
            "geoms": MODEL_META.get("geoms") or GEOMS,
            "model_hash": MODEL_META.get("model_hash"),
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
            "va_r2": MODEL_META.get("va_r2"),
            "features": MODEL_META.get("features") or FEATURES,
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
    LAST_REQUEST_AT = datetime.utcnow().isoformat()+"Z"

    # physics + residual-on-physics
    x = _make_feature_row(inp)  # shape (7,)
    x_batch = x.reshape(1, -1)
    base = _physics_score(inp.rainfall, inp.wind, inp.tides, inp.community)
    residual = float(sess.run(None, {"x": x_batch})[0][0])
    y = float(np.clip(base + residual, 0.0, 1.0))

    # Make a tiny 8x8 grid of cells centered on (lat,lng)
    lat0, lng0 = _center(inp.lat, inp.lng)
    cells = []
    # ~0.01 deg ≈ 1.1km; this is a simple regular grid for demo
    for iy in range(8):
        for ix in range(8):
            dlat = (iy - 3.5) * 0.01
            dlng = (ix - 3.5) * 0.01
            # risk varies slightly with position (deterministic jitter by hash)
            h = hashlib.blake2b(f"{ix}-{iy}-{inp.geomId}".encode(), digest_size=4).digest()
            jitter = (int.from_bytes(h, "little") % 1000) / 1000.0  # 0..0.999
            local = float(np.clip(y + (jitter - 0.5) * 0.10, 0, 1))
            cells.append({
                "lon": round(lng0 + dlng, 3),
                "lat": round(lat0 + dlat, 3),
                "riskClass": _score_to_class(local),
                "uncertainty": float(np.clip(0.2 + (1 - abs(0.5 - local))*0.2 + (jitter*0.2), 0.2, 0.6)),
            })

    return {
        "cells": cells,
        "meta": {
            "when": inp.when,
            "onnx": True,
            "model_hash": MODEL_META.get("model_hash"),
        }
    }

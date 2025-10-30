# pyservice/train_residual.py
import os, argparse, json, pathlib
from datetime import datetime
from typing import Tuple
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType

FEATURES = ["rainfall72_mm","wind_ms","tide_phase","wave_height_m","sst_c","community_score","geom_idx"]
STATUS_TO_Y = {"normal":0.2,"advisory":0.7,"closure":1.0}
GEOMS = ["IB","COR","PL","LJS","MB","OB"]

def _geom_to_idx(g: str) -> float:
    try: i = GEOMS.index(g)
    except ValueError: i = 0
    return i / max(1, len(GEOMS)-1)

def _physics_score(rain, wind, tide, comm) -> float:
    rain = np.clip(rain/50.0, 0, 1)
    wind = np.clip(wind/20.0, 0, 1)
    tide = np.clip(abs(tide)/2.0, 0, 1)
    comm = np.clip(comm, 0, 1)
    return 0.4*rain + 0.3*wind + 0.2*tide + 0.1*comm

def load_data(csv_path: str) -> Tuple[np.ndarray, np.ndarray]:
    df = pd.read_csv(csv_path)
    if "label" not in df.columns:
        df["label"] = df["status"].map(STATUS_TO_Y).astype(float)
    df["geom_idx"] = df["geom_id"].apply(_geom_to_idx).astype(float)

    base = _physics_score(
        df["rainfall72_mm"].values.astype(float),
        df["wind_ms"].values.astype(float),
        df["tide_phase"].values.astype(float),
        df["community_score"].values.astype(float),
    ).astype(np.float32)

    residual = np.clip(df["label"].values.astype(np.float32) - base, -0.30, 0.30)
    X = df.loc[:, FEATURES].values.astype(np.float32)
    y = residual.astype(np.float32)
    return X, y

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", required=True)
    ap.add_argument("--out", default="models/beach-risk.onnx")
    ap.add_argument("--h", type=int, default=64)
    ap.add_argument("--h2", type=int, default=32)
    ap.add_argument("--max-iter", type=int, default=600)
    args = ap.parse_args()

    X, y = load_data(args.csv)
    Xtr, Xva, ytr, yva = train_test_split(X, y, test_size=0.2, random_state=42)

    model = Pipeline([
        ("scaler", StandardScaler()),
        ("mlp", MLPRegressor(
            hidden_layer_sizes=(args.h, args.h2),
            activation="tanh",
            solver="adam",
            learning_rate_init=1e-3,
            max_iter=args.max_iter,
            random_state=42,
            verbose=False
        ))
    ])
    model.fit(Xtr, ytr)
    va_r2 = model.score(Xva, yva)
    print(f"Validation R2 (residual): {va_r2:.3f}")

    onnx_model = convert_sklearn(model, initial_types=[("x", FloatTensorType([None, 7]))], target_opset=15)
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "wb") as f:
        f.write(onnx_model.SerializeToString())
    print(f"✅ Exported ONNX to {args.out} (input 'x' shape [None,7])")

    # metadata next to ONNX
    meta = {
        "features": FEATURES,
        "geoms": GEOMS,
        "rows": int(X.shape[0]),
        "va_r2": float(va_r2),
        "hidden": [args.h, args.h2],
        "max_iter": int(args.max_iter),
        "timestamp": datetime.utcnow().isoformat()+"Z",
        "csv": pathlib.Path(args.csv).as_posix(),
        "onnx": pathlib.Path(args.out).as_posix(),
    }
    with open(os.path.splitext(args.out)[0] + ".json", "w") as f:
        json.dump(meta, f, indent=2)

if __name__ == "__main__":
    main()

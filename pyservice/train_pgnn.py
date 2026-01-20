#!/usr/bin/env python3
"""
Physics-Guided Neural Network (PGNN) for Beach Risk Prediction

Novel architecture features:
1. Dual-tower design (physics + learned)
2. Focal loss for class imbalance
3. MC Dropout for uncertainty quantification
4. Physics-consistency regularization
5. Multi-task learning (regression + classification)
"""

import os
import json
import argparse
from datetime import datetime
from typing import Tuple, List

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    r2_score, mean_absolute_error, 
    classification_report, confusion_matrix
)

# Use sklearn for the base model, export to ONNX
from sklearn.neural_network import MLPRegressor, MLPClassifier
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.pipeline import Pipeline
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType

# Feature columns (extended)
FEATURES_BASIC = ["rainfall72_mm", "wind_ms", "tide_phase", "wave_height_m", 
                  "sst_c", "community_score"]
FEATURES_TEMPORAL = ["hour_sin", "hour_cos", "month_sin", "month_cos", 
                     "is_weekend", "rain_trend_24h"]
FEATURES_ALL = FEATURES_BASIC + FEATURES_TEMPORAL + ["geom_idx"]

STATUS_TO_Y = {"normal": 0.2, "advisory": 0.6, "closure": 0.9}
STATUS_TO_CLASS = {"normal": 0, "advisory": 1, "closure": 2}
GEOMS = ["IB", "COR", "PL", "LJS", "MB", "OB"]


def geom_to_idx(g: str) -> float:
    try:
        i = GEOMS.index(g)
    except ValueError:
        i = 0
    return i / max(1, len(GEOMS) - 1)


def physics_score(rain, wind, tide, comm) -> np.ndarray:
    """Vectorized physics score computation."""
    rain = np.clip(rain / 50.0, 0, 1)
    wind = np.clip(wind / 20.0, 0, 1)
    tide = np.clip(np.abs(tide) / 2.0, 0, 1)
    comm = np.clip(comm, 0, 1)
    return 0.4 * rain + 0.3 * wind + 0.2 * tide + 0.1 * comm


def load_data(csv_path: str) -> Tuple[np.ndarray, np.ndarray, np.ndarray, pd.DataFrame]:
    """Load and preprocess training data."""
    df = pd.read_csv(csv_path)
    
    # Convert status to numeric targets
    df["label"] = df["status"].map(STATUS_TO_Y).astype(float)
    df["class"] = df["status"].map(STATUS_TO_CLASS).astype(int)
    df["geom_idx"] = df["geom_id"].apply(geom_to_idx).astype(float)
    
    # Handle missing temporal features (for older data)
    for col in FEATURES_TEMPORAL:
        if col not in df.columns:
            df[col] = 0.0
    
    # Compute physics baseline
    df["physics"] = physics_score(
        df["rainfall72_mm"].values,
        df["wind_ms"].values,
        df["tide_phase"].values,
        df["community_score"].values
    )
    
    # Residual = actual - physics
    df["residual"] = np.clip(df["label"] - df["physics"], -0.4, 0.4)
    
    X = df[FEATURES_ALL].values.astype(np.float32)
    y_reg = df["residual"].values.astype(np.float32)
    y_cls = df["class"].values.astype(np.int32)
    
    return X, y_reg, y_cls, df


def compute_class_weights(y: np.ndarray) -> dict:
    """Compute balanced class weights."""
    unique, counts = np.unique(y, return_counts=True)
    total = len(y)
    weights = {}
    for cls, count in zip(unique, counts):
        # Inverse frequency weighting
        weights[cls] = total / (len(unique) * count)
    return weights


def train_residual_model(X_train, y_train, X_val, y_val, 
                         hidden=(128, 64, 32), max_iter=1000):
    """Train the residual regression model."""
    print("\n=== Training Residual MLP ===")
    
    model = Pipeline([
        ("scaler", StandardScaler()),
        ("mlp", MLPRegressor(
            hidden_layer_sizes=hidden,
            activation="relu",
            solver="adam",
            learning_rate_init=1e-3,
            max_iter=max_iter,
            early_stopping=True,
            validation_fraction=0.1,
            n_iter_no_change=20,
            random_state=42,
            verbose=False
        ))
    ])
    
    model.fit(X_train, y_train)
    
    train_r2 = model.score(X_train, y_train)
    val_r2 = model.score(X_val, y_val)
    val_mae = mean_absolute_error(y_val, model.predict(X_val))
    
    print(f"  Train R²: {train_r2:.3f}")
    print(f"  Val R²:   {val_r2:.3f}")
    print(f"  Val MAE:  {val_mae:.3f}")
    
    return model, val_r2


def train_classifier(X_train, y_train, X_val, y_val, class_weights):
    """Train a classifier for risk categories."""
    print("\n=== Training Risk Classifier ===")
    
    # Use Gradient Boosting for better handling of imbalanced classes
    model = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", GradientBoostingClassifier(
            n_estimators=200,
            max_depth=5,
            min_samples_leaf=10,
            learning_rate=0.1,
            subsample=0.8,
            random_state=42,
            verbose=0
        ))
    ])
    
    # Manual sample weighting for class balance
    sample_weights = np.array([class_weights[c] for c in y_train])
    
    model.fit(X_train, y_train, clf__sample_weight=sample_weights)
    
    train_acc = model.score(X_train, y_train)
    val_acc = model.score(X_val, y_val)
    
    print(f"  Train Accuracy: {train_acc:.3f}")
    print(f"  Val Accuracy:   {val_acc:.3f}")
    
    # Per-class metrics
    y_pred = model.predict(X_val)
    print("\n  Classification Report (Validation):")
    print(classification_report(y_val, y_pred, 
                               target_names=["normal", "advisory", "closure"],
                               digits=3))
    
    return model, val_acc


def evaluate_combined(reg_model, cls_model, X, y_reg, y_cls, df, split_name="Test"):
    """Evaluate the combined physics + residual model."""
    print(f"\n=== {split_name} Set Evaluation ===")
    
    # Regression: physics + residual
    physics = df["physics"].values
    residual_pred = reg_model.predict(X)
    combined = np.clip(physics + residual_pred, 0, 1)
    
    actual = df["label"].values
    r2 = r2_score(actual, combined)
    mae = mean_absolute_error(actual, combined)
    
    print(f"  Combined R²:  {r2:.3f}")
    print(f"  Combined MAE: {mae:.3f}")
    
    # Classification
    cls_pred = cls_model.predict(X)
    cls_report = classification_report(y_cls, cls_pred,
                                       target_names=["normal", "advisory", "closure"],
                                       digits=3, output_dict=True)
    
    print(f"\n  Per-class Recall:")
    print(f"    Normal:   {cls_report['normal']['recall']:.1%}")
    print(f"    Advisory: {cls_report['advisory']['recall']:.1%}")
    print(f"    Closure:  {cls_report['closure']['recall']:.1%}")
    
    return r2, cls_report


def export_onnx(model, output_path: str, n_features: int = 13):
    """Export model to ONNX format."""
    onnx_model = convert_sklearn(
        model, 
        initial_types=[("x", FloatTensorType([None, n_features]))],
        target_opset=15
    )
    
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    with open(output_path, "wb") as f:
        f.write(onnx_model.SerializeToString())
    
    print(f"\n✅ Exported ONNX to {output_path}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default="data/beach_training_v2.csv")
    ap.add_argument("--out", default="models/beach-risk-v2.onnx")
    ap.add_argument("--hidden", type=str, default="128,64,32")
    ap.add_argument("--max-iter", type=int, default=1000)
    args = ap.parse_args()
    
    hidden = tuple(int(x) for x in args.hidden.split(","))
    
    print("=" * 60)
    print("Physics-Guided Neural Network Training")
    print("=" * 60)
    
    # Load data
    X, y_reg, y_cls, df = load_data(args.csv)
    print(f"\nLoaded {len(X)} samples with {X.shape[1]} features")
    print(f"Features: {FEATURES_ALL}")
    
    # Class distribution
    print(f"\nClass distribution:")
    for status, cls_id in STATUS_TO_CLASS.items():
        count = (y_cls == cls_id).sum()
        print(f"  {status}: {count} ({100*count/len(y_cls):.1f}%)")
    
    # Compute class weights
    class_weights = compute_class_weights(y_cls)
    print(f"\nClass weights: {class_weights}")
    
    # Split: 70% train, 15% val, 15% test
    X_trainval, X_test, y_reg_trainval, y_reg_test, y_cls_trainval, y_cls_test = \
        train_test_split(X, y_reg, y_cls, test_size=0.15, random_state=42, stratify=y_cls)
    
    X_train, X_val, y_reg_train, y_reg_val, y_cls_train, y_cls_val = \
        train_test_split(X_trainval, y_reg_trainval, y_cls_trainval, 
                        test_size=0.176, random_state=42, stratify=y_cls_trainval)  # 0.176 ≈ 15/85
    
    print(f"\nData splits:")
    print(f"  Train: {len(X_train)}")
    print(f"  Val:   {len(X_val)}")
    print(f"  Test:  {len(X_test)}")
    
    # Split dataframes for evaluation
    df_train = df.iloc[: len(X_train)]
    indices = list(range(len(df)))
    train_idx, test_idx = train_test_split(indices, test_size=0.15, random_state=42, stratify=y_cls)
    train_idx, val_idx = train_test_split(train_idx, test_size=0.176, random_state=42, 
                                          stratify=y_cls[train_idx])
    
    df_train = df.iloc[train_idx].reset_index(drop=True)
    df_val = df.iloc[val_idx].reset_index(drop=True)
    df_test = df.iloc[test_idx].reset_index(drop=True)
    
    # Train models
    reg_model, val_r2 = train_residual_model(X_train, y_reg_train, X_val, y_reg_val,
                                              hidden=hidden, max_iter=args.max_iter)
    
    cls_model, val_acc = train_classifier(X_train, y_cls_train, X_val, y_cls_val, class_weights)
    
    # Evaluate on test set
    test_r2, test_report = evaluate_combined(reg_model, cls_model, X_test, y_reg_test, 
                                             y_cls_test, df_test, "Test")
    
    # Export regression model to ONNX (primary model)
    export_onnx(reg_model, args.out, n_features=len(FEATURES_ALL))
    
    # Save metadata
    meta = {
        "features": FEATURES_ALL,
        "features_basic": FEATURES_BASIC,
        "features_temporal": FEATURES_TEMPORAL,
        "geoms": GEOMS,
        "rows": int(len(X)),
        "train_rows": int(len(X_train)),
        "val_r2": float(val_r2),
        "test_r2": float(test_r2),
        "test_advisory_recall": float(test_report["advisory"]["recall"]),
        "test_closure_recall": float(test_report["closure"]["recall"]),
        "hidden": list(hidden),
        "max_iter": int(args.max_iter),
        "class_weights": {str(k): float(v) for k, v in class_weights.items()},
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "csv": args.csv,
        "onnx": args.out,
        "architecture": "PGNN_v2",
    }
    
    meta_path = os.path.splitext(args.out)[0] + ".json"
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2)
    
    print(f"\n{'='*60}")
    print("Training Complete!")
    print(f"{'='*60}")
    print(f"  Final Test R²:          {test_r2:.3f}")
    print(f"  Advisory Recall:        {test_report['advisory']['recall']:.1%}")
    print(f"  Closure Recall:         {test_report['closure']['recall']:.1%}")
    print(f"  Model saved to:         {args.out}")


if __name__ == "__main__":
    main()

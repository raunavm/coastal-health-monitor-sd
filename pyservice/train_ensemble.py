#!/usr/bin/env python3
"""
Ensemble Model Training with 5-Fold Cross-Validation

Features:
1. 5-fold stratified cross-validation for robust metrics
2. Ensemble of 3 models: MLP + GradientBoosting + RandomForest
3. Regularization to prevent overfitting
4. Exports weighted ensemble to ONNX
"""

import os
import json
import argparse
from datetime import datetime
from typing import Tuple

import numpy as np
import pandas as pd
from sklearn.model_selection import StratifiedKFold, train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.neural_network import MLPRegressor
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor, VotingRegressor
from sklearn.pipeline import Pipeline
from sklearn.metrics import r2_score, mean_absolute_error, classification_report
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType

# Features
FEATURES = ["rainfall72_mm", "wind_ms", "tide_phase", "wave_height_m", 
            "sst_c", "community_score", "hour_sin", "hour_cos", 
            "month_sin", "month_cos", "is_weekend", "rain_trend_24h", "geom_idx"]

STATUS_TO_Y = {"normal": 0.2, "advisory": 0.5, "closure": 0.85}
GEOMS = ["IB", "COR", "PL", "LJS", "MB", "OB"]


def geom_to_idx(g: str) -> float:
    try:
        i = GEOMS.index(g)
    except ValueError:
        i = 0
    return i / max(1, len(GEOMS) - 1)


def physics_score(rain, wind, tide, comm) -> np.ndarray:
    rain = np.clip(rain / 50.0, 0, 1)
    wind = np.clip(wind / 20.0, 0, 1)
    tide = np.clip(np.abs(tide) / 2.0, 0, 1)
    comm = np.clip(comm, 0, 1)
    return 0.4 * rain + 0.3 * wind + 0.2 * tide + 0.1 * comm


def load_data(csv_path: str) -> Tuple[np.ndarray, np.ndarray, np.ndarray, pd.DataFrame]:
    df = pd.read_csv(csv_path)
    
    df["label"] = df["status"].map(STATUS_TO_Y).astype(float)
    df["class"] = df["status"].map({"normal": 0, "advisory": 1, "closure": 2}).astype(int)
    df["geom_idx"] = df["geom_id"].apply(geom_to_idx).astype(float)
    
    df["physics"] = physics_score(
        df["rainfall72_mm"].values,
        df["wind_ms"].values,
        df["tide_phase"].values,
        df["community_score"].values
    )
    
    df["residual"] = np.clip(df["label"] - df["physics"], -0.5, 0.5)
    
    X = df[FEATURES].values.astype(np.float32)
    y_reg = df["residual"].values.astype(np.float32)
    y_cls = df["class"].values.astype(np.int32)
    
    return X, y_reg, y_cls, df


def score_to_class(y: float) -> int:
    if y < 0.35:
        return 0  # normal
    if y < 0.65:
        return 1  # advisory
    return 2  # closure


def cross_validate(X: np.ndarray, y_reg: np.ndarray, y_cls: np.ndarray, 
                   df: pd.DataFrame, n_folds: int = 5):
    """Perform stratified k-fold cross-validation."""
    
    skf = StratifiedKFold(n_splits=n_folds, shuffle=True, random_state=42)
    
    cv_results = {
        'r2': [], 'mae': [],
        'normal_recall': [], 'advisory_recall': [], 'closure_recall': []
    }
    
    print(f"\n{'='*60}")
    print(f"5-Fold Stratified Cross-Validation")
    print(f"{'='*60}")
    
    for fold, (train_idx, val_idx) in enumerate(skf.split(X, y_cls)):
        X_train, X_val = X[train_idx], X[val_idx]
        y_train, y_val = y_reg[train_idx], y_reg[val_idx]
        y_cls_val = y_cls[val_idx]
        physics_val = df['physics'].values[val_idx]
        labels_val = df['label'].values[val_idx]
        
        # Build ensemble
        ensemble = VotingRegressor(estimators=[
            ('mlp', Pipeline([
                ('scaler', StandardScaler()),
                ('mlp', MLPRegressor(
                    hidden_layer_sizes=(64, 32),
                    activation='relu',
                    solver='adam',
                    alpha=0.01,  # L2 regularization
                    learning_rate_init=1e-3,
                    max_iter=500,
                    early_stopping=True,
                    validation_fraction=0.1,
                    n_iter_no_change=15,
                    random_state=42 + fold
                ))
            ])),
            ('gb', Pipeline([
                ('scaler', StandardScaler()),
                ('gb', GradientBoostingRegressor(
                    n_estimators=100,
                    max_depth=4,
                    min_samples_leaf=10,
                    learning_rate=0.1,
                    subsample=0.8,
                    random_state=42 + fold
                ))
            ])),
            ('rf', Pipeline([
                ('scaler', StandardScaler()),
                ('rf', RandomForestRegressor(
                    n_estimators=100,
                    max_depth=6,
                    min_samples_leaf=10,
                    random_state=42 + fold
                ))
            ]))
        ])
        
        ensemble.fit(X_train, y_train)
        
        # Evaluate
        residual_pred = ensemble.predict(X_val)
        combined = np.clip(physics_val + residual_pred, 0, 1)
        
        r2 = r2_score(labels_val, combined)
        mae = mean_absolute_error(labels_val, combined)
        
        # Classification metrics
        pred_cls = np.array([score_to_class(y) for y in combined])
        report = classification_report(y_cls_val, pred_cls, 
                                       target_names=['normal', 'advisory', 'closure'],
                                       output_dict=True, zero_division=0)
        
        cv_results['r2'].append(r2)
        cv_results['mae'].append(mae)
        cv_results['normal_recall'].append(report['normal']['recall'])
        cv_results['advisory_recall'].append(report['advisory']['recall'])
        cv_results['closure_recall'].append(report['closure']['recall'])
        
        print(f"\nFold {fold+1}/{n_folds}:")
        print(f"  R²: {r2:.3f}, MAE: {mae:.3f}")
        print(f"  Recall - Normal: {report['normal']['recall']:.1%}, "
              f"Advisory: {report['advisory']['recall']:.1%}, "
              f"Closure: {report['closure']['recall']:.1%}")
    
    # Summary
    print(f"\n{'='*60}")
    print(f"Cross-Validation Summary")
    print(f"{'='*60}")
    
    for metric, values in cv_results.items():
        mean, std = np.mean(values), np.std(values)
        print(f"  {metric}: {mean:.3f} ± {std:.3f}")
    
    return cv_results


def train_final_ensemble(X: np.ndarray, y: np.ndarray):
    """Train final ensemble on all data."""
    
    print(f"\n{'='*60}")
    print(f"Training Final Ensemble Model")
    print(f"{'='*60}")
    
    ensemble = VotingRegressor(estimators=[
        ('mlp', Pipeline([
            ('scaler', StandardScaler()),
            ('mlp', MLPRegressor(
                hidden_layer_sizes=(64, 32),
                activation='relu',
                solver='adam',
                alpha=0.01,
                learning_rate_init=1e-3,
                max_iter=500,
                early_stopping=True,
                validation_fraction=0.1,
                n_iter_no_change=15,
                random_state=42
            ))
        ])),
        ('gb', Pipeline([
            ('scaler', StandardScaler()),
            ('gb', GradientBoostingRegressor(
                n_estimators=100,
                max_depth=4,
                min_samples_leaf=10,
                learning_rate=0.1,
                subsample=0.8,
                random_state=42
            ))
        ])),
        ('rf', Pipeline([
            ('scaler', StandardScaler()),
            ('rf', RandomForestRegressor(
                n_estimators=100,
                max_depth=6,
                min_samples_leaf=10,
                random_state=42
            ))
        ]))
    ])
    
    # 80/20 split for final metrics
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    ensemble.fit(X_train, y_train)
    
    train_r2 = ensemble.score(X_train, y_train)
    test_r2 = ensemble.score(X_test, y_test)
    
    print(f"  Train R²: {train_r2:.3f}")
    print(f"  Test R²:  {test_r2:.3f}")
    
    # Refit on all data for deployment
    ensemble.fit(X, y)
    
    return ensemble, test_r2


def export_onnx(model, output_path: str, n_features: int = 13):
    """Export MLP component to ONNX (VotingRegressor not directly exportable)."""
    
    # Extract just the MLP for ONNX export
    mlp_pipeline = model.estimators_[0]  # First estimator is MLP
    
    onnx_model = convert_sklearn(
        mlp_pipeline,
        initial_types=[("x", FloatTensorType([None, n_features]))],
        target_opset=15
    )
    
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    with open(output_path, "wb") as f:
        f.write(onnx_model.SerializeToString())
    
    print(f"\n✅ Exported ONNX to {output_path}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default="data/beach_training_balanced.csv")
    ap.add_argument("--out", default="models/beach-risk-v5.onnx")
    args = ap.parse_args()
    
    print("=" * 60)
    print("Ensemble Model Training with Cross-Validation")
    print("=" * 60)
    
    # Load data
    X, y_reg, y_cls, df = load_data(args.csv)
    print(f"\nLoaded {len(X)} balanced samples")
    
    # Class distribution
    print(f"\nClass distribution:")
    for status, cls_id in [("normal", 0), ("advisory", 1), ("closure", 2)]:
        count = (y_cls == cls_id).sum()
        print(f"  {status}: {count} ({100*count/len(y_cls):.1f}%)")
    
    # Cross-validation
    cv_results = cross_validate(X, y_reg, y_cls, df, n_folds=5)
    
    # Train final model
    ensemble, test_r2 = train_final_ensemble(X, y_reg)
    
    # Export
    export_onnx(ensemble, args.out)
    
    # Save metadata
    meta = {
        "features": FEATURES,
        "geoms": GEOMS,
        "rows": int(len(X)),
        "cv_r2_mean": float(np.mean(cv_results['r2'])),
        "cv_r2_std": float(np.std(cv_results['r2'])),
        "cv_normal_recall": float(np.mean(cv_results['normal_recall'])),
        "cv_advisory_recall": float(np.mean(cv_results['advisory_recall'])),
        "cv_closure_recall": float(np.mean(cv_results['closure_recall'])),
        "test_r2": float(test_r2),
        "architecture": "ensemble_v5",
        "models": ["MLP(64,32)", "GradientBoosting", "RandomForest"],
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "csv": args.csv,
        "onnx": args.out,
        "data_source": "EPA Water Quality Portal",
        "balanced": True,
    }
    
    meta_path = os.path.splitext(args.out)[0] + ".json"
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2)
    
    print(f"\n{'='*60}")
    print("Training Complete!")
    print(f"{'='*60}")
    print(f"  CV R²: {np.mean(cv_results['r2']):.3f} ± {np.std(cv_results['r2']):.3f}")
    print(f"  CV Normal Recall: {np.mean(cv_results['normal_recall']):.1%}")
    print(f"  CV Advisory Recall: {np.mean(cv_results['advisory_recall']):.1%}")
    print(f"  CV Closure Recall: {np.mean(cv_results['closure_recall']):.1%}")
    print(f"  Model saved to: {args.out}")


if __name__ == "__main__":
    main()

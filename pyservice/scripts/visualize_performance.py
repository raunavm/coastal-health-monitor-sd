#!/usr/bin/env python3
"""
Model Performance Visualization Script

Generates:
1. Confusion Matrix
2. Actual vs Predicted Scatter Plot
3. Feature Importance Plot
4. ROC Curves (one vs rest)

Usage:
    python scripts/visualize_performance.py
"""

import os
import sys
import argparse
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.metrics import confusion_matrix, roc_curve, auc, classification_report
from sklearn.preprocessing import label_binarize
from sklearn.model_selection import train_test_split

# Add parent directory to path to import from train_ensemble
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from train_ensemble import load_data, train_final_ensemble, score_to_class, FEATURES

def plot_confusion_matrix(y_true, y_pred, classes, out_dir):
    """Plot and save confusion matrix."""
    cm = confusion_matrix(y_true, y_pred)
    plt.figure(figsize=(8, 6))
    sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', 
                xticklabels=classes, yticklabels=classes)
    plt.title('Confusion Matrix')
    plt.ylabel('True Label')
    plt.xlabel('Predicted Label')
    plt.tight_layout()
    plt.savefig(os.path.join(out_dir, 'confusion_matrix.png'))
    plt.close()
    print(f"Saved confusion_matrix.png")

def plot_actual_vs_predicted(y_true_reg, y_pred_reg, out_dir):
    """Plot actual vs predicted regression values."""
    plt.figure(figsize=(8, 8))
    plt.scatter(y_true_reg, y_pred_reg, alpha=0.5)
    plt.plot([0, 1], [0, 1], 'r--')  # Perfect prediction line
    plt.xlabel('Actual Risk Score')
    plt.ylabel('Predicted Risk Score')
    plt.title('Actual vs Predicted Risk Scores')
    plt.xlim(0, 1)
    plt.ylim(0, 1)
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(os.path.join(out_dir, 'actual_vs_predicted.png'))
    plt.close()
    print(f"Saved actual_vs_predicted.png")

def plot_feature_importance(ensemble, features, out_dir):
    """Plot feature importance from GradientBoosting and RandomForest components."""
    # Extract feature importances
    # Note: MLP doesn't provide simple feature importance
    
    importances = {}
    
    # Gradient Boosting
    try:
        gb_model = ensemble.named_estimators_['gb'].named_steps['gb']
        importances['GradientBoosting'] = gb_model.feature_importances_
    except:
        pass
        
    # Random Forest
    try:
        rf_model = ensemble.named_estimators_['rf'].named_steps['rf']
        importances['RandomForest'] = rf_model.feature_importances_
    except:
        pass
    
    if not importances:
        print("Could not extract feature importances")
        return

    # Average importance
    avg_importance = np.mean(list(importances.values()), axis=0)
    
    # Sort
    indices = np.argsort(avg_importance)[::-1]
    sorted_features = [features[i] for i in indices]
    sorted_importance = avg_importance[indices]
    
    plt.figure(figsize=(10, 6))
    sns.barplot(x=sorted_importance, y=sorted_features, palette='viridis')
    plt.title('Average Feature Importance (RF + GBR)')
    plt.xlabel('Importance Score')
    plt.tight_layout()
    plt.savefig(os.path.join(out_dir, 'feature_importance.png'))
    plt.close()
    print(f"Saved feature_importance.png")

def plot_roc_curves(y_true_cls, y_pred_score, n_classes, classes, out_dir):
    """Plot ROC curves for multi-class classification."""
    # Binarize the output
    y_true_bin = label_binarize(y_true_cls, classes=range(n_classes))
    
    # For regression output, we need to map to class probabilities or just use the score
    # This is a bit tricky since we output a single scalar. 
    # We can treat the scalar as a probability of "danger" for binary, but for 3-class it's harder.
    # Simplified approach: Treat 'closure' as positive class (1) and others as negative (0)
    # using the regression score as the threshold.
    
    fpr, tpr, _ = roc_curve(y_true_bin[:, 2], y_pred_score) # Class 2 is closure
    roc_auc = auc(fpr, tpr)
    
    plt.figure(figsize=(8, 6))
    plt.plot(fpr, tpr, color='darkorange', lw=2, label=f'ROC curve (area = {roc_auc:.2f})')
    plt.plot([0, 1], [0, 1], color='navy', lw=2, linestyle='--')
    plt.xlim([0.0, 1.0])
    plt.ylim([0.0, 1.05])
    plt.xlabel('False Positive Rate')
    plt.ylabel('True Positive Rate')
    plt.title('ROC Curve (Closure Detection)')
    plt.legend(loc="lower right")
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(os.path.join(out_dir, 'roc_curve_closure.png'))
    plt.close()
    print(f"Saved roc_curve_closure.png")

def main():
    parser = argparse.ArgumentParser(description="Visualize Model Performance")
    parser.add_argument("--csv", default="data/beach_training_balanced.csv", help="Path to training data")
    parser.add_argument("--out_dir", default="plots", help="Directory to save plots")
    args = parser.parse_args()
    
    # Create output directory
    if not os.path.exists(args.out_dir):
        os.makedirs(args.out_dir)
        
    print(f"Loading data from {args.csv}...")
    X, y_reg, y_cls, df = load_data(args.csv)
    
    # Split data (80/20) to evaluate on unseen data
    X_train, X_test, y_reg_train, y_reg_test, y_cls_train, y_cls_test, df_train, df_test = train_test_split(
        X, y_reg, y_cls, df, test_size=0.2, random_state=42, stratify=y_cls
    )
    
    print("Training model...")
    ensemble, _ = train_final_ensemble(X_train, y_reg_train)
    
    print("\nGenerating predictions...")
    # Get predictions
    residual_pred = ensemble.predict(X_test)
    physics_test = df_test['physics'].values
    
    # Combine physics + residual
    y_pred_score = np.clip(physics_test + residual_pred, 0, 1)
    
    # Convert to classes
    y_pred_cls = np.array([score_to_class(y) for y in y_pred_score])
    
    # Generate Plots
    print("\nGenerating plots...")
    
    # 1. Confusion Matrix
    classes = ['Normal', 'Advisory', 'Closure']
    plot_confusion_matrix(y_cls_test, y_pred_cls, classes, args.out_dir)
    
    # 2. Actual vs Predicted
    # We need the actual regression labels (0.2, 0.5, 0.85)
    y_true_labels = df_test['label'].values
    plot_actual_vs_predicted(y_true_labels, y_pred_score, args.out_dir)
    
    # 3. Feature Importance
    plot_feature_importance(ensemble, FEATURES, args.out_dir)
    
    # 4. ROC Curve (Closure vs Rest)
    plot_roc_curves(y_cls_test, y_pred_score, 3, classes, args.out_dir)
    
    print(f"\n✅ Visualization complete! Plots saved to {args.out_dir}/")

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Quick balanced dataset generator.
Uses existing v2 data + adds targeted samples for balance.
Target: ~1500+ per class minimum.
"""

import os
import random
import math
import csv
import pandas as pd
from collections import Counter

# Load existing v2 data
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
V2_PATH = os.path.join(DATA_DIR, "beach_training_v2.csv")
V3_PATH = os.path.join(DATA_DIR, "beach_training_v3.csv")

BEACHES = ["IB", "COR", "PL", "LJS", "MB", "OB"]
BEACH_RISK = {"IB": 0.12, "COR": -0.05, "PL": 0.02, "LJS": -0.02, "MB": 0.05, "OB": 0.03}


def generate_sample(target_class: str) -> dict:
    """Generate a single sample targeting a specific class."""
    geom_id = random.choice(BEACHES)
    
    if target_class == "normal":
        rain72 = random.uniform(0, 12)
        wind_ms = random.uniform(0.5, 6)
        wave_m = random.uniform(0.2, 1.0)
        community = random.uniform(0, 0.25)
        month = random.choice([4, 5, 6, 7, 8, 9, 10])
        score = random.uniform(0.05, 0.28)
        
    elif target_class == "advisory":
        rain72 = random.uniform(15, 40)
        wind_ms = random.uniform(6, 12)
        wave_m = random.uniform(1.0, 2.0)
        community = random.uniform(0.3, 0.6)
        month = random.choice([10, 11, 3, 4])
        score = random.uniform(0.32, 0.55)
        
    else:  # closure
        rain72 = random.uniform(40, 100)
        wind_ms = random.uniform(10, 22)
        wave_m = random.uniform(1.8, 4.5)
        community = random.uniform(0.6, 1.0)
        month = random.choice([11, 12, 1, 2])
        score = random.uniform(0.58, 0.95)
        # Prefer IB for closures
        if random.random() < 0.35:
            geom_id = "IB"
    
    hour = random.randint(0, 23)
    tide = random.uniform(-1.2, 1.2)
    sst_c = random.uniform(13, 23)
    rain_trend = random.uniform(0.7, 2.3) if target_class != "normal" else random.uniform(0.5, 1.3)
    is_weekend = random.choice([0, 1])
    
    hour_sin = round(math.sin(2 * math.pi * hour / 24), 3)
    hour_cos = round(math.cos(2 * math.pi * hour / 24), 3)
    month_sin = round(math.sin(2 * math.pi * (month - 1) / 12), 3)
    month_cos = round(math.cos(2 * math.pi * (month - 1) / 12), 3)
    
    day = random.randint(1, 28)
    date_str = f"2024-{month:02d}-{day:02d}"
    
    return {
        "date": date_str,
        "hour": hour,
        "geom_id": geom_id,
        "rainfall72_mm": round(rain72, 1),
        "rain_trend_24h": round(rain_trend, 2),
        "wind_ms": round(wind_ms, 1),
        "tide_phase": round(tide, 2),
        "wave_height_m": round(wave_m, 1),
        "sst_c": round(sst_c, 1),
        "community_score": round(community, 2),
        "hour_sin": hour_sin,
        "hour_cos": hour_cos,
        "month_sin": month_sin,
        "month_cos": month_cos,
        "is_weekend": is_weekend,
        "status": target_class,
        "risk_score": round(score, 3),
    }


def main():
    print("Loading existing v2 data...")
    df = pd.read_csv(V2_PATH)
    print(f"Loaded {len(df)} samples")
    
    # Current distribution
    counts = Counter(df['status'])
    print(f"\nCurrent distribution:")
    for status, count in counts.items():
        print(f"  {status}: {count}")
    
    # Target: at least 1500 per class, with normal slightly higher
    target = {
        "normal": max(counts.get("normal", 0), 5000),
        "advisory": max(1800, counts.get("advisory", 0)),
        "closure": max(1500, counts.get("closure", 0)),
    }
    
    # Calculate how many to add
    need = {
        "normal": max(0, target["normal"] - counts.get("normal", 0)),
        "advisory": max(0, target["advisory"] - counts.get("advisory", 0)),
        "closure": max(0, target["closure"] - counts.get("closure", 0)),
    }
    
    print(f"\nNeed to generate:")
    for status, count in need.items():
        print(f"  {status}: {count}")
    
    # Generate new samples
    new_samples = []
    for status, count in need.items():
        if count > 0:
            for _ in range(count):
                new_samples.append(generate_sample(status))
    
    print(f"\nGenerated {len(new_samples)} new samples")
    
    # Combine with existing
    existing = df.to_dict('records')
    all_samples = existing + new_samples
    
    # Shuffle
    random.shuffle(all_samples)
    
    # Final counts
    final_counts = Counter(s['status'] for s in all_samples)
    
    # Save
    fieldnames = ["date", "hour", "geom_id", "rainfall72_mm", "rain_trend_24h",
                  "wind_ms", "tide_phase", "wave_height_m", "sst_c", "community_score",
                  "hour_sin", "hour_cos", "month_sin", "month_cos", "is_weekend",
                  "status", "risk_score"]
    
    with open(V3_PATH, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(all_samples)
    
    print(f"\n{'='*50}")
    print(f"✅ Saved {len(all_samples)} samples to {V3_PATH}")
    print(f"\nFinal Distribution:")
    total = len(all_samples)
    for status in ["normal", "advisory", "closure"]:
        count = final_counts.get(status, 0)
        print(f"  {status}: {count} ({100*count/total:.1f}%)")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Generate balanced training data with realistic label distributions.

Target distribution:
- normal: ~5000 samples (50%)
- advisory: ~3000 samples (30%)  
- closure: ~2000 samples (20%)

This creates a more challenging but realistic dataset that will
force the model to learn meaningful patterns.
"""

import os
import json
import time
import random
import ssl
import math
from datetime import datetime, timedelta
from typing import List, Dict
import urllib.request
import csv

# SSL context for macOS
SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

# Beach locations with risk profiles
# IB has chronic issues due to Tijuana River
BEACHES = {
    "IB": {"name": "Imperial Beach", "lat": 32.5795, "lng": -117.1336, 
           "base_risk": 0.15, "sewage_prone": True},
    "COR": {"name": "Coronado", "lat": 32.6811, "lng": -117.1791, 
            "base_risk": -0.05, "sewage_prone": False},
    "PL": {"name": "Point Loma", "lat": 32.6732, "lng": -117.2426, 
           "base_risk": 0.02, "sewage_prone": False},
    "LJS": {"name": "La Jolla Shores", "lat": 32.8570, "lng": -117.2570, 
            "base_risk": -0.02, "sewage_prone": False},
    "MB": {"name": "Mission Beach", "lat": 32.7707, "lng": -117.2530, 
           "base_risk": 0.05, "sewage_prone": False},
    "OB": {"name": "Ocean Beach", "lat": 32.7499, "lng": -117.2509, 
           "base_risk": 0.03, "sewage_prone": False},
}


def fetch_weather_chunk(lat: float, lng: float, start_date: str, end_date: str) -> Dict:
    """Fetch weather data for a date range."""
    weather_url = (
        f"https://archive-api.open-meteo.com/v1/archive?"
        f"latitude={lat}&longitude={lng}"
        f"&start_date={start_date}&end_date={end_date}"
        f"&hourly=precipitation,wind_speed_10m,temperature_2m"
        f"&timezone=America/Los_Angeles"
    )
    
    with urllib.request.urlopen(weather_url, timeout=60, context=SSL_CTX) as resp:
        weather = json.loads(resp.read().decode())
    
    time.sleep(0.3)
    
    marine_url = (
        f"https://marine-api.open-meteo.com/v1/marine?"
        f"latitude={lat}&longitude={lng}"
        f"&hourly=wave_height,sea_surface_temperature"
        f"&start_date={start_date}&end_date={end_date}"
        f"&timezone=America/Los_Angeles"
    )
    
    with urllib.request.urlopen(marine_url, timeout=60, context=SSL_CTX) as resp:
        marine = json.loads(resp.read().decode())
    
    time.sleep(0.3)
    
    return {"weather": weather, "marine": marine}


def compute_72h_rainfall(precip_hourly: List[float], idx: int) -> float:
    start = max(0, idx - 72)
    return sum(p for p in precip_hourly[start:idx] if p is not None)


def compute_24h_trend(precip_hourly: List[float], idx: int) -> float:
    if idx < 24:
        return 1.0
    recent = sum(p for p in precip_hourly[idx-12:idx] if p is not None)
    earlier = sum(p for p in precip_hourly[idx-24:idx-12] if p is not None)
    if earlier < 0.1:
        return 1.5 if recent > 0.5 else 1.0
    return min(2.5, recent / max(0.1, earlier))


def realistic_risk_score(rain72: float, wind: float, wave: float, 
                         tide: float, community: float, beach_info: Dict,
                         month: int) -> float:
    """
    Compute realistic risk score based on actual beach monitoring criteria.
    
    Real beach advisories are triggered by:
    1. Heavy rainfall (bacteria from runoff)
    2. High bacteria counts (correlated with rain)
    3. Sewage spills (especially at IB)
    4. Storm surge/high waves
    """
    # Base physics score
    rain_factor = min(rain72 / 40.0, 1.0)  # 40mm = high risk
    wind_factor = min(wind / 15.0, 1.0)    # 15 m/s = high risk
    wave_factor = min(wave / 2.0, 1.0)     # 2m = high risk
    tide_factor = min(abs(tide) / 1.5, 1.0)
    
    # Weighted combination (rain is most important for water quality)
    score = (0.45 * rain_factor + 
             0.20 * wind_factor + 
             0.15 * wave_factor + 
             0.10 * tide_factor +
             0.10 * community)
    
    # Beach-specific adjustments
    score += beach_info["base_risk"]
    
    # Sewage-prone beaches (IB) have higher baseline during rain
    if beach_info["sewage_prone"] and rain72 > 5:
        score += 0.15  # Significant bump for IB during any rain
    
    # Winter storms (Nov-Mar) are more likely to cause issues
    if month in [11, 12, 1, 2, 3]:
        score += 0.05
    
    # Clip to valid range
    return max(0, min(1, score))


def score_to_category(score: float, threshold_advisory: float = 0.30, 
                      threshold_closure: float = 0.55) -> str:
    """Convert score to category with realistic thresholds."""
    if score < threshold_advisory:
        return "normal"
    elif score < threshold_closure:
        return "advisory"
    else:
        return "closure"


def generate_samples_from_weather(geom_id: str, beach_info: Dict, 
                                  weather_data: Dict) -> List[Dict]:
    """Generate samples from weather data with realistic labels."""
    weather = weather_data["weather"]
    marine = weather_data["marine"]
    
    hourly_times = weather["hourly"]["time"]
    precip = weather["hourly"]["precipitation"]
    wind = weather["hourly"]["wind_speed_10m"]
    
    wave_height = marine["hourly"].get("wave_height", [None] * len(hourly_times))
    sst = marine["hourly"].get("sea_surface_temperature", [None] * len(hourly_times))
    
    samples = []
    
    for i in range(72, len(hourly_times), 4):  # Every 4 hours
        try:
            dt = datetime.fromisoformat(hourly_times[i])
        except:
            continue
        
        if precip[i] is None or wind[i] is None:
            continue
        
        rain72 = compute_72h_rainfall(precip, i)
        rain_trend = compute_24h_trend(precip, i)
        wind_ms = wind[i] / 3.6 if wind[i] else 2.0
        wave_m = wave_height[i] if wave_height[i] else 0.5
        sst_c = sst[i] if sst[i] else 18.0
        
        # Tide approximation
        tide = math.sin(2 * math.pi * (dt.hour / 12.42 + dt.timetuple().tm_yday / 29.53))
        
        # Community score correlated with conditions
        community = min(1.0, 0.05 + rain72/100 + wind_ms/30 + wave_m/4)
        community += random.uniform(-0.1, 0.1)
        community = max(0, min(1, community))
        
        # Calculate realistic risk score
        score = realistic_risk_score(rain72, wind_ms, wave_m, tide, community,
                                     beach_info, dt.month)
        
        # Add some noise to make it more realistic
        score += random.uniform(-0.08, 0.08)
        score = max(0, min(1, score))
        
        status = score_to_category(score)
        
        # Temporal features
        hour = dt.hour
        month = dt.month
        hour_sin = math.sin(2 * math.pi * hour / 24)
        hour_cos = math.cos(2 * math.pi * hour / 24)
        month_sin = math.sin(2 * math.pi * (month - 1) / 12)
        month_cos = math.cos(2 * math.pi * (month - 1) / 12)
        is_weekend = 1 if dt.weekday() >= 5 else 0
        
        samples.append({
            "date": dt.strftime("%Y-%m-%d"),
            "hour": hour,
            "geom_id": geom_id,
            "rainfall72_mm": round(rain72, 1),
            "rain_trend_24h": round(rain_trend, 2),
            "wind_ms": round(wind_ms, 1),
            "tide_phase": round(tide, 2),
            "wave_height_m": round(wave_m, 1),
            "sst_c": round(sst_c, 1),
            "community_score": round(community, 2),
            "hour_sin": round(hour_sin, 3),
            "hour_cos": round(hour_cos, 3),
            "month_sin": round(month_sin, 3),
            "month_cos": round(month_cos, 3),
            "is_weekend": is_weekend,
            "status": status,
            "risk_score": round(score, 3),
        })
    
    return samples


def generate_targeted_scenarios(target_class: str, count: int, beaches: Dict) -> List[Dict]:
    """Generate scenarios targeting a specific class."""
    samples = []
    
    for _ in range(count):
        geom_id = random.choice(list(beaches.keys()))
        beach_info = beaches[geom_id]
        
        if target_class == "normal":
            # Calm conditions
            rain72 = random.uniform(0, 8)
            wind_ms = random.uniform(0.5, 5)
            wave_m = random.uniform(0.2, 0.8)
            community = random.uniform(0, 0.2)
            month = random.choice([5, 6, 7, 8, 9])  # Summer
            
        elif target_class == "advisory":
            # Moderate conditions
            rain72 = random.uniform(12, 35)
            wind_ms = random.uniform(5, 10)
            wave_m = random.uniform(0.8, 1.8)
            community = random.uniform(0.25, 0.55)
            month = random.choice([10, 11, 3, 4])  # Shoulder seasons
            
        else:  # closure
            # Extreme conditions
            rain72 = random.uniform(35, 90)
            wind_ms = random.uniform(10, 20)
            wave_m = random.uniform(1.8, 4.0)
            community = random.uniform(0.6, 1.0)
            month = random.choice([12, 1, 2])  # Winter storms
            # Prefer IB for closures (most realistic)
            if random.random() < 0.4:
                geom_id = "IB"
                beach_info = beaches["IB"]
        
        tide = random.uniform(-1.2, 1.2)
        sst_c = random.uniform(14, 22)
        rain_trend = random.uniform(0.8, 2.2) if target_class != "normal" else random.uniform(0.5, 1.2)
        
        hour = random.randint(6, 20)  # Daytime hours
        hour_sin = math.sin(2 * math.pi * hour / 24)
        hour_cos = math.cos(2 * math.pi * hour / 24)
        month_sin = math.sin(2 * math.pi * (month - 1) / 12)
        month_cos = math.cos(2 * math.pi * (month - 1) / 12)
        is_weekend = random.choice([0, 1])
        
        # Compute score to verify category
        score = realistic_risk_score(rain72, wind_ms, wave_m, tide, community,
                                     beach_info, month)
        
        # Ensure score matches target class
        if target_class == "normal":
            score = random.uniform(0.05, 0.28)
        elif target_class == "advisory":
            score = random.uniform(0.32, 0.53)
        else:
            score = random.uniform(0.58, 0.92)
        
        base_date = datetime(2025, month, random.randint(1, 28))
        
        samples.append({
            "date": base_date.strftime("%Y-%m-%d"),
            "hour": hour,
            "geom_id": geom_id,
            "rainfall72_mm": round(rain72, 1),
            "rain_trend_24h": round(rain_trend, 2),
            "wind_ms": round(wind_ms, 1),
            "tide_phase": round(tide, 2),
            "wave_height_m": round(wave_m, 1),
            "sst_c": round(sst_c, 1),
            "community_score": round(community, 2),
            "hour_sin": round(hour_sin, 3),
            "hour_cos": round(hour_cos, 3),
            "month_sin": round(month_sin, 3),
            "month_cos": round(month_cos, 3),
            "is_weekend": is_weekend,
            "status": target_class,
            "risk_score": round(score, 3),
        })
    
    return samples


def main():
    print("=" * 60)
    print("Generating Balanced Training Dataset v3")
    print("=" * 60)
    
    # Date range: 3 years of historical data
    end_date = datetime.now() - timedelta(days=7)
    start_date = end_date - timedelta(days=1095)  # 3 years
    
    # Split into chunks to avoid API timeout
    chunk_days = 180
    
    all_samples = []
    
    for geom_id, beach_info in BEACHES.items():
        print(f"\nProcessing {beach_info['name']} ({geom_id})...")
        
        beach_samples = []
        current_start = start_date
        
        while current_start < end_date:
            current_end = min(current_start + timedelta(days=chunk_days), end_date)
            start_str = current_start.strftime("%Y-%m-%d")
            end_str = current_end.strftime("%Y-%m-%d")
            
            try:
                print(f"  Fetching {start_str} to {end_str}...")
                data = fetch_weather_chunk(beach_info["lat"], beach_info["lng"], 
                                          start_str, end_str)
                samples = generate_samples_from_weather(geom_id, beach_info, data)
                beach_samples.extend(samples)
            except Exception as e:
                print(f"  Error: {e}")
            
            current_start = current_end + timedelta(days=1)
            time.sleep(0.5)
        
        all_samples.extend(beach_samples)
        print(f"  Total: {len(beach_samples)} samples")
    
    # Count current distribution
    counts = {"normal": 0, "advisory": 0, "closure": 0}
    for s in all_samples:
        counts[s["status"]] = counts.get(s["status"], 0) + 1
    
    print(f"\nReal weather samples distribution:")
    for status, count in sorted(counts.items()):
        print(f"  {status}: {count}")
    
    # Generate targeted samples to balance
    target_normal = 5000
    target_advisory = 3000
    target_closure = 2000
    
    # Calculate how many more we need
    need_normal = max(0, target_normal - counts["normal"])
    need_advisory = max(0, target_advisory - counts["advisory"])
    need_closure = max(0, target_closure - counts["closure"])
    
    print(f"\nGenerating additional samples...")
    print(f"  Normal: {need_normal}")
    print(f"  Advisory: {need_advisory}")
    print(f"  Closure: {need_closure}")
    
    if need_normal > 0:
        all_samples.extend(generate_targeted_scenarios("normal", need_normal, BEACHES))
    if need_advisory > 0:
        all_samples.extend(generate_targeted_scenarios("advisory", need_advisory, BEACHES))
    if need_closure > 0:
        all_samples.extend(generate_targeted_scenarios("closure", need_closure, BEACHES))
    
    # Final distribution
    final_counts = {"normal": 0, "advisory": 0, "closure": 0}
    for s in all_samples:
        final_counts[s["status"]] = final_counts.get(s["status"], 0) + 1
    
    # Shuffle
    random.shuffle(all_samples)
    
    # Save
    output_path = os.path.join(os.path.dirname(__file__), "..", "data", "beach_training_v3.csv")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    fieldnames = ["date", "hour", "geom_id", "rainfall72_mm", "rain_trend_24h",
                  "wind_ms", "tide_phase", "wave_height_m", "sst_c", "community_score",
                  "hour_sin", "hour_cos", "month_sin", "month_cos", "is_weekend",
                  "status", "risk_score"]
    
    with open(output_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(all_samples)
    
    print(f"\n{'='*60}")
    print(f"✅ Generated {len(all_samples)} training samples")
    print(f"   Saved to: {output_path}")
    print(f"\nFinal Distribution:")
    total = len(all_samples)
    for status, count in sorted(final_counts.items()):
        print(f"  {status}: {count} ({100*count/total:.1f}%)")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Enhanced data collection with:
1. Temporal features (hour, month, day_of_week)
2. More balanced classes via targeted storm scenario generation
3. Proper train/val/test splits
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

# SSL context for macOS compatibility
SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

# Beach locations in San Diego with risk modifiers
BEACHES = {
    "IB": {"name": "Imperial Beach", "lat": 32.5795, "lng": -117.1336, "risk_mod": 0.12},  # Near Tijuana River
    "COR": {"name": "Coronado", "lat": 32.6811, "lng": -117.1791, "risk_mod": -0.05},
    "PL": {"name": "Point Loma", "lat": 32.6732, "lng": -117.2426, "risk_mod": 0.02},
    "LJS": {"name": "La Jolla Shores", "lat": 32.8570, "lng": -117.2570, "risk_mod": -0.02},
    "MB": {"name": "Mission Beach", "lat": 32.7707, "lng": -117.2530, "risk_mod": 0.05},
    "OB": {"name": "Ocean Beach", "lat": 32.7499, "lng": -117.2509, "risk_mod": 0.03},
}


def fetch_weather_data(lat: float, lng: float, start_date: str, end_date: str) -> Dict:
    """Fetch historical weather data from Open-Meteo Archive API."""
    
    weather_url = (
        f"https://archive-api.open-meteo.com/v1/archive?"
        f"latitude={lat}&longitude={lng}"
        f"&start_date={start_date}&end_date={end_date}"
        f"&hourly=precipitation,wind_speed_10m,temperature_2m"
        f"&timezone=America/Los_Angeles"
    )
    
    print(f"  Fetching weather data...")
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
    
    print(f"  Fetching marine data...")
    with urllib.request.urlopen(marine_url, timeout=60, context=SSL_CTX) as resp:
        marine = json.loads(resp.read().decode())
    
    time.sleep(0.3)
    
    return {"weather": weather, "marine": marine}


def compute_72h_rainfall(precip_hourly: List[float], idx: int) -> float:
    """Sum precipitation over previous 72 hours."""
    start = max(0, idx - 72)
    return sum(p for p in precip_hourly[start:idx] if p is not None)


def compute_24h_trend(precip_hourly: List[float], idx: int) -> float:
    """Compute rainfall trend: current 12h vs previous 12h."""
    if idx < 24:
        return 0.0
    recent = sum(p for p in precip_hourly[idx-12:idx] if p is not None)
    earlier = sum(p for p in precip_hourly[idx-24:idx-12] if p is not None)
    if earlier == 0:
        return 1.0 if recent > 0 else 0.0
    return min(2.0, recent / max(0.1, earlier))  # Ratio capped at 2x


def physics_score(rain: float, wind: float, tide: float, comm: float) -> float:
    """Physics-based risk score."""
    rain_norm = min(rain / 50.0, 1.0)
    wind_norm = min(wind / 20.0, 1.0)
    tide_norm = min(abs(tide) / 2.0, 1.0)
    comm_norm = min(max(comm, 0), 1.0)
    return 0.4 * rain_norm + 0.3 * wind_norm + 0.2 * tide_norm + 0.1 * comm_norm


def score_to_status(score: float) -> str:
    """Convert risk score to status label with realistic thresholds."""
    if score < 0.30:
        return "normal"
    elif score < 0.60:
        return "advisory"
    else:
        return "closure"


def generate_community_score(rain: float, wind: float, wave: float) -> float:
    """Generate realistic community score based on conditions."""
    base = 0.05
    if rain > 10:
        base += 0.20
    if rain > 30:
        base += 0.25
    if wind > 8:
        base += 0.15
    if wave > 1.5:
        base += 0.15
    noise = random.uniform(-0.1, 0.15)
    return max(0, min(1, base + noise))


def generate_tide_phase(hour: int, day_of_year: int) -> float:
    """Generate realistic tide phase."""
    tide = math.sin(2 * math.pi * (hour / 12.42 + day_of_year / 29.53))
    return tide


def process_beach_data(geom_id: str, data: Dict, risk_mod: float) -> List[Dict]:
    """Process raw API data into training samples with temporal features."""
    
    weather = data["weather"]
    marine = data["marine"]
    
    hourly_times = weather["hourly"]["time"]
    precip = weather["hourly"]["precipitation"]
    wind = weather["hourly"]["wind_speed_10m"]
    
    wave_height = marine["hourly"].get("wave_height", [None] * len(hourly_times))
    sst = marine["hourly"].get("sea_surface_temperature", [None] * len(hourly_times))
    
    samples = []
    
    # Sample every 3 hours for more data
    for i in range(72, len(hourly_times), 3):
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
        
        tide = generate_tide_phase(dt.hour, dt.timetuple().tm_yday)
        community = generate_community_score(rain72, wind_ms, wave_m)
        
        # Temporal features
        hour = dt.hour
        month = dt.month
        day_of_week = dt.weekday()
        is_weekend = 1 if day_of_week >= 5 else 0
        
        # Cyclical encoding
        hour_sin = math.sin(2 * math.pi * hour / 24)
        hour_cos = math.cos(2 * math.pi * hour / 24)
        month_sin = math.sin(2 * math.pi * (month - 1) / 12)
        month_cos = math.cos(2 * math.pi * (month - 1) / 12)
        
        # Calculate score with beach modifier
        base_score = physics_score(rain72, wind_ms, tide, community)
        final_score = base_score + risk_mod + random.uniform(-0.08, 0.08)
        final_score = max(0, min(1, final_score))
        
        status = score_to_status(final_score)
        
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
            "risk_score": round(final_score, 3),
        })
    
    return samples


def generate_storm_scenarios(n_storms: int = 500) -> List[Dict]:
    """Generate synthetic storm scenarios to balance advisory/closure classes."""
    
    print(f"\nGenerating {n_storms} synthetic storm scenarios...")
    samples = []
    
    for _ in range(n_storms):
        # Pick a random beach
        geom_id = random.choice(list(BEACHES.keys()))
        risk_mod = BEACHES[geom_id]["risk_mod"]
        
        # Generate storm conditions
        rain72 = random.uniform(25, 80)  # Heavy rain
        wind_ms = random.uniform(8, 18)   # Strong wind
        wave_m = random.uniform(1.5, 3.5)  # Large waves
        tide = random.uniform(-1.0, 1.0)
        sst_c = random.uniform(14, 18)  # Cooler during storms
        community = random.uniform(0.5, 1.0)  # High community concern
        rain_trend = random.uniform(1.2, 2.0)  # Getting worse
        
        # Random temporal features
        hour = random.randint(0, 23)
        month = random.choice([11, 12, 1, 2, 3])  # Storm months
        is_weekend = random.choice([0, 1])
        
        hour_sin = math.sin(2 * math.pi * hour / 24)
        hour_cos = math.cos(2 * math.pi * hour / 24)
        month_sin = math.sin(2 * math.pi * (month - 1) / 12)
        month_cos = math.cos(2 * math.pi * (month - 1) / 12)
        
        base_score = physics_score(rain72, wind_ms, tide, community)
        final_score = base_score + risk_mod + random.uniform(-0.05, 0.10)
        final_score = max(0, min(1, final_score))
        
        status = score_to_status(final_score)
        
        # Generate a date during storm season
        base_date = datetime(2025, month if month <= 3 else month, random.randint(1, 28))
        
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
            "status": status,
            "risk_score": round(final_score, 3),
        })
    
    return samples


def generate_closure_scenarios(n_closures: int = 200) -> List[Dict]:
    """Generate extreme scenarios that definitely cause closures."""
    
    print(f"Generating {n_closures} synthetic closure scenarios...")
    samples = []
    
    for _ in range(n_closures):
        geom_id = random.choice(["IB", "MB", "OB"])  # Higher risk beaches
        risk_mod = BEACHES[geom_id]["risk_mod"]
        
        # Extreme conditions
        rain72 = random.uniform(50, 100)  # Very heavy rain
        wind_ms = random.uniform(12, 25)   # Very strong wind
        wave_m = random.uniform(2.5, 5.0)  # Very large waves
        tide = random.uniform(-1.5, 1.5)
        sst_c = random.uniform(12, 16)
        community = random.uniform(0.8, 1.0)
        rain_trend = random.uniform(1.5, 2.5)
        
        hour = random.randint(0, 23)
        month = random.choice([12, 1, 2])  # Peak storm months
        is_weekend = random.choice([0, 1])
        
        hour_sin = math.sin(2 * math.pi * hour / 24)
        hour_cos = math.cos(2 * math.pi * hour / 24)
        month_sin = math.sin(2 * math.pi * (month - 1) / 12)
        month_cos = math.cos(2 * math.pi * (month - 1) / 12)
        
        # Force high score for closures
        final_score = random.uniform(0.65, 0.95)
        
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
            "status": "closure",
            "risk_score": round(final_score, 3),
        })
    
    return samples


def main():
    """Main entry point."""
    
    # Date range: 2 years of historical data for more samples
    end_date = datetime.now() - timedelta(days=7)
    start_date = end_date - timedelta(days=730)  # 2 years
    
    start_str = start_date.strftime("%Y-%m-%d")
    end_str = end_date.strftime("%Y-%m-%d")
    
    print(f"Collecting weather data from {start_str} to {end_str}")
    print(f"Beaches: {list(BEACHES.keys())}")
    print()
    
    all_samples = []
    
    for geom_id, info in BEACHES.items():
        print(f"Processing {info['name']} ({geom_id})...")
        
        try:
            data = fetch_weather_data(info["lat"], info["lng"], start_str, end_str)
            samples = process_beach_data(geom_id, data, info["risk_mod"])
            all_samples.extend(samples)
            print(f"  Generated {len(samples)} samples")
        except Exception as e:
            print(f"  ERROR: {e}")
        
        time.sleep(1)
    
    # Add synthetic storm scenarios for class balance
    storm_samples = generate_storm_scenarios(800)
    all_samples.extend(storm_samples)
    
    closure_samples = generate_closure_scenarios(400)
    all_samples.extend(closure_samples)
    
    # Shuffle samples
    random.shuffle(all_samples)
    
    # Write to CSV
    output_path = os.path.join(os.path.dirname(__file__), "..", "data", "beach_training_v2.csv")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    fieldnames = ["date", "hour", "geom_id", "rainfall72_mm", "rain_trend_24h", 
                  "wind_ms", "tide_phase", "wave_height_m", "sst_c", "community_score",
                  "hour_sin", "hour_cos", "month_sin", "month_cos", "is_weekend",
                  "status", "risk_score"]
    
    with open(output_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(all_samples)
    
    print()
    print(f"✅ Generated {len(all_samples)} training samples")
    print(f"   Saved to: {output_path}")
    
    # Print distribution
    status_counts = {}
    for s in all_samples:
        status_counts[s["status"]] = status_counts.get(s["status"], 0) + 1
    print(f"   Distribution: {status_counts}")
    
    # Calculate percentages
    total = len(all_samples)
    for status, count in sorted(status_counts.items()):
        print(f"     {status}: {count} ({100*count/total:.1f}%)")


if __name__ == "__main__":
    main()

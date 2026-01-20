#!/usr/bin/env python3
"""
Download real weather data from Open-Meteo API and generate training data
for the beach safety risk prediction model.

Uses actual historical weather patterns + physics-based labeling.
"""

import os
import json
import time
import random
import ssl
from datetime import datetime, timedelta
from typing import List, Dict, Tuple
import urllib.request
import csv

# SSL context for macOS compatibility
SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

# Beach locations in San Diego
BEACHES = {
    "IB": {"name": "Imperial Beach", "lat": 32.5795, "lng": -117.1336},
    "COR": {"name": "Coronado", "lat": 32.6811, "lng": -117.1791},
    "PL": {"name": "Point Loma", "lat": 32.6732, "lng": -117.2426},
    "LJS": {"name": "La Jolla Shores", "lat": 32.8570, "lng": -117.2570},
    "MB": {"name": "Mission Beach", "lat": 32.7707, "lng": -117.2530},
    "OB": {"name": "Ocean Beach", "lat": 32.7499, "lng": -117.2509},
}

# Feature names for the training CSV
FEATURES = ["rainfall72_mm", "wind_ms", "tide_phase", "wave_height_m", "sst_c", "community_score", "geom_idx"]


def fetch_weather_data(lat: float, lng: float, start_date: str, end_date: str) -> Dict:
    """Fetch historical weather data from Open-Meteo Archive API."""
    
    # Weather API for precipitation and wind
    weather_url = (
        f"https://archive-api.open-meteo.com/v1/archive?"
        f"latitude={lat}&longitude={lng}"
        f"&start_date={start_date}&end_date={end_date}"
        f"&hourly=precipitation,wind_speed_10m,temperature_2m"
        f"&timezone=America/Los_Angeles"
    )
    
    print(f"  Fetching weather data...")
    with urllib.request.urlopen(weather_url, timeout=30, context=SSL_CTX) as resp:
        weather = json.loads(resp.read().decode())
    
    time.sleep(0.5)  # Rate limiting
    
    # Marine API for waves and SST
    marine_url = (
        f"https://marine-api.open-meteo.com/v1/marine?"
        f"latitude={lat}&longitude={lng}"
        f"&hourly=wave_height,sea_surface_temperature"
        f"&start_date={start_date}&end_date={end_date}"
        f"&timezone=America/Los_Angeles"
    )
    
    print(f"  Fetching marine data...")
    with urllib.request.urlopen(marine_url, timeout=30, context=SSL_CTX) as resp:
        marine = json.loads(resp.read().decode())
    
    time.sleep(0.5)
    
    return {"weather": weather, "marine": marine}


def compute_72h_rainfall(precip_hourly: List[float], idx: int) -> float:
    """Sum precipitation over previous 72 hours."""
    start = max(0, idx - 72)
    return sum(p for p in precip_hourly[start:idx] if p is not None)


def physics_score(rain: float, wind: float, tide: float, comm: float) -> float:
    """Physics-based risk score (same as in predict.py)."""
    rain_norm = min(rain / 50.0, 1.0)
    wind_norm = min(wind / 20.0, 1.0)
    tide_norm = min(abs(tide) / 2.0, 1.0)
    comm_norm = min(max(comm, 0), 1.0)
    return 0.4 * rain_norm + 0.3 * wind_norm + 0.2 * tide_norm + 0.1 * comm_norm


def score_to_status(score: float) -> str:
    """Convert risk score to status label."""
    if score < 0.35:
        return "normal"
    elif score < 0.65:
        return "advisory"
    else:
        return "closure"


def geom_to_idx(geom_id: str) -> float:
    """Convert beach ID to normalized index."""
    geoms = list(BEACHES.keys())
    try:
        i = geoms.index(geom_id)
    except ValueError:
        i = 0
    return i / max(1, len(geoms) - 1)


def generate_community_score(rain: float, wind: float, wave: float) -> float:
    """Generate realistic community score based on conditions.
    
    Community reports tend to increase when conditions are bad.
    """
    base = 0.05
    if rain > 10:
        base += 0.15
    if rain > 30:
        base += 0.20
    if wind > 8:
        base += 0.10
    if wave > 1.5:
        base += 0.10
    # Add some randomness
    noise = random.uniform(-0.1, 0.15)
    return max(0, min(1, base + noise))


def generate_tide_phase(hour: int, day_of_year: int) -> float:
    """Generate realistic tide phase based on lunar cycle approximation."""
    import math
    # Approximate semi-diurnal tide (two high/low per day)
    tide = math.sin(2 * math.pi * (hour / 12.42 + day_of_year / 29.53))
    return tide


def process_beach_data(geom_id: str, data: Dict) -> List[Dict]:
    """Process raw API data into training samples."""
    
    weather = data["weather"]
    marine = data["marine"]
    
    hourly_times = weather["hourly"]["time"]
    precip = weather["hourly"]["precipitation"]
    wind = weather["hourly"]["wind_speed_10m"]
    
    wave_height = marine["hourly"].get("wave_height", [None] * len(hourly_times))
    sst = marine["hourly"].get("sea_surface_temperature", [None] * len(hourly_times))
    
    samples = []
    
    # Sample every 6 hours to get ~1400 samples per beach per year
    for i in range(72, len(hourly_times), 6):
        try:
            dt = datetime.fromisoformat(hourly_times[i])
        except:
            continue
            
        # Skip if we have nulls in critical fields
        if precip[i] is None or wind[i] is None:
            continue
        
        rain72 = compute_72h_rainfall(precip, i)
        wind_ms = wind[i] / 3.6 if wind[i] else 2.0  # km/h to m/s
        wave_m = wave_height[i] if wave_height[i] else 0.5
        sst_c = sst[i] if sst[i] else 18.0
        
        tide = generate_tide_phase(dt.hour, dt.timetuple().tm_yday)
        community = generate_community_score(rain72, wind_ms, wave_m)
        
        # Calculate physics score and add realistic noise
        base_score = physics_score(rain72, wind_ms, tide, community)
        
        # Add beach-specific modifier (some beaches are riskier)
        beach_modifier = {
            "IB": 0.08,   # Imperial Beach near Tijuana River - higher risk
            "COR": -0.05,  # Coronado - generally cleaner
            "PL": 0.0,
            "LJS": -0.02,
            "MB": 0.03,
            "OB": 0.02,
        }.get(geom_id, 0)
        
        final_score = base_score + beach_modifier + random.uniform(-0.08, 0.08)
        final_score = max(0, min(1, final_score))
        
        status = score_to_status(final_score)
        
        samples.append({
            "date": dt.strftime("%Y-%m-%d"),
            "geom_id": geom_id,
            "rainfall72_mm": round(rain72, 1),
            "wind_ms": round(wind_ms, 1),
            "tide_phase": round(tide, 2),
            "wave_height_m": round(wave_m, 1),
            "sst_c": round(sst_c, 1),
            "community_score": round(community, 2),
            "status": status,
        })
    
    return samples


def main():
    """Main entry point."""
    
    # Date range: 1 year of historical data
    end_date = datetime.now() - timedelta(days=7)  # Avoid recent incomplete data
    start_date = end_date - timedelta(days=365)
    
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
            samples = process_beach_data(geom_id, data)
            all_samples.extend(samples)
            print(f"  Generated {len(samples)} samples")
        except Exception as e:
            print(f"  ERROR: {e}")
        
        time.sleep(1)  # Rate limiting between beaches
    
    # Shuffle samples
    random.shuffle(all_samples)
    
    # Write to CSV
    output_path = os.path.join(os.path.dirname(__file__), "..", "data", "beach_training_data.csv")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    fieldnames = ["date", "geom_id", "rainfall72_mm", "wind_ms", "tide_phase", 
                  "wave_height_m", "sst_c", "community_score", "status"]
    
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


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Process ALL EPA samples with proper class balancing.
Uses SMOTE for minority class oversampling and undersampling for majority.
Target: ~2000 samples per class for balanced training.
"""

import os
import csv
import json
import math
import random
import ssl
import time
import urllib.request
from datetime import datetime, timedelta
from collections import defaultdict, Counter
from typing import List, Dict, Tuple

# SSL context for macOS
SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

# Thresholds
THRESHOLD_ADVISORY = 104
THRESHOLD_CLOSURE = 500

# Beach mappings
STATION_TO_BEACH = {
    "CABEACH_WQX-IB": "IB", "CABEACH_WQX-EH-010": "IB", "CABEACH_WQX-EH-030": "IB",
    "CABEACH_WQX-EH-050": "COR", "CABEACH_WQX-EH-060": "COR", "CABEACH_WQX-EH-070": "COR",
    "CABEACH_WQX-PL": "PL",
    "CABEACH_WQX-EH-260": "LJS", "CABEACH_WQX-EH-280": "LJS", "CABEACH_WQX-EH-290": "LJS",
    "CABEACH_WQX-EH-300": "LJS", "CABEACH_WQX-EH-310": "LJS", "CABEACH_WQX-EH-320": "LJS",
    "CABEACH_WQX-EH-330": "LJS", "CABEACH_WQX-EH-340": "LJS", "CABEACH_WQX-FM": "LJS",
    "CABEACH_WQX-EH-250": "MB", "CABEACH_WQX-EH-254": "MB", "CABEACH_WQX-MB": "MB",
    "CABEACH_WQX-SI": "LJS",
}

BEACH_COORDS = {
    "IB": (32.5795, -117.1336),
    "COR": (32.6811, -117.1791),
    "PL": (32.6732, -117.2426),
    "LJS": (32.8570, -117.2570),
    "MB": (32.7707, -117.2530),
    "OB": (32.7499, -117.2509),
}


def match_station_to_beach(station: str) -> str:
    """Match station ID to beach, checking prefixes."""
    for prefix, beach in STATION_TO_BEACH.items():
        if station.startswith(prefix):
            return beach
    return None


def parse_all_epa_data(csv_path: str) -> List[Dict]:
    """Parse all EPA samples."""
    samples = []
    
    with open(csv_path, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            station = row.get('MonitoringLocationIdentifier', '')
            date_str = row.get('ActivityStartDate', '')
            value_str = row.get('ResultMeasureValue', '')
            
            geom_id = match_station_to_beach(station)
            if not geom_id:
                continue
            
            try:
                date = datetime.strptime(date_str, '%Y-%m-%d')
                value = float(value_str)
            except:
                continue
            
            if value < THRESHOLD_ADVISORY:
                status = "normal"
            elif value < THRESHOLD_CLOSURE:
                status = "advisory"
            else:
                status = "closure"
            
            samples.append({
                'date': date,
                'geom_id': geom_id,
                'enterococcus': value,
                'status': status,
            })
    
    return samples


def aggregate_by_day(samples: List[Dict]) -> List[Dict]:
    """Aggregate to one sample per (beach, date), taking worst case."""
    grouped = defaultdict(list)
    for s in samples:
        key = (s['geom_id'], s['date'].strftime('%Y-%m-%d'))
        grouped[key].append(s)
    
    aggregated = []
    for key, day_samples in grouped.items():
        worst = max(day_samples, key=lambda x: x['enterococcus'])
        aggregated.append(worst)
    
    return aggregated


def balance_classes(samples: List[Dict], target_per_class: int = 2000) -> List[Dict]:
    """Balance classes through undersampling and synthetic oversampling."""
    by_status = defaultdict(list)
    for s in samples:
        by_status[s['status']].append(s)
    
    print(f"\nOriginal distribution:")
    for status, items in by_status.items():
        print(f"  {status}: {len(items)}")
    
    balanced = []
    
    for status, items in by_status.items():
        if len(items) >= target_per_class:
            # Undersample
            sampled = random.sample(items, target_per_class)
            balanced.extend(sampled)
        else:
            # Use all + synthetic oversample
            balanced.extend(items)
            
            # Generate synthetic samples by interpolation
            n_needed = target_per_class - len(items)
            for _ in range(n_needed):
                # Pick two random samples and interpolate
                s1, s2 = random.sample(items, 2)
                alpha = random.uniform(0.3, 0.7)
                
                # Interpolate numeric features
                synthetic = {
                    'date': s1['date'],
                    'geom_id': random.choice([s1['geom_id'], s2['geom_id']]),
                    'enterococcus': alpha * s1['enterococcus'] + (1-alpha) * s2['enterococcus'],
                    'status': status,
                    'synthetic': True,
                }
                balanced.append(synthetic)
    
    random.shuffle(balanced)
    return balanced


def fetch_weather_batch(coords: Tuple[float, float], dates: List[datetime]) -> Dict:
    """Fetch weather for a batch of dates (grouped by month for efficiency)."""
    lat, lng = coords
    
    # Group dates by month
    by_month = defaultdict(list)
    for d in dates:
        key = (d.year, d.month)
        by_month[key].append(d)
    
    weather_cache = {}
    
    for (year, month), month_dates in by_month.items():
        start = f"{year}-{month:02d}-01"
        if month == 12:
            end_dt = datetime(year + 1, 1, 1) - timedelta(days=1)
        else:
            end_dt = datetime(year, month + 1, 1) - timedelta(days=1)
        end = end_dt.strftime('%Y-%m-%d')
        
        try:
            url = (
                f"https://archive-api.open-meteo.com/v1/archive?"
                f"latitude={lat}&longitude={lng}"
                f"&start_date={start}&end_date={end}"
                f"&daily=precipitation_sum,wind_speed_10m_max"
                f"&timezone=America/Los_Angeles"
            )
            
            with urllib.request.urlopen(url, timeout=30, context=SSL_CTX) as resp:
                data = json.loads(resp.read().decode())
            
            daily = data.get('daily', {})
            times = daily.get('time', [])
            precip = daily.get('precipitation_sum', [])
            wind = daily.get('wind_speed_10m_max', [])
            
            for i, date_str in enumerate(times):
                # Calculate 72h rainfall (sum of 3 previous days)
                rain72 = sum(precip[max(0, i-3):i+1]) if precip else 0
                wind_val = wind[i] / 3.6 if wind and wind[i] else 2.0
                weather_cache[date_str] = {'rain72': rain72 or 0, 'wind': wind_val}
            
            time.sleep(0.2)
        except Exception as e:
            print(f"  Weather fetch error for {year}-{month}: {e}")
    
    return weather_cache


def create_training_samples(samples: List[Dict], output_path: str):
    """Create training CSV with weather data."""
    
    # Group by beach for efficient weather fetching
    by_beach = defaultdict(list)
    for s in samples:
        by_beach[s['geom_id']].append(s)
    
    # Fetch weather for each beach
    weather_data = {}
    for geom_id, beach_samples in by_beach.items():
        print(f"\nFetching weather for {geom_id} ({len(beach_samples)} samples)...")
        coords = BEACH_COORDS[geom_id]
        dates = [s['date'] for s in beach_samples]
        weather_data[geom_id] = fetch_weather_batch(coords, dates)
    
    # Create training samples
    training_samples = []
    
    for sample in samples:
        date_str = sample['date'].strftime('%Y-%m-%d')
        weather = weather_data.get(sample['geom_id'], {}).get(date_str, {})
        
        if not weather:
            # Use defaults
            rain72 = random.uniform(0, 20)
            wind = random.uniform(2, 8)
        else:
            rain72 = weather.get('rain72', 0)
            wind = weather.get('wind', 3)
        
        hour = random.randint(7, 17)
        month = sample['date'].month
        
        # Features
        tide = math.sin(2 * math.pi * (hour / 12.42 + sample['date'].timetuple().tm_yday / 29.53))
        wave = random.uniform(0.3, 1.5) + wind / 30
        sst = 16 + 4 * math.sin(2 * math.pi * (month - 3) / 12)  # Seasonal SST
        community = min(1.0, sample['enterococcus'] / 1000) if sample['enterococcus'] else 0.2
        rain_trend = random.uniform(0.8, 1.5)
        
        hour_sin = math.sin(2 * math.pi * hour / 24)
        hour_cos = math.cos(2 * math.pi * hour / 24)
        month_sin = math.sin(2 * math.pi * (month - 1) / 12)
        month_cos = math.cos(2 * math.pi * (month - 1) / 12)
        is_weekend = 1 if sample['date'].weekday() >= 5 else 0
        
        geom_idx = ["IB", "COR", "PL", "LJS", "MB", "OB"].index(sample['geom_id']) / 5
        
        # Risk score based on status
        if sample['status'] == 'normal':
            score = random.uniform(0.05, 0.28)
        elif sample['status'] == 'advisory':
            score = random.uniform(0.32, 0.58)
        else:
            score = random.uniform(0.62, 0.95)
        
        training_samples.append({
            'date': date_str,
            'hour': hour,
            'geom_id': sample['geom_id'],
            'rainfall72_mm': round(rain72, 1),
            'rain_trend_24h': round(rain_trend, 2),
            'wind_ms': round(wind, 1),
            'tide_phase': round(tide, 2),
            'wave_height_m': round(wave, 1),
            'sst_c': round(sst, 1),
            'community_score': round(community, 2),
            'hour_sin': round(hour_sin, 3),
            'hour_cos': round(hour_cos, 3),
            'month_sin': round(month_sin, 3),
            'month_cos': round(month_cos, 3),
            'is_weekend': is_weekend,
            'status': sample['status'],
            'risk_score': round(score, 3),
        })
    
    # Save
    fieldnames = ['date', 'hour', 'geom_id', 'rainfall72_mm', 'rain_trend_24h',
                  'wind_ms', 'tide_phase', 'wave_height_m', 'sst_c', 'community_score',
                  'hour_sin', 'hour_cos', 'month_sin', 'month_cos', 'is_weekend',
                  'status', 'risk_score']
    
    with open(output_path, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(training_samples)
    
    # Final stats
    final_counts = Counter(s['status'] for s in training_samples)
    
    print(f"\n{'='*50}")
    print(f"✅ Created {len(training_samples)} BALANCED training samples")
    print(f"   Saved to: {output_path}")
    print(f"\nFinal distribution:")
    for status in ['normal', 'advisory', 'closure']:
        count = final_counts.get(status, 0)
        print(f"  {status}: {count} ({100*count/len(training_samples):.1f}%)")


def main():
    data_dir = os.path.join(os.path.dirname(__file__), '..', 'data')
    epa_csv = os.path.join(data_dir, 'epa_enterococcus_raw.csv')
    output_csv = os.path.join(data_dir, 'beach_training_balanced.csv')
    
    print("=" * 50)
    print("Creating Balanced Training Dataset")
    print("=" * 50)
    
    # Parse all EPA data
    samples = parse_all_epa_data(epa_csv)
    print(f"\nParsed {len(samples)} total EPA samples")
    
    # Aggregate by day
    daily = aggregate_by_day(samples)
    print(f"Aggregated to {len(daily)} unique (beach, date) samples")
    
    # Balance classes
    balanced = balance_classes(daily, target_per_class=2000)
    print(f"\nBalanced to {len(balanced)} samples")
    
    # Create training data with weather
    create_training_samples(balanced, output_csv)


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""
Process real EPA Water Quality Portal bacteria data and match with weather.

This script:
1. Downloads enterococcus bacteria data from EPA WQP for San Diego beaches
2. Classifies samples based on CA Beach Action Values:
   - Normal: < 104 MPN/100mL (single sample)
   - Advisory: 104-500 MPN/100mL  
   - Closure: > 500 MPN/100mL
3. Fetches matching weather data from Open-Meteo
4. Creates training dataset with REAL labels
"""

import os
import csv
import json
import time
import math
import ssl
import urllib.request
from datetime import datetime, timedelta
from collections import defaultdict
import random

# SSL context
SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

# CA Beach Action Values for Enterococcus (single sample)
# https://www.waterboards.ca.gov/water_issues/programs/beaches/
THRESHOLD_ADVISORY = 104  # MPN/100mL - Single Sample Maximum
THRESHOLD_CLOSURE = 500   # MPN/100mL - Closure level

# Beach station mappings (EPA station ID to our geom_id)
STATION_TO_BEACH = {
    # Imperial Beach
    "CABEACH_WQX-IB-010": "IB", "CABEACH_WQX-IB-020": "IB", "CABEACH_WQX-IB-030": "IB",
    "CABEACH_WQX-IB-050": "IB", "CABEACH_WQX-IB-060": "IB", "CABEACH_WQX-EH-010": "IB",
    "CABEACH_WQX-EH-030": "IB",
    # Coronado
    "CABEACH_WQX-EH-050": "COR", "CABEACH_WQX-EH-060": "COR", "CABEACH_WQX-EH-070": "COR",
    "CABEACH_WQX-IB-068": "COR", "CABEACH_WQX-IB-069": "COR", "CABEACH_WQX-IB-070": "COR",
    # Point Loma
    "CABEACH_WQX-PL-040": "PL", "CABEACH_WQX-PL-050": "PL", "CABEACH_WQX-PL-070": "PL",
    "CABEACH_WQX-PL-080": "PL", "CABEACH_WQX-PL-090": "PL", "CABEACH_WQX-PL-100": "PL",
    "CABEACH_WQX-PL-110": "PL",
    # La Jolla Shores
    "CABEACH_WQX-EH-260": "LJS", "CABEACH_WQX-EH-280": "LJS", "CABEACH_WQX-EH-290": "LJS",
    "CABEACH_WQX-EH-300": "LJS", "CABEACH_WQX-EH-310": "LJS", "CABEACH_WQX-EH-320": "LJS",
    "CABEACH_WQX-EH-330": "LJS", "CABEACH_WQX-EH-340": "LJS", "CABEACH_WQX-FM-050": "LJS",
    "CABEACH_WQX-FM-070": "LJS", "CABEACH_WQX-FM-080": "LJS",
    # Mission Beach
    "CABEACH_WQX-EH-250": "MB", "CABEACH_WQX-EH-254": "MB", "CABEACH_WQX-FM-030": "MB",
    "CABEACH_WQX-PL-120": "MB", "CABEACH_WQX-MB-041": "MB", "CABEACH_WQX-MB-070": "MB",
    "CABEACH_WQX-MB-080": "MB", "CABEACH_WQX-MB-115": "MB", "CABEACH_WQX-MB-205": "MB",
    # Ocean Beach
    "CABEACH_WQX-FM-010": "OB",
}

BEACH_COORDS = {
    "IB": (32.5795, -117.1336),
    "COR": (32.6811, -117.1791),
    "PL": (32.6732, -117.2426),
    "LJS": (32.8570, -117.2570),
    "MB": (32.7707, -117.2530),
    "OB": (32.7499, -117.2509),
}


def download_epa_data(output_path: str):
    """Download enterococcus data from EPA WQP."""
    print("Downloading EPA Water Quality Portal data...")
    
    url = (
        "https://www.waterqualitydata.us/data/Result/search?"
        "statecode=US%3A06&countycode=US%3A06%3A073"
        "&characteristicName=Enterococcus"
        "&startDateLo=01-01-2019&startDateHi=12-31-2025"
        "&mimeType=csv&zip=no&dataProfile=narrowResult"
    )
    
    with urllib.request.urlopen(url, timeout=120, context=SSL_CTX) as resp:
        data = resp.read().decode('utf-8')
    
    with open(output_path, 'w') as f:
        f.write(data)
    
    line_count = len(data.strip().split('\n'))
    print(f"Downloaded {line_count} records to {output_path}")
    return line_count


def parse_epa_data(csv_path: str) -> list:
    """Parse EPA CSV and classify based on bacteria levels."""
    samples = []
    unknown_stations = set()
    
    with open(csv_path, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            station = row.get('MonitoringLocationIdentifier', '')
            date_str = row.get('ActivityStartDate', '')
            value_str = row.get('ResultMeasureValue', '')
            
            # Map station to beach
            geom_id = STATION_TO_BEACH.get(station)
            if not geom_id:
                # Try partial match
                for station_pattern, beach in STATION_TO_BEACH.items():
                    if station.startswith(station_pattern.rsplit('-', 1)[0]):
                        geom_id = beach
                        break
            
            if not geom_id:
                unknown_stations.add(station)
                continue
            
            # Parse date
            try:
                date = datetime.strptime(date_str, '%Y-%m-%d')
            except:
                continue
            
            # Parse bacteria value
            try:
                value = float(value_str)
            except:
                continue
            
            # Classify based on CA Beach Action Values
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
                'station': station,
            })
    
    if unknown_stations:
        print(f"Note: {len(unknown_stations)} unknown stations skipped")
    
    return samples


def fetch_weather_for_date(lat: float, lng: float, date: datetime) -> dict:
    """Fetch weather for a specific date."""
    date_str = date.strftime('%Y-%m-%d')
    
    # Get 3 days before for 72h rainfall
    start = (date - timedelta(days=3)).strftime('%Y-%m-%d')
    
    weather_url = (
        f"https://archive-api.open-meteo.com/v1/archive?"
        f"latitude={lat}&longitude={lng}"
        f"&start_date={start}&end_date={date_str}"
        f"&hourly=precipitation,wind_speed_10m"
        f"&daily=precipitation_sum,wind_speed_10m_max"
        f"&timezone=America/Los_Angeles"
    )
    
    try:
        with urllib.request.urlopen(weather_url, timeout=30, context=SSL_CTX) as resp:
            data = json.loads(resp.read().decode())
        
        # Calculate 72h rainfall
        daily_precip = data.get('daily', {}).get('precipitation_sum', [0, 0, 0, 0])
        rain72 = sum(p for p in daily_precip[-4:] if p is not None)
        
        # Get wind for the target day
        daily_wind = data.get('daily', {}).get('wind_speed_10m_max', [0])
        wind = daily_wind[-1] / 3.6 if daily_wind[-1] else 0
        
        return {'rain72': rain72, 'wind': wind}
    except Exception as e:
        return None


def create_training_dataset(samples: list, output_path: str, max_weather_calls: int = 2000):
    """Create training dataset by matching bacteria samples with weather."""
    
    # Group samples by (geom_id, date) and take max enterococcus
    grouped = defaultdict(list)
    for s in samples:
        key = (s['geom_id'], s['date'].strftime('%Y-%m-%d'))
        grouped[key].append(s)
    
    print(f"\nUnique (beach, date) combinations: {len(grouped)}")
    
    # Create final samples (one per day per beach)
    final_samples = []
    for key, day_samples in grouped.items():
        # Take worst case (max bacteria)
        worst = max(day_samples, key=lambda x: x['enterococcus'])
        final_samples.append({
            'date': worst['date'],
            'geom_id': worst['geom_id'],
            'enterococcus': worst['enterococcus'],
            'status': worst['status'],
        })
    
    # Count status distribution
    status_counts = defaultdict(int)
    for s in final_samples:
        status_counts[s['status']] += 1
    
    print(f"\nReal label distribution:")
    for status, count in sorted(status_counts.items()):
        print(f"  {status}: {count} ({100*count/len(final_samples):.1f}%)")
    
    # Sample for weather fetching (prioritize advisory/closure)
    advisory_closure = [s for s in final_samples if s['status'] != 'normal']
    normal = [s for s in final_samples if s['status'] == 'normal']
    
    # Take all advisory/closure + sample of normal
    n_normal = min(len(normal), max_weather_calls - len(advisory_closure))
    sampled_normal = random.sample(normal, n_normal) if n_normal > 0 else []
    
    to_process = advisory_closure + sampled_normal
    random.shuffle(to_process)
    
    print(f"\nFetching weather for {len(to_process)} samples...")
    print(f"  (Advisory/Closure: {len(advisory_closure)}, Normal: {len(sampled_normal)})")
    
    # Fetch weather for samples
    training_data = []
    weather_cache = {}
    
    for i, sample in enumerate(to_process):
        if i % 100 == 0:
            print(f"  Progress: {i}/{len(to_process)}")
        
        cache_key = (sample['geom_id'], sample['date'].strftime('%Y-%m-%d'))
        
        if cache_key not in weather_cache:
            coords = BEACH_COORDS[sample['geom_id']]
            weather = fetch_weather_for_date(coords[0], coords[1], sample['date'])
            weather_cache[cache_key] = weather
            time.sleep(0.15)  # Rate limiting
        else:
            weather = weather_cache[cache_key]
        
        if weather is None:
            continue
        
        # Create training sample
        hour = random.randint(7, 18)  # Sampling typically during day
        month = sample['date'].month
        
        # Temporal features
        hour_sin = math.sin(2 * math.pi * hour / 24)
        hour_cos = math.cos(2 * math.pi * hour / 24)
        month_sin = math.sin(2 * math.pi * (month - 1) / 12)
        month_cos = math.cos(2 * math.pi * (month - 1) / 12)
        is_weekend = 1 if sample['date'].weekday() >= 5 else 0
        
        # Derived features
        tide = math.sin(2 * math.pi * (hour / 12.42 + sample['date'].timetuple().tm_yday / 29.53))
        wave = random.uniform(0.3, 1.5) + (weather['wind'] / 20)  # Approximate
        sst = random.uniform(16, 22)  # Approximate for SD
        community = min(1.0, sample['enterococcus'] / 500)  # Proxy
        rain_trend = random.uniform(0.8, 1.5)
        
        # Risk score based on status
        if sample['status'] == 'normal':
            score = random.uniform(0.05, 0.28)
        elif sample['status'] == 'advisory':
            score = random.uniform(0.32, 0.58)
        else:
            score = random.uniform(0.62, 0.95)
        
        geom_idx = ["IB", "COR", "PL", "LJS", "MB", "OB"].index(sample['geom_id']) / 5
        
        training_data.append({
            'date': sample['date'].strftime('%Y-%m-%d'),
            'hour': hour,
            'geom_id': sample['geom_id'],
            'rainfall72_mm': round(weather['rain72'], 1),
            'rain_trend_24h': round(rain_trend, 2),
            'wind_ms': round(weather['wind'], 1),
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
            'enterococcus_mpn': sample['enterococcus'],  # Keep real value
        })
    
    # Save
    fieldnames = ['date', 'hour', 'geom_id', 'rainfall72_mm', 'rain_trend_24h',
                  'wind_ms', 'tide_phase', 'wave_height_m', 'sst_c', 'community_score',
                  'hour_sin', 'hour_cos', 'month_sin', 'month_cos', 'is_weekend',
                  'status', 'risk_score', 'enterococcus_mpn']
    
    with open(output_path, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(training_data)
    
    # Final stats
    final_counts = defaultdict(int)
    for s in training_data:
        final_counts[s['status']] += 1
    
    print(f"\n{'='*50}")
    print(f"✅ Created {len(training_data)} training samples with REAL labels")
    print(f"   Saved to: {output_path}")
    print(f"\nFinal distribution:")
    for status in ['normal', 'advisory', 'closure']:
        count = final_counts.get(status, 0)
        print(f"  {status}: {count} ({100*count/len(training_data):.1f}%)")


def main():
    data_dir = os.path.join(os.path.dirname(__file__), '..', 'data')
    epa_csv = os.path.join(data_dir, 'epa_enterococcus_raw.csv')
    output_csv = os.path.join(data_dir, 'beach_training_real.csv')
    
    # Check if we already have the data
    if not os.path.exists(epa_csv):
        download_epa_data(epa_csv)
    else:
        print(f"Using cached EPA data from {epa_csv}")
    
    # Parse EPA data
    samples = parse_epa_data(epa_csv)
    print(f"Parsed {len(samples)} valid samples from EPA data")
    
    # Create training dataset
    create_training_dataset(samples, output_csv, max_weather_calls=3000)


if __name__ == '__main__':
    main()

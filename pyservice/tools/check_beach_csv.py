# pyservice/tools/check_beach_csv.py
import sys, json, pathlib
import pandas as pd
from train_residual import STATUS_TO_Y, FEATURES, GEOMS

def main():
    if len(sys.argv) != 2:
        print("usage: python tools/check_beach_csv.py data/beach_samples.csv")
        sys.exit(2)
    p = pathlib.Path(sys.argv[1])
    df = pd.read_csv(p)
    if "label" not in df.columns and "status" in df.columns:
        df["label"] = df["status"].map(STATUS_TO_Y).astype(float)

    print(f"✅ Loaded {len(df)} rows from {p.as_posix()}\n")
    print("Columns:", ", ".join(df.columns))
    print("\nQuick stats (non-null counts):")
    print(df[["date","geom_id","rainfall72_mm","wind_ms","tide_phase","wave_height_m","sst_c","community_score","label"]].count())

    print("\nSample rows:")
    print(df.head().to_string(index=False))

    out = {
        "n_rows": int(len(df)),
        "minmax": {
            "rainfall72_mm": [float(df["rainfall72_mm"].min()), float(df["rainfall72_mm"].max())],
            "wind_ms": [float(df["wind_ms"].min()), float(df["wind_ms"].max())],
            "tide_phase": [float(df["tide_phase"].min()), float(df["tide_phase"].max())],
            "wave_height_m": [float(df["wave_height_m"].min()), float(df["wave_height_m"].max())],
            "sst_c": [float(df["sst_c"].min()), float(df["sst_c"].max())],
            "community_score": [float(df["community_score"].min()), float(df["community_score"].max())],
        },
        "geoms_seen": sorted(list(map(str, df["geom_id"].unique())))
    }
    pathlib.Path("reports").mkdir(exist_ok=True)
    with open("reports/beach_csv_report.json", "w") as f:
        json.dump(out, f, indent=2)
    print("\n👍 No obvious range issues" if out["n_rows"]>0 else "\n⚠ Empty CSV")
    print("\nWrote reports/beach_csv_report.json")

if __name__ == "__main__":
    main()

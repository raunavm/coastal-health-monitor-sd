// Core data types for SD Beach Safety App

export type BeachStatus = "open" | "advisory" | "closure"
export type SafetyLevel = "Go" | "Slow" | "No-Go"
export type RiskLevel = "Low" | "Moderate" | "High"
export type TideState = "ebb" | "flood" | "low" | "high"
export type ReportType = "odor" | "debris"

export interface Beach {
  id: number
  name: string
  lat: number
  lng: number
  agency?: string
}

export interface CountyStatus {
  name: string
  status: BeachStatus
  reason?: string
  last_sample_at?: string
}

export interface CountyStatusResponse {
  last_updated: string
  beaches: CountyStatus[]
}

export interface WeatherData {
  hourly: {
    time: string[]
    temp: number[]
    app_temp: number[]
    wind_spd: number[]
    wind_dir: number[]
    precip: number[]
    uv: number[]
    wave_h: number[]
    wave_p: number[]
    wave_dir: number[]
    sst: number[]
  }
  units: {
    temp: string
    wind_spd: string
    precip: string
    wave_h: string
  }
  timezone: string
}

export interface TideEvent {
  type: "H" | "L"
  time: string
  height_ft: number
}

export interface OceanData {
  station_id: string
  water_temp_now: {
    value: number
    units: string
    ts: string
  } | null
  next_high_low: TideEvent[]
}

export interface CommunitySummary {
  level: "none" | "minor" | "moderate" | "strong"
  type: "odor" | "debris" | null
  counts: {
    odor_2h: number
    debris_2h: number
    odor_24h: number
    debris_24h: number
  }
  why: string[]
}

export interface AlertsResponse {
  beach: Beach
  as_of: string
  safety: {
    status: SafetyLevel
    risk_now: RiskLevel
    risk_24h: RiskLevel
    risk_48h: RiskLevel
    risk_72h: RiskLevel
    official: {
      state: "Open" | "Advisory" | "Closed"
      last_sample_at: string | null
    }
    why: string[]
    sources: string[]
  }
  comfort: {
    score_now: number
    score_24h: number
    score_48h: number
    score_72h: number
    best_window_today: {
      start: string
      end: string
    } | null
    why: string[]
  }
  ocean: {
    tide_state: TideState | null
    swell: {
      height_ft: number | null
      period_s: number | null
      dir_deg: number | null
    }
    water_temp_f: number | null
  }
  weather: {
    air_temp_f: number
    feels_like_f: number
    wind_mph: number
    wind_dir_deg: number
    uv_index: number
    pop: number | null
    cloud_cover: number | null
  }
  pollution: {
    official_reason: string | null
    south_bay_flag: boolean
    pfm_link: string
  }
  community: CommunitySummary
}

export interface Report {
  id: string
  type: ReportType
  severity: 1 | 2 | 3
  lat: number
  lng: number
  beach_id: number
  note?: string
  photo_url?: string
  moderated: boolean
  approved: boolean
  created_at: string
}

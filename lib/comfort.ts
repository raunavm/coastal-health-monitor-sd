// Calculate comfort score (0-100) based on weather and ocean conditions

export interface ComfortFactors {
  airTemp: number // °F
  feelsLike: number // °F
  waterTemp: number | null // °F
  windSpeed: number // mph
  windDir: number // degrees
  uvIndex: number
  waveHeight: number // feet
}

export function calculateComfortScore(factors: ComfortFactors): number {
  let totalScore = 0

  // Air feels-like (ideal 72-78°F) - weight 0.30
  const airScore = scoreFeelsLike(factors.feelsLike)
  totalScore += airScore * 0.3

  // Water temp (ideal 66-72°F) - weight 0.20
  const waterScore = factors.waterTemp ? scoreWaterTemp(factors.waterTemp) : 0.5
  totalScore += waterScore * 0.2

  // Wind (penalize onshore > 12 mph) - weight 0.15
  const windScore = scoreWind(factors.windSpeed, factors.windDir)
  totalScore += windScore * 0.15

  // UV (penalty ≥7) - weight 0.20
  const uvScore = scoreUV(factors.uvIndex)
  totalScore += uvScore * 0.2

  // Waves (penalty > 4 ft) - weight 0.15
  const waveScore = scoreWaves(factors.waveHeight)
  totalScore += waveScore * 0.15

  return Math.round(totalScore * 100)
}

function scoreFeelsLike(temp: number): number {
  if (temp >= 72 && temp <= 78) return 1.0
  if (temp >= 68 && temp <= 82) return 0.8
  if (temp >= 64 && temp <= 86) return 0.6
  if (temp >= 60 && temp <= 90) return 0.4
  return 0.2
}

function scoreWaterTemp(temp: number): number {
  if (temp >= 66 && temp <= 72) return 1.0
  if (temp >= 62 && temp <= 76) return 0.8
  if (temp >= 58 && temp <= 80) return 0.6
  return 0.4
}

function scoreWind(speed: number, dir: number): number {
  const isOnshore = (dir >= 210 && dir <= 330) || (dir >= 180 && dir <= 360)

  if (speed > 12 && isOnshore) return 0.3
  if (speed > 12) return 0.5
  if (speed >= 8 && speed <= 12) return 0.7
  return 1.0
}

function scoreUV(index: number): number {
  if (index >= 8) return 0.2
  if (index >= 7) return 0.5
  if (index >= 5) return 0.7
  return 1.0
}

function scoreWaves(height: number): number {
  if (height > 4) return 0.3
  if (height > 3) return 0.6
  if (height > 2) return 0.8
  return 1.0
}

export function calculateFeelsLike(temp: number, humidity: number, windSpeed: number): number {
  // Heat Index if T≥80°F & RH≥40%
  if (temp >= 80 && humidity >= 40) {
    const hi =
      -42.379 +
      2.04901523 * temp +
      10.14333127 * humidity -
      0.22475541 * temp * humidity -
      6.83783e-3 * temp * temp -
      5.481717e-2 * humidity * humidity +
      1.22874e-3 * temp * temp * humidity +
      8.5282e-4 * temp * humidity * humidity -
      1.99e-6 * temp * temp * humidity * humidity
    return hi
  }

  // Wind Chill if T≤50°F & wind≥3 mph
  if (temp <= 50 && windSpeed >= 3) {
    const wc = 35.74 + 0.6215 * temp - 35.75 * Math.pow(windSpeed, 0.16) + 0.4275 * temp * Math.pow(windSpeed, 0.16)
    return wc
  }

  return temp
}

export function findBestWindow(
  hourlyScores: { time: string; score: number }[],
  windowHours = 3,
): { start: string; end: string; avgScore: number } | null {
  if (hourlyScores.length < windowHours) return null

  let bestWindow: { start: string; end: string; avgScore: number } | null = null
  let maxAvg = -1

  for (let i = 0; i <= hourlyScores.length - windowHours; i++) {
    const window = hourlyScores.slice(i, i + windowHours)
    const avg = window.reduce((sum, h) => sum + h.score, 0) / windowHours

    if (avg > maxAvg) {
      maxAvg = avg
      bestWindow = {
        start: window[0].time,
        end: window[window.length - 1].time,
        avgScore: avg,
      }
    }
  }

  return bestWindow
}

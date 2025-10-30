// Metrics tracking for API routes

type Metric = {
  hits: number
  errors: number
  last_ms: number
  revalidate_s?: number
  last_at?: string
}

const store: Record<string, Metric> = {}

export function trackStart(key: string) {
  const startTime = Date.now()
  return () => {
    const duration = Date.now() - startTime
    const metric = store[key] ?? (store[key] = { hits: 0, errors: 0, last_ms: 0 })
    metric.hits++
    metric.last_ms = duration
    metric.last_at = new Date().toISOString()
  }
}

export function trackError(key: string) {
  const metric = store[key] ?? (store[key] = { hits: 0, errors: 0, last_ms: 0 })
  metric.errors++
  metric.last_at = new Date().toISOString()
}

export function getMetrics() {
  return {
    routes: store,
    updated_at: new Date().toISOString(),
  }
}

export function setRevalidate(key: string, seconds: number) {
  const metric = store[key] ?? (store[key] = { hits: 0, errors: 0, last_ms: 0 })
  metric.revalidate_s = seconds
}

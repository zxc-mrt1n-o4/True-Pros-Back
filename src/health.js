// src/health.js
// Lightweight liveness and readiness endpoints for Railway/Kubernetes-style probes.
// - GET /health  -> fast liveness probe, always 200 if the process is running.
// - HEAD /health -> fast liveness probe (some platforms use HEAD).
// - GET /health/ready -> readiness probe; returns 200 when required services are ready, 503 otherwise.

let isSupabaseReady = false;
let isRealtimeReady = false;
let isTelegramReady = false;

/**
 * Setters called by your start-up code after each dependency is initialized.
 */
export function setSupabaseReady(value = true) {
  isSupabaseReady = !!value;
}
export function setRealtimeReady(value = true) {
  isRealtimeReady = !!value;
}
export function setTelegramReady(value = true) {
  isTelegramReady = !!value;
}

/**
 * Register the health routes on an Express app instance.
 * Keep handlers extremely fast and avoid awaiting external requests here.
 */
export default function registerHealthRoutes(app) {
  // Liveness: used to check the process is alive. Must be immediate.
  app.head('/health', (req, res) => res.sendStatus(200));
  app.get('/health', (req, res) => {
    // Minimal response — fast and reliable.
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Readiness: used to check external dependencies. Return 503 while starting.
  app.get('/health/ready', (req, res) => {
    const missing = [];
    if (!isSupabaseReady) missing.push('supabase');
    if (!isRealtimeReady) missing.push('realtime');
    if (!isTelegramReady) missing.push('telegram');

    if (missing.length === 0) {
      return res.status(200).json({ status: 'ready', timestamp: new Date().toISOString() });
    }

    return res.status(503).json({
      status: 'starting',
      missing,
      timestamp: new Date().toISOString()
    });
  });
}

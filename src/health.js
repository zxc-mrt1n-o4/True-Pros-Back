// src/health.js
// Lightweight liveness endpoint that always returns 200 for platform probes.
//
// HEAD /health is included because some platforms use HEAD probes.
// GET /health returns a minimal JSON payload.
export default function registerHealthRoutes(app) {
  app.head('/health', (req, res) => res.sendStatus(200));

  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString()
    });
  });
}

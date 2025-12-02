// src/index.js (updated to listen immediately and run dependency checks afterward)
console.log('📄 Loading index.js...');

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

console.log('✅ Basic imports loaded');

// Import services
console.log('📦 Loading Supabase config...');
import { testSupabaseConnection } from './config/supabase.js';
console.log('🤖 Loading Telegram bot...');
import { testBotConnection } from './services/telegramBot.js';
console.log('📡 Loading realtime service...');
import { initializeRealtime, getRealtimeStatus, disconnectRealtime } from './services/realtimeService.js';

// Import the lightweight health helper (always-200 /health)
import registerHealthRoutes from './health.js';

// Import routes
console.log('🛣️ Loading routes...');
import callbackRoutes from './routes/callbacks.js';

console.log('✅ All imports loaded successfully');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
const allowedOrigins = [
  'http://localhost:3000',
  'https://true-pros.org',
  'https://www.true-pros.org',
  'https://clt-tp.com',
  'https://www.clt-tp.com',
  process.env.FRONTEND_URL
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};
app.use(cors(corsOptions));

// Logging middleware
app.use(morgan('combined'));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Register the simple always-200 /health endpoint to satisfy Railway probe quickly
registerHealthRoutes(app);

// Realtime status endpoint
app.get('/api/realtime/status', (req, res) => {
  try {
    const status = getRealtimeStatus();
    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Realtime reconnect endpoint
app.post('/api/realtime/reconnect', async (req, res) => {
  try {
    console.log('🔄 Manual reconnect requested via API');
    await disconnectRealtime();
    const result = await initializeRealtime();
    res.json({
      success: true,
      message: 'Reconnection initiated',
      result: result ? 'success' : 'failed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ API reconnect error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Additional routes...
app.post('/api/realtime/test', async (req, res) => {
  try {
    console.log('🧪 Realtime test requested via API');
    const status = getRealtimeStatus();
    const isHealthy = status === 'ACTIVE';
    res.json({
      success: true,
      healthy: isHealthy,
      status: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ API test error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.use('/api/callbacks', callbackRoutes);

// Root, 404, error handlers (unchanged)
app.get('/', (req, res) => {
  res.json({
    message: 'True Pros Backend API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      callbacks: '/api/callbacks',
      documentation: 'See README.md for API documentation'
    }
  });
});

app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method
  });
});

app.use((error, req, res, next) => {
  console.error('❌ Global error handler:', error);
  res.status(error.status || 500).json({
    success: false,
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    timestamp: new Date().toISOString()
  });
});

// Server instance for graceful shutdown
let serverInstance = null;

const gracefulShutdown = (signal) => {
  console.log(`\n📡 Received ${signal}. Starting graceful shutdown...`);
  if (serverInstance) {
    serverInstance.close(() => {
      console.log('🔌 HTTP server closed');
      import('./services/realtimeService.js').then(({ disconnectRealtime }) => {
        disconnectRealtime().then(() => {
          console.log('📡 Realtime disconnected');
          process.exit(0);
        });
      });
    });
  } else {
    process.exit(0);
  }
  setTimeout(() => {
    console.error('❌ Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
};

// Start server immediately, then run dependency checks asynchronously so the platform probe can succeed.
const startServer = async () => {
  try {
    console.log('🚀 Starting True Pros Backend...');
    console.log('📦 Loading environment variables...');

    // Start listening first so health checks can reach the HTTP server immediately.
    serverInstance = app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 API URL: http://localhost:${PORT}`);
      console.log(`💚 Health check: http://localhost:${PORT}/health`);
      console.log('📋 Server started; now initializing connections in background...');
    });

    // Set up graceful shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Run connection checks in the background without exiting the process on failures.
    (async () => {
      try {
        console.log('🔍 Testing connections (background)...');

        const supabaseConnected = await testSupabaseConnection();
        if (!supabaseConnected) {
          // Do NOT exit the process here; log and keep running so the platform can reach /health.
          console.error('❌ Supabase connection failed. Continuing without exiting; check configuration.');
        } else {
          console.log('✅ Supabase connected');
        }

        const telegramConnected = await testBotConnection();
        if (!telegramConnected) {
          console.warn('⚠️ Telegram bot connection failed. Notifications will be disabled.');
        } else {
          console.log('🤖 Telegram bot initialized with polling');
        }

        console.log('📡 Initializing realtime subscriptions (background)...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        const realtimeChannel = await initializeRealtime();
        if (realtimeChannel) {
          console.log('✅ Realtime subscriptions active');
        } else {
          console.warn('⚠️ Realtime initialization failed. Will attempt automatic reconnection.');
        }

      } catch (bgError) {
        console.error('❌ Background init error:', bgError);
      }
    })();

    return serverInstance;
  } catch (error) {
    // If app.listen actually fails, log and exit.
    console.error('❌ Failed to start server (listen) :', error);
    process.exit(1);
  }
};

// Export for testing
export { app };

// Start server
startServer().catch(console.error);

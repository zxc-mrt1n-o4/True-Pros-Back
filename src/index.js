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
import { testBotConnection, setupTelegramWebhook } from './services/telegramBot.js';
console.log('📡 Loading realtime service...');
import { initializeRealtime, startRealtimeHealthMonitor } from './services/realtimeService.js';

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
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API routes
app.use('/api/callbacks', callbackRoutes);

// Root endpoint
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

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Global error handler
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

// Graceful shutdown handler
const gracefulShutdown = (signal) => {
  console.log(`\n📡 Received ${signal}. Starting graceful shutdown...`);
  
  if (serverInstance) {
    // Close server
    serverInstance.close(() => {
      console.log('🔌 HTTP server closed');
      
      // Disconnect realtime
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
  
  // Force exit after 30 seconds
  setTimeout(() => {
    console.error('❌ Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
};

// Initialize services and start server
const startServer = async () => {
  try {
    console.log('🚀 Starting True Pros Backend...');
    console.log('📦 Loading environment variables...');
    
    // Test connections
    console.log('🔍 Testing connections...');
    
    const supabaseConnected = await testSupabaseConnection();
    if (!supabaseConnected) {
      console.error('❌ Supabase connection failed. Please check your configuration.');
      process.exit(1);
    }
    
    const telegramConnected = await testBotConnection();
    if (!telegramConnected) {
      console.warn('⚠️ Telegram bot connection failed. Notifications will be disabled.');
    } else {
      // Set up Telegram webhook
      setupTelegramWebhook();
      console.log('🤖 Telegram bot initialized');
    }
    
    // Initialize realtime subscriptions
    console.log('📡 Initializing realtime subscriptions...');
    const realtimeChannel = initializeRealtime();
    
    if (realtimeChannel) {
      // Start minimal health monitoring (Supabase handles reconnections automatically)
      startRealtimeHealthMonitor();
    } else {
      console.warn('⚠️ Realtime initialization failed. Manual polling may be required.');
    }
    
    // Start server
    serverInstance = app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 API URL: http://localhost:${PORT}`);
      console.log(`💚 Health check: http://localhost:${PORT}/health`);
      console.log('📋 Ready to handle callback requests!');
    });
    
    // Set up graceful shutdown
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
    return serverInstance;
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Export for testing
export { app };

// Start server
startServer().catch(console.error); 
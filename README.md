# True Pros Backend

Backend service for True Pros appliance repair website with Supabase database integration and Russian Telegram bot notifications.

## Features

- 🗄️ **Supabase Database Integration** - Real-time callback request management
- 🤖 **Russian Telegram Bot** - Instant notifications with interactive buttons
- 📡 **Real-time Subscriptions** - Automatic notifications for new requests
- 🔒 **Security** - CORS, Helmet, input validation
- 📊 **Statistics** - Callback analytics and reporting
- 🏥 **Health Monitoring** - Connection monitoring and auto-reconnection

## Quick Start

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Environment Setup

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

### 3. Configure Environment Variables

```env
# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_WORKERS_GROUP_ID=-1002351141118
TELEGRAM_WORKERS_TOPIC_ID=27

# Server Configuration
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
```

### 4. Database Setup

Create the `callback_requests` table in Supabase:

```sql
CREATE TABLE callback_requests (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  service_type TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'pending',
  updated_at TIMESTAMP WITH TIME ZONE NULL,
  completed_at TIMESTAMP WITH TIME ZONE NULL,
  completed_by TEXT NULL
);

-- Enable RLS (Row Level Security)
ALTER TABLE callback_requests ENABLE ROW LEVEL SECURITY;

-- Create policy for service role access
CREATE POLICY "Enable all access for service role" ON callback_requests
FOR ALL USING (auth.role() = 'service_role');

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE callback_requests;
```

### 5. Telegram Bot Setup

1. Create a bot with [@BotFather](https://t.me/BotFather)
2. Get the bot token
3. Add the bot to your workers group
4. Get the group ID and topic ID (if using topics)

### 6. Start the Server

```bash
# Development mode
npm run dev

# Production mode
npm start
```

## API Documentation

### Base URL
```
http://localhost:3001
```

### Endpoints

#### Health Check
```http
GET /health
```

#### Create Callback Request
```http
POST /api/callbacks
Content-Type: application/json

{
  "name": "John Doe",
  "phone": "+1234567890",
  "service_type": "Refrigerator Repair"
}
```

#### Get All Callbacks
```http
GET /api/callbacks?page=1&limit=50&status=pending&sortBy=created_at&sortOrder=desc
```

#### Get Callback Statistics
```http
GET /api/callbacks/stats?timeRange=30d
```

#### Get Specific Callback
```http
GET /api/callbacks/:id
```

#### Update Callback Status
```http
PATCH /api/callbacks/:id
Content-Type: application/json

{
  "status": "completed",
  "completed_by": "John Worker"
}
```

#### Delete Callback
```http
DELETE /api/callbacks/:id
```

### Response Format

All API responses follow this format:

```json
{
  "success": true,
  "data": {...},
  "message": "Operation completed successfully",
  "pagination": {...} // Only for paginated endpoints
}
```

Error responses:

```json
{
  "success": false,
  "error": "Error description",
  "details": "Detailed error message (development only)",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Telegram Bot Features

### Notification Messages (Russian)

- 🔔 **New Callback**: Instant notification with client details
- ✅ **Completion**: Notification when callback is completed
- ℹ️ **System Messages**: Status updates and errors

### Interactive Buttons

- 📞 **Взять в работу** - Mark as in progress
- ✅ **Связались** - Mark as contacted
- ❌ **Отменить** - Cancel request
- ℹ️ **Подробнее** - Show details

### Status Translations

- `pending` → ⏳ Ожидает
- `in_progress` → 🔄 В работе
- `contacted` → 📞 Связались
- `completed` → ✅ Выполнено
- `cancelled` → ❌ Отменено

## Real-time Features

### Automatic Notifications

The system automatically sends Telegram notifications when:

- ✨ New callback request is created
- 🔄 Callback status changes to completed
- ❌ System errors occur

### Health Monitoring

- 🏥 Connection health checks every 30 seconds
- 🔄 Automatic reconnection on failures
- 📊 Status monitoring and logging

## Development

### Project Structure

```
backend/
├── src/
│   ├── config/
│   │   └── supabase.js          # Supabase configuration
│   │   └── telegramBot.js       # Telegram bot logic
│   │   └── realtimeService.js   # Real-time subscriptions
│   │   └── callbacks.js         # API routes
│   └── index.js                 # Main server file
├── .env.example                 # Environment template
├── package.json                 # Dependencies
└── README.md                    # This file
```

### Adding New Features

1. **New API Endpoint**: Add to `src/routes/`
2. **Database Operations**: Add to `src/services/callbackService.js`
3. **Telegram Features**: Modify `src/services/telegramBot.js`
4. **Real-time Events**: Update `src/services/realtimeService.js`

### Testing

```bash
# Test API endpoints
curl http://localhost:3001/health

# Test callback creation
curl -X POST http://localhost:3001/api/callbacks \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","phone":"+1234567890","service_type":"Test Service"}'
```

## Deployment

### Environment Variables for Production

```env
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://your-domain.com
```

### PM2 Deployment

```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start src/index.js --name "true-pros-backend"

# Monitor
pm2 monit

# Logs
pm2 logs true-pros-backend
```

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src ./src
EXPOSE 3001
CMD ["npm", "start"]
```

## Troubleshooting

### Common Issues

1. **Supabase Connection Failed**
   - Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
   - Verify database table exists
   - Check network connectivity

2. **Telegram Bot Not Working**
   - Verify TELEGRAM_BOT_TOKEN is correct
   - Check if bot is added to the group
   - Ensure group ID and topic ID are correct

3. **Real-time Not Working**
   - Check if realtime is enabled in Supabase
   - Verify table is added to publication
   - Check connection status in logs

### Logs

The server provides detailed logging:

- ✅ Success operations (green checkmarks)
- ❌ Errors (red X marks)
- ⚠️ Warnings (yellow warning signs)
- 📡 Real-time events
- 🤖 Telegram bot activities

### Health Check

Monitor service health:

```bash
curl http://localhost:3001/health
```

Returns server status, uptime, and environment information.

## License

ISC License - See package.json for details. 
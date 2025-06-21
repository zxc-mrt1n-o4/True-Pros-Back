# Realtime Error Handling System

## Overview
The enhanced realtime error handling system is designed to provide reliable operation while minimizing notification noise. It distinguishes between critical errors that require immediate attention and temporary issues that resolve automatically.

## Error Classification

### 🚨 **Critical Errors (Immediate Notification)**
These errors require manual intervention and are notified immediately:

1. **Database Connection Errors**
   - Error: `"unable to connect to the project database"`
   - Cause: Supabase project issues, realtime not enabled, or network problems
   - Action: Immediate notification + automatic retry

2. **Authentication/Permission Errors**
   - Errors: `"permission"`, `"unauthorized"`, `"forbidden"`
   - Cause: Service role key issues, RLS policy problems
   - Action: Immediate notification + automatic retry

### ⚠️ **Recoverable Errors (Delayed Notification)**
These errors are usually temporary and resolve automatically:

1. **Unknown Channel Errors**
   - Error: `"Unknown channel error"`
   - Cause: Temporary network issues, Supabase service hiccups
   - Action: Log warning, auto-retry, notify only after 3+ attempts

2. **Connection Timeouts**
   - Error: Connection timeout
   - Cause: Network latency, temporary connectivity issues
   - Action: Log warning, auto-retry, notify only after 2+ attempts

3. **Connection Closures**
   - Error: Connection closed
   - Cause: Normal network behavior, server restarts
   - Action: Log info, auto-reconnect, no notification

## Automatic Recovery Process

### **Step 1: Error Detection**
- All errors are logged with appropriate severity levels
- Error type is classified (critical vs recoverable)

### **Step 2: Notification Decision**
```javascript
// Critical errors - immediate notification
if (isCriticalError) {
  await sendErrorNotification(criticalMessage);
}

// Recoverable errors - delayed notification
if (isRecoverableError && connectionAttempts >= threshold) {
  await sendErrorNotification(warningMessage);
}
```

### **Step 3: Automatic Reconnection**
- Exponential backoff: 1s, 2s, 5s, 10s, 10s...
- Maximum 5 retry attempts
- Success logging when recovered

### **Step 4: Recovery Confirmation**
```
✅ Realtime connection recovered after 3 attempts
```

## Expected Behavior

### **Normal Operation**
```
💚 Health check: connected | Last activity: 45s
🆕 New callback request: [id]
✅ Notification sent for new callback: [id]
```

### **Temporary Issue (No Spam)**
```
⚠️ Temporary realtime error (will auto-recover): Unknown channel error
🔄 Scheduling reconnection attempt 1/5 in 1000ms...
🔄 Reconnection attempt 1/5
✅ Successfully subscribed to callback_requests changes
```

### **Repeated Issues (Notification Sent)**
```
⚠️ Temporary realtime error (will auto-recover): Unknown channel error
🔄 Scheduling reconnection attempt 3/5 in 5000ms...
📱 Telegram Notification: "⚠️ Realtime experiencing repeated connection issues (attempt 3)"
✅ Realtime connection recovered after 3 attempts
```

### **Critical Issue (Immediate Notification)**
```
❌ Realtime channel error: unable to connect to the project database
🔍 Database connection error detected
📱 Telegram Notification: "🚨 CRITICAL: Supabase realtime cannot connect to database"
```

## Benefits

### **Reduced Notification Noise**
- ✅ No notifications for single temporary errors
- ✅ No notifications for normal connection closures
- ✅ Delayed notifications for repeated issues only

### **Maintained Reliability**
- ✅ All errors are still logged for debugging
- ✅ Automatic reconnection continues working
- ✅ Critical issues get immediate attention
- ✅ Recovery is confirmed and logged

### **Better Monitoring**
- ✅ Clear distinction between error types
- ✅ Connection attempt tracking
- ✅ Recovery success confirmation
- ✅ Health monitoring continues

## Monitoring Commands

```bash
# Check current status
curl https://your-railway-url.railway.app/api/realtime/status

# Manual reconnect if needed
curl -X POST https://your-railway-url.railway.app/api/realtime/reconnect

# Health check
curl https://your-railway-url.railway.app/health
```

This system ensures you only get notified when manual intervention might be needed, while maintaining full automatic recovery capabilities for temporary issues. 
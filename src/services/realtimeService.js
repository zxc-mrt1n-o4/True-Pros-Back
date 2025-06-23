import { supabase } from '../config/supabase.js';
import { notifyNewCallback, notifyCallbackCompleted } from './telegramBot.js';

let realtimeSubscription = null;
let reconnectAttempts = 0;
let isReconnecting = false; // Prevent multiple reconnection attempts
let isDatabaseError = false; // Track database connection issues
const maxReconnectAttempts = 5;

// Simple realtime initialization using modern Supabase v2 API
export const initializeRealtime = async () => {
  try {
    console.log('📡 Starting simple realtime subscription...');

    // Clean up existing subscription if it exists
    if (realtimeSubscription) {
      await disconnectRealtime();
    }

    // Reset reconnection flag when starting fresh
    isReconnecting = false;

    // If we have a database error, test connection first
    if (isDatabaseError) {
      console.log('🔍 Testing database connection before realtime...');
      try {
        const { data, error } = await supabase
          .from('callback_requests')
          .select('id')
          .limit(1);
        
        if (error) {
          console.error('❌ Database still unreachable:', error.message);
          scheduleReconnection();
          return null;
        } else {
          console.log('✅ Database connection restored');
          isDatabaseError = false;
        }
      } catch (testError) {
        console.error('❌ Database test failed:', testError.message);
        scheduleReconnection();
        return null;
      }
    }

    // Create simple subscription using modern channel API
    realtimeSubscription = supabase
      .channel('callback_requests')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'callback_requests'
        },
        (payload) => {
          console.log('🆕 New callback request received');
          reconnectAttempts = 0; // Reset on successful activity
          isDatabaseError = false; // Clear database error flag
          handleNewCallback(payload.new);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public', 
          table: 'callback_requests'
        },
        (payload) => {
          console.log('🔄 Callback request updated');
          reconnectAttempts = 0; // Reset on successful activity
          isDatabaseError = false; // Clear database error flag
          handleCallbackUpdate(payload.new, payload.old);
        }
      )
      .subscribe((status, err) => {
        console.log(`📡 Realtime status: ${status}`);
        
        if (status === 'SUBSCRIBED') {
          console.log('✅ Realtime subscription active');
          reconnectAttempts = 0;
          isReconnecting = false; // Clear reconnection flag on success
          isDatabaseError = false; // Clear database error flag
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Realtime channel error:', err);
          handleRealtimeError(err);
        } else if (status === 'TIMED_OUT') {
          console.error('⏰ Realtime connection timed out');
          scheduleReconnection();
        } else if (status === 'CLOSED') {
          console.warn('🔌 Realtime connection closed');
          // Only reconnect if we're not already reconnecting
          if (!isReconnecting) {
            scheduleReconnection();
          }
        }
      });

    console.log('✅ Simple realtime subscription created');
    return realtimeSubscription;

  } catch (error) {
    console.error('❌ Realtime error:', error.message);
    if (!isReconnecting) {
      scheduleReconnection();
    }
    return null;
  }
};

// Handle realtime errors
const handleRealtimeError = (error) => {
  const errorMessage = error?.message || JSON.stringify(error) || 'Unknown error';
  console.error('🔍 Realtime error details:', errorMessage);
  
  // Check for specific errors
  if (errorMessage.includes('unable to connect to the project database')) {
    console.error('🚨 Database connection error - critical issue');
    isDatabaseError = true;
    // For database errors, wait longer before retrying
    if (!isReconnecting) {
      scheduleReconnection(30000); // Wait 30 seconds for database issues
    }
  } else if (errorMessage.includes('permission') || errorMessage.includes('unauthorized')) {
    console.error('🚨 Permission error - check service role key');
    if (!isReconnecting) {
      scheduleReconnection(60000); // Wait 1 minute for permission issues
    }
  } else {
    console.warn('⚠️ Temporary realtime error - will retry');
    if (!isReconnecting) {
      scheduleReconnection();
    }
  }
};

// Schedule reconnection with backoff
const scheduleReconnection = (customDelay = null) => {
  // Prevent multiple simultaneous reconnection attempts
  if (isReconnecting) {
    console.log('🔄 Reconnection already in progress, skipping...');
    return;
  }

  if (reconnectAttempts >= maxReconnectAttempts) {
    console.error(`❌ Max reconnection attempts (${maxReconnectAttempts}) reached`);
    if (isDatabaseError) {
      console.error('🚨 Database appears to be permanently unreachable. Stopping reconnection attempts.');
      console.error('💡 Manual intervention required - check Supabase service status');
    }
    isReconnecting = false;
    return;
  }
  
  isReconnecting = true;
  reconnectAttempts++;
  
  // Use custom delay for specific errors, otherwise exponential backoff
  const delay = customDelay || Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
  
  console.log(`🔄 Scheduling reconnection attempt ${reconnectAttempts}/${maxReconnectAttempts} in ${delay}ms...`);
  
  setTimeout(async () => {
    console.log(`🔄 Reconnection attempt ${reconnectAttempts}/${maxReconnectAttempts}`);
    await initializeRealtime();
  }, delay);
};

// Handle new callback
const handleNewCallback = async (callbackData) => {
  try {
    console.log(`📞 Processing new callback: ${callbackData.name} - ${callbackData.service_type}`);
    await notifyNewCallback(callbackData);
  } catch (error) {
    console.error('❌ Error processing new callback:', error.message);
  }
};

// Handle callback updates
const handleCallbackUpdate = async (newRecord, oldRecord) => {
  try {
    // Check if status changed to completed
    if (oldRecord.status !== 'completed' && newRecord.status === 'completed') {
      console.log(`✅ Callback completed: ${newRecord.name}`);
      await notifyCallbackCompleted(newRecord);
    }
  } catch (error) {
    console.error('❌ Error processing callback update:', error.message);
  }
};

// Get current status
export const getRealtimeStatus = () => {
  if (!realtimeSubscription) return 'NOT_INITIALIZED';
  if (isDatabaseError) return 'DATABASE_ERROR';
  if (isReconnecting) return `RECONNECTING_${reconnectAttempts}`;
  return 'ACTIVE';
};

// Clean disconnect
export const disconnectRealtime = async () => {
  if (realtimeSubscription) {
    try {
      await supabase.removeChannel(realtimeSubscription);
      realtimeSubscription = null;
      console.log('🔌 Realtime disconnected');
    } catch (error) {
      console.warn('⚠️ Error disconnecting realtime:', error.message);
      realtimeSubscription = null; // Force cleanup
    }
  }
  
  // Reset flags
  isReconnecting = false;
  reconnectAttempts = 0;
  // Don't reset isDatabaseError here - keep it for next initialization
};
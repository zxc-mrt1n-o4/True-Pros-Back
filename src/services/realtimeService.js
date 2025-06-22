import { supabase } from '../config/supabase.js';
import { notifyNewCallback, notifyCallbackCompleted } from './telegramBot.js';

let realtimeSubscription = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

// Simple realtime initialization using modern Supabase v2 API
export const initializeRealtime = async () => {
  try {
    console.log('📡 Starting simple realtime subscription...');

    // Clean up existing subscription if it exists
    if (realtimeSubscription) {
      await disconnectRealtime();
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
          handleCallbackUpdate(payload.new, payload.old);
        }
      )
      .subscribe((status, err) => {
        console.log(`📡 Realtime status: ${status}`);
        
        if (status === 'SUBSCRIBED') {
          console.log('✅ Realtime subscription active');
          reconnectAttempts = 0;
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Realtime channel error:', err);
          handleRealtimeError(err);
        } else if (status === 'TIMED_OUT') {
          console.error('⏰ Realtime connection timed out');
          scheduleReconnection();
        } else if (status === 'CLOSED') {
          console.warn('🔌 Realtime connection closed');
          scheduleReconnection();
        }
      });

    console.log('✅ Simple realtime subscription created');
    return realtimeSubscription;

  } catch (error) {
    console.error('❌ Realtime error:', error.message);
    scheduleReconnection();
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
  } else if (errorMessage.includes('permission') || errorMessage.includes('unauthorized')) {
    console.error('🚨 Permission error - check service role key');
  } else {
    console.warn('⚠️ Temporary realtime error - will retry');
  }
  
  scheduleReconnection();
};

// Schedule reconnection with backoff
const scheduleReconnection = () => {
  if (reconnectAttempts >= maxReconnectAttempts) {
    console.error(`❌ Max reconnection attempts (${maxReconnectAttempts}) reached`);
    return;
  }
  
  reconnectAttempts++;
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000); // Max 30 seconds
  
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
  if (reconnectAttempts > 0) return `RECONNECTING_${reconnectAttempts}`;
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
};
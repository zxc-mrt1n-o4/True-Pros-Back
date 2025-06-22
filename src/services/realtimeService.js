import { supabase } from '../config/supabase.js';
import { notifyNewCallback, notifyCallbackCompleted } from './telegramBot.js';

let realtimeSubscription = null;

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
          handleCallbackUpdate(payload.new, payload.old);
        }
      )
      .subscribe((status) => {
        console.log(`📡 Realtime status: ${status}`);
      });

    console.log('✅ Simple realtime subscription created');
    return realtimeSubscription;

  } catch (error) {
    console.error('❌ Realtime error:', error.message);
    return null;
  }
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
  return 'ACTIVE';
};

// Clean disconnect
export const disconnectRealtime = async () => {
  if (realtimeSubscription) {
    await supabase.removeChannel(realtimeSubscription);
    realtimeSubscription = null;
    console.log('🔌 Realtime disconnected');
  }
};
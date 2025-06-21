import { supabase } from '../config/supabase.js';
import { notifyNewCallback, notifyCallbackCompleted, sendErrorNotification } from './telegramBot.js';

let realtimeSubscription = null;
let lastActivity = null;

// Initialize realtime subscription using Supabase's built-in reconnection
export const initializeRealtime = () => {
  try {
    console.log('📡 Initializing Supabase realtime subscription...');
    
    // Unsubscribe existing subscription if any
    if (realtimeSubscription) {
      console.log('🔌 Unsubscribing existing subscription...');
      realtimeSubscription.unsubscribe();
      realtimeSubscription = null;
    }
    
    // Create subscription using the correct Supabase v2 pattern
    realtimeSubscription = supabase
      .channel('callback_requests_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'callback_requests'
        },
        (payload) => {
          console.log('🆕 New callback request:', payload.new);
          lastActivity = new Date();
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
          console.log('🔄 Updated callback request:', payload.new);
          lastActivity = new Date();
          handleCallbackUpdate(payload.new, payload.old);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'callback_requests'
        },
        (payload) => {
          console.log('🗑️ Deleted callback request:', payload.old);
          lastActivity = new Date();
          handleCallbackDelete(payload.old);
        }
      )
      .subscribe((status, err) => {
        console.log(`📡 Realtime subscription status: ${status}`);
        
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to callback_requests changes');
          lastActivity = new Date();
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Realtime channel error:', err);
          sendErrorNotification(`Realtime channel error: ${err?.message || err}`).catch(console.error);
        } else if (status === 'TIMED_OUT') {
          console.error('⏰ Realtime connection timed out');
        } else if (status === 'CLOSED') {
          console.warn('🔌 Realtime connection closed');
        }
      });

    console.log('✅ Realtime subscription initialized (Supabase handles reconnection automatically)');
    return realtimeSubscription;
  } catch (error) {
    console.error('❌ Error initializing realtime:', error);
    sendErrorNotification(`Critical realtime error: ${error.message}`).catch(console.error);
    return null;
  }
};

// Handle new callback creation
const handleNewCallback = async (callbackData) => {
  try {
    console.log('🆕 New callback created:', callbackData.id);
    
    // Send notification to Telegram
    await notifyNewCallback(callbackData);
    
    // Log the event
    console.log(`✅ Notification sent for new callback: ${callbackData.id}`);
  } catch (error) {
    console.error('❌ Error handling new callback:', error);
    await sendErrorNotification(`Failed to notify new callback ${callbackData.id}: ${error.message}`);
  }
};

// Handle callback updates
const handleCallbackUpdate = async (newRecord, oldRecord) => {
  try {
    console.log('🔄 Callback updated:', newRecord.id);
    
    // Check if status changed to completed
    if (oldRecord?.status !== 'completed' && newRecord.status === 'completed') {
      console.log('✅ Callback completed:', newRecord.id);
      await notifyCallbackCompleted(newRecord);
    }
    
    // Log other significant status changes
    if (oldRecord?.status !== newRecord.status) {
      console.log(`📊 Status changed for ${newRecord.id}: ${oldRecord?.status || 'undefined'} → ${newRecord.status}`);
    }
  } catch (error) {
    console.error('❌ Error handling callback update:', error);
    await sendErrorNotification(`Failed to handle callback update ${newRecord.id}: ${error.message}`);
  }
};

// Handle callback deletion
const handleCallbackDelete = async (deletedRecord) => {
  try {
    console.log('🗑️ Callback deleted:', deletedRecord.id);
    
    // Optional: notify about deletions if needed
    // await sendSystemNotification(`Заявка ${deletedRecord.id} была удалена`);
  } catch (error) {
    console.error('❌ Error handling callback deletion:', error);
  }
};

// Get realtime connection status
export const getRealtimeStatus = () => {
  const now = new Date();
  const timeSinceActivity = lastActivity ? now - lastActivity : null;
  
  return {
    status: realtimeSubscription ? 'connected' : 'disconnected',
    subscription: realtimeSubscription ? 'active' : 'none',
    lastActivity: lastActivity ? lastActivity.toISOString() : null,
    timeSinceActivity: timeSinceActivity ? `${Math.round(timeSinceActivity / 1000)}s` : null,
    isHealthy: realtimeSubscription ? true : false,
    note: 'Supabase JS handles reconnection automatically'
  };
};

// Disconnect realtime
export const disconnectRealtime = async () => {
  try {
    if (realtimeSubscription) {
      await supabase.removeChannel(realtimeSubscription);
      realtimeSubscription = null;
      console.log('📡 Realtime subscription disconnected');
    }
    
    lastActivity = null;
  } catch (error) {
    console.error('❌ Error disconnecting realtime:', error);
  }
};

// Manual reconnect
export const reconnectRealtime = async () => {
  try {
    console.log('🔄 Manual reconnection requested...');
    
    await disconnectRealtime();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return initializeRealtime();
  } catch (error) {
    console.error('❌ Error in manual reconnection:', error);
    return null;
  }
};

// Simple health monitoring (optional - Supabase handles reconnection)
export const startRealtimeHealthMonitor = () => {
  console.log('🏥 Realtime health monitor started (minimal - Supabase handles reconnection)');
  
  // Optional: Simple status logging every 10 minutes
  setInterval(() => {
    const status = getRealtimeStatus();
    console.log(`💚 Realtime status: ${status.status} (${status.note})`);
  }, 600000); // 10 minutes
};

// Test realtime connection
export const testRealtimeConnection = async () => {
  try {
    console.log('🧪 Testing realtime connection...');
    
    const status = getRealtimeStatus();
    console.log('📊 Current status:', status);
    
    if (status.status === 'disconnected') {
      console.log('❌ Realtime is disconnected');
      return false;
    }
    
    if (realtimeSubscription) {
      console.log('✅ Realtime connection appears healthy');
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('❌ Error testing realtime connection:', error);
    return false;
  }
}; 
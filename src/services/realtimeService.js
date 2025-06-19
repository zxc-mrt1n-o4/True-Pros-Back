import { supabase } from '../config/supabase.js';
import { notifyNewCallback, notifyCallbackCompleted, sendErrorNotification } from './telegramBot.js';

let realtimeSubscription = null;

// Initialize realtime subscription using new Supabase JS implementation
export const initializeRealtime = () => {
  try {
    console.log('📡 Initializing Supabase realtime subscription...');
    
    // Subscribe to changes in the callback_requests table
    realtimeSubscription = supabase
      .from('callback_requests')
      .on('INSERT', (payload) => {
        console.log('🆕 New callback request:', payload.new);
        handleNewCallback(payload.new);
      })
      .on('UPDATE', (payload) => {
        console.log('🔄 Updated callback request:', payload.new);
        handleCallbackUpdate(payload.new, payload.old);
      })
      .on('DELETE', (payload) => {
        console.log('🗑️ Deleted callback request:', payload.old);
        handleCallbackDelete(payload.old);
      })
      .subscribe();

    console.log('✅ Successfully subscribed to callback_requests changes');
    return realtimeSubscription;
  } catch (error) {
    console.error('❌ Error initializing realtime:', error);
    sendErrorNotification(`Critical realtime error: ${error.message}`);
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
  if (!realtimeSubscription) {
    return { status: 'disconnected', subscription: null };
  }
  
  return {
    status: 'subscribed',
    subscription: realtimeSubscription
  };
};

// Disconnect realtime
export const disconnectRealtime = async () => {
  try {
    if (realtimeSubscription) {
      await supabase.removeSubscription(realtimeSubscription);
      realtimeSubscription = null;
      console.log('📡 Realtime subscription disconnected');
    }
  } catch (error) {
    console.error('❌ Error disconnecting realtime:', error);
  }
};

// Manual reconnect
export const reconnectRealtime = async () => {
  try {
    console.log('🔄 Manual reconnection requested...');
    await disconnectRealtime();
    await new Promise(resolve => setTimeout(resolve, 2000));
    return initializeRealtime();
  } catch (error) {
    console.error('❌ Error in manual reconnection:', error);
    return null;
  }
};

// Simplified health monitoring
export const startRealtimeHealthMonitor = () => {
  console.log('🏥 Realtime health monitor started (Supabase JS auto-reconnection enabled)');
  
  // Minimal monitoring - check every 10 minutes
  const checkInterval = 600000; // 10 minutes
  
  setInterval(() => {
    const status = getRealtimeStatus();
    if (status.status === 'disconnected') {
      console.log('⚠️ Realtime subscription disconnected, attempting reconnection...');
      reconnectRealtime();
    }
  }, checkInterval);
}; 
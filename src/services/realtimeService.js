import { supabase } from '../config/supabase.js';
import { notifyNewCallback, notifyCallbackCompleted, sendErrorNotification } from './telegramBot.js';

let realtimeChannel = null;

// Initialize realtime subscription with minimal logging
export const initializeRealtime = () => {
  try {
    // Create a clean subscription - let Supabase handle all connection management
    realtimeChannel = supabase
      .channel('callback_requests_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'callback_requests'
        },
        handleRealtimeEvent
      )
      .subscribe((status) => {
        // Only log when successfully connected - ignore all reconnection states
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to callback_requests changes');
        }
        // Supabase automatically handles: CHANNEL_ERROR, TIMED_OUT, CLOSED states
        // No manual intervention needed - this prevents reconnection spam
      });

    return realtimeChannel;
  } catch (error) {
    console.error('❌ Error initializing realtime:', error);
    // Only notify for critical startup failures, not connection issues
    if (!error.message?.includes('WebSocket') && !error.message?.includes('connection') && !error.message?.includes('timeout')) {
      sendErrorNotification(`Critical realtime error: ${error.message}`);
    }
    return null;
  }
};

// Handle realtime events
const handleRealtimeEvent = async (payload) => {
  try {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    
    console.log('📡 Realtime event received:', {
      eventType,
      recordId: newRecord?.id || oldRecord?.id
    });

    switch (eventType) {
      case 'INSERT':
        await handleNewCallback(newRecord);
        break;
        
      case 'UPDATE':
        await handleCallbackUpdate(newRecord, oldRecord);
        break;
        
      case 'DELETE':
        await handleCallbackDelete(oldRecord);
        break;
        
      default:
        console.log('🔄 Unknown realtime event type:', eventType);
    }
  } catch (error) {
    console.error('❌ Error handling realtime event:', error);
    await sendErrorNotification(`Realtime event handling error: ${error.message}`);
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
    if (oldRecord.status !== 'completed' && newRecord.status === 'completed') {
      console.log('✅ Callback completed:', newRecord.id);
      await notifyCallbackCompleted(newRecord);
    }
    
    // Log other significant status changes
    if (oldRecord.status !== newRecord.status) {
      console.log(`📊 Status changed for ${newRecord.id}: ${oldRecord.status} → ${newRecord.status}`);
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
    
    // You might want to notify about deletions if needed
    // await sendSystemNotification(`Заявка ${deletedRecord.id} была удалена`);
  } catch (error) {
    console.error('❌ Error handling callback deletion:', error);
  }
};

// Get realtime connection status
export const getRealtimeStatus = () => {
  if (!realtimeChannel) {
    return { status: 'disconnected', channel: null };
  }
  
  return {
    status: realtimeChannel.state,
    channel: realtimeChannel.topic,
    joinRef: realtimeChannel.joinRef
  };
};

// Disconnect realtime
export const disconnectRealtime = async () => {
  try {
    if (realtimeChannel) {
      await supabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
      console.log('📡 Realtime subscription disconnected');
    }
  } catch (error) {
    console.error('❌ Error disconnecting realtime:', error);
  }
};

// Manual reconnect (rarely used - Supabase handles this automatically)
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

// Minimal health monitoring - trust Supabase's built-in reconnection
export const startRealtimeHealthMonitor = () => {
  console.log('🏥 Realtime health monitor started (automatic reconnection enabled)');
  
  // Very minimal monitoring - only check for actual errors every 10 minutes
  // This matches the pattern of your previous bot with no reconnection spam
  const checkInterval = 600000; // 10 minutes
  
  setInterval(() => {
    const status = getRealtimeStatus();
    // Only log genuine errors, not normal connection states
    if (status.status === 'errored') {
      console.log('⚠️ Realtime connection error detected, Supabase will auto-recover');
    }
  }, checkInterval);
}; 
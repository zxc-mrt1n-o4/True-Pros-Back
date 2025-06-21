import { supabase } from '../config/supabase.js';
import { testRealtimeCapabilities } from '../config/supabase.js';
import { notifyNewCallback, notifyCallbackCompleted, sendErrorNotification } from './telegramBot.js';

let realtimeSubscription = null;
let lastActivity = null;
let connectionAttempts = 0;
let maxRetries = 5;
let retryTimeout = null;
let healthCheckInterval = null;
let isInitializing = false;

// Initialize realtime subscription with enhanced error handling
export const initializeRealtime = async () => {
  if (isInitializing) {
    console.log('⏳ Realtime initialization already in progress...');
    return null;
  }

  isInitializing = true;
  
  try {
    console.log('📡 Initializing Supabase realtime subscription...');
    
    // First test if realtime is available
    console.log('🧪 Testing realtime capabilities...');
    const realtimeAvailable = await testRealtimeCapabilities();
    
    if (!realtimeAvailable) {
      console.error('❌ Realtime capabilities test failed - aborting initialization');
      await sendErrorNotification('❌ Supabase realtime is not available. Please check Supabase project settings.');
      isInitializing = false;
      return null;
    }
    
    // Unsubscribe existing subscription if any
    if (realtimeSubscription) {
      console.log('🔌 Unsubscribing existing subscription...');
      try {
        await supabase.removeChannel(realtimeSubscription);
      } catch (error) {
        console.warn('⚠️ Warning unsubscribing existing channel:', error.message);
      }
      realtimeSubscription = null;
    }
    
    // Create subscription with enhanced error handling
    realtimeSubscription = supabase
      .channel('callback_requests_changes', {
        config: {
          broadcast: { self: false },
          presence: { key: 'backend-service' }
        }
      })
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
          connectionAttempts = 0; // Reset on successful activity
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
          connectionAttempts = 0; // Reset on successful activity
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
          connectionAttempts = 0; // Reset on successful activity
          handleCallbackDelete(payload.old);
        }
      )
      .subscribe(async (status, err) => {
        console.log(`📡 Realtime subscription status: ${status}`);
        
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to callback_requests changes');
          lastActivity = new Date();
          connectionAttempts = 0;
          isInitializing = false;
          
          // Start health monitoring
          startHealthMonitoring();
          
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Realtime channel error:', err);
          isInitializing = false;
          
          const errorMessage = err?.message || JSON.stringify(err) || 'Unknown channel error';
          
          // Check for specific database connection errors (critical)
          if (errorMessage.includes('unable to connect to the project database')) {
            console.error('🔍 Database connection error detected');
            await sendErrorNotification(`🚨 CRITICAL: Supabase realtime cannot connect to database. Error: ${errorMessage}`);
            scheduleReconnection();
          } 
          // Check for authentication/permission errors (critical)
          else if (errorMessage.includes('permission') || errorMessage.includes('unauthorized') || errorMessage.includes('forbidden')) {
            console.error('🔍 Authentication/permission error detected');
            await sendErrorNotification(`🚨 CRITICAL: Realtime permission error: ${errorMessage}`);
            scheduleReconnection();
          }
          // All other errors are likely temporary - log but don't spam notifications
          else {
            console.warn(`⚠️ Temporary realtime error (will auto-recover): ${errorMessage}`);
            
            // Only notify if this is a repeated failure (3+ attempts)
            if (connectionAttempts >= 2) {
              await sendErrorNotification(`⚠️ Realtime experiencing repeated connection issues (attempt ${connectionAttempts + 1}): ${errorMessage}`);
            }
            
            scheduleReconnection();
          }
          
        } else if (status === 'TIMED_OUT') {
          console.error('⏰ Realtime connection timed out');
          isInitializing = false;
          
          // Only notify for timeouts if it's a repeated issue
          if (connectionAttempts >= 1) {
            await sendErrorNotification(`⏰ Realtime connection timeout (attempt ${connectionAttempts + 1})`);
          }
          
          scheduleReconnection();
          
        } else if (status === 'CLOSED') {
          console.warn('🔌 Realtime connection closed (will auto-reconnect)');
          isInitializing = false;
          
          // Don't notify for normal connection closures - they're expected
          scheduleReconnection();
          
        } else {
          console.log(`ℹ️ Realtime status: ${status}`);
          if (status !== 'JOINING') {
            isInitializing = false;
          }
        }
      });

    console.log('✅ Realtime subscription initialized');
    return realtimeSubscription;
    
  } catch (error) {
    console.error('❌ Error initializing realtime:', error);
    isInitializing = false;
    await sendErrorNotification(`Critical realtime initialization error: ${error.message}`);
    scheduleReconnection();
    return null;
  }
};

// Schedule reconnection with exponential backoff
const scheduleReconnection = () => {
  if (retryTimeout) {
    clearTimeout(retryTimeout);
  }
  
  if (connectionAttempts >= maxRetries) {
    console.error(`❌ Max retry attempts (${maxRetries}) reached. Stopping reconnection attempts.`);
    sendErrorNotification(`🚨 CRITICAL: Realtime connection failed after ${maxRetries} attempts. Manual intervention required.`);
    return;
  }
  
  connectionAttempts++;
  const delay = Math.min(1000 * Math.pow(2, connectionAttempts), 30000); // Max 30 seconds
  
  console.log(`🔄 Scheduling reconnection attempt ${connectionAttempts}/${maxRetries} in ${delay}ms...`);
  
  retryTimeout = setTimeout(async () => {
    console.log(`🔄 Reconnection attempt ${connectionAttempts}/${maxRetries}`);
    const result = await initializeRealtime();
    
    // If reconnection was successful, log recovery
    if (result && connectionAttempts > 1) {
      console.log(`✅ Realtime connection recovered after ${connectionAttempts} attempts`);
    }
  }, delay);
};

// Enhanced health monitoring
const startHealthMonitoring = () => {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }
  
  console.log('🏥 Starting enhanced realtime health monitoring...');
  
  healthCheckInterval = setInterval(async () => {
    const status = getRealtimeStatus();
    const now = new Date();
    const timeSinceActivity = lastActivity ? now - lastActivity : null;
    
    console.log(`💚 Health check: ${status.status} | Last activity: ${status.timeSinceActivity || 'never'}`);
    
    // If no activity for more than 15 minutes and we should be connected
    if (timeSinceActivity && timeSinceActivity > 900000 && status.status === 'connected') {
      console.warn('⚠️ No realtime activity for 15+ minutes, testing connection...');
      
      const isHealthy = await testRealtimeConnection();
      if (!isHealthy) {
        console.warn('🔄 Health check failed, initiating reconnection...');
        await reconnectRealtime();
      }
    }
  }, 300000); // 5 minutes
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
    connectionAttempts: connectionAttempts,
    maxRetries: maxRetries,
    isHealthy: realtimeSubscription && connectionAttempts === 0,
    isInitializing: isInitializing
  };
};

// Disconnect realtime
export const disconnectRealtime = async () => {
  try {
    // Clear timeouts and intervals
    if (retryTimeout) {
      clearTimeout(retryTimeout);
      retryTimeout = null;
    }
    
    if (healthCheckInterval) {
      clearInterval(healthCheckInterval);
      healthCheckInterval = null;
    }
    
    if (realtimeSubscription) {
      await supabase.removeChannel(realtimeSubscription);
      realtimeSubscription = null;
      console.log('📡 Realtime subscription disconnected');
    }
    
    lastActivity = null;
    connectionAttempts = 0;
    isInitializing = false;
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
    
    return await initializeRealtime();
  } catch (error) {
    console.error('❌ Error in manual reconnection:', error);
    return null;
  }
};

// Legacy health monitor for backward compatibility
export const startRealtimeHealthMonitor = () => {
  console.log('🏥 Legacy health monitor called - using enhanced monitoring instead');
  // Enhanced monitoring is started automatically when connection is established
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
    
    // Test with a temporary channel
    return await testRealtimeCapabilities();
    
  } catch (error) {
    console.error('❌ Error testing realtime connection:', error);
    return false;
  }
}; 
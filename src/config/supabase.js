import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase configuration. Please check your environment variables.');
}

// Create Supabase client with service role key for backend operations
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  realtime: {
    params: {
      eventsPerSecond: 2
    },
    heartbeatIntervalMs: 30000,
    reconnectAfterMs: function (tries) {
      return [1000, 2000, 5000, 10000][tries - 1] || 10000;
    },
    timeout: 20000
  },
  global: {
    headers: {
      'User-Agent': 'true-pros-backend/1.0.0'
    }
  }
});

// Test connection
export const testSupabaseConnection = async () => {
  try {
    console.log('🔍 Testing Supabase connection...');
    const { data, error } = await supabase
      .from('callback_requests')
      .select('count')
      .limit(1);
    
    if (error) {
      console.error('❌ Supabase connection failed:', error.message);
      return false;
    }
    
    console.log('✅ Supabase connection successful');
    return true;
  } catch (error) {
    console.error('❌ Supabase connection error:', error.message);
    return false;
  }
};

// Test realtime capabilities specifically
export const testRealtimeCapabilities = async () => {
  try {
    console.log('🔍 Testing Supabase realtime capabilities...');
    
    // Check if realtime is enabled in Supabase project
    const testChannel = supabase.channel('test-connection-' + Date.now());
    
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        testChannel.unsubscribe();
        console.log('⚠️ Realtime test timed out');
        resolve(false);
      }, 10000);
      
      testChannel.subscribe((status, err) => {
        clearTimeout(timeout);
        
        if (status === 'SUBSCRIBED') {
          console.log('✅ Realtime capabilities confirmed');
          testChannel.unsubscribe();
          resolve(true);
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Realtime test failed:', err);
          testChannel.unsubscribe();
          resolve(false);
        }
      });
    });
  } catch (error) {
    console.error('❌ Realtime capabilities test error:', error.message);
    return false;
  }
}; 
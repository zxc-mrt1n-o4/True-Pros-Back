#!/usr/bin/env node

/**
 * Supabase Realtime Connection Test
 * Run this script to diagnose realtime connection issues
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing environment variables:');
  console.error('   SUPABASE_URL:', SUPABASE_URL ? '✅' : '❌');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_KEY ? '✅' : '❌');
  process.exit(1);
}

console.log('🧪 Supabase Realtime Diagnostic Test');
console.log('=====================================');
console.log(`📍 URL: ${SUPABASE_URL}`);
console.log(`🔑 Service Key: ${SUPABASE_SERVICE_KEY.substring(0, 20)}...`);
console.log('');

// Create Supabase client with simplified realtime configuration
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
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
  }
});

async function runTests() {
  console.log('🔍 Step 1: Testing basic Supabase connection...');
  
  try {
    const { data, error } = await supabase
      .from('callback_requests')
      .select('count')
      .limit(1);
    
    if (error) {
      console.error('❌ Basic connection failed:', error.message);
      return false;
    }
    
    console.log('✅ Basic Supabase connection successful');
  } catch (error) {
    console.error('❌ Basic connection error:', error.message);
    return false;
  }
  
  console.log('');
  console.log('🔍 Step 2: Testing realtime capabilities...');
  
  return new Promise((resolve) => {
    const testChannel = supabase.channel('diagnostic-test-' + Date.now());
    let resolved = false;
    
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.error('❌ Realtime test timed out (10 seconds)');
        testChannel.unsubscribe();
        resolve(false);
      }
    }, 10000);
    
    testChannel.subscribe((status, err) => {
      if (resolved) return;
      
      console.log(`📡 Realtime status: ${status}`);
      
      if (status === 'SUBSCRIBED') {
        resolved = true;
        clearTimeout(timeout);
        console.log('✅ Realtime capabilities confirmed');
        testChannel.unsubscribe();
        resolve(true);
      } else if (status === 'CHANNEL_ERROR') {
        resolved = true;
        clearTimeout(timeout);
        console.error('❌ Realtime test failed:', err);
        console.error('   Error details:', JSON.stringify(err, null, 2));
        
        // Check for specific error types
        if (err && typeof err === 'object') {
          const errorMessage = err.message || JSON.stringify(err);
          
          if (errorMessage.includes('unable to connect to the project database')) {
            console.error('');
            console.error('🔍 DIAGNOSIS: Database connection error');
            console.error('   Possible causes:');
            console.error('   1. Realtime not enabled for callback_requests table');
            console.error('   2. Row Level Security blocking service role');
            console.error('   3. Supabase project is paused/sleeping');
            console.error('   4. Network connectivity issues');
            console.error('');
            console.error('📋 RECOMMENDED ACTIONS:');
            console.error('   1. Enable realtime in Supabase Dashboard → Database → Replication');
            console.error('   2. Configure RLS policies for service role');
            console.error('   3. Check Supabase project status');
          }
        }
        
        testChannel.unsubscribe();
        resolve(false);
      }
    });
  });
}

async function testTableAccess() {
  console.log('');
  console.log('🔍 Step 3: Testing table access permissions...');
  
  try {
    // Test read access
    const { data: readData, error: readError } = await supabase
      .from('callback_requests')
      .select('id, status, created_at')
      .limit(5);
    
    if (readError) {
      console.error('❌ Table read access failed:', readError.message);
      return false;
    }
    
    console.log(`✅ Table read access successful (${readData.length} records)`);
    
    // Test write access (without actually inserting)
    const { error: insertError } = await supabase
      .from('callback_requests')
      .insert({
        name: 'TEST_DIAGNOSTIC',
        phone: '+1234567890',
        service_type: 'diagnostic',
        problem_description: 'Diagnostic test - should not be inserted'
      })
      .select()
      .limit(0); // This prevents actual insertion but tests permissions
    
    if (insertError && !insertError.message.includes('new row violates') && !insertError.message.includes('null value in column "id"')) {
      console.error('❌ Table write access test failed:', insertError.message);
      return false;
    }
    
    console.log('✅ Table write access permissions confirmed');
    return true;
    
  } catch (error) {
    console.error('❌ Table access test error:', error.message);
    return false;
  }
}

async function testRealtimeSubscription() {
  console.log('');
  console.log('🔍 Step 4: Testing actual realtime subscription...');
  
  return new Promise((resolve) => {
    const testChannel = supabase
      .channel('callback_requests_test')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'callback_requests'
        },
        (payload) => {
          console.log('📨 Received realtime event:', payload.eventType);
        }
      );
    
    let resolved = false;
    
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.error('❌ Realtime subscription test timed out');
        testChannel.unsubscribe();
        resolve(false);
      }
    }, 15000);
    
    testChannel.subscribe((status, err) => {
      if (resolved) return;
      
      console.log(`📡 Subscription status: ${status}`);
      
      if (status === 'SUBSCRIBED') {
        resolved = true;
        clearTimeout(timeout);
        console.log('✅ Realtime subscription successful');
        testChannel.unsubscribe();
        resolve(true);
      } else if (status === 'CHANNEL_ERROR') {
        resolved = true;
        clearTimeout(timeout);
        console.error('❌ Realtime subscription failed:', err);
        testChannel.unsubscribe();
        resolve(false);
      }
    });
  });
}

async function main() {
  const basicConnection = await runTests();
  
  if (basicConnection) {
    const tableAccess = await testTableAccess();
    
    if (tableAccess) {
      const realtimeSubscription = await testRealtimeSubscription();
      
      if (realtimeSubscription) {
        console.log('');
        console.log('🎉 All tests passed! Realtime should work in production.');
        console.log('');
        console.log('📋 NEXT STEPS:');
        console.log('   1. Deploy your updated backend code to Railway');
        console.log('   2. Set environment variables in Railway dashboard');
        console.log('   3. Monitor logs for successful realtime connection');
        console.log('   4. Test with actual callback creation');
      } else {
        console.log('');
        console.log('❌ Realtime subscription test failed');
        console.log('   This indicates the same issue will occur in production');
      }
    }
  } else {
    console.log('');
    console.log('❌ Diagnostic tests failed');
    console.log('');
    console.log('📋 TROUBLESHOOTING:');
    console.log('   1. Check RAILWAY_DEPLOYMENT_FIX.md for detailed instructions');
    console.log('   2. Verify Supabase project settings');
    console.log('   3. Enable realtime for callback_requests table');
    console.log('   4. Configure Row Level Security policies');
  }
  
  process.exit(basicConnection ? 0 : 1);
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Test interrupted');
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Test terminated');
  process.exit(1);
});

// Run the diagnostic
main().catch((error) => {
  console.error('❌ Diagnostic script error:', error);
  process.exit(1);
}); 
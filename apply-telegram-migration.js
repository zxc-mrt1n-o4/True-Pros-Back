import { supabase } from './src/config/supabase.js';

const applyTelegramMigration = async () => {
  try {
    console.log('🔄 Applying Telegram message tracking migration...');
    
    // Check if columns already exist by trying to select them
    console.log('🔍 Checking if telegram fields already exist...');
    
    const { data: testData, error: testError } = await supabase
      .from('callback_requests')
      .select('id, telegram_message_id, telegram_chat_id')
      .limit(1);
    
    if (!testError) {
      console.log('✅ Telegram fields already exist in the database');
      console.log('📊 Test query successful:', testData ? `Found ${testData.length} records` : 'No records found');
      return;
    }
    
    if (testError.code === 'PGRST116' || testError.message.includes('column') || testError.message.includes('does not exist')) {
      console.log('📝 Telegram fields do not exist, need to add them manually via Supabase dashboard');
      console.log('');
      console.log('🛠️  MANUAL MIGRATION REQUIRED:');
      console.log('   1. Go to Supabase Dashboard > Table Editor');
      console.log('   2. Select "callback_requests" table');
      console.log('   3. Add these columns:');
      console.log('      - telegram_message_id (type: int4, nullable: true)');
      console.log('      - telegram_chat_id (type: int8, nullable: true)');
      console.log('');
      console.log('📋 SQL to run in SQL Editor:');
      console.log('ALTER TABLE callback_requests ADD COLUMN telegram_message_id INTEGER;');
      console.log('ALTER TABLE callback_requests ADD COLUMN telegram_chat_id BIGINT;');
      console.log('CREATE INDEX idx_callback_requests_telegram_message ON callback_requests(telegram_message_id, telegram_chat_id);');
      console.log('');
      console.log('⚠️  The application will work without these fields, but group message updates may not persist across restarts.');
      return;
    }
    
    // If it's a different error, log it
    console.error('❌ Unexpected error checking fields:', testError);
    
  } catch (error) {
    console.error('❌ Migration check failed:', error.message);
    console.log('');
    console.log('🛠️  MANUAL MIGRATION REQUIRED:');
    console.log('   Please add telegram_message_id and telegram_chat_id columns manually via Supabase dashboard');
  }
};

// Run migration check
applyTelegramMigration().then(() => {
  console.log('🎉 Migration check completed!');
  process.exit(0);
}).catch(error => {
  console.error('💥 Migration check failed:', error);
  process.exit(1);
}); 
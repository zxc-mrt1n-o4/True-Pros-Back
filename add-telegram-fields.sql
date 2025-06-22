-- Add telegram message tracking fields to callback_requests table
-- This allows us to store and retrieve group message IDs for editing

ALTER TABLE callback_requests 
ADD COLUMN IF NOT EXISTS telegram_message_id INTEGER,
ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_callback_requests_telegram_message 
ON callback_requests(telegram_message_id, telegram_chat_id);

-- Add comment for documentation
COMMENT ON COLUMN callback_requests.telegram_message_id IS 'Telegram message ID for group notifications';
COMMENT ON COLUMN callback_requests.telegram_chat_id IS 'Telegram chat ID where the message was sent';

-- Show current table structure
\d callback_requests; 
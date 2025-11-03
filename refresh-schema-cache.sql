-- Refresh Supabase PostgREST schema cache
-- Run this if you're getting PGRST204 errors after adding a new column

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

-- Verify the column exists and is accessible
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'callback_requests' 
AND column_name = 'fromwhichutm';

-- If the column shows up above, but you still get errors, try:
-- 1. Restart your Supabase project (in Supabase dashboard)
-- 2. Or wait a few minutes for cache to refresh automatically


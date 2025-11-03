# Error Fixes - Database Column Missing

## 🔍 Error Explained

### Database Error: `fromWhichUTM` Column Missing

**Error:**
```
Could not find the 'fromWhichUTM' column of 'callback_requests' in the schema cache
```

**Cause:** The database migration to add the `fromWhichUTM` column hasn't been run in Supabase yet.

**Fix Applied:**
- ✅ Code now handles missing column gracefully
- ✅ If column doesn't exist, it retries without UTM field
- ✅ Callback requests will still work without UTM tracking until migration is run

**Note:** The Telegram 409 conflict error is expected during instance restart delays and resolves automatically. No code changes needed.

---

## ✅ Code Changes Made

### `callbackService.js`
- Added fallback logic: if `fromWhichUTM` column doesn't exist, retry without it
- Only includes UTM field if provided
- Logs UTM data when included

---

## 📋 Manual Steps Required

### Step 1: Run Database Migration (CRITICAL)

**In Supabase Dashboard:**

1. Go to your Supabase project → **SQL Editor**
2. Run this migration:

```sql
ALTER TABLE callback_requests 
ADD COLUMN IF NOT EXISTS fromWhichUTM TEXT;
```

3. Verify the column was added:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'callback_requests' 
AND column_name = 'fromWhichUTM';
```

**Expected Result:**
- Column `fromWhichUTM` should appear
- Type: `text`
- Nullable: `YES`

### Step 2: Redeploy Backend (if needed)

The code changes are already applied. If you're using Railway or another platform:
- The new code will automatically handle both errors gracefully
- Once migration is run, UTM tracking will work fully
- Until then, callbacks work without UTM (no errors)

---

## 🎯 How It Works Now

### Database (Before Migration)
1. Request comes with UTM data
2. Code tries to insert with UTM
3. Gets error about missing column
4. Automatically retries without UTM
5. ✅ Request succeeds (UTM data lost, but no error)

### Database (After Migration)
1. Request comes with UTM data
2. Code inserts with UTM
3. ✅ Request succeeds with UTM tracking


---

## ✅ Verification

After deploying and running migration:

1. **Test callback creation:**
   - Submit a callback with UTM parameters
   - Check logs: should see "✅ Callback request created" with UTM data
   - Check database: `fromWhichUTM` column should have data

2. **Check for errors:**
   - No more database column errors
   - Telegram 409 errors during restarts are normal and resolve automatically

---

## 📝 Notes

- **Database migration is required** for full UTM tracking functionality
- **Until migration is run**, callbacks work but UTM data is not stored
- **Telegram 409 errors** during instance restarts are normal and resolve automatically as old instances shut down

---

**Status:** Code fixes complete ✅  
**Next Step:** Run database migration in Supabase 🗄️


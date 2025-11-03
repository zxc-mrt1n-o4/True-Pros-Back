import { supabase } from '../config/supabase.js';
import { v4 as uuidv4 } from 'uuid';

// Create a new callback request
export const createCallbackRequest = async (callbackData) => {
  try {
    const newCallback = {
      id: uuidv4(),
      name: callbackData.name,
      phone: callbackData.phone,
      service_type: callbackData.service_type || null,
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: null,
      completed_at: null,
      completed_by: null
    };

    // Only include fromWhichUTM if provided (use lowercase to match database column name)
    if (callbackData.fromWhichUTM) {
      // Use lowercase 'fromwhichutm' to match the actual database column name
      newCallback.fromwhichutm = callbackData.fromWhichUTM;
    }

    const { data, error } = await supabase
      .from('callback_requests')
      .insert([newCallback])
      .select()
      .single();

    if (error) {
      console.error('❌ Error creating callback request:', error);
      
      // If error is about missing column, try without UTM field
      if (error.code === 'PGRST204' && (error.message?.includes('fromWhichUTM') || error.message?.includes('fromwhichutm'))) {
        console.warn('⚠️ fromwhichutm column not found, retrying without UTM field...');
        delete newCallback.fromwhichutm;
        
        const { data: retryData, error: retryError } = await supabase
          .from('callback_requests')
          .insert([newCallback])
          .select()
          .single();
        
        if (retryError) {
          throw new Error(`Database error: ${retryError.message}`);
        }
        
        console.log('✅ Callback request created (without UTM):', retryData.id);
        return retryData;
      }
      
      throw new Error(`Database error: ${error.message}`);
    }

    console.log('✅ Callback request created:', data.id);
    if (callbackData.fromWhichUTM) {
      console.log('📊 UTM data included:', callbackData.fromWhichUTM);
    }
    return data;
  } catch (error) {
    console.error('❌ Error in createCallbackRequest:', error);
    throw error;
  }
};

// Get callback request by ID
export const getCallbackById = async (id) => {
  try {
    const { data, error } = await supabase
      .from('callback_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      throw new Error(`Database error: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('❌ Error getting callback by ID:', error);
    throw error;
  }
};

// Get all callback requests with pagination
export const getAllCallbacks = async (options = {}) => {
  try {
    const {
      page = 1,
      limit = 50,
      status = null,
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = options;

    let query = supabase
      .from('callback_requests')
      .select('*', { count: 'exact' });

    // Filter by status if provided
    if (status) {
      query = query.eq('status', status);
    }

    // Apply sorting
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

    // Apply pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    return {
      data,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit)
      }
    };
  } catch (error) {
    console.error('❌ Error getting all callbacks:', error);
    throw error;
  }
};

// Update callback status
export const updateCallbackStatus = async (id, updateData) => {
  try {
    console.log('🔄 updateCallbackStatus called with:', { id, updateData });
    
    const updates = {
      ...updateData,
      updated_at: new Date().toISOString()
    };

    // If marking as completed, set completed_at
    if (updateData.status === 'completed' && !updateData.completed_at) {
      updates.completed_at = new Date().toISOString();
    }

    console.log('📝 Final updates object:', updates);
    console.log('🎯 Updating record with ID:', id);

    const { data, error } = await supabase
      .from('callback_requests')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    console.log('📊 Supabase response:', { data, error });

    if (error) {
      console.error('❌ Supabase error details:', error);
      throw new Error(`Database error: ${error.message}`);
    }

    console.log('✅ Callback status updated successfully:', id);
    return data;
  } catch (error) {
    console.error('❌ Error updating callback status:', error);
    console.error('❌ Error details:', error.message);
    console.error('❌ Error stack:', error.stack);
    throw error;
  }
};

// Delete callback request
export const deleteCallback = async (id) => {
  try {
    const { error } = await supabase
      .from('callback_requests')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    console.log('✅ Callback deleted:', id);
    return true;
  } catch (error) {
    console.error('❌ Error deleting callback:', error);
    throw error;
  }
};

// Get callback statistics
export const getCallbackStats = async (timeRange = '30d') => {
  try {
    const now = new Date();
    let startDate;

    switch (timeRange) {
      case '24h':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get total count and status breakdown
    const { data: allData, error: allError } = await supabase
      .from('callback_requests')
      .select('status, created_at')
      .gte('created_at', startDate.toISOString());

    if (allError) {
      throw new Error(`Database error: ${allError.message}`);
    }

    // Calculate statistics
    const stats = {
      total: allData.length,
      pending: allData.filter(item => item.status === 'pending').length,
      in_progress: allData.filter(item => item.status === 'in_progress').length,
      contacted: allData.filter(item => item.status === 'contacted').length,
      completed: allData.filter(item => item.status === 'completed').length,
      cancelled: allData.filter(item => item.status === 'cancelled').length,
      timeRange,
      startDate: startDate.toISOString(),
      endDate: now.toISOString()
    };

    return stats;
  } catch (error) {
    console.error('❌ Error getting callback stats:', error);
    throw error;
  }
}; 
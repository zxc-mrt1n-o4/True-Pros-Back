import express from 'express';
import { 
  createCallbackRequest, 
  getAllCallbacks, 
  getCallbackById, 
  updateCallbackStatus, 
  deleteCallback,
  getCallbackStats 
} from '../services/callbackService.js';

const router = express.Router();

// POST /api/callbacks - Create new callback request
router.post('/', async (req, res) => {
  try {
    const { name, phone, service_type } = req.body;

    // Validation
    if (!name || !phone) {
      return res.status(400).json({
        success: false,
        error: 'Name and phone are required'
      });
    }

    // Basic phone validation
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    if (!phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number format'
      });
    }

    const callbackData = {
      name: name.trim(),
      phone: phone.trim(),
      service_type: service_type?.trim() || null
    };

    const result = await createCallbackRequest(callbackData);

    res.status(201).json({
      success: true,
      data: result,
      message: 'Callback request created successfully'
    });

  } catch (error) {
    console.error('❌ Error creating callback:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/callbacks - Get all callback requests with pagination
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      status,
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = req.query;

    const options = {
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 100), // Max 100 per page
      status,
      sortBy,
      sortOrder
    };

    const result = await getAllCallbacks(options);

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      message: 'Callbacks retrieved successfully'
    });

  } catch (error) {
    console.error('❌ Error getting callbacks:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/callbacks/stats - Get callback statistics
router.get('/stats', async (req, res) => {
  try {
    const { timeRange = '30d' } = req.query;
    
    const stats = await getCallbackStats(timeRange);

    res.json({
      success: true,
      data: stats,
      message: 'Statistics retrieved successfully'
    });

  } catch (error) {
    console.error('❌ Error getting callback stats:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/callbacks/:id - Get specific callback by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const callback = await getCallbackById(id);

    if (!callback) {
      return res.status(404).json({
        success: false,
        error: 'Callback not found'
      });
    }

    res.json({
      success: true,
      data: callback,
      message: 'Callback retrieved successfully'
    });

  } catch (error) {
    console.error('❌ Error getting callback:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// PATCH /api/callbacks/:id - Update callback status
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, completed_by } = req.body;

    // Validate status
    const validStatuses = ['pending', 'in_progress', 'contacted', 'completed', 'cancelled'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Must be one of: ' + validStatuses.join(', ')
      });
    }

    const updateData = {};
    if (status) updateData.status = status;
    if (completed_by) updateData.completed_by = completed_by.trim();

    const result = await updateCallbackStatus(id, updateData);

    res.json({
      success: true,
      data: result,
      message: 'Callback updated successfully'
    });

  } catch (error) {
    console.error('❌ Error updating callback:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// DELETE /api/callbacks/:id - Delete callback
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await deleteCallback(id);

    res.json({
      success: true,
      message: 'Callback deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting callback:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router; 
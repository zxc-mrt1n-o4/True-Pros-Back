import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const workersGroupId = process.env.TELEGRAM_WORKERS_GROUP_ID;
const workersTopicId = process.env.TELEGRAM_WORKERS_TOPIC_ID;

if (!token) {
  throw new Error('TELEGRAM_BOT_TOKEN is required');
}

// Create bot instance with polling enabled and better error handling
export const bot = new TelegramBot(token, { 
  polling: {
    interval: 1000,
    autoStart: true,
    params: {
      timeout: 10,
      limit: 100,
      allowed_updates: ['message', 'callback_query']
    }
  },
  request: {
    agentOptions: {
      keepAlive: true,
      keepAliveMsecs: 30000
    },
    timeout: 30000
  }
});

// Russian text templates
const messages = {
  newCallback: (data) => `
🔔 *Новая заявка на обратный звонок*

👤 *Имя:* ${data.name}
📞 *Телефон:* ${data.phone}
🔧 *Услуга:* ${data.service_type || 'Не указана'}
🕐 *Время:* ${new Date(data.created_at).toLocaleString('ru-RU')}
🆔 *ID заявки:* \`${data.id}\`

📋 *Статус:* ${getStatusText(data.status)}
`,

  callbackCompleted: (data) => `
✅ *Заявка выполнена*

🆔 *ID:* \`${data.id}\`
👤 *Клиент:* ${data.name}
📞 *Телефон:* ${data.phone}
👨‍🔧 *Выполнил:* ${data.completed_by || 'Не указан'}
🕐 *Завершено:* ${new Date(data.completed_at).toLocaleString('ru-RU')}
`,

  systemMessage: (message) => `
ℹ️ *Системное уведомление*

${message}
`,

  error: (error) => `
❌ *Ошибка системы*

\`${error}\`
`
};

// Status translations
const getStatusText = (status) => {
  const statusMap = {
    'pending': '⏳ Ожидает',
    'in_progress': '🔄 В работе',
    'contacted': '📞 Связались',
    'completed': '✅ Выполнено',
    'cancelled': '❌ Отменено'
  };
  return statusMap[status] || status;
};

// Send message to workers group
export const sendToWorkersGroup = async (message, options = {}) => {
  try {
    if (!workersGroupId) {
      console.warn('⚠️ TELEGRAM_WORKERS_GROUP_ID not configured');
      return null;
    }

    const sendOptions = {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      ...options
    };

    // Add topic ID if specified
    if (workersTopicId) {
      sendOptions.message_thread_id = parseInt(workersTopicId);
    }

    const result = await bot.sendMessage(workersGroupId, message, sendOptions);
    console.log('✅ Message sent to workers group');
    return result;
  } catch (error) {
    console.error('❌ Failed to send message to workers group:', error.message);
    return null;
  }
};

// Send direct message to user
export const sendDirectMessage = async (chatId, message, options = {}) => {
  try {
    const sendOptions = {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      ...options
    };

    const result = await bot.sendMessage(chatId, message, sendOptions);
    console.log(`✅ Direct message sent to ${chatId}`);
    return result;
  } catch (error) {
    console.error(`❌ Failed to send direct message to ${chatId}:`, error.message);
    return null;
  }
};

// Send new callback notification
export const notifyNewCallback = async (callbackData) => {
  const message = messages.newCallback(callbackData);
  
  // Create inline keyboard with assignment buttons for Vlad and Denis (mobile-friendly)
  const keyboard = {
    inline_keyboard: [
      [
        { text: '👤 Влад', callback_data: `assign_vlad_${callbackData.id}` },
        { text: '👤 Денис', callback_data: `assign_denis_${callbackData.id}` }
      ]
    ]
  };

  // Send to workers group and store message ID for editing
  const sentMessage = await sendToWorkersGroup(message, { reply_markup: keyboard });
  if (sentMessage && sentMessage.message_id) {
    await storeGroupMessage(callbackData.id, sentMessage.message_id, sentMessage.chat.id);
  }
  
  return true;
};

// Send callback completion notification (now handled by message editing)
export const notifyCallbackCompleted = async (callbackData) => {
  // No longer send new messages for completion - handled by updateGroupMessage
  console.log(`✅ Callback ${callbackData.id} completed, message updated via button press`);
  return true;
};

// Send system notification
export const sendSystemNotification = async (messageText) => {
  const message = messages.systemMessage(messageText);
  await sendToWorkersGroup(message);
  return true;
};

// Send error notification
export const sendErrorNotification = async (error) => {
  const message = messages.error(error);
  await sendToWorkersGroup(message);
  return true;
};

// Store group message IDs by callback ID for editing
const groupMessages = new Map();

// Enhanced group message storage with database fallback
const storeGroupMessage = async (callbackId, messageId, chatId) => {
  try {
    groupMessages.set(callbackId, { messageId, chatId });
    
    // Also store in database for persistence
    const { updateCallbackStatus } = await import('./callbackService.js');
    await updateCallbackStatus(callbackId, {
      telegram_message_id: messageId,
      telegram_chat_id: chatId
    });
    
    console.log(`📌 Group message stored for callback ${callbackId}`);
  } catch (error) {
    console.error('❌ Error storing group message:', error.message);
  }
};

// Get group message with database fallback
const getGroupMessage = async (callbackId) => {
  try {
    // Try memory first
    let messageData = groupMessages.get(callbackId);
    
    if (!messageData) {
      // Fallback to database
      const { getCallbackById } = await import('./callbackService.js');
      const callback = await getCallbackById(callbackId);
      
      if (callback && callback.telegram_message_id && callback.telegram_chat_id) {
        messageData = {
          messageId: callback.telegram_message_id,
          chatId: callback.telegram_chat_id
        };
        // Store in memory for next time
        groupMessages.set(callbackId, messageData);
      }
    }
    
    return messageData;
  } catch (error) {
    console.error('❌ Error getting group message:', error.message);
    return null;
  }
};

// Handle callback queries (button presses)
export const handleCallbackQuery = async (callbackQuery) => {
  console.log('🔘 Raw callback query received:', callbackQuery.data);
  console.log('🔘 Callback query received:', callbackQuery.data, 'from user:', callbackQuery.from.first_name);
  console.log('🔘 Full callback query object:', JSON.stringify(callbackQuery, null, 2));
  
  // Immediate answer to prevent multiple clicks
  try {
    await bot.answerCallbackQuery(callbackQuery.id, { text: '⏳ Обрабатываем...' });
    console.log('✅ Initial callback query answered');
  } catch (error) {
    console.error('❌ Error answering initial callback query:', error.message);
  }
  
  const { data, from, message } = callbackQuery;
  
  // Parse callback data for assignment actions
  let action, assignedPerson, callbackId;
  
  if (data.startsWith('assign_vlad_')) {
    action = 'assign';
    assignedPerson = 'Влад';
    callbackId = data.replace('assign_vlad_', '');
    console.log('✅ Parsed Vlad assignment:', { action, assignedPerson, callbackId });
  } else if (data.startsWith('assign_denis_')) {
    action = 'assign';
    assignedPerson = 'Денис';
    callbackId = data.replace('assign_denis_', '');
    console.log('✅ Parsed Denis assignment:', { action, assignedPerson, callbackId });
  } else {
    console.log('❌ Unknown callback data:', data);
    // Handle unknown actions
    await bot.answerCallbackQuery(callbackQuery.id, { 
      text: '❌ Неизвестное действие' 
    });
    return;
  }
  
  const userName = from.first_name || 'Работник';
  const userId = from.id;
  console.log('👤 User info:', { userName, userId });
  
  try {
    console.log('📦 Importing callback service...');
    // Import here to avoid circular dependency
    const { updateCallbackStatus, getCallbackById } = await import('./callbackService.js');
    console.log('✅ Callback service imported successfully');
    
    console.log('🔍 Getting callback by ID:', callbackId);
    
    // Handle test callbacks differently
    if (callbackId.startsWith('test-')) {
      console.log('🧪 Processing test callback:', callbackId);
      const responseText = `👤 Тест: заявка привязана под ${assignedPerson} (назначил: ${userName})`;
      
      try {
        await bot.answerCallbackQuery(callbackQuery.id, { text: responseText, show_alert: false });
        console.log('✅ Test callback processed successfully');
      } catch (error) {
        console.error('❌ Error processing test callback:', error.message);
      }
      return;
    }
    
    const existingCallback = await getCallbackById(callbackId);
    console.log('📋 Existing callback:', existingCallback);
    
    if (!existingCallback) {
      console.log('❌ Callback not found in database:', callbackId);
      try {
        await bot.answerCallbackQuery(callbackQuery.id, { 
          text: '❌ Заявка не найдена' 
        });
      } catch (error) {
        console.error('❌ Error sending not found response:', error.message);
      }
      return;
    }
    
    let statusUpdate = {};
    let responseText = '';
    let newKeyboard = null;
    
    if (action === 'assign') {
      statusUpdate = { 
        status: 'in_progress',
        updated_at: new Date().toISOString(),
        assigned_to: assignedPerson,
        assigned_user_id: userId
      };
      responseText = `👤 Заявка привязана под ${assignedPerson} (назначил: ${userName})`;
      
      // Remove all buttons after assignment
      newKeyboard = { inline_keyboard: [] };
      
      console.log('📝 Status update data:', statusUpdate);
    }
    
    // Update status in database
    if (Object.keys(statusUpdate).length > 0) {
      console.log('💾 Updating callback status in database...');
      const updatedCallback = await updateCallbackStatus(callbackId, statusUpdate);
      console.log('✅ Database update successful:', updatedCallback);
    }
    
    // Send final response
    console.log('📤 Sending final response to user...');
    try {
      await bot.answerCallbackQuery(callbackQuery.id, { text: responseText, show_alert: false });
      console.log('✅ Final response sent');
    } catch (error) {
      console.error('❌ Error sending final response:', error.message);
    }
    
    // Update the original group message
    console.log('✏️ Updating group message...');
    await updateGroupMessage(callbackId, responseText, newKeyboard, true);
    console.log('✅ Group message updated');
    
  } catch (error) {
    console.error('❌ Error handling callback query:', error);
    console.error('❌ Error stack:', error.stack);
    await bot.answerCallbackQuery(callbackQuery.id, { 
      text: '❌ Произошла ошибка при обработке запроса' 
    });
  }
};

// Update the original group message with status changes
const updateGroupMessage = async (callbackId, statusText, newKeyboard, useShortFormat = false) => {
  try {
    const messageData = await getGroupMessage(callbackId);
    if (!messageData) {
      console.log(`⚠️ No group message found for callback ${callbackId}`);
      return;
    }

    const { getCallbackById } = await import('./callbackService.js');
    const callback = await getCallbackById(callbackId);
    
    if (!callback) {
      console.log(`⚠️ Callback ${callbackId} not found for message update`);
      return;
    }

    let updatedMessage;
    
    // Format message with assignment information
    if (callback.status === 'in_progress' && callback.assigned_to) {
      updatedMessage = `
🔔 *Заявка привязана под ${callback.assigned_to}*

👤 *Имя:* ${callback.name}
📞 *Телефон:* ${callback.phone}
🔧 *Услуга:* ${callback.service_type || 'Не указана'}
🕐 *Время:* ${new Date(callback.created_at).toLocaleString('ru-RU')}
🆔 *ID заявки:* \`${callback.id}\`

👨‍🔧 *Назначен:* ${callback.assigned_to}
🔄 *${statusText}*
`;
    } else {
      // Original format for unassigned callbacks
      const originalMessage = messages.newCallback(callback);
      updatedMessage = originalMessage + (statusText ? `\n\n🔄 *Обновление:* ${statusText}` : '');
    }

    try {
      await bot.editMessageText(updatedMessage, {
        chat_id: messageData.chatId,
        message_id: messageData.messageId,
        parse_mode: 'Markdown',
        reply_markup: newKeyboard
      });

      console.log(`✅ Group message updated for callback ${callbackId}`);
    } catch (editError) {
      console.error(`❌ Error editing message for callback ${callbackId}:`, editError.message);
      // Try sending a new message if editing fails
      try {
        await sendToWorkersGroup(`🔄 ${updatedMessage}`, { reply_markup: newKeyboard });
        console.log(`✅ Sent new message instead of editing for callback ${callbackId}`);
      } catch (sendError) {
        console.error(`❌ Error sending new message for callback ${callbackId}:`, sendError.message);
      }
    }
  } catch (error) {
    console.error(`❌ Error updating group message for callback ${callbackId}:`, error.message);
  }
};

// Set up bot commands
export const setBotCommands = async () => {
  try {
    const commands = [
      { command: 'start', description: 'Начать работу с ботом' },
      { command: 'help', description: 'Показать справку' }
    ];
    
    await bot.setMyCommands(commands);
    console.log('✅ Bot commands set successfully');
  } catch (error) {
    console.error('❌ Error setting bot commands:', error.message);
  }
};

// Test bot connection
export const testBotConnection = async () => {
  try {
    const me = await bot.getMe();
    console.log('✅ Bot connected successfully:', me.first_name);
    return true;
  } catch (error) {
    console.error('❌ Bot connection failed:', error.message);
    return false;
  }
};

// Set up callback query handler
bot.on('callback_query', (callbackQuery) => {
  console.log('🔘 Callback query event received');
  handleCallbackQuery(callbackQuery).catch(error => {
    console.error('❌ Unhandled error in callback query handler:', error);
  });
});

// Set up message handler for debugging
bot.on('message', (msg) => {
  console.log('📨 Message received:', {
    chatId: msg.chat.id,
    text: msg.text,
    from: msg.from.first_name
  });
});

// Set up error handler
bot.on('error', (error) => {
  console.error('❌ Telegram bot error:');
  console.error('Error message:', error.message);
  console.error('Error code:', error.code);
  console.error('Error response:', error.response?.body);
  console.error('Full error:', JSON.stringify(error, null, 2));
});

// Set up polling error handler
bot.on('polling_error', (error) => {
  console.error('❌ Telegram polling error:');
  console.error('Error message:', error.message);
  console.error('Error code:', error.code);
  console.error('Error response:', error.response?.body);
  console.error('Full error:', JSON.stringify(error, null, 2));
});

// Initialize bot
console.log('🤖 Initializing Telegram bot...');
console.log('📋 Bot features:');
console.log('   • Assignment system for Vlad and Denis');
console.log('   • Group notifications');
console.log('   • Message editing');
console.log('   • Callback query handling');

// Set up commands
setBotCommands();

// Test connection
testBotConnection();

console.log('✅ Telegram bot initialized successfully'); 
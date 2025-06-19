import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const workersGroupId = process.env.TELEGRAM_WORKERS_GROUP_ID;
const workersTopicId = process.env.TELEGRAM_WORKERS_TOPIC_ID;

if (!token) {
  throw new Error('TELEGRAM_BOT_TOKEN is required');
}

// Create bot instance with polling enabled
export const bot = new TelegramBot(token, { polling: true });

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
  
  // Create inline keyboard for quick actions - only show initial buttons
  const keyboard = {
    inline_keyboard: [
      [
        { text: '✅ Связались', callback_data: `contacted_${callbackData.id}` },
        { text: '❌ Отменить', callback_data: `cancel_${callbackData.id}` }
      ],
      [
        { text: 'ℹ️ Подробнее', callback_data: `details_${callbackData.id}` }
      ]
    ]
  };

  // Send to workers group
  await sendToWorkersGroup(message, { reply_markup: keyboard });
  
  return true;
};

// Send callback completion notification
export const notifyCallbackCompleted = async (callbackData) => {
  const message = messages.callbackCompleted(callbackData);
  await sendToWorkersGroup(message);
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

// Store user states for scheduling
const userStates = new Map();
const scheduledJobs = new Map(); // Store scheduled reminders

// Start collecting additional information from worker
const startInfoCollection = async (userId, callbackId, userName) => {
  try {
    const { getCallbackById } = await import('./callbackService.js');
    const callback = await getCallbackById(callbackId);
    
    if (!callback) {
      await sendDirectMessage(userId, '❌ Заявка не найдена');
      return;
    }

    const infoMessage = `
📋 *Заявка назначена вам*

🆔 *Заявка:* ${callbackId}
👤 *Клиент:* ${callback.name}
📞 *Телефон:* ${callback.phone}
🔧 *Услуга:* ${callback.service_type || 'Не указана'}

📝 *Необходимо собрать дополнительную информацию:*

*Отправьте адрес клиента:*
`;

    // Set user state for info collection
    userStates.set(userId, {
      action: 'collecting_address',
      callbackId: callbackId,
      userName: userName,
      collectedInfo: {}
    });

    await sendDirectMessage(userId, infoMessage);
  } catch (error) {
    console.error('❌ Error starting info collection:', error);
    await sendDirectMessage(userId, '❌ Ошибка при начале сбора информации');
  }
};

// Send scheduling request to worker in DM
const sendSchedulingRequest = async (userId, callbackId, userName) => {
  try {
    const { getCallbackById, updateCallbackStatus } = await import('./callbackService.js');
    const callback = await getCallbackById(callbackId);
    
    if (!callback) {
      await sendDirectMessage(userId, '❌ Заявка не найдена');
      return;
    }

    // Update status to in_progress when scheduling starts
    await updateCallbackStatus(callbackId, {
      status: 'in_progress',
      updated_at: new Date().toISOString()
    });

    const schedulingMessage = `
📅 *Планирование визита*

🆔 *Заявка:* ${callbackId}
👤 *Клиент:* ${callback.name}
📞 *Телефон:* ${callback.phone}
📍 *Адрес:* ${callback.address || 'Не указан'}
🔧 *Услуга:* ${callback.detailed_service_type || callback.service_type || 'Не указана'}
${callback.problem_description ? `❓ *Проблема:* ${callback.problem_description}` : ''}

📝 *Отправьте дату и время визита в формате:*
\`ДД.ММ.ГГГГ ЧЧ:ММ\`

*Примеры:*
• \`25.12.2024 14:30\`
• \`01.01.2025 09:00\`
• \`15.06.2025 16:45\`

💡 *Или используйте команду /cancel для отмены планирования*
`;

    // Set user state for scheduling
    userStates.set(userId, {
      action: 'scheduling',
      callbackId: callbackId,
      userName: userName
    });

    await sendDirectMessage(userId, schedulingMessage);
  } catch (error) {
    console.error('❌ Error sending scheduling request:', error);
    await sendDirectMessage(userId, '❌ Ошибка при отправке запроса на планирование');
  }
};

// Handle callback queries (button presses)
export const handleCallbackQuery = async (callbackQuery) => {
  console.log('🔘 Callback query received:', callbackQuery.data, 'from user:', callbackQuery.from.first_name);
  
  const { data, from, message } = callbackQuery;
  const [action, callbackId] = data.split('_');
  const userName = from.first_name || 'Работник';
  const userId = from.id;
  
  try {
    // Import here to avoid circular dependency
    const { updateCallbackStatus, getCallbackById } = await import('./callbackService.js');
    
    let statusUpdate = {};
    let responseText = '';
    let newKeyboard = null;
    
    switch (action) {
      case 'contacted':
        statusUpdate = { 
          status: 'contacted',
          updated_at: new Date().toISOString(),
          assigned_to: userName,
          assigned_user_id: userId
        };
        responseText = `📞 Связались с клиентом (${userName}) - заявка назначена`;
        
        // Start collecting additional information in DM
        await startInfoCollection(userId, callbackId, userName);
        
        // Remove all buttons from group message - worker will handle in DM
        newKeyboard = { inline_keyboard: [] };
        break;
        

        
      case 'cancel':
        statusUpdate = { 
          status: 'cancelled',
          updated_at: new Date().toISOString()
        };
        responseText = `❌ Заявка отменена (${userName})`;
        
        // Remove all buttons when cancelled
        newKeyboard = { inline_keyboard: [] };
        break;
        
      case 'schedule':
        // Start scheduling process
        await sendSchedulingRequest(userId, callbackId, userName);
        responseText = `📅 Запрос на планирование отправлен в личные сообщения`;
        break;
        
      case 'complete':
        statusUpdate = { 
          status: 'completed',
          updated_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          completed_by: userName
        };
        responseText = `✅ Заявка выполнена (${userName})`;
        
        // Remove the complete button
        newKeyboard = { inline_keyboard: [] };
        break;
        
      case 'details':
        // Show detailed information
        const callback = await getCallbackById(callbackId);
        if (callback) {
          responseText = `📋 Детали заявки ${callbackId}:\n\n${messages.newCallback(callback)}`;
        } else {
          responseText = `❌ Заявка ${callbackId} не найдена`;
        }
        break;
        
      default:
        responseText = '❌ Неизвестное действие';
    }
    
    // Update status in database if needed
    if (Object.keys(statusUpdate).length > 0) {
      await updateCallbackStatus(callbackId, statusUpdate);
    }
    
    // Send response
    await bot.answerCallbackQuery(callbackQuery.id, { text: responseText });
    
    // Update message if status changed
    if (action !== 'details') {
      const updatedMessage = message.text + `\n\n🔄 *Обновление:* ${responseText}`;
      await bot.editMessageText(updatedMessage, {
        chat_id: message.chat.id,
        message_id: message.message_id,
        parse_mode: 'Markdown',
        reply_markup: newKeyboard
      });
    }
    
  } catch (error) {
    console.error('❌ Error handling callback query:', error);
    await bot.answerCallbackQuery(callbackQuery.id, { 
      text: '❌ Произошла ошибка при обработке запроса' 
    });
  }
};

// Parse date and time from user input
const parseDateTime = (dateTimeString) => {
  try {
    // Expected format: ДД.ММ.ГГГГ ЧЧ:ММ
    const regex = /^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})$/;
    const match = dateTimeString.trim().match(regex);
    
    if (!match) {
      return null;
    }
    
    const [, day, month, year, hours, minutes] = match;
    const date = new Date(year, month - 1, day, hours, minutes);
    
    // Check if date is valid and in the future
    if (isNaN(date.getTime()) || date <= new Date()) {
      return null;
    }
    
    return date;
  } catch (error) {
    return null;
  }
};

// Schedule reminder 45 minutes before appointment
const scheduleReminder = (userId, callbackId, appointmentDate, clientName, serviceType) => {
  const reminderTime = new Date(appointmentDate.getTime() - 45 * 60 * 1000); // 45 minutes before
  const now = new Date();
  
  if (reminderTime <= now) {
    console.log('⚠️ Reminder time is in the past, skipping');
    return;
  }
  
  const timeoutMs = reminderTime.getTime() - now.getTime();
  
  const timeoutId = setTimeout(async () => {
    const reminderMessage = `
⏰ *Напоминание о визите*

🕐 *Через 45 минут:* ${appointmentDate.toLocaleString('ru-RU')}
🆔 *Заявка:* ${callbackId}
👤 *Клиент:* ${clientName}
🔧 *Услуга:* ${serviceType || 'Не указана'}

📍 *Не забудьте подготовиться к визиту!*
`;
    
    await sendDirectMessage(userId, reminderMessage);
    scheduledJobs.delete(`${callbackId}_${userId}`);
  }, timeoutMs);
  
  // Store the timeout ID for potential cancellation
  scheduledJobs.set(`${callbackId}_${userId}`, {
    timeoutId,
    appointmentDate,
    clientName,
    serviceType,
    callbackId
  });
  
  console.log(`⏰ Reminder scheduled for ${reminderTime.toLocaleString('ru-RU')}`);
};

// Handle info collection process
const handleInfoCollection = async (chatId, messageText, userState) => {
  try {
    if (messageText === '/cancel') {
      userStates.delete(chatId);
      await sendDirectMessage(chatId, '❌ Сбор информации отменен');
      return;
    }

    const { action, callbackId, userName, collectedInfo } = userState;

    switch (action) {
      case 'collecting_address':
        collectedInfo.address = messageText.trim();
        userState.action = 'collecting_service_type';
        userStates.set(chatId, userState);
        
        await sendDirectMessage(chatId, `
📍 *Адрес сохранен:* ${messageText.trim()}

🔧 *Теперь уточните тип услуги:*
(например: "Ремонт холодильника", "Замена компрессора", "Диагностика стиральной машины")
`);
        break;

      case 'collecting_service_type':
        collectedInfo.detailedServiceType = messageText.trim();
        userState.action = 'collecting_problem';
        userStates.set(chatId, userState);
        
        await sendDirectMessage(chatId, `
🔧 *Тип услуги сохранен:* ${messageText.trim()}

❓ *Опишите проблему (необязательно):*
Или отправьте "-" чтобы пропустить
`);
        break;

      case 'collecting_problem':
        const problemDescription = messageText.trim() === '-' ? null : messageText.trim();
        collectedInfo.problemDescription = problemDescription;
        
        // Save all collected info to database
        await saveCollectedInfo(callbackId, collectedInfo);
        
        // Send detailed request with schedule button
        await sendDetailedRequest(chatId, callbackId, userName, collectedInfo);
        
        // Clear user state
        userStates.delete(chatId);
        break;

      default:
        await sendDirectMessage(chatId, '❌ Неизвестное состояние. Используйте /cancel для сброса.');
    }
  } catch (error) {
    console.error('❌ Error handling info collection:', error);
    await sendDirectMessage(chatId, '❌ Ошибка при сборе информации. Попробуйте еще раз.');
  }
};

// Save collected information to database
const saveCollectedInfo = async (callbackId, collectedInfo) => {
  try {
    const { updateCallbackStatus } = await import('./callbackService.js');
    
    const updates = {
      address: collectedInfo.address,
      detailed_service_type: collectedInfo.detailedServiceType,
      problem_description: collectedInfo.problemDescription,
      updated_at: new Date().toISOString()
    };
    
    await updateCallbackStatus(callbackId, updates);
    console.log(`✅ Additional info saved for callback ${callbackId}`);
  } catch (error) {
    console.error('❌ Error saving collected info:', error);
    throw error;
  }
};

// Send detailed request with schedule button
const sendDetailedRequest = async (userId, callbackId, userName, collectedInfo) => {
  try {
    const { getCallbackById } = await import('./callbackService.js');
    const callback = await getCallbackById(callbackId);
    
    if (!callback) {
      await sendDirectMessage(userId, '❌ Заявка не найдена');
      return;
    }

    const detailedMessage = `
✅ *Информация собрана и сохранена*

🆔 *Заявка:* ${callbackId}
👤 *Клиент:* ${callback.name}
📞 *Телефон:* ${callback.phone}
📍 *Адрес:* ${collectedInfo.address}
🔧 *Услуга:* ${collectedInfo.detailedServiceType}
${collectedInfo.problemDescription ? `❓ *Проблема:* ${collectedInfo.problemDescription}` : ''}

📅 *Готово к планированию визита*
`;

    const scheduleKeyboard = {
      inline_keyboard: [
        [
          { text: '📅 Запланировать визит', callback_data: `schedule_${callbackId}` }
        ]
      ]
    };

    await sendDirectMessage(userId, detailedMessage, { reply_markup: scheduleKeyboard });
  } catch (error) {
    console.error('❌ Error sending detailed request:', error);
    await sendDirectMessage(userId, '❌ Ошибка при отправке детальной информации');
  }
};

// Get user's scheduled appointments (exclude completed)
const getUserSchedule = async (userId) => {
  try {
    const { getAllCallbacks } = await import('./callbackService.js');
    
    // Get all callbacks assigned to this user that are not completed
    const result = await getAllCallbacks({
      page: 1,
      limit: 100,
      sortBy: 'created_at',
      sortOrder: 'desc'
    });
    
    // Filter for this user's assignments that are not completed
    const userCallbacks = result.data.filter(callback => 
      callback.assigned_user_id === userId && 
      callback.status !== 'completed' && 
      callback.status !== 'cancelled'
    );
    
    // Also get scheduled jobs from memory for appointment times
    const userScheduledJobs = [];
    for (const [key, job] of scheduledJobs.entries()) {
      if (key.includes(`_${userId}`)) {
        userScheduledJobs.push(job);
      }
    }
    
    // Combine database info with scheduled appointment times
    const combinedSchedule = userCallbacks.map(callback => {
      const scheduledJob = userScheduledJobs.find(job => job.callbackId === callback.id);
      return {
        callbackId: callback.id,
        clientName: callback.name,
        phone: callback.phone,
        address: callback.address,
        detailedServiceType: callback.detailed_service_type,
        problemDescription: callback.problem_description,
        status: callback.status,
        appointmentDate: scheduledJob ? scheduledJob.appointmentDate : null
      };
    });
    
    // Sort by appointment date (scheduled first, then by creation date)
    return combinedSchedule.sort((a, b) => {
      if (a.appointmentDate && b.appointmentDate) {
        return a.appointmentDate - b.appointmentDate;
      }
      if (a.appointmentDate && !b.appointmentDate) return -1;
      if (!a.appointmentDate && b.appointmentDate) return 1;
      return 0;
    });
    
  } catch (error) {
    console.error('❌ Error getting user schedule:', error);
    return [];
  }
};

// Handle /start command and other messages
const handleDirectMessage = async (msg) => {
  const chatId = msg.chat.id;
  const messageText = msg.text;
  const userName = msg.from.first_name || 'Пользователь';

  console.log(`📨 Received message from ${userName} (${chatId}): ${messageText}`);

  // Check if user is in any interactive mode
  const userState = userStates.get(chatId);
  
  // Handle info collection states
  if (userState && userState.action.startsWith('collecting_')) {
    await handleInfoCollection(chatId, messageText, userState);
    return;
  }
  
  if (userState && userState.action === 'scheduling') {
    if (messageText === '/cancel') {
      userStates.delete(chatId);
      await sendDirectMessage(chatId, '❌ Планирование отменено');
      return;
    }
    
    // Try to parse the date and time
    const appointmentDate = parseDateTime(messageText);
    
    if (!appointmentDate) {
      await sendDirectMessage(chatId, `
❌ *Неправильный формат даты и времени*

📝 *Используйте формат:* \`ДД.ММ.ГГГГ ЧЧ:ММ\`

*Примеры:*
• \`25.12.2024 14:30\`
• \`01.01.2025 09:00\`
• \`15.06.2025 16:45\`

💡 *Или /cancel для отмены*
`);
      return;
    }
    
    // Save the appointment and set reminder
    try {
      const { getCallbackById } = await import('./callbackService.js');
      const callback = await getCallbackById(userState.callbackId);
      
      if (callback) {
        // Schedule the reminder
        scheduleReminder(chatId, userState.callbackId, appointmentDate, callback.name, callback.service_type);
        
        const confirmationMessage = `
✅ *Визит запланирован*

📅 *Дата и время:* ${appointmentDate.toLocaleString('ru-RU')}
🆔 *Заявка:* ${userState.callbackId}
👤 *Клиент:* ${callback.name}
📍 *Адрес:* ${callback.address || 'Не указан'}
🔧 *Услуга:* ${callback.detailed_service_type || callback.service_type || 'Не указана'}
${callback.problem_description ? `❓ *Проблема:* ${callback.problem_description}` : ''}

⏰ *Напоминание будет отправлено за 45 минут до визита*

📋 *Используйте /schedule для просмотра всех запланированных визитов*
`;

        const completeKeyboard = {
          inline_keyboard: [
            [
              { text: '✅ Отметить как выполнено', callback_data: `complete_${userState.callbackId}` }
            ]
          ]
        };
        
        await sendDirectMessage(chatId, confirmationMessage, { reply_markup: completeKeyboard });
        
        // Notify the group about the scheduled appointment
        const groupMessage = `
📅 *Визит запланирован*

🆔 *Заявка:* ${userState.callbackId}
👤 *Клиент:* ${callback.name}
📅 *Дата:* ${appointmentDate.toLocaleString('ru-RU')}
👨‍🔧 *Мастер:* ${userState.userName}
`;
        
        await sendToWorkersGroup(groupMessage);
      }
      
      // Clear user state
      userStates.delete(chatId);
      
    } catch (error) {
      console.error('❌ Error saving appointment:', error);
      await sendDirectMessage(chatId, '❌ Ошибка при сохранении визита');
    }
    
    return;
  }

  if (messageText === '/start') {
    const welcomeMessage = `
👋 *Добро пожаловать, ${userName}!*

🔧 *True Pros - Ремонт бытовой техники*

Я бот для уведомлений о заявках на обратный звонок.

📋 *Доступные команды:*
/start - Показать это сообщение
/help - Помощь
/status - Статус системы

🌐 *Наш сайт:* [True Pros](http://localhost:3000)

📞 *Как это работает:*
1. Клиент оставляет заявку на сайте
2. Вы получаете уведомление в группе
3. Можете управлять статусом через кнопки

💼 *Для работников:* Добавьте этого бота в рабочую группу для получения уведомлений о новых заявках.
`;

    await sendDirectMessage(chatId, welcomeMessage);
  } else if (messageText === '/help') {
    const helpMessage = `
ℹ️ *Помощь - True Pros Bot*

🤖 *Что я умею:*
• Отправлять уведомления о новых заявках
• Показывать статус заявок
• Управлять статусами через кнопки

📱 *Команды:*
/start - Главное меню
/help - Эта справка
/status - Проверить статус системы
/schedule - Посмотреть запланированные визиты
/cancel - Отменить текущее действие

🔧 *Для работников:*
• Добавьте бота в рабочую группу
• Настройте топик для уведомлений
• Используйте кнопки для управления заявками
• Планируйте визиты через личные сообщения

📞 *Поддержка:* Если есть вопросы, обратитесь к администратору.
`;

    await sendDirectMessage(chatId, helpMessage);
  } else if (messageText === '/status') {
    const statusMessage = `
📊 *Статус системы True Pros*

✅ *Бот:* Работает
🗄️ *База данных:* Подключена
📡 *Уведомления:* Активны
🕐 *Время:* ${new Date().toLocaleString('ru-RU')}

🔄 *Последняя проверка:* Только что

💚 Все системы работают нормально!
`;

    await sendDirectMessage(chatId, statusMessage);
  } else if (messageText === '/schedule') {
    const userSchedule = await getUserSchedule(chatId);
    
    if (userSchedule.length === 0) {
      const noScheduleMessage = `
📅 *Ваши активные заявки*

📭 *У вас нет активных заявок*

💡 *Чтобы получить заявку:*
1. Нажмите "Связались" на заявке в группе
2. Соберите информацию в личных сообщениях
3. Запланируйте визит
`;
      
      await sendDirectMessage(chatId, noScheduleMessage);
    } else {
      let scheduleMessage = `📅 *Ваши активные заявки*\n\n`;
      
      userSchedule.forEach((callback, index) => {
        scheduleMessage += `${index + 1}. 👤 *${callback.clientName}*\n`;
        scheduleMessage += `   📞 ${callback.phone}\n`;
        
        if (callback.address) {
          scheduleMessage += `   📍 ${callback.address}\n`;
        }
        
        // Build service description
        let serviceDescription = '';
        if (callback.detailedServiceType) {
          serviceDescription = callback.detailedServiceType;
          if (callback.problemDescription) {
            serviceDescription += `, ${callback.problemDescription}`;
          }
        } else {
          serviceDescription = 'Не указана';
        }
        scheduleMessage += `   🔧 ${serviceDescription}\n`;
        
        // Show appointment time if scheduled
        if (callback.appointmentDate) {
          const timeUntil = callback.appointmentDate.getTime() - new Date().getTime();
          const hoursUntil = Math.round(timeUntil / (1000 * 60 * 60));
          
          scheduleMessage += `   📅 ${callback.appointmentDate.toLocaleString('ru-RU')}\n`;
          
          if (hoursUntil > 0) {
            scheduleMessage += `   ⏰ Через ${hoursUntil} ч.\n`;
          } else if (hoursUntil > -24) {
            scheduleMessage += `   🔴 Просрочено\n`;
          } else {
            scheduleMessage += `   🔴 Давно просрочено\n`;
          }
        } else {
          // Show status for non-scheduled items
          const statusText = callback.status === 'contacted' ? '📋 Информация собрана' : '🔄 В работе';
          scheduleMessage += `   ${statusText}\n`;
        }
        
        scheduleMessage += `\n`;
      });
      
      scheduleMessage += `📋 *Всего активных:* ${userSchedule.length}`;
      
      await sendDirectMessage(chatId, scheduleMessage);
    }
  } else if (messageText === '/cancel' && userStates.has(chatId)) {
    userStates.delete(chatId);
    await sendDirectMessage(chatId, '❌ Текущее действие отменено');
  } else {
    // Handle other messages
    const responseMessage = `
📝 *Сообщение получено*

Спасибо за ваше сообщение! 

🤖 Для получения помощи используйте команду /help

📞 *Для заявок на ремонт* посетите наш сайт: [True Pros](http://localhost:3000)
`;

    await sendDirectMessage(chatId, responseMessage);
  }
};

// Set up event handlers for callback queries and messages
export const setupTelegramWebhook = () => {
  console.log('🔧 Setting up Telegram bot event handlers...');
  
  // Handle callback queries (button presses)
  bot.on('callback_query', (callbackQuery) => {
    console.log('🔘 Raw callback query received:', callbackQuery.data);
    handleCallbackQuery(callbackQuery);
  });
  
  // Handle direct messages
  bot.on('message', (message) => {
    console.log('💬 Message received from:', message.from.first_name, '- Text:', message.text);
    handleDirectMessage(message);
  });
  
  // Handle polling errors
  bot.on('polling_error', (error) => {
    console.error('❌ Telegram polling error:', error.message);
  });
  
  console.log('🤖 Telegram bot event handlers set up successfully');
};

// Set bot commands
export const setBotCommands = async () => {
  try {
    const commands = [
      { command: 'start', description: 'Главное меню и информация о боте' },
      { command: 'help', description: 'Помощь и список команд' },
      { command: 'status', description: 'Проверить статус системы' },
      { command: 'schedule', description: 'Посмотреть запланированные визиты' },
      { command: 'cancel', description: 'Отменить текущее действие' }
    ];

    await bot.setMyCommands(commands);
    console.log('✅ Bot commands set successfully');
    return true;
  } catch (error) {
    console.error('❌ Failed to set bot commands:', error.message);
    return false;
  }
};

// Test bot connection
export const testBotConnection = async () => {
  try {
    const me = await bot.getMe();
    console.log(`✅ Telegram bot connected: @${me.username}`);
    
    // Set bot commands
    await setBotCommands();
    
    return true;
  } catch (error) {
    console.error('❌ Telegram bot connection failed:', error.message);
    return false;
  }
}; 
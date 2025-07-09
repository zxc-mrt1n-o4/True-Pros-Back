import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const workersGroupId = process.env.TELEGRAM_WORKERS_GROUP_ID;
const workersTopicId = process.env.TELEGRAM_WORKERS_TOPIC_ID;

if (!token) {
  throw new Error('TELEGRAM_BOT_TOKEN is required');
}

// Create bot instance WITHOUT polling for testing
export const bot = new TelegramBot(token, { polling: false });

// Russian text templates
const messages = {
  newCallback: (data) => `
🔔 *Новая заявка на обратный звонок*

👤 *Имя:* ${data.name}
📞 *Телефон:* ${data.phone}
🔧 *Услуга:* ${data.service_type || 'Не указана'}
🕐 *Время:* ${new Date(data.created_at).toLocaleString('ru-RU')}
🆔 *ID заявки:* \`${data.id}\`

📋 *Статус:* ⏳ Ожидает
`
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

// Send new callback notification (simplified - no buttons for now)
export const notifyNewCallback = async (callbackData) => {
  const message = messages.newCallback(callbackData);
  
  // Send simple message without buttons for testing
  const sentMessage = await sendToWorkersGroup(message);
  
  return sentMessage ? true : false;
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

console.log('🤖 Simple Telegram bot (no polling) initialized'); 
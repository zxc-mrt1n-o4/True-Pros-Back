#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 Setting up True Pros Backend...\n');

// Check if .env exists
const envPath = path.join(__dirname, '.env');
const envExamplePath = path.join(__dirname, '.env.example');

if (!fs.existsSync(envPath)) {
  if (fs.existsSync(envExamplePath)) {
    fs.copyFileSync(envExamplePath, envPath);
    console.log('✅ Created .env file from .env.example');
    console.log('⚠️  Please edit .env file with your actual configuration values\n');
  } else {
    console.log('❌ .env.example file not found');
  }
} else {
  console.log('✅ .env file already exists\n');
}

// Create directories if they don't exist
const directories = [
  'src/config',
  'src/services',
  'src/routes'
];

directories.forEach(dir => {
  const dirPath = path.join(__dirname, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`✅ Created directory: ${dir}`);
  }
});

console.log('\n📋 Next steps:');
console.log('1. Edit .env file with your Supabase and Telegram bot credentials');
console.log('2. Run: npm install');
console.log('3. Set up your Supabase database table (see README.md)');
console.log('4. Start the server: npm run dev');
console.log('\n📖 For detailed setup instructions, see backend/README.md');
console.log('🔗 For Supabase setup, see BACKEND_SETUP.md in the root directory'); 
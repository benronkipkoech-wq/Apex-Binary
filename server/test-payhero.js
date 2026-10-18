/**
 * APEX BINARY — PAYHERO INTEGRATION DIAGNOSTIC TEST
 * Run: node server/test-payhero.js
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  isPayHeroConfigured,
  getAuthHeader,
  getPaymentChannels,
  formatMpesaPhone,
} from './services/payheroService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

console.log('======================================================');
console.log('   APEX BINARY — PAYHERO KENYA INTEGRATION CHECK');
console.log('======================================================\n');

const username = (process.env.PAYHERO_API_USERNAME || '').trim();
const password = (process.env.PAYHERO_API_PASSWORD || '').trim();
const apiKey = (process.env.PAYHERO_API_KEY || '').trim();
const channelId = (process.env.PAYHERO_CHANNEL_ID || '').trim();
const callbackUrl = (process.env.PAYHERO_CALLBACK_URL || '').trim();
const apiUrl = process.env.PAYHERO_API_URL || 'https://backend.payhero.co.ke/api/v2';

console.log('1. ENVIRONMENT CONFIGURATION:');
console.log(`   - PAYHERO_API_URL:      ${apiUrl}`);
console.log(`   - PAYHERO_API_USERNAME: ${username ? username : '⚠️ (Not set)'}`);
console.log(`   - PAYHERO_API_PASSWORD: ${password ? '********' : '⚠️ (Not set)'}`);
console.log(`   - PAYHERO_API_KEY:      ${apiKey ? (apiKey.substring(0, 10) + '...') : '⚠️ (Not set)'}`);
console.log(`   - PAYHERO_CHANNEL_ID:   ${channelId ? channelId : '⚠️ (Not set)'}`);
console.log(`   - PAYHERO_CALLBACK_URL: ${callbackUrl ? callbackUrl : '⚠️ (Not set)'}`);

const isConfigured = isPayHeroConfigured();
console.log(`\n   Configured Status: ${isConfigured ? '✅ READY FOR LIVE' : '🟡 INCOMPLETE (Fallback Simulator active)'}`);

if (!isConfigured) {
  console.log('\n------------------------------------------------------');
  console.log('👉 HOW TO COMPLETE YOUR PAYHERO CONFIGURATION:');
  console.log('   1. Sign up / Log in to https://payhero.co.ke');
  console.log('   2. Navigate to Settings -> API Keys / Credentials');
  console.log('   3. Set PAYHERO_API_USERNAME & PAYHERO_API_PASSWORD in .env');
  console.log('      (or set PAYHERO_API_KEY)');
  console.log('   4. Go to Payment Channels on PayHero and copy your Channel ID');
  console.log('   5. Set PAYHERO_CHANNEL_ID in .env');
  console.log('   6. Set PAYHERO_CALLBACK_URL to your public domain:');
  console.log('      e.g. https://your-domain.onrender.com/api/wallet/deposit/callback');
  console.log('------------------------------------------------------\n');
} else {
  console.log('\n2. TESTING CREDENTIALS WITH PAYHERO API:');
  try {
    const authHeader = getAuthHeader();
    console.log(`   - Auth Header format: ${authHeader ? authHeader.split(' ')[0] + ' [encoded]' : 'Missing'}`);
    console.log('   - Fetching registered payment channels from PayHero...');

    const channels = await getPaymentChannels();
    console.log('   ✅ Successfully connected to PayHero API!');
    console.log('   - Response:', JSON.stringify(channels, null, 2));

    if (Array.isArray(channels)) {
      const match = channels.find((c) => String(c.id || c.channel_id) === channelId);
      if (match) {
        console.log(`\n   ✅ Channel ID ${channelId} verified against PayHero registered channels!`);
      } else {
        console.log(`\n   ⚠️ Notice: Channel ID ${channelId} was not found in the returned channel list.`);
        console.log('   Available channel IDs:', channels.map((c) => `${c.id} (${c.name || c.channel_name || 'Channel'})`).join(', '));
      }
    }
  } catch (err) {
    console.log(`   ❌ PayHero API call error: ${err.message}`);
    console.log('   Please check your username, password, or API key.');
  }
}

console.log('\n3. SAFARICOM PHONE NUMBER FORMAT TEST:');
const samplePhones = ['0712345678', '0112345678', '+254712345678', '712345678'];
samplePhones.forEach((p) => {
  console.log(`   - "${p}" -> "${formatMpesaPhone(p)}"`);
});

console.log('\n======================================================');

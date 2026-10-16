/**
 * APEX BINARY — PAYHERO KENYA PAYMENT SERVICE
 * Integration for automated Safaricom M-Pesa STK Push deposits & disbursements
 * Docs: https://docs.payhero.co.ke
 */

const PAYHERO_API_URL = process.env.PAYHERO_API_URL || 'https://backend.payhero.co.ke/api/v2';

/**
 * Format Safaricom phone numbers to 07XXXXXXXX or 2547XXXXXXXX
 */
export function formatMpesaPhone(phone) {
  if (!phone) return '';
  const digits = phone.toString().replace(/\D/g, '');
  if (digits.startsWith('254') && digits.length === 12) {
    return digits;
  }
  if (digits.startsWith('0') && digits.length === 10) {
    return '254' + digits.substring(1);
  }
  if (digits.length === 9) {
    return '254' + digits;
  }
  return digits;
}

/**
 * Get Basic Auth Header for PayHero API
 */
function getAuthHeader() {
  const apiKey = process.env.PAYHERO_API_KEY;
  const username = process.env.PAYHERO_API_USERNAME;
  const password = process.env.PAYHERO_API_PASSWORD;

  if (apiKey) {
    // If user provided raw Basic token or API key
    if (apiKey.startsWith('Basic ')) return apiKey;
    if (apiKey.includes(':')) {
      return `Basic ${Buffer.from(apiKey).toString('base64')}`;
    }
    return `Basic ${apiKey}`;
  }

  if (username && password) {
    return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  }

  return null;
}

/**
 * Check if PayHero Live credentials are configured in environment
 */
export function isPayHeroConfigured() {
  const auth = getAuthHeader();
  const channelId = process.env.PAYHERO_CHANNEL_ID;
  return Boolean(auth && channelId);
}

/**
 * Initiate an M-Pesa STK Push via PayHero
 * @param {Object} params
 * @param {number} params.amount
 * @param {string} params.phone
 * @param {string} params.reference
 * @param {string} params.callbackUrl
 */
export async function initiateStkPush({ amount, phone, reference, callbackUrl }) {
  const authHeader = getAuthHeader();
  const channelId = process.env.PAYHERO_CHANNEL_ID;

  if (!authHeader || !channelId) {
    throw new Error('PayHero is not fully configured (missing PAYHERO_API_KEY or PAYHERO_CHANNEL_ID)');
  }

  const formattedPhone = formatMpesaPhone(phone);
  const cbUrl = callbackUrl || process.env.PAYHERO_CALLBACK_URL;

  const payload = {
    amount: Math.round(amount),
    phone_number: formattedPhone,
    channel_id: parseInt(channelId) || channelId,
    provider: 'm-pesa',
    external_reference: reference,
    callback_url: cbUrl,
  };

  const response = await fetch(`${PAYHERO_API_URL}/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data.message || data.error || `PayHero HTTP ${response.status}`;
    throw new Error(`PayHero STK Push failed: ${errorMsg}`);
  }

  return {
    success: true,
    data,
    reference,
    phone: formattedPhone,
  };
}

export default {
  initiateStkPush,
  isPayHeroConfigured,
  formatMpesaPhone,
};

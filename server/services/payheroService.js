/**
 * APEX BINARY — PAYHERO KENYA PAYMENT SERVICE
 * Integration for automated Safaricom M-Pesa STK Push deposits & disbursements
 * Docs: https://docs.payhero.co.ke
 */

const getApiBaseUrl = () => {
  const url = process.env.PAYHERO_API_URL || 'https://backend.payhero.co.ke/api/v2';
  return url.replace(/\/+$/, '');
};

/**
 * Format Safaricom phone numbers to 2547XXXXXXXX or 2541XXXXXXXX
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
export function getAuthHeader() {
  const username = (process.env.PAYHERO_API_USERNAME || '').trim();
  const password = (process.env.PAYHERO_API_PASSWORD || '').trim();
  const apiKey = (process.env.PAYHERO_API_KEY || '').trim();

  if (username && password) {
    return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  }

  if (apiKey) {
    if (apiKey.startsWith('Basic ') || apiKey.startsWith('Bearer ')) {
      return apiKey;
    }
    if (apiKey.includes(':')) {
      return `Basic ${Buffer.from(apiKey).toString('base64')}`;
    }
    return `Basic ${apiKey}`;
  }

  return null;
}

/**
 * Check if PayHero credentials are configured in environment
 */
export function isPayHeroConfigured() {
  const auth = getAuthHeader();
  const channelId = (process.env.PAYHERO_CHANNEL_ID || '').trim();
  return Boolean(auth && channelId);
}

/**
 * Query available payment channels from PayHero
 * Useful for discovering your registered Channel ID (Paybill / Till)
 */
export async function getPaymentChannels() {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    throw new Error('PayHero credentials not configured in environment');
  }

  const baseUrl = getApiBaseUrl();
  const response = await fetch(`${baseUrl}/payment_channels`, {
    method: 'GET',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorMsg = data.message || data.error || `HTTP ${response.status}`;
    throw new Error(`Failed to fetch PayHero channels: ${errorMsg}`);
  }
  return data;
}

/**
 * Check status of a transaction on PayHero
 */
export async function getTransactionStatus(reference) {
  const authHeader = getAuthHeader();
  if (!authHeader || !reference) return null;

  const baseUrl = getApiBaseUrl();
  try {
    const url = `${baseUrl}/transactions?reference=${encodeURIComponent(reference)}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      return await response.json().catch(() => null);
    }
  } catch (err) {
    console.warn('[PayHero Status Query]', err.message);
  }
  return null;
}

/**
 * Initiate an M-Pesa STK Push via PayHero
 * @param {Object} params
 * @param {number} params.amount
 * @param {string} params.phone
 * @param {string} params.reference
 * @param {string} [params.callbackUrl]
 */
export async function initiateStkPush({ amount, phone, reference, callbackUrl }) {
  const authHeader = getAuthHeader();
  const channelId = (process.env.PAYHERO_CHANNEL_ID || '').trim();

  if (!authHeader || !channelId) {
    throw new Error('PayHero is not fully configured (missing PAYHERO_API_USERNAME/PASSWORD or PAYHERO_API_KEY, and PAYHERO_CHANNEL_ID)');
  }

  const formattedPhone = formatMpesaPhone(phone);
  const cbUrl = callbackUrl || process.env.PAYHERO_CALLBACK_URL;
  const baseUrl = getApiBaseUrl();

  const payload = {
    amount: Math.round(amount),
    phone_number: formattedPhone,
    channel_id: isNaN(Number(channelId)) ? channelId : Number(channelId),
    provider: 'm-pesa',
    external_reference: reference,
  };

  if (cbUrl) {
    payload.callback_url = cbUrl;
  }

  // Official v2 primary endpoint is /payments/initiate-stk-push, with /payments as fallback
  let endpoint = `${baseUrl}/payments/initiate-stk-push`;
  let response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader,
    },
    body: JSON.stringify(payload),
  });

  if (response.status === 404) {
    // Fallback to /payments
    endpoint = `${baseUrl}/payments`;
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body: JSON.stringify(payload),
    });
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.success === false || data.status === 'Failed') {
    const errorMsg = data.message || data.error || data.response_description || `PayHero HTTP ${response.status}`;
    throw new Error(`PayHero STK Push failed: ${errorMsg}`);
  }

  return {
    success: true,
    data,
    reference,
    checkoutRequestId: data.checkout_request_id || data.reference || reference,
    phone: formattedPhone,
  };
}

export default {
  initiateStkPush,
  isPayHeroConfigured,
  formatMpesaPhone,
  getPaymentChannels,
  getTransactionStatus,
  getAuthHeader,
};

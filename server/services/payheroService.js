/**
 * APEX BINARY — PAYHERO KENYA PAYMENT SERVICE
 * Integration for automated Safaricom M-Pesa STK Push deposits & disbursements
 * Docs: https://docs.payhero.co.ke
 */

let cachedChannelId = null;

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
 * Get credentials from environment with alias support
 */
export function getPayHeroCredentials() {
  const username = (
    process.env.PAYHERO_API_USERNAME ||
    process.env.PAYHERO_USERNAME ||
    process.env.PAYHERO_USER ||
    process.env.PAYHERO_API_USER ||
    ''
  ).trim();
  const password = (
    process.env.PAYHERO_API_PASSWORD ||
    process.env.PAYHERO_PASSWORD ||
    process.env.PAYHERO_PASS ||
    process.env.PAYHERO_API_PASS ||
    ''
  ).trim();
  const apiKey = (
    process.env.PAYHERO_API_KEY ||
    process.env.PAYHERO_APIKEY ||
    process.env.PAYHERO_KEY ||
    process.env.PAYHERO_API_TOKEN ||
    process.env.PAYHERO_TOKEN ||
    process.env.PAYHERO_SECRET ||
    process.env.PAYHERO_AUTH ||
    process.env.PAYHERO_AUTHORIZATION ||
    process.env.PAYHERO_BASIC ||
    process.env.API_KEY ||
    ''
  ).trim();

  const channelId = (
    process.env.PAYHERO_CHANNEL_ID ||
    process.env.PAYHERO_CHANNEL ||
    process.env.CHANNEL_ID ||
    process.env.PAYHERO_PAYBILL ||
    ''
  ).trim();

  return { username, password, apiKey, channelId };
}

/**
 * Get Basic / Bearer Auth Header for PayHero API
 */
export function getAuthHeader() {
  const { username, password, apiKey } = getPayHeroCredentials();

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
 * Check if PayHero is configured
 */
export function isPayHeroConfigured() {
  const auth = getAuthHeader();
  return Boolean(auth);
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
 */
export async function initiateStkPush({ amount, phone, reference, callbackUrl }) {
  const authHeader = getAuthHeader();
  const { channelId, apiKey } = getPayHeroCredentials();

  if (!authHeader) {
    throw new Error('PayHero credentials missing (set PAYHERO_API_KEY or PAYHERO_API_USERNAME & PAYHERO_API_PASSWORD)');
  }

  // Resolve channel ID: use env or auto-discover from PayHero portal
  let activeChannel = channelId || cachedChannelId;
  if (!activeChannel) {
    try {
      const channelsRes = await getPaymentChannels();
      const list = Array.isArray(channelsRes)
        ? channelsRes
        : (channelsRes.data || channelsRes.channels || []);
      if (list && list.length > 0) {
        activeChannel = list[0].id || list[0].channel_id;
        cachedChannelId = activeChannel;
        console.log(`[PayHero Auto-Discovered Channel ID]: ${activeChannel}`);
      }
    } catch (err) {
      console.warn('[PayHero Channel Discovery Warning]:', err.message);
    }
  }

  if (!activeChannel) {
    throw new Error('PayHero Channel ID is required. Please set PAYHERO_CHANNEL_ID in your environment or verify channels on payhero.co.ke');
  }

  const formattedPhone = formatMpesaPhone(phone);
  let cbUrl = callbackUrl || process.env.PAYHERO_CALLBACK_URL;
  if (!cbUrl || cbUrl.includes('your-domain.onrender.com')) {
    cbUrl = 'https://www.myapexbinary.site/api/wallet/deposit/callback';
  }
  const baseUrl = getApiBaseUrl();

  const payload = {
    amount: Math.round(amount),
    phone_number: formattedPhone,
    channel_id: isNaN(Number(activeChannel)) ? activeChannel : Number(activeChannel),
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

  // If 401 Unauthorized and using raw API Key, retry with Bearer format
  if (response.status === 401 && apiKey && !authHeader.startsWith('Bearer ')) {
    const bearerHeader = `Bearer ${apiKey}`;
    const retryAuthRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': bearerHeader,
      },
      body: JSON.stringify(payload),
    });
    if (retryAuthRes.ok) {
      response = retryAuthRes;
    }
  }

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
    channelId: activeChannel,
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
  getPayHeroCredentials,
};

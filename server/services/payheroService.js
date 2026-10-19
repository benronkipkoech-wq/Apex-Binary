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

// Startup diagnostic — visible in Render logs immediately
const _apiKey = (process.env.PAYHERO_API_KEY || process.env.PAYHERO_API_TOKEN || process.env.PAYHERO_TOKEN || '').trim();
const _username = (process.env.PAYHERO_API_USERNAME || process.env.PAYHERO_USERNAME || '').trim();
const _channelId = (process.env.PAYHERO_CHANNEL_ID || process.env.PAYHERO_CHANNEL || process.env.CHANNEL_ID || '').trim();
console.log('[PayHero] API Key set:', !!_apiKey, _apiKey ? '| prefix: ' + _apiKey.slice(0, 8) + '...' : '| MISSING');
console.log('[PayHero] Username set:', !!_username, _username ? '| ' + _username.slice(0, 4) + '...' : '| MISSING');
console.log('[PayHero] Channel ID:', _channelId || 'MISSING (will auto-discover)');
console.log('[PayHero] Configured (will use live STK):', !!(_apiKey || (_username && (process.env.PAYHERO_API_PASSWORD || '').trim())));


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
 * Check status of a transaction on PayHero.
 * Tries multiple endpoints and normalizes the response.
 */
export async function getTransactionStatus(reference) {
  const authHeader = getAuthHeader();
  if (!authHeader || !reference) return null;

  const baseUrl = getApiBaseUrl();
  const headers = { 'Authorization': authHeader, 'Content-Type': 'application/json' };

  // Try multiple PayHero status endpoints
  const endpoints = [
    `${baseUrl}/transactions?external_reference=${encodeURIComponent(reference)}`,
    `${baseUrl}/transactions?reference=${encodeURIComponent(reference)}`,
    `${baseUrl}/payments?external_reference=${encodeURIComponent(reference)}`,
    `${baseUrl}/payments/${encodeURIComponent(reference)}`,
  ];

  for (const url of endpoints) {
    try {
      const response = await fetch(url, { method: 'GET', headers });
      if (!response.ok) continue;

      const raw = await response.json().catch(() => null);
      if (!raw) continue;

      // Normalize: PayHero can wrap in data[], response, or direct object
      const record =
        (Array.isArray(raw.data) && raw.data[0]) ||
        (Array.isArray(raw) && raw[0]) ||
        raw.data ||
        raw.response ||
        raw.transaction ||
        raw;

      if (!record || typeof record !== 'object') continue;

      const rawStatus = (
        record.status ||
        record.payment_status ||
        record.transaction_status ||
        ''
      ).toString().toLowerCase();

      const isSuccess =
        rawStatus === 'success' ||
        rawStatus === 'successful' ||
        rawStatus === 'completed' ||
        rawStatus === 'paid' ||
        record.success === true ||
        String(record.status_code) === '200' ||
        String(record.response_code) === '0' ||
        String(record.result_code) === '0';

      const isFailed =
        rawStatus === 'failed' ||
        rawStatus === 'cancelled' ||
        rawStatus === 'rejected' ||
        rawStatus === 'timeout';

      if (isSuccess || isFailed) {
        return {
          status: isSuccess ? 'successful' : 'failed',
          success: isSuccess,
          mpesa_receipt:
            record.mpesa_receipt ||
            record.mpesa_reference ||
            record.receipt_number ||
            record.transaction_id ||
            null,
          amount: record.amount,
          message: record.message || record.description || null,
          _raw: record,
        };
      }
    } catch (err) {
      console.warn('[PayHero Status Query]', url, err.message);
    }
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

  // PayHero v2: try initiate-stk-push first, then /payments as fallback
  const endpoint1 = `${baseUrl}/payments/initiate-stk-push`;
  const endpoint2 = `${baseUrl}/payments`;

  console.log(`[PayHero STK Push] Initiating | phone=${formattedPhone} amount=${Math.round(amount)} channel=${activeChannel}`);
  console.log(`[PayHero STK Push] Auth: ${authHeader.split(' ')[0]} | Payload:`, JSON.stringify(payload));

  const makeRequest = async (url, authHdr) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': authHdr },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    console.log(`[PayHero STK Push] ${url} → HTTP ${res.status}:`, text.substring(0, 600));
    let parsed = {};
    try { parsed = JSON.parse(text); } catch (_) { parsed = { raw: text }; }
    return { res, parsed };
  };

  let { res: response, parsed: data } = await makeRequest(endpoint1, authHeader);

  // 401: retry with Bearer token
  if (response.status === 401 && apiKey && !authHeader.startsWith('Bearer ')) {
    console.log('[PayHero STK Push] 401 with Basic → retrying with Bearer...');
    const bearerTry = await makeRequest(endpoint1, `Bearer ${apiKey}`);
    if (bearerTry.res.ok) { response = bearerTry.res; data = bearerTry.parsed; }
  }

  // 404: fallback to /payments endpoint
  if (response.status === 404) {
    console.log('[PayHero STK Push] 404 on initiate-stk-push → falling back to /payments...');
    const fallback = await makeRequest(endpoint2, authHeader);
    response = fallback.res; data = fallback.parsed;
  }

  if (!response.ok || data.success === false || data.status === 'Failed') {
    const errorMsg = data.message || data.error || data.response_description || `PayHero HTTP ${response.status}`;
    console.error(`[PayHero STK Push] FAILED: ${errorMsg}`, JSON.stringify(data));
    throw new Error(`PayHero STK Push failed: ${errorMsg}`);
  }

  console.log('[PayHero STK Push] SUCCESS:', JSON.stringify(data));
  return {
    success: true,
    data,
    reference,
    channelId: activeChannel,
    checkoutRequestId: data.checkout_request_id || data.reference || data.CheckoutRequestID || reference,
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

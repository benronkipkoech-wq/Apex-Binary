/**
 * APEX BINARY — CLIENT API SERVICE
 * Connects frontend client to Express / MongoDB backend
 */

const API_ROOT = '/api';

class ApiService {
  constructor() {
    this.token = localStorage.getItem('apex_user_token') || null;
  }

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('apex_user_token', token);
    } else {
      localStorage.removeItem('apex_user_token');
    }
  }

  getToken() {
    return this.token;
  }

  async request(endpoint, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const res = await fetch(`${API_ROOT}${endpoint}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : null,
      });

      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      return { ok: false, status: 0, data: { message: err.message } };
    }
  }

  // Auth endpoints
  async register({ email, phone, password, fullName }) {
    const res = await this.request('/auth/register', 'POST', { email, phone, password, fullName });
    if (res.ok && res.data.token) {
      this.setToken(res.data.token);
    }
    return res;
  }

  async login(email, password) {
    const res = await this.request('/auth/login', 'POST', { email, password });
    if (res.ok && res.data.token) {
      this.setToken(res.data.token);
    }
    return res;
  }

  async getMe() {
    return this.request('/auth/me');
  }

  logout() {
    this.setToken(null);
  }

  // Trading endpoints
  async placeTrade({ asset, direction, amount, duration, accountType }) {
    return this.request('/trades/place', 'POST', {
      asset,
      direction,
      amount,
      duration,
      accountType,
    });
  }

  async getActiveTrades() {
    return this.request('/trades/active');
  }

  async getTradeHistory() {
    return this.request('/trades/history');
  }

  async tickPrice(symbol, price) {
    return this.request('/trades/price-tick', 'POST', { symbol, price });
  }

  // Wallet endpoints
  async depositMpesa(amount, phone) {
    return this.request('/wallet/deposit/stk-push', 'POST', { amount, phone });
  }

  async withdrawMpesa(amount, phone) {
    return this.request('/wallet/withdraw', 'POST', { amount, phone });
  }

  async getTransactions() {
    return this.request('/wallet/transactions');
  }
}

export const api = new ApiService();
export default api;

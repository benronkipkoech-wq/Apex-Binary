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
  async register({ email, phone, password, pin, fullName }) {
    const res = await this.request('/auth/register', 'POST', { email, phone, password, pin, fullName });
    if (res.ok && res.data.token) {
      this.setToken(res.data.token);
    }
    return res;
  }

  async login(identifier, secret) {
    const isEmail = identifier && identifier.includes('@');
    const payload = isEmail
      ? { email: identifier, password: secret }
      : { phone: identifier, pin: secret };

    const res = await this.request('/auth/login', 'POST', payload);
    if (res.ok && res.data.token) {
      this.setToken(res.data.token);
    }
    return res;
  }

  async getMe() {
    return this.request('/auth/me');
  }

  async updateProfile({ fullName, email }) {
    return this.request('/auth/profile', 'PUT', { fullName, email });
  }

  async syncUserData(data) {
    return this.request('/auth/sync-data', 'POST', data);
  }

  async joinTournament(tournamentId) {
    return this.request('/auth/tournaments/join', 'POST', { tournamentId });
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

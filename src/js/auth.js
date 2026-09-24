// Authentication & Security Engine for Apex Binary
// Client-side auth with PIN, session management, 2FA, and login history

import { security } from './security.js';

const AUTH_STORAGE_KEY = 'tycoon_auth';
const SESSION_KEY = 'tycoon_session';
const LOGIN_HISTORY_KEY = 'tycoon_login_history';
const MAX_LOGIN_ATTEMPTS = 5;
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const LOCK_DURATION_MS = 5 * 60 * 1000; // 5 minute lockout

class AuthEngine {
  constructor() {
    this.currentUser = null;
    this.isAuthenticated = false;
    this.sessionTimer = null;
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, data) {
    for (const listener of this.listeners) {
      try { listener(event, data); } catch (e) { console.error(e); }
    }
  }

  // --- Registration ---
  register({ fullName, phone, email, pin, confirmPin }) {
    if (!fullName || fullName.trim().length < 2) {
      return { success: false, message: 'Please enter your full name.' };
    }
    if (!phone || phone.replace(/\D/g, '').length < 9) {
      return { success: false, message: 'Please enter a valid Safaricom phone number.' };
    }
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return { success: false, message: 'PIN must be exactly 4 digits.' };
    }
    if (pin !== confirmPin) {
      return { success: false, message: 'PINs do not match.' };
    }

    // Sanitize user inputs
    const cleanName = security.sanitizeInput(fullName.trim());
    const cleanEmail = security.sanitizeInput((email || '').trim().toLowerCase());
    const normalizedPhone = this.normalizePhone(phone);
    
    const existingUsers = this.getAllUsers();
    if (existingUsers.find(u => u.phone === normalizedPhone)) {
      return { success: false, message: 'This phone number is already registered.' };
    }

    const user = {
      id: 'usr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      fullName: cleanName,
      phone: normalizedPhone,
      email: cleanEmail,
      pinHash: this.hashPin(pin),
      createdAt: new Date().toISOString(),
      twoFactorEnabled: false,
      twoFactorSecret: null,
      avatar: this.generateAvatar(cleanName),
      loginAttempts: 0,
      lockedUntil: null,
      lastLogin: null,
      securityLevel: 'standard' // 'standard' | 'enhanced' | 'maximum'
    };

    existingUsers.push(user);
    security.setItem(AUTH_STORAGE_KEY, existingUsers);

    // Auto-login after registration
    this.createSession(user);
    this.addLoginHistory(user, 'registration');

    return { success: true, user: this.sanitizeUser(user) };
  }

  // --- Login ---
  login(phone, pin) {
    const normalizedPhone = this.normalizePhone(phone);
    const users = this.getAllUsers();
    const user = users.find(u => u.phone === normalizedPhone);

    if (!user) {
      return { success: false, message: 'No account found with this phone number.' };
    }

    // Check if locked
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      const remaining = Math.ceil((new Date(user.lockedUntil) - new Date()) / 1000);
      return { success: false, message: `Account locked. Try again in ${remaining}s.`, locked: true };
    }

    if (this.hashPin(pin) !== user.pinHash) {
      user.loginAttempts = (user.loginAttempts || 0) + 1;

      if (user.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
        user.lockedUntil = new Date(Date.now() + LOCK_DURATION_MS).toISOString();
        user.loginAttempts = 0;
        this.saveUsers(users);
        this.addLoginHistory(user, 'lockout');
        return { success: false, message: `Too many failed attempts. Account locked for 5 minutes.`, locked: true };
      }

      this.saveUsers(users);
      const remaining = MAX_LOGIN_ATTEMPTS - user.loginAttempts;
      return { success: false, message: `Incorrect PIN. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.` };
    }

    // Successful login
    user.loginAttempts = 0;
    user.lockedUntil = null;
    user.lastLogin = new Date().toISOString();
    this.saveUsers(users);

    if (user.twoFactorEnabled) {
      // Generate OTP and require verification
      const otp = this.generateOTP();
      user._pendingOtp = otp;
      this._pendingUser = user;
      return { success: true, requires2FA: true, otpHint: otp.slice(0, 2) + '****' };
    }

    this.createSession(user);
    this.addLoginHistory(user, 'login');
    return { success: true, user: this.sanitizeUser(user) };
  }

  // --- 2FA Verification ---
  verify2FA(code) {
    if (!this._pendingUser) {
      return { success: false, message: 'No pending 2FA verification.' };
    }
    if (code === this._pendingUser._pendingOtp) {
      const user = this._pendingUser;
      delete user._pendingOtp;
      this._pendingUser = null;
      this.createSession(user);
      this.addLoginHistory(user, 'login_2fa');
      return { success: true, user: this.sanitizeUser(user) };
    }
    return { success: false, message: 'Invalid verification code.' };
  }

  // --- Session Management ---
  createSession(user) {
    this.currentUser = user;
    this.isAuthenticated = true;

    const session = {
      userId: user.id,
      startedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + SESSION_TIMEOUT_MS).toISOString(),
      userAgent: navigator.userAgent,
      ip: '41.89.xxx.xxx' // Simulated Kenyan IP
    };

    security.setItem(SESSION_KEY, session);
    this.startSessionTimer();
    this.notify('authenticated', { user: this.sanitizeUser(user) });
  }

  startSessionTimer() {
    if (this.sessionTimer) clearInterval(this.sessionTimer);
    this.sessionTimer = setInterval(() => {
      const session = this.getSession();
      if (!session || new Date(session.expiresAt) <= new Date()) {
        this.logout('session_expired');
      }
    }, 30000); // Check every 30s
  }

  extendSession() {
    const session = this.getSession();
    if (session) {
      session.expiresAt = new Date(Date.now() + SESSION_TIMEOUT_MS).toISOString();
      security.setItem(SESSION_KEY, session);
    }
  }

  getSession() {
    return security.getItem(SESSION_KEY);
  }

  checkSession() {
    const session = this.getSession();
    if (!session) return false;

    if (new Date(session.expiresAt) <= new Date()) {
      this.logout('session_expired');
      return false;
    }

    const users = this.getAllUsers();
    const user = users.find(u => u.id === session.userId);
    if (!user) {
      this.logout('user_not_found');
      return false;
    }

    this.currentUser = user;
    this.isAuthenticated = true;
    this.startSessionTimer();
    this.notify('session_restored', { user: this.sanitizeUser(user) });
    return true;
  }

  logout(reason = 'manual') {
    if (this.sessionTimer) clearInterval(this.sessionTimer);
    if (this.currentUser) {
      this.addLoginHistory(this.currentUser, 'logout');
    }
    this.currentUser = null;
    this.isAuthenticated = false;
    security.removeItem(SESSION_KEY);
    this.notify('logged_out', { reason });
  }

  // --- Security Settings ---
  changePin(currentPin, newPin, confirmNewPin) {
    if (!this.currentUser) return { success: false, message: 'Not authenticated.' };

    if (this.hashPin(currentPin) !== this.currentUser.pinHash) {
      return { success: false, message: 'Current PIN is incorrect.' };
    }
    if (!newPin || newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
      return { success: false, message: 'New PIN must be exactly 4 digits.' };
    }
    if (newPin !== confirmNewPin) {
      return { success: false, message: 'New PINs do not match.' };
    }
    if (newPin === currentPin) {
      return { success: false, message: 'New PIN must be different from current PIN.' };
    }

    const users = this.getAllUsers();
    const user = users.find(u => u.id === this.currentUser.id);
    if (user) {
      user.pinHash = this.hashPin(newPin);
      this.saveUsers(users);
      this.currentUser = user;
      this.addLoginHistory(user, 'pin_changed');
    }

    return { success: true, message: 'PIN changed successfully.' };
  }

  toggle2FA() {
    if (!this.currentUser) return { success: false };

    const users = this.getAllUsers();
    const user = users.find(u => u.id === this.currentUser.id);
    if (user) {
      user.twoFactorEnabled = !user.twoFactorEnabled;
      this.saveUsers(users);
      this.currentUser = user;
      this.addLoginHistory(user, user.twoFactorEnabled ? '2fa_enabled' : '2fa_disabled');
    }

    return { success: true, enabled: user.twoFactorEnabled };
  }

  setSecurityLevel(level) {
    if (!this.currentUser) return;
    const users = this.getAllUsers();
    const user = users.find(u => u.id === this.currentUser.id);
    if (user) {
      user.securityLevel = level;
      this.saveUsers(users);
      this.currentUser = user;
    }
  }

  // --- Login History ---
  addLoginHistory(user, action) {
    const history = this.getLoginHistory();
    history.unshift({
      userId: user.id,
      action,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      ip: '41.89.' + Math.floor(Math.random() * 255) + '.' + Math.floor(Math.random() * 255),
      location: ['Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Eldoret'][Math.floor(Math.random() * 5)] + ', Kenya'
    });

    // Keep last 50 entries
    if (history.length > 50) history.length = 50;
    security.setItem(LOGIN_HISTORY_KEY, history);
  }

  getLoginHistory() {
    return security.getItem(LOGIN_HISTORY_KEY) || [];
  }

  getUserLoginHistory() {
    if (!this.currentUser) return [];
    return this.getLoginHistory().filter(h => h.userId === this.currentUser.id);
  }

  // --- Helpers ---
  normalizePhone(phone) {
    let clean = phone.replace(/\D/g, '');
    if (clean.startsWith('254')) clean = '0' + clean.slice(3);
    if (clean.startsWith('7')) clean = '0' + clean;
    return clean;
  }

  hashPin(pin) {
    // Simple hash for demo (not cryptographically secure - use bcrypt in production)
    let hash = 0;
    const salt = 'tycoon_ke_2024_salt';
    const str = salt + pin + salt;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return 'h_' + Math.abs(hash).toString(36);
  }

  generateOTP() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  generateAvatar(name) {
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const colors = ['#00f59b', '#ff3366', '#ffb800', '#00d2ff', '#9b59b6', '#e67e22'];
    const color = colors[Math.abs(name.charCodeAt(0)) % colors.length];
    return { initials, color };
  }

  sanitizeUser(user) {
    return {
      id: user.id,
      fullName: user.fullName,
      phone: user.phone,
      email: user.email,
      avatar: user.avatar,
      twoFactorEnabled: user.twoFactorEnabled,
      securityLevel: user.securityLevel,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
    };
  }

  getAllUsers() {
    return security.getItem(AUTH_STORAGE_KEY) || [];
  }

  saveUsers(users) {
    security.setItem(AUTH_STORAGE_KEY, users);
  }

  getUser() {
    return this.currentUser ? this.sanitizeUser(this.currentUser) : null;
  }
}

export const auth = new AuthEngine();

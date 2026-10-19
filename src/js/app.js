// Main Application Controller for Apex Binary (Masterclass Edition with Drawing Tools & Tournaments)
import { sound } from './audio.js';
import { ASSETS, TIMEFRAMES, market } from './market.js';
import { wallet } from './wallet.js';
import { ChartEngine } from './chart.js';
import { TradingEngine } from './trading.js';
import { gamification } from './gamification.js';
import { wsFeed } from './websocket.js';
import { TradingBotsEngine } from './bots.js';
import { auth } from './auth.js';
import { api } from './api.js';

class App {
  constructor() {
    this.chart = null;
    this.trading = null;
    this.botsEngine = null;
    this.deferredPwaPrompt = null;
    this.patternsEnabled = true;
    this.selectedDuration = 30; // seconds
    this.stakeAmount = 1000;
    this.oneClickTrading = true;
    this.tickerIndex = 0;
  }

  init() {
    // 1. Initialize Engines
    this.trading = new TradingEngine(market);
    this.chart = new ChartEngine('main-chart-canvas', 'rsi-chart-canvas', market);
    this.botsEngine = new TradingBotsEngine(this.trading, market, sound);

    // Pass active trades to chart
    this.trading.subscribe(({ active, closed }) => {
      this.chart.setActiveTrades(active);
      this.updateTradesList();

      // Check if latest closed trade needs gamification sync
      if (closed.length > 0) {
        const latest = closed[0];
        if (!latest._gamified) {
          latest._gamified = true;
          gamification.recordTradeResult(latest, latest.status === 'won');
        }
      }
    });

    // 2. Setup Subscriptions
    market.subscribe((data) => this.handleMarketTick(data));
    wallet.subscribe((data) => this.handleWalletUpdate(data));
    gamification.subscribe((event, data) => this.handleGamificationEvent(event, data));
    this.botsEngine.subscribe((event, data) => this.handleBotsEvent(event, data));

    // Connect Real-World Binance WebSocket Feed
    wsFeed.connect();
    wsFeed.subscribe((event, data) => this.handleWebSocketEvent(event, data));

    // 3. Render Initial Components
    this.renderQuickAssetTabs();
    this.renderAllAssetsModal();
    this.renderCopyTraders();
    this.renderBotsList();
    this.renderTournaments();
    this.renderQuests();
    this.renderSignals();
    this.renderLeaderboard();
    this.renderMpesaLog();
    this.updateWalletUI();
    this.updateLevelBadgeUI();
    this.updateOrderDeskCalculations();
    this.updateSoundIcon();

    // 4. Attach Event Listeners & Services
    this.attachEventListeners();
    this.initAuth();
    this.initPWA();
    this.startServerClock();
    this.startCommunityTicker();
  }

  // Authentication Initialization
  initAuth() {
    this.attachAuthListeners();
    
    // Check existing session
    if (auth.checkSession()) {
      document.getElementById('auth-screen').classList.add('hidden');
      this.showToast(`Welcome back, ${auth.getUser().fullName}!`, 'success');
      this.updateSecurityPanelUI();
      this.toggleAuthState(true);
      wallet.syncBalance();
    } else {
      // Allow guest view instead of blocking immediately
      document.getElementById('auth-screen').classList.add('hidden');
      this.toggleAuthState(false);
    }

    auth.subscribe((event, data) => {
      if (event === 'authenticated' || event === 'session_restored') {
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('modal-2fa').classList.add('hidden');
        this.updateSecurityPanelUI();
        this.toggleAuthState(true);

        // Fetch latest user profile & balances from MongoDB
        api.getMe().then(res => {
          if (res.ok && res.data && res.data.success && res.data.user) {
            gamification.syncWithUser(res.data.user);
            this.updateLevelBadgeUI();
          }
        }).catch(() => {});

        wallet.syncBalance();
        this.renderTournaments();
        this.renderCopyTraders();
        this.renderBotsList();
      } else if (event === 'logged_out') {
        document.getElementById('security-panel')?.classList.add('hidden');
        document.getElementById('user-profile-dropdown')?.classList.add('hidden');
        document.getElementById('drawer-panel')?.classList.add('collapsed');
        this.toggleAuthState(false);
        this.renderTournaments();
        this.renderCopyTraders();
        this.renderBotsList();
        if (data && data.reason === 'session_expired') {
          document.getElementById('auth-screen')?.classList.remove('hidden');
          this.showAuthMessage('Session expired. Please sign in again.', 'error');
        } else {
          document.getElementById('auth-screen')?.classList.add('hidden');
        }
      }
    });
  }

  toggleAuthState(isAuthenticated) {
    const authGroup = document.getElementById('nav-auth-group');
    const guestGroup = document.getElementById('nav-guest-group');

    if (isAuthenticated) {
      document.body.classList.add('authenticated');
      if (authGroup) authGroup.classList.remove('hidden');
      if (guestGroup) guestGroup.classList.add('hidden');
    } else {
      document.body.classList.remove('authenticated');
      if (authGroup) authGroup.classList.add('hidden');
      if (guestGroup) guestGroup.classList.remove('hidden');
    }
  }

  updateSecurityPanelUI() {
    const user = auth.getUser();
    if (!user) return;
    
    const initials = user.avatar?.initials || (user.fullName ? user.fullName.slice(0, 2).toUpperCase() : 'AB');
    const color = user.avatar?.color || '#00f59b';
    const shortName = user.fullName ? user.fullName.split(' ')[0] : 'Trader';
    const phoneDisplay = user.phone ? `+254 ${user.phone.slice(-9)}` : 'N/A';

    // Top Navigation Avatar & Name
    const initialsEl = document.getElementById('nav-avatar-initials');
    const navNameEl = document.getElementById('nav-user-name');
    if (initialsEl) initialsEl.textContent = initials;
    if (navNameEl) navNameEl.textContent = shortName;

    // Dropdown Profile Header
    const dropdownAvatar = document.getElementById('dropdown-avatar');
    const dropdownName = document.getElementById('dropdown-user-name');
    const dropdownPhone = document.getElementById('dropdown-user-phone');
    if (dropdownAvatar) {
      dropdownAvatar.textContent = initials;
      dropdownAvatar.style.background = color;
    }
    if (dropdownName) dropdownName.textContent = user.fullName || 'Apex Trader';
    if (dropdownPhone) dropdownPhone.textContent = phoneDisplay;

    // Drawer Profile Header
    const drawerAvatar = document.getElementById('drawer-avatar');
    const drawerName = document.getElementById('drawer-user-name');
    const drawerPhone = document.getElementById('drawer-user-phone');
    if (drawerAvatar) {
      drawerAvatar.textContent = initials;
      drawerAvatar.style.background = color;
    }
    if (drawerName) drawerName.textContent = user.fullName || 'Apex Trader';
    if (drawerPhone) drawerPhone.textContent = phoneDisplay;

    // Security Center Panel
    const panelAvatarEl = document.getElementById('security-avatar');
    if (panelAvatarEl) {
      panelAvatarEl.textContent = initials;
      panelAvatarEl.style.background = color;
    }
    
    const nameEl = document.getElementById('security-profile-name');
    const phoneEl = document.getElementById('security-profile-phone');
    const sinceEl = document.getElementById('security-profile-since');
    if (nameEl) nameEl.textContent = user.fullName;
    if (phoneEl) {
      const p = user.phone || '';
      phoneEl.textContent = p.length >= 7 ? `${p.slice(0, 4)} *** ${p.slice(-3)}` : p;
    }
    if (sinceEl && user.createdAt) {
      sinceEl.textContent = `Member since ${new Date(user.createdAt).toLocaleString('default', { month: 'short', year: 'numeric' })}`;
    }

    const check2fa = document.getElementById('check-2fa');
    if (check2fa) check2fa.checked = !!user.twoFactorEnabled;

    // Security Level UI
    const levelFill = document.getElementById('security-level-fill');
    const labels = document.querySelectorAll('.sec-level-label');
    labels.forEach(l => l.classList.remove('active'));
    
    let w = '33%';
    if (user.securityLevel === 'enhanced') w = '66%';
    if (user.securityLevel === 'maximum') w = '100%';
    
    if (levelFill) levelFill.style.width = w;
    const activeLabel = document.querySelector(`.sec-level-label[data-level="${user.securityLevel}"]`);
    if (activeLabel) activeLabel.classList.add('active');

    // Render Login History
    const historyList = document.getElementById('login-history-list');
    if (historyList) {
      const history = auth.getUserLoginHistory();
      historyList.innerHTML = history.length === 0 ? 
        '<p class="auth-message">No login history available.</p>' : 
        history.map(h => `
          <div class="login-history-item">
            <span class="login-history-icon">${h.action.includes('error') || h.action === 'lockout' ? '⚠️' : '✅'}</span>
            <div class="login-history-info">
              <span class="login-history-action">${this.formatAuthAction(h.action)}</span>
              <span class="login-history-meta">${h.location} • ${h.ip}</span>
              <span class="login-history-time">${new Date(h.timestamp).toLocaleString()}</span>
            </div>
          </div>
        `).join('');
    }
  }

  formatAuthAction(action) {
    const map = {
      'login': 'Successful Login',
      'login_2fa': '2FA Login',
      'registration': 'Account Created',
      'logout': 'Signed Out',
      'lockout': 'Account Locked',
      'pin_changed': 'PIN Changed',
      'pin_reset': 'PIN Reset via Email',
      '2fa_enabled': '2FA Enabled',
      '2fa_disabled': '2FA Disabled'
    };
    return map[action] || action;
  }

  showAuthMessage(msg, type = 'error', formId = null) {
    const msgEl = document.getElementById('auth-message');
    if (!msgEl) return;
    
    if (this._authMsgTimeout) {
      clearTimeout(this._authMsgTimeout);
      this._authMsgTimeout = null;
    }

    if (!msg) {
      msgEl.textContent = '';
      msgEl.className = 'auth-message hidden';
      return;
    }
    
    msgEl.textContent = msg;
    msgEl.className = `auth-message ${type}`;
    msgEl.classList.remove('hidden');
    
    // Clear after 6 seconds
    this._authMsgTimeout = setTimeout(() => {
      msgEl.classList.add('hidden');
    }, 6000);
  }

  attachAuthListeners() {
    // Tab switching
    const loginTab = document.getElementById('auth-tab-login');
    const regTab = document.getElementById('auth-tab-register');
    const slider = document.getElementById('auth-tab-slider');
    const loginForm = document.getElementById('auth-login-form');
    const regForm = document.getElementById('auth-register-form');

    const switchAuthTab = (isLogin) => {
      const loginPhone = document.getElementById('login-phone');
      const regPhone = document.getElementById('reg-phone');

      if (isLogin) {
        loginTab.classList.add('active');
        regTab.classList.remove('active');
        slider.classList.remove('register');
        loginForm.classList.remove('hidden');
        regForm.classList.add('hidden');
        this.activeAuthKeypad = 'login';
        if (regPhone?.value && !loginPhone?.value) {
          loginPhone.value = regPhone.value;
        }
      } else {
        regTab.classList.add('active');
        loginTab.classList.remove('active');
        slider.classList.add('register');
        regForm.classList.remove('hidden');
        loginForm.classList.add('hidden');
        this.activeAuthKeypad = 'register';
        if (loginPhone?.value && !regPhone?.value) {
          regPhone.value = loginPhone.value;
        }
      }
      this.clearAuthPins();
      const authScreen = document.getElementById('auth-screen');
      if (authScreen) authScreen.scrollTop = 0;
      sound.playClick();
    };

    if (loginTab) loginTab.addEventListener('click', () => switchAuthTab(true));
    if (regTab) regTab.addEventListener('click', () => switchAuthTab(false));

    // Guest Nav Actions
    const btnNavLogin = document.getElementById('btn-nav-login');
    const btnNavRegister = document.getElementById('btn-nav-register');
    const btnCloseAuth = document.getElementById('btn-close-auth');
    const authScreen = document.getElementById('auth-screen');

    if (btnNavLogin) btnNavLogin.addEventListener('click', () => {
      authScreen.classList.remove('hidden');
      switchAuthTab(true);
    });

    if (btnNavRegister) btnNavRegister.addEventListener('click', () => {
      authScreen.classList.remove('hidden');
      switchAuthTab(false);
    });

    if (btnCloseAuth) btnCloseAuth.addEventListener('click', () => {
      authScreen.classList.add('hidden');
      sound.playClick();
    });

    // PIN Input Logic (M-Pesa style keypads)
    this.authPins = {
      login: '',
      reg: '',
      regConfirm: ''
    };
    this.activeAuthKeypad = 'login'; // login, register, registerConfirm

    const updatePinDisplay = (type, val) => {
      let prefix = type === 'login' ? 'login-dot-' : (type === 'reg' ? 'reg-dot-' : 'reg-confirm-dot-');
      for (let i = 0; i < 4; i++) {
        const dot = document.getElementById(`${prefix}${i}`);
        if (dot) {
          if (i < val.length) {
            dot.classList.add('filled');
            dot.classList.remove('error');
          } else {
            dot.classList.remove('filled', 'error');
          }
        }
      }
      const hiddenInputId = type === 'login' ? 'login-pin' : (type === 'reg' ? 'reg-pin' : 'reg-confirm-pin');
      const hiddenInput = document.getElementById(hiddenInputId);
      if (hiddenInput) hiddenInput.value = val;
    };

    const handleKeypadPress = (key) => {
      if (key === 'bio') {
        this.showToast('Biometric authentication not supported in demo.', 'info');
        return;
      }

      if (this.activeAuthKeypad === 'login') {
        if (key === 'del') {
          this.authPins.login = this.authPins.login.slice(0, -1);
          sound.playTick();
        } else if (key === 'clear') {
          this.authPins.login = '';
          sound.playTick();
        } else if (this.authPins.login.length < 4) {
          this.authPins.login += key;
          sound.playTick();
        }
        updatePinDisplay('login', this.authPins.login);
        if (this.authPins.login.length === 4) {
          document.getElementById('btn-login').click();
        }
        return;
      }

      if (this.activeAuthKeypad === 'register') {
        if (key === 'del') {
          if (this.authPins.regConfirm.length > 0) {
            this.authPins.regConfirm = this.authPins.regConfirm.slice(0, -1);
            updatePinDisplay('regConfirm', this.authPins.regConfirm);
          } else if (this.authPins.reg.length > 0) {
            this.authPins.reg = this.authPins.reg.slice(0, -1);
            updatePinDisplay('reg', this.authPins.reg);
          }
          sound.playTick();
          return;
        }

        if (key === 'clear') {
          if (this.authPins.regConfirm.length > 0) {
            this.authPins.regConfirm = '';
            updatePinDisplay('regConfirm', '');
          } else {
            this.authPins.reg = '';
            updatePinDisplay('reg', '');
          }
          sound.playTick();
          return;
        }

        if (this.authPins.reg.length < 4) {
          this.authPins.reg += key;
          updatePinDisplay('reg', this.authPins.reg);
          sound.playTick();
        } else if (this.authPins.regConfirm.length < 4) {
          this.authPins.regConfirm += key;
          updatePinDisplay('regConfirm', this.authPins.regConfirm);
          sound.playTick();
        }
      }
    };

    document.querySelectorAll('#login-keypad .keypad-btn, #reg-keypad .keypad-btn').forEach(btn => {
      btn.addEventListener('click', (e) => handleKeypadPress(e.currentTarget.dataset.key));
    });

    this.clearAuthPins = () => {
      this.authPins = { login: '', reg: '', regConfirm: '' };
      updatePinDisplay('login', '');
      updatePinDisplay('reg', '');
      updatePinDisplay('regConfirm', '');
    };

    // Forms Submission
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const loginBtn = document.getElementById('btn-login');
        const phone = (document.getElementById('login-phone')?.value || '').trim();
        const pin = this.authPins.login;

        // Ensure inline error element exists
        let inlineLoginErr = loginForm.querySelector('.auth-inline-error');
        if (!inlineLoginErr) {
          inlineLoginErr = document.createElement('div');
          inlineLoginErr.className = 'auth-inline-error';
          if (loginBtn && loginBtn.parentNode) {
            loginBtn.parentNode.insertBefore(inlineLoginErr, loginBtn);
          }
        }
        inlineLoginErr.style.display = 'none';

        if (!phone || phone.replace(/\D/g, '').length < 9) {
          const phoneErrMsg = 'Please enter a valid Safaricom phone number.';
          inlineLoginErr.textContent = phoneErrMsg;
          inlineLoginErr.style.display = 'block';
          this.showAuthMessage(phoneErrMsg, 'error');
          this.showToast(phoneErrMsg, 'error');
          document.getElementById('login-phone')?.focus();
          return;
        }

        if (pin.length !== 4) {
          const pinErrMsg = 'Please enter your 4-digit PIN using the keypad below.';
          inlineLoginErr.textContent = pinErrMsg;
          inlineLoginErr.style.display = 'block';
          this.showAuthMessage(pinErrMsg, 'error');
          this.showToast(pinErrMsg, 'error');
          return;
        }

        if (loginBtn) {
          loginBtn.disabled = true;
          loginBtn.innerHTML = '<span>Signing in...</span>';
        }

        let res;
        try {
          res = await auth.login(phone, pin);
        } catch (loginErr) {
          res = { success: false, message: 'Login failed. Please check your connection and try again.' };
        } finally {
          if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.innerHTML = '<span class="auth-btn-icon">🔓</span><span>Sign In Securely</span>';
          }
        }

        // Helper: show OTP verification modal
        const showVerifyModal = () => {
          sound.playClick();
          this._pendingVerifyUserId = res.userId;
          this._pendingVerifyEmail = (document.getElementById('login-phone')?.value || '').trim();
          this._pendingVerifyPhone = phone;

          const emailVerifyModal = document.getElementById('modal-email-verify');
          const descEl = document.getElementById('email-verify-desc');
          const emailVerifyMsg = document.getElementById('email-verify-msg');
          if (emailVerifyMsg) emailVerifyMsg.textContent = '';

          const emailOtpInputs = document.querySelectorAll('#email-otp-input-group .otp-digit');
          emailOtpInputs.forEach(i => i.value = '');

          if (res.devCode) {
            const digits = res.devCode.toString().split('');
            emailOtpInputs.forEach((inp, idx) => { inp.value = digits[idx] || ''; });
            if (descEl) descEl.textContent = `Your account needs verification. Authentication code: ${res.devCode} (entered below).`;
            if (emailVerifyMsg) {
              emailVerifyMsg.textContent = `Code: ${res.devCode}. Click Verify to activate your account.`;
              emailVerifyMsg.style.color = '#00f59b';
            }
            this.showToast(`Verify your account. Code: ${res.devCode}`, 'info');
          } else {
            if (descEl) descEl.textContent = res.message || 'Enter the 6-digit authentication code sent to your email to activate your account.';
            this.showToast(res.message || 'Please verify your account first.', 'info');
          }

          if (emailVerifyModal) {
            emailVerifyModal.classList.remove('hidden');
            emailVerifyModal.style.display = 'flex';
          }
          document.getElementById('email-otp-0')?.focus();
        };

        if (res.requiresVerification) {
          // Account exists but not yet verified — show OTP modal regardless of res.success
          showVerifyModal();
          if (inlineLoginErr) inlineLoginErr.style.display = 'none';
        } else if (res.success) {
          if (res.requires2FA) {
            document.getElementById('modal-2fa').classList.remove('hidden');
            this.showToast(`2FA required. Hint: ${res.otpHint}`, 'info');
            document.getElementById('otp-0').focus();
          } else {
            sound.playTradeWon(); // Success sound
            wallet.syncBalance();
          }
          if (inlineLoginErr) inlineLoginErr.style.display = 'none';
        } else {
          let errMsg = res.message || 'Login failed. Please check your credentials.';
          if (errMsg.toLowerCase().includes('not found') || errMsg.toLowerCase().includes('no account')) {
            errMsg = `No account found for +254 ${phone}. Please click "Create Account" above to register.`;
          }
          if (inlineLoginErr) {
            inlineLoginErr.textContent = errMsg;
            inlineLoginErr.style.display = 'block';
          }

          this.showAuthMessage(errMsg, 'error');
          this.showToast(errMsg, 'error');
          this.clearAuthPins();
          // Error shake animation
          for (let i = 0; i < 4; i++) {
            const dot = document.getElementById(`login-dot-${i}`);
            if (dot) {
              dot.classList.remove('filled');
              void dot.offsetWidth; // Trigger reflow
              dot.classList.add('error');
            }
          }
        }
      });
    }

    if (regForm) {
      regForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('btn-register') || regForm.querySelector('button[type="submit"]') || regForm.querySelector('.auth-submit-btn');

        // Manage inline error element directly above register button
        let inlineErr = regForm.querySelector('.auth-inline-error');
        if (!inlineErr) {
          inlineErr = document.createElement('div');
          inlineErr.className = 'auth-inline-error';
          if (submitBtn && submitBtn.parentNode) {
            submitBtn.parentNode.insertBefore(inlineErr, submitBtn);
          }
        }
        inlineErr.style.display = 'none';

        const fullName = (document.getElementById('reg-name')?.value || '').trim();
        const phone = (document.getElementById('reg-phone')?.value || '').trim();
        const email = (document.getElementById('reg-email')?.value || '').trim();
        const pinVal = this.authPins?.reg || document.getElementById('reg-pin')?.value || '';
        const confirmPinVal = this.authPins?.regConfirm || document.getElementById('reg-confirm-pin')?.value || '';

        // Pre-validation checks with immediate feedback
        if (!fullName || fullName.length < 2) {
          const msg = 'Please enter your Full Name.';
          inlineErr.textContent = msg;
          inlineErr.style.display = 'block';
          this.showToast(msg, 'error');
          this.showAuthMessage(msg, 'error');
          document.getElementById('reg-name')?.focus();
          return;
        }

        if (!phone || phone.replace(/\D/g, '').length < 9) {
          const msg = 'Please enter a valid Safaricom phone number (e.g. 0712 345 678).';
          inlineErr.textContent = msg;
          inlineErr.style.display = 'block';
          this.showToast(msg, 'error');
          this.showAuthMessage(msg, 'error');
          document.getElementById('reg-phone')?.focus();
          return;
        }

        if (!pinVal || pinVal.length !== 4) {
          const msg = 'Please create a 4-digit PIN using the keypad below.';
          inlineErr.textContent = msg;
          inlineErr.style.display = 'block';
          this.showToast(msg, 'error');
          this.showAuthMessage(msg, 'error');
          return;
        }

        if (pinVal !== confirmPinVal) {
          const msg = 'PINs do not match. Please re-enter to confirm.';
          inlineErr.textContent = msg;
          inlineErr.style.display = 'block';
          this.showToast(msg, 'error');
          this.showAuthMessage(msg, 'error');
          return;
        }

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<span>Creating account...</span>';
        }

        let res;
        try {
          res = await auth.register({
            fullName,
            phone,
            email,
            pin: pinVal,
            confirmPin: confirmPinVal
          });
        } catch (regErr) {
          res = { success: false, message: 'Registration failed. Please check connection and try again.' };
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span class="auth-btn-icon">🚀</span><span>Create Secure Account</span>';
          }
        }

        if (res.success) {
          sound.playClick();
          inlineErr.style.display = 'none';

          this._pendingVerifyUserId = res.userId;
          this._pendingVerifyEmail = email;
          this._pendingVerifyPhone = phone;

          const emailVerifyModal = document.getElementById('modal-email-verify');
          const descEl = document.getElementById('email-verify-desc');
          const emailVerifyMsg = document.getElementById('email-verify-msg');
          if (emailVerifyMsg) emailVerifyMsg.textContent = '';

          const emailOtpInputs = document.querySelectorAll('#email-otp-input-group .otp-digit');
          emailOtpInputs.forEach(i => i.value = '');

          // Always auto-fill devCode if provided so user can verify immediately
          if (res.devCode) {
            const digits = res.devCode.toString().split('');
            emailOtpInputs.forEach((inp, idx) => {
              inp.value = digits[idx] || '';
            });
            if (descEl) {
              descEl.textContent = email
                ? `Authentication code: ${res.devCode} (entered for you below). Also sent to ${email}.`
                : `Your authentication code is ${res.devCode} (entered for you below).`;
            }
            if (emailVerifyMsg) {
              emailVerifyMsg.textContent = `Authentication code: ${res.devCode}. Click Verify to enter dashboard.`;
              emailVerifyMsg.style.color = '#00f59b';
            }
            this.showToast(`Your authentication code: ${res.devCode}`, 'info');
          } else if (res.emailSent && email) {
            if (descEl) descEl.textContent = `Enter the 6-digit authentication code sent to ${email} to activate your account.`;
            this.showToast('Authentication code sent! Please check your email.', 'success');
          } else {
            if (descEl) descEl.textContent = `Enter the 6-digit authentication code to activate your account.`;
            this.showToast('Please enter your authentication code.', 'info');
          }

          if (emailVerifyModal) {
            emailVerifyModal.classList.remove('hidden');
            emailVerifyModal.style.display = 'flex';
          }
          document.getElementById('email-otp-0')?.focus();
        } else {
          // Display error visibly in inline banner directly above the button and in toast
          const errMsg = res.message || 'Registration failed. Please try again.';
          inlineErr.textContent = errMsg;
          inlineErr.style.display = 'block';

          this.showToast(errMsg, 'error');
          this.showAuthMessage(errMsg, 'error');

          // If this account is already registered, automatically switch to sign-in tab
          if (res.isExistingVerified) {
            setTimeout(() => {
              const loginTab = document.getElementById('auth-tab-login');
              if (loginTab) loginTab.click();
              const loginPhone = document.getElementById('login-phone');
              if (loginPhone) loginPhone.value = phone;
              this.showToast('Account already exists. Please enter your PIN to sign in, or click "Forgot PIN".', 'info');
            }, 1200);
          }
        }
      });
    }

    // 2FA OTP Logic (login flow)
    const twoFaOtpInputs = document.querySelectorAll('#otp-input-group .otp-digit');
    twoFaOtpInputs.forEach((input, index) => {
      input.addEventListener('input', (e) => {
        if (e.target.value && index < twoFaOtpInputs.length - 1) {
          twoFaOtpInputs[index + 1].focus();
        }
        if (Array.from(twoFaOtpInputs).every(i => i.value)) {
          document.getElementById('btn-verify-otp').click();
        }
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && index > 0) {
          twoFaOtpInputs[index - 1].focus();
        }
      });
      input.addEventListener('paste', (e) => {
        e.preventDefault();
        const pasteData = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, twoFaOtpInputs.length);
        if (pasteData) {
          pasteData.split('').forEach((char, i) => {
            if (twoFaOtpInputs[i]) twoFaOtpInputs[i].value = char;
          });
          const nextIndex = Math.min(pasteData.length, twoFaOtpInputs.length - 1);
          twoFaOtpInputs[nextIndex]?.focus();
          if (pasteData.length === twoFaOtpInputs.length) {
            document.getElementById('btn-verify-otp')?.click();
          }
        }
      });
    });

    document.getElementById('btn-verify-otp')?.addEventListener('click', () => {
      const code = Array.from(twoFaOtpInputs).map(i => i.value).join('');
      const res = auth.verify2FA(code);
      if (res.success) {
        sound.playTradeWon();
        wallet.syncBalance();
      } else {
        this.showToast(res.message, 'error');
        twoFaOtpInputs.forEach(i => i.value = '');
        twoFaOtpInputs[0].focus();
      }
    });

    // Close button on authentication code modal
    document.getElementById('btn-close-email-verify')?.addEventListener('click', () => {
      document.getElementById('modal-email-verify')?.classList.add('hidden');
    });

    // Email OTP Verification Logic (post-registration)
    const emailOtpInputs = document.querySelectorAll('#email-otp-input-group .otp-digit');
    const emailVerifyMsg = document.getElementById('email-verify-msg');
    const showEmailOtpMsg = (msg, color = '#ff4d6d') => {
      if (emailVerifyMsg) { emailVerifyMsg.textContent = msg; emailVerifyMsg.style.color = color; }
    };
    const clearEmailOtp = () => { emailOtpInputs.forEach(i => i.value = ''); emailOtpInputs[0]?.focus(); };

    emailOtpInputs.forEach((input, index) => {
      input.addEventListener('input', (e) => {
        // Only allow digits
        e.target.value = e.target.value.replace(/\D/g, '');
        if (e.target.value && index < emailOtpInputs.length - 1) {
          emailOtpInputs[index + 1].focus();
        }
        if (Array.from(emailOtpInputs).every(i => i.value)) {
          document.getElementById('btn-verify-email-otp')?.click();
        }
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && index > 0) {
          emailOtpInputs[index - 1].focus();
        }
      });
      input.addEventListener('paste', (e) => {
        e.preventDefault();
        const pasteData = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
        if (pasteData) {
          pasteData.split('').forEach((char, i) => {
            if (emailOtpInputs[i]) emailOtpInputs[i].value = char;
          });
          const nextIndex = Math.min(pasteData.length, emailOtpInputs.length - 1);
          emailOtpInputs[nextIndex]?.focus();
          if (pasteData.length === 6) {
            document.getElementById('btn-verify-email-otp')?.click();
          }
        }
      });
    });

    document.getElementById('btn-verify-email-otp')?.addEventListener('click', async () => {
      const code = Array.from(emailOtpInputs).map(i => i.value).join('');
      if (code.length !== 6) {
        showEmailOtpMsg('Please enter the complete 6-digit code.');
        return;
      }
      const btn = document.getElementById('btn-verify-email-otp');
      if (btn) { btn.disabled = true; btn.textContent = 'Verifying...'; }
      showEmailOtpMsg('');
      try {
        const res = await auth.verifyRegistration(
          code,
          this._pendingVerifyEmail,
          this._pendingVerifyPhone
        );
        if (res && res.success) {
          document.getElementById('modal-email-verify')?.classList.add('hidden');
          this.closeAuthModal();
          sound.playTradeWon();
          this.showToast(`Welcome to Apex Binary, ${res.user?.fullName || 'Trader'}! Account activated.`, 'success');
          this.toggleAuthState(true);
          wallet.syncBalance();
          clearEmailOtp();
        } else {
          showEmailOtpMsg(res?.message || 'Invalid code. Please try again.');
          clearEmailOtp();
        }
      } catch (err) {
        showEmailOtpMsg('Verification failed. Please try again.');
        clearEmailOtp();
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Verify & Activate Account'; }
      }
    });

    document.getElementById('btn-resend-email-otp')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-resend-email-otp');
      if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
      showEmailOtpMsg('');
      try {
        const res = await api.resendVerification({
          userId: this._pendingVerifyUserId,
          email: this._pendingVerifyEmail,
          phone: this._pendingVerifyPhone,
        });
        if (res && res.ok && res.data?.success) {
          if (res.data.userId) this._pendingVerifyUserId = res.data.userId;
          if (res.data.devCode) {
            const digits = res.data.devCode.split('');
            emailOtpInputs.forEach((inp, idx) => {
              inp.value = digits[idx] || '';
            });
            showEmailOtpMsg(`Fresh authentication code: ${res.data.devCode} — entered for you.`, '#00f59b');
            this.showToast(`Verification code: ${res.data.devCode}`, 'info');
          } else {
            showEmailOtpMsg('A new authentication code has been sent to your email.', '#00f59b');
            this.showToast('Verification code sent! Check your inbox.', 'success');
          }
        } else {
          showEmailOtpMsg(res?.data?.message || 'Failed to resend. Try again shortly.');
        }
      } catch (err) {
        showEmailOtpMsg('Failed to resend code. Please try again.');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Resend Code'; }
      }
    });

    // Security Settings Panel Actions
    const avatarBtn = document.getElementById('btn-user-avatar');
    const secPanel = document.getElementById('security-panel');
    const closeSecPanel = document.getElementById('btn-close-security');
    const userDropdown = document.getElementById('user-profile-dropdown');
    
    if (avatarBtn) {
      avatarBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        userDropdown?.classList.toggle('hidden');
        sound.playClick();
      });
    }

    // Close user dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (userDropdown && !userDropdown.contains(e.target) && avatarBtn && !avatarBtn.contains(e.target)) {
        userDropdown.classList.add('hidden');
      }
    });

    // Dropdown Security link
    document.getElementById('btn-dropdown-security')?.addEventListener('click', () => {
      userDropdown?.classList.add('hidden');
      secPanel?.classList.remove('hidden');
      sound.playClick();
    });

    // Dropdown History link
    document.getElementById('btn-dropdown-history')?.addEventListener('click', () => {
      userDropdown?.classList.add('hidden');
      document.getElementById('dock-btn-history')?.click();
    });

    // Centralized Logout Handler
    const handleLogout = (e) => {
      if (e) {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
      }
      userDropdown?.classList.add('hidden');
      secPanel?.classList.add('hidden');
      document.getElementById('drawer-panel')?.classList.add('collapsed');
      auth.logout('manual');
      this.showToast('You have been signed out safely.', 'info');
      try {
        sound?.playClick?.();
      } catch (err) {}
    };

    document.getElementById('btn-header-logout')?.addEventListener('click', handleLogout);
    document.getElementById('btn-dropdown-logout')?.addEventListener('click', handleLogout);
    document.getElementById('btn-drawer-logout')?.addEventListener('click', handleLogout);
    document.getElementById('btn-security-logout')?.addEventListener('click', handleLogout);

    // Drawer Profile actions
    document.getElementById('btn-drawer-open-security')?.addEventListener('click', () => {
      secPanel?.classList.remove('hidden');
      sound.playClick();
    });
    document.getElementById('btn-drawer-deposit')?.addEventListener('click', () => {
      this.openModal('modal-mpesa-deposit');
    });
    document.getElementById('btn-drawer-withdraw')?.addEventListener('click', () => {
      this.openModal('modal-mpesa-withdraw');
    });
    
    if (closeSecPanel) closeSecPanel.addEventListener('click', () => {
      secPanel.classList.add('hidden');
      document.getElementById('change-pin-section').classList.add('hidden');
      sound.playClick();
    });

    const check2fa = document.getElementById('check-2fa');
    if (check2fa) check2fa.addEventListener('change', () => {
      const res = auth.toggle2FA();
      if (res.success) {
        this.showToast(`2FA has been ${res.enabled ? 'enabled' : 'disabled'}.`, 'success');
      }
    });

    document.querySelectorAll('.sec-level-label').forEach(label => {
      label.addEventListener('click', (e) => {
        auth.setSecurityLevel(e.currentTarget.dataset.level);
        this.updateSecurityPanelUI();
      });
    });

    // Change PIN Logic
    document.getElementById('btn-change-pin')?.addEventListener('click', () => {
      document.getElementById('change-pin-section').classList.remove('hidden');
    });

    document.getElementById('btn-cancel-change-pin')?.addEventListener('click', () => {
      document.getElementById('change-pin-section').classList.add('hidden');
      document.getElementById('current-pin-input').value = '';
      document.getElementById('new-pin-input').value = '';
      document.getElementById('confirm-new-pin-input').value = '';
    });

    document.getElementById('btn-submit-change-pin')?.addEventListener('click', () => {
      const curr = document.getElementById('current-pin-input').value;
      const nw = document.getElementById('new-pin-input').value;
      const conf = document.getElementById('confirm-new-pin-input').value;
      
      const res = auth.changePin(curr, nw, conf);
      if (res.success) {
        this.showToast('PIN successfully changed.', 'success');
        document.getElementById('btn-cancel-change-pin').click();
      } else {
        this.showToast(res.message, 'error');
      }
    });

    // ─── Forgot PIN Flow ──────────────────────────────────────────────────
    // Track reset session state
    this._resetState = { userId: null, email: null, phone: null, verifiedCode: null };

    // Helper: show only one auth panel at a time
    const showAuthPanel = (id) => {
      ['auth-login-form', 'auth-register-form',
       'forgot-pin-step1', 'forgot-pin-step2', 'forgot-pin-step3']
        .forEach(pid => document.getElementById(pid)?.classList.add('hidden'));
      document.getElementById(id)?.classList.remove('hidden');
      this.showAuthMessage('');
    };

    // Step 0 — "Forgot PIN?" link opens step 1
    document.getElementById('btn-forgot-pin')?.addEventListener('click', () => {
      showAuthPanel('forgot-pin-step1');
      document.getElementById('forgot-email').value = '';
      this.showAuthMessage('', 'info');
      sound.playClick();
    });

    // Step 1 ← back to login
    document.getElementById('btn-back-to-login-from-forgot')?.addEventListener('click', () => {
      showAuthPanel('auth-login-form');
      sound.playClick();
    });

    // Step 1 — Send reset code
    document.getElementById('btn-send-reset-code')?.addEventListener('click', async () => {
      const inputVal = document.getElementById('forgot-email')?.value.trim() || '';
      if (!inputVal) {
        this.showAuthMessage('Please enter your registered email address or Safaricom phone number.', 'error');
        return;
      }

      const isEmail = inputVal.includes('@');
      const email = isEmail ? inputVal : '';
      const phone = !isEmail ? inputVal.replace(/\D/g, '') : '';

      if (!isEmail && phone.length < 9) {
        this.showAuthMessage('Please enter a valid email or Safaricom phone number.', 'error');
        return;
      }

      const btn = document.getElementById('btn-send-reset-code');
      if (!btn) return;

      btn.disabled = true;
      const originalHtml = btn.innerHTML;
      btn.textContent = 'Sending…';

      try {
        let res = null;
        try {
          res = await api.forgotPin({ email, phone });
        } catch (e) {
          console.warn('api.forgotPin request error:', e);
        }

        // 1. Backend response succeeded
        if (res && (res.ok || res.data?.success)) {
          this._resetState.email = email || res.data?.email || '';
          this._resetState.phone = phone || res.data?.phone || '';
          this._resetState.userId = res.data?.userId || null;

          document.querySelectorAll('#reset-otp-input-group .otp-digit').forEach(i => i.value = '');
          showAuthPanel('forgot-pin-step2');
          document.getElementById('reset-otp-0')?.focus();

          // Email didn't deliver or dev code available — show code directly and auto-fill OTP boxes
          if (res.data?.devCode) {
            const devCode = res.data.devCode;
            const digits = devCode.split('');
            document.querySelectorAll('#reset-otp-input-group .otp-digit').forEach((inp, i) => {
              inp.value = digits[i] || '';
            });
            document.getElementById('forgot-step2-hint').textContent =
              `Authentication code: ${devCode} — filled in automatically.`;
            this.showAuthMessage(`Reset code: ${devCode} (auto-filled). Click Authenticate Code to proceed.`, 'info');
          } else {
            const dest = email
              ? (email.split('@')[0].slice(0, 2) + '***@' + email.split('@')[1])
              : (phone.slice(0, 4) + '***' + phone.slice(-3));
            document.getElementById('forgot-step2-hint').textContent =
              `Enter the 6-digit code sent to ${dest}`;
            this.showAuthMessage(res.data?.message || 'Authentication code sent! Check your inbox.', 'success');
            try { sound?.playTradeWon?.(); } catch (_) {}
          }
          return;
        }

        this.showAuthMessage(res?.data?.message || 'Failed to send reset code. Please check your details.', 'error');
      } catch (err) {
        console.error('Reset send code error:', err);
        this.showAuthMessage('Error sending reset code. Please try again.', 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
      }
    });

    // Step 2 — OTP auto-advance
    const resetOtpInputs = document.querySelectorAll('#reset-otp-input-group .otp-digit');
    resetOtpInputs.forEach((input, index) => {
      input.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 1);
        if (e.target.value && index < resetOtpInputs.length - 1) {
          resetOtpInputs[index + 1].focus();
        }
        if (Array.from(resetOtpInputs).every(i => i.value)) {
          document.getElementById('btn-verify-reset-code')?.click();
        }
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && index > 0) {
          resetOtpInputs[index - 1].focus();
        }
      });
    });

    // Step 2 ← back to step 1
    document.getElementById('btn-back-to-forgot-step1')?.addEventListener('click', () => {
      showAuthPanel('forgot-pin-step1');
      sound.playClick();
    });

    // Step 2 — Resend code
    document.getElementById('btn-resend-reset-code')?.addEventListener('click', async () => {
      const { email, phone } = this._resetState;
      if (!email && !phone) { showAuthPanel('forgot-pin-step1'); return; }
      const resendBtn = document.getElementById('btn-resend-reset-code');
      if (resendBtn) resendBtn.textContent = 'Resending…';

      try {
        let res = null;
        try {
          res = await api.forgotPin({ email, phone });
        } catch (e) {}

        if (res && (res.ok || res.data?.success)) {
          if (res.data?.devCode) {
            const devCode = res.data.devCode;
            const digits = devCode.split('');
            resetOtpInputs.forEach((inp, i) => {
              inp.value = digits[i] || '';
            });
            this.showAuthMessage(`Fresh authentication code: ${devCode} — filled in automatically.`, 'info');
          } else {
            this.showAuthMessage('A fresh authentication code has been sent.', 'success');
            resetOtpInputs.forEach(i => i.value = '');
            resetOtpInputs[0]?.focus();
          }
          return;
        }

        this.showAuthMessage(res?.data?.message || 'Failed to resend authentication code.', 'error');
      } finally {
        if (resendBtn) resendBtn.textContent = 'Resend Code';
      }
    });

    // Step 2 — Verify code → advance to step 3
    document.getElementById('btn-verify-reset-code')?.addEventListener('click', () => {
      const code = Array.from(resetOtpInputs).map(i => i.value).join('');
      if (code.length !== 6) {
        this.showAuthMessage('Please enter all 6 digits of the reset code.', 'error');
        return;
      }
      // Store verified code; actual server validation happens at step 3 submission
      this._resetState.verifiedCode = code;
      // Clear new PIN fields
      this.authPins._resetNew = '';
      this.authPins._resetConfirm = '';
      ['reset-new-dot-', 'reset-confirm-dot-'].forEach(pfx => {
        for (let i = 0; i < 4; i++) document.getElementById(pfx + i)?.classList.remove('filled', 'error');
      });
      this.showAuthMessage('');
      showAuthPanel('forgot-pin-step3');
      sound.playClick();
    });

    // Step 3 — Mode switch (4-Digit PIN vs Password)
    this._resetMode = 'pin';
    const pinModeBtn = document.getElementById('btn-mode-pin');
    const pwdModeBtn = document.getElementById('btn-mode-pwd');
    const pinContainer = document.getElementById('reset-pin-container');
    const pwdContainer = document.getElementById('reset-pwd-container');

    pinModeBtn?.addEventListener('click', () => {
      this._resetMode = 'pin';
      pinModeBtn.classList.add('active');
      pwdModeBtn?.classList.remove('active');
      pinContainer?.classList.remove('hidden');
      pwdContainer?.classList.add('hidden');
      sound.playClick();
    });

    pwdModeBtn?.addEventListener('click', () => {
      this._resetMode = 'pwd';
      pwdModeBtn.classList.add('active');
      pinModeBtn?.classList.remove('active');
      pwdContainer?.classList.remove('hidden');
      pinContainer?.classList.add('hidden');
      document.getElementById('reset-custom-password')?.focus();
      sound.playClick();
    });

    // Step 3 — PIN keypad for new PIN
    if (!this.authPins._resetNew) this.authPins._resetNew = '';
    if (!this.authPins._resetConfirm) this.authPins._resetConfirm = '';

    const updateResetDots = (type, val) => {
      const prefix = type === '_resetNew' ? 'reset-new-dot-' : 'reset-confirm-dot-';
      for (let i = 0; i < 4; i++) {
        const dot = document.getElementById(prefix + i);
        if (dot) {
          dot.classList.toggle('filled', i < val.length);
          dot.classList.remove('error');
        }
      }
    };

    document.querySelectorAll('#reset-pin-keypad .keypad-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const key = e.currentTarget.dataset.key;
        if (key === 'del') {
          if (this.authPins._resetConfirm && this.authPins._resetConfirm.length > 0) {
            this.authPins._resetConfirm = this.authPins._resetConfirm.slice(0, -1);
            updateResetDots('_resetConfirm', this.authPins._resetConfirm);
          } else if (this.authPins._resetNew && this.authPins._resetNew.length > 0) {
            this.authPins._resetNew = this.authPins._resetNew.slice(0, -1);
            updateResetDots('_resetNew', this.authPins._resetNew);
          }
          sound.playTick();
          return;
        }

        if (key === 'clear') {
          if (this.authPins._resetConfirm && this.authPins._resetConfirm.length > 0) {
            this.authPins._resetConfirm = '';
            updateResetDots('_resetConfirm', '');
          } else {
            this.authPins._resetNew = '';
            updateResetDots('_resetNew', '');
          }
          sound.playTick();
          return;
        }

        const isNewFull = this.authPins._resetNew.length === 4;
        const activeType = isNewFull ? '_resetConfirm' : '_resetNew';

        if (this.authPins[activeType].length < 4) {
          this.authPins[activeType] += key;
          sound.playTick();
        }
        updateResetDots(activeType, this.authPins[activeType]);
        // Auto-submit when confirm PIN is full
        if (this.authPins._resetConfirm.length === 4) {
          document.getElementById('btn-submit-new-pin')?.click();
        }
      });
    });

    // Step 3 — Save new credentials & sign in
    document.getElementById('btn-submit-new-pin')?.addEventListener('click', async () => {
      let newSecret = '';
      let confirmSecret = '';

      if (this._resetMode === 'pwd') {
        newSecret = document.getElementById('reset-custom-password')?.value || '';
        confirmSecret = document.getElementById('reset-confirm-custom-password')?.value || '';
        if (newSecret.length < 4) {
          this.showAuthMessage('Password must be at least 4 characters.', 'error');
          return;
        }
        if (newSecret !== confirmSecret) {
          this.showAuthMessage('Passwords do not match.', 'error');
          return;
        }
      } else {
        newSecret = this.authPins._resetNew;
        confirmSecret = this.authPins._resetConfirm;
        if (newSecret.length !== 4) {
          this.showAuthMessage('Please enter a 4-digit PIN.', 'error');
          return;
        }
        if (newSecret !== confirmSecret) {
          this.showAuthMessage('PINs do not match.', 'error');
          return;
        }
      }

      const { userId, email, phone, verifiedCode } = this._resetState;

      const btn = document.getElementById('btn-submit-new-pin');
      if (!btn) return;
      btn.disabled = true;
      const originalSubmitText = btn.innerHTML;
      btn.textContent = 'Saving…';

      try {
        const res = await auth.resetPinWithCode({
          userId, email, phone,
          resetCode: verifiedCode,
          newPin: newSecret,
          confirmNewPin: confirmSecret,
        });

        if (res.success) {
          this._resetState = { userId: null, email: null, phone: null, verifiedCode: null, localCode: null };
          this.authPins._resetNew = '';
          this.authPins._resetConfirm = '';
          if (document.getElementById('reset-custom-password')) document.getElementById('reset-custom-password').value = '';
          if (document.getElementById('reset-confirm-custom-password')) document.getElementById('reset-confirm-custom-password').value = '';
          this.closeAuthModal();
          this.showToast('Credentials reset successfully! Welcome back.', 'success');
          sound.playTradeWon();
        } else {
          this.showAuthMessage(res.message, 'error');
          if (this._resetMode === 'pin') {
            for (let i = 0; i < 4; i++) {
              const dot = document.getElementById(`reset-confirm-dot-${i}`);
              if (dot) { dot.classList.remove('filled'); dot.classList.add('error'); }
            }
          }
          if (res.message.toLowerCase().includes('expired') || res.message.toLowerCase().includes('invalid')) {
            setTimeout(() => showAuthPanel('forgot-pin-step1'), 2000);
          }
        }
      } catch (err) {
        console.error('Submit new pin error:', err);
        this.showAuthMessage('Failed to save new credentials. Please try again.', 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalSubmitText;
      }
    });
  }

  // Market updates
  handleMarketTick({ asset, price, stats24h, indicators, candleRemainingSec }) {
    const heroPriceEl = document.getElementById('current-price-hero');
    const heroChangeEl = document.getElementById('price-change-hero');
    const heroHighEl = document.getElementById('stat-high');
    const heroLowEl = document.getElementById('stat-low');
    const candleTimerEl = document.getElementById('candle-timer-display');

    if (heroPriceEl) heroPriceEl.textContent = price.toFixed(asset.decimals);
    if (heroChangeEl) {
      const isPositive = stats24h.changePct >= 0;
      heroChangeEl.className = `price-change-badge ${isPositive ? 'positive' : 'negative'}`;
      heroChangeEl.textContent = `${isPositive ? '+' : ''}${stats24h.changePct.toFixed(2)}%`;
    }
    if (heroHighEl) heroHighEl.textContent = stats24h.high.toFixed(asset.decimals);
    if (heroLowEl) heroLowEl.textContent = stats24h.low.toFixed(asset.decimals);

    if (candleTimerEl && candleRemainingSec !== undefined) {
      candleTimerEl.innerHTML = `⏱ Candle: <strong>${candleRemainingSec}s</strong>`;
    }

    // Sentiment Bar
    const bullEl = document.getElementById('sentiment-bullish-fill');
    const bearEl = document.getElementById('sentiment-bearish-fill');
    if (bullEl && bearEl && indicators.sentiment) {
      bullEl.style.width = `${indicators.sentiment.bullish}%`;
      bullEl.querySelector('.sentiment-text').textContent = `▲ ${indicators.sentiment.bullish}% Bullish`;
      bearEl.style.width = `${indicators.sentiment.bearish}%`;
      bearEl.querySelector('.sentiment-text').textContent = `${indicators.sentiment.bearish}% Bearish ▼`;
    }
  }

  // Wallet updates
  handleWalletUpdate({ type, balance, demoBalance, realBalance }) {
    const isReal = type === 'real';
    const pillBtn = document.getElementById('wallet-pill-btn');
    const labelEl = document.getElementById('wallet-type-label');
    const displayEl = document.getElementById('wallet-balance-display');
    const menuDemoEl = document.getElementById('menu-demo-balance');
    const menuRealEl = document.getElementById('menu-real-balance');

    if (pillBtn) {
      pillBtn.classList.toggle('is-real', isReal);
    }
    if (labelEl) {
      labelEl.textContent = isReal ? 'REAL ACCOUNT (KES)' : 'DEMO ACCOUNT';
    }
    if (displayEl) {
      displayEl.textContent = wallet.formatCurrency(balance);
    }
    if (menuDemoEl) {
      menuDemoEl.textContent = wallet.formatCurrency(demoBalance);
    }
    if (menuRealEl) {
      menuRealEl.textContent = wallet.formatCurrency(realBalance);
    }

    // Keep dropdown active states in sync
    const itemDemo = document.getElementById('menu-select-demo');
    const itemReal = document.getElementById('menu-select-real');
    if (itemDemo) itemDemo.classList.toggle('active', !isReal);
    if (itemReal) itemReal.classList.toggle('active', isReal);

    // Keep trade desk quick mode switcher in sync
    const deskBtnDemo = document.getElementById('desk-btn-demo');
    const deskBtnReal = document.getElementById('desk-btn-real');
    if (deskBtnDemo) deskBtnDemo.classList.toggle('active', !isReal);
    if (deskBtnReal) deskBtnReal.classList.toggle('active', isReal);

    const deskDemoBal = document.getElementById('desk-demo-bal');
    const deskRealBal = document.getElementById('desk-real-bal');
    if (deskDemoBal) deskDemoBal.textContent = wallet.formatCurrency(demoBalance);
    if (deskRealBal) deskRealBal.textContent = wallet.formatCurrency(realBalance);

    const withdrawAvail = document.getElementById('withdraw-avail-balance');
    if (withdrawAvail) {
      withdrawAvail.textContent = wallet.formatCurrency(realBalance);
    }

    this.renderMpesaLog();
  }

  updateWalletUI() {
    this.handleWalletUpdate({
      type: wallet.getType(),
      balance: wallet.getBalance(),
      demoBalance: wallet.getDemoBalance(),
      realBalance: wallet.getRealBalance()
    });
  }

  // Gamification & Trader Level UI
  updateLevelBadgeUI() {
    const info = gamification.getLevelInfo();
    const iconEl = document.getElementById('level-badge-icon');
    const titleEl = document.getElementById('level-badge-title');
    const xpEl = document.getElementById('level-badge-xp');

    if (iconEl) iconEl.textContent = info.badge;
    if (titleEl) titleEl.textContent = `Level ${info.level}: ${info.title}`;
    if (xpEl) xpEl.textContent = `${info.currentXP} / ${info.nextXP} XP`;
  }

  handleGamificationEvent(event, data) {
    this.updateLevelBadgeUI();
    this.renderQuests();
    this.renderTournaments();

    if (event === 'level_up') {
      this.showToast(`LEVEL UP! You are now a Level ${data.level}: ${data.info.title}!`, 'success');
      this.trading.launchConfetti();
      
      const overlay = document.getElementById('level-up-overlay');
      if (overlay) {
        document.getElementById('level-up-modal-badge').textContent = data.info.badge;
        document.getElementById('level-up-modal-title').textContent = `LEVEL ${data.level} REACHED!`;
        document.getElementById('level-up-modal-desc').textContent = `You are now a ${data.info.title}.`;
        overlay.classList.remove('hidden');
      }
    } else if (event === 'quest_completed') {
      this.showToast(`Quest Completed: "${data.quest.title}"! (+${data.quest.xpReward} XP, +KSh ${data.quest.bonusReward.toLocaleString()} Demo Bonus)`, 'success');
    }
  }

  // Real-World WebSocket stream handler
  handleWebSocketEvent(event, data) {
    const wsBadge = document.getElementById('ws-feed-badge');
    const wsText = document.getElementById('ws-status-text');

    if (event === 'status') {
      if (data.connected) {
        if (wsBadge) {
          wsBadge.className = 'ws-feed-status-badge live';
          if (wsText) wsText.textContent = 'Binance WS Live';
        }
      } else {
        if (wsBadge) {
          wsBadge.className = 'ws-feed-status-badge offline';
          if (wsText) wsText.textContent = 'Simulated OTC';
        }
      }
    } else if (event === 'tick') {
      const curAsset = market.getCurrentAsset();
      if (!curAsset) return;

      if ((data.symbol === 'BTCUSDT' && curAsset.id === 'btc_usdt') ||
          (data.symbol === 'ETHUSDT' && curAsset.id === 'eth_usdt')) {
        market.pushExternalTick(data.price, data.time);
      }
    }
  }

  // Strategy Bots & Copy Trading event handler
  handleBotsEvent(event, data) {
    if (event === 'bot_updated') {
      this.renderBotsList();
    } else if (event === 'trader_updated') {
      this.renderCopyTraders();
    } else if (event === 'bot_trade_placed') {
      this.showToast(`🤖 ${data.bot.name} executed ${data.trade.direction} on ${data.trade.assetName} (${data.reason})`, 'info');
      sound.playTradePlaced();
      this.addBotActivityLog(`🤖 ${data.bot.name}`, data.trade, data.reason);
    } else if (event === 'copy_trade_mirrored') {
      this.showToast(`👥 Mirrored trade from ${data.trader.name}: ${data.direction} for KSh ${data.stake.toLocaleString()}`, 'success');
      sound.playTradePlaced();
      this.addBotActivityLog(`👥 ${data.trader.name}`, data.trade, data.reason || 'Mirrored Trade');
    }
  }

  addBotActivityLog(source, trade, reason) {
    const list = document.getElementById('bot-activity-log-list');
    if (!list) return;
    
    // Remove empty state
    const empty = list.querySelector('.empty-state');
    if (empty) empty.remove();
    
    const item = document.createElement('div');
    item.className = 'bot-activity-item';
    const isCall = trade.direction === 'higher';
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    item.innerHTML = `
      <div style="display:flex; justify-content: space-between; margin-bottom: 4px;">
        <span style="font-weight: 600; font-size: 13px;">${source}</span>
        <span style="font-size: 11px; color: var(--text-muted);">${timeStr}</span>
      </div>
      <div style="font-size: 12px; margin-bottom: 2px;">
        <span class="${isCall ? 'color-green' : 'color-red'}" style="font-weight: 600;">${isCall ? '▲ CALL' : '▼ PUT'}</span> 
        on <strong>${trade.assetName}</strong> for KSh ${trade.amount.toLocaleString()}
      </div>
      <div style="font-size: 11px; color: var(--text-secondary);">Reason: ${reason}</div>
    `;
    
    list.prepend(item);
    
    // Keep only last 10 logs
    while (list.children.length > 10) {
      list.removeChild(list.lastChild);
    }
  }

  // Progressive Web App (PWA) Initialization
  initPWA() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch((err) => {
          console.log('SW registration error:', err);
        });
      });
    }

    const installBtn = document.getElementById('btn-install-pwa');
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPwaPrompt = e;
      if (installBtn) {
        installBtn.classList.remove('hidden');
      }
    });

    if (installBtn) {
      installBtn.addEventListener('click', async () => {
        sound.playClick();
        if (this.deferredPwaPrompt) {
          this.deferredPwaPrompt.prompt();
          const { outcome } = await this.deferredPwaPrompt.userChoice;
          if (outcome === 'accepted') {
            this.showToast('Thank you for installing Apex Binary!', 'success');
          }
          this.deferredPwaPrompt = null;
        } else {
          this.showToast('To install: tap Share or Browser Menu -> "Add to Home Screen"', 'info');
        }
      });
    }
  }

  // Tournaments & Quests Rendering
  renderTournaments() {
    const container = document.getElementById('tournaments-container');
    if (!container) return;

    container.innerHTML = gamification.tournaments.map(t => {
      const joined = gamification.isTournamentJoined(t.id);
      const userScore = gamification.getTournamentScore(t.id);

      return `
        <div class="tournament-card">
          <div class="tourn-header">
            <span class="tourn-title">${t.name}</span>
            <span class="tourn-badge">${t.badge}</span>
          </div>
          <div class="tourn-prize-hero">KSh ${t.prizePool.toLocaleString()}</div>
          <div class="tourn-meta-row">
            <span>1st: <strong>KSh ${t.firstPrize.toLocaleString()}</strong></span>
            <span>Ends: <strong>${t.endsInHours}h left</strong></span>
            <span>👥 ${t.participantsCount.toLocaleString()}</span>
          </div>
          ${joined 
            ? `<div style="font-size: 11px; margin-bottom: 8px; color: var(--green-main); font-weight: 700;">✓ Joined • Your Score: ${userScore.toLocaleString()} pts</div>` 
            : ''}
          <button class="tourn-join-btn ${joined ? 'joined' : ''}" data-tourn="${t.id}">
            ${joined ? 'Participating' : 'Join Tournament (FREE)'}
          </button>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.tourn-join-btn:not(.joined)').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (!auth.isLoggedIn()) {
          this.showToast('Please log in or create an account to enter tournaments.', 'error');
          this.openModal('auth-screen');
          return;
        }

        const id = e.currentTarget.dataset.tourn;
        if (gamification.joinTournament(id)) {
          this.showToast('You have entered the tournament! Trade to earn leaderboard points.', 'success');
          this.renderTournaments();
        }
      });
    });
  }

  renderQuests() {
    const container = document.getElementById('quests-container');
    if (!container) return;

    const closed = JSON.parse(localStorage.getItem('tycoon_trade_history') || '[]');
    const mpesaTxs = JSON.parse(localStorage.getItem('tycoon_mpesa_history') || '[]');

    let currentStreak = 0;
    let maxStreak = 0;
    let kesWins = 0;
    let totalVolume = 0;

    closed.slice().reverse().forEach(t => {
      totalVolume += t.amount;
      if (t.status === 'won') {
        currentStreak++;
        if (currentStreak > maxStreak) maxStreak = currentStreak;
        if (t.assetId.includes('kes')) kesWins++;
      } else {
        currentStreak = 0;
      }
    });

    const stats = {
      totalTrades: closed.length,
      maxStreak,
      kesWins,
      totalVolume,
      mpesaDeposits: mpesaTxs.filter(tx => tx.type === 'deposit').length
    };

    container.innerHTML = gamification.quests.map(q => {
      const completed = gamification.isQuestCompleted(q.id);
      const current = Math.min(q.target, q.getProgress(stats));
      const pct = Math.min(100, (current / q.target) * 100);

      return `
        <div class="quest-card">
          <div class="quest-icon">${q.icon}</div>
          <div class="quest-info">
            <h4>${q.title}</h4>
            <p>${q.description}</p>
            <div class="quest-progress-bar">
              <div class="quest-progress-fill" style="width: ${pct}%;"></div>
            </div>
            <div style="font-size: 10px; color: var(--text-muted); margin-top: 3px;">
              ${completed ? 'Completed' : `${current} / ${q.target}`}
            </div>
          </div>
          <span class="quest-reward-pill ${completed ? 'completed' : ''}">
            ${completed ? '✓ CLAIMED' : `+${q.xpReward} XP`}
          </span>
        </div>
      `;
    }).join('');
  }

  // Kenyan Social Copy Trading
  renderCopyTraders() {
    const container = document.getElementById('copy-traders-list');
    if (!container || !this.botsEngine) return;

    container.innerHTML = this.botsEngine.traders.map(t => {
      return `
        <div class="trader-card ${t.isCopying ? 'is-copying' : ''}" id="card-${t.id}">
          <div class="trader-top-row">
            <div class="trader-profile-col">
              <div class="trader-avatar-circle">${t.avatar}</div>
              <div class="trader-name-group">
                <h4>${t.name}</h4>
                <div class="trader-location">📍 ${t.location}</div>
              </div>
            </div>
            <span class="trader-badge-pill">${t.badge}</span>
          </div>

          <div class="trader-metrics-grid">
            <div class="trader-metric-cell">
              <span>Win Rate</span>
              <strong class="win-rate">${t.winRate}%</strong>
            </div>
            <div class="trader-metric-cell">
              <span>Total Profit</span>
              <strong>${t.totalProfit}</strong>
            </div>
            <div class="trader-metric-cell">
              <span>Copiers</span>
              <strong>${t.copiers.toLocaleString()}</strong>
            </div>
          </div>

          <div style="font-size: 11px; color: var(--text-secondary);">
            Strategy: <strong>${t.style}</strong> • Fav: <strong>${t.favoriteAsset}</strong>
          </div>

          <div class="trader-action-row">
            <div class="trader-stake-input-group">
              <label>Stake:</label>
              <input type="number" class="copy-stake-input" data-trader="${t.id}" value="${t.copyStake || 500}" min="50" step="50">
            </div>
            <button class="btn-copy-toggle ${t.isCopying ? 'active' : ''}" data-trader="${t.id}">
              ${t.isCopying ? '✕ Stop Copying' : '⚡ Copy Trader'}
            </button>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.btn-copy-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.trader;

        // Require login for copy trading
        if (!auth.isLoggedIn()) {
          this.showToast('Please log in or create an account to copy trade experts.', 'error');
          this.openModal('auth-screen');
          return;
        }

        const stakeInput = container.querySelector(`.copy-stake-input[data-trader="${id}"]`);
        const stake = parseFloat(stakeInput?.value) || 500;
        this.botsEngine.toggleCopyTrader(id, stake);
        const trader = this.botsEngine.traders.find(t => t.id === id);
        if (trader.isCopying) {
          this.showToast(`Now mirroring ${trader.name}'s trades at KSh ${stake.toLocaleString()} per order!`, 'success');
        } else {
          this.showToast(`Stopped mirroring ${trader.name}.`, 'info');
        }
      });
    });

    container.querySelectorAll('.copy-stake-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const id = e.currentTarget.dataset.trader;
        const trader = this.botsEngine.traders.find(t => t.id === id);
        if (trader) {
          trader.copyStake = Math.max(50, parseFloat(e.currentTarget.value) || 500);
        }
      });
    });
  }

  // Algorithmic Strategy Bots
  renderBotsList() {
    const container = document.getElementById('bots-list');
    if (!container || !this.botsEngine) return;

    container.innerHTML = this.botsEngine.bots.map(b => {
      const isRunning = b.status === 'running';
      const minLevel = b.minLevel || 1;
      const isUnlocked = gamification.hasFeatureUnlock(minLevel);
      
      return `
        <div class="bot-card ${isRunning ? 'running' : ''} ${!isUnlocked ? 'locked' : ''}" id="card-${b.id}">
          <div class="bot-header-row">
            <div class="bot-title-group">
              <span class="bot-icon">${!isUnlocked ? '🔒' : b.icon}</span>
              <h4>${b.name}</h4>
            </div>
            <span class="bot-status-tag">${!isUnlocked ? `LOCKED (LVL ${minLevel})` : (isRunning ? '⚡ ACTIVE' : 'IDLE')}</span>
          </div>
          <p class="bot-desc">${b.description}</p>
          
          ${isUnlocked ? `
          <div class="bot-stats-row">
            <div class="bot-stat-item">
              <span>Trades</span>
              <strong>${b.stats.trades}</strong>
            </div>
            <div class="bot-stat-item">
              <span>Win/Loss</span>
              <strong style="color: var(--green-main);">${b.stats.wins}W / ${b.stats.losses}L</strong>
            </div>
            <div class="bot-stat-item">
              <span>Net Profit</span>
              <strong style="color: ${b.stats.profitKES >= 0 ? 'var(--green-main)' : 'var(--red-main)'};">
                ${b.stats.profitKES >= 0 ? '+' : ''}KSh ${b.stats.profitKES.toLocaleString()}
              </strong>
            </div>
          </div>
          <div class="bot-controls-row">
            <div class="bot-stake-group">
              <label>Base KSh:</label>
              <input type="number" class="bot-stake-input" data-bot="${b.id}" value="${b.baseStake || 500}" min="50" step="50" ${isRunning ? 'disabled' : ''}>
            </div>
            <button class="btn-bot-toggle ${isRunning ? 'active' : ''}" data-bot="${b.id}">
              ${isRunning ? '■ Stop Bot' : '▶ Start Bot'}
            </button>
          </div>
          ` : `
          <div class="bot-locked-overlay">
            <p>Reach Level ${minLevel} to unlock this strategy.</p>
          </div>
          `}
        </div>
      `;
    }).join('');

    container.querySelectorAll('.btn-bot-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.bot;
        const bot = this.botsEngine.bots.find(b => b.id === id);
        if (!bot) return;

        // Require login for bots
        if (!auth.isLoggedIn()) {
          this.showToast('Please log in or create an account to deploy autobots.', 'error');
          this.openModal('auth-screen');
          return;
        }

        const isUnlocked = gamification.hasFeatureUnlock(bot.minLevel || 1);
        if (!isUnlocked) {
          this.showToast(`Unlock this bot at Level ${bot.minLevel}`, 'error');
          return;
        }

        if (bot.status === 'running') {
          this.botsEngine.stopBot(id);
          this.showToast(`Stopped ${bot.name}.`, 'info');
        } else {
          const stakeInput = container.querySelector(`.bot-stake-input[data-bot="${id}"]`);
          const stake = parseFloat(stakeInput?.value) || bot.baseStake;
          this.botsEngine.startBot(id, stake);
          this.showToast(`Deployed ${bot.name} (Base: KSh ${stake.toLocaleString()})!`, 'success');
        }
      });
    });
  }

  // Quick Assets Bar
  renderQuickAssetTabs() {
    const container = document.getElementById('quick-assets-container');
    if (!container) return;
    container.innerHTML = '';

    const popularAssets = ASSETS.slice(0, 5);
    popularAssets.forEach((asset) => {
      const pill = document.createElement('button');
      const isHot = asset.payout >= 95;
      pill.className = `asset-tab-pill ${asset.id === market.currentAsset.id ? 'active' : ''}`;
      pill.innerHTML = `
        <span>${asset.icon}</span>
        <span>${asset.symbol}</span>
        <span class="asset-tab-payout ${isHot ? 'hot' : ''}">${asset.payout}%${isHot ? ' 🔥' : ''}</span>
      `;
      pill.addEventListener('click', () => {
        sound.playClick();
        this.selectAsset(asset.id);
      });
      container.appendChild(pill);
    });
  }

  selectAsset(assetId) {
    market.setAsset(assetId);
    const asset = market.currentAsset;

    document.getElementById('current-asset-icon').textContent = asset.icon;
    document.getElementById('current-asset-name').textContent = asset.name;
    document.getElementById('current-asset-cat').textContent = asset.category.toUpperCase();
    const payoutBadge = document.getElementById('current-asset-payout');
    payoutBadge.textContent = `${asset.payout}% ${asset.payout >= 95 ? 'HOT 🔥' : 'PAYOUT'}`;
    payoutBadge.className = `asset-payout-pill ${asset.payout >= 95 ? 'hot' : ''}`;
    document.getElementById('desk-payout-rate').textContent = `+${asset.payout}%`;

    this.renderQuickAssetTabs();
    this.updateOrderDeskCalculations();
    this.chart.resize();
  }

  renderAllAssetsModal(filter = 'all', searchQuery = '') {
    const grid = document.getElementById('asset-grid-list');
    if (!grid) return;
    grid.innerHTML = '';

    let filtered = ASSETS;
    if (filter !== 'all') {
      filtered = filtered.filter(a => a.category === filter);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(a => a.name.toLowerCase().includes(q) || a.symbol.toLowerCase().includes(q));
    }

    filtered.forEach(asset => {
      const card = document.createElement('div');
      card.className = 'asset-select-card';
      const isHot = asset.payout >= 95;
      card.innerHTML = `
        <div class="asset-card-symbol">
          <span>${asset.icon}</span>
          <div>
            <strong>${asset.symbol}</strong>
            <div style="font-size: 11px; color: #94a3b8;">${asset.name}</div>
          </div>
        </div>
        <div class="asset-card-payout ${isHot ? 'hot' : ''}">+${asset.payout}%${isHot ? ' 🔥' : ''}</div>
      `;
      card.addEventListener('click', () => {
        sound.playClick();
        this.selectAsset(asset.id);
        this.closeModal('modal-assets');
      });
      grid.appendChild(card);
    });
  }

  // Order Desk Calculator
  updateOrderDeskCalculations() {
    const input = document.getElementById('trade-amount-input');
    const amount = Math.max(100, parseFloat(input.value) || 100);
    this.stakeAmount = amount;

    const payoutPct = market.currentAsset.payout;
    const profit = amount * (payoutPct / 100);
    const totalReturn = amount + profit;

    document.getElementById('calc-payout-pct').textContent = `${payoutPct}%`;
    document.getElementById('calc-profit-amount').textContent = `+KSh ${profit.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
    document.getElementById('calc-total-return').textContent = `KSh ${totalReturn.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;

    const subText = `+${payoutPct}% (KSh ${totalReturn.toLocaleString('en-KE', { minimumFractionDigits: 2 })})`;
    document.getElementById('higher-payout-sub').textContent = subText;
    document.getElementById('lower-payout-sub').textContent = subText;
  }

  // Trades List Rendering
  updateTradesList() {
    const active = this.trading.getActiveTrades();
    const closed = this.trading.getClosedTrades();

    const badge = document.getElementById('active-trades-badge');
    const activeCount = document.getElementById('active-count');
    const closedCount = document.getElementById('closed-count');

    if (badge) {
      if (active.length > 0) {
        badge.textContent = active.length;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
    if (activeCount) activeCount.textContent = active.length;
    if (closedCount) closedCount.textContent = closed.length;

    // Active Trades List
    const activeList = document.getElementById('active-trades-list');
    if (activeList) {
      if (active.length === 0) {
        activeList.innerHTML = `
          <div class="empty-state">
            <span class="empty-icon">📈</span>
            <p>No active trades</p>
            <small>Choose an asset & click Higher or Lower to trade</small>
          </div>
        `;
      } else {
        const now = Date.now();
        activeList.innerHTML = active.map(t => {
          const isCall = t.direction === 'higher';
          const remainingSec = Math.max(0, Math.ceil((t.expiryTimestamp - now) / 1000));
          const elapsedSec = t.durationSec - remainingSec;
          const progressPct = Math.min(100, (elapsedSec / t.durationSec) * 100);
          const currentPrice = market.getCurrentPrice();
          const pnlStatus = t.inTheMoney ? 'IN THE MONEY' : 'OUT OF MONEY';
          const expectedReturn = t.inTheMoney ? (t.amount * (1 + t.payoutRate / 100)) : 0;

          return `
            <div class="trade-card ${t.inTheMoney ? 'in-the-money' : 'out-of-money'}">
              <div class="trade-card-top">
                <span class="trade-asset-badge">
                  <span>${t.assetIcon}</span>
                  <span>${t.assetName}</span>
                </span>
                <span class="trade-direction ${isCall ? 'higher' : 'lower'}">
                  ${isCall ? '▲ HIGHER' : '▼ LOWER'}
                </span>
              </div>
              <div class="trade-prices-row">
                <span>Strike: <strong>${t.strikePrice.toFixed(t.decimals)}</strong></span>
                <span>Current: <strong>${currentPrice.toFixed(t.decimals)}</strong></span>
              </div>
              <div class="trade-progress-wrapper">
                <div class="trade-progress-fill" style="width: ${progressPct}%;"></div>
              </div>
              <div class="trade-pnl-row">
                <span style="color: ${t.inTheMoney ? 'var(--green-main)' : 'var(--red-main)'}; font-size: 11px;">
                  ${pnlStatus} (${remainingSec}s)
                </span>
                <span style="font-family: var(--font-mono); color: ${t.inTheMoney ? 'var(--green-main)' : '#64748b'};">
                  KSh ${expectedReturn.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // Closed Trades List
    const closedList = document.getElementById('closed-trades-list');
    if (closedList) {
      if (closed.length === 0) {
        closedList.innerHTML = `
          <div class="empty-state">
            <span class="empty-icon">📁</span>
            <p>No trade history yet</p>
            <small>Completed trades will appear here</small>
          </div>
        `;
      } else {
        closedList.innerHTML = closed.map(t => {
          const isWin = t.status === 'won';
          const isCall = t.direction === 'higher';
          return `
            <div class="trade-card ${isWin ? 'in-the-money' : 'out-of-money'}">
              <div class="trade-card-top">
                <span class="trade-asset-badge">
                  <span>${t.assetIcon}</span>
                  <span>${t.assetName}</span>
                </span>
                <span class="trade-direction ${isCall ? 'higher' : 'lower'}">
                  ${isCall ? '▲ CALL' : '▼ PUT'}
                </span>
              </div>
              <div class="trade-prices-row">
                <span>Entry: ${t.strikePrice.toFixed(t.decimals)}</span>
                <span>Exit: ${t.exitPrice.toFixed(t.decimals)}</span>
              </div>
              <div class="trade-pnl-row">
                <span class="badge ${isWin ? 'real-badge' : 'demo-badge'}" style="${!isWin ? 'color: var(--red-main); background: rgba(255,51,102,0.15); border-color: rgba(255,51,102,0.3);' : ''}">
                  ${isWin ? 'WON +KSh ' + t.profit.toLocaleString() : 'LOST -KSh ' + t.amount.toLocaleString()}
                </span>
                <small style="color: #64748b;">${new Date(t.exitTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
              </div>
            </div>
          `;
        }).join('');
      }
    }
  }

  // AI Signals
  renderSignals() {
    const list = document.getElementById('signals-list');
    if (!list) return;

    const signalsData = [
      { asset: 'USD / KES (OTC)', time: '30s TF', rsi: '68.4', action: 'STRONG BUY 🔥', type: 'buy' },
      { asset: 'Crypto Top 10', time: '1m TF', rsi: '76.2 (Overbought)', action: 'SELL', type: 'sell' },
      { asset: 'EUR / USD', time: '30s TF', rsi: '48.2', action: 'NEUTRAL', type: 'neutral' },
      { asset: 'Gold (XAU/USD)', time: '2m TF', rsi: '28.3 (Oversold)', action: 'STRONG BUY', type: 'buy' },
      { asset: 'Safaricom PLC', time: '5m TF', rsi: '55.0', action: 'BUY', type: 'buy' }
    ];

    list.innerHTML = signalsData.map(s => `
      <div class="signal-item">
        <div class="signal-info">
          <h4>${s.asset}</h4>
          <small>${s.time} • RSI ${s.rsi}</small>
        </div>
        <span class="signal-action-pill ${s.type}">${s.action}</span>
      </div>
    `).join('');
  }

  // Kenyan Leaderboard
  renderLeaderboard() {
    const list = document.getElementById('leaderboard-list');
    if (!list) return;

    const leaders = [
      { rank: 1, name: 'Brian Mwangi 🇰🇪', city: 'Nairobi, Westlands', profit: 248500 },
      { rank: 2, name: 'Faith Chebet 🇰🇪', city: 'Mombasa, Nyali', profit: 189400 },
      { rank: 3, name: 'Kevin Otieno 🇰🇪', city: 'Kisumu, Milimani', profit: 138750 },
      { rank: 4, name: 'Dennis Kiprop 🇰🇪', city: 'Eldoret, CBD', profit: 94200 },
      { rank: 5, name: 'Mercy Wanjiku 🇰🇪', city: 'Nakuru, Section 58', profit: 83100 },
      { rank: 6, name: 'Samuel Ndung\'u 🇰🇪', city: 'Thika, Makongeni', profit: 67800 }
    ];

    list.innerHTML = leaders.map(l => `
      <div class="leader-card">
        <div class="leader-rank rank-${l.rank <= 3 ? l.rank : 'other'}">${l.rank}</div>
        <div class="leader-user">
          <div class="leader-name">${l.name}</div>
          <div class="leader-city">${l.city}</div>
        </div>
        <div class="leader-profit">+KSh ${l.profit.toLocaleString()}</div>
      </div>
    `).join('');
  }

  // M-Pesa Transaction History Log
  renderMpesaLog() {
    const list = document.getElementById('mpesa-log-list');
    if (!list) return;

    const txs = wallet.getTransactions();
    if (!txs || txs.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">📱</span>
          <p>No transactions yet</p>
          <small>Deposit or withdraw via Lipa Na M-Pesa to view receipts</small>
        </div>
      `;
      return;
    }

    list.innerHTML = txs.map(tx => {
      const isPending = (tx.status || '').toLowerCase().includes('pending');
      const isRejected = (tx.status || '').toLowerCase().includes('reject');
      const badgeText = isPending ? '⏳ Awaiting Admin Approval' : isRejected ? '✕ Rejected & Refunded' : '✓ Completed';
      const badgeStyle = isPending
        ? 'background:rgba(255,170,0,0.15); color:#ffaa00; border:1px solid rgba(255,170,0,0.3);'
        : isRejected
        ? 'background:rgba(255,51,102,0.15); color:#ff3366; border:1px solid rgba(255,51,102,0.3);'
        : 'background:rgba(0,255,136,0.15); color:#00ff88; border:1px solid rgba(0,255,136,0.3);';

      return `
        <div class="tx-card">
          <div class="tx-left">
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <span class="tx-code">${tx.id} • ${tx.type.toUpperCase()}</span>
              <span class="tx-status-badge" style="font-size:0.65rem; padding:0.15rem 0.45rem; border-radius:4px; font-weight:600; font-family:monospace; ${badgeStyle}">${badgeText}</span>
            </div>
            <span class="tx-time">${new Date(tx.time).toLocaleDateString()} ${new Date(tx.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • +254${tx.phone}</span>
          </div>
          <span class="tx-amt ${tx.type}">
            ${tx.type === 'deposit' ? '+' : '-'}KSh ${tx.amount.toLocaleString()}
          </span>
        </div>
      `;
    }).join('');
  }

  // Live Community Ticker
  startCommunityTicker() {
    const messages = [
      '🇰🇪 Mwangi N. (Nairobi) just won KSh 4,900 on USD/KES (98%)',
      '🇰🇪 Faith C. (Mombasa) just won KSh 9,400 on BTC/USDT (94%)',
      '🇰🇪 Kevin O. (Kisumu) entered Nairobi Super Sprint (KSh 500k Cup)',
      '🇰🇪 Dennis K. (Eldoret) just won KSh 14,700 on USD/KES (98%)',
      '🇰🇪 Mercy W. (Nakuru) unlocked "Safari Profit" Quest (+150 XP)',
      '🇰🇪 Juma O. (Thika) withdrew KSh 25,000 to M-Pesa B2C instant'
    ];

    const msgEl = document.getElementById('ticker-live-message');
    setInterval(() => {
      if (msgEl) {
        this.tickerIndex = (this.tickerIndex + 1) % messages.length;
        msgEl.style.opacity = '0';
        setTimeout(() => {
          msgEl.textContent = messages[this.tickerIndex];
          msgEl.style.opacity = '1';
        }, 300);
      }
    }, 4500);
  }

  // Update PIN Dots on simulated phone
  updatePinDots() {
    const pin = wallet.getPin();
    for (let i = 0; i < 4; i++) {
      const dot = document.getElementById(`dot-${i}`);
      if (dot) {
        if (i < pin.length) {
          dot.textContent = '●';
          dot.classList.add('filled');
        } else {
          dot.textContent = '○';
          dot.classList.remove('filled');
        }
      }
    }
  }

  // Notifications Toast
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'success' ? '✓' : (type === 'error' ? '✕' : 'ℹ');
    
    // Sanitize message before rendering to prevent XSS
    const safeMessage = security.sanitizeHTML(message);
    toast.innerHTML = `<span>${icon}</span> <span>${safeMessage}</span>`;
    
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(50px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // Server Clock
  startServerClock() {
    const clockEl = document.getElementById('server-clock');
    setInterval(() => {
      if (clockEl) {
        clockEl.textContent = new Date().toLocaleTimeString('en-GB');
      }
    }, 1000);
  }

  updateSoundIcon() {
    const soundEl = document.getElementById('sound-icon');
    if (soundEl) {
      soundEl.textContent = sound.isMuted() ? '🔇' : '🔊';
    }
  }

  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('hidden');
      modal.scrollTop = 0;
    }
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('hidden');
  }

  closeAuthModal() {
    const authScreen = document.getElementById('auth-screen');
    if (authScreen) authScreen.classList.add('hidden');
  }

  // Attach all user interactions
  attachEventListeners() {
    // 1. Order execution buttons
    document.getElementById('btn-trade-higher').addEventListener('click', () => {
      if (!auth.isLoggedIn() || !auth.hasRole('trader')) {
        this.openModal('auth-screen');
        return;
      }

      this.executeTrade('higher');
    });
    document.getElementById('btn-trade-lower').addEventListener('click', () => {
      if (!auth.isLoggedIn() || !auth.hasRole('trader')) {
        this.openModal('auth-screen');
        return;
      }

      this.executeTrade('lower');
    });

    // 2. Expiry duration selector pills
    const pills = document.querySelectorAll('.expiry-pill');
    pills.forEach(pill => {
      pill.addEventListener('click', (e) => {
        pills.forEach(p => p.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.selectedDuration = parseInt(e.currentTarget.dataset.seconds);
        const mins = Math.floor(this.selectedDuration / 60);
        const secs = this.selectedDuration % 60;
        document.getElementById('expiry-formatted').textContent = 
          `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        sound.playClick();
      });
    });

    // 3. Amount Input, Stepper & Chips
    const amountInput = document.getElementById('trade-amount-input');
    amountInput.addEventListener('input', () => this.updateOrderDeskCalculations());

    document.getElementById('btn-amount-plus').addEventListener('click', () => {
      sound.playClick();
      amountInput.value = (parseFloat(amountInput.value) || 0) + 100;
      this.updateOrderDeskCalculations();
    });

    document.getElementById('btn-amount-minus').addEventListener('click', () => {
      sound.playClick();
      amountInput.value = Math.max(100, (parseFloat(amountInput.value) || 0) - 100);
      this.updateOrderDeskCalculations();
    });

    document.querySelectorAll('.amount-chip[data-val]').forEach(chip => {
      chip.addEventListener('click', (e) => {
        sound.playClick();
        const add = parseInt(e.currentTarget.dataset.val);
        amountInput.value = (parseFloat(amountInput.value) || 0) + add;
        this.updateOrderDeskCalculations();
      });
    });

    document.getElementById('btn-amount-x2').addEventListener('click', () => {
      sound.playClick();
      amountInput.value = (parseFloat(amountInput.value) || 100) * 2;
      this.updateOrderDeskCalculations();
    });

    document.getElementById('btn-amount-half').addEventListener('click', () => {
      sound.playClick();
      amountInput.value = Math.max(100, Math.floor((parseFloat(amountInput.value) || 200) / 2));
      this.updateOrderDeskCalculations();
    });

    // 4. One Click Trading Toggle
    const oneClickCheck = document.getElementById('check-one-click');
    if (oneClickCheck) {
      oneClickCheck.addEventListener('change', (e) => {
        this.oneClickTrading = e.target.checked;
        sound.playClick();
        this.showToast(this.oneClickTrading ? '1-Click Trading enabled' : '1-Click Trading disabled', 'info');
      });
    }

    // 5. Chart Drawing Tools Dropdown
    const drawDropdown = document.getElementById('draw-dropdown');
    const drawTrigger = document.getElementById('btn-toggle-draw');
    const drawBadge = document.getElementById('draw-tool-badge');

    drawTrigger.addEventListener('click', () => {
      drawDropdown.classList.toggle('hidden');
    });

    document.querySelectorAll('.draw-opt-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tool = e.currentTarget.dataset.tool;
        this.chart.setDrawTool(tool);

        document.querySelectorAll('.draw-opt-btn[data-tool]').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');

        const labels = {
          none: 'Off',
          horizontal: 'S/R',
          trendline: 'Ray',
          fibonacci: 'Fib'
        };
        drawBadge.textContent = labels[tool] || 'Off';
        drawDropdown.classList.add('hidden');
        sound.playClick();

        if (tool !== 'none') {
          this.showToast(`Draw Mode: Click on chart to place ${labels[tool]}`, 'info');
        }
      });
    });

    document.getElementById('btn-clear-drawings').addEventListener('click', () => {
      this.chart.clearDrawings();
      drawDropdown.classList.add('hidden');
      sound.playClick();
      this.showToast('All chart lines cleared', 'info');
    });

    // 6. Floating Chart Zoom Controls
    document.getElementById('btn-zoom-in').addEventListener('click', () => {
      this.chart.zoomIn();
      sound.playClick();
    });
    document.getElementById('btn-zoom-out').addEventListener('click', () => {
      this.chart.zoomOut();
      sound.playClick();
    });
    document.getElementById('btn-zoom-reset').addEventListener('click', () => {
      this.chart.resetZoom();
      sound.playClick();
    });

    // 7. Wallet Switcher & Reload
    const walletPill = document.getElementById('wallet-pill-btn');
    const walletMenu = document.getElementById('wallet-menu');
    walletPill.addEventListener('click', () => {
      walletMenu.classList.toggle('hidden');
      sound.playClick();
    });

    document.addEventListener('click', (e) => {
      if (!walletPill.contains(e.target) && !walletMenu.contains(e.target)) {
        walletMenu.classList.add('hidden');
      }
      if (!drawTrigger.contains(e.target) && !drawDropdown.contains(e.target)) {
        drawDropdown.classList.add('hidden');
      }
    });

    document.getElementById('menu-select-demo').addEventListener('click', () => {
      wallet.setType('demo');
      sound.playClick();
      walletMenu.classList.add('hidden');
      this.showToast('Switched to Demo Account (KSh)', 'info');
    });

    document.getElementById('menu-select-real').addEventListener('click', () => {
      wallet.setType('real');
      sound.playClick();
      walletMenu.classList.add('hidden');
      this.showToast('Switched to Real Account (KES)', 'info');
    });

    // Trade Desk Quick Switcher (Demo vs Real)
    document.getElementById('desk-btn-demo')?.addEventListener('click', () => {
      wallet.setType('demo');
      sound.playClick();
      this.showToast('Switched to Demo Account (Virtual KSh)', 'info');
    });

    document.getElementById('desk-btn-real')?.addEventListener('click', () => {
      wallet.setType('real');
      sound.playClick();
      this.showToast('Switched to Real Account (Live KES)', 'info');
    });

    document.getElementById('btn-reload-demo').addEventListener('click', (e) => {
      e.stopPropagation();
      wallet.resetDemoBalance();
      this.showToast('Demo balance reset to KSh 1,000,000.00', 'success');
    });

    const openDepositFlow = () => {
      if (!auth.isLoggedIn()) {
        this.openModal('auth-screen');
        this.showToast('Please sign in or create an account to deposit funds', 'info');
        return;
      }
      const user = auth.getUser();
      const phoneInput = document.getElementById('mpesa-phone-input');
      if (phoneInput && user?.phone && !phoneInput.value) {
        phoneInput.value = user.phone;
      }
      this.openModal('modal-mpesa-deposit');
    };

    document.getElementById('btn-menu-deposit').addEventListener('click', (e) => {
      e.stopPropagation();
      walletMenu.classList.add('hidden');
      sound.playClick();
      openDepositFlow();
    });

    // 8. M-Pesa Deposit Flow
    document.getElementById('btn-header-deposit').addEventListener('click', () => {
      sound.playClick();
      openDepositFlow();
    });

    document.getElementById('btn-close-deposit-modal').addEventListener('click', () => {
      this.closeModal('modal-mpesa-deposit');
    });

    const mpesaAmtBtns = document.querySelectorAll('.mpesa-amt-btn');
    const customAmtInput = document.getElementById('mpesa-custom-amount');
    mpesaAmtBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        mpesaAmtBtns.forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        customAmtInput.value = e.currentTarget.dataset.amt;
        sound.playClick();
      });
    });

    document.getElementById('btn-submit-stk-push').addEventListener('click', async () => {
      if (!auth.isLoggedIn()) {
        this.closeModal('modal-mpesa-deposit');
        this.openModal('auth-screen');
        this.showToast('Please sign in or register before making a deposit', 'info');
        return;
      }

      const rawPhone = document.getElementById('mpesa-phone-input').value.trim();
      const amount = parseFloat(customAmtInput.value) || 0;

      // Extract raw digits & normalize Safaricom numbers
      let digits = rawPhone.replace(/\D/g, '');
      if (digits.startsWith('254') && digits.length === 12) {
        digits = digits.substring(3);
      } else if (digits.startsWith('0') && digits.length === 10) {
        digits = digits.substring(1);
      }

      if (digits.length !== 9) {
        this.showToast('Please enter a valid Safaricom phone number (e.g. 0712 345 678)', 'error');
        return;
      }
      if (amount < 10) {
        this.showToast('Minimum M-Pesa deposit is KSh 10', 'error');
        return;
      }

      const formattedPhone = '254' + digits;

      sound.playClick();
      const btn = document.getElementById('btn-submit-stk-push');
      const originalText = btn.innerHTML;
      btn.innerHTML = '<span>Sending STK Push...</span>';
      btn.disabled = true;

      try {
        const res = await api.depositMpesa(amount, formattedPhone);
        
        btn.innerHTML = originalText;
        btn.disabled = false;

        if (res.ok && res.data && res.data.success) {
          const data = res.data;
          if (data.isLive) {
            // Live gateway (PayHero / Daraja STK Push directly to phone)
            document.getElementById('mpesa-deposit-step-1').classList.add('hidden');
            const step3 = document.getElementById('mpesa-deposit-step-3');
            step3.classList.remove('hidden');

            const waitingEl = document.getElementById('mpesa-step3-waiting');
            const doneEl = document.getElementById('mpesa-step3-done');
            const countdownEl = document.getElementById('mpesa-step3-countdown');
            const resultTitle = document.getElementById('mpesa-step3-result-title');
            const resultIcon = document.getElementById('mpesa-step3-icon');

            if (waitingEl) waitingEl.style.display = '';
            if (doneEl) doneEl.style.display = 'none';

            let secs = 90;
            const countdownTimer = setInterval(() => {
              secs--;
              if (countdownEl) countdownEl.textContent = secs;
              if (secs <= 0) clearInterval(countdownTimer);
            }, 1000);

            this.showToast(`M-Pesa STK Push sent to +${formattedPhone}. Check your phone!`, 'success');

            const ref = data.checkoutRequestId;
            if (ref) {
              let attempts = 0;
              const maxAttempts = 22; // ~88s at 4s interval
              const pollInterval = setInterval(async () => {
                attempts++;
                try {
                  const checkRes = await api.getDepositStatus(ref);
                  if (checkRes.ok && checkRes.data) {
                    if (checkRes.data.status === 'COMPLETED') {
                      clearInterval(pollInterval);
                      clearInterval(countdownTimer);
                      sound.playMpesaCash();
                      wallet.setType('real');
                      await wallet.syncBalance();
                      if (waitingEl) waitingEl.style.display = 'none';
                      if (doneEl) doneEl.style.display = '';
                      if (resultIcon) { resultIcon.textContent = '✓'; resultIcon.style.color = '#00f59b'; }
                      if (resultTitle) resultTitle.textContent = 'Deposit Successful! 🎉';
                      const receiptCode = checkRes.data.mpesaReceipt || ('PH' + Date.now());
                      const newBal = (checkRes.data.updatedRealBalance || wallet.realBalance).toLocaleString('en-KE');
                      document.getElementById('mpesa-receipt-code').textContent =
                        `${receiptCode} Confirmed. KSh ${(checkRes.data.amount || amount).toLocaleString()} sent to Apex Binary. New Real Balance: KSh ${newBal}`;
                      this.showToast(`KSh ${(checkRes.data.amount || amount).toLocaleString()} deposited successfully!`, 'success');
                      return;
                    } else if (checkRes.data.status === 'FAILED') {
                      clearInterval(pollInterval);
                      clearInterval(countdownTimer);
                      if (waitingEl) waitingEl.style.display = 'none';
                      if (doneEl) doneEl.style.display = '';
                      if (resultIcon) { resultIcon.textContent = '✕'; resultIcon.style.color = '#ff4d6d'; }
                      if (resultTitle) resultTitle.textContent = 'Payment Not Completed';
                      document.getElementById('mpesa-receipt-code').textContent =
                        checkRes.data.rejectionReason || 'The M-Pesa request was cancelled or timed out. Please try again.';
                      this.showToast('M-Pesa payment failed or cancelled', 'error');
                      return;
                    }
                  }
                } catch (e) { /* ignore transient polling errors */ }

                if (attempts >= maxAttempts) {
                  clearInterval(pollInterval);
                  clearInterval(countdownTimer);
                  // Do a final balance sync — webhook may have fired even if polling missed it
                  try { await wallet.syncBalance(); } catch (_) {}
                  const balAfter = wallet.realBalance || 0;
                  if (waitingEl) waitingEl.style.display = 'none';
                  if (doneEl) doneEl.style.display = '';
                  if (resultIcon) { resultIcon.textContent = '⏱'; resultIcon.style.color = '#f59e0b'; }
                  if (resultTitle) resultTitle.textContent = 'Still Waiting…';
                  document.getElementById('mpesa-receipt-code').textContent =
                    `The prompt window closed. If you completed the M-Pesa payment, your balance (KSh ${balAfter.toLocaleString()}) has been updated. Refresh to confirm.`;
                }
              }, 4000);
            }
          } else {
            // Interactive STK Simulator Mode
            wallet.clearPin();
            this.updatePinDots();
            document.getElementById('mpesa-deposit-step-1').classList.add('hidden');
            document.getElementById('mpesa-deposit-step-2').classList.remove('hidden');
            document.getElementById('stk-prompt-amount').textContent = amount.toLocaleString();
            document.getElementById('stk-prompt-phone').textContent = `+${formattedPhone}`;
            const doneEl2 = document.getElementById('mpesa-step3-done');
            const waitEl2 = document.getElementById('mpesa-step3-waiting');
            if (doneEl2) doneEl2.style.display = '';
            if (waitEl2) waitEl2.style.display = 'none';
            const ri = document.getElementById('mpesa-step3-icon');
            const rt = document.getElementById('mpesa-step3-result-title');
            if (ri) { ri.textContent = '✓'; ri.style.color = ''; }
            if (rt) rt.textContent = 'Deposit Successful!';
          }
        } else {
          this.showToast(res.data?.message || 'Deposit failed. Please try again.', 'error');
        }
      } catch (err) {
        btn.innerHTML = originalText;
        btn.disabled = false;
        this.showToast(err.message || 'Network error initiating deposit.', 'error');
      }
    });

    document.querySelectorAll('#stk-keypad .keypad-btn[data-key]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        wallet.addPinDigit(e.currentTarget.dataset.key);
        this.updatePinDots();
      });
    });

    document.getElementById('btn-keypad-clear').addEventListener('click', () => {
      wallet.clearPin();
      this.updatePinDots();
      sound.playClick();
    });

    document.getElementById('btn-keypad-backspace').addEventListener('click', () => {
      wallet.deletePinDigit();
      this.updatePinDots();
    });

    document.getElementById('btn-stk-cancel').addEventListener('click', () => {
      wallet.clearPin();
      document.getElementById('mpesa-deposit-step-2').classList.add('hidden');
      document.getElementById('mpesa-deposit-step-1').classList.remove('hidden');
    });

    document.getElementById('btn-stk-confirm').addEventListener('click', async () => {
      const phone = document.getElementById('mpesa-phone-input').value.trim();
      const amount = parseFloat(customAmtInput.value) || 0;

      const receipt = await wallet.completeMpesaDeposit(amount, phone);

      document.getElementById('mpesa-deposit-step-2').classList.add('hidden');
      document.getElementById('mpesa-deposit-step-3').classList.remove('hidden');
      document.getElementById('mpesa-deposit-step-3').querySelector('h3').textContent = 'Deposit Successful!';
      document.getElementById('mpesa-receipt-code').textContent = receipt.message;
      this.showToast(`KSh ${amount.toLocaleString()} deposited to Real Account!`, 'success');
    });

    document.getElementById('btn-finish-deposit').addEventListener('click', () => {
      document.getElementById('mpesa-deposit-step-3').classList.add('hidden');
      document.getElementById('mpesa-deposit-step-1').classList.remove('hidden');
      this.closeModal('modal-mpesa-deposit');
    });

    // 9. M-Pesa Withdrawal Flow
    document.getElementById('btn-header-withdraw').addEventListener('click', () => {
      sound.playClick();
      this.openModal('modal-mpesa-withdraw');
    });

    document.getElementById('btn-close-withdraw-modal').addEventListener('click', () => {
      this.closeModal('modal-mpesa-withdraw');
    });

    const withdrawInput = document.getElementById('withdraw-amount-input');
    withdrawInput.addEventListener('input', () => {
      const amt = parseFloat(withdrawInput.value) || 0;
      document.getElementById('withdraw-fee-transfer').textContent = wallet.formatCurrency(amt);
      document.getElementById('withdraw-fee-net').textContent = wallet.formatCurrency(amt);
    });

    document.getElementById('btn-submit-withdrawal').addEventListener('click', async () => {
      const phone = document.getElementById('withdraw-phone-input').value.trim();
      const amt = parseFloat(withdrawInput.value) || 0;

      if (!phone || phone.length < 9) {
        this.showToast('Please enter a valid Safaricom number', 'error');
        return;
      }
      if (amt < 200) {
        this.showToast('Minimum withdrawal is KSh 200', 'error');
        return;
      }

      const btn = document.getElementById('btn-submit-withdrawal');
      const originalText = btn.innerHTML;
      btn.innerHTML = '<span>Processing...</span>';
      btn.disabled = true;

      const res = await wallet.withdrawMpesa(amt, phone);
      
      btn.innerHTML = originalText;
      btn.disabled = false;

      if (res.success) {
        this.showToast(res.message, 'success');
        this.closeModal('modal-mpesa-withdraw');
        withdrawInput.value = '';
      } else {
        this.showToast(res.message, 'error');
      }
    });

    // 10. Chart View Controls (Candles vs Area, Timeframes, Indicators)
    document.getElementById('btn-chart-candles').addEventListener('click', (e) => {
      document.getElementById('btn-chart-area').classList.remove('active');
      e.currentTarget.classList.add('active');
      this.chart.setChartType('candles');
      sound.playClick();
    });

    document.getElementById('btn-chart-area').addEventListener('click', (e) => {
      document.getElementById('btn-chart-candles').classList.remove('active');
      e.currentTarget.classList.add('active');
      this.chart.setChartType('area');
      sound.playClick();
    });

    document.querySelectorAll('#timeframe-group .tool-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('#timeframe-group .tool-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        market.setTimeframe(e.currentTarget.dataset.tf);
        sound.playClick();
      });
    });

    // Indicator toggles
    const indMenu = document.getElementById('indicators-dropdown');
    document.getElementById('btn-toggle-indicators').addEventListener('click', () => {
      indMenu.classList.toggle('hidden');
    });

    ['check-sma7', 'check-sma25', 'check-bollinger', 'check-rsi'].forEach(id => {
      document.getElementById(id).addEventListener('change', () => {
        const sma7 = document.getElementById('check-sma7').checked;
        const sma25 = document.getElementById('check-sma25').checked;
        const bollinger = document.getElementById('check-bollinger').checked;
        const rsi = document.getElementById('check-rsi').checked;

        const count = [sma7, sma25, bollinger, rsi].filter(Boolean).length;
        document.getElementById('indicators-badge').textContent = count;
        document.getElementById('rsi-subpanel').classList.toggle('hidden', !rsi);

        this.chart.setIndicators({ sma7, sma25, bollinger, rsi });
        this.chart.resize();
      });
    });

    // AI Candlestick Patterns Toggle
    const patternBtn = document.getElementById('btn-toggle-patterns');
    if (patternBtn) {
      patternBtn.addEventListener('click', () => {
        this.patternsEnabled = !this.patternsEnabled;
        this.chart.setShowPatterns(this.patternsEnabled);
        patternBtn.classList.toggle('active', this.patternsEnabled);
        const badge = document.getElementById('patterns-status-badge');
        if (badge) badge.textContent = this.patternsEnabled ? 'ON' : 'OFF';
        sound.playClick();
        this.showToast(`AI Candlestick Patterns: ${this.patternsEnabled ? 'Enabled' : 'Disabled'}`, 'info');
      });
    }

    // 11. Drawer & Activity Dock
    const dockBtns = document.querySelectorAll('.dock-btn');
    const drawer = document.getElementById('drawer-panel');
    dockBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        sound.playClick();
        const tab = e.currentTarget.dataset.tab;

        dockBtns.forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');

        drawer.classList.remove('collapsed');
        document.getElementById('drawer-title').textContent = 
          tab.charAt(0).toUpperCase() + tab.slice(1);

        document.querySelectorAll('.drawer-tab-content').forEach(tc => tc.classList.add('hidden'));
        const target = document.getElementById(`tab-content-${tab}`);
        if (target) target.classList.remove('hidden');

        // Sync mobile bottom nav if active
        document.querySelectorAll('.mob-nav-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.tab === tab);
        });
      });
    });

    // Mobile Bottom Navigation
    const mobNavBtns = document.querySelectorAll('.mob-nav-btn[data-tab]');
    mobNavBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        sound.playClick();
        const tab = e.currentTarget.dataset.tab;
        mobNavBtns.forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');

        drawer.classList.remove('collapsed');
        document.getElementById('drawer-title').textContent = tab.charAt(0).toUpperCase() + tab.slice(1);
        document.querySelectorAll('.drawer-tab-content').forEach(tc => tc.classList.add('hidden'));
        const target = document.getElementById(`tab-content-${tab}`);
        if (target) target.classList.remove('hidden');

        dockBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      });
    });

    document.getElementById('mob-nav-deposit')?.addEventListener('click', () => {
      sound.playClick();
      this.openModal('modal-mpesa-deposit');
    });

    document.getElementById('btn-close-drawer').addEventListener('click', () => {
      drawer.classList.add('collapsed');
      dockBtns.forEach(b => b.classList.remove('active'));
    });

    // Trades sub-tabs
    document.getElementById('tab-active-trades').addEventListener('click', (e) => {
      document.getElementById('tab-closed-trades').classList.remove('active');
      e.currentTarget.classList.add('active');
      document.getElementById('active-trades-list').classList.remove('hidden');
      document.getElementById('closed-trades-list').classList.add('hidden');
    });

    document.getElementById('tab-closed-trades').addEventListener('click', (e) => {
      document.getElementById('tab-active-trades').classList.remove('active');
      e.currentTarget.classList.add('active');
      document.getElementById('closed-trades-list').classList.remove('hidden');
      document.getElementById('active-trades-list').classList.add('hidden');
    });

    // Tournaments sub-tabs
    document.getElementById('tab-tourn-list').addEventListener('click', (e) => {
      document.getElementById('tab-quests-list').classList.remove('active');
      e.currentTarget.classList.add('active');
      document.getElementById('tournaments-container').classList.remove('hidden');
      document.getElementById('quests-container').classList.add('hidden');
    });

    document.getElementById('tab-quests-list').addEventListener('click', (e) => {
      document.getElementById('tab-tourn-list').classList.remove('active');
      e.currentTarget.classList.add('active');
      document.getElementById('quests-container').classList.remove('hidden');
      document.getElementById('tournaments-container').classList.add('hidden');
    });

    // 12. All Assets Modal & Filters
    document.getElementById('btn-open-asset-modal').addEventListener('click', () => {
      sound.playClick();
      this.openModal('modal-assets');
    });

    document.getElementById('btn-close-asset-modal').addEventListener('click', () => {
      this.closeModal('modal-assets');
    });

    document.querySelectorAll('.filter-pill').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const cat = e.currentTarget.dataset.category;
        const q = document.getElementById('asset-search-input').value;
        this.renderAllAssetsModal(cat, q);
      });
    });

    document.getElementById('asset-search-input').addEventListener('input', (e) => {
      const activeFilter = document.querySelector('.filter-pill.active')?.dataset.category || 'all';
      this.renderAllAssetsModal(activeFilter, e.target.value);
    });

    // 13. Sound & Fullscreen
    document.getElementById('btn-toggle-sound').addEventListener('click', () => {
      sound.toggleMute();
      this.updateSoundIcon();
      this.showToast(sound.isMuted() ? 'Sound muted' : 'Sound enabled', 'info');
    });

    document.getElementById('btn-toggle-fullscreen').addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });

    // 14. Settlement Continue & Overlays
    document.getElementById('btn-settlement-continue').addEventListener('click', () => {
      document.getElementById('settlement-overlay').classList.add('hidden');
    });
    
    document.getElementById('btn-close-level-up')?.addEventListener('click', () => {
      document.getElementById('level-up-overlay').classList.add('hidden');
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowUp') {
        this.executeTrade('higher');
      } else if (e.key === 'ArrowDown') {
        this.executeTrade('lower');
      }
    });
  }

  executeTrade(direction) {
    if (!auth.isLoggedIn()) {
      this.showToast('Please log in or create an account to place trades.', 'error');
      this.openModal('auth-screen');
      return;
    }
    const res = this.trading.placeTrade(direction, this.stakeAmount, this.selectedDuration);
    if (!res.success) {
      this.showToast(res.message, 'error');
      if (res.message.includes('Insufficient funds')) {
        this.openModal('modal-mpesa-deposit');
      }
    } else {
      const dirText = direction === 'higher' ? 'HIGHER (CALL)' : 'LOWER (PUT)';
      this.showToast(`${dirText} order placed for KSh ${this.stakeAmount.toLocaleString()}!`, 'success');
    }
  }
}

// Bootstrap on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});

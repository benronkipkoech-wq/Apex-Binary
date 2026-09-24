/**
 * APEX BINARY — ADMIN CONTROLLER JAVASCRIPT
 * Executive Operations & M-Pesa Cashier Management
 */

(function () {
  'use strict';

  const API_BASE = '/api';
  let adminToken = localStorage.getItem('apex_admin_token') || null;
  let adminUser = null;

  // DOM Elements
  const loginModal = document.getElementById('admin-login-modal');
  const loginForm = document.getElementById('admin-login-form');
  const loginError = document.getElementById('login-error-alert');
  const btnSeedAdmin = document.getElementById('btn-seed-admin');
  const dashboardContainer = document.getElementById('admin-dashboard-container');
  const btnLogout = document.getElementById('btn-logout');

  const liveClock = document.getElementById('live-clock');
  const dbStatusBadge = document.getElementById('db-status-badge');
  const dbStatusText = document.getElementById('db-status-text');
  const adminUserName = document.getElementById('admin-user-name');
  const pendingBadge = document.getElementById('pending-withdrawals-badge');

  // Modals
  const balanceModal = document.getElementById('balance-modal');
  const btnCloseBalanceModal = document.getElementById('btn-close-balance-modal');
  const balanceAdjustForm = document.getElementById('balance-adjust-form');
  const adjustUserId = document.getElementById('adjust-user-id');
  const balanceModalUser = document.getElementById('balance-modal-user');
  const adjustAccountType = document.getElementById('adjust-account-type');
  const adjustAmount = document.getElementById('adjust-amount');

  // Toasts
  const toastContainer = document.getElementById('toast-container');

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span> <span>${message}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // API helper with JWT
  async function apiCall(endpoint, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (adminToken) {
      headers['Authorization'] = `Bearer ${adminToken}`;
    }

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : null,
      });

      const data = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 403) {
        if (adminToken && endpoint !== '/auth/login') {
          handleLogout('Session expired or unauthorized.');
        }
      }
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      return { ok: false, status: 0, data: { message: err.message } };
    }
  }

  // Clock
  function updateClock() {
    const now = new Date();
    liveClock.textContent = now.toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi' });
  }
  setInterval(updateClock, 1000);
  updateClock();

  // Health & DB status
  async function checkHealth() {
    const { ok } = await apiCall('/health');
    const dot = dbStatusBadge.querySelector('.status-dot');
    if (ok) {
      dot.className = 'status-dot online';
      dbStatusText.textContent = 'Server & Engine Active';
    } else {
      dot.className = 'status-dot';
      dbStatusText.textContent = 'Engine Offline';
    }
  }

  // Authentication Flow
  async function initAuth() {
    if (!adminToken) {
      showLogin();
      return;
    }

    const { ok, data } = await apiCall('/auth/me');
    if (ok && data?.user && data.user.role === 'admin') {
      adminUser = data.user;
      showDashboard();
    } else {
      showLogin();
    }
  }

  function showLogin() {
    dashboardContainer.classList.add('hidden');
    loginModal.classList.add('active');
  }

  function showDashboard() {
    loginModal.classList.remove('active');
    dashboardContainer.classList.remove('hidden');
    adminUserName.textContent = adminUser?.fullName || 'Super Administrator';
    checkHealth();
    loadOverviewMetrics();
    loadPendingWithdrawals();
  }

  function handleLogout(msg = null) {
    adminToken = null;
    adminUser = null;
    localStorage.removeItem('apex_admin_token');
    showLogin();
    if (msg) showToast(msg, 'info');
  }

  // Login Submit
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.classList.add('hidden');

    const email = document.getElementById('admin-email').value.trim();
    const password = document.getElementById('admin-password').value;

    const { ok, data } = await apiCall('/auth/login', 'POST', { email, password });
    if (ok && data.token) {
      if (data.user?.role !== 'admin') {
        loginError.textContent = 'Access Denied: This account does not possess administrator privileges.';
        loginError.classList.remove('hidden');
        return;
      }
      adminToken = data.token;
      adminUser = data.user;
      localStorage.setItem('apex_admin_token', adminToken);
      showDashboard();
      showToast('Authenticated as Administrator', 'success');
    } else {
      loginError.textContent = data.message || 'Login failed. Please check credentials.';
      loginError.classList.remove('hidden');
    }
  });

  // Seed Admin Action
  btnSeedAdmin.addEventListener('click', async () => {
    btnSeedAdmin.disabled = true;
    btnSeedAdmin.textContent = 'Seeding account...';
    const { ok, data } = await apiCall('/auth/seed-admin', 'POST', {});
    btnSeedAdmin.disabled = false;
    btnSeedAdmin.textContent = 'Seed Default Admin Account';

    if (ok) {
      document.getElementById('admin-email').value = data.credentials.email;
      document.getElementById('admin-password').value = data.credentials.defaultPassword;
      showToast('Default admin seeded! Password filled. Click Authenticate.', 'success');
    } else {
      showToast(data.message || 'Could not seed admin (might already exist).', 'error');
    }
  });

  btnLogout.addEventListener('click', () => handleLogout('Signed out successfully.'));

  // Tab Navigation
  const navItems = document.querySelectorAll('.nav-item');
  const tabPanes = document.querySelectorAll('.admin-tab-pane');

  navItems.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      navItems.forEach((n) => n.classList.remove('active'));
      tabPanes.forEach((p) => p.classList.remove('active'));

      btn.classList.add('active');
      const pane = document.getElementById(`tab-${targetTab}`);
      if (pane) pane.classList.add('active');

      if (targetTab === 'overview') loadOverviewMetrics();
      if (targetTab === 'cashier') loadPendingWithdrawals();
      if (targetTab === 'traders') loadTraders();
      if (targetTab === 'trades') loadRecentTrades();
      if (targetTab === 'risk') loadSettings();
    });
  });

  // ==========================================
  // TAB 1: OVERVIEW METRICS
  // ==========================================
  async function loadOverviewMetrics() {
    const { ok, data } = await apiCall('/admin/metrics');
    if (!ok || !data.metrics) return;

    const m = data.metrics;
    document.getElementById('kpi-net-profit').textContent = `KSh ${Number(m.houseNetRevenue).toLocaleString()}`;
    document.getElementById('kpi-total-deposits').textContent = `KSh ${Number(m.totalDeposits).toLocaleString()}`;
    document.getElementById('kpi-total-withdrawals').textContent = `KSh ${Number(m.totalWithdrawals).toLocaleString()}`;
    document.getElementById('kpi-pending-withdrawals').textContent = m.pendingWithdrawals;
    document.getElementById('kpi-pending-amount').textContent = `KSh ${Number(m.pendingWithdrawalsAmount).toLocaleString()} waiting`;
    document.getElementById('kpi-total-users').textContent = m.totalUsers;
    document.getElementById('kpi-total-volume').textContent = `KSh ${Number(m.totalVolume).toLocaleString()}`;

    document.getElementById('open-trades-count').textContent = m.activeTradesCount;
    document.getElementById('open-risk-exposure').textContent = `KSh ${Number(m.openRisk).toLocaleString()}`;

    if (m.pendingWithdrawals > 0) {
      pendingBadge.textContent = m.pendingWithdrawals;
      pendingBadge.classList.remove('hidden');
    } else {
      pendingBadge.classList.add('hidden');
    }
  }

  document.getElementById('btn-refresh-metrics')?.addEventListener('click', () => {
    loadOverviewMetrics();
    showToast('Metrics updated', 'success');
  });

  // ==========================================
  // TAB 2: M-PESA CASHIER QUEUE
  // ==========================================
  async function loadPendingWithdrawals() {
    const tbody = document.getElementById('withdrawals-tbody');
    tbody.innerHTML = `<tr><td colspan="7" class="loading-state">Querying pending withdrawals from MongoDB...</td></tr>`;

    const { ok, data } = await apiCall('/admin/withdrawals/pending');
    if (!ok || !data.withdrawals) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Failed to load withdrawals.</td></tr>`;
      return;
    }

    if (data.withdrawals.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No pending withdrawals in the queue.</td></tr>`;
      pendingBadge.classList.add('hidden');
      return;
    }

    pendingBadge.textContent = data.withdrawals.length;
    pendingBadge.classList.remove('hidden');

    tbody.innerHTML = '';
    data.withdrawals.forEach((tx) => {
      const user = tx.userId || {};
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${new Date(tx.createdAt).toLocaleString('en-GB')}</td>
        <td><strong class="copy-cell" style="cursor:pointer;" title="Click to copy">${tx.phone} 📋</strong></td>
        <td>${user.fullName || 'Trader'}</td>
        <td style="color:var(--accent-gold); font-weight:700;">KSh ${Number(tx.amount).toLocaleString()}</td>
        <td>KSh ${(user.balances?.real || 0).toLocaleString()}</td>
        <td><span class="badge-status pending">${tx.method}</span></td>
        <td>
          <button class="btn-table-action approve" data-id="${tx._id}" data-amount="${tx.amount}" data-phone="${tx.phone}">Approve & Disburse</button>
          <button class="btn-table-action reject" data-id="${tx._id}" data-amount="${tx.amount}">Reject & Refund</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.btn-table-action.approve').forEach((btn) => {
      btn.addEventListener('click', () => approveWithdrawal(btn.dataset.id, btn.dataset.phone, btn.dataset.amount));
    });

    tbody.querySelectorAll('.btn-table-action.reject').forEach((btn) => {
      btn.addEventListener('click', () => rejectWithdrawal(btn.dataset.id, btn.dataset.amount));
    });
  }

  async function approveWithdrawal(txId, phone, amount) {
    if (!confirm(`Confirm disbursement of KSh ${Number(amount).toLocaleString()} to ${phone}?`)) return;

    const receipt = prompt('Enter M-Pesa B2C Receipt code (leave blank for auto-generated):', '');
    const { ok, data } = await apiCall(`/admin/withdrawals/${txId}/approve`, 'POST', { mpesaReceipt: receipt || undefined });
    if (ok) {
      showToast(data.message || 'Withdrawal approved & disbursed!', 'success');
      playChime(659.25);
      loadPendingWithdrawals();
      loadOverviewMetrics();
    } else {
      showToast(data.message || 'Failed to approve withdrawal', 'error');
    }
  }

  async function rejectWithdrawal(txId, amount) {
    const reason = prompt(`Enter reason for rejecting this KSh ${Number(amount).toLocaleString()} withdrawal:`, 'Compliance verification required');
    if (reason === null) return;

    const { ok, data } = await apiCall(`/admin/withdrawals/${txId}/reject`, 'POST', { reason });
    if (ok) {
      showToast(data.message || 'Withdrawal rejected & refunded.', 'info');
      playChime(329.63, 'sawtooth');
      loadPendingWithdrawals();
      loadOverviewMetrics();
    } else {
      showToast(data.message || 'Failed to reject withdrawal', 'error');
    }
  }

  document.getElementById('btn-refresh-withdrawals')?.addEventListener('click', loadPendingWithdrawals);

  // ==========================================
  // TAB 3: TRADER MANAGEMENT
  // ==========================================
  async function loadTraders(search = '') {
    const tbody = document.getElementById('traders-tbody');
    tbody.innerHTML = `<tr><td colspan="7" class="loading-state">Querying trader directory...</td></tr>`;

    const { ok, data } = await apiCall(`/admin/users?search=${encodeURIComponent(search)}`);
    if (!ok || !data.users) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Failed to load traders.</td></tr>`;
      return;
    }

    if (data.users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No trader accounts found.</td></tr>`;
      return;
    }

    tbody.innerHTML = '';
    data.users.forEach((u) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div style="font-weight:600;">${u.fullName || 'Apex Trader'}</div>
          <div style="font-size:0.75rem; color:var(--text-muted);">${u.email}</div>
        </td>
        <td style="font-family:var(--font-mono);">${u.phone}</td>
        <td style="color:var(--accent-green); font-weight:700;">KSh ${(u.balances?.real || 0).toLocaleString()}</td>
        <td style="color:var(--accent-cyan);">KSh ${(u.balances?.demo || 0).toLocaleString()}</td>
        <td>
          <span class="badge-status ${u.kyc?.status === 'approved' ? 'success' : u.kyc?.status === 'pending' ? 'pending' : 'danger'}">
            ${(u.kyc?.status || 'unverified').toUpperCase()}
          </span>
        </td>
        <td>
          <span class="badge-status ${u.isBanned ? 'danger' : 'success'}">
            ${u.isBanned ? 'SUSPENDED' : 'ACTIVE'}
          </span>
        </td>
        <td>
          <button class="btn-table-action edit" data-id="${u._id}" data-name="${u.fullName || u.email}">Adjust Balance</button>
          <button class="btn-table-action ${u.isBanned ? 'approve' : 'reject'}" data-id="${u._id}" data-banned="${u.isBanned}">
            ${u.isBanned ? 'Unban' : 'Suspend'}
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.btn-table-action.edit').forEach((btn) => {
      btn.addEventListener('click', () => openBalanceModal(btn.dataset.id, btn.dataset.name));
    });

    tbody.querySelectorAll('.btn-table-action.reject, .btn-table-action.approve').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const currentBanned = btn.dataset.banned === 'true';
        const { ok, data } = await apiCall(`/admin/users/${id}`, 'PATCH', { isBanned: !currentBanned });
        if (ok) {
          showToast(`Trader account ${!currentBanned ? 'suspended' : 'reactivated'}.`, 'success');
          loadTraders(document.getElementById('user-search-input').value);
        }
      });
    });
  }

  document.getElementById('btn-search-users')?.addEventListener('click', () => {
    const q = document.getElementById('user-search-input').value.trim();
    loadTraders(q);
  });

  // Balance Adjust Modal
  function openBalanceModal(userId, userName) {
    adjustUserId.value = userId;
    balanceModalUser.textContent = `Adjusting account for: ${userName}`;
    adjustAmount.value = '';
    balanceModal.classList.add('active');
  }

  btnCloseBalanceModal.addEventListener('click', () => balanceModal.classList.remove('active'));

  balanceAdjustForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = adjustUserId.value;
    const type = adjustAccountType.value;
    const amt = parseFloat(adjustAmount.value);

    if (isNaN(amt) || amt === 0) {
      showToast('Please enter a valid adjustment amount', 'error');
      return;
    }

    const payload = type === 'real' ? { adjustRealBalance: amt } : { adjustDemoBalance: amt };
    const { ok, data } = await apiCall(`/admin/users/${id}`, 'PATCH', payload);
    if (ok) {
      showToast('Balance adjusted successfully!', 'success');
      balanceModal.classList.remove('active');
      loadTraders(document.getElementById('user-search-input').value);
      loadOverviewMetrics();
    } else {
      showToast(data.message || 'Failed to adjust balance', 'error');
    }
  });

  // ==========================================
  // TAB 4: LIVE TRADES MONITOR
  // ==========================================
  async function loadRecentTrades() {
    const tbody = document.getElementById('trades-tbody');
    tbody.innerHTML = `<tr><td colspan="9" class="loading-state">Streaming trade records from MongoDB...</td></tr>`;

    const { ok, data } = await apiCall('/admin/trades/recent?limit=50');
    if (!ok || !data.trades) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty-state">Failed to load trades.</td></tr>`;
      return;
    }

    if (data.trades.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty-state">No trades executed yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = '';
    data.trades.forEach((t) => {
      const user = t.userId || {};
      const tr = document.createElement('tr');
      const isWin = t.outcome === 'WIN';
      const isLoss = t.outcome === 'LOSS';
      const outcomeBadge = isWin ? 'success' : isLoss ? 'danger' : 'pending';

      tr.innerHTML = `
        <td>${new Date(t.openedAt).toLocaleTimeString('en-GB')}</td>
        <td>${user.phone || user.email || 'Trader'}</td>
        <td style="font-weight:700;">${t.asset}</td>
        <td><span style="color:${t.direction === 'CALL' ? 'var(--accent-green)' : 'var(--accent-red)'}; font-weight:700;">▲ ${t.direction}</span></td>
        <td>KSh ${Number(t.amount).toLocaleString()}</td>
        <td style="font-family:var(--font-mono);">${t.entryPrice?.toFixed(2) || '--'}</td>
        <td style="font-family:var(--font-mono);">${t.closePrice?.toFixed(2) || 'Active'}</td>
        <td><span class="badge-status ${outcomeBadge}">${t.outcome}</span></td>
        <td style="font-weight:700; color:${isWin ? 'var(--accent-green)' : isLoss ? 'var(--accent-red)' : 'var(--text-muted)'};">
          ${isWin ? '+KSh ' + Number(t.profit).toLocaleString() : isLoss ? '-KSh ' + Number(t.amount).toLocaleString() : 'Pending'}
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  document.getElementById('btn-refresh-trades')?.addEventListener('click', loadRecentTrades);

  // ==========================================
  // TAB 5: RISK & PAYOUT LIMITS
  // ==========================================
  const sliders = [
    { id: 'rate-btc', valId: 'rate-btc-val', asset: 'BTC/USD' },
    { id: 'rate-eth', valId: 'rate-eth-val', asset: 'ETH/USD' },
    { id: 'rate-sol', valId: 'rate-sol-val', asset: 'SOL/USD' },
    { id: 'rate-eur', valId: 'rate-eur-val', asset: 'EUR/USD' },
    { id: 'rate-kes', valId: 'rate-kes-val', asset: 'USD/KES' },
  ];

  sliders.forEach(({ id, valId }) => {
    const input = document.getElementById(id);
    const label = document.getElementById(valId);
    if (input && label) {
      input.addEventListener('input', () => {
        label.textContent = `${input.value}%`;
      });
    }
  });

  async function loadSettings() {
    const { ok, data } = await apiCall('/admin/settings');
    if (!ok || !data.settings) return;

    const s = data.settings;
    const rates = s.payoutRates || {};

    sliders.forEach(({ id, valId, asset }) => {
      const rateVal = rates[asset] ? Math.round(rates[asset] * 100) : null;
      if (rateVal) {
        document.getElementById(id).value = rateVal;
        document.getElementById(valId).textContent = `${rateVal}%`;
      }
    });

    if (s.minDeposit) document.getElementById('setting-min-deposit').value = s.minDeposit;
    if (s.minWithdrawal) document.getElementById('setting-min-withdraw').value = s.minWithdrawal;
    if (s.maxTradeLimit) document.getElementById('setting-max-trade').value = s.maxTradeLimit;
    if (s.maintenanceMode !== undefined) document.getElementById('setting-maintenance').checked = s.maintenanceMode;
  }

  document.getElementById('btn-save-settings')?.addEventListener('click', async () => {
    const payoutRates = {};
    sliders.forEach(({ id, asset }) => {
      payoutRates[asset] = parseFloat(document.getElementById(id).value) / 100;
    });

    const payload = {
      payoutRates,
      minDeposit: parseFloat(document.getElementById('setting-min-deposit').value),
      minWithdrawal: parseFloat(document.getElementById('setting-min-withdraw').value),
      maxTradeLimit: parseFloat(document.getElementById('setting-max-trade').value),
      maintenanceMode: document.getElementById('setting-maintenance').checked,
    };

    const { ok, data } = await apiCall('/admin/settings', 'PUT', payload);
    if (ok) {
      showToast('Risk parameters and payout rates saved!', 'success');
      playChime(784); // G5 chime
    } else {
      showToast(data.message || 'Failed to save settings', 'error');
    }
  });
  // Web Audio Synth chime for alerts and approvals
  function playChime(freq = 587.33, type = 'sine') {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch (e) {}
  }

  // CSV Exporter Helper
  function downloadCsv(filename, rows) {
    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(e => e.map(i => `"${String(i).replace(/"/g, '""')}"`).join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast(`Exported ${filename}`, 'success');
  }

  // Export Cashier Table
  document.getElementById('btn-export-cashier-csv')?.addEventListener('click', () => {
    const rows = [['Date', 'Phone', 'Trader Name', 'Amount (KES)', 'Method', 'Status']];
    const trs = document.querySelectorAll('#withdrawals-tbody tr');
    trs.forEach(tr => {
      const tds = tr.querySelectorAll('td');
      if (tds.length >= 6) {
        rows.push([tds[0].innerText, tds[1].innerText, tds[2].innerText, tds[3].innerText, tds[5].innerText, 'PENDING']);
      }
    });
    downloadCsv(`apex_cashier_withdrawals_${Date.now()}.csv`, rows);
  });

  // Export Trades Table
  document.getElementById('btn-export-trades-csv')?.addEventListener('click', () => {
    const rows = [['Time', 'Trader', 'Asset', 'Direction', 'Stake (KES)', 'Strike', 'Close Price', 'Outcome', 'Profit/Loss']];
    const trs = document.querySelectorAll('#trades-tbody tr');
    trs.forEach(tr => {
      const tds = tr.querySelectorAll('td');
      if (tds.length >= 8) {
        rows.push([tds[0].innerText, tds[1].innerText, tds[2].innerText, tds[3].innerText, tds[4].innerText, tds[5].innerText, tds[6].innerText, tds[7].innerText, tds[8]?.innerText || '']);
      }
    });
    downloadCsv(`apex_live_trades_${Date.now()}.csv`, rows);
  });

  // Auto-Refresh Loop (Every 5s when active)
  let currentActiveTab = 'overview';
  navItems.forEach((btn) => {
    btn.addEventListener('click', () => {
      currentActiveTab = btn.getAttribute('data-tab');
    });
  });

  setInterval(() => {
    const check = document.getElementById('check-auto-refresh');
    if (check && check.checked && adminToken && dashboardContainer && !dashboardContainer.classList.contains('hidden')) {
      loadOverviewMetrics();
      if (currentActiveTab === 'cashier') loadPendingWithdrawals();
      if (currentActiveTab === 'trades') loadRecentTrades();
    }
  }, 5000);

  // Delegated copy-to-clipboard handler
  document.addEventListener('click', (e) => {
    const copyEl = e.target.closest('.copy-cell');
    if (copyEl) {
      const text = copyEl.innerText.replace('📋', '').trim();
      navigator.clipboard.writeText(text).then(() => {
        showToast(`Copied ${text} to clipboard!`, 'info');
        playChime(880); // High chime
      });
    }
  });

  // Start initialization
  initAuth();
})();

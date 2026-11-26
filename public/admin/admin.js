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

  // ==========================================
  // SHOW / HIDE PASSWORD TOGGLE
  // ==========================================
  document.addEventListener('click', (e) => {
    const eyeBtn = e.target.closest('.btn-pw-eye');
    if (!eyeBtn) return;
    const targetId = eyeBtn.getAttribute('data-target');
    const input = document.getElementById(targetId);
    if (!input) return;
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    eyeBtn.innerHTML = isHidden ? '&#128064;' : '&#128065;'; // open eye / closed eye
    eyeBtn.title = isHidden ? 'Hide password' : 'Show password';
    eyeBtn.classList.toggle('pw-eye-active', isHidden);
  });

  // ==========================================

  // Copy button beside each input field (copies field's current value)
  document.querySelectorAll('.btn-field-copy').forEach((btn) => {
    btn.addEventListener('click', () => {
      const fieldId = btn.getAttribute('data-copy-from');
      const field = document.getElementById(fieldId);
      if (!field) return;
      const value = field.value;
      if (!value) {
        // If field is empty, copy placeholder/default
        const defaultVal = field.getAttribute('placeholder');
        if (defaultVal) {
          navigator.clipboard.writeText(defaultVal).then(() => {
            btn.textContent = '✓';
            showToast(`✓ Copied placeholder value`, 'info');
            setTimeout(() => { btn.innerHTML = '&#x29c9;'; }, 1200);
          });
        }
        return;
      }
      navigator.clipboard.writeText(value).then(() => {
        btn.textContent = '✓';
        showToast(`✓ Copied to clipboard`, 'success');
        playChime(880);
        setTimeout(() => { btn.innerHTML = '&#x29c9;'; }, 1200);
      }).catch(() => {
        showToast('Copy not supported in this browser', 'error');
      });
    });
  });

  // Copy hardcoded credential buttons in the creds card
  document.querySelectorAll('.btn-cred-copy').forEach((btn) => {
    btn.addEventListener('click', () => {
      const text = btn.getAttribute('data-cred');
      if (!text) return;
      navigator.clipboard.writeText(text).then(() => {
        const prev = btn.innerHTML;
        btn.innerHTML = '&#x2713; Copied!';
        btn.style.color = 'var(--accent-green)';
        btn.style.borderColor = 'var(--accent-green)';
        showToast(`✓ Copied: ${text}`, 'success');
        playChime(880);
        setTimeout(() => {
          btn.innerHTML = prev;
          btn.style.color = '';
          btn.style.borderColor = '';
        }, 1500);
      });
    });
  });

  // Fill & Copy All — populates the login form AND copies both values
  const btnFillCreds = document.getElementById('btn-fill-creds');
  if (btnFillCreds) {
    btnFillCreds.addEventListener('click', () => {
      const emailField = document.getElementById('admin-email');
      const passField  = document.getElementById('admin-password');
      const email = 'benronkipkoech@gmail.com';
      const pass  = 'ApexAdmin@2026';
      if (emailField) emailField.value = email;
      if (passField)  passField.value  = pass;
      // Copy both to clipboard as formatted block
      const combined = `Email: ${email}\nPassword: ${pass}`;
      navigator.clipboard.writeText(combined).then(() => {
        btnFillCreds.innerHTML = '&#x2713; Filled &amp; Copied!';
        btnFillCreds.style.background = 'rgba(0,255,136,0.15)';
        btnFillCreds.style.borderColor = 'var(--accent-green)';
        showToast('✓ Credentials filled in form and copied!', 'success');
        playChime(784);
        setTimeout(() => {
          btnFillCreds.innerHTML = '&#9889; Fill &amp; Copy All';
          btnFillCreds.style.background = '';
          btnFillCreds.style.borderColor = '';
        }, 2000);
      });
    });
  }

  // Tab Navigation & Mobile Drawer
  const navItems = document.querySelectorAll('.nav-item');
  const tabPanes = document.querySelectorAll('.admin-tab-pane');
  const mobileDockBtns = document.querySelectorAll('.mobile-dock-btn');
  const adminSidebar = document.getElementById('admin-sidebar');
  const adminBackdrop = document.getElementById('admin-sidebar-backdrop');
  const btnAdminMobileToggle = document.getElementById('btn-admin-mobile-toggle');
  const btnCloseSidebar = document.getElementById('btn-close-sidebar');
  const btnMobileMore = document.getElementById('btn-mobile-more');

  function openMobileSidebar() {
    adminSidebar?.classList.add('open');
    adminBackdrop?.classList.add('active');
    document.body.classList.add('sidebar-open');
  }

  function closeMobileSidebar() {
    adminSidebar?.classList.remove('open');
    adminBackdrop?.classList.remove('active');
    document.body.classList.remove('sidebar-open');
  }

  btnAdminMobileToggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (adminSidebar?.classList.contains('open')) {
      closeMobileSidebar();
    } else {
      openMobileSidebar();
    }
  });

  btnCloseSidebar?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeMobileSidebar();
  });

  adminBackdrop?.addEventListener('click', closeMobileSidebar);

  btnMobileMore?.addEventListener('click', (e) => {
    e.stopPropagation();
    openMobileSidebar();
  });

  function switchTab(targetTab) {
    if (!targetTab) return;

    navItems.forEach((n) => {
      n.classList.toggle('active', n.getAttribute('data-tab') === targetTab);
    });

    mobileDockBtns.forEach((d) => {
      if (d.getAttribute('data-tab')) {
        d.classList.toggle('active', d.getAttribute('data-tab') === targetTab);
      }
    });

    tabPanes.forEach((p) => p.classList.remove('active'));

    const pane = document.getElementById(`tab-${targetTab}`);
    if (pane) pane.classList.add('active');

    closeMobileSidebar();
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (targetTab === 'overview') loadOverviewMetrics();
    if (targetTab === 'cashier') loadPendingWithdrawals();
    if (targetTab === 'traders') loadTraders();
    if (targetTab === 'trades') loadRecentTrades();
    if (targetTab === 'risk') loadSettings();
    if (targetTab === 'analytics') loadWinRateAnalytics();
  }

  navItems.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });

  mobileDockBtns.forEach((btn) => {
    const targetTab = btn.getAttribute('data-tab');
    if (targetTab) {
      btn.addEventListener('click', () => switchTab(targetTab));
    }
  });

  // Overview formatting helper
  function formatKES(val) {
    const num = Number(val) || 0;
    return `KSh ${num.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }

  document.getElementById('btn-goto-cashier')?.addEventListener('click', () => switchTab('cashier'));
  document.getElementById('btn-goto-risk')?.addEventListener('click', () => switchTab('risk'));

  // ==========================================
  // TAB 1: OVERVIEW METRICS
  // ==========================================
  async function loadOverviewMetrics() {
    const [{ ok, data }, settingsRes] = await Promise.all([
      apiCall('/admin/metrics'),
      apiCall('/admin/settings'),
    ]);

    if (settingsRes?.ok && settingsRes.data?.settings) {
      const s = settingsRes.data.settings;
      const adminWrEl = document.getElementById('overview-admin-wr');
      const userWrEl = document.getElementById('overview-user-wr');
      if (adminWrEl) adminWrEl.textContent = `${s.adminWinRate ?? 80}%`;
      if (userWrEl) userWrEl.textContent = `${s.userWinRate ?? 1}%`;
    }

    if (!ok || !data.metrics) return;

    const m = data.metrics;
    document.getElementById('kpi-net-profit').textContent = formatKES(m.houseNetRevenue);
    document.getElementById('kpi-total-deposits').textContent = formatKES(m.totalDeposits);
    document.getElementById('kpi-total-withdrawals').textContent = formatKES(m.totalWithdrawals);
    document.getElementById('kpi-pending-withdrawals').textContent = m.pendingWithdrawals;
    document.getElementById('kpi-pending-amount').textContent = `${formatKES(m.pendingWithdrawalsAmount)} waiting`;
    document.getElementById('kpi-total-users').textContent = m.totalUsers;
    document.getElementById('kpi-total-volume').textContent = formatKES(m.totalVolume);

    document.getElementById('open-trades-count').textContent = m.activeTradesCount;
    document.getElementById('open-risk-exposure').textContent = formatKES(m.openRisk);

    const alertBanner = document.getElementById('overview-cashier-alert');
    if (alertBanner) {
      if (m.pendingWithdrawals > 0) {
        alertBanner.classList.remove('hidden');
        document.getElementById('qab-title').textContent = `${m.pendingWithdrawals} Pending M-Pesa Withdrawal${m.pendingWithdrawals > 1 ? 's' : ''}`;
        document.getElementById('qab-desc').textContent = `${formatKES(m.pendingWithdrawalsAmount)} awaiting disbursement approval`;
      } else {
        alertBanner.classList.add('hidden');
      }
    }

    const mobBadge = document.getElementById('mobile-dock-cashier-badge');
    if (m.pendingWithdrawals > 0) {
      pendingBadge.textContent = m.pendingWithdrawals;
      pendingBadge.classList.remove('hidden');
      if (mobBadge) {
        mobBadge.textContent = m.pendingWithdrawals;
        mobBadge.classList.remove('hidden');
      }
    } else {
      pendingBadge.classList.add('hidden');
      mobBadge?.classList.add('hidden');
    }
  }

  document.getElementById('btn-refresh-metrics')?.addEventListener('click', () => {
    loadOverviewMetrics();
    showToast('Metrics updated', 'success');
  });

  // ==========================================
  // TAB 2: M-PESA CASHIER QUEUE & HISTORY
  // ==========================================
  let cashierViewMode = 'pending';

  document.querySelectorAll('#cashier-view-pills .filter-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#cashier-view-pills .filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      cashierViewMode = pill.getAttribute('data-cashier-view') || 'pending';
      loadPendingWithdrawals();
    });
  });

  async function loadPendingWithdrawals() {
    const thead = document.getElementById('cashier-thead');
    const tbody = document.getElementById('withdrawals-tbody');

    if (cashierViewMode === 'history') {
      if (thead) {
        thead.innerHTML = `
          <tr>
            <th>Date / Time</th>
            <th>Trader Phone</th>
            <th>Full Name</th>
            <th>Type</th>
            <th>Amount (KES)</th>
            <th>Status</th>
            <th>Reference / Note</th>
          </tr>`;
      }
      tbody.innerHTML = `<tr><td colspan="7" class="loading-state">Loading M-Pesa transaction history...</td></tr>`;
      const { ok, data } = await apiCall('/admin/transactions?limit=100');
      if (!ok || !data.transactions) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Failed to load transactions.</td></tr>`;
        return;
      }
      if (data.transactions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No transactions recorded yet.</td></tr>`;
        return;
      }
      tbody.innerHTML = '';
      data.transactions.forEach((tx) => {
        const user = tx.userId || {};
        const statusCls = tx.status === 'COMPLETED' ? 'success' : tx.status === 'PENDING' ? 'pending' : 'danger';
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${new Date(tx.createdAt).toLocaleString('en-GB')}</td>
          <td><strong class="copy-cell" data-copy="${tx.phone || ''}" title="Click to copy">${tx.phone || '--'} <span class="copy-icon">⧉</span></strong></td>
          <td>${user.fullName || 'Trader'}</td>
          <td><span style="color:${tx.type === 'DEPOSIT' ? 'var(--accent-green)' : 'var(--accent-gold)'}; font-weight:700;">${tx.type}</span></td>
          <td style="font-weight:700;">${formatKES(tx.amount)}</td>
          <td><span class="badge-status ${statusCls}">${tx.status}</span></td>
          <td style="font-family:var(--font-mono); font-size:0.78rem; color:var(--text-muted);">${tx.mpesaReceipt || tx.rejectionReason || tx.method || '--'}</td>
        `;
        tbody.appendChild(tr);
      });
      return;
    }

    if (thead) {
      thead.innerHTML = `
        <tr>
          <th>Date / Time</th>
          <th>Trader Phone</th>
          <th>Full Name</th>
          <th>Amount (KES)</th>
          <th>Current Balance</th>
          <th>Method</th>
          <th>Actions</th>
        </tr>`;
    }
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
        <td><strong class="copy-cell" data-copy="${tx.phone}" title="Click to copy">${tx.phone} <span class="copy-icon">⧉</span></strong></td>
        <td>${user.fullName || 'Trader'}</td>
        <td class="copy-cell" data-copy="${tx.amount}" title="Click to copy amount" style="color:var(--accent-gold); font-weight:700; cursor:pointer;">${formatKES(tx.amount)} <span class="copy-icon">⧉</span></td>
        <td>${formatKES(user.balances?.real || 0)}</td>
        <td><span class="badge-status pending">${tx.method}</span></td>
        <td>
          <button class="btn-table-action approve" data-id="${tx._id}" data-amount="${tx.amount}" data-phone="${tx.phone}">Approve & Disburse</button>
          <button class="btn-table-action reject" data-id="${tx._id}" data-amount="${tx.amount}" data-phone="${tx.phone}">Reject & Refund</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.btn-table-action.approve').forEach((btn) => {
      btn.addEventListener('click', () => openCashierActionModal('approve', btn.dataset.id, btn.dataset.phone, btn.dataset.amount));
    });

    tbody.querySelectorAll('.btn-table-action.reject').forEach((btn) => {
      btn.addEventListener('click', () => openCashierActionModal('reject', btn.dataset.id, btn.dataset.phone, btn.dataset.amount));
    });
  }

  // Glassmorphic Cashier Action Modal
  const cashierModal = document.getElementById('cashier-action-modal');
  const cashierActionForm = document.getElementById('cashier-action-form');
  const closeCashierModal = () => cashierModal?.classList.remove('active');
  document.getElementById('btn-close-cashier-modal')?.addEventListener('click', closeCashierModal);
  document.getElementById('btn-cancel-cashier-modal')?.addEventListener('click', closeCashierModal);

  function openCashierActionModal(action, txId, phone, amount) {
    document.getElementById('cashier-tx-id').value = txId;
    document.getElementById('cashier-tx-action').value = action;
    document.getElementById('cashier-tx-amount').value = amount;
    const input = document.getElementById('cashier-input-val');
    const title = document.getElementById('cashier-modal-title');
    const desc = document.getElementById('cashier-modal-desc');
    const label = document.getElementById('cashier-input-label');
    const help = document.getElementById('cashier-input-help');
    const confirmBtn = document.getElementById('btn-confirm-cashier-modal');

    if (action === 'approve') {
      title.textContent = 'Authorize & Disburse Withdrawal';
      desc.textContent = `Confirm M-Pesa B2C payout of ${formatKES(amount)} to ${phone}.`;
      label.textContent = 'M-Pesa B2C Receipt Code';
      input.value = '';
      input.placeholder = 'Leave blank for auto-generated receipt';
      help.textContent = 'Optional: Enter Safaricom transaction reference.';
      confirmBtn.textContent = 'Approve & Disburse';
    } else {
      title.textContent = 'Reject & Refund Withdrawal';
      desc.textContent = `Reject ${formatKES(amount)} request for ${phone} and refund their real balance.`;
      label.textContent = 'Rejection Reason';
      input.value = 'Compliance verification required';
      input.placeholder = 'Enter reason for rejection';
      help.textContent = 'This reason is recorded in the audit log.';
      confirmBtn.textContent = 'Reject & Refund';
    }
    cashierModal?.classList.add('active');
  }

  cashierActionForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const txId = document.getElementById('cashier-tx-id').value;
    const action = document.getElementById('cashier-tx-action').value;
    const amount = document.getElementById('cashier-tx-amount').value;
    const inputVal = document.getElementById('cashier-input-val').value.trim();

    closeCashierModal();

    if (action === 'approve') {
      const { ok, data } = await apiCall(`/admin/withdrawals/${txId}/approve`, 'POST', { mpesaReceipt: inputVal || undefined });
      if (ok) {
        showToast(data.message || 'Withdrawal approved & disbursed!', 'success');
        playChime(659.25);
        loadPendingWithdrawals();
        loadOverviewMetrics();
      } else {
        showToast(data.message || 'Failed to approve withdrawal', 'error');
      }
    } else {
      const { ok, data } = await apiCall(`/admin/withdrawals/${txId}/reject`, 'POST', { reason: inputVal || 'Rejected by compliance' });
      if (ok) {
        showToast(data.message || 'Withdrawal rejected & refunded.', 'info');
        playChime(329.63, 'sawtooth');
        loadPendingWithdrawals();
        loadOverviewMetrics();
      } else {
        showToast(data.message || 'Failed to reject withdrawal', 'error');
      }
    }
  });

  document.getElementById('btn-refresh-withdrawals')?.addEventListener('click', loadPendingWithdrawals);

  // ==========================================
  // TAB 3: TRADER MANAGEMENT
  // ==========================================
  let traderFilter = 'all';

  document.querySelectorAll('#trader-filter-pills .filter-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#trader-filter-pills .filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      traderFilter = pill.getAttribute('data-trader-filter') || 'all';
      loadTraders(document.getElementById('user-search-input')?.value.trim() || '');
    });
  });

  async function loadTraders(search = '') {
    const tbody = document.getElementById('traders-tbody');
    tbody.innerHTML = `<tr><td colspan="7" class="loading-state">Querying trader directory...</td></tr>`;

    const { ok, data } = await apiCall(`/admin/users?search=${encodeURIComponent(search)}`);
    if (!ok || !data.users) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Failed to load traders.</td></tr>`;
      return;
    }

    let users = data.users;
    if (traderFilter === 'active') users = users.filter(u => !u.isBanned);
    if (traderFilter === 'suspended') users = users.filter(u => u.isBanned);
    if (traderFilter === 'admin') users = users.filter(u => u.role === 'admin');

    if (users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No trader accounts match this filter.</td></tr>`;
      return;
    }

    tbody.innerHTML = '';
    users.forEach((u) => {
      const tr = document.createElement('tr');
      const roleBadge = u.role === 'admin' ? '<span class="badge-role">ADMIN</span>' : '';
      const kycStatus = u.kyc?.status || 'unverified';
      const kycBtn = kycStatus !== 'approved'
        ? `<button class="btn-table-action approve kyc-approve" data-id="${u._id}">Verify KYC</button>`
        : '';

      tr.innerHTML = `
        <td>
          <div style="font-weight:600;">${u.fullName || 'Apex Trader'}${roleBadge}</div>
          <div class="copy-cell" data-copy="${u.email}" title="Click to copy email" style="font-size:0.75rem; color:var(--text-muted); cursor:pointer;">${u.email} <span class="copy-icon">⧉</span></div>
        </td>
        <td class="copy-cell" data-copy="${u.phone}" title="Click to copy phone" style="font-family:var(--font-mono); cursor:pointer;">${u.phone} <span class="copy-icon">⧉</span></td>
        <td style="color:var(--accent-green); font-weight:700;">${formatKES(u.balances?.real || 0)}</td>
        <td style="color:var(--accent-cyan);">${formatKES(u.balances?.demo || 0)}</td>
        <td>
          <span class="badge-status ${kycStatus === 'approved' ? 'success' : kycStatus === 'pending' ? 'pending' : 'danger'}">
            ${kycStatus.toUpperCase()}
          </span>
        </td>
        <td>
          <span class="badge-status ${u.isBanned ? 'danger' : 'success'}">
            ${u.isBanned ? 'SUSPENDED' : 'ACTIVE'}
          </span>
        </td>
        <td>
          <button class="btn-table-action edit" data-id="${u._id}" data-name="${u.fullName || u.email}">Adjust Balance</button>
          ${kycBtn}
          <button class="btn-table-action toggle-ban ${u.isBanned ? 'approve' : 'reject'}" data-id="${u._id}" data-banned="${u.isBanned}">
            ${u.isBanned ? 'Unban' : 'Suspend'}
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.btn-table-action.edit').forEach((btn) => {
      btn.addEventListener('click', () => openBalanceModal(btn.dataset.id, btn.dataset.name));
    });

    tbody.querySelectorAll('.btn-table-action.kyc-approve').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const { ok } = await apiCall(`/admin/users/${btn.dataset.id}`, 'PATCH', { kycStatus: 'approved' });
        if (ok) {
          showToast('Trader KYC approved.', 'success');
          loadTraders(document.getElementById('user-search-input').value);
        }
      });
    });

    tbody.querySelectorAll('.btn-table-action.toggle-ban').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const currentBanned = btn.dataset.banned === 'true';
        const { ok } = await apiCall(`/admin/users/${id}`, 'PATCH', { isBanned: !currentBanned });
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

  document.getElementById('user-search-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      loadTraders(e.target.value.trim());
    }
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
  let cachedRecentTrades = [];
  let tradeOutcomeFilter = 'ALL';

  document.querySelectorAll('#trade-filter-pills .filter-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#trade-filter-pills .filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      tradeOutcomeFilter = pill.getAttribute('data-trade-filter') || 'ALL';
      renderFilteredTrades();
    });
  });

  document.getElementById('trade-search-input')?.addEventListener('input', () => {
    renderFilteredTrades();
  });

  function renderFilteredTrades() {
    const tbody = document.getElementById('trades-tbody');
    const search = (document.getElementById('trade-search-input')?.value || '').trim().toLowerCase();

    let trades = cachedRecentTrades;
    if (tradeOutcomeFilter !== 'ALL') {
      trades = trades.filter(t => t.outcome === tradeOutcomeFilter);
    }
    if (search) {
      trades = trades.filter(t => {
        const u = t.userId || {};
        const hay = `${u.phone || ''} ${u.email || ''} ${u.fullName || ''} ${t.asset || ''}`.toLowerCase();
        return hay.includes(search);
      });
    }

    const totalStake = trades.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const housePL = trades.reduce((sum, t) => {
      if (t.outcome === 'LOSS') return sum + (Number(t.amount) || 0);
      if (t.outcome === 'WIN') return sum - (Number(t.profit) || 0);
      return sum;
    }, 0);

    const countEl = document.getElementById('trades-shown-count');
    const stakeEl = document.getElementById('trades-total-stake');
    const plEl = document.getElementById('trades-house-pl');
    if (countEl) countEl.textContent = trades.length;
    if (stakeEl) stakeEl.textContent = formatKES(totalStake);
    if (plEl) {
      plEl.textContent = `${housePL >= 0 ? '+' : ''}${formatKES(housePL)}`;
      plEl.style.color = housePL >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
    }

    if (trades.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty-state">No trades match the current filter.</td></tr>`;
      return;
    }

    tbody.innerHTML = '';
    trades.forEach((t) => {
      const user = t.userId || {};
      const tr = document.createElement('tr');
      const isWin = t.outcome === 'WIN';
      const isLoss = t.outcome === 'LOSS';
      const outcomeBadge = isWin ? 'success' : isLoss ? 'danger' : 'pending';
      const isCall = t.direction === 'CALL';
      const dec = (t.asset?.includes('EUR') || t.asset?.includes('GBP')) ? 4 : 2;

      const traderLabel = user.phone || user.email || 'Trader';
      tr.innerHTML = `
        <td>${new Date(t.openedAt).toLocaleTimeString('en-GB')}</td>
        <td class="copy-cell" data-copy="${traderLabel}" title="Click to copy" style="cursor:pointer;">${traderLabel} <span class="copy-icon">⧉</span></td>
        <td style="font-weight:700;">${t.asset}</td>
        <td><span style="color:${isCall ? 'var(--accent-green)' : 'var(--accent-red)'}; font-weight:700;">${isCall ? '▲' : '▼'} ${t.direction}</span></td>
        <td class="copy-cell" data-copy="${t.amount}" title="Click to copy stake" style="cursor:pointer;">${formatKES(t.amount)} <span class="copy-icon">⧉</span></td>
        <td style="font-family:var(--font-mono);">${t.entryPrice?.toFixed(dec) || '--'}</td>
        <td style="font-family:var(--font-mono);">${t.closePrice?.toFixed(dec) || 'Active'}</td>
        <td><span class="badge-status ${outcomeBadge}">${t.outcome}</span></td>
        <td style="font-weight:700; color:${isWin ? 'var(--accent-green)' : isLoss ? 'var(--accent-red)' : 'var(--text-muted)'};">
          ${isWin ? '+' + formatKES(t.profit) : isLoss ? '-' + formatKES(t.amount) : 'Pending'}
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  async function loadRecentTrades() {
    const tbody = document.getElementById('trades-tbody');
    if (cachedRecentTrades.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="loading-state">Streaming trade records from MongoDB...</td></tr>`;
    }

    const { ok, data } = await apiCall('/admin/trades/recent?limit=100');
    if (!ok || !data.trades) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty-state">Failed to load trades.</td></tr>`;
      return;
    }

    cachedRecentTrades = data.trades;
    renderFilteredTrades();
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

  const adminWrInput = document.getElementById('setting-admin-wr');
  const adminWrVal = document.getElementById('setting-admin-wr-val');
  const userWrInput = document.getElementById('setting-user-wr');
  const userWrVal = document.getElementById('setting-user-wr-val');
  const houseEdgePreview = document.getElementById('setting-house-edge-preview');

  adminWrInput?.addEventListener('input', () => {
    if (adminWrVal) adminWrVal.textContent = `${adminWrInput.value}%`;
  });

  userWrInput?.addEventListener('input', () => {
    const val = parseInt(userWrInput.value, 10) || 0;
    if (userWrVal) userWrVal.textContent = `${val}%`;
    if (houseEdgePreview) houseEdgePreview.textContent = `${100 - val}%`;
  });

  async function loadSettings() {
    const { ok, data } = await apiCall('/admin/settings');
    if (!ok || !data.settings) return;

    const s = data.settings;
    const rates = s.payoutRates || {};

    sliders.forEach(({ id, valId, asset }) => {
      const rateVal = (rates[asset] !== undefined && rates[asset] !== null) ? Math.round(rates[asset] * 100) : null;
      if (rateVal !== null && !isNaN(rateVal)) {
        const input = document.getElementById(id);
        const label = document.getElementById(valId);
        if (input) input.value = rateVal;
        if (label) label.textContent = `${rateVal}%`;
      }
    });

    if (s.minDeposit) document.getElementById('setting-min-deposit').value = s.minDeposit;
    if (s.minWithdrawal) document.getElementById('setting-min-withdraw').value = s.minWithdrawal;
    if (s.maxTradeLimit) document.getElementById('setting-max-trade').value = s.maxTradeLimit;
    if (s.maintenanceMode !== undefined) document.getElementById('setting-maintenance').checked = s.maintenanceMode;

    const adminWr = s.adminWinRate ?? 80;
    const userWr = s.userWinRate ?? 1;
    if (adminWrInput) adminWrInput.value = adminWr;
    if (adminWrVal) adminWrVal.textContent = `${adminWr}%`;
    if (userWrInput) userWrInput.value = userWr;
    if (userWrVal) userWrVal.textContent = `${userWr}%`;
    if (houseEdgePreview) houseEdgePreview.textContent = `${100 - userWr}%`;
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
      adminWinRate: parseFloat(adminWrInput?.value ?? 80),
      userWinRate: parseFloat(userWrInput?.value ?? 1),
    };

    const { ok, data } = await apiCall('/admin/settings', 'PUT', payload);
    if (ok) {
      showToast('Risk parameters and win-rate settings saved!', 'success');
      playChime(784); // G5 chime
      loadOverviewMetrics();
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

  // ==========================================
  // TAB 6: WIN RATE ANALYTICS
  // ==========================================
  async function loadWinRateAnalytics() {
    const { ok, data } = await apiCall('/admin/analytics/win-rate');
    if (!ok || !data.analytics) {
      showToast('Failed to load analytics data', 'error');
      return;
    }

    const a = data.analytics;
    const o = a.overall;

    // KPI row
    document.getElementById('wr-total-trades').textContent = Number(o.total).toLocaleString();
    document.getElementById('wr-total-wins').textContent = Number(o.wins).toLocaleString();
    document.getElementById('wr-total-losses').textContent = Number(o.losses).toLocaleString();
    document.getElementById('wr-overall-win-rate').textContent = `${o.winRate}%`;
    document.getElementById('wr-house-edge').textContent = `${o.houseEdge}%`;

    // Per-asset bar chart
    const assetChart = document.getElementById('wr-asset-chart');
    assetChart.innerHTML = '';
    (a.byAsset || []).forEach(asset => {
      const winPct = asset.winRate;
      const housePct = (100 - winPct).toFixed(1);
      const colorClass = winPct < 45 ? 'var(--accent-green)' : winPct < 50 ? 'var(--accent-gold)' : 'var(--accent-red)';
      const row = document.createElement('div');
      row.className = 'wr-bar-row';
      row.innerHTML = `
        <span class="wr-bar-label">${asset.asset}</span>
        <div class="wr-bar-track">
          <div class="wr-bar-fill-house" style="width:${housePct}%;"></div>
          <div class="wr-bar-fill-win" style="width:${winPct}%; background:linear-gradient(90deg,${colorClass},${colorClass}66);">
            ${winPct >= 12 ? winPct + '%' : ''}
          </div>
        </div>
        <span class="wr-bar-pct" style="color:${colorClass}">${winPct}%</span>
      `;
      assetChart.appendChild(row);
    });

    // Direction split
    const call = a.byDirection?.CALL || { total: 0, winRate: 0 };
    const put  = a.byDirection?.PUT  || { total: 0, winRate: 0 };
    document.getElementById('wr-call-total').textContent = Number(call.total).toLocaleString();
    document.getElementById('wr-call-rate').textContent = `${call.winRate}% Win`;
    document.getElementById('wr-put-total').textContent = Number(put.total).toLocaleString();
    document.getElementById('wr-put-rate').textContent = `${put.winRate}% Win`;

    // Gauge: set CSS conic-gradient via inline style (deg = winRate * 3.6)
    const gauge = document.getElementById('wr-gauge');
    const deg = (o.winRate * 3.6).toFixed(1);
    gauge.style.background = `conic-gradient(
      var(--accent-green) 0deg,
      var(--accent-green) ${deg}deg,
      rgba(255,51,102,0.55) ${deg}deg,
      rgba(255,51,102,0.55) 360deg
    )`;
    document.getElementById('wr-gauge-pct').textContent = `${o.winRate}%`;

    // 7-day trend bars
    const trendChart = document.getElementById('wr-trend-chart');
    const trendAxis  = document.getElementById('wr-trend-axis');
    trendChart.innerHTML = '';
    trendAxis.innerHTML  = '';
    const maxPct = Math.max(...(a.dailyTrend || []).map(d => d.winRate), 60);
    (a.dailyTrend || []).forEach(day => {
      const heightPct = ((day.winRate / maxPct) * 100).toFixed(0);
      const cls = day.winRate < 44 ? 'bad' : day.winRate < 47 ? 'warn' : 'good';
      const shortDate = day.date.slice(5); // MM-DD

      const wrap = document.createElement('div');
      wrap.className = 'wr-trend-bar-wrap';
      wrap.title = `${day.date}: ${day.winRate}% (${day.wins}W / ${day.losses}L)`;
      wrap.innerHTML = `
        <span class="wr-trend-pct">${day.winRate}%</span>
        <div class="wr-trend-bar ${cls}" style="height:${heightPct}%;"></div>
      `;
      trendChart.appendChild(wrap);

      const lbl = document.createElement('div');
      lbl.className = 'wr-trend-axis-label';
      lbl.textContent = shortDate;
      trendAxis.appendChild(lbl);
    });
  }

  document.getElementById('btn-refresh-analytics')?.addEventListener('click', () => {
    loadWinRateAnalytics();
    showToast('Analytics refreshed', 'success');
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
      if (currentActiveTab === 'analytics') loadWinRateAnalytics();
    }
  }, 5000);

  // ==========================================
  // COPY TO CLIPBOARD — Global Delegated Handler
  // ==========================================
  function copyToClipboard(text, el) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(`✓ Copied: ${text}`, 'success');
      playChime(880);
      // Visual flash on the cell
      el.classList.add('copy-flash');
      const icon = el.querySelector('.copy-icon');
      if (icon) { icon.textContent = '✓'; }
      setTimeout(() => {
        el.classList.remove('copy-flash');
        if (icon) { icon.textContent = '⧉'; }
      }, 1200);
    }).catch(() => {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      showToast(`✓ Copied: ${text}`, 'success');
    });
  }

  document.addEventListener('click', (e) => {
    const copyEl = e.target.closest('.copy-cell');
    if (!copyEl) return;
    const text = copyEl.getAttribute('data-copy') || copyEl.innerText.replace('⧉', '').replace('📋', '').trim();
    if (text) copyToClipboard(text, copyEl);
  });

  // Start initialization
  initAuth();
})();

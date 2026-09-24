// Multi-Wallet & Kenyan M-Pesa Payment Simulation Engine (Masterclass Edition)
import { sound } from './audio.js';
import { api } from './api.js';

export class WalletEngine {
  constructor() {
    this.type = localStorage.getItem('tycoon_wallet_type') || 'demo'; // 'demo' | 'real'
    this.demoBalance = parseFloat(localStorage.getItem('tycoon_demo_balance') || '1000000');
    this.realBalance = parseFloat(localStorage.getItem('tycoon_real_balance') || '0');
    this.transactions = JSON.parse(localStorage.getItem('tycoon_mpesa_history') || '[]');
    this.enteredPin = '';
    this.listeners = new Set();
  }

  getType() {
    return this.type;
  }

  setType(type) {
    if (type !== 'demo' && type !== 'real') return;
    this.type = type;
    localStorage.setItem('tycoon_wallet_type', type);
    this.notify();
  }

  getBalance() {
    return this.type === 'demo' ? this.demoBalance : this.realBalance;
  }

  getDemoBalance() {
    return this.demoBalance;
  }

  getRealBalance() {
    return this.realBalance;
  }

  resetDemoBalance() {
    this.demoBalance = 1000000;
    localStorage.setItem('tycoon_demo_balance', this.demoBalance.toString());
    sound.playMpesaCash();
    this.notify();
    return this.demoBalance;
  }

  deduct(amount) {
    if (amount <= 0) return false;
    if (this.type === 'demo') {
      if (this.demoBalance < amount) return false;
      this.demoBalance -= amount;
      localStorage.setItem('tycoon_demo_balance', this.demoBalance.toString());
    } else {
      if (this.realBalance < amount) return false;
      this.realBalance -= amount;
      localStorage.setItem('tycoon_real_balance', this.realBalance.toString());
    }
    this.notify();
    return true;
  }

  credit(amount, targetType = null) {
    if (amount <= 0) return;
    const dest = targetType || this.type;
    if (dest === 'demo') {
      this.demoBalance += amount;
      localStorage.setItem('tycoon_demo_balance', this.demoBalance.toString());
    } else {
      this.realBalance += amount;
      localStorage.setItem('tycoon_real_balance', this.realBalance.toString());
    }
    this.notify();
  }

  // Keypad PIN Management
  addPinDigit(d) {
    if (this.enteredPin.length < 4) {
      this.enteredPin += d;
      sound.playKeypadBeep();
    }
    return this.enteredPin;
  }

  deletePinDigit() {
    if (this.enteredPin.length > 0) {
      this.enteredPin = this.enteredPin.slice(0, -1);
      sound.playClick();
    }
    return this.enteredPin;
  }

  clearPin() {
    this.enteredPin = '';
  }

  getPin() {
    return this.enteredPin;
  }

  // M-Pesa Deposit (STK Push Flow)
  generateMpesaReceipt(amount, phone) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'QK';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const dateStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const message = `${code} Confirmed. KSh ${amount.toLocaleString('en-KE', { minimumFractionDigits: 2 })} received from +254${phone} for Apex Binary (Paybill 880220) at ${dateStr}. New Real Account balance updated.`;

    const tx = {
      id: code,
      type: 'deposit',
      amount,
      phone,
      time: Date.now(),
      status: 'Completed'
    };
    this.transactions.unshift(tx);
    if (this.transactions.length > 20) this.transactions.pop();
    localStorage.setItem('tycoon_mpesa_history', JSON.stringify(this.transactions));

    return { code, message };
  }

  completeMpesaDeposit(amount, phone) {
    const receipt = this.generateMpesaReceipt(amount, phone);
    this.credit(amount, 'real');
    this.setType('real');
    this.clearPin();
    sound.playMpesaCash();

    // Sync deposit to backend database
    api.depositMpesa(amount, phone).catch(() => {});

    return receipt;
  }

  // M-Pesa Withdrawal Flow
  withdrawMpesa(amount, phone) {
    if (amount <= 0) return { success: false, message: 'Invalid amount' };
    if (this.realBalance < amount) {
      return { success: false, message: 'Insufficient Real KES balance for withdrawal' };
    }

    this.realBalance -= amount;
    localStorage.setItem('tycoon_real_balance', this.realBalance.toString());

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'WK';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const tx = {
      id: code,
      type: 'withdrawal',
      amount,
      phone,
      time: Date.now(),
      status: 'Pending Admin Approval'
    };
    this.transactions.unshift(tx);
    if (this.transactions.length > 20) this.transactions.pop();
    localStorage.setItem('tycoon_mpesa_history', JSON.stringify(this.transactions));

    this.notify();
    sound.playClick();

    // Sync withdrawal request with backend cashier queue
    api.withdrawMpesa(amount, phone).catch(() => {});

    return {
      success: true,
      code,
      message: `Withdrawal request of KSh ${amount.toLocaleString('en-KE', { minimumFractionDigits: 2 })} submitted! Queued for Admin Cashier review and approval.`
    };
  }

  getTransactions() {
    return this.transactions;
  }

  formatCurrency(val) {
    return 'KSh ' + val.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener({
          type: this.type,
          balance: this.getBalance(),
          demoBalance: this.demoBalance,
          realBalance: this.realBalance,
          transactions: this.transactions
        });
      } catch (err) {
        console.error(err);
      }
    }
  }
}

export const wallet = new WalletEngine();

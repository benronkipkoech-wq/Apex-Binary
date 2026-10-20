// Fixed-Time & Binary Options Trading Engine (Masterclass Edition)
import { sound } from './audio.js';
import { wallet } from './wallet.js';
import { api } from './api.js';
import { auth } from './auth.js';

export class TradingEngine {
  constructor(marketInstance) {
    this.market = marketInstance;
    this.activeTrades = [];
    this.closedTrades = JSON.parse(localStorage.getItem('tycoon_trade_history') || '[]');
    this.listeners = new Set();
    this.timer = null;
    this.lastBeepSecond = {};

    this.startResolutionLoop();
  }

  placeTrade(direction, amount, durationSec) {
    const accountType = wallet.getType();

    // Real live trading strictly requires authentication
    if (accountType === 'real' && !auth.isLoggedIn()) {
      return { success: false, message: 'Please sign in or create an account to place Real Live trades.' };
    }
    if (amount < 10) {
      return { success: false, message: 'Minimum trade amount is KSh 10' };
    }

    // Check wallet funds
    if (!wallet.deduct(amount)) {
      const type = accountType.toUpperCase();
      return { success: false, message: `Insufficient funds in ${type} account. Please deposit or switch wallets.` };
    }

    const isCallDir = direction === 'higher' || direction === 'CALL';
    const normalizedDirection = isCallDir ? 'higher' : 'lower';

    const asset = this.market.currentAsset;
    const strikePrice = this.market.getCurrentPrice();
    const now = Date.now();
    const expiryTimestamp = now + durationSec * 1000;

    const trade = {
      id: 'TRD-' + Math.random().toString(36).substring(2, 9).toUpperCase(),
      assetId: asset.id,
      assetName: asset.name,
      assetIcon: asset.icon,
      decimals: asset.decimals,
      direction: normalizedDirection, // 'higher' | 'lower'
      amount,
      payoutRate: asset.payout,
      strikePrice,
      entryTime: now,
      durationSec,
      expiryTimestamp,
      status: 'active',
      inTheMoney: false,
      accountType
    };

    this.activeTrades.push(trade);
    sound.playTradePlaced();
    this.notify('trade_placed', { trade });

    // Async sync trade to backend database if authenticated
    if (auth.isLoggedIn()) {
      api.placeTrade({
        asset: asset.name,
        direction: isCallDir ? 'CALL' : 'PUT',
        amount,
        duration: durationSec,
        accountType: trade.accountType
      }).then(res => {
        if (res.ok && res.data.success && res.data.updatedBalance !== undefined) {
          if (trade.accountType === 'real') {
            wallet.realBalance = res.data.updatedBalance;
            localStorage.setItem('tycoon_real_balance', wallet.realBalance.toString());
          } else {
            wallet.demoBalance = res.data.updatedBalance;
            localStorage.setItem('tycoon_demo_balance', wallet.demoBalance.toString());
          }
          wallet.notify();
        }
      }).catch(() => {});
    }

    return { success: true, trade };
  }

  startResolutionLoop() {
    this.timer = setInterval(() => {
      this.checkActiveTrades();
    }, 200);
  }

  checkActiveTrades() {
    if (this.activeTrades.length === 0) return;

    const now = Date.now();
    const currentPrice = this.market.getCurrentPrice();
    let hasUpdates = false;

    for (let i = this.activeTrades.length - 1; i >= 0; i--) {
      const trade = this.activeTrades[i];
      const isCall = trade.direction === 'higher';
      trade.inTheMoney = isCall ? (currentPrice > trade.strikePrice) : (currentPrice < trade.strikePrice);

      const remainingSec = Math.ceil((trade.expiryTimestamp - now) / 1000);

      // Heartbeat sound during final 5 seconds
      if (remainingSec <= 5 && remainingSec > 0) {
        if (this.lastBeepSecond[trade.id] !== remainingSec) {
          this.lastBeepSecond[trade.id] = remainingSec;
          sound.playHeartbeat();
        }
      }

      // Check for trade expiration
      if (now >= trade.expiryTimestamp) {
        delete this.lastBeepSecond[trade.id];
        this.resolveTrade(trade, currentPrice, i);
        hasUpdates = true;
      } else {
        hasUpdates = true;
      }
    }

    if (hasUpdates) {
      this.notify();
    }
  }

  resolveTrade(trade, exitPrice, index) {
    this.activeTrades.splice(index, 1);

    const isCall = trade.direction === 'higher';
    let isWin = false;
    let isTie = false;

    if (exitPrice === trade.strikePrice) {
      isTie = true;
    } else if (isCall && exitPrice > trade.strikePrice) {
      isWin = true;
    } else if (!isCall && exitPrice < trade.strikePrice) {
      isWin = true;
    }

    let profit = 0;
    let payout = 0;

    if (isWin) {
      profit = trade.amount * (trade.payoutRate / 100);
      payout = trade.amount + profit;
      wallet.credit(payout, trade.accountType || null);
      sound.playWin();
      this.triggerSettlementUI(trade, true, payout, exitPrice);
    } else if (isTie) {
      payout = trade.amount;
      wallet.credit(payout, trade.accountType || null);
      this.triggerSettlementUI(trade, 'tie', payout, exitPrice);
    } else {
      profit = -trade.amount;
      payout = 0;
      sound.playLoss();
      this.triggerSettlementUI(trade, false, 0, exitPrice);
    }

    const closedRecord = {
      ...trade,
      exitPrice,
      exitTime: Date.now(),
      status: isWin ? 'won' : (isTie ? 'tie' : 'lost'),
      profit,
      payout
    };

    this.closedTrades.unshift(closedRecord);
    if (this.closedTrades.length > 50) {
      this.closedTrades.pop();
    }
    localStorage.setItem('tycoon_trade_history', JSON.stringify(this.closedTrades));
    this.notify('trade_settled', { trade: closedRecord });
  }

  triggerSettlementUI(trade, result, payout, exitPrice) {
    const overlay = document.getElementById('settlement-overlay');
    const card = document.getElementById('settlement-card');
    const badge = document.getElementById('settlement-badge');
    const icon = document.getElementById('settlement-icon');
    const amountEl = document.getElementById('settlement-amount');
    const detailEl = document.getElementById('settlement-detail');

    if (!overlay || !card) return;

    if (result === true) {
      card.className = 'settlement-card win';
      badge.textContent = 'TRADE WON';
      icon.textContent = '🎉';
      
      // Animated count-up effect
      const targetVal = payout;
      const startTime = performance.now();
      const animDuration = 600;
      const step = (now) => {
        const progress = Math.min((now - startTime) / animDuration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const currentVal = targetVal * easeOut;
        amountEl.textContent = `+KSh ${currentVal.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          amountEl.textContent = `+KSh ${targetVal.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
      };
      requestAnimationFrame(step);

      detailEl.textContent = `${trade.assetName} strike ${trade.strikePrice.toFixed(trade.decimals)} closed at ${exitPrice.toFixed(trade.decimals)}`;
      this.launchConfetti();
    } else if (result === 'tie') {
      card.className = 'settlement-card';
      badge.textContent = 'TIE REFUNDED';
      icon.textContent = '⚖️';
      amountEl.textContent = `KSh ${payout.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
      detailEl.textContent = `Price closed exactly at strike price`;
    } else {
      card.className = 'settlement-card loss';
      badge.textContent = 'TRADE CLOSED';
      icon.textContent = '📉';
      amountEl.textContent = `-KSh ${trade.amount.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
      detailEl.textContent = `${trade.assetName} strike ${trade.strikePrice.toFixed(trade.decimals)} closed at ${exitPrice.toFixed(trade.decimals)}`;
    }

    overlay.classList.remove('hidden');
  }

  launchConfetti() {
    const count = 75;
    for (let i = 0; i < count; i++) {
      const particle = document.createElement('div');
      particle.className = 'confetti-particle';
      const colors = ['#00f59b', '#00d2ff', '#ffd700', '#ff3366', '#ffffff'];
      const bg = colors[Math.floor(Math.random() * colors.length)];
      const size = 6 + Math.random() * 8;
      const left = 30 + Math.random() * 40;
      const top = 25 + Math.random() * 35;

      particle.style.cssText = `
        position: fixed;
        left: ${left}vw;
        top: ${top}vh;
        width: ${size}px;
        height: ${size * 0.6}px;
        background: ${bg};
        z-index: 999;
        pointer-events: none;
        border-radius: 2px;
        transform: rotate(${Math.random() * 360}deg);
        transition: transform 1.3s cubic-bezier(0.25, 1, 0.5, 1), opacity 1.3s ease-out, top 1.3s ease-in;
      `;
      document.body.appendChild(particle);

      requestAnimationFrame(() => {
        const targetX = (Math.random() - 0.5) * 400;
        const targetY = 160 + Math.random() * 300;
        particle.style.transform = `translate(${targetX}px, ${targetY}px) rotate(${Math.random() * 900}deg)`;
        particle.style.opacity = '0';
      });

      setTimeout(() => particle.remove(), 1400);
    }
  }

  getActiveTrades() {
    return this.activeTrades;
  }

  getClosedTrades() {
    return this.closedTrades;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event = null, data = null) {
    for (const listener of this.listeners) {
      try {
        listener({
          active: this.activeTrades,
          closed: this.closedTrades,
          event,
          data
        }, event, data);
      } catch (e) {
        console.error(e);
      }
    }
  }
}

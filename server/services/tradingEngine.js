import Trade from '../models/Trade.js';
import User from '../models/User.js';
import { isDbConnected } from '../config/db.js';

// Global live prices cache with baseline fallbacks
const currentPrices = {
  'BTC/USD': 64250.00,
  'ETH/USD': 3450.50,
  'SOL/USD': 152.20,
  'EUR/USD': 1.0850,
  'GBP/USD': 1.2980,
  'USD/KES': 129.50,
};

// Normalize symbols so "BTC / USDT", "BTC/USDT", "BTC/USD" resolve consistently
export function normalizeSymbol(symbol) {
  if (!symbol) return 'BTC/USD';
  const clean = symbol.replace(/\s+/g, '').toUpperCase();
  if (clean.includes('BTC')) return 'BTC/USD';
  if (clean.includes('ETH')) return 'ETH/USD';
  if (clean.includes('SOL')) return 'SOL/USD';
  if (clean.includes('EUR')) return 'EUR/USD';
  if (clean.includes('GBP')) return 'GBP/USD';
  if (clean.includes('KES') || clean.includes('SCOM')) return 'USD/KES';
  return clean;
}

// Update price in cache (can be called by WebSocket listener or authenticated feeder)
export function updateMarketPrice(symbol, price) {
  const norm = normalizeSymbol(symbol);
  if (norm && price > 0) {
    currentPrices[norm] = parseFloat(price);
  }
}

export function getMarketPrice(symbol) {
  const norm = normalizeSymbol(symbol);
  return currentPrices[norm] || 100.0;
}

export function getAllPrices() {
  return { ...currentPrices };
}

// Background simulation ticker for live price drift if external feed is quiet
setInterval(() => {
  for (const [sym, price] of Object.entries(currentPrices)) {
    const isFx = sym.includes('KES') || sym.includes('EUR') || sym.includes('GBP');
    const vol = isFx ? 0.00015 : 0.0006;
    const delta = (Math.random() - 0.495) * 2 * vol * price;
    const decimals = sym.includes('EUR') || sym.includes('GBP') ? 5 : (isFx ? 3 : 2);
    currentPrices[sym] = Math.max(0.0001, parseFloat((price + delta).toFixed(decimals)));
  }
}, 1000);

// Background resolution worker
let resolutionInterval = null;

export function startTradingEngine() {
  if (resolutionInterval) return;

  console.log('[TradingEngine] Server-side trade resolution worker started.');

  resolutionInterval = setInterval(async () => {
    if (!isDbConnected()) return;

    try {
      const now = new Date();
      // Find all trades that have reached their expiration
      const expiredTrades = await Trade.find({
        outcome: 'PENDING',
        expiresAt: { $lte: now },
      });

      if (!expiredTrades || expiredTrades.length === 0) return;

      for (const trade of expiredTrades) {
        try {
          // Atomic lock: transition from PENDING to PROCESSING to prevent duplicate credit race conditions
          const lockedTrade = await Trade.findOneAndUpdate(
            { _id: trade._id, outcome: 'PENDING' },
            { $set: { outcome: 'PROCESSING' } },
            { new: true }
          );
          if (!lockedTrade) continue;

          const closePrice = getMarketPrice(lockedTrade.asset);
          let outcome = 'LOSS';
          let profit = -lockedTrade.amount;
          let creditAmount = 0;

          if (lockedTrade.direction === 'CALL') {
            if (closePrice > lockedTrade.entryPrice) {
              outcome = 'WIN';
              profit = lockedTrade.amount * lockedTrade.payoutRate;
              creditAmount = lockedTrade.amount + profit;
            } else if (closePrice === lockedTrade.entryPrice) {
              outcome = 'TIE';
              profit = 0;
              creditAmount = lockedTrade.amount;
            }
          } else if (lockedTrade.direction === 'PUT') {
            if (closePrice < lockedTrade.entryPrice) {
              outcome = 'WIN';
              profit = lockedTrade.amount * lockedTrade.payoutRate;
              creditAmount = lockedTrade.amount + profit;
            } else if (closePrice === lockedTrade.entryPrice) {
              outcome = 'TIE';
              profit = 0;
              creditAmount = lockedTrade.amount;
            }
          }

          lockedTrade.closePrice = closePrice;
          lockedTrade.outcome = outcome;
          lockedTrade.profit = profit;
          lockedTrade.closedAt = now;
          await lockedTrade.save();

          // Credit balance if WIN or TIE
          if (creditAmount > 0) {
            const user = await User.findById(lockedTrade.userId);
            if (user) {
              const acc = lockedTrade.accountType === 'real' ? 'real' : 'demo';
              user.balances[acc] = (user.balances[acc] || 0) + creditAmount;
              await user.save();
            }
          }

          console.log(`[TradingEngine] Trade ${lockedTrade._id} resolved: ${outcome} (Entry: ${lockedTrade.entryPrice}, Close: ${closePrice}, P/L: ${profit})`);
        } catch (err) {
          console.error(`[TradingEngine] Failed to resolve trade ${trade._id}:`, err);
        }
      }
    } catch (error) {
      console.error('[TradingEngine] Worker error:', error);
    }
  }, 1000);
}

export function stopTradingEngine() {
  if (resolutionInterval) {
    clearInterval(resolutionInterval);
    resolutionInterval = null;
  }
}

export default {
  startTradingEngine,
  stopTradingEngine,
  updateMarketPrice,
  getMarketPrice,
  getAllPrices,
};

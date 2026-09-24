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

// Update price in cache (can be called by WebSocket listener or API)
export function updateMarketPrice(symbol, price) {
  if (symbol && price > 0) {
    currentPrices[symbol] = price;
  }
}

export function getMarketPrice(symbol) {
  return currentPrices[symbol] || 100.0;
}

export function getAllPrices() {
  return { ...currentPrices };
}

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
          const closePrice = getMarketPrice(trade.asset);
          let outcome = 'LOSS';
          let profit = -trade.amount;
          let creditAmount = 0;

          if (trade.direction === 'CALL') {
            if (closePrice > trade.entryPrice) {
              outcome = 'WIN';
              profit = trade.amount * trade.payoutRate;
              creditAmount = trade.amount + profit;
            } else if (closePrice === trade.entryPrice) {
              outcome = 'TIE';
              profit = 0;
              creditAmount = trade.amount;
            }
          } else if (trade.direction === 'PUT') {
            if (closePrice < trade.entryPrice) {
              outcome = 'WIN';
              profit = trade.amount * trade.payoutRate;
              creditAmount = trade.amount + profit;
            } else if (closePrice === trade.entryPrice) {
              outcome = 'TIE';
              profit = 0;
              creditAmount = trade.amount;
            }
          }

          trade.closePrice = closePrice;
          trade.outcome = outcome;
          trade.profit = profit;
          trade.closedAt = now;
          await trade.save();

          // Credit balance if WIN or TIE
          if (creditAmount > 0) {
            const user = await User.findById(trade.userId);
            if (user) {
              const acc = trade.accountType === 'real' ? 'real' : 'demo';
              user.balances[acc] = (user.balances[acc] || 0) + creditAmount;
              await user.save();
            }
          }

          console.log(`[TradingEngine] Trade ${trade._id} resolved: ${outcome} (Entry: ${trade.entryPrice}, Close: ${closePrice}, P/L: ${profit})`);
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

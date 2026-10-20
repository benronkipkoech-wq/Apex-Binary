import express from 'express';
import Trade from '../models/Trade.js';
import User from '../models/User.js';
import Setting from '../models/Setting.js';
import { authenticate } from '../middleware/auth.js';
import { isDbConnected } from '../config/db.js';
import { getMarketPrice, updateMarketPrice, normalizeSymbol } from '../services/tradingEngine.js';

const router = express.Router();

// Place new trade
router.post('/place', authenticate, async (req, res) => {
  // Allow both traders and admins to place trades
  if (req.user.role !== 'trader' && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Only trader or admin accounts can place trades.' });
  }
  try {
    const { asset, direction, amount, duration, accountType } = req.body;

    if (!asset || !direction || !amount || !duration) {
      return res.status(400).json({ success: false, message: 'Asset, direction, amount, and duration are required.' });
    }

    const normDir = direction.toUpperCase();
    if (!['CALL', 'PUT'].includes(normDir)) {
      return res.status(400).json({ success: false, message: 'Direction must be CALL or PUT.' });
    }

    const tradeAmount = parseFloat(amount);
    if (isNaN(tradeAmount) || tradeAmount < 10) {
      return res.status(400).json({ success: false, message: 'Minimum trade amount is KSh 10.' });
    }

    const acc = accountType === 'real' ? 'real' : 'demo';
    const normAsset = normalizeSymbol(asset);

    if (!isDbConnected()) {
      return res.status(503).json({ success: false, message: 'Database offline. Configure MONGODB_URI to place live trades.' });
    }

    // Refresh user balance from database
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if ((user.balances[acc] || 0) < tradeAmount) {
      return res.status(400).json({
        success: false,
        message: `Insufficient ${acc.toUpperCase()} balance (Current: KSh ${(user.balances[acc] || 0).toLocaleString()})`,
      });
    }

    // Get current asset payout rate from settings or default
    let payoutRate = 0.90;
    try {
      const setting = await Setting.findOne({ key: 'platform_settings' });
      if (setting && setting.payoutRates && setting.payoutRates.get(normAsset)) {
        payoutRate = setting.payoutRates.get(normAsset);
      }
    } catch (e) {
      // fallback
    }

    // Fetch official server market price for entry
    const entryPrice = getMarketPrice(normAsset);

    // Deduct balance immediately
    user.balances[acc] -= tradeAmount;
    await user.save();

    const openedAt = new Date();
    const expiresAt = new Date(openedAt.getTime() + parseInt(duration) * 1000);

    const trade = new Trade({
      userId: user._id,
      accountType: acc,
      asset: normAsset,
      direction: normDir,
      amount: tradeAmount,
      payoutRate,
      entryPrice,
      duration: parseInt(duration),
      openedAt,
      expiresAt,
      outcome: 'PENDING',
    });

    await trade.save();

    return res.status(201).json({
      success: true,
      message: `${normDir} trade placed successfully on ${normAsset}!`,
      trade,
      updatedBalance: user.balances[acc],
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to place trade', error: error.message });
  }
});

// Get user's active (pending) trades
router.get('/active', authenticate, async (req, res) => {
  try {
    if (!isDbConnected()) return res.json({ success: true, trades: [] });

    const trades = await Trade.find({
      userId: req.user._id,
      outcome: 'PENDING',
    }).sort({ openedAt: -1 });

    return res.json({ success: true, trades });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Get user's resolved trade history
router.get('/history', authenticate, async (req, res) => {
  try {
    if (!isDbConnected()) return res.json({ success: true, trades: [] });

    const limit = parseInt(req.query.limit) || 30;
    const trades = await Trade.find({
      userId: req.user._id,
      outcome: { $ne: 'PENDING' },
    })
      .sort({ closedAt: -1 })
      .limit(limit);

    return res.json({ success: true, trades });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Update market price (Protected feed endpoint for authenticated feeder or admin)
router.post('/price-tick', (req, res) => {
  const feedSecret = req.headers['x-feed-secret'];
  const expectedSecret = process.env.PRICE_FEED_SECRET || 'apex_binary_price_feed_default_2026';

  if (feedSecret !== expectedSecret) {
    return res.status(403).json({ success: false, message: 'Unauthorized: Valid feed secret required in x-feed-secret header.' });
  }

  const { symbol, price } = req.body;
  if (symbol && price && !isNaN(parseFloat(price))) {
    updateMarketPrice(symbol, parseFloat(price));
    return res.json({ success: true, symbol: normalizeSymbol(symbol), price: getMarketPrice(symbol) });
  }
  return res.status(400).json({ success: false, message: 'Invalid symbol or price' });
});

export default router;

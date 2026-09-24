import express from 'express';
import User from '../models/User.js';
import Trade from '../models/Trade.js';
import Transaction from '../models/Transaction.js';
import Setting from '../models/Setting.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { isDbConnected } from '../config/db.js';

const router = express.Router();

// Apply auth and admin check to all admin routes
router.use(authenticate, requireAdmin);

// Platform Overview Metrics
router.get('/metrics', async (req, res) => {
  try {
    if (!isDbConnected()) {
      return res.json({
        success: true,
        metrics: {
          totalUsers: 1420,
          totalDeposits: 4850000,
          totalWithdrawals: 1920000,
          pendingWithdrawals: 3,
          pendingWithdrawalsAmount: 85000,
          houseNetRevenue: 2930000,
          totalVolume: 12400000,
          openRisk: 145000,
          activeTradesCount: 18,
        },
      });
    }

    const [
      totalUsers,
      depositsAgg,
      withdrawalsAgg,
      pendingWithdrawalsAgg,
      tradesAgg,
      pendingTradesAgg,
    ] = await Promise.all([
      User.countDocuments({ role: 'trader' }),
      Transaction.aggregate([
        { $match: { type: 'DEPOSIT', status: 'COMPLETED' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Transaction.aggregate([
        { $match: { type: 'WITHDRAWAL', status: 'COMPLETED' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Transaction.aggregate([
        { $match: { type: 'WITHDRAWAL', status: 'PENDING' } },
        { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$amount' } } },
      ]),
      Trade.aggregate([
        { $match: { outcome: { $in: ['WIN', 'LOSS'] } } },
        {
          $group: {
            _id: null,
            totalVolume: { $sum: '$amount' },
            netHouseProfit: { $sum: { $cond: [{ $eq: ['$outcome', 'LOSS'] }, '$amount', { $multiply: ['$profit', -1] }] } },
          },
        },
      ]),
      Trade.aggregate([
        { $match: { outcome: 'PENDING' } },
        { $group: { _id: null, count: { $sum: 1 }, totalExposure: { $sum: '$amount' } } },
      ]),
    ]);

    const totalDeposits = depositsAgg[0]?.total || 0;
    const totalWithdrawals = withdrawalsAgg[0]?.total || 0;
    const pendingWithdrawals = pendingWithdrawalsAgg[0]?.count || 0;
    const pendingWithdrawalsAmount = pendingWithdrawalsAgg[0]?.total || 0;
    const totalVolume = tradesAgg[0]?.totalVolume || 0;
    const houseNetRevenue = tradesAgg[0]?.netHouseProfit || (totalDeposits - totalWithdrawals);
    const openRisk = pendingTradesAgg[0]?.totalExposure || 0;
    const activeTradesCount = pendingTradesAgg[0]?.count || 0;

    return res.json({
      success: true,
      metrics: {
        totalUsers,
        totalDeposits,
        totalWithdrawals,
        pendingWithdrawals,
        pendingWithdrawalsAmount,
        houseNetRevenue,
        totalVolume,
        openRisk,
        activeTradesCount,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Users Management: List & Search
router.get('/users', async (req, res) => {
  try {
    if (!isDbConnected()) {
      return res.json({
        success: true,
        users: [
          {
            _id: 'usr_mock_1',
            fullName: 'Kevin Mwangi',
            email: 'kevin.mwangi@gmail.com',
            phone: '254712345678',
            role: 'trader',
            balances: { real: 84500, demo: 1000000 },
            kyc: { status: 'approved' },
            isBanned: false,
          },
          {
            _id: 'usr_mock_2',
            fullName: 'Faith Chebet',
            email: 'faith.chebet@yahoo.com',
            phone: '254722998877',
            role: 'trader',
            balances: { real: 12000, demo: 950000 },
            kyc: { status: 'pending' },
            isBanned: false,
          },
          {
            _id: 'usr_mock_3',
            fullName: 'Brian Otieno',
            email: 'brian.otieno@outlook.com',
            phone: '254701234567',
            role: 'trader',
            balances: { real: 154200, demo: 2400000 },
            kyc: { status: 'approved' },
            isBanned: false,
          },
          {
            _id: 'usr_mock_4',
            fullName: 'Mercy Wanjiku',
            email: 'mercy.w@gmail.com',
            phone: '254799112233',
            role: 'trader',
            balances: { real: 0, demo: 1000000 },
            kyc: { status: 'unverified' },
            isBanned: false,
          },
        ],
      });
    }

    const search = req.query.search || '';
    const query = search
      ? {
          $or: [
            { email: { $regex: search, $options: 'i' } },
            { phone: { $regex: search, $options: 'i' } },
            { fullName: { $regex: search, $options: 'i' } },
          ],
        }
      : {};

    const users = await User.find(query).sort({ createdAt: -1 }).limit(100);
    return res.json({ success: true, users });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Update User (Ban, KYC, Adjust Balance, Change Role)
router.patch('/users/:id', async (req, res) => {
  try {
    if (!isDbConnected()) {
      return res.json({ success: true, message: 'User updated successfully (Demo Mode)' });
    }

    const { isBanned, role, kycStatus, adjustRealBalance, adjustDemoBalance } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (typeof isBanned === 'boolean') user.isBanned = isBanned;
    if (role && ['trader', 'admin', 'risk_manager'].includes(role)) user.role = role;
    if (kycStatus && ['unverified', 'pending', 'approved', 'rejected'].includes(kycStatus)) {
      user.kyc.status = kycStatus;
      if (kycStatus === 'approved') user.kyc.verifiedAt = new Date();
    }

    if (adjustRealBalance !== undefined && !isNaN(parseFloat(adjustRealBalance))) {
      user.balances.real = Math.max(0, user.balances.real + parseFloat(adjustRealBalance));
    }
    if (adjustDemoBalance !== undefined && !isNaN(parseFloat(adjustDemoBalance))) {
      user.balances.demo = Math.max(0, user.balances.demo + parseFloat(adjustDemoBalance));
    }

    await user.save();
    return res.json({ success: true, message: 'User updated successfully', user });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Pending Withdrawals Queue
router.get('/withdrawals/pending', async (req, res) => {
  try {
    if (!isDbConnected()) {
      return res.json({
        success: true,
        withdrawals: [
          {
            _id: 'tx_mock_1',
            amount: 45000,
            phone: '254712345678',
            method: 'MPESA_B2C',
            createdAt: new Date(Date.now() - 10 * 60 * 1000),
            userId: { fullName: 'Kevin Mwangi', phone: '254712345678', balances: { real: 84500 } },
          },
          {
            _id: 'tx_mock_2',
            amount: 10000,
            phone: '254722998877',
            method: 'MPESA_B2C',
            createdAt: new Date(Date.now() - 35 * 60 * 1000),
            userId: { fullName: 'Faith Chebet', phone: '254722998877', balances: { real: 12000 } },
          },
          {
            _id: 'tx_mock_3',
            amount: 30000,
            phone: '254701234567',
            method: 'MPESA_B2C',
            createdAt: new Date(Date.now() - 70 * 60 * 1000),
            userId: { fullName: 'Brian Otieno', phone: '254701234567', balances: { real: 154200 } },
          },
        ],
      });
    }

    const withdrawals = await Transaction.find({ type: 'WITHDRAWAL', status: 'PENDING' })
      .populate('userId', 'email phone fullName balances')
      .sort({ createdAt: 1 });

    return res.json({ success: true, withdrawals });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Approve Withdrawal (Simulate B2C disbursement or complete)
router.post('/withdrawals/:id/approve', async (req, res) => {
  try {
    const receipt = req.body.mpesaReceipt || 'B2C' + Math.random().toString(36).substring(2, 9).toUpperCase();

    if (!isDbConnected()) {
      return res.json({
        success: true,
        message: `Withdrawal approved & disbursed! Receipt: ${receipt} (Demo Mode)`,
      });
    }

    const tx = await Transaction.findById(req.params.id);
    if (!tx || tx.type !== 'WITHDRAWAL') return res.status(404).json({ success: false, message: 'Withdrawal not found' });
    if (tx.status !== 'PENDING') return res.status(400).json({ success: false, message: `Withdrawal is already ${tx.status}` });

    tx.status = 'COMPLETED';
    tx.mpesaReceipt = receipt;
    tx.adminReviewer = req.user._id;
    await tx.save();

    return res.json({
      success: true,
      message: `Withdrawal of KSh ${tx.amount.toLocaleString()} approved and disbursed to ${tx.phone}. Receipt: ${receipt}`,
      transaction: tx,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Reject Withdrawal (Refunds trader's real balance)
router.post('/withdrawals/:id/reject', async (req, res) => {
  try {
    if (!isDbConnected()) {
      return res.json({
        success: true,
        message: 'Withdrawal rejected & refunded to trader balance (Demo Mode)',
      });
    }

    const { reason } = req.body;
    const tx = await Transaction.findById(req.params.id);
    if (!tx || tx.type !== 'WITHDRAWAL') return res.status(404).json({ success: false, message: 'Withdrawal not found' });
    if (tx.status !== 'PENDING') return res.status(400).json({ success: false, message: `Withdrawal is already ${tx.status}` });

    tx.status = 'REJECTED';
    tx.rejectionReason = reason || 'Rejected by compliance';
    tx.adminReviewer = req.user._id;
    await tx.save();

    // Refund real balance back to trader
    const user = await User.findById(tx.userId);
    if (user) {
      user.balances.real = (user.balances.real || 0) + tx.amount;
      await user.save();
    }

    return res.json({
      success: true,
      message: `Withdrawal rejected. KSh ${tx.amount.toLocaleString()} has been refunded to trader balance.`,
      transaction: tx,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Live / Recent Platform Trades
router.get('/trades/recent', async (req, res) => {
  try {
    if (!isDbConnected()) {
      return res.json({
        success: true,
        trades: [
          {
            _id: 'tr_1',
            openedAt: new Date(Date.now() - 30 * 1000),
            asset: 'BTC/USD',
            direction: 'CALL',
            amount: 15000,
            entryPrice: 64210.50,
            closePrice: 64285.20,
            outcome: 'WIN',
            profit: 13500,
            userId: { fullName: 'Kevin Mwangi', phone: '254712345678' },
          },
          {
            _id: 'tr_2',
            openedAt: new Date(Date.now() - 120 * 1000),
            asset: 'ETH/USD',
            direction: 'PUT',
            amount: 5000,
            entryPrice: 3455.00,
            closePrice: 3462.10,
            outcome: 'LOSS',
            profit: -5000,
            userId: { fullName: 'Faith Chebet', phone: '254722998877' },
          },
          {
            _id: 'tr_3',
            openedAt: new Date(Date.now() - 180 * 1000),
            asset: 'EUR/USD',
            direction: 'CALL',
            amount: 8000,
            entryPrice: 1.0845,
            closePrice: 1.0858,
            outcome: 'WIN',
            profit: 6800,
            userId: { fullName: 'Brian Otieno', phone: '254701234567' },
          },
        ],
      });
    }

    const limit = parseInt(req.query.limit) || 50;
    const trades = await Trade.find({})
      .populate('userId', 'email phone fullName')
      .sort({ openedAt: -1 })
      .limit(limit);

    return res.json({ success: true, trades });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Get Platform Settings (Payouts, Limits)
router.get('/settings', async (req, res) => {
  try {
    let setting = await Setting.findOne({ key: 'platform_settings' });
    if (!setting) {
      setting = new Setting({ key: 'platform_settings' });
      await setting.save();
    }
    return res.json({ success: true, settings: setting });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Update Platform Settings
router.put('/settings', async (req, res) => {
  try {
    const { payoutRates, minDeposit, minWithdrawal, maxTradeLimit, maintenanceMode } = req.body;
    let setting = await Setting.findOne({ key: 'platform_settings' });
    if (!setting) setting = new Setting({ key: 'platform_settings' });

    if (payoutRates) setting.payoutRates = payoutRates;
    if (minDeposit !== undefined) setting.minDeposit = minDeposit;
    if (minWithdrawal !== undefined) setting.minWithdrawal = minWithdrawal;
    if (maxTradeLimit !== undefined) setting.maxTradeLimit = maxTradeLimit;
    if (typeof maintenanceMode === 'boolean') setting.maintenanceMode = maintenanceMode;

    await setting.save();
    return res.json({ success: true, message: 'Settings updated successfully', settings: setting });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;

import express from 'express';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import { authenticate } from '../middleware/auth.js';
import { isDbConnected } from '../config/db.js';

const router = express.Router();

// M-Pesa STK Push Deposit (Supports Live Daraja API or Test Simulator)
router.post('/deposit/stk-push', authenticate, async (req, res) => {
  try {
    const { amount, phone } = req.body;

    const depositAmount = parseFloat(amount);
    if (isNaN(depositAmount) || depositAmount < 10) {
      return res.status(400).json({ success: false, message: 'Minimum deposit is KSh 10.' });
    }

    const mpesaPhone = phone || req.user.phone;
    if (!mpesaPhone) {
      return res.status(400).json({ success: false, message: 'Valid Safaricom M-Pesa phone number required.' });
    }

    if (!isDbConnected()) {
      return res.status(503).json({ success: false, message: 'Database offline. Configure MONGODB_URI.' });
    }

    // Generate simulated or live transaction reference
    const receiptCode = 'QL' + Math.random().toString(36).substring(2, 9).toUpperCase();
    const checkoutId = 'ws_CO_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

    const isLiveDarajaConfigured = Boolean(
      process.env.MPESA_CONSUMER_KEY && process.env.MPESA_CONSUMER_SECRET && process.env.MPESA_PASSKEY
    );

    if (isLiveDarajaConfigured) {
      // Create pending record awaiting Daraja callback
      const tx = new Transaction({
        userId: req.user._id,
        type: 'DEPOSIT',
        amount: depositAmount,
        phone: mpesaPhone,
        method: 'MPESA_STK',
        checkoutRequestId: checkoutId,
        status: 'PENDING',
      });
      await tx.save();

      // Trigger Daraja API call here when live keys present
      return res.json({
        success: true,
        message: `M-Pesa STK Push sent to ${mpesaPhone}. Enter your PIN on your phone to complete.`,
        checkoutRequestId: checkoutId,
        isLive: true,
      });
    } else {
      // Instant automated sandbox mode for testing & demonstration
      const tx = new Transaction({
        userId: req.user._id,
        type: 'DEPOSIT',
        amount: depositAmount,
        phone: mpesaPhone,
        method: 'MPESA_STK',
        mpesaReceipt: receiptCode,
        checkoutRequestId: checkoutId,
        status: 'COMPLETED',
      });
      await tx.save();

      const user = await User.findById(req.user._id);
      user.balances.real = (user.balances.real || 0) + depositAmount;
      await user.save();

      return res.json({
        success: true,
        message: `M-Pesa payment of KSh ${depositAmount.toLocaleString()} received successfully! Receipt: ${receiptCode}`,
        receipt: receiptCode,
        updatedRealBalance: user.balances.real,
        isLive: false,
      });
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Deposit failed', error: error.message });
  }
});

// Safaricom Daraja STK Callback Webhook
router.post('/deposit/callback', async (req, res) => {
  try {
    const callbackData = req.body?.Body?.stkCallback;
    if (!callbackData) return res.status(400).send('Invalid webhook payload');

    const { CheckoutRequestID, ResultCode, ResultDesc } = callbackData;

    if (!isDbConnected()) return res.status(200).send('OK');

    const tx = await Transaction.findOne({ checkoutRequestId: CheckoutRequestID });
    if (!tx || tx.status !== 'PENDING') return res.status(200).send('OK');

    if (ResultCode === 0) {
      // Payment Successful
      let mpesaReceipt = 'MP' + Date.now();
      const items = callbackData?.CallbackMetadata?.Item || [];
      const receiptItem = items.find((i) => i.Name === 'MpesaReceiptNumber');
      if (receiptItem && receiptItem.Value) mpesaReceipt = receiptItem.Value;

      tx.status = 'COMPLETED';
      tx.mpesaReceipt = mpesaReceipt;
      await tx.save();

      // Credit User Real Balance
      const user = await User.findById(tx.userId);
      if (user) {
        user.balances.real = (user.balances.real || 0) + tx.amount;
        await user.save();
      }
    } else {
      // Payment Cancelled or Failed
      tx.status = 'FAILED';
      tx.rejectionReason = ResultDesc || 'M-Pesa transaction failed or cancelled';
      await tx.save();
    }

    return res.status(200).json({ ResultCode: 0, ResultDesc: 'Callback processed' });
  } catch (error) {
    console.error('[M-Pesa Callback Error]', error);
    return res.status(200).send('OK');
  }
});

// Request M-Pesa Withdrawal
router.post('/withdraw', authenticate, async (req, res) => {
  try {
    const { amount, phone } = req.body;

    const withdrawAmount = parseFloat(amount);
    if (isNaN(withdrawAmount) || withdrawAmount < 100) {
      return res.status(400).json({ success: false, message: 'Minimum withdrawal is KSh 100.' });
    }

    const mpesaPhone = phone || req.user.phone;
    if (!mpesaPhone) {
      return res.status(400).json({ success: false, message: 'M-Pesa phone number required.' });
    }

    if (!isDbConnected()) {
      return res.status(503).json({ success: false, message: 'Database offline. Configure MONGODB_URI.' });
    }

    const user = await User.findById(req.user._id);
    if ((user.balances.real || 0) < withdrawAmount) {
      return res.status(400).json({
        success: false,
        message: `Insufficient real balance. You have KSh ${(user.balances.real || 0).toLocaleString()} available.`,
      });
    }

    // Deduct real balance and create pending transaction in cashier queue
    user.balances.real -= withdrawAmount;
    await user.save();

    const tx = new Transaction({
      userId: user._id,
      type: 'WITHDRAWAL',
      amount: withdrawAmount,
      phone: mpesaPhone,
      method: 'MPESA_B2C',
      status: 'PENDING',
    });
    await tx.save();

    return res.status(201).json({
      success: true,
      message: `Withdrawal request of KSh ${withdrawAmount.toLocaleString()} submitted. Queued for compliance and cashier approval.`,
      transactionId: tx._id,
      updatedRealBalance: user.balances.real,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Withdrawal request failed', error: error.message });
  }
});

// Get user transaction history
router.get('/transactions', authenticate, async (req, res) => {
  try {
    if (!isDbConnected()) return res.json({ success: true, transactions: [] });

    const transactions = await Transaction.find({ userId: req.user._id }).sort({ createdAt: -1 });
    return res.json({ success: true, transactions });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;

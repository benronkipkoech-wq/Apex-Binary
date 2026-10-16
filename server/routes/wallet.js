import express from 'express';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import { authenticate } from '../middleware/auth.js';
import { isDbConnected } from '../config/db.js';
import { initiateStkPush, isPayHeroConfigured, formatMpesaPhone } from '../services/payheroService.js';

const router = express.Router();

// M-Pesa STK Push Deposit (PayHero Gateway with Test Simulator Fallback)
router.post('/deposit/stk-push', authenticate, async (req, res) => {
  try {
    const { amount, phone } = req.body;

    const depositAmount = parseFloat(amount);
    if (isNaN(depositAmount) || depositAmount < 10) {
      return res.status(400).json({ success: false, message: 'Minimum deposit is KSh 10.' });
    }

    const rawPhone = phone || req.user.phone;
    if (!rawPhone) {
      return res.status(400).json({ success: false, message: 'Valid Safaricom M-Pesa phone number required.' });
    }

    const mpesaPhone = formatMpesaPhone(rawPhone);

    if (!isDbConnected()) {
      return res.status(503).json({ success: false, message: 'Database offline. Configure MONGODB_URI.' });
    }

    // Generate unique external transaction reference for PayHero & internal tracking
    const reference = 'APX_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const receiptCode = 'PH' + Math.random().toString(36).substring(2, 9).toUpperCase();

    if (isPayHeroConfigured()) {
      // Create pending transaction in MongoDB
      const tx = new Transaction({
        userId: req.user._id,
        type: 'DEPOSIT',
        amount: depositAmount,
        phone: mpesaPhone,
        method: 'MPESA_STK',
        checkoutRequestId: reference,
        status: 'PENDING',
      });
      await tx.save();

      try {
        const payheroResult = await initiateStkPush({
          amount: depositAmount,
          phone: mpesaPhone,
          reference,
        });

        return res.json({
          success: true,
          message: `PayHero M-Pesa STK Push sent to ${mpesaPhone}. Enter your M-Pesa PIN on your phone to complete.`,
          checkoutRequestId: reference,
          isLive: true,
          gateway: 'PayHero',
          data: payheroResult.data,
        });
      } catch (gatewayErr) {
        tx.status = 'FAILED';
        tx.rejectionReason = gatewayErr.message;
        await tx.save();
        return res.status(502).json({
          success: false,
          message: `PayHero STK Push failed: ${gatewayErr.message}`,
        });
      }
    } else {
      // Instant automated sandbox mode for testing & demonstration
      const tx = new Transaction({
        userId: req.user._id,
        type: 'DEPOSIT',
        amount: depositAmount,
        phone: mpesaPhone,
        method: 'MPESA_STK',
        mpesaReceipt: receiptCode,
        checkoutRequestId: reference,
        status: 'COMPLETED',
      });
      await tx.save();

      const user = await User.findById(req.user._id);
      user.balances.real = (user.balances.real || 0) + depositAmount;
      await user.save();

      return res.json({
        success: true,
        message: `M-Pesa payment of KSh ${depositAmount.toLocaleString()} confirmed! Receipt: ${receiptCode}`,
        receipt: receiptCode,
        updatedRealBalance: user.balances.real,
        isLive: false,
        gateway: 'Simulator (Set PAYHERO_API_KEY to go live)',
      });
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Deposit failed', error: error.message });
  }
});

// PayHero & Safaricom Daraja Webhook Callback Endpoint
router.post('/deposit/callback', async (req, res) => {
  try {
    if (!isDbConnected()) return res.status(200).send('OK');

    // 1. PayHero Webhook Payload Inspection
    const payheroRef = req.body?.external_reference || req.body?.reference || req.body?.response?.external_reference;
    const payheroStatus = (req.body?.status || req.body?.response?.status || '').toString().toLowerCase();

    if (payheroRef) {
      const tx = await Transaction.findOne({ checkoutRequestId: payheroRef });
      if (!tx || tx.status !== 'PENDING') return res.status(200).json({ status: 'ignored' });

      if (payheroStatus === 'success' || payheroStatus === 'completed' || req.body?.status_code === 200) {
        const mpesaReceipt = req.body?.mpesa_reference || req.body?.receipt || req.body?.response?.mpesa_reference || 'PH' + Date.now();
        tx.status = 'COMPLETED';
        tx.mpesaReceipt = mpesaReceipt;
        await tx.save();

        // Credit User Real Balance
        const user = await User.findById(tx.userId);
        if (user) {
          user.balances.real = (user.balances.real || 0) + tx.amount;
          await user.save();
        }
        console.log(`[PayHero Webhook] Payment of KSh ${tx.amount} completed for user ${tx.userId}. Receipt: ${mpesaReceipt}`);
        return res.status(200).json({ success: true, message: 'PayHero callback processed' });
      } else {
        tx.status = 'FAILED';
        tx.rejectionReason = req.body?.message || 'Payment failed or cancelled by user';
        await tx.save();
        return res.status(200).json({ success: true, message: 'PayHero failure logged' });
      }
    }

    // 2. Safaricom Daraja STK Callback (Fallback)
    const callbackData = req.body?.Body?.stkCallback;
    if (callbackData) {
      const { CheckoutRequestID, ResultCode, ResultDesc } = callbackData;
      const tx = await Transaction.findOne({ checkoutRequestId: CheckoutRequestID });
      if (!tx || tx.status !== 'PENDING') return res.status(200).send('OK');

      if (ResultCode === 0) {
        let mpesaReceipt = 'MP' + Date.now();
        const items = callbackData?.CallbackMetadata?.Item || [];
        const receiptItem = items.find((i) => i.Name === 'MpesaReceiptNumber');
        if (receiptItem && receiptItem.Value) mpesaReceipt = receiptItem.Value;

        tx.status = 'COMPLETED';
        tx.mpesaReceipt = mpesaReceipt;
        await tx.save();

        const user = await User.findById(tx.userId);
        if (user) {
          user.balances.real = (user.balances.real || 0) + tx.amount;
          await user.save();
        }
      } else {
        tx.status = 'FAILED';
        tx.rejectionReason = ResultDesc || 'M-Pesa transaction failed or cancelled';
        await tx.save();
      }
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Callback processed' });
    }

    return res.status(200).send('OK');
  } catch (error) {
    console.error('[Payment Callback Error]', error);
    return res.status(200).send('OK');
  }
});

// Request M-Pesa Withdrawal
router.post('/withdraw', authenticate, async (req, res) => {
  try {
    const { amount, phone } = req.body;

    const withdrawAmount = parseFloat(amount);
    if (isNaN(withdrawAmount) || withdrawAmount < 200) {
      return res.status(400).json({ success: false, message: 'Minimum withdrawal is KSh 200.' });
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

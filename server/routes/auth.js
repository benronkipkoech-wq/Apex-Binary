import express from 'express';
import User from '../models/User.js';
import { generateToken, authenticate } from '../middleware/auth.js';
import { sendVerificationEmail } from '../services/emailService.js';
import { isDbConnected } from '../config/db.js';

const router = express.Router();

// Helper to normalize phone
function cleanPhone(p) {
  if (!p) return '';
  return p.toString().replace(/\D/g, '');
}

// Register new trader (Supports Phone + PIN or Email + Password)
router.post('/register', async (req, res) => {
  try {
    const { email, phone, password, pin, fullName } = req.body;
    const authSecret = pin || password;
    const userPhone = cleanPhone(phone);

    if (!userPhone || !authSecret) {
      return res.status(400).json({ success: false, message: 'Phone number and PIN/password are required.' });
    }

    const userEmail = email ? email.toLowerCase().trim() : `${userPhone}@apexbinary.ke`;
    const traderName = fullName || 'Apex Trader';

    if (!isDbConnected()) {
      // Local/offline demo mode token for instant trader experience
      const mockTrader = {
        _id: 'trader_' + userPhone,
        email: userEmail,
        phone: userPhone,
        fullName: traderName,
        role: 'trader',
        balances: { demo: 1000000, real: 0 },
      };
      const token = generateToken(mockTrader);
      return res.status(201).json({
        success: true,
        message: 'Account created successfully (Offline Demo Mode).',
        token,
        user: mockTrader,
      });
    }

    const existingUser = await User.findOne({ $or: [{ email: userEmail }, { phone: userPhone }] });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'An account with this phone number or email already exists.' });
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const user = new User({
      email: userEmail,
      phone: userPhone,
      fullName: traderName,
      password: authSecret,
      role: 'trader',
      balances: {
        demo: 1000000,
        real: 0,
      },
      verificationCode,
      isVerified: false,
    });

    await user.save();
    // Send verification email
    await sendVerificationEmail(user.email, verificationCode);

    // Do not issue JWT yet; client must verify email first
    return res.status(201).json({
      success: true,
      message: 'Account created successfully! Please check your email for the verification code.',
      userId: user._id,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Registration failed', error: error.message });
  }
});

// Login (Supports Phone + PIN or Email + Password)
router.post('/login', async (req, res) => {
  try {
    const { email, phone, password, pin } = req.body;
    const authSecret = pin || password;
    const userPhone = cleanPhone(phone);

    if ((!email && !userPhone) || !authSecret) {
      return res.status(400).json({ success: false, message: 'Valid phone/email and PIN/password are required.' });
    }

    if (!isDbConnected()) {
      // Allow administrator login in local demo mode when MongoDB is offline
      if (email && email.toLowerCase() === 'admin@apexbinary.ke' && password === 'ApexAdmin@2026') {
        const mockAdmin = {
          _id: '66f2dc98b4728f321098abcd',
          email: 'admin@apexbinary.ke',
          phone: '254700000000',
          fullName: 'Apex System Administrator',
          role: 'admin',
          balances: { demo: 10000000, real: 500000 },
          kyc: { status: 'approved' },
        };
        const token = generateToken(mockAdmin);
        return res.json({
          success: true,
          message: 'Admin authenticated (Local Demo Mode)',
          token,
          user: mockAdmin,
        });
      }

      // Allow any trader phone + PIN in demo mode when MongoDB is offline
      if (userPhone && authSecret) {
        const mockTrader = {
          _id: 'trader_' + userPhone,
          email: `${userPhone}@apexbinary.ke`,
          phone: userPhone,
          fullName: 'Trader ' + userPhone.slice(-4),
          role: 'trader',
          balances: { demo: 1000000, real: 0 },
          kyc: { status: 'approved' },
        };
        const token = generateToken(mockTrader);
        return res.json({
          success: true,
          message: 'Trader authenticated (Local Demo Mode)',
          token,
          user: mockTrader,
        });
      }

      return res.status(503).json({
        success: false,
        message: 'Database offline. Configure MONGODB_URI or use demo credentials.',
      });
    }

    const query = email ? { email: email.toLowerCase().trim() } : { phone: userPhone };
    const user = await User.findOne(query);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials. User not found.' });
    }

    if (user.isBanned) {
      return res.status(403).json({ success: false, message: 'Account is suspended. Contact compliance support.' });
    }

    const isMatch = await user.comparePassword(authSecret);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials. Incorrect PIN or password.' });
    }

    if (!user.isVerified) {
      return res.status(403).json({ success: false, message: 'Account not verified. Please check your email for the verification code.' });
    }
    const token = generateToken(user);

    return res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        email: user.email,
        phone: user.phone,
        fullName: user.fullName,
        role: user.role,
        balances: user.balances,
        kyc: user.kyc,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Login failed', error: error.message });
  }
});

// Email verification endpoint
router.post('/verify-email', async (req, res) => {
  try {
    const { userId, code } = req.body;
    if (!userId || !code) {
      return res.status(400).json({ success: false, message: 'userId and code are required.' });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    if (user.isVerified) {
      return res.json({ success: true, message: 'Account already verified.' });
    }
    if (user.verificationCode !== code) {
      return res.status(400).json({ success: false, message: 'Invalid verification code.' });
    }
    user.isVerified = true;
    user.verificationCode = undefined;
    await user.save();
    return res.json({ success: true, message: 'Email verified successfully. You can now log in.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Verification failed', error: error.message });
  }
});

// Get current user profile
router.get('/me', authenticate, async (req, res) => {
  try {
    return res.json({
      success: true,
      user: {
        id: req.user._id,
        email: req.user.email,
        phone: req.user.phone,
        fullName: req.user.fullName,
        role: req.user.role,
        balances: req.user.balances,
        kyc: req.user.kyc,
        isVerified: req.user.isVerified,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Seed default administrator if none exists
router.post('/seed-admin', async (req, res) => {
  try {
    const adminEmail = req.body.email || 'admin@apexbinary.ke';
    const adminPassword = req.body.password || 'ApexAdmin@2026';
    const adminPhone = req.body.phone || '254700000000';

    if (!isDbConnected()) {
      return res.status(200).json({
        success: true,
        message: 'Default admin credentials ready (Local Demo Mode).',
        credentials: { email: adminEmail, defaultPassword: adminPassword },
      });
    }

    const adminExists = await User.findOne({ role: 'admin' });
    if (adminExists) {
      return res.status(400).json({ success: false, message: 'An administrator account already exists.' });
    }

    const admin = new User({
      email: adminEmail.toLowerCase(),
      phone: adminPhone,
      fullName: 'Apex System Administrator',
      password: adminPassword,
      role: 'admin',
      balances: { demo: 10000000, real: 500000 },
      kyc: { status: 'approved' },
    });

    await admin.save();
    return res.status(201).json({
      success: true,
      message: 'Administrator account seeded successfully.',
      credentials: { email: adminEmail, defaultPassword: adminPassword },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;

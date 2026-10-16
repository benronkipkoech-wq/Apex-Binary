import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    fullName: {
      type: String,
      default: 'Trader',
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ['trader', 'admin', 'risk_manager'],
      default: 'trader',
    },
    verificationCode: { type: String },
    isVerified: { type: Boolean, default: false },
    resetCode: { type: String },
    resetCodeExpiry: { type: Date },
    balances: {
      demo: {
        type: Number,
        default: 1000000, // KSh 1,000,000 demo account
      },
      real: {
        type: Number,
        default: 0, // KSh 0 live account initial
      },
    },
    kyc: {
      status: {
        type: String,
        enum: ['unverified', 'pending', 'approved', 'rejected'],
        default: 'unverified',
      },
      idNumber: { type: String, default: '' },
      verifiedAt: { type: Date },
    },
    isBanned: {
      type: Boolean,
      default: false,
    },
    xp: {
      type: Number,
      default: 0,
    },
    level: {
      type: Number,
      default: 1,
    },
    joinedTournaments: [
      {
        id: { type: String, required: true },
        score: { type: Number, default: 0 },
        joinedAt: { type: Date, default: Date.now },
      },
    ],
    activeBots: [
      {
        id: { type: String },
        stake: { type: Number },
      },
    ],
    copySettings: [
      {
        traderId: { type: String },
        stake: { type: Number },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Method to verify password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Omit password from JSON representation
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

export const User = mongoose.model('User', userSchema);
export default User;

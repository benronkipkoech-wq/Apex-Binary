import mongoose from 'mongoose';

const tradeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    accountType: {
      type: String,
      enum: ['demo', 'real'],
      default: 'demo',
      index: true,
    },
    asset: {
      type: String,
      required: true,
      index: true,
    },
    direction: {
      type: String,
      enum: ['CALL', 'PUT'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 50,
    },
    payoutRate: {
      type: Number,
      required: true,
      default: 0.90, // 90% payout
    },
    entryPrice: {
      type: Number,
      required: true,
    },
    closePrice: {
      type: Number,
    },
    outcome: {
      type: String,
      enum: ['PENDING', 'WIN', 'LOSS', 'TIE'],
      default: 'PENDING',
      index: true,
    },
    profit: {
      type: Number,
      default: 0,
    },
    duration: {
      type: Number,
      default: 60, // seconds
    },
    openedAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    closedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

export const Trade = mongoose.model('Trade', tradeSchema);
export default Trade;

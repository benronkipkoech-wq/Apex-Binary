import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['DEPOSIT', 'WITHDRAWAL'],
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 10,
    },
    currency: {
      type: String,
      default: 'KES',
    },
    phone: {
      type: String,
      required: true,
    },
    method: {
      type: String,
      enum: ['MPESA_STK', 'MPESA_B2C', 'MANUAL'],
      default: 'MPESA_STK',
    },
    mpesaReceipt: {
      type: String,
      index: true,
    },
    checkoutRequestId: {
      type: String,
      index: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'COMPLETED', 'FAILED', 'REJECTED'],
      default: 'PENDING',
      index: true,
    },
    adminReviewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    rejectionReason: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

export const Transaction = mongoose.model('Transaction', transactionSchema);
export default Transaction;

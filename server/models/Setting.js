import mongoose from 'mongoose';

const settingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: 'platform_settings',
    },
    payoutRates: {
      type: Map,
      of: Number,
      default: {
        'BTC/USD': 0.90,
        'ETH/USD': 0.88,
        'SOL/USD': 0.85,
        'EUR/USD': 0.85,
        'GBP/USD': 0.84,
        'USD/KES': 0.82,
      },
    },
    minDeposit: {
      type: Number,
      default: 500, // KSh 500
    },
    minWithdrawal: {
      type: Number,
      default: 500, // KSh 500
    },
    maxTradeLimit: {
      type: Number,
      default: 100000, // KSh 100,000
    },
    maintenanceMode: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

export const Setting = mongoose.model('Setting', settingSchema);
export default Setting;

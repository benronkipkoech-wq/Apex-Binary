// Automated Strategy Bots & Kenyan Social Copy Trading Engine

export const KENYAN_COPY_TRADERS = [
  {
    id: 'trader_brian',
    name: 'Brian Mwangi',
    location: 'Nairobi, Westlands',
    avatar: '👨🏾‍💼',
    winRate: 89.4,
    totalProfit: 'KSh 3,420,500',
    totalTrades: 1420,
    copiers: 1284,
    risk: 'Low Risk',
    badge: '🏆 Top Master',
    style: 'Conservative Scalper',
    favoriteAsset: 'USD/KES OTC',
    isCopying: false,
    copyStake: 500,
    stopLoss: 2000,
    algoPersona: 'sma' // Follows SMA Golden Cross
  },
  {
    id: 'trader_faith',
    name: 'Faith Chebet',
    location: 'Eldoret / Nairobi',
    avatar: '👩🏾‍💻',
    winRate: 84.8,
    totalProfit: 'KSh 2,150,000',
    totalTrades: 980,
    copiers: 892,
    risk: 'Medium Risk',
    badge: '⚡ Momentum Queen',
    style: 'Trend Follower',
    favoriteAsset: 'EUR/USD OTC',
    isCopying: false,
    copyStake: 500,
    stopLoss: 1500,
    algoPersona: 'macd' // Follows MACD momentum
  },
  {
    id: 'trader_kevin',
    name: 'Kevin Otieno',
    location: 'Mombasa / Nyali',
    avatar: '👨🏾‍🔬',
    winRate: 81.2,
    totalProfit: 'KSh 1,840,200',
    totalTrades: 810,
    copiers: 645,
    risk: 'High Yield',
    badge: '💎 OTC Sniper',
    style: 'Volatility Breakout',
    favoriteAsset: 'Crypto 10 Index',
    isCopying: false,
    copyStake: 1000,
    stopLoss: 3000,
    algoPersona: 'bollinger' // Trades bollinger band breakouts
  },
  {
    id: 'trader_amina',
    name: 'Amina Hassan',
    location: 'Nakuru Town',
    avatar: '🧕🏾',
    winRate: 78.9,
    totalProfit: 'KSh 950,400',
    totalTrades: 520,
    copiers: 410,
    risk: 'Low Risk',
    badge: '🎯 Level 4 Tycoon',
    style: 'Support/Resistance Rebound',
    favoriteAsset: 'USD/KES OTC',
    isCopying: false,
    copyStake: 300,
    stopLoss: 1000,
    algoPersona: 'rsi' // Reverses on RSI extremes
  }
];

export const BOT_STRATEGIES = [
  {
    id: 'bot_rsi',
    name: 'RSI Momentum Scalper',
    icon: '⚡',
    description: 'Executes CALL when RSI drops below 32 (Oversold rebound) and PUT when RSI rises above 68 (Overbought exhaustion).',
    baseStake: 500,
    durationSec: 15,
    maxConcurrent: 2,
    status: 'idle',
    minLevel: 1,
    stats: { trades: 0, wins: 0, losses: 0, profitKES: 0 }
  },
  {
    id: 'bot_sma',
    name: 'SMA Golden/Death Cross',
    icon: '📈',
    description: 'Fast SMA (7) crossing above Slow SMA (25) triggers bullish CALL. Fast crossing below triggers bearish PUT.',
    baseStake: 500,
    durationSec: 30,
    maxConcurrent: 1,
    status: 'idle',
    minLevel: 1,
    stats: { trades: 0, wins: 0, losses: 0, profitKES: 0 }
  },
  {
    id: 'bot_bollinger',
    name: 'Bollinger Band Squeeze',
    icon: '🎢',
    description: 'Trades mean reversion. Buys CALL when price hits lower band, PUT when hitting upper band.',
    baseStake: 800,
    durationSec: 15,
    maxConcurrent: 1,
    status: 'idle',
    minLevel: 2, // Requires Level 2
    stats: { trades: 0, wins: 0, losses: 0, profitKES: 0 }
  },
  {
    id: 'bot_macd',
    name: 'MACD Trend Follower',
    icon: '🌊',
    description: 'Follows momentum shifts via MACD histogram crossovers. High accuracy, lower frequency.',
    baseStake: 1000,
    durationSec: 60,
    maxConcurrent: 1,
    status: 'idle',
    minLevel: 3, // Requires Level 3
    stats: { trades: 0, wins: 0, losses: 0, profitKES: 0 }
  },
  {
    id: 'bot_martingale',
    name: 'Martingale Rebound Engine',
    icon: '🔁',
    description: 'Systematic stake recovery strategy. Multiplies stake by 2.2x on loss to recover deficit and secure net profit upon next win.',
    baseStake: 200,
    currentStake: 200,
    multiplier: 2.2,
    durationSec: 15,
    maxSteps: 4,
    status: 'idle',
    minLevel: 4, // Requires Level 4 (Highest risk)
    stats: { trades: 0, wins: 0, losses: 0, profitKES: 0 }
  }
];

export class TradingBotsEngine {
  constructor(tradingEngine, marketEngine, audioEngine) {
    this.trading = tradingEngine;
    this.market = marketEngine;
    this.audio = audioEngine;
    this.traders = KENYAN_COPY_TRADERS;
    this.bots = BOT_STRATEGIES;
    this.listeners = new Set();

    this.copyInterval = null;
    this.botInterval = null;
    this.lastSmaFastAboveSlow = null;
    this.martingaleStep = 0;
    this.currentMartingaleStake = 200;

    this.initIntervals();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, data) {
    for (const listener of this.listeners) {
      try { listener(event, data); } catch (e) { console.error(e); }
    }
  }

  initIntervals() {
    // Check bots every 3 seconds
    this.botInterval = setInterval(() => this.evaluateBots(), 3000);

    // Simulated Kenyan social copy trading events every 14 seconds
    this.copyInterval = setInterval(() => this.simulateCopyTrades(), 14000);
  }

  // --- BOTS LOGIC ---
  startBot(botId, stakeAmount) {
    const bot = this.bots.find(b => b.id === botId);
    if (!bot) return;
    bot.status = 'running';
    if (stakeAmount && stakeAmount >= 50) {
      bot.baseStake = stakeAmount;
      if (bot.id === 'bot_martingale') {
        bot.currentStake = stakeAmount;
        this.currentMartingaleStake = stakeAmount;
        this.martingaleStep = 0;
      }
    }
    this.audio?.playTone?.(523, 0.1);
    this.notify('bot_updated', bot);
  }

  stopBot(botId) {
    const bot = this.bots.find(b => b.id === botId);
    if (!bot) return;
    bot.status = 'idle';
    if (bot.id === 'bot_martingale') {
      this.martingaleStep = 0;
      bot.currentStake = bot.baseStake;
    }
    this.notify('bot_updated', bot);
  }

  evaluateBots() {
    const currentAsset = this.market.getCurrentAsset();
    if (!currentAsset) return;

    // Get market indicators
    const rsi = this.market.indicators.rsi ? this.market.indicators.rsi[this.market.indicators.rsi.length - 1] : null;
    const sma7 = this.market.indicators.sma7 ? this.market.indicators.sma7[this.market.indicators.sma7.length - 1] : null;
    const sma25 = this.market.indicators.sma25 ? this.market.indicators.sma25[this.market.indicators.sma25.length - 1] : null;
    const bollinger = this.market.indicators.bollinger;
    const currentPrice = this.market.getCurrentPrice();

    for (const bot of this.bots) {
      if (bot.status !== 'running') continue;

      // Don't flood if user already has active trades
      if (this.trading.getActiveTrades().length >= 3) continue;

      if (bot.id === 'bot_rsi') {
        if (rsi !== null) {
          if (rsi <= 32) {
            this.executeBotTrade(bot, 'CALL', `RSI Oversold (${rsi.toFixed(1)})`);
          } else if (rsi >= 68) {
            this.executeBotTrade(bot, 'PUT', `RSI Overbought (${rsi.toFixed(1)})`);
          }
        }
      } else if (bot.id === 'bot_sma') {
        if (sma7 !== null && sma25 !== null) {
          const isFastAbove = sma7 > sma25;
          if (this.lastSmaFastAboveSlow !== null) {
            if (!this.lastSmaFastAboveSlow && isFastAbove) {
              this.executeBotTrade(bot, 'CALL', 'SMA Golden Cross (7 > 25)');
            } else if (this.lastSmaFastAboveSlow && !isFastAbove) {
              this.executeBotTrade(bot, 'PUT', 'SMA Death Cross (7 < 25)');
            }
          }
          this.lastSmaFastAboveSlow = isFastAbove;
        }
      } else if (bot.id === 'bot_bollinger') {
        if (bollinger && bollinger.lower.length > 0) {
          const lower = bollinger.lower[bollinger.lower.length - 1];
          const upper = bollinger.upper[bollinger.upper.length - 1];
          if (currentPrice <= lower * 1.0001) {
            this.executeBotTrade(bot, 'CALL', 'Bollinger Lower Band Touch');
          } else if (currentPrice >= upper * 0.9999) {
            this.executeBotTrade(bot, 'PUT', 'Bollinger Upper Band Touch');
          }
        }
      } else if (bot.id === 'bot_macd') {
        // Simulated MACD based on momentum for now (since we don't have MACD in market.js yet)
        if (rsi !== null) {
            // Pseudo-MACD: using RSI velocity
            const prevRsi = this.market.indicators.rsi[this.market.indicators.rsi.length - 3] || rsi;
            const rsiVelocity = rsi - prevRsi;
            if (rsiVelocity > 8 && rsi < 60) {
                this.executeBotTrade(bot, 'CALL', `MACD Bullish Crossover`);
            } else if (rsiVelocity < -8 && rsi > 40) {
                this.executeBotTrade(bot, 'PUT', `MACD Bearish Crossover`);
            }
        }
      } else if (bot.id === 'bot_martingale') {
        // Run Martingale with momentum bias
        const lastCandles = this.market.candles;
        if (lastCandles.length > 2) {
          const last = lastCandles[lastCandles.length - 1];
          const prev = lastCandles[lastCandles.length - 2];
          const direction = last.close >= prev.close ? 'CALL' : 'PUT';
          this.executeBotTrade(bot, direction, `Martingale Step ${this.martingaleStep + 1}`);
        }
      }
    }
  }

  executeBotTrade(bot, direction, reason) {
    let stake = bot.baseStake;
    if (bot.id === 'bot_martingale') {
      stake = this.currentMartingaleStake || bot.baseStake;
    }

    const trade = this.trading.placeTrade(direction, stake, bot.durationSec || 15);
    if (!trade) return;
    
    trade.isBotTrade = true;

    bot.stats.trades++;
    this.notify('bot_trade_placed', { bot, trade, reason });

    // Listen for this trade settlement
    const unsub = this.trading.subscribe((event, data) => {
      if (event === 'trade_settled' && data.trade.id === trade.id) {
        unsub();
        const won = data.trade.status === 'won';
        if (won) {
          bot.stats.wins++;
          bot.stats.profitKES += data.trade.payout - data.trade.amount;
          if (bot.id === 'bot_martingale') {
            this.martingaleStep = 0;
            this.currentMartingaleStake = bot.baseStake;
            bot.currentStake = bot.baseStake;
          }
        } else {
          bot.stats.losses++;
          bot.stats.profitKES -= data.trade.amount;
          if (bot.id === 'bot_martingale') {
            this.martingaleStep++;
            if (this.martingaleStep >= (bot.maxSteps || 4)) {
              // Reset after max steps to prevent liquidation
              this.martingaleStep = 0;
              this.currentMartingaleStake = bot.baseStake;
              bot.currentStake = bot.baseStake;
            } else {
              this.currentMartingaleStake = Math.round(stake * (bot.multiplier || 2.2));
              bot.currentStake = this.currentMartingaleStake;
            }
          }
        }
        this.notify('bot_updated', bot);
      }
    });
  }

  // --- COPY TRADING LOGIC ---
  toggleCopyTrader(traderId, stake) {
    const trader = this.traders.find(t => t.id === traderId);
    if (!trader) return;
    trader.isCopying = !trader.isCopying;
    if (stake && stake >= 50) {
      trader.copyStake = stake;
    }
    if (trader.isCopying) {
      this.audio?.playTone?.(659, 0.15);
    }
    this.notify('trader_updated', trader);
  }

  simulateCopyTrades() {
    const activeCopyTraders = this.traders.filter(t => t.isCopying);
    if (activeCopyTraders.length === 0) return;

    // Pick one trader randomly
    const trader = activeCopyTraders[Math.floor(Math.random() * activeCopyTraders.length)];
    const stake = trader.copyStake || 500;
    
    // Evaluate logic based on algorithmic persona
    let direction = null;
    let reason = '';
    const currentPrice = this.market.getCurrentPrice();
    const rsi = this.market.indicators.rsi ? this.market.indicators.rsi[this.market.indicators.rsi.length - 1] : 50;
    
    if (trader.algoPersona === 'sma') {
       const sma7 = this.market.indicators.sma7 ? this.market.indicators.sma7[this.market.indicators.sma7.length - 1] : currentPrice;
       const sma25 = this.market.indicators.sma25 ? this.market.indicators.sma25[this.market.indicators.sma25.length - 1] : currentPrice;
       direction = sma7 > sma25 ? 'CALL' : 'PUT';
       reason = `Following SMA Trend`;
    } else if (trader.algoPersona === 'macd') {
       const prevRsi = this.market.indicators.rsi[this.market.indicators.rsi.length - 3] || rsi;
       const rsiVelocity = rsi - prevRsi;
       direction = rsiVelocity > 0 ? 'CALL' : 'PUT';
       reason = `Momentum Swing`;
    } else if (trader.algoPersona === 'bollinger') {
       const bollinger = this.market.indicators.bollinger;
       if (bollinger && bollinger.lower.length > 0) {
          const mid = bollinger.mid[bollinger.mid.length - 1];
          direction = currentPrice < mid ? 'CALL' : 'PUT';
          reason = `Mean Reversion`;
       } else {
          direction = Math.random() > 0.5 ? 'CALL' : 'PUT';
       }
    } else if (trader.algoPersona === 'rsi') {
       direction = rsi < 50 ? 'CALL' : 'PUT';
       reason = `RSI Fade`;
    } else {
       direction = Math.random() > 0.5 ? 'CALL' : 'PUT';
       reason = `Random walk`;
    }

    // Place mirrored trade
    const trade = this.trading.placeTrade(direction, stake, 15);
    if (trade) {
      trade.isBotTrade = true;
      this.notify('copy_trade_mirrored', {
        trader,
        direction,
        stake,
        asset: this.market.currentAssetId,
        trade,
        reason
      });
    }
  }
}

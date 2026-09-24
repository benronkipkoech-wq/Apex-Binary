// Real-Time Financial Market Simulator & Indicator Engine

export const ASSETS = [
  {
    id: 'usd_kes_otc',
    name: 'USD / KES (OTC)',
    symbol: 'USD/KES OTC',
    category: 'forex',
    payout: 98,
    isHot: true,
    basePrice: 129.480,
    decimals: 3,
    icon: '🇰🇪',
    volatility: 0.0006
  },
  {
    id: 'usd_kes',
    name: 'USD / KES',
    symbol: 'USD/KES',
    category: 'forex',
    payout: 95,
    isHot: true,
    basePrice: 129.450,
    decimals: 3,
    icon: '🇰🇪',
    volatility: 0.00055
  },
  {
    id: 'crypto_idx',
    name: 'Crypto Top 10 Index',
    symbol: 'CRYPTO 10',
    category: 'crypto',
    payout: 96,
    isHot: true,
    basePrice: 4280.50,
    decimals: 2,
    icon: '🚀',
    volatility: 0.002
  },
  {
    id: 'eur_usd_otc',
    name: 'EUR / USD (OTC)',
    symbol: 'EUR/USD OTC',
    category: 'forex',
    payout: 94,
    basePrice: 1.08480,
    decimals: 5,
    icon: '🇪🇺',
    volatility: 0.00045
  },
  {
    id: 'btc_usdt',
    name: 'BTC / USDT',
    symbol: 'BTC/USDT',
    category: 'crypto',
    payout: 94,
    basePrice: 64250.00,
    decimals: 2,
    icon: '₿',
    volatility: 0.0018
  },
  {
    id: 'eth_usdt',
    name: 'ETH / USDT',
    symbol: 'ETH/USDT',
    category: 'crypto',
    payout: 91,
    basePrice: 3450.20,
    decimals: 2,
    icon: 'Ξ',
    volatility: 0.0022
  },
  {
    id: 'gold_usd',
    name: 'Gold (XAU/USD)',
    symbol: 'XAU/USD',
    category: 'commodities',
    payout: 93,
    basePrice: 2382.40,
    decimals: 2,
    icon: '🥇',
    volatility: 0.0008
  },
  {
    id: 'safaricom',
    name: 'Safaricom PLC (NSE)',
    symbol: 'SCOM.KE',
    category: 'stocks',
    payout: 92,
    basePrice: 17.85,
    decimals: 2,
    icon: '🟢',
    volatility: 0.0012
  },
  {
    id: 'gbp_usd',
    name: 'GBP / USD',
    symbol: 'GBP/USD',
    category: 'forex',
    payout: 90,
    basePrice: 1.28400,
    decimals: 5,
    icon: '🇬🇧',
    volatility: 0.0005
  },
  {
    id: 'aapl_usd',
    name: 'Apple Inc.',
    symbol: 'AAPL',
    category: 'stocks',
    payout: 88,
    basePrice: 226.50,
    decimals: 2,
    icon: '🍎',
    volatility: 0.0010
  }
];

export const TIMEFRAMES = {
  '5s': 5,
  '15s': 15,
  '30s': 30,
  '1m': 60,
  '5m': 300
};

export class MarketEngine {
  constructor() {
    this.currentAsset = ASSETS[0];
    this.currentTimeframe = '30s';
    this.candles = []; // Active timeframe candles
    this.rawTicks = []; // Recent ticks: { time, price }
    this.listeners = new Set();
    this.stats24h = {
      high: 0,
      low: 0,
      open24h: 0,
      changePct: 0
    };
    this.indicators = {
      sma7: [],
      sma25: [],
      bollinger: { upper: [], lower: [], mid: [] },
      rsi: [],
      sentiment: { bullish: 65, bearish: 35 }
    };

    this.tickTimer = null;
    this.isWsControlled = false;
    this.lastWsTickTime = 0;
    this.initMarket(this.currentAsset);
    this.startSimulation();
  }

  setAsset(assetId) {
    const asset = ASSETS.find(a => a.id === assetId);
    if (!asset || asset.id === this.currentAsset.id) return;
    this.isWsControlled = false;
    this.currentAsset = asset;
    this.initMarket(asset);
    this.notify();
  }

  setTimeframe(tf) {
    if (!TIMEFRAMES[tf] || tf === this.currentTimeframe) return;
    this.currentTimeframe = tf;
    this.rebuildCandlesFromHistory();
    this.notify();
  }

  getCandleTimeRemaining() {
    const intervalSec = TIMEFRAMES[this.currentTimeframe];
    const now = Math.floor(Date.now() / 1000);
    const elapsed = now % intervalSec;
    return intervalSec - elapsed;
  }

  initMarket(asset) {
    const intervalSec = TIMEFRAMES[this.currentTimeframe];
    const numCandles = 90;
    const now = Math.floor(Date.now() / 1000);
    const startTime = now - numCandles * intervalSec;

    this.candles = [];
    this.rawTicks = [];
    let currentPrice = asset.basePrice;
    let high24 = currentPrice * 1.008;
    let low24 = currentPrice * 0.992;
    const open24 = currentPrice * 0.996;

    // Generate historical candles with realistic brownian walk
    for (let i = 0; i < numCandles; i++) {
      const candleTime = startTime + i * intervalSec;
      const open = currentPrice;
      const volatility = asset.volatility * Math.sqrt(intervalSec / 10);
      
      const subTicks = 4;
      let minP = open;
      let maxP = open;
      for (let s = 0; s < subTicks; s++) {
        const delta = (Math.random() - 0.495) * 2 * volatility * currentPrice;
        currentPrice += delta;
        if (currentPrice > maxP) maxP = currentPrice;
        if (currentPrice < minP) minP = currentPrice;
      }
      const close = currentPrice;
      const high = Math.max(open, close, maxP + Math.random() * volatility * 0.5 * currentPrice);
      const low = Math.min(open, close, minP - Math.random() * volatility * 0.5 * currentPrice);

      if (high > high24) high24 = high;
      if (low < low24) low24 = low;

      this.candles.push({
        time: candleTime,
        open,
        high,
        low,
        close,
        volume: Math.floor(10 + Math.random() * 50)
      });
    }

    this.stats24h = {
      high: high24,
      low: low24,
      open24h: open24,
      changePct: ((currentPrice - open24) / open24) * 100
    };

    this.computeIndicators();
  }

  startSimulation() {
    if (this.tickTimer) clearInterval(this.tickTimer);

    // Micro-tick update every 300ms for hyper-smooth real-time trading
    this.tickTimer = setInterval(() => {
      this.generateLiveTick();
    }, 300);
  }

  generateLiveTick() {
    if (this.candles.length === 0) return;
    // If live WebSocket ticks are streaming, let them control price without simulated noise
    if (this.isWsControlled && (Date.now() - this.lastWsTickTime < 4000)) {
      return;
    }

    const lastCandle = this.candles[this.candles.length - 1];
    const asset = this.currentAsset;
    const intervalSec = TIMEFRAMES[this.currentTimeframe];
    const now = Math.floor(Date.now() / 1000);

    // Dynamic price walk with micro volatility impulses
    const momentum = (Math.random() - 0.494);
    const delta = momentum * asset.volatility * 0.38 * lastCandle.close;
    const newPrice = Number((lastCandle.close + delta).toFixed(asset.decimals));

    // Update 24h stats
    if (newPrice > this.stats24h.high) this.stats24h.high = newPrice;
    if (newPrice < this.stats24h.low) this.stats24h.low = newPrice;
    this.stats24h.changePct = ((newPrice - this.stats24h.open24h) / this.stats24h.open24h) * 100;

    const candleTime = Math.floor(now / intervalSec) * intervalSec;

    if (candleTime > lastCandle.time) {
      // Create new candle
      this.candles.push({
        time: candleTime,
        open: newPrice,
        high: newPrice,
        low: newPrice,
        close: newPrice,
        volume: 1
      });
      if (this.candles.length > 160) {
        this.candles.shift();
      }
    } else {
      // Update existing current candle
      lastCandle.close = newPrice;
      if (newPrice > lastCandle.high) lastCandle.high = newPrice;
      if (newPrice < lastCandle.low) lastCandle.low = newPrice;
      lastCandle.volume += 1;
    }

    this.computeIndicators();
    this.notify(newPrice);
  }

  pushExternalTick(price, time) {
    if (!price || this.candles.length === 0) return;
    this.isWsControlled = true;
    this.lastWsTickTime = Date.now();

    const lastCandle = this.candles[this.candles.length - 1];
    const asset = this.currentAsset;
    const intervalSec = TIMEFRAMES[this.currentTimeframe];
    const now = time || Math.floor(Date.now() / 1000);
    const newPrice = Number(price.toFixed(asset.decimals));

    if (newPrice > this.stats24h.high) this.stats24h.high = newPrice;
    if (newPrice < this.stats24h.low) this.stats24h.low = newPrice;
    this.stats24h.changePct = ((newPrice - this.stats24h.open24h) / this.stats24h.open24h) * 100;

    const candleTime = Math.floor(now / intervalSec) * intervalSec;

    if (candleTime > lastCandle.time) {
      this.candles.push({
        time: candleTime,
        open: newPrice,
        high: newPrice,
        low: newPrice,
        close: newPrice,
        volume: 1
      });
      if (this.candles.length > 160) {
        this.candles.shift();
      }
    } else {
      lastCandle.close = newPrice;
      if (newPrice > lastCandle.high) lastCandle.high = newPrice;
      if (newPrice < lastCandle.low) lastCandle.low = newPrice;
      lastCandle.volume += 1;
    }

    this.computeIndicators();
    this.notify(newPrice);
  }

  rebuildCandlesFromHistory() {
    this.initMarket(this.currentAsset);
  }

  computeIndicators() {
    const closes = this.candles.map(c => c.close);
    const n = closes.length;

    // SMA 7
    this.indicators.sma7 = closes.map((_, i) => {
      if (i < 6) return null;
      const slice = closes.slice(i - 6, i + 1);
      return slice.reduce((a, b) => a + b, 0) / 7;
    });

    // SMA 25
    this.indicators.sma25 = closes.map((_, i) => {
      if (i < 24) return null;
      const slice = closes.slice(i - 24, i + 1);
      return slice.reduce((a, b) => a + b, 0) / 25;
    });

    // Bollinger Bands (20, 2)
    this.indicators.bollinger = {
      mid: [],
      upper: [],
      lower: []
    };
    for (let i = 0; i < n; i++) {
      if (i < 19) {
        this.indicators.bollinger.mid.push(null);
        this.indicators.bollinger.upper.push(null);
        this.indicators.bollinger.lower.push(null);
        continue;
      }
      const slice = closes.slice(i - 19, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / 20;
      const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / 20;
      const sd = Math.sqrt(variance);
      this.indicators.bollinger.mid.push(mean);
      this.indicators.bollinger.upper.push(mean + 2 * sd);
      this.indicators.bollinger.lower.push(mean - 2 * sd);
    }

    // RSI 14
    this.indicators.rsi = [];
    let gains = 0;
    let losses = 0;
    for (let i = 1; i <= 14 && i < n; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff >= 0) gains += diff;
      else losses += Math.abs(diff);
    }
    let avgGain = gains / 14;
    let avgLoss = losses / 14;

    for (let i = 0; i < n; i++) {
      if (i < 14) {
        this.indicators.rsi.push(50);
        continue;
      }
      if (i > 14) {
        const diff = closes[i] - closes[i - 1];
        const gain = diff > 0 ? diff : 0;
        const loss = diff < 0 ? Math.abs(diff) : 0;
        avgGain = (avgGain * 13 + gain) / 14;
        avgLoss = (avgLoss * 13 + loss) / 14;
      }
      if (avgLoss === 0) {
        this.indicators.rsi.push(100);
      } else {
        const rs = avgGain / avgLoss;
        const rsiVal = 100 - (100 / (1 + rs));
        this.indicators.rsi.push(rsiVal);
      }
    }

    // Sentiment
    const lastRsi = this.indicators.rsi[this.indicators.rsi.length - 1] || 50;
    const lastSMA7 = this.indicators.sma7[this.indicators.sma7.length - 1] || closes[n - 1];
    const lastSMA25 = this.indicators.sma25[this.indicators.sma25.length - 1] || closes[n - 1];
    
    let bullWeight = 50;
    if (lastSMA7 > lastSMA25) bullWeight += 14;
    else bullWeight -= 14;

    bullWeight += (lastRsi - 50) * 0.38;
    bullWeight = Math.max(16, Math.min(88, Math.round(bullWeight)));
    this.indicators.sentiment = {
      bullish: bullWeight,
      bearish: 100 - bullWeight
    };
  }

  getCurrentPrice() {
    if (this.candles.length === 0) return this.currentAsset.basePrice;
    return this.candles[this.candles.length - 1].close;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(price) {
    for (const listener of this.listeners) {
      try {
        listener({
          asset: this.currentAsset,
          price: price || this.getCurrentPrice(),
          candles: this.candles,
          stats24h: this.stats24h,
          indicators: this.indicators,
          candleRemainingSec: this.getCandleTimeRemaining()
        });
      } catch (err) {
        console.error('Market listener error:', err);
      }
    }
  }
}

export const market = new MarketEngine();

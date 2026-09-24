// Candlestick Pattern Recognition Engine

export class PatternDetector {
  static detectPatterns(candles) {
    if (!candles || candles.length < 3) return [];
    const patterns = [];
    const len = candles.length;

    // Inspect last 15 candles
    const startIdx = Math.max(2, len - 15);

    for (let i = startIdx; i < len; i++) {
      const c = candles[i];
      const prev = candles[i - 1];
      const prev2 = candles[i - 2];

      const body = Math.abs(c.close - c.open);
      const range = c.high - c.low;
      if (range === 0) continue;

      const upperWick = c.high - Math.max(c.open, c.close);
      const lowerWick = Math.min(c.open, c.close) - c.low;
      const isGreen = c.close >= c.open;

      // 1. Doji
      if (body / range < 0.12 && range > 0) {
        patterns.push({
          index: i,
          time: c.time,
          type: 'Doji',
          icon: '✨',
          bias: 'neutral',
          reliability: '72%',
          text: 'Doji Reversal'
        });
        continue;
      }

      // 2. Hammer (Bullish Reversal)
      if (lowerWick >= body * 2 && upperWick <= body * 0.4 && body > 0) {
        patterns.push({
          index: i,
          time: c.time,
          type: 'Hammer',
          icon: '🔨',
          bias: 'bullish',
          reliability: '84%',
          text: 'Bullish Hammer'
        });
        continue;
      }

      // 3. Shooting Star (Bearish Reversal)
      if (upperWick >= body * 2 && lowerWick <= body * 0.4 && body > 0) {
        patterns.push({
          index: i,
          time: c.time,
          type: 'Shooting Star',
          icon: '💫',
          bias: 'bearish',
          reliability: '82%',
          text: 'Shooting Star'
        });
        continue;
      }

      // 4. Bullish Engulfing
      if (prev && !prev.isGreen && isGreen) {
        const prevBody = Math.abs(prev.close - prev.open);
        if (c.open <= prev.close && c.close >= prev.open && body > prevBody * 1.1) {
          patterns.push({
            index: i,
            time: c.time,
            type: 'Bullish Engulfing',
            icon: '⚡',
            bias: 'bullish',
            reliability: '88%',
            text: 'Bullish Engulfing'
          });
          continue;
        }
      }

      // 5. Bearish Engulfing
      if (prev && prev.close >= prev.open && !isGreen) {
        const prevBody = Math.abs(prev.close - prev.open);
        if (c.open >= prev.close && c.close <= prev.open && body > prevBody * 1.1) {
          patterns.push({
            index: i,
            time: c.time,
            type: 'Bearish Engulfing',
            icon: '💥',
            bias: 'bearish',
            reliability: '86%',
            text: 'Bearish Engulfing'
          });
          continue;
        }
      }

      // 6. Morning Star (3-candle bullish reversal)
      if (prev2 && prev) {
        const p2Bearish = prev2.close < prev2.open;
        const p1Small = Math.abs(prev.close - prev.open) < Math.abs(prev2.close - prev2.open) * 0.4;
        const currStrongBull = isGreen && c.close > (prev2.open + prev2.close) / 2;
        if (p2Bearish && p1Small && currStrongBull) {
          patterns.push({
            index: i,
            time: c.time,
            type: 'Morning Star',
            icon: '⭐',
            bias: 'bullish',
            reliability: '91%',
            text: 'Morning Star 91%'
          });
        }
      }
    }

    return patterns;
  }
}

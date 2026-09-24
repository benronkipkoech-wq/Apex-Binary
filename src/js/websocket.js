// Real-World WebSocket Market Feed (Binance Public WebSockets)

class WebSocketFeed {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.listeners = new Set();
    this.subscribedSymbols = ['btcusdt', 'ethusdt'];
    this.reconnectTimer = null;
    this.enabled = true;
  }

  connect() {
    if (!this.enabled || typeof WebSocket === 'undefined') return;

    try {
      // Connect to Binance multi-stream ticker
      const streams = this.subscribedSymbols.map(s => `${s}@ticker`).join('/');
      this.ws = new WebSocket(`wss://stream.binance.com:9443/ws/${streams}`);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.notify('status', { connected: true });
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.s && data.c) {
            const symbol = data.s.toUpperCase(); // e.g. BTCUSDT
            const price = parseFloat(data.c);
            const high24 = parseFloat(data.h);
            const low24 = parseFloat(data.l);
            const changePct = parseFloat(data.P);

            this.notify('tick', {
              symbol,
              price,
              high24,
              low24,
              changePct,
              time: Math.floor(data.E / 1000)
            });
          }
        } catch (e) {
          // ignore parse errors
        }
      };

      this.ws.onerror = () => {
        this.isConnected = false;
        this.notify('status', { connected: false });
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.notify('status', { connected: false });
        if (this.enabled) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = setTimeout(() => this.connect(), 5000);
        }
      };
    } catch (err) {
      console.warn('WebSocket connection error:', err);
      this.isConnected = false;
      this.notify('status', { connected: false });
    }
  }

  disconnect() {
    this.enabled = false;
    clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.notify('status', { connected: false });
  }

  toggle() {
    if (this.enabled) {
      this.disconnect();
    } else {
      this.enabled = true;
      this.connect();
    }
    return this.enabled;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, data) {
    for (const listener of this.listeners) {
      try {
        listener(event, data);
      } catch (e) {
        console.error(e);
      }
    }
  }
}

export const wsFeed = new WebSocketFeed();

// Ultra-High-Performance Canvas Chart Engine for Apex Binary (Masterclass Edition with Drawing Tools)
import { PatternDetector } from './patterns.js';

export class ChartEngine {
  constructor(canvasId, rsiCanvasId, marketInstance) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.rsiCanvas = document.getElementById(rsiCanvasId);
    this.rsiCtx = this.rsiCanvas ? this.rsiCanvas.getContext('2d') : null;
    this.market = marketInstance;

    this.chartType = 'candles'; // 'candles' | 'area'
    this.showSMA7 = true;
    this.showSMA25 = true;
    this.showBollinger = false;
    this.showRSI = true;
    this.showPatterns = true; // AI Pattern Recognition

    this.visibleCount = 55; // Default zoom level (X-axis)
    this.minZoom = 12;
    this.maxZoom = 180;
    this.panOffset = 0; // 0 = anchored to live latest candle

    // Flexible Y-Axis (Price Scale)
    this.priceScaleFactor = 1.0; // 1.0 = normal/auto, >1.0 = stretched/expanded, <1.0 = compressed
    this.priceOffset = 0; // Vertical price pan offset
    this.autoScaleY = true;
    this.lastPriceRange = 0.001;

    this.activeTrades = []; // Passed from trading engine
    this.mouse = { x: -1, y: -1, isHovering: false };
    this.dpr = window.devicePixelRatio || 1;

    // Interactive Drag State for Flexible Axes & Pan
    this.dragState = {
      active: false,
      mode: null, // 'scaleY' | 'scaleX' | 'pan'
      startX: 0,
      startY: 0,
      initialVisible: 55,
      initialPan: 0,
      initialScaleY: 1.0,
      initialOffsetY: 0,
      hasMoved: false
    };

    // Multi-Touch Pinch State
    this.touchState = {
      active: false,
      initialDistX: 0,
      initialDistY: 0,
      initialVisible: 55,
      initialScaleY: 1.0
    };

    // Drawing Tools
    this.activeDrawTool = 'none'; // 'none' | 'horizontal' | 'trendline' | 'fibonacci'
    this.drawings = [];
    this.tempDrawing = null; // In-progress drawing

    this.initCanvas();
    this.attachEvents();
    this.startRenderLoop();
  }

  initCanvas() {
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    if (!this.canvas) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;

    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.ctx.scale(this.dpr, this.dpr);

    if (this.rsiCanvas) {
      const rsiRect = this.rsiCanvas.parentElement.getBoundingClientRect();
      this.rsiWidth = rsiRect.width;
      this.rsiHeight = 80;
      this.rsiCanvas.width = this.rsiWidth * this.dpr;
      this.rsiCanvas.height = this.rsiHeight * this.dpr;
      if (this.rsiCtx) {
        this.rsiCtx.scale(this.dpr, this.dpr);
      }
    }
  }

  // Zoom both X (candle count) and Y (price scale) simultaneously — true 2D zoom
  zoomIn() {
    this.expandX();
    this.expandY(1.18);
  }

  zoomOut() {
    this.compressX();
    this.compressY(0.85);
  }

  expandX(amount = 8) {
    this.visibleCount = Math.max(this.minZoom, this.visibleCount - amount);
  }

  compressX(amount = 8) {
    this.visibleCount = Math.min(this.maxZoom, this.visibleCount + amount);
  }

  expandY(factor = 1.25) {
    // If currently auto-scaling, capture the current effective scale first
    if (this.autoScaleY) {
      this.priceScaleFactor = 1.0;
      this.autoScaleY = false;
    }
    this.priceScaleFactor = Math.min(8.0, this.priceScaleFactor * factor);
  }

  compressY(factor = 0.8) {
    if (this.autoScaleY) {
      this.priceScaleFactor = 1.0;
      this.autoScaleY = false;
    }
    this.priceScaleFactor = Math.max(0.18, this.priceScaleFactor * factor);
  }

  resetYScale() {
    this.priceScaleFactor = 1.0;
    this.priceOffset = 0;
    this.autoScaleY = true;
  }

  resetXScale() {
    this.visibleCount = 55;
    this.panOffset = 0;
    const btnJump = document.getElementById('btn-jump-live');
    if (btnJump) btnJump.classList.add('hidden');
  }

  resetZoom() {
    this.resetXScale();
    this.resetYScale();
  }

  jumpToLive() {
    this.panOffset = 0;
    const btnJump = document.getElementById('btn-jump-live');
    if (btnJump) btnJump.classList.add('hidden');
  }

  setChartType(type) {
    if (type === 'candles' || type === 'area') {
      this.chartType = type;
    }
  }

  setDrawTool(tool) {
    this.activeDrawTool = tool;
    this.tempDrawing = null;
    this.canvas.style.cursor = tool === 'none' ? 'crosshair' : 'cell';
  }

  clearDrawings() {
    this.drawings = [];
    this.tempDrawing = null;
  }

  setIndicators(config) {
    if (config.sma7 !== undefined) this.showSMA7 = config.sma7;
    if (config.sma25 !== undefined) this.showSMA25 = config.sma25;
    if (config.bollinger !== undefined) this.showBollinger = config.bollinger;
    if (config.rsi !== undefined) this.showRSI = config.rsi;
  }

  setShowPatterns(show) {
    this.showPatterns = show;
  }

  setActiveTrades(trades) {
    this.activeTrades = trades;
  }

  attachEvents() {
    const container = this.canvas.parentElement;

    const getCoords = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clientX = e.touches && e.touches.length > 0 ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches && e.touches.length > 0 ? e.touches[0].clientY : e.clientY;
      return {
        x: clientX - rect.left,
        y: clientY - rect.top
      };
    };

    const updateCursor = (mx, my) => {
      const chartW = this.width - 75;
      const chartH = this.height - 26;

      if (this.dragState.active) {
        if (this.dragState.mode === 'scaleY') this.canvas.style.cursor = 'ns-resize';
        else if (this.dragState.mode === 'scaleX') this.canvas.style.cursor = 'ew-resize';
        else if (this.dragState.mode === 'pan') this.canvas.style.cursor = 'grabbing';
        return;
      }

      if (this.activeDrawTool !== 'none') {
        this.canvas.style.cursor = 'cell';
        return;
      }

      if (mx >= chartW && my < chartH) {
        this.canvas.style.cursor = 'ns-resize';
      } else if (my >= chartH && mx < chartW) {
        this.canvas.style.cursor = 'ew-resize';
      } else if (mx >= chartW && my >= chartH) {
        this.canvas.style.cursor = 'pointer';
      } else {
        this.canvas.style.cursor = 'crosshair';
      }
    };

    container.addEventListener('mousemove', (e) => {
      const { x: mx, y: my } = getCoords(e);
      this.mouse.x = mx;
      this.mouse.y = my;
      this.mouse.isHovering = true;

      const chartW = this.width - 75;
      const chartH = this.height - 26;

      updateCursor(mx, my);

      // Handle active scale or pan dragging
      if (this.dragState.active) {
        if (this.dragState.mode === 'scaleY') {
          const dy = my - this.dragState.startY;
          const factor = Math.exp(-dy * 0.007);
          this.priceScaleFactor = Math.max(0.18, Math.min(8.0, this.dragState.initialScaleY * factor));
          this.autoScaleY = false;
        } else if (this.dragState.mode === 'scaleX') {
          const dx = mx - this.dragState.startX;
          const delta = dx * 0.2;
          this.visibleCount = Math.max(this.minZoom, Math.min(this.maxZoom, this.dragState.initialVisible - delta));
        } else if (this.dragState.mode === 'pan') {
          const dx = mx - this.dragState.startX;
          const dy = my - this.dragState.startY;
          if (Math.hypot(dx, dy) > 3) {
            this.dragState.hasMoved = true;
          }
          const candleSpacing = chartW / this.visibleCount;
          const candleDelta = dx / candleSpacing;
          this.panOffset = Math.max(0, this.dragState.initialPan + candleDelta);

          const adjustedRange = this.lastPriceRange || 0.1;
          const priceDelta = (dy / chartH) * adjustedRange;
          this.priceOffset = this.dragState.initialOffsetY + priceDelta;
          this.autoScaleY = false;
        }
        return;
      }

      // Handle drawing in progress
      if (this.tempDrawing && (this.activeDrawTool === 'trendline' || this.activeDrawTool === 'fibonacci')) {
        this.tempDrawing.p2 = { x: mx, y: my };
      }
    });

    container.addEventListener('mousedown', (e) => {
      const { x: mx, y: my } = getCoords(e);
      const chartW = this.width - 75;
      const chartH = this.height - 26;

      // Check AUTO scale button click in bottom-right corner
      const btnW = 66;
      const btnH = 20;
      const btnX = chartW + 4;
      const btnY = chartH + 3;
      if (mx >= btnX && mx <= btnX + btnW && my >= btnY && my <= btnY + btnH) {
        this.resetYScale();
        return;
      }

      if (this.activeDrawTool !== 'none') {
        return;
      }

      if (mx >= chartW && my < chartH) {
        // Start Y scale drag
        this.dragState = {
          active: true,
          mode: 'scaleY',
          startX: mx,
          startY: my,
          initialScaleY: this.priceScaleFactor,
          initialOffsetY: this.priceOffset,
          initialVisible: this.visibleCount,
          initialPan: this.panOffset,
          hasMoved: false
        };
        this.canvas.style.cursor = 'ns-resize';
        e.preventDefault();
      } else if (my >= chartH && mx < chartW) {
        // Start X scale drag
        this.dragState = {
          active: true,
          mode: 'scaleX',
          startX: mx,
          startY: my,
          initialScaleY: this.priceScaleFactor,
          initialOffsetY: this.priceOffset,
          initialVisible: this.visibleCount,
          initialPan: this.panOffset,
          hasMoved: false
        };
        this.canvas.style.cursor = 'ew-resize';
        e.preventDefault();
      } else if (mx < chartW && my < chartH) {
        // Start pan drag inside chart
        this.dragState = {
          active: true,
          mode: 'pan',
          startX: mx,
          startY: my,
          initialScaleY: this.priceScaleFactor,
          initialOffsetY: this.priceOffset,
          initialVisible: this.visibleCount,
          initialPan: this.panOffset,
          hasMoved: false
        };
        this.canvas.style.cursor = 'grabbing';
      }
    });

    window.addEventListener('mouseup', () => {
      if (this.dragState.active) {
        this.dragState.active = false;
        updateCursor(this.mouse.x, this.mouse.y);
      }
    });

    container.addEventListener('mouseleave', () => {
      if (!this.dragState.active) {
        this.mouse.isHovering = false;
        const hud = document.getElementById('crosshair-hud');
        if (hud) hud.classList.add('hidden');
      }
    });

    // Double click to reset axes
    container.addEventListener('dblclick', (e) => {
      const { x: mx, y: my } = getCoords(e);
      const chartW = this.width - 75;
      const chartH = this.height - 26;

      if (mx >= chartW) {
        this.resetYScale();
      } else if (my >= chartH) {
        this.resetXScale();
      } else {
        this.resetZoom();
      }
    });

    // Mouse Wheel Zooming
    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const { x: mx, y: my } = getCoords(e);
      const chartW = this.width - 75;
      const chartH = this.height - 26;

      if (mx >= chartW) {
        // Wheel on right price scale → Y-axis only
        if (e.deltaY < 0) this.expandY(1.12);
        else this.compressY(0.89);
      } else if (my >= chartH) {
        // Wheel on bottom time scale → X-axis only
        if (e.deltaY < 0) this.expandX(6);
        else this.compressX(6);
      } else {
        // Wheel inside main chart area → TRUE ZOOM: both X and Y together
        if (e.shiftKey) {
          // Shift+scroll = Y-axis only (advanced)
          if (e.deltaY < 0) this.expandY(1.12);
          else this.compressY(0.89);
        } else {
          // Normal scroll = zoom in/out both axes simultaneously
          if (e.deltaY < 0) {
            this.expandX(5);
            this.expandY(1.1);
          } else {
            this.compressX(5);
            this.compressY(0.91);
          }
        }
      }
    }, { passive: false });

    // Touch Support: Drag & Pinch to Zoom X and Y
    let touchStartDistX = 0;
    let touchStartDistY = 0;

    container.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        const { x: mx, y: my } = getCoords(e);
        const chartW = this.width - 75;
        const chartH = this.height - 26;

        if (mx >= chartW && my < chartH) {
          this.dragState = {
            active: true,
            mode: 'scaleY',
            startX: mx,
            startY: my,
            initialScaleY: this.priceScaleFactor,
            initialOffsetY: this.priceOffset,
            initialVisible: this.visibleCount,
            initialPan: this.panOffset,
            hasMoved: false
          };
        } else if (my >= chartH && mx < chartW) {
          this.dragState = {
            active: true,
            mode: 'scaleX',
            startX: mx,
            startY: my,
            initialScaleY: this.priceScaleFactor,
            initialOffsetY: this.priceOffset,
            initialVisible: this.visibleCount,
            initialPan: this.panOffset,
            hasMoved: false
          };
        } else if (this.activeDrawTool === 'none') {
          this.dragState = {
            active: true,
            mode: 'pan',
            startX: mx,
            startY: my,
            initialScaleY: this.priceScaleFactor,
            initialOffsetY: this.priceOffset,
            initialVisible: this.visibleCount,
            initialPan: this.panOffset,
            hasMoved: false
          };
        }
      } else if (e.touches.length === 2) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        touchStartDistX = Math.abs(t1.clientX - t2.clientX);
        touchStartDistY = Math.abs(t1.clientY - t2.clientY);
        this.touchState = {
          active: true,
          initialVisible: this.visibleCount,
          initialScaleY: this.priceScaleFactor
        };
      }
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1 && this.dragState.active) {
        const { x: mx, y: my } = getCoords(e);
        const chartW = this.width - 75;
        const chartH = this.height - 26;

        if (this.dragState.mode === 'scaleY') {
          const dy = my - this.dragState.startY;
          const factor = Math.exp(-dy * 0.007);
          this.priceScaleFactor = Math.max(0.18, Math.min(8.0, this.dragState.initialScaleY * factor));
          this.autoScaleY = false;
        } else if (this.dragState.mode === 'scaleX') {
          const dx = mx - this.dragState.startX;
          const delta = dx * 0.2;
          this.visibleCount = Math.max(this.minZoom, Math.min(this.maxZoom, this.dragState.initialVisible - delta));
        } else if (this.dragState.mode === 'pan') {
          const dx = mx - this.dragState.startX;
          const dy = my - this.dragState.startY;
          const candleSpacing = chartW / this.visibleCount;
          this.panOffset = Math.max(0, this.dragState.initialPan + dx / candleSpacing);
          const adjustedRange = this.lastPriceRange || 0.1;
          this.priceOffset = this.dragState.initialOffsetY + (dy / chartH) * adjustedRange;
          this.autoScaleY = false;
        }
      } else if (e.touches.length === 2 && this.touchState.active) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const currentDistX = Math.abs(t1.clientX - t2.clientX);
        const currentDistY = Math.abs(t1.clientY - t2.clientY);

        if (touchStartDistX > 20) {
          const ratioX = currentDistX / touchStartDistX;
          this.visibleCount = Math.max(this.minZoom, Math.min(this.maxZoom, this.touchState.initialVisible / ratioX));
        }
        if (touchStartDistY > 20) {
          const ratioY = currentDistY / touchStartDistY;
          this.priceScaleFactor = Math.max(0.18, Math.min(8.0, this.touchState.initialScaleY * ratioY));
          this.autoScaleY = false;
        }
      }
    }, { passive: true });

    container.addEventListener('touchend', () => {
      this.dragState.active = false;
      this.touchState.active = false;
    });

    // Canvas click for drawing tools
    this.canvas.addEventListener('click', () => {
      if (this.dragState.hasMoved) {
        this.dragState.hasMoved = false;
        return;
      }
      if (this.activeDrawTool === 'none') return;

      const mx = this.mouse.x;
      const my = this.mouse.y;

      if (this.activeDrawTool === 'horizontal') {
        this.drawings.push({
          type: 'horizontal',
          y: my,
          color: '#ffb800',
          label: 'SUPPORT / RESISTANCE'
        });
      } else if (this.activeDrawTool === 'trendline') {
        if (!this.tempDrawing) {
          this.tempDrawing = {
            type: 'trendline',
            p1: { x: mx, y: my },
            p2: { x: mx, y: my },
            color: '#00d2ff'
          };
        } else {
          this.drawings.push({
            type: 'trendline',
            p1: { ...this.tempDrawing.p1 },
            p2: { x: mx, y: my },
            color: '#00d2ff'
          });
          this.tempDrawing = null;
        }
      } else if (this.activeDrawTool === 'fibonacci') {
        if (!this.tempDrawing) {
          this.tempDrawing = {
            type: 'fibonacci',
            p1: { x: mx, y: my },
            p2: { x: mx, y: my }
          };
        } else {
          this.drawings.push({
            type: 'fibonacci',
            p1: { ...this.tempDrawing.p1 },
            p2: { x: mx, y: my }
          });
          this.tempDrawing = null;
        }
      }
    });
  }

  startRenderLoop() {
    const loop = () => {
      this.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  render() {
    if (!this.ctx || !this.width || !this.height) return;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const paddingRight = 75; // Price scale
    const paddingBottom = 26; // Time scale
    const chartW = w - paddingRight;
    const chartH = h - paddingBottom;

    ctx.clearRect(0, 0, w, h);

    const candles = this.market.candles;
    if (!candles || candles.length === 0) return;

    // Viewport candles based on zoom level (X-axis) and pan offset
    const totalCandles = candles.length;
    const count = Math.min(totalCandles, Math.round(this.visibleCount));

    const maxPan = Math.max(0, totalCandles - count);
    this.panOffset = Math.max(0, Math.min(maxPan, this.panOffset));

    // Update Jump to Live button visibility
    const btnJump = document.getElementById('btn-jump-live');
    if (btnJump) {
      if (this.panOffset > 1) {
        btnJump.classList.remove('hidden');
      } else {
        btnJump.classList.add('hidden');
      }
    }

    const endIndex = totalCandles - Math.round(this.panOffset);
    const startIndex = Math.max(0, endIndex - count);
    const visibleCandles = candles.slice(startIndex, endIndex);
    const visibleCount = visibleCandles.length;

    // 1. Calculate base min/max price for the visible window
    let baseMinPrice = Infinity;
    let baseMaxPrice = -Infinity;

    visibleCandles.forEach(c => {
      if (c.low < baseMinPrice) baseMinPrice = c.low;
      if (c.high > baseMaxPrice) baseMaxPrice = c.high;
    });

    // Factor in trade strike prices
    this.activeTrades.forEach(t => {
      if (t.strikePrice < baseMinPrice) baseMinPrice = t.strikePrice;
      if (t.strikePrice > baseMaxPrice) baseMaxPrice = t.strikePrice;
    });

    if (!isFinite(baseMinPrice) || !isFinite(baseMaxPrice) || baseMaxPrice <= baseMinPrice) {
      baseMinPrice = this.market.currentAsset ? this.market.currentAsset.basePrice * 0.995 : 100;
      baseMaxPrice = this.market.currentAsset ? this.market.currentAsset.basePrice * 1.005 : 101;
    }

    const baseRange = baseMaxPrice - baseMinPrice || 0.001;
    const basePadding = baseRange * 0.09;
    const centerPrice = (baseMaxPrice + baseMinPrice) / 2 + (this.autoScaleY ? 0 : this.priceOffset);

    // Expandible / Flexible Y Scale calculation:
    // Scale factor stretches or compresses around centerPrice
    const effectiveScale = this.autoScaleY ? 1.0 : this.priceScaleFactor;
    const halfSpan = ((baseRange / 2) + basePadding) / effectiveScale;

    const minPrice = centerPrice - halfSpan;
    const maxPrice = centerPrice + halfSpan;
    const adjustedRange = maxPrice - minPrice || 0.001;
    this.lastPriceRange = adjustedRange;

    const priceToY = (p) => chartH - ((p - minPrice) / adjustedRange) * chartH;
    const yToPrice = (y) => maxPrice - (y / chartH) * adjustedRange;
    const candleSpacing = chartW / visibleCount;
    const candleWidth = Math.max(2.5, candleSpacing * 0.72);

    // 1. Background Grid & Watermark & Interactive Scales
    this.drawGrid(ctx, chartW, chartH, minPrice, maxPrice, priceToY, visibleCandles, candleSpacing);

    // 2. Bollinger Bands
    if (this.showBollinger && this.market.indicators.bollinger) {
      this.drawBollinger(ctx, visibleCount, candleSpacing, priceToY);
    }

    // 3. User Chart Drawings (Support/Resistance, Trendlines, Fibonacci)
    this.drawUserDrawings(ctx, chartW, chartH, yToPrice);

    // 4. Trade Area Infill
    this.drawTradeZoneFills(ctx, chartW, chartH, priceToY);

    // 5. Main Chart (Candles or Curved Area)
    if (this.chartType === 'area') {
      this.drawCurvedAreaChart(ctx, visibleCandles, candleSpacing, priceToY, chartH);
    } else {
      this.drawCandles(ctx, visibleCandles, candleSpacing, candleWidth, priceToY);
    }

    // 5b. Candlestick Pattern AI Recognition Overlay
    if (this.showPatterns && this.chartType === 'candles') {
      this.drawPatternBadges(ctx, visibleCandles, candleSpacing, priceToY);
    }

    // 6. Moving Averages
    if (this.showSMA7 && this.market.indicators.sma7) {
      this.drawLineIndicator(ctx, this.market.indicators.sma7, visibleCount, candleSpacing, priceToY, '#ffd700', 1.8);
    }
    if (this.showSMA25 && this.market.indicators.sma25) {
      this.drawLineIndicator(ctx, this.market.indicators.sma25, visibleCount, candleSpacing, priceToY, '#00d2ff', 1.8);
    }

    // 7. Active Trade Markers & Countdown
    this.drawActiveTrades(ctx, chartW, chartH, priceToY);

    // 8. Live Pulsing Price Line & Sonar Rings
    this.drawLivePricePulse(ctx, chartW, chartH, priceToY, paddingRight);

    // 9. Interactive Crosshair
    this.drawCrosshair(ctx, chartW, chartH, priceToY, yToPrice, visibleCandles, candleSpacing);

    // 10. RSI Sub-chart
    if (this.showRSI && this.rsiCtx) {
      this.drawRSI(visibleCount);
    }
  }

  drawUserDrawings(ctx, chartW, chartH, yToPrice) {
    const allDrawings = [...this.drawings];
    if (this.tempDrawing) allDrawings.push(this.tempDrawing);

    allDrawings.forEach(d => {
      if (d.type === 'horizontal') {
        ctx.save();
        ctx.strokeStyle = d.color || '#ffb800';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        ctx.moveTo(0, d.y);
        ctx.lineTo(chartW, d.y);
        ctx.stroke();

        // Label pill
        const price = yToPrice(d.y);
        ctx.fillStyle = d.color || '#ffb800';
        ctx.beginPath();
        ctx.roundRect(10, d.y - 16, 120, 16, 3);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.font = 'bold 9px JetBrains Mono, sans-serif';
        ctx.fillText(`S/R: ${price.toFixed(this.market.currentAsset.decimals)}`, 16, d.y - 4);
        ctx.restore();
      } else if (d.type === 'trendline' && d.p1 && d.p2) {
        ctx.save();
        ctx.strokeStyle = d.color || '#00d2ff';
        ctx.lineWidth = 2;
        ctx.shadowColor = 'rgba(0, 210, 255, 0.5)';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(d.p1.x, d.p1.y);
        ctx.lineTo(d.p2.x, d.p2.y);
        ctx.stroke();

        // End points
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(d.p1.x, d.p1.y, 3.5, 0, Math.PI * 2);
        ctx.arc(d.p2.x, d.p2.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (d.type === 'fibonacci' && d.p1 && d.p2) {
        ctx.save();
        const topY = Math.min(d.p1.y, d.p2.y);
        const botY = Math.max(d.p1.y, d.p2.y);
        const span = botY - topY;

        const levels = [
          { pct: 0, label: '0.0%', color: '#ff3366' },
          { pct: 0.236, label: '23.6%', color: '#ffb800' },
          { pct: 0.382, label: '38.2%', color: '#00d2ff' },
          { pct: 0.5, label: '50.0%', color: '#b388ff' },
          { pct: 0.618, label: '61.8% (Golden)', color: '#00f59b' },
          { pct: 1.0, label: '100.0%', color: '#ff3366' }
        ];

        levels.forEach(lvl => {
          const y = topY + span * lvl.pct;
          ctx.strokeStyle = lvl.color;
          ctx.lineWidth = lvl.pct === 0.618 ? 1.8 : 1;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(chartW, y);
          ctx.stroke();

          ctx.fillStyle = lvl.color;
          ctx.font = 'bold 9px JetBrains Mono, sans-serif';
          ctx.fillText(`FIB ${lvl.label}`, 8, y - 3);
        });
        ctx.restore();
      }
    });
  }

  drawGrid(ctx, chartW, chartH, minPrice, maxPrice, priceToY, visibleCandles, candleSpacing) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#64748b';
    ctx.font = '10px JetBrains Mono, monospace';

    // Interactive scale highlight regions
    const isHoverY = this.mouse.x >= chartW && this.mouse.y < chartH;
    const isHoverX = this.mouse.y >= chartH && this.mouse.x < chartW;
    const isDraggingY = this.dragState.active && this.dragState.mode === 'scaleY';
    const isDraggingX = this.dragState.active && this.dragState.mode === 'scaleX';

    // Highlight right price scale
    if (isHoverY || isDraggingY) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.fillRect(chartW, 0, 75, chartH);
      ctx.strokeStyle = 'rgba(0, 245, 155, 0.25)';
      ctx.beginPath();
      ctx.moveTo(chartW, 0);
      ctx.lineTo(chartW, chartH);
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.beginPath();
      ctx.moveTo(chartW, 0);
      ctx.lineTo(chartW, chartH);
      ctx.stroke();
    }

    // Highlight bottom time scale
    if (isHoverX || isDraggingX) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.fillRect(0, chartH, chartW, 26);
      ctx.strokeStyle = 'rgba(0, 210, 255, 0.25)';
      ctx.beginPath();
      ctx.moveTo(0, chartH);
      ctx.lineTo(chartW, chartH);
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.beginPath();
      ctx.moveTo(0, chartH);
      ctx.lineTo(chartW, chartH);
      ctx.stroke();
    }

    // Horizontal Price Lines
    const steps = 6;
    const stepVal = (maxPrice - minPrice) / steps;
    ctx.fillStyle = (isHoverY || isDraggingY) ? '#94a3b8' : '#64748b';
    for (let i = 0; i <= steps; i++) {
      const price = minPrice + i * stepVal;
      const y = priceToY(price);

      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartW, y);
      ctx.stroke();

      const formattedPrice = price.toFixed(this.market.currentAsset.decimals);
      ctx.fillText(formattedPrice, chartW + 8, y + 3.5);
    }

    // Vertical Time Lines
    const timeStep = Math.max(1, Math.floor(visibleCandles.length / 6));
    ctx.fillStyle = (isHoverX || isDraggingX) ? '#94a3b8' : '#64748b';
    for (let i = 0; i < visibleCandles.length; i += timeStep) {
      const x = i * candleSpacing + candleSpacing / 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, chartH);
      ctx.stroke();

      const candle = visibleCandles[i];
      if (candle) {
        const d = new Date(candle.time * 1000);
        const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        ctx.fillText(timeStr, x - 22, chartH + 18);
      }
    }

    // Floating watermark of asset symbol
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.018)';
    ctx.font = '800 64px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.market.currentAsset.symbol, chartW / 2, chartH / 2 + 20);
    ctx.restore();

    // AUTO / RESET Y-Scale Button in bottom-right corner
    ctx.save();
    const btnW = 66;
    const btnH = 20;
    const btnX = chartW + 4;
    const btnY = chartH + 3;
    const isAutoHover = this.mouse.x >= btnX && this.mouse.x <= btnX + btnW && this.mouse.y >= btnY && this.mouse.y <= btnY + btnH;

    if (this.autoScaleY) {
      ctx.fillStyle = isAutoHover ? 'rgba(0, 245, 155, 0.25)' : 'rgba(0, 245, 155, 0.12)';
      ctx.beginPath();
      ctx.roundRect(btnX, btnY, btnW, btnH, 3);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 245, 155, 0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#00f59b';
      ctx.font = 'bold 9px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('AUTO ✓', btnX + btnW / 2, btnY + btnH / 2);
    } else {
      ctx.fillStyle = isAutoHover ? 'rgba(255, 184, 0, 0.35)' : 'rgba(255, 184, 0, 0.2)';
      ctx.beginPath();
      ctx.roundRect(btnX, btnY, btnW, btnH, 3);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 184, 0, 0.6)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#ffb800';
      ctx.font = 'bold 9px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('AUTO ↺', btnX + btnW / 2, btnY + btnH / 2);
    }
    ctx.restore();

    // Drag scale HUD badges
    if (isDraggingY) {
      ctx.save();
      const pct = Math.round(this.priceScaleFactor * 100);
      const hudText = `↕ Price: ${pct}%`;
      ctx.font = 'bold 10px JetBrains Mono, monospace';
      const tw = ctx.measureText(hudText).width + 14;
      ctx.fillStyle = 'rgba(15, 20, 32, 0.92)';
      ctx.strokeStyle = '#00f59b';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(chartW - tw - 10, this.mouse.y - 12, tw, 22, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#00f59b';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(hudText, chartW - 10 - tw / 2, this.mouse.y - 1);
      ctx.restore();
    } else if (isDraggingX) {
      ctx.save();
      const hudText = `↔ Time: ${Math.round(this.visibleCount)} candles`;
      ctx.font = 'bold 10px JetBrains Mono, monospace';
      const tw = ctx.measureText(hudText).width + 14;
      ctx.fillStyle = 'rgba(15, 20, 32, 0.92)';
      ctx.strokeStyle = '#00d2ff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(this.mouse.x - tw / 2, chartH - 30, tw, 22, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#00d2ff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(hudText, this.mouse.x, chartH - 19);
      ctx.restore();
    }
  }

  drawTradeZoneFills(ctx, chartW, chartH, priceToY) {
    if (!this.activeTrades || this.activeTrades.length === 0) return;
    const currentPrice = this.market.getCurrentPrice();
    const currentY = priceToY(currentPrice);

    this.activeTrades.forEach(trade => {
      const strikeY = priceToY(trade.strikePrice);
      const isCall = trade.direction === 'higher';
      const inTheMoney = isCall ? (currentPrice > trade.strikePrice) : (currentPrice < trade.strikePrice);

      ctx.fillStyle = inTheMoney ? 'rgba(0, 245, 155, 0.08)' : 'rgba(255, 51, 102, 0.08)';
      ctx.fillRect(0, Math.min(strikeY, currentY), chartW, Math.abs(currentY - strikeY));
    });
  }

  drawCandles(ctx, visibleCandles, candleSpacing, candleWidth, priceToY) {
    const len = visibleCandles.length;
    for (let i = 0; i < len; i++) {
      const c = visibleCandles[i];
      const x = i * candleSpacing + candleSpacing / 2;
      const isUp = c.close >= c.open;
      const isCurrent = i === len - 1;

      const openY = priceToY(c.open);
      const closeY = priceToY(c.close);
      const highY = priceToY(c.high);
      const lowY = priceToY(c.low);

      const color = isUp ? '#00f59b' : '#ff3366';
      const shadowColor = isUp ? 'rgba(0, 245, 155, 0.45)' : 'rgba(255, 51, 102, 0.45)';

      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();

      // Body
      const topY = Math.min(openY, closeY);
      const bodyH = Math.max(2.5, Math.abs(closeY - openY));

      ctx.fillStyle = color;
      if (isCurrent) {
        ctx.shadowColor = shadowColor;
        ctx.shadowBlur = 10;
      }

      ctx.beginPath();
      ctx.roundRect(x - candleWidth / 2, topY, candleWidth, bodyH, 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  drawPatternBadges(ctx, visibleCandles, candleSpacing, priceToY) {
    if (!this.market || !this.market.candles) return;
    const patterns = PatternDetector.detectPatterns(this.market.candles);
    if (!patterns || patterns.length === 0) return;

    patterns.forEach(pat => {
      const idx = visibleCandles.findIndex(c => c.time === pat.time);
      if (idx === -1) return;

      const c = visibleCandles[idx];
      const x = idx * candleSpacing + candleSpacing / 2;
      const isBull = pat.bias === 'bullish';
      const isBear = pat.bias === 'bearish';

      const y = isBull 
        ? Math.min(this.height - 45, priceToY(c.low) + 24)
        : Math.max(25, priceToY(c.high) - 24);

      ctx.save();
      const badgeText = `${pat.icon} ${pat.type} ${pat.reliability}`;
      ctx.font = 'bold 9px "Outfit", sans-serif';
      const textWidth = ctx.measureText(badgeText).width;
      const badgeW = textWidth + 12;
      const badgeH = 16;
      const badgeX = x - badgeW / 2;
      const badgeY = y - badgeH / 2;

      // Glow & background
      ctx.fillStyle = isBull ? 'rgba(0, 245, 155, 0.25)' : isBear ? 'rgba(255, 51, 102, 0.25)' : 'rgba(255, 184, 0, 0.25)';
      ctx.strokeStyle = isBull ? '#00f59b' : isBear ? '#ff3366' : '#ffb800';
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
      ctx.fill();
      ctx.stroke();

      // Connector dot
      ctx.beginPath();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.arc(x, isBull ? priceToY(c.low) + 4 : priceToY(c.high) - 4, 2, 0, Math.PI * 2);
      ctx.fill();

      // Text
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, x, y);
      ctx.restore();
    });
  }

  drawCurvedAreaChart(ctx, visibleCandles, candleSpacing, priceToY, chartH) {
    if (visibleCandles.length < 2) return;

    const points = visibleCandles.map((c, i) => ({
      x: i * candleSpacing + candleSpacing / 2,
      y: priceToY(c.close)
    }));

    // Draw Smooth Spline Path
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i === 0 ? 0 : i - 1];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }

    // Neon Stroke
    ctx.strokeStyle = '#00f59b';
    ctx.lineWidth = 2.6;
    ctx.shadowColor = 'rgba(0, 245, 155, 0.7)';
    ctx.shadowBlur = 14;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Gradient Fill
    const firstX = points[0].x;
    const lastX = points[points.length - 1].x;
    ctx.lineTo(lastX, chartH);
    ctx.lineTo(firstX, chartH);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, 0, 0, chartH);
    grad.addColorStop(0, 'rgba(0, 245, 155, 0.28)');
    grad.addColorStop(0.4, 'rgba(0, 245, 155, 0.08)');
    grad.addColorStop(1, 'rgba(0, 245, 155, 0.0)');
    ctx.fillStyle = grad;
    ctx.fill();
  }

  drawLineIndicator(ctx, indicatorData, visibleCount, candleSpacing, priceToY, color, width) {
    const total = indicatorData.length;
    const startIdx = Math.max(0, total - visibleCount);
    const visibleData = indicatorData.slice(startIdx);

    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();

    let started = false;
    for (let i = 0; i < visibleData.length; i++) {
      const val = visibleData[i];
      if (val === null || isNaN(val)) continue;
      const x = i * candleSpacing + candleSpacing / 2;
      const y = priceToY(val);

      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }

  drawBollinger(ctx, visibleCount, candleSpacing, priceToY) {
    const b = this.market.indicators.bollinger;
    if (!b || !b.upper || b.upper.length === 0) return;

    const total = b.upper.length;
    const startIdx = Math.max(0, total - visibleCount);
    const upper = b.upper.slice(startIdx);
    const lower = b.lower.slice(startIdx);
    const mid = b.mid.slice(startIdx);

    this.drawLineIndicator(ctx, b.mid, visibleCount, candleSpacing, priceToY, 'rgba(179, 136, 255, 0.7)', 1.2);

    ctx.beginPath();
    let started = false;
    for (let i = 0; i < upper.length; i++) {
      if (upper[i] === null) continue;
      const x = i * candleSpacing + candleSpacing / 2;
      const y = priceToY(upper[i]);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    for (let i = lower.length - 1; i >= 0; i--) {
      if (lower[i] === null) continue;
      const x = i * candleSpacing + candleSpacing / 2;
      const y = priceToY(lower[i]);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(179, 136, 255, 0.07)';
    ctx.fill();
  }

  drawLivePricePulse(ctx, chartW, chartH, priceToY, paddingRight) {
    const currentPrice = this.market.getCurrentPrice();
    const y = priceToY(currentPrice);

    // Live horizontal dashed line
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = '#00f59b';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(chartW, y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Animated Sonar Rings radiating from cursor
    const t = (Date.now() % 1600) / 1600;
    const ringRadius = 4 + t * 14;
    const ringAlpha = (1 - t) * 0.7;
    ctx.beginPath();
    ctx.arc(chartW - 4, y, ringRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(0, 245, 155, ${ringAlpha})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Solid core dot
    ctx.beginPath();
    ctx.arc(chartW - 4, y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#00f59b';
    ctx.shadowColor = 'rgba(0, 245, 155, 0.9)';
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Price tag banner on the price scale
    const tagW = paddingRight - 8;
    const tagH = 22;
    ctx.fillStyle = '#00f59b';
    ctx.beginPath();
    ctx.roundRect(chartW + 2, y - tagH / 2, tagW, tagH, 4);
    ctx.fill();

    ctx.fillStyle = '#000';
    ctx.font = 'bold 11px JetBrains Mono, monospace';
    const text = currentPrice.toFixed(this.market.currentAsset.decimals);
    ctx.fillText(text, chartW + 7, y + 4);
  }

  drawActiveTrades(ctx, chartW, chartH, priceToY) {
    if (!this.activeTrades || this.activeTrades.length === 0) return;

    const currentPrice = this.market.getCurrentPrice();
    const now = Date.now();

    this.activeTrades.forEach((trade) => {
      const strikeY = priceToY(trade.strikePrice);
      const isCall = trade.direction === 'higher';
      const inTheMoney = isCall ? (currentPrice > trade.strikePrice) : (currentPrice < trade.strikePrice);
      const strokeColor = inTheMoney ? '#00f59b' : '#ff3366';

      // 1. Strike line
      ctx.save();
      ctx.setLineDash([6, 3]);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, strikeY);
      ctx.lineTo(chartW, strikeY);
      ctx.stroke();
      ctx.restore();

      // 2. Dynamic P&L pill
      const profitVal = inTheMoney 
        ? `+KSh ${(trade.amount * (trade.payoutRate / 100)).toLocaleString()}`
        : `-KSh ${trade.amount.toLocaleString()}`;

      const tagText = `${isCall ? '▲ CALL' : '▼ PUT'} ${profitVal}`;
      ctx.font = 'bold 11px JetBrains Mono, sans-serif';
      const textWidth = ctx.measureText(tagText).width;
      
      const badgeX = 24;
      const badgeY = strikeY - 20;

      ctx.fillStyle = inTheMoney ? 'rgba(0, 245, 155, 0.95)' : 'rgba(255, 51, 102, 0.95)';
      ctx.shadowColor = inTheMoney ? 'rgba(0, 245, 155, 0.5)' : 'rgba(255, 51, 102, 0.5)';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, textWidth + 16, 20, 4);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = inTheMoney ? '#000' : '#fff';
      ctx.fillText(tagText, badgeX + 8, badgeY + 14);

      // 3. Expiry finish target line
      const remainingSec = Math.max(0, Math.ceil((trade.expiryTimestamp - now) / 1000));
      const expiryX = chartW - 24;

      ctx.save();
      ctx.strokeStyle = '#ffb800';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(expiryX, 0);
      ctx.lineTo(expiryX, chartH);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = '#ffb800';
      ctx.beginPath();
      ctx.roundRect(expiryX - 26, 12, 52, 20, 4);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.font = 'bold 11px JetBrains Mono, monospace';
      ctx.fillText(`🏁 ${remainingSec}s`, expiryX - 20, 26);
    });
  }

  drawCrosshair(ctx, chartW, chartH, priceToY, yToPrice, visibleCandles, candleSpacing) {
    if (!this.mouse.isHovering || this.mouse.x > chartW || this.mouse.y > chartH) return;

    const mx = this.mouse.x;
    const my = this.mouse.y;

    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(0, my);
    ctx.lineTo(chartW, my);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(mx, 0);
    ctx.lineTo(mx, chartH);
    ctx.stroke();
    ctx.restore();

    const hoveredPrice = yToPrice(my);
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.roundRect(chartW + 2, my - 10, 70, 20, 3);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.fillText(hoveredPrice.toFixed(this.market.currentAsset.decimals), chartW + 6, my + 4);

    const candleIdx = Math.floor(mx / candleSpacing);
    if (candleIdx >= 0 && candleIdx < visibleCandles.length) {
      const c = visibleCandles[candleIdx];
      const hud = document.getElementById('crosshair-hud');
      if (hud) {
        hud.classList.remove('hidden');
        document.getElementById('hud-o').textContent = c.open.toFixed(this.market.currentAsset.decimals);
        document.getElementById('hud-h').textContent = c.high.toFixed(this.market.currentAsset.decimals);
        document.getElementById('hud-l').textContent = c.low.toFixed(this.market.currentAsset.decimals);
        document.getElementById('hud-c').textContent = c.close.toFixed(this.market.currentAsset.decimals);
        const d = new Date(c.time * 1000);
        document.getElementById('hud-time').textContent = d.toLocaleTimeString();
      }
    }
  }

  drawRSI(visibleCount) {
    const ctx = this.rsiCtx;
    const w = this.rsiWidth;
    const h = this.rsiHeight;
    ctx.clearRect(0, 0, w, h);

    const rsiData = this.market.indicators.rsi;
    if (!rsiData || rsiData.length === 0) return;

    const startIdx = Math.max(0, rsiData.length - visibleCount);
    const visibleRsi = rsiData.slice(startIdx);
    const spacing = (w - 75) / visibleCount;

    const valToY = (v) => h - (v / 100) * h;

    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;

    // 70
    ctx.strokeStyle = 'rgba(255, 51, 102, 0.4)';
    ctx.beginPath();
    ctx.moveTo(0, valToY(70));
    ctx.lineTo(w - 75, valToY(70));
    ctx.stroke();

    // 30
    ctx.strokeStyle = 'rgba(0, 245, 155, 0.4)';
    ctx.beginPath();
    ctx.moveTo(0, valToY(30));
    ctx.lineTo(w - 75, valToY(30));
    ctx.stroke();

    // 50
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.moveTo(0, valToY(50));
    ctx.lineTo(w - 75, valToY(50));
    ctx.stroke();
    ctx.setLineDash([]);

    // Curve
    ctx.strokeStyle = '#ff7043';
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < visibleRsi.length; i++) {
      const v = visibleRsi[i];
      const x = i * spacing + spacing / 2;
      const y = valToY(v);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    const lastVal = visibleRsi[visibleRsi.length - 1];
    const liveEl = document.getElementById('rsi-live-value');
    if (liveEl && lastVal !== undefined) {
      liveEl.textContent = lastVal.toFixed(2);
      liveEl.style.color = lastVal >= 70 ? '#ff3366' : (lastVal <= 30 ? '#00f59b' : '#ff7043');
    }
  }
}

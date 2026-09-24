import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import { startTradingEngine } from './services/tradingEngine.js';

import authRoutes from './routes/auth.js';
import tradeRoutes from './routes/trades.js';
import walletRoutes from './routes/wallet.js';
import adminRoutes from './routes/admin.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const app = express();
const PORT = process.env.PORT || 5000;

// Security & Parsing Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check API
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    platform: 'Apex Binary API',
    version: '1.0.0',
    timestamp: new Date(),
  });
});

// Mount Core REST APIs
app.use('/api/auth', authRoutes);
app.use('/api/trades', tradeRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/admin', adminRoutes);

// Admin Dashboard static files
const adminPath = path.join(rootDir, 'public', 'admin');
app.use('/admin', express.static(adminPath));

// Production Frontend Static Assets (Vite dist)
const distPath = path.join(rootDir, 'dist');
app.use(express.static(distPath));

// SPA Catch-all Route for Trader Frontend & Admin (Express 5 compatible)
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, message: 'API route not found' });
  }
  if (req.path.startsWith('/admin')) {
    return res.sendFile(path.join(adminPath, 'index.html'));
  }
  const indexPath = path.join(distPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(200).send(`
        <html>
          <head><title>Apex Binary API</title><style>body{background:#0b0e14;color:#eee;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;}</style></head>
          <body><div style="text-align:center;"><h1>Apex Binary Server is Running</h1><p>Visit <a href="/admin" style="color:#00ff88;">/admin</a> or run Vite dev server for client.</p></div></body>
        </html>
      `);
    }
  });
});

// Initialize Database & Server
async function startServer() {
  await connectDB();
  startTradingEngine();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`===============================================`);
    console.log(`  APEX BINARY — TRADING & ADMIN ENGINE`);
    console.log(`  Server Port:      http://localhost:${PORT}`);
    console.log(`  Admin Dashboard:  http://localhost:${PORT}/admin`);
    console.log(`  Health Check:     http://localhost:${PORT}/api/health`);
    console.log(`===============================================`);
  });
}

startServer();

export default app;

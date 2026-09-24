import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    {
      name: 'security-headers',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('X-Frame-Options', 'DENY');
          res.setHeader('X-XSS-Protection', '1; mode=block');
          res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
          res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' wss://stream.binance.com wss://stream.binance.com:9443 https://fonts.googleapis.com; img-src 'self' data:;");
          next();
        });
      }
    }
  ],
  server: {
    port: 5173,
    open: false,
    host: true
  },
  preview: {
    port: process.env.PORT ? parseInt(process.env.PORT) : 4173,
    host: '0.0.0.0'
  }
});

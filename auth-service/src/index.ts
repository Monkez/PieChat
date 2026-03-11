/**
 * PieChat Auth Service — Entry Point
 * 
 * Standalone Express server handling authentication:
 * - Phone OTP flow
 * - Device trust management
 * - Login event audit trail
 * - QR Code login
 * - User registration & password management
 * - Link preview proxy
 * - Admin dashboard APIs
 * 
 * Designed to run independently from the Next.js frontend,
 * enabling static export for desktop/mobile (Tauri/Capacitor).
 * 
 * v2.0.0 — Added security hardening, rate limiting, 
 *           input validation, request tracing, and graceful shutdown.
 */

import express from 'express';
import cors from 'cors';
import authRouter from './routes/auth.js';
import { securityHeaders } from './middleware/security-headers.js';
import { requestId } from './middleware/request-id.js';
import { generalRateLimit } from './middleware/rate-limit.js';

const app = express();
const PORT = parseInt(process.env.PORT || '4000', 10);

// ─── CORS ───────────────────────────────────────────────
const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

const isDev = process.env.NODE_ENV !== 'production';

app.use(cors({
    origin: isDev ? true : corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
}));

// ─── Security ───────────────────────────────────────────
app.use(securityHeaders);
app.use(requestId);
app.use(generalRateLimit);

// ─── Body parsing ───────────────────────────────────────
app.use(express.json({ limit: '1mb' }));

// ─── Request logging (structured) ───────────────────────
app.use((req, res, next) => {
    const start = Date.now();
    const reqId = (req as any).requestId || '-';

    // Log on response finish for timing
    res.on('finish', () => {
        const duration = Date.now() - start;
        const ts = new Date().toISOString();
        const status = res.statusCode;
        const level = status >= 500 ? 'ERROR' : status >= 400 ? 'WARN' : 'INFO';
        console.log(`[${ts}] [${level}] [${reqId}] ${req.method} ${req.path} → ${status} (${duration}ms)`);
    });

    next();
});

// ─── Routes ─────────────────────────────────────────────
app.use('/auth', authRouter);

// ─── Root health ────────────────────────────────────────
app.get('/', (_req, res) => {
    res.json({
        service: 'piechat-auth',
        version: '2.0.0',
        endpoints: [
            'POST /auth/request-otp',
            'POST /auth/verify-otp',
            'POST /auth/register',
            'POST /auth/forgot-password',
            'POST /auth/reset-password',
            'POST /auth/change-password',
            'POST /auth/deactivate-account',
            'GET  /auth/devices',
            'DELETE /auth/devices',
            'GET  /auth/login-events',
            'POST /auth/qr/generate',
            'GET  /auth/qr/status/:sessionId',
            'POST /auth/qr/approve',
            'GET  /auth/link-preview',
            'GET  /auth/health',
            'GET  /auth/admin/recent-logs',
            'GET  /auth/admin/pending-otps',
            'GET  /auth/admin/stats',
            'GET  /auth/admin/users',
            'GET  /auth/admin/rooms',
            'GET  /auth/admin/dashboard',
            'GET  /auth/admin/docker-logs',
            'GET  /auth/admin/system-info',
            'POST /auth/admin/delete-user',
            'POST /auth/admin/reset-password',
            'POST /auth/admin/delete-room',
        ],
    });
});

// ─── 404 Handler ────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// ─── Global Error Handler ───────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const reqId = (_req as any).requestId || '-';
    console.error(`[ERROR] [${reqId}] Unhandled error:`, err.message || err);

    // Don't leak internal details in production
    const message = isDev ? err.message : 'Lỗi server nội bộ';
    res.status(500).json({ error: message });
});

// ─── Start Server ───────────────────────────────────────
const server = app.listen(PORT, () => {
    console.log(`\n🔐 PieChat Auth Service v2.0.0`);
    console.log(`   URL:    http://localhost:${PORT}`);
    console.log(`   Matrix: ${process.env.MATRIX_BASE_URL || 'http://localhost:8008'}`);
    console.log(`   CORS:   ${isDev ? '(all origins - dev mode)' : corsOrigins.join(', ')}`);
    console.log(`   Redis:  ${process.env.REDIS_URL || '(in-memory)'}`);
    console.log(`   Mode:   ${process.env.NODE_ENV || 'development'}`);
    console.log(`   Security: rate-limit ✓ | security-headers ✓ | request-id ✓ | input-validation ✓\n`);
});

// ─── Graceful Shutdown ──────────────────────────────────
function gracefulShutdown(signal: string) {
    console.log(`\n[${signal}] Shutting down gracefully...`);
    server.close(() => {
        console.log('[Shutdown] HTTP server closed');
        process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
        console.error('[Shutdown] Forced exit after timeout');
        process.exit(1);
    }, 10_000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ─── Uncaught Error Handlers ────────────────────────────
process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught exception:', err);
    gracefulShutdown('UNCAUGHT');
});

process.on('unhandledRejection', (reason) => {
    console.error('[FATAL] Unhandled rejection:', reason);
});

export default app;

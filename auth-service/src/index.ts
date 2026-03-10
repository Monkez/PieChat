/**
 * PieChat Auth Service — Entry Point
 * 
 * Standalone Express server handling authentication:
 * - Phone OTP flow
 * - Device trust management
 * - Login event audit trail
 * 
 * Designed to run independently from the Next.js frontend,
 * enabling static export for desktop/mobile (Tauri/Capacitor).
 */

import express from 'express';
import cors from 'cors';
import authRouter from './routes/auth.js';

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
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Body parsing ───────────────────────────────────────
app.use(express.json({ limit: '1mb' }));

// ─── Request logging ────────────────────────────────────
app.use((req, _res, next) => {
    const ts = new Date().toISOString();
    console.log(`[${ts}] ${req.method} ${req.path}`);
    next();
});

// ─── Routes ─────────────────────────────────────────────
app.use('/auth', authRouter);

// ─── Root health ────────────────────────────────────────
app.get('/', (_req, res) => {
    res.json({
        service: 'piechat-auth',
        version: '1.0.0',
        endpoints: [
            'POST /auth/request-otp',
            'POST /auth/verify-otp',
            'GET  /auth/devices',
            'DELETE /auth/devices',
            'GET  /auth/login-events',
            'GET  /auth/health',
        ],
    });
});

// ─── Start ──────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n🔐 PieChat Auth Service running on http://localhost:${PORT}`);
    console.log(`   Matrix: ${process.env.MATRIX_BASE_URL || 'http://localhost:8008'}`);
    console.log(`   CORS:   ${corsOrigins.join(', ')}`);
    console.log(`   Redis:  ${process.env.REDIS_URL || '(in-memory)'}`);
    console.log(`   Mode:   ${process.env.NODE_ENV || 'development'}\n`);
});

export default app;

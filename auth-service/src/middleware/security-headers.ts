/**
 * Security Headers Middleware
 * 
 * Sets recommended security headers on every response to protect
 * against common web vulnerabilities (XSS, clickjacking, MIME sniffing, etc.).
 */

import { Request, Response, NextFunction } from 'express';

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');

    // XSS filter (legacy browsers)
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Referrer policy — only send referrer for same-origin
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Permissions policy — disable unnecessary APIs
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    // Remove server header (information disclosure)
    res.removeHeader('X-Powered-By');

    // HSTS in production
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    // Cache control for API responses
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    next();
}

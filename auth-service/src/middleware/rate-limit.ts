/**
 * IP-based Rate Limiting Middleware
 * 
 * Provides configurable rate limiting per IP address.
 * Uses a sliding window algorithm with automatic cleanup.
 */

import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
    count: number;
    windowStart: number;
    blocked: boolean;
    blockedUntil: number;
}

interface RateLimitOptions {
    /** Maximum requests per window */
    maxRequests: number;
    /** Window duration in milliseconds */
    windowMs: number;
    /** Block duration in milliseconds after exceeding limit */
    blockMs?: number;
    /** Custom key extractor (defaults to IP) */
    keyExtractor?: (req: Request) => string;
    /** Custom message */
    message?: string;
    /** Skip condition */
    skip?: (req: Request) => boolean;
}

const stores = new Map<string, Map<string, RateLimitEntry>>();

function getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim() || '';
    if (Array.isArray(forwarded)) return forwarded[0]?.trim() || '';
    return (req.headers['x-real-ip'] as string) || req.ip || 'unknown';
}

// Cleanup old entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [, store] of stores) {
        for (const [key, entry] of store) {
            if (now - entry.windowStart > 30 * 60 * 1000) { // 30 min stale
                store.delete(key);
            }
        }
    }
}, 5 * 60 * 1000);

export function createRateLimit(name: string, options: RateLimitOptions) {
    const {
        maxRequests,
        windowMs,
        blockMs = 0,
        keyExtractor = getClientIp,
        message = 'Quá nhiều yêu cầu, vui lòng thử lại sau.',
        skip,
    } = options;

    if (!stores.has(name)) {
        stores.set(name, new Map());
    }
    const store = stores.get(name)!;

    return (req: Request, res: Response, next: NextFunction): void => {
        if (skip?.(req)) {
            next();
            return;
        }

        const key = keyExtractor(req);
        const now = Date.now();
        let entry = store.get(key);

        // Check if currently blocked
        if (entry?.blocked && entry.blockedUntil > now) {
            const retryAfterMs = entry.blockedUntil - now;
            res.status(429).json({
                error: message,
                retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
            });
            return;
        }

        // Reset if window expired or was blocked and block expired
        if (!entry || now - entry.windowStart > windowMs || (entry.blocked && entry.blockedUntil <= now)) {
            entry = { count: 0, windowStart: now, blocked: false, blockedUntil: 0 };
        }

        entry.count++;

        if (entry.count > maxRequests) {
            if (blockMs > 0) {
                entry.blocked = true;
                entry.blockedUntil = now + blockMs;
            }
            store.set(key, entry);

            const retryAfterMs = blockMs > 0 ? blockMs : (entry.windowStart + windowMs - now);
            res.status(429).json({
                error: message,
                retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
            });
            return;
        }

        store.set(key, entry);

        // Set rate limit headers
        res.setHeader('X-RateLimit-Limit', maxRequests);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - entry.count));
        res.setHeader('X-RateLimit-Reset', Math.ceil((entry.windowStart + windowMs) / 1000));

        next();
    };
}

// ─── Preset Rate Limiters ───────────────────────────────

/** General API rate limit: 100 requests / 1 min per IP */
export const generalRateLimit = createRateLimit('general', {
    maxRequests: 100,
    windowMs: 60 * 1000,
    message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.',
});

/** Auth endpoints: 20 requests / 5 min per IP */
export const authRateLimit = createRateLimit('auth', {
    maxRequests: 20,
    windowMs: 5 * 60 * 1000,
    blockMs: 5 * 60 * 1000,
    message: 'Quá nhiều lần thử đăng nhập. Vui lòng thử lại sau 5 phút.',
});

/** Registration rate limit: 5 registrations / 1 hour per IP */
export const registerRateLimit = createRateLimit('register', {
    maxRequests: 5,
    windowMs: 60 * 60 * 1000,
    blockMs: 30 * 60 * 1000,
    message: 'Quá nhiều lần đăng ký. Vui lòng thử lại sau.',
});

/** Admin API: 60 requests / 1 min per IP */
export const adminRateLimit = createRateLimit('admin', {
    maxRequests: 60,
    windowMs: 60 * 1000,
    message: 'Quá nhiều yêu cầu admin.',
});

/** Link preview: 30 requests / 1 min per IP */
export const linkPreviewRateLimit = createRateLimit('link-preview', {
    maxRequests: 30,
    windowMs: 60 * 1000,
    message: 'Quá nhiều yêu cầu preview.',
});

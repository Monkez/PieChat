/**
 * Request ID Middleware
 * 
 * Assigns a unique request ID to every incoming request for tracing.
 * The ID is set as X-Request-Id header on both request and response.
 */

import { Request, Response, NextFunction } from 'express';

let counter = 0;

function generateRequestId(): string {
    counter = (counter + 1) % 1_000_000;
    return `req-${Date.now().toString(36)}-${counter.toString(36).padStart(4, '0')}`;
}

export function requestId(req: Request, res: Response, next: NextFunction): void {
    const id = (req.headers['x-request-id'] as string) || generateRequestId();
    (req as any).requestId = id;
    res.setHeader('X-Request-Id', id);
    next();
}

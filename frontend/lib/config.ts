/**
 * PieChat Runtime Configuration
 * 
 * Centralized configuration that supports multiple deployment targets:
 * - Web (Next.js dev/production)
 * - Desktop (Tauri)
 * - Mobile (Capacitor/Tauri Mobile)
 * - PWA
 */

export type PieChatPlatform = 'web' | 'desktop' | 'mobile' | 'pwa';

interface PieChatConfig {
    /** Matrix homeserver base URL */
    matrixBaseUrl: string;
    /** Auth service base URL */
    authBaseUrl: string;
    /** Current platform */
    platform: PieChatPlatform;
    /** Whether running in development mode */
    isDev: boolean;
}

// Allow runtime config injection (Tauri/Capacitor can set this before app loads)
declare global {
    interface Window {
        __PIECHAT_CONFIG__?: Partial<PieChatConfig>;
        __TAURI__?: unknown;
    }
}

function detectPlatform(): PieChatPlatform {
    if (typeof window === 'undefined') return 'web';
    if ('__TAURI__' in window) return 'desktop';
    if ('Capacitor' in window) return 'mobile';
    if (window.matchMedia?.('(display-mode: standalone)')?.matches) return 'pwa';
    return 'web';
}

function resolveMatrixBaseUrl(): string {
    // 1. Runtime injection (Tauri/Capacitor)
    if (typeof window !== 'undefined' && window.__PIECHAT_CONFIG__?.matrixBaseUrl) {
        return window.__PIECHAT_CONFIG__.matrixBaseUrl;
    }
    // 2. Build-time env var
    if (process.env.NEXT_PUBLIC_MATRIX_BASE_URL) {
        return process.env.NEXT_PUBLIC_MATRIX_BASE_URL;
    }
    // 3. Same-host inference (web only)
    if (typeof window !== 'undefined') {
        // When served via Nginx proxy (not localhost dev), use same origin
        if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
            return `${window.location.protocol}//${window.location.host}`;
        }
        return `http://${window.location.hostname}:8008`;
    }
    return 'http://localhost:8008';
}

function resolveAuthBaseUrl(): string {
    // 1. Runtime injection (Tauri/Capacitor)
    if (typeof window !== 'undefined' && window.__PIECHAT_CONFIG__?.authBaseUrl) {
        return window.__PIECHAT_CONFIG__.authBaseUrl;
    }
    // 2. Build-time env var
    if (process.env.NEXT_PUBLIC_AUTH_BASE_URL) {
        return process.env.NEXT_PUBLIC_AUTH_BASE_URL;
    }
    // 3. Same-host inference (web only)
    if (typeof window !== 'undefined') {
        // When served via Nginx proxy (not localhost dev), use same origin
        if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
            return `${window.location.protocol}//${window.location.host}`;
        }
        return `http://${window.location.hostname}:4000`;
    }
    return 'http://localhost:4000';
}

let cachedConfig: PieChatConfig | null = null;

export function getConfig(): PieChatConfig {
    if (cachedConfig) return cachedConfig;

    cachedConfig = {
        matrixBaseUrl: resolveMatrixBaseUrl(),
        authBaseUrl: resolveAuthBaseUrl(),
        platform: detectPlatform(),
        isDev: process.env.NODE_ENV !== 'production',
    };

    return cachedConfig;
}

/** Reset cached config (useful for testing) */
export function resetConfig(): void {
    cachedConfig = null;
}

/** Check if running as a native app (Tauri or Capacitor) */
export function isNativeApp(): boolean {
    const platform = getConfig().platform;
    return platform === 'desktop' || platform === 'mobile';
}

/** Check if running in a standalone/installed context */
export function isStandaloneApp(): boolean {
    return isNativeApp() || getConfig().platform === 'pwa';
}

/** Get the full auth API URL for a given endpoint */
export function authUrl(path: string): string {
    const base = getConfig().authBaseUrl;
    // Auth-service: http://localhost:4000/auth/request-otp
    return `${base}/auth${path}`;
}

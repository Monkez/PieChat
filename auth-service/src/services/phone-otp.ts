/**
 * PieChat Auth — Phone OTP & Device Trust Service
 * 
 * Standalone module (no Next.js dependency).
 * Manages OTP generation, verification, rate limiting,
 * trusted device tracking, and login event audit trail.
 */

import { appendLoginEventToRedis, persistOtpState, persistPhoneSecurityState } from './redis-store.js';

// ─── Types ──────────────────────────────────────────────

export type PendingOtp = {
    token: string;
    phone: string;
    matrixUsername: string;
    deviceId: string;
    code: string;
    expiresAt: number;
};

export type LoginEventType =
    | 'password_failed'
    | 'password_blocked'
    | 'otp_sent'
    | 'otp_rate_limited'
    | 'otp_verify_failed'
    | 'otp_verify_blocked'
    | 'otp_verify_expired'
    | 'login_success_new_device'
    | 'login_success_trusted_device'
    | 'device_revoked';

export type LoginEvent = {
    id: string;
    timestamp: number;
    phone: string;
    type: LoginEventType;
    success: boolean;
    suspicious: boolean;
    deviceId?: string;
    ip?: string;
    userAgent?: string;
    message?: string;
};

type LoginEventInput = Omit<LoginEvent, 'id' | 'timestamp' | 'phone'> & { phone: string };

// ─── In-Memory State ────────────────────────────────────

type AuthState = {
    pendingOtps: Map<string, PendingOtp>;
    trustedDevices: Map<string, Map<string, number>>;
    otpRequestTimestamps: Map<string, number[]>;
    passwordFailures: Map<string, { count: number; blockedUntil: number }>;
    otpVerifyFailures: Map<string, { count: number; blockedUntil: number }>;
    loginEvents: Map<string, LoginEvent[]>;
    knownUsers: Map<string, { matrixUserId: string; phone: string; displayName?: string; lastSeen: number }>;
};

const globalWithAuthState = globalThis as typeof globalThis & {
    __piechatAuthState?: AuthState;
};

const authState: AuthState =
    globalWithAuthState.__piechatAuthState || {
        pendingOtps: new Map(),
        trustedDevices: new Map(),
        otpRequestTimestamps: new Map(),
        passwordFailures: new Map(),
        otpVerifyFailures: new Map(),
        loginEvents: new Map(),
        knownUsers: new Map(),
    };

// Safety — ensure all Maps exist after hot-reload
authState.pendingOtps = authState.pendingOtps || new Map();
authState.trustedDevices = authState.trustedDevices || new Map();
authState.otpRequestTimestamps = authState.otpRequestTimestamps || new Map();
authState.passwordFailures = authState.passwordFailures || new Map();
authState.otpVerifyFailures = authState.otpVerifyFailures || new Map();
authState.loginEvents = authState.loginEvents || new Map();
authState.knownUsers = authState.knownUsers || new Map();

globalWithAuthState.__piechatAuthState = authState;

const { pendingOtps, trustedDevices, otpRequestTimestamps, passwordFailures, otpVerifyFailures, loginEvents, knownUsers } = authState;

// ─── Constants ──────────────────────────────────────────

const OTP_WINDOW_MS = 10 * 60 * 1000;       // 10 minutes
const MAX_OTP_REQUESTS = 5;
const PASSWORD_MAX_FAILURES = 5;
const PASSWORD_BLOCK_MS = 15 * 60 * 1000;    // 15 minutes
const OTP_MAX_FAILURES = 5;
const OTP_BLOCK_MS = 10 * 60 * 1000;         // 10 minutes

// ─── Utilities ──────────────────────────────────────────

function randomToken(length = 32): string {
    const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let output = '';
    for (let i = 0; i < length; i++) {
        output += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return output;
}

function randomOtp(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function randomEventId(): string {
    return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Snapshots (for Redis persistence) ──────────────────

function snapshotPhoneSecurity(phone: string) {
    const normalized = normalizePhone(phone);
    const devices = trustedDevices.get(normalized) || new Map<string, number>();
    const otpRequests = otpRequestTimestamps.get(normalized) || [];
    const passwordFailure = passwordFailures.get(normalized) || { count: 0, blockedUntil: 0 };
    const events = loginEvents.get(normalized) || [];
    return {
        phone: normalized,
        devices: Array.from(devices.entries()).map(([deviceId, lastSeenAt]) => ({ deviceId, lastSeenAt })),
        otpRequests,
        passwordFailure,
        events,
    };
}

function snapshotOtp(token: string) {
    return {
        pending: pendingOtps.get(token) || null,
        verifyFailure: otpVerifyFailures.get(token) || { count: 0, blockedUntil: 0 },
    };
}

// ─── Public API ─────────────────────────────────────────

export function normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('0')) return `+84${digits.slice(1)}`;
    if (digits.startsWith('84')) return `+${digits}`;
    return `+${digits}`;
}

export function maskPhone(phone: string): string {
    const normalized = normalizePhone(phone);
    if (normalized.length < 7) return normalized;
    return `${normalized.slice(0, 4)}***${normalized.slice(-3)}`;
}

export function resolveMatrixUsername(phone: string): string {
    const normalized = normalizePhone(phone);
    const fallbackMap: Record<string, string> = {
        '+84111111': 'u111111',
        '+84222222': 'u222222',
        '+84333333': 'u333333',
        '+84444444': 'u444444',
        '+84555555': 'u555555',
    };
    let envMap: Record<string, string> = {};
    if (process.env.PHONE_AUTH_MAP) {
        try {
            envMap = JSON.parse(process.env.PHONE_AUTH_MAP) as Record<string, string>;
        } catch {
            envMap = {};
        }
    }
    const mergedMap = { ...envMap, ...fallbackMap };
    const mapped = mergedMap[normalized];
    if (mapped) return mapped;
    const digits = normalized.replace(/\D/g, '');
    return `u${digits}`;
}

export function addLoginEvent(event: LoginEventInput): void {
    const normalizedPhone = normalizePhone(event.phone);
    if (!normalizedPhone) return;
    const eventData = { ...event } as Omit<LoginEventInput, 'phone'> & { phone?: string };
    delete eventData.phone;
    const current = loginEvents.get(normalizedPhone) || [];
    const eventRecord: LoginEvent = {
        id: randomEventId(),
        timestamp: Date.now(),
        phone: normalizedPhone,
        ...eventData,
    };
    current.unshift(eventRecord);
    loginEvents.set(normalizedPhone, current.slice(0, 100));
    void appendLoginEventToRedis(normalizedPhone, eventRecord);
    void persistPhoneSecurityState(normalizedPhone, snapshotPhoneSecurity(normalizedPhone));
}

export function listLoginEvents(phone: string): LoginEvent[] {
    return (loginEvents.get(normalizePhone(phone)) || []).slice();
}

export function isTrustedDevice(phone: string, deviceId: string): boolean {
    const devices = trustedDevices.get(normalizePhone(phone));
    return devices ? devices.has(deviceId) : false;
}

export function trustDevice(phone: string, deviceId: string): void {
    const normalized = normalizePhone(phone);
    const existing = trustedDevices.get(normalized) || new Map<string, number>();
    existing.set(deviceId, Date.now());
    trustedDevices.set(normalized, existing);
    void persistPhoneSecurityState(normalized, snapshotPhoneSecurity(normalized));
}

export function listTrustedDevices(phone: string) {
    const normalized = normalizePhone(phone);
    const devices = trustedDevices.get(normalized) || new Map<string, number>();
    return Array.from(devices.entries())
        .map(([deviceId, lastSeenAt]) => ({ deviceId, lastSeenAt }))
        .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

export function revokeTrustedDevice(phone: string, deviceId: string): boolean {
    const normalized = normalizePhone(phone);
    const devices = trustedDevices.get(normalized);
    if (!devices) return false;
    const deleted = devices.delete(deviceId);
    trustedDevices.set(normalized, devices);
    void persistPhoneSecurityState(normalized, snapshotPhoneSecurity(normalized));
    if (deleted) {
        addLoginEvent({
            phone: normalized,
            type: 'device_revoked',
            success: true,
            suspicious: false,
            deviceId,
            message: 'Thiết bị đã bị thu hồi quyền tin cậy',
        });
    }
    return deleted;
}

export function checkPasswordBlocked(phone: string) {
    const normalized = normalizePhone(phone);
    const state = passwordFailures.get(normalized);
    if (!state) return { blocked: false as const, retryAfterMs: 0 };
    if (state.blockedUntil > Date.now()) {
        return { blocked: true as const, retryAfterMs: state.blockedUntil - Date.now() };
    }
    passwordFailures.delete(normalized);
    void persistPhoneSecurityState(normalized, snapshotPhoneSecurity(normalized));
    return { blocked: false as const, retryAfterMs: 0 };
}

export function registerPasswordFailure(phone: string): void {
    const normalized = normalizePhone(phone);
    const current = passwordFailures.get(normalized) || { count: 0, blockedUntil: 0 };
    const nextCount = current.count + 1;
    const blockedUntil = nextCount >= PASSWORD_MAX_FAILURES ? Date.now() + PASSWORD_BLOCK_MS : 0;
    passwordFailures.set(normalized, { count: blockedUntil ? 0 : nextCount, blockedUntil });
    void persistPhoneSecurityState(normalized, snapshotPhoneSecurity(normalized));
}

export function clearPasswordFailures(phone: string): void {
    passwordFailures.delete(normalizePhone(phone));
    void persistPhoneSecurityState(normalizePhone(phone), snapshotPhoneSecurity(phone));
}

export function canRequestOtp(phone: string) {
    const normalized = normalizePhone(phone);
    const now = Date.now();
    const current = otpRequestTimestamps.get(normalized) || [];
    const valid = current.filter((ts) => now - ts < OTP_WINDOW_MS);
    otpRequestTimestamps.set(normalized, valid);
    void persistPhoneSecurityState(normalized, snapshotPhoneSecurity(normalized));
    if (valid.length >= MAX_OTP_REQUESTS) {
        return { allowed: false as const, retryAfterMs: Math.max(0, valid[0] + OTP_WINDOW_MS - now) };
    }
    return { allowed: true as const, retryAfterMs: 0 };
}

export function registerOtpRequest(phone: string): void {
    const normalized = normalizePhone(phone);
    const now = Date.now();
    const current = otpRequestTimestamps.get(normalized) || [];
    const valid = current.filter((ts) => now - ts < OTP_WINDOW_MS);
    valid.push(now);
    otpRequestTimestamps.set(normalized, valid);
    void persistPhoneSecurityState(normalized, snapshotPhoneSecurity(normalized));
}

export function createPendingOtp(phone: string, matrixUsername: string, deviceId: string): PendingOtp {
    const normalized = normalizePhone(phone);
    const token = randomToken();
    const code = randomOtp();
    const pending: PendingOtp = {
        token,
        phone: normalized,
        matrixUsername,
        deviceId,
        code,
        expiresAt: Date.now() + 5 * 60 * 1000,
    };
    pendingOtps.set(token, pending);
    void persistOtpState(token, snapshotOtp(token), 15 * 60);
    return pending;
}

export function consumePendingOtp(token: string, code: string) {
    const verifyState = otpVerifyFailures.get(token);
    const pending = pendingOtps.get(token);

    if (verifyState && verifyState.blockedUntil > Date.now()) {
        void persistOtpState(token, snapshotOtp(token), 15 * 60);
        return { ok: false as const, reason: 'blocked' as const, retryAfterMs: verifyState.blockedUntil - Date.now(), pending };
    }
    if (!pending) {
        return { ok: false as const, reason: 'not_found' as const };
    }
    if (pending.expiresAt < Date.now()) {
        pendingOtps.delete(token);
        otpVerifyFailures.delete(token);
        void persistOtpState(token, snapshotOtp(token), 60);
        return { ok: false as const, reason: 'expired' as const, pending };
    }
    if (pending.code !== code) {
        const current = otpVerifyFailures.get(token) || { count: 0, blockedUntil: 0 };
        const nextCount = current.count + 1;
        if (nextCount >= OTP_MAX_FAILURES) {
            const blockedUntil = Date.now() + OTP_BLOCK_MS;
            otpVerifyFailures.set(token, { count: 0, blockedUntil });
            void persistOtpState(token, snapshotOtp(token), 15 * 60);
            return { ok: false as const, reason: 'blocked' as const, retryAfterMs: OTP_BLOCK_MS, pending };
        }
        otpVerifyFailures.set(token, { count: nextCount, blockedUntil: 0 });
        void persistOtpState(token, snapshotOtp(token), 15 * 60);
        return { ok: false as const, reason: 'invalid' as const, pending };
    }

    pendingOtps.delete(token);
    otpVerifyFailures.delete(token);
    void persistOtpState(token, snapshotOtp(token), 60);
    trustDevice(pending.phone, pending.deviceId);
    return { ok: true as const, pending };
}

// ─── Admin Helpers ──────────────────────────────────────

export function listAllLoginEvents(): LoginEvent[] {
    const all: LoginEvent[] = [];
    for (const events of loginEvents.values()) {
        all.push(...events);
    }
    return all.sort((a, b) => b.timestamp - a.timestamp);
}

export function listPendingOtps(): Array<{ token: string; phone: string; code: string; matrixUsername: string; expiresAt: number; expired: boolean }> {
    const now = Date.now();
    const result: Array<{ token: string; phone: string; code: string; matrixUsername: string; expiresAt: number; expired: boolean }> = [];
    for (const [token, otp] of pendingOtps) {
        result.push({
            token,
            phone: otp.phone,
            code: otp.code,
            matrixUsername: otp.matrixUsername,
            expiresAt: otp.expiresAt,
            expired: otp.expiresAt < now,
        });
    }
    return result.sort((a, b) => b.expiresAt - a.expiresAt);
}

export function getAdminStats() {
    return {
        pendingOtpCount: pendingOtps.size,
        trustedDevicePhones: trustedDevices.size,
        trackedPhones: loginEvents.size,
        knownUserCount: knownUsers.size,
        totalEvents: Array.from(loginEvents.values()).reduce((acc, events) => acc + events.length, 0),
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
    };
}

// ─── Known Users Registry ───────────────────────────────

export function trackKnownUser(matrixUserId: string, phone: string, displayName?: string) {
    knownUsers.set(matrixUserId, {
        matrixUserId,
        phone,
        displayName,
        lastSeen: Date.now(),
    });
}

export function listKnownUsers() {
    return Array.from(knownUsers.values()).sort((a, b) => b.lastSeen - a.lastSeen);
}

/**
 * Auth Routes — POST /auth/request-otp, POST /auth/verify-otp
 *               GET /auth/devices, DELETE /auth/devices
 *               GET /auth/login-events
 */

import { Router, type Request, type Response } from 'express';
import {
    addLoginEvent,
    canRequestOtp,
    checkPasswordBlocked,
    clearPasswordFailures,
    consumePendingOtp,
    isTrustedDevice,
    listLoginEvents,
    listTrustedDevices,
    maskPhone,
    normalizePhone,
    registerOtpRequest,
    registerPasswordFailure,
    resolveMatrixUsername,
    revokeTrustedDevice,
    createPendingOtp,
    trustDevice,
    listAllLoginEvents,
    listPendingOtps,
    getAdminStats,
} from '../services/phone-otp.js';
import { getLoginEventsFromRedis } from '../services/redis-store.js';

const router = Router();

const matrixBaseUrl = process.env.MATRIX_BASE_URL || 'http://localhost:8008';

function toRetrySeconds(ms: number): number {
    return Math.max(1, Math.ceil(ms / 1000));
}

function getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim() || '';
    if (Array.isArray(forwarded)) return forwarded[0]?.trim() || '';
    return (req.headers['x-real-ip'] as string) || req.ip || '';
}

// ─── Password verification against Matrix ───────────────

async function verifyPassword(matrixUsername: string, password: string): Promise<boolean> {
    const isDev = process.env.NODE_ENV !== 'production';
    const devMatrixPassword = process.env.DEV_MATRIX_PASSWORD || '12345678';
    const allowDevPassword = isDev && (password === '1' || password === devMatrixPassword);

    if (allowDevPassword) return true;

    const candidatePasswords = allowDevPassword
        ? Array.from(new Set([devMatrixPassword, '1']))
        : [password];

    for (const candidate of candidatePasswords) {
        const response = await fetch(`${matrixBaseUrl}/_matrix/client/v3/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'm.login.password',
                identifier: { type: 'm.id.user', user: matrixUsername },
                password: candidate,
            }),
        });
        if (response.ok) return true;

        if (allowDevPassword && candidate === devMatrixPassword) {
            const registerResponse = await fetch(`${matrixBaseUrl}/_matrix/client/v3/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: matrixUsername,
                    password: devMatrixPassword,
                    auth: { type: 'm.login.dummy' },
                }),
            });
            if (registerResponse.ok) return true;
            const registerPayload = (await registerResponse.json().catch(() => null)) as { errcode?: string } | null;
            if (registerPayload?.errcode === 'M_USER_IN_USE') continue;
        }
    }
    return false;
}

// ─── SMS sending ────────────────────────────────────────

async function sendOtpSms(phone: string, otp: string): Promise<void> {
    const smsProvider = process.env.SMS_PROVIDER || 'webhook';
    const smsBrand = process.env.SMS_BRANDNAME || 'PieChat';
    const smsTemplate = process.env.SMS_TEMPLATE || '{{otp}} la ma OTP dang nhap PieChat, hieu luc 5 phut.';
    const renderedMessage = smsTemplate.replace('{{otp}}', otp);

    if (process.env.SMS_WEBHOOK_URL) {
        const response = await fetch(process.env.SMS_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: smsProvider, brand: smsBrand, phone, otp, message: renderedMessage }),
        });
        if (!response.ok) throw new Error('SMS provider error');
    }
    console.log(`[OTP] ${phone}: ${otp}`);
}

// ─── POST /auth/request-otp ─────────────────────────────

router.post('/request-otp', async (req: Request, res: Response) => {
    const { phone: rawPhone, password, deviceId } = req.body as { phone?: string; password?: string; deviceId?: string };
    const phone = normalizePhone(String(rawPhone || ''));
    const pwd = String(password || '');
    const devId = String(deviceId || '');
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'] || '';

    if (!phone || !pwd || !devId) {
        res.status(400).json({ error: 'Dữ liệu đăng nhập không hợp lệ' });
        return;
    }

    // Password rate limit
    const passwordBlocked = checkPasswordBlocked(phone);
    if (passwordBlocked.blocked) {
        addLoginEvent({ phone, type: 'password_blocked', success: false, suspicious: true, deviceId: devId, ip, userAgent, message: 'Tài khoản bị khóa tạm do nhập sai mật khẩu nhiều lần' });
        res.status(429).json({ error: 'Bạn nhập sai quá nhiều lần. Vui lòng thử lại sau.', retryAfterSeconds: toRetrySeconds(passwordBlocked.retryAfterMs) });
        return;
    }

    // Verify password against Matrix
    const matrixUsername = resolveMatrixUsername(phone);
    const validPassword = await verifyPassword(matrixUsername, pwd);
    if (!validPassword) {
        registerPasswordFailure(phone);
        addLoginEvent({ phone, type: 'password_failed', success: false, suspicious: true, deviceId: devId, ip, userAgent, message: 'Đăng nhập thất bại do sai mật khẩu' });
        res.status(401).json({ error: 'Sai số điện thoại hoặc mật khẩu' });
        return;
    }
    clearPasswordFailures(phone);

    // Trusted device — skip OTP
    if (isTrustedDevice(phone, devId)) {
        trustDevice(phone, devId);
        addLoginEvent({ phone, type: 'login_success_trusted_device', success: true, suspicious: false, deviceId: devId, ip, userAgent, message: 'Đăng nhập thành công từ thiết bị đã tin cậy' });
        res.json({ requiresOtp: false, matrixUsername });
        return;
    }

    // OTP rate limit
    const otpLimit = canRequestOtp(phone);
    if (!otpLimit.allowed) {
        addLoginEvent({ phone, type: 'otp_rate_limited', success: false, suspicious: true, deviceId: devId, ip, userAgent, message: 'Yêu cầu OTP quá nhiều lần' });
        res.status(429).json({ error: 'Bạn đã yêu cầu OTP quá nhiều. Vui lòng thử lại sau.', retryAfterSeconds: toRetrySeconds(otpLimit.retryAfterMs) });
        return;
    }

    // Create & send OTP
    const pending = createPendingOtp(phone, matrixUsername, devId);
    registerOtpRequest(phone);
    try {
        await sendOtpSms(phone, pending.code);
    } catch {
        res.status(502).json({ error: 'Không gửi được OTP, vui lòng thử lại sau.' });
        return;
    }

    addLoginEvent({ phone, type: 'otp_sent', success: true, suspicious: true, deviceId: devId, ip, userAgent, message: 'Thiết bị mới yêu cầu OTP để đăng nhập' });

    res.json({
        requiresOtp: true,
        otpToken: pending.token,
        maskedPhone: maskPhone(phone),
        matrixUsername,
        devOtp: process.env.NODE_ENV !== 'production' ? pending.code : undefined,
    });
});

// ─── POST /auth/verify-otp ──────────────────────────────

router.post('/verify-otp', async (req: Request, res: Response) => {
    const { otpToken, otpCode } = req.body as { otpToken?: string; otpCode?: string };
    const token = String(otpToken ?? '');
    const code = String(otpCode ?? '');
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'] || '';

    if (!token || !code) {
        res.status(400).json({ error: 'Thiếu mã OTP' });
        return;
    }

    const result = consumePendingOtp(token, code);

    if (!result.ok) {
        if (result.reason === 'blocked') {
            if (result.pending) addLoginEvent({ phone: result.pending.phone, type: 'otp_verify_blocked', success: false, suspicious: true, deviceId: result.pending.deviceId, ip, userAgent, message: 'OTP bị khóa tạm do nhập sai nhiều lần' });
            res.status(429).json({ error: 'Nhập sai OTP quá nhiều lần. Vui lòng thử lại sau.', retryAfterSeconds: toRetrySeconds(result.retryAfterMs || 0) });
            return;
        }
        if (result.reason === 'expired') {
            if (result.pending) addLoginEvent({ phone: result.pending.phone, type: 'otp_verify_expired', success: false, suspicious: true, deviceId: result.pending.deviceId, ip, userAgent, message: 'OTP hết hạn trước khi xác thực' });
            res.status(410).json({ error: 'Mã OTP đã hết hạn' });
            return;
        }
        if (result.pending) addLoginEvent({ phone: result.pending.phone, type: 'otp_verify_failed', success: false, suspicious: true, deviceId: result.pending.deviceId, ip, userAgent, message: 'OTP không hợp lệ' });
        res.status(401).json({ error: 'Mã OTP không đúng' });
        return;
    }

    addLoginEvent({ phone: result.pending.phone, type: 'login_success_new_device', success: true, suspicious: false, deviceId: result.pending.deviceId, ip, userAgent, message: 'Đăng nhập thành công sau xác thực OTP' });
    res.json({ success: true, matrixUsername: result.pending.matrixUsername });
});

// ─── GET /auth/devices ──────────────────────────────────

router.get('/devices', (req: Request, res: Response) => {
    const phone = normalizePhone(String(req.query.phone || ''));
    if (!phone) { res.status(400).json({ error: 'Thiếu số điện thoại' }); return; }
    res.json({ devices: listTrustedDevices(phone) });
});

// ─── DELETE /auth/devices ───────────────────────────────

router.delete('/devices', (req: Request, res: Response) => {
    const { phone: rawPhone, deviceId } = req.body as { phone?: string; deviceId?: string };
    const phone = normalizePhone(rawPhone || '');
    const devId = deviceId || '';
    if (!phone || !devId) { res.status(400).json({ error: 'Thiếu dữ liệu thu hồi thiết bị' }); return; }
    const revoked = revokeTrustedDevice(phone, devId);
    if (!revoked) { res.status(404).json({ error: 'Thiết bị không tồn tại' }); return; }
    res.json({ success: true });
});

// ─── GET /auth/login-events ─────────────────────────────

router.get('/login-events', async (req: Request, res: Response) => {
    const phone = normalizePhone(String(req.query.phone || ''));
    const suspiciousOnly = req.query.suspiciousOnly === '1';
    const sinceMs = Number(req.query.sinceMs || '0');
    if (!phone) { res.status(400).json({ error: 'Thiếu số điện thoại' }); return; }

    const redisEvents = await getLoginEventsFromRedis(phone);
    const sourceEvents = redisEvents && redisEvents.length > 0 ? redisEvents : listLoginEvents(phone);
    const events = sourceEvents.filter((event) => {
        if (suspiciousOnly && !event.suspicious) return false;
        if (sinceMs > 0 && event.timestamp < sinceMs) return false;
        return true;
    });
    res.json({ events });
});

// ─── QR Login Flow ──────────────────────────────────────

interface QrSession {
    sessionId: string;
    status: 'pending' | 'approved' | 'expired';
    createdAt: number;
    accessToken?: string;
    userId?: string;
    deviceId?: string;
}

const qrSessions = new Map<string, QrSession>();
const QR_EXPIRY_MS = 60 * 1000; // 60 seconds

function cleanExpiredSessions() {
    const now = Date.now();
    for (const [id, session] of qrSessions) {
        if (now - session.createdAt > QR_EXPIRY_MS) {
            qrSessions.delete(id);
        }
    }
}

// Generate a QR session — Web calls this, shows QR code
router.post('/qr/generate', (_req: Request, res: Response) => {
    cleanExpiredSessions();
    const sessionId = `qr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const session: QrSession = {
        sessionId,
        status: 'pending',
        createdAt: Date.now(),
    };
    qrSessions.set(sessionId, session);
    // qrData is what gets encoded in the QR code
    const qrData = JSON.stringify({ type: 'piechat-qr-login', sessionId });
    res.json({ sessionId, qrData });
});

// Poll QR session status — Web polls this every 2s
router.get('/qr/status/:sessionId', (req: Request, res: Response) => {
    const sessionId = String(req.params.sessionId);
    const session = qrSessions.get(sessionId);
    if (!session) {
        res.status(404).json({ status: 'expired' });
        return;
    }
    if (Date.now() - session.createdAt > QR_EXPIRY_MS) {
        qrSessions.delete(sessionId);
        res.json({ status: 'expired' });
        return;
    }
    if (session.status === 'approved') {
        // Return token and clean up
        const result = {
            status: 'approved',
            accessToken: session.accessToken,
            userId: session.userId,
        };
        qrSessions.delete(sessionId);
        res.json(result);
        return;
    }
    res.json({ status: session.status });
});

// Approve QR session — Mobile calls this after scanning QR
router.post('/qr/approve', async (req: Request, res: Response) => {
    const { sessionId, accessToken } = req.body;
    if (!sessionId || !accessToken) {
        res.status(400).json({ error: 'sessionId and accessToken are required' });
        return;
    }

    const session = qrSessions.get(sessionId);
    if (!session) {
        res.status(404).json({ error: 'Session not found or expired' });
        return;
    }
    if (Date.now() - session.createdAt > QR_EXPIRY_MS) {
        qrSessions.delete(sessionId);
        res.status(410).json({ error: 'Session expired' });
        return;
    }

    // Verify the mobile user's token with Matrix
    try {
        const whoAmIResponse = await fetch(`${matrixBaseUrl}/_matrix/client/v3/account/whoami`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!whoAmIResponse.ok) {
            res.status(401).json({ error: 'Invalid access token' });
            return;
        }
        const whoAmI = (await whoAmIResponse.json()) as { user_id: string; device_id?: string };

        // Create a NEW login session for the web client
        // We login as the same user with a new device
        const matrixUsername = whoAmI.user_id.replace(/^@/, '').split(':')[0];
        const devPassword = process.env.DEV_MATRIX_PASSWORD || '12345678';
        const isDev = process.env.NODE_ENV !== 'production';

        let webAccessToken = '';
        let webUserId = '';

        if (isDev) {
            // In dev, login with dev password
            const loginResponse = await fetch(`${matrixBaseUrl}/_matrix/client/v3/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'm.login.password',
                    identifier: { type: 'm.id.user', user: matrixUsername },
                    password: devPassword,
                    device_id: `web_${Date.now()}`,
                    initial_device_display_name: 'PieChat Web (QR Login)',
                }),
            });
            if (loginResponse.ok) {
                const loginPayload = (await loginResponse.json()) as { access_token: string; user_id: string };
                webAccessToken = loginPayload.access_token;
                webUserId = loginPayload.user_id;
            }
        }

        if (!webAccessToken) {
            // Fallback: share the same token (less ideal but functional)
            webAccessToken = accessToken;
            webUserId = whoAmI.user_id;
        }

        // Mark session as approved
        session.status = 'approved';
        session.accessToken = webAccessToken;
        session.userId = webUserId;

        res.json({ ok: true, userId: webUserId });
    } catch (err) {
        console.error('QR approve error:', err);
        res.status(500).json({ error: 'Internal error during approval' });
    }
});

// ─── Admin API Endpoints ────────────────────────────────

// Simple admin key check (use ADMIN_SECRET env or default dev key)
function isAdmin(req: Request): boolean {
    const adminSecret = process.env.ADMIN_SECRET || 'piechat-admin-dev';
    const authHeader = req.headers.authorization || '';
    const queryKey = String(req.query.key || '');
    return authHeader === `Bearer ${adminSecret}` || queryKey === adminSecret;
}

// GET /auth/admin/recent-logs — all recent login events across all phones
router.get('/admin/recent-logs', (req: Request, res: Response) => {
    if (!isAdmin(req)) { res.status(403).json({ error: 'Unauthorized' }); return; }
    const allEvents = listAllLoginEvents();
    const limit = Number(req.query.limit || 100);
    res.json({ events: allEvents.slice(0, limit) });
});

// GET /auth/admin/pending-otps — list active pending OTP codes
router.get('/admin/pending-otps', (req: Request, res: Response) => {
    if (!isAdmin(req)) { res.status(403).json({ error: 'Unauthorized' }); return; }
    const otps = listPendingOtps();
    res.json({ otps });
});

// GET /auth/admin/stats — overview statistics
router.get('/admin/stats', (req: Request, res: Response) => {
    if (!isAdmin(req)) { res.status(403).json({ error: 'Unauthorized' }); return; }
    const stats = getAdminStats();
    res.json(stats);
});

// GET /auth/admin/docker-logs — read recent docker logs
router.get('/admin/docker-logs', async (req: Request, res: Response) => {
    if (!isAdmin(req)) { res.status(403).json({ error: 'Unauthorized' }); return; }
    const lines = Number(req.query.lines || 100);
    const container = String(req.query.container || 'piechat-auth');
    try {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        const { stdout } = await execAsync(`docker logs --tail ${lines} ${container} 2>&1`, { timeout: 10000 });
        res.json({ logs: stdout, container, lines });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        res.json({ logs: `Cannot read Docker logs: ${message}`, container, lines });
    }
});

// ─── Health check ───────────────────────────────────────

router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'piechat-auth', timestamp: Date.now() });
});

export default router;

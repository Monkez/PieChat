/**
 * Auth Routes — POST /auth/request-otp, POST /auth/verify-otp
 *               GET /auth/devices, DELETE /auth/devices
 *               GET /auth/login-events
 *               POST /auth/register, POST /auth/forgot-password
 *               POST /auth/reset-password, POST /auth/change-password
 *               POST /auth/deactivate-account
 *               QR login flow, Link preview, Admin APIs
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
    trackKnownUser,
    listKnownUsers,
} from '../services/phone-otp.js';
import { getLoginEventsFromRedis } from '../services/redis-store.js';
import { listAllUsers as dbListAllUsers, listAllRooms as dbListAllRooms, getPresenceData, getDevices, getRoomMemberships, getMediaStats, deleteUserFromDB } from '../services/dendrite-db.js';
import { authRateLimit, registerRateLimit, adminRateLimit, linkPreviewRateLimit } from '../middleware/rate-limit.js';
import { validatePassword, validatePhone, validateOtpCode, validateOtpToken, validateStringParam, validateUrl, validateMatrixUserId } from '../middleware/validators.js';

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
    console.log(`[OTP] ${phone}: ***`);
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
        trackKnownUser(matrixUsername, phone);
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

    addLoginEvent({ phone, type: 'otp_sent', success: true, suspicious: true, deviceId: devId, ip, userAgent, message: `OTP: ${pending.code} — Thiết bị mới yêu cầu OTP để đăng nhập` });

    res.json({
        requiresOtp: true,
        otpToken: pending.token,
        maskedPhone: maskPhone(phone),
        matrixUsername,
        devOtp: process.env.NODE_ENV !== 'production' ? pending.code : undefined,
    });
});

// ─── POST /auth/verify-otp ──────────────────────────────

router.post('/verify-otp', authRateLimit, async (req: Request, res: Response) => {
    const { otpToken, otpCode } = req.body as { otpToken?: string; otpCode?: string };
    
    const tokenResult = validateOtpToken(otpToken);
    if (!tokenResult.valid) {
        res.status(400).json({ error: tokenResult.error });
        return;
    }
    const codeResult = validateOtpCode(otpCode);
    if (!codeResult.valid) {
        res.status(400).json({ error: codeResult.error });
        return;
    }
    
    const token = tokenResult.value;
    const code = codeResult.value;
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'] || '';

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
    trackKnownUser(result.pending.matrixUsername, result.pending.phone);
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

// ─── POST /auth/register — Public user registration ──────
router.post('/register', registerRateLimit, async (req: Request, res: Response) => {
    const { phone: rawPhone, password } = req.body as { phone?: string; password?: string };
    
    const phoneResult = validatePhone(rawPhone);
    if (!phoneResult.valid) {
        res.status(400).json({ error: phoneResult.error });
        return;
    }
    const pwdResult = validatePassword(password);
    if (!pwdResult.valid) {
        res.status(400).json({ error: pwdResult.error });
        return;
    }
    
    const phone = normalizePhone(phoneResult.value);
    const pwd = pwdResult.value;

    const serverName = process.env.DOMAIN || 'localhost';
    const matrixUsername = `vn_${phone}`;

    try {
        // Check if user already exists by trying to login
        const loginCheck = await fetch(`${matrixBaseUrl}/_matrix/client/v3/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'm.login.password',
                identifier: { type: 'm.id.user', user: matrixUsername },
                password: pwd,
            }),
        });
        if (loginCheck.ok) {
            res.status(409).json({ error: 'Số điện thoại đã được đăng ký' });
            return;
        }

        // Register via Dendrite registration endpoint
        const sharedSecret = process.env.REGISTRATION_SHARED_SECRET;
        if (sharedSecret) {
            // Use shared secret registration (Synapse/Dendrite admin API)
            const crypto = await import('crypto');
            const nonceRes = await fetch(`${matrixBaseUrl}/_synapse/admin/v1/register`);
            if (!nonceRes.ok) {
                res.status(500).json({ error: 'Không thể kết nối server Matrix' });
                return;
            }
            const { nonce } = (await nonceRes.json()) as { nonce: string };
            const mac = crypto.createHmac('sha1', sharedSecret);
            mac.update(nonce + '\0' + matrixUsername + '\0' + pwd + '\0notadmin');
            const hmac = mac.digest('hex');

            const regRes = await fetch(`${matrixBaseUrl}/_synapse/admin/v1/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nonce, username: matrixUsername, password: pwd, admin: false, mac: hmac }),
            });
            const regData = (await regRes.json()) as { access_token?: string; user_id?: string; errcode?: string; error?: string };

            if (regData.errcode === 'M_USER_IN_USE') {
                res.status(409).json({ error: 'Số điện thoại đã được đăng ký' });
                return;
            }
            if (!regData.access_token) {
                console.error('[Register] Failed:', regData);
                res.status(500).json({ error: regData.error || 'Đăng ký thất bại' });
                return;
            }

            // Track the known user
            trackKnownUser(phone, matrixUsername, `@${matrixUsername}:${serverName}`);

            res.json({
                success: true,
                userId: regData.user_id,
                message: 'Đăng ký thành công! Bạn có thể đăng nhập ngay.',
            });
        } else {
            // Fallback: direct Matrix register with dummy auth
            const regRes = await fetch(`${matrixBaseUrl}/_matrix/client/v3/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: matrixUsername,
                    password: pwd,
                    auth: { type: 'm.login.dummy' },
                }),
            });
            const regData = (await regRes.json()) as { access_token?: string; user_id?: string; errcode?: string; error?: string };

            if (regData.errcode === 'M_USER_IN_USE') {
                res.status(409).json({ error: 'Số điện thoại đã được đăng ký' });
                return;
            }
            if (regData.errcode === 'M_FORBIDDEN') {
                res.status(403).json({ error: 'Server không cho phép đăng ký công khai. Liên hệ admin.' });
                return;
            }
            if (!regData.access_token) {
                res.status(500).json({ error: regData.error || 'Đăng ký thất bại' });
                return;
            }

            trackKnownUser(phone, matrixUsername, `@${matrixUsername}:${serverName}`);

            res.json({
                success: true,
                userId: regData.user_id,
                message: 'Đăng ký thành công! Bạn có thể đăng nhập ngay.',
            });
        }
    } catch (err) {
        console.error('[Register] Error:', err);
        res.status(500).json({ error: 'Lỗi server, vui lòng thử lại sau' });
    }
});

// ─── Forgot Password OTP Storage ─────────────────────────
const pendingResets = new Map<string, { code: string; phone: string; matrixUsername: string; expiresAt: number }>();

// ─── POST /auth/forgot-password — Send OTP for password reset ──
router.post('/forgot-password', authRateLimit, async (req: Request, res: Response) => {
    const { phone: rawPhone } = req.body as { phone?: string };
    const phone = normalizePhone(String(rawPhone || ''));
    if (!phone || phone.length < 8) {
        res.status(400).json({ error: 'Số điện thoại không hợp lệ' });
        return;
    }

    // Rate limit
    const otpLimit = canRequestOtp(phone);
    if (!otpLimit.allowed) {
        res.status(429).json({ error: 'Bạn đã yêu cầu OTP quá nhiều. Vui lòng thử lại sau.', retryAfterSeconds: toRetrySeconds(otpLimit.retryAfterMs) });
        return;
    }

    // Generate OTP — 6 digits
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const matrixUsername = resolveMatrixUsername(phone);

    pendingResets.set(phone, {
        code,
        phone,
        matrixUsername,
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 min
    });
    registerOtpRequest(phone);

    try {
        await sendOtpSms(phone, code);
    } catch {
        res.status(502).json({ error: 'Không gửi được OTP, vui lòng thử lại sau.' });
        return;
    }

    console.log(`[ForgotPassword] OTP sent to ${phone}: ***`);
    res.json({ success: true, message: 'Mã OTP đã được gửi đến số điện thoại của bạn' });
});

// ─── POST /auth/reset-password — Verify OTP & reset password ──
router.post('/reset-password', authRateLimit, async (req: Request, res: Response) => {
    const { phone: rawPhone, otp, newPassword } = req.body as { phone?: string; otp?: string; newPassword?: string };
    const phone = normalizePhone(String(rawPhone || ''));
    const code = String(otp || '');
    const pwd = String(newPassword || '');

    if (!phone || !code || !pwd) {
        res.status(400).json({ error: 'Thiếu thông tin' });
        return;
    }
    if (pwd.length < 6) {
        res.status(400).json({ error: 'Mật khẩu mới phải ít nhất 6 ký tự' });
        return;
    }

    const pending = pendingResets.get(phone);
    if (!pending || pending.expiresAt < Date.now()) {
        pendingResets.delete(phone);
        res.status(400).json({ error: 'Mã OTP đã hết hạn hoặc không tồn tại. Hãy yêu cầu lại.' });
        return;
    }

    if (pending.code !== code) {
        res.status(400).json({ error: 'Mã OTP không đúng' });
        return;
    }

    // OTP is valid, reset password
    pendingResets.delete(phone);

    const serverName = process.env.DOMAIN || 'localhost';
    const userId = `@${pending.matrixUsername}:${serverName}`;

    try {
        const token = await getAdminToken();
        if (!token) {
            res.status(500).json({ error: 'Không thể kết nối admin server' });
            return;
        }

        const resetRes = await fetch(`${matrixBaseUrl}/_dendrite/admin/resetPassword/${encodeURIComponent(userId)}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: pwd }),
        });

        if (resetRes.ok) {
            console.log(`[ForgotPassword] Password reset for ${userId}`);
            res.json({ success: true, message: 'Đổi mật khẩu thành công! Bạn có thể đăng nhập ngay.' });
        } else {
            const data = (await resetRes.json()) as { error?: string };
            console.error('[ForgotPassword] Reset failed:', data);
            res.status(500).json({ error: data.error || 'Đổi mật khẩu thất bại' });
        }
    } catch (err) {
        console.error('[ForgotPassword] Error:', err);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// ─── POST /auth/change-password — Change password (requires old password) ──
router.post('/change-password', authRateLimit, async (req: Request, res: Response) => {
    const { phone: rawPhone, oldPassword, newPassword } = req.body as { phone?: string; oldPassword?: string; newPassword?: string };
    const phone = normalizePhone(String(rawPhone || ''));
    const oldPwd = String(oldPassword || '');
    const newPwd = String(newPassword || '');

    if (!phone || !oldPwd || !newPwd) {
        res.status(400).json({ error: 'Thiếu thông tin' });
        return;
    }
    if (newPwd.length < 6) {
        res.status(400).json({ error: 'Mật khẩu mới phải ít nhất 6 ký tự' });
        return;
    }

    const matrixUsername = resolveMatrixUsername(phone);

    // Verify old password
    const valid = await verifyPassword(matrixUsername, oldPwd);
    if (!valid) {
        res.status(401).json({ error: 'Mật khẩu hiện tại không đúng' });
        return;
    }

    // Reset password via admin API
    const serverName = process.env.DOMAIN || 'localhost';
    const userId = `@${matrixUsername}:${serverName}`;

    try {
        const token = await getAdminToken();
        if (!token) {
            res.status(500).json({ error: 'Không thể kết nối admin server' });
            return;
        }

        const resetRes = await fetch(`${matrixBaseUrl}/_dendrite/admin/resetPassword/${encodeURIComponent(userId)}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: newPwd }),
        });

        if (resetRes.ok) {
            console.log(`[ChangePassword] Password changed for ${userId}`);
            res.json({ success: true, message: 'Đổi mật khẩu thành công!' });
        } else {
            const data = (await resetRes.json()) as { error?: string };
            res.status(500).json({ error: data.error || 'Đổi mật khẩu thất bại' });
        }
    } catch (err) {
        console.error('[ChangePassword] Error:', err);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// ─── POST /auth/deactivate-account — User self-deactivation ─────
router.post('/deactivate-account', authRateLimit, async (req: Request, res: Response) => {
    const { phone: rawPhone, password } = req.body as { phone?: string; password?: string };
    const phone = normalizePhone(String(rawPhone || ''));
    const pwd = String(password || '');

    if (!phone || !pwd) {
        res.status(400).json({ error: 'Thiếu thông tin' });
        return;
    }

    const matrixUsername = resolveMatrixUsername(phone);

    // Verify password before allowing deactivation
    const valid = await verifyPassword(matrixUsername, pwd);
    if (!valid) {
        res.status(401).json({ error: 'Mật khẩu không đúng' });
        return;
    }

    const serverName = process.env.DOMAIN || 'localhost';
    const userId = `@${matrixUsername}:${serverName}`;

    try {
        const token = await getAdminToken();
        if (!token) {
            res.status(500).json({ error: 'Không thể kết nối admin server' });
            return;
        }

        // Evacuate user from all rooms
        try {
            await fetch(`${matrixBaseUrl}/_dendrite/admin/evacuateUser/${encodeURIComponent(userId)}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
        } catch { /* best effort */ }

        // Delete from DB
        const match = userId.match(/^@(.+):(.+)$/);
        if (match) {
            const [, localpart, sName] = match;
            deleteUserFromDB(localpart, sName);
        }

        addLoginEvent({
            phone,
            type: 'device_revoked',
            success: true,
            suspicious: false,
            message: 'Tài khoản đã bị vô hiệu hóa bởi chính người dùng',
        });

        console.log(`[DeactivateAccount] User ${userId} deactivated`);
        res.json({ success: true, message: 'Tài khoản đã được xoá thành công' });
    } catch (err) {
        console.error('[DeactivateAccount] Error:', err);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// ─── GET /auth/link-preview — Fetch URL metadata ─────────
router.get('/link-preview', linkPreviewRateLimit, async (req: Request, res: Response) => {
    const url = String(req.query.url || '');
    if (!url || !url.startsWith('http')) {
        res.status(400).json({ error: 'Invalid URL' });
        return;
    }
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; PieChatBot/1.0)',
                'Accept': 'text/html',
            },
            signal: controller.signal,
            redirect: 'follow',
        });
        clearTimeout(timeout);

        if (!response.ok) {
            res.json({ url, title: new URL(url).hostname });
            return;
        }

        // Only read first 50KB for metadata
        const text = await response.text();
        const html = text.slice(0, 50000);

        const getMetaContent = (property: string): string | undefined => {
            // og:property
            const ogMatch = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'))
                || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, 'i'));
            return ogMatch?.[1];
        };

        const title = getMetaContent('og:title')
            || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]
            || new URL(url).hostname;
        const description = getMetaContent('og:description')
            || getMetaContent('description');
        const image = getMetaContent('og:image');
        const siteName = getMetaContent('og:site_name')
            || new URL(url).hostname.replace('www.', '');

        res.json({
            url,
            title: title?.trim().slice(0, 200),
            description: description?.trim().slice(0, 300),
            image,
            siteName: siteName?.trim(),
        });
    } catch {
        res.json({ url, title: new URL(url).hostname.replace('www.', '') });
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
router.get('/admin/recent-logs', adminRateLimit, (req: Request, res: Response) => {
    if (!isAdmin(req)) { res.status(403).json({ error: 'Unauthorized' }); return; }
    const allEvents = listAllLoginEvents();
    const limit = Number(req.query.limit || 100);
    res.json({ events: allEvents.slice(0, limit) });
});

// GET /auth/admin/pending-otps — list active pending OTP codes
router.get('/admin/pending-otps', adminRateLimit, (req: Request, res: Response) => {
    if (!isAdmin(req)) { res.status(403).json({ error: 'Unauthorized' }); return; }
    const otps = listPendingOtps();
    res.json({ otps });
});

// GET /auth/admin/stats — overview statistics
router.get('/admin/stats', adminRateLimit, (req: Request, res: Response) => {
    if (!isAdmin(req)) { res.status(403).json({ error: 'Unauthorized' }); return; }
    const stats = getAdminStats();
    res.json(stats);
});

// GET /auth/admin/config — server config info (dev password, etc.)
router.get('/admin/config', adminRateLimit, (req: Request, res: Response) => {
    if (!isAdmin(req)) { res.status(403).json({ error: 'Unauthorized' }); return; }
    res.json({
        devMatrixPassword: process.env.DEV_MATRIX_PASSWORD || '12345678',
        matrixBaseUrl: process.env.MATRIX_BASE_URL || 'http://localhost:8008',
        nodeEnv: process.env.NODE_ENV || 'development',
        smsProvider: process.env.SMS_PROVIDER || 'none',
    });
});

// Helper: get an admin access token by logging in to Matrix
let cachedAdminToken: { token: string; expiresAt: number } | null = null;
const ADMIN_USER = 'piechat_admin';
const ADMIN_PASS = 'PieChat_Admin_2024!';

async function getAdminToken(): Promise<string | null> {
    if (cachedAdminToken && cachedAdminToken.expiresAt > Date.now()) {
        return cachedAdminToken.token;
    }
    
    // Step 1: Try logging in as admin user
    try {
        const res = await fetch(`${matrixBaseUrl}/_matrix/client/v3/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'm.login.password',
                identifier: { type: 'm.id.user', user: ADMIN_USER },
                password: ADMIN_PASS,
            }),
        });
        if (res.ok) {
            const data = (await res.json()) as { access_token: string };
            cachedAdminToken = { token: data.access_token, expiresAt: Date.now() + 3600_000 };
            console.log('[Admin] Logged in as', ADMIN_USER);
            return data.access_token;
        }
    } catch { /* ignore */ }
    
    // Step 2: Register admin user using shared secret
    const sharedSecret = process.env.REGISTRATION_SHARED_SECRET;
    if (sharedSecret) {
        try {
            const crypto = await import('crypto');
            // Get nonce
            const nonceRes = await fetch(`${matrixBaseUrl}/_synapse/admin/v1/register`);
            if (!nonceRes.ok) { console.error('[Admin] Cannot get nonce:', nonceRes.status); return null; }
            const { nonce } = (await nonceRes.json()) as { nonce: string };
            
            // Generate HMAC: nonce\0username\0password\0<admin|notadmin>
            const mac = crypto.createHmac('sha1', sharedSecret);
            mac.update(nonce + '\0' + ADMIN_USER + '\0' + ADMIN_PASS + '\0admin');
            const hmac = mac.digest('hex');
            
            // Register
            const regRes = await fetch(`${matrixBaseUrl}/_synapse/admin/v1/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nonce, username: ADMIN_USER, password: ADMIN_PASS, admin: true, mac: hmac }),
            });
            const regData = (await regRes.json()) as { access_token?: string; user_id?: string; errcode?: string };
            
            if (regData.access_token) {
                cachedAdminToken = { token: regData.access_token, expiresAt: Date.now() + 3600_000 };
                console.log('[Admin] Registered and logged in as', ADMIN_USER);
                return regData.access_token;
            }
            console.error('[Admin] Registration failed:', regData.errcode);
        } catch (err) {
            console.error('[Admin] Shared secret registration error:', err);
        }
    } else {
        console.error('[Admin] No REGISTRATION_SHARED_SECRET configured');
    }
    
    return null;
}

// GET /auth/admin/users — list ALL users from Dendrite database
router.get('/admin/users', async (req: Request, res: Response) => {
    if (!isAdmin(req)) { res.status(403).json({ error: 'Unauthorized' }); return; }
    
    const serverName = process.env.DOMAIN || 'localhost';
    const known = listKnownUsers();
    const phoneMap = new Map<string, string>();
    for (const k of known) phoneMap.set(k.matrixUserId, k.phone);
    
    // Get all users from Dendrite DB
    const dbUsers = dbListAllUsers();
    const presenceData = getPresenceData();
    const devices = getDevices();
    
    // Build presence map
    const presenceMap = new Map<string, { presence: number; last_active_ts: number }>();
    for (const p of presenceData) presenceMap.set(p.user_id, p);
    
    // Build device map (count + last seen)
    const deviceMap = new Map<string, { count: number; last_seen_ts: number }>();
    for (const d of devices) {
        const existing = deviceMap.get(d.localpart) || { count: 0, last_seen_ts: 0 };
        existing.count++;
        if (d.last_seen_ts > existing.last_seen_ts) existing.last_seen_ts = d.last_seen_ts;
        deviceMap.set(d.localpart, existing);
    }
    
    // Online threshold: 5 minutes
    const onlineThreshold = Date.now() - 5 * 60 * 1000;
    
    const users = dbUsers.map(u => {
        const userId = `@${u.localpart}:${u.server_name || serverName}`;
        const presence = presenceMap.get(userId);
        const deviceInfo = deviceMap.get(u.localpart);
        const phone = phoneMap.get(u.localpart) || '';
        
        // Determine online status
        let isOnline = false;
        if (presence && presence.presence === 1) isOnline = true;
        if (deviceInfo && deviceInfo.last_seen_ts > onlineThreshold) isOnline = true;
        
        return {
            user_id: userId,
            localpart: u.localpart,
            display_name: u.display_name || u.localpart,
            avatar_url: u.avatar_url || '',
            created_ts: u.created_ts,
            is_deactivated: u.is_deactivated,
            phone,
            is_online: isOnline,
            last_seen: deviceInfo?.last_seen_ts || presence?.last_active_ts || 0,
            device_count: deviceInfo?.count || 0,
        };
    });

    const onlineCount = users.filter(u => u.is_online).length;
    res.json({ users, total: users.length, online: onlineCount });
});

// GET /auth/admin/rooms — list ALL rooms from Dendrite database
router.get('/admin/rooms', async (req: Request, res: Response) => {
    if (!isAdmin(req)) { res.status(403).json({ error: 'Unauthorized' }); return; }
    
    const dbRooms = dbListAllRooms();
    const memberships = getRoomMemberships();
    const token = await getAdminToken();
    
    // Count members per room
    const memberCount = new Map<string, number>();
    const memberList = new Map<string, string[]>();
    for (const m of memberships) {
        if (m.membership === 'join') {
            memberCount.set(m.room_id, (memberCount.get(m.room_id) || 0) + 1);
            const list = memberList.get(m.room_id) || [];
            list.push(m.user_id);
            memberList.set(m.room_id, list);
        }
    }
    
    // Get room details from Matrix API for display names
    const rooms = [];
    for (const room of dbRooms) {
        let name = room.name || '';
        let topic = room.topic || '';
        let creator = room.creator || '';
        
        if (token && !name) {
            try {
                const stateRes = await fetch(`${matrixBaseUrl}/_matrix/client/v3/rooms/${encodeURIComponent(room.room_id)}/state`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (stateRes.ok) {
                    const states = (await stateRes.json()) as Array<{ type: string; content: Record<string, unknown> }>;
                    for (const s of states) {
                        if (s.type === 'm.room.name') name = String(s.content?.name || '');
                        if (s.type === 'm.room.topic') topic = String(s.content?.topic || '');
                        if (s.type === 'm.room.create') creator = String(s.content?.creator || '');
                    }
                }
            } catch { /* skip */ }
        }
        
        rooms.push({
            room_id: room.room_id,
            name,
            topic,
            creator,
            room_version: room.room_version,
            joined_members: memberCount.get(room.room_id) || 0,
            members: memberList.get(room.room_id) || [],
            is_stub: room.is_stub,
        });
    }
    
    res.json({ rooms, total: rooms.length });
});

// GET /auth/admin/dashboard — comprehensive overview
router.get('/admin/dashboard', async (req: Request, res: Response) => {
    if (!isAdmin(req)) { res.status(403).json({ error: 'Unauthorized' }); return; }
    
    const dbUsers = dbListAllUsers();
    const dbRooms = dbListAllRooms();
    const presenceData = getPresenceData();
    const devices = getDevices();
    const media = getMediaStats();
    const memberships = getRoomMemberships();
    
    const onlineThreshold = Date.now() - 5 * 60 * 1000;
    const deviceLastSeen = new Map<string, number>();
    for (const d of devices) {
        const ts = deviceLastSeen.get(d.localpart) || 0;
        if (d.last_seen_ts > ts) deviceLastSeen.set(d.localpart, d.last_seen_ts);
    }
    
    let onlineCount = 0;
    for (const u of dbUsers) {
        const userId = `@${u.localpart}:${process.env.DOMAIN || 'localhost'}`;
        const p = presenceData.find(pp => pp.user_id === userId);
        if (p && p.presence === 1) { onlineCount++; continue; }
        const lastSeen = deviceLastSeen.get(u.localpart) || 0;
        if (lastSeen > onlineThreshold) onlineCount++;
    }
    
    const joinedMemberships = memberships.filter(m => m.membership === 'join');
    
    res.json({
        users: { total: dbUsers.length, online: onlineCount, deactivated: dbUsers.filter(u => u.is_deactivated).length },
        rooms: { total: dbRooms.length, active: dbRooms.filter(r => !r.is_stub).length },
        devices: { total: devices.length },
        media: { totalFiles: media.totalFiles, totalSize: media.totalSize },
        memberships: { total: joinedMemberships.length },
    });
});

// POST /auth/admin/delete-user — evacuate user from all rooms + delete from DB
router.post('/admin/delete-user', async (req: Request, res: Response) => {
    if (!isAdmin(req)) { res.status(403).json({ error: 'Unauthorized' }); return; }
    const { userId } = req.body as { userId?: string };
    if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
    
    const results: string[] = [];
    
    // Step 1: Evacuate user from all rooms via Dendrite admin API
    const token = await getAdminToken();
    if (token) {
        try {
            const evacRes = await fetch(`${matrixBaseUrl}/_dendrite/admin/evacuateUser/${userId}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            const evacData = (await evacRes.json()) as { affected?: string[]; error?: string };
            if (evacRes.ok) {
                results.push(`Evacuated from ${evacData.affected?.length || 0} rooms`);
            } else {
                results.push(`Evacuate: ${evacData.error || evacRes.status}`);
            }
        } catch (err) { results.push(`Evacuate error: ${err}`); }
    }
    
    // Step 2: Delete user from Dendrite database directly
    const match = userId.match(/^@(.+):(.+)$/);
    if (match) {
        const [, localpart, serverName] = match;
        const dbResult = deleteUserFromDB(localpart, serverName);
        results.push(...dbResult.details);
    } else {
        results.push('Invalid userId format');
    }
    
    console.log(`[Admin] Delete user ${userId}: ${results.join('; ')}`);
    res.json({ success: true, userId, details: results });
});

// POST /auth/admin/reset-password — reset user password via Dendrite admin API
router.post('/admin/reset-password', async (req: Request, res: Response) => {
    if (!isAdmin(req)) { res.status(403).json({ error: 'Unauthorized' }); return; }
    const { userId, newPassword } = req.body as { userId?: string; newPassword?: string };
    if (!userId || !newPassword) { res.status(400).json({ error: 'userId and newPassword required' }); return; }
    
    const token = await getAdminToken();
    if (!token) { res.status(500).json({ error: 'Cannot get admin token' }); return; }
    
    try {
        const resetRes = await fetch(`${matrixBaseUrl}/_dendrite/admin/resetPassword/${userId}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: newPassword }),
        });
        if (resetRes.ok) {
            console.log(`[Admin] Password reset for ${userId}`);
            res.json({ success: true, userId });
        } else {
            const data = (await resetRes.json()) as { error?: string };
            res.status(resetRes.status).json({ error: data.error || 'Reset failed' });
        }
    } catch (err) {
        console.error('[Admin] Reset password error:', err);
        res.status(500).json({ error: 'Internal error' });
    }
});

// POST /auth/admin/delete-room — evacuate room (remove all users)
router.post('/admin/delete-room', async (req: Request, res: Response) => {
    if (!isAdmin(req)) { res.status(403).json({ error: 'Unauthorized' }); return; }
    const { roomId } = req.body as { roomId?: string };
    if (!roomId) { res.status(400).json({ error: 'roomId required' }); return; }
    
    const token = await getAdminToken();
    if (!token) { res.status(500).json({ error: 'Cannot get admin token' }); return; }
    
    try {
        const evacRes = await fetch(`${matrixBaseUrl}/_dendrite/admin/evacuateRoom/${roomId}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
        });
        if (evacRes.ok) {
            const data = (await evacRes.json()) as { affected?: string[] };
            // Also try to purge room data
            try {
                await fetch(`${matrixBaseUrl}/_dendrite/admin/purgeRoom/${roomId}`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` },
                });
            } catch { /* purge is best-effort */ }
            console.log(`[Admin] Room ${roomId} evacuated + purged, ${data.affected?.length || 0} users removed`);
            res.json({ success: true, roomId, affected: data.affected?.length || 0 });
        } else {
            const data = (await evacRes.json()) as { error?: string };
            res.status(evacRes.status).json({ error: data.error || 'Evacuate failed' });
        }
    } catch (err) {
        console.error('[Admin] Delete room error:', err);
        res.status(500).json({ error: 'Internal error' });
    }
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

// GET /auth/admin/system-info — server system metrics (CPU, RAM, Disk, Network)
router.get('/admin/system-info', async (req: Request, res: Response) => {
    if (!isAdmin(req)) { res.status(403).json({ error: 'Unauthorized' }); return; }
    
    const os = await import('os');
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const loadAvg = os.loadavg();
    
    // Calculate CPU usage percentage
    let cpuUsagePercent = 0;
    if (cpus.length > 0) {
        const cpuTotal = cpus.reduce((acc, cpu) => {
            const times = cpu.times;
            return acc + times.user + times.nice + times.sys + times.idle + times.irq;
        }, 0);
        const cpuIdle = cpus.reduce((acc, cpu) => acc + cpu.times.idle, 0);
        cpuUsagePercent = Math.round(((cpuTotal - cpuIdle) / cpuTotal) * 100);
    }

    // Network interfaces
    const nets = os.networkInterfaces();
    const networkInfo: Array<{ name: string; address: string; family: string }> = [];
    for (const [name, addrs] of Object.entries(nets)) {
        for (const addr of (addrs || [])) {
            if (!addr.internal) {
                networkInfo.push({ name, address: addr.address, family: addr.family || 'IPv4' });
            }
        }
    }

    // Disk usage via shell
    let diskInfo = '';
    const diskParsed: Array<{ filesystem: string; size: string; used: string; available: string; usagePercent: number; mountedOn: string }> = [];
    let dockerInfo = '';
    let networkTraffic = '';
    try {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        
        try {
            const { stdout } = await execAsync('df -h /', { timeout: 5000 });
            diskInfo = stdout;
            // Parse df output into structured data (deduplicate by mount point)
            const seen = new Set<string>();
            const lines = stdout.trim().split('\n').slice(1); // skip header
            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 6 && !seen.has(parts[5])) {
                    seen.add(parts[5]);
                    const usePct = parseInt(parts[4]?.replace('%', '') || '0');
                    diskParsed.push({
                        filesystem: parts[0],
                        size: parts[1],
                        used: parts[2],
                        available: parts[3],
                        usagePercent: usePct,
                        mountedOn: parts[5],
                    });
                }
            }
        } catch { /* skip */ }
        
        try {
            const { stdout } = await execAsync('docker stats --no-stream --format "{{.Name}}: CPU {{.CPUPerc}}, MEM {{.MemUsage}}" 2>/dev/null', { timeout: 10000 });
            dockerInfo = stdout;
        } catch { /* skip */ }
        
        try {
            const { stdout } = await execAsync('cat /proc/net/dev 2>/dev/null | tail -n +3', { timeout: 3000 });
            networkTraffic = stdout;
        } catch { /* skip */ }
    } catch { /* not on Linux */ }

    res.json({
        cpu: {
            model: cpus[0]?.model || 'Unknown',
            cores: cpus.length,
            loadAvg: { '1m': loadAvg[0], '5m': loadAvg[1], '15m': loadAvg[2] },
            usagePercent: cpuUsagePercent,
        },
        memory: {
            total: totalMem,
            used: usedMem,
            free: freeMem,
            usagePercent: Math.round((usedMem / totalMem) * 100),
        },
        disk: diskInfo,
        diskParsed,
        docker: dockerInfo,
        network: {
            interfaces: networkInfo,
            traffic: networkTraffic,
        },
        os: {
            platform: os.platform(),
            release: os.release(),
            hostname: os.hostname(),
            uptime: os.uptime(),
            arch: os.arch(),
        },
    });
});

// ─── Health check ───────────────────────────────────────

router.get('/health', async (_req: Request, res: Response) => {
    // Enhanced health check: verify Matrix server connectivity
    let matrixOk = false;
    let matrixLatencyMs = 0;
    try {
        const start = Date.now();
        const matrixRes = await fetch(`${matrixBaseUrl}/_matrix/client/versions`, {
            signal: AbortSignal.timeout(3000),
        });
        matrixLatencyMs = Date.now() - start;
        matrixOk = matrixRes.ok;
    } catch { /* Matrix unreachable */ }

    const status = matrixOk ? 'ok' : 'degraded';
    const statusCode = matrixOk ? 200 : 503;

    res.status(statusCode).json({
        status,
        service: 'piechat-auth',
        version: '2.0.0',
        timestamp: Date.now(),
        uptime: process.uptime(),
        memory: {
            rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
            heap: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        },
        dependencies: {
            matrix: {
                status: matrixOk ? 'connected' : 'unreachable',
                url: matrixBaseUrl,
                latencyMs: matrixLatencyMs,
            },
        },
    });
});

export default router;

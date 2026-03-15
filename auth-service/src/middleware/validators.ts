/**
 * Input Validation Utilities
 * 
 * Shared validation and sanitization functions for auth endpoints.
 * Prevents injection attacks and ensures data integrity.
 */

/** Strip all characters except digits, +, and spaces from phone numbers */
export function sanitizePhone(input: unknown): string {
    if (typeof input !== 'string') return '';
    return input.replace(/[^\d+\s\-()]/g, '').trim().slice(0, 20);
}

/** Validate password: must be 6-128 chars, no control characters */
export function validatePassword(input: unknown): { valid: boolean; error?: string; value: string } {
    if (typeof input !== 'string' || !input) {
        return { valid: false, error: 'Mật khẩu không được để trống', value: '' };
    }
    if (input.length < 6) {
        return { valid: false, error: 'Mật khẩu phải ít nhất 6 ký tự', value: '' };
    }
    if (input.length > 128) {
        return { valid: false, error: 'Mật khẩu tối đa 128 ký tự', value: '' };
    }
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x1f\x7f]/.test(input)) {
        return { valid: false, error: 'Mật khẩu chứa ký tự không hợp lệ', value: '' };
    }
    return { valid: true, value: input };
}

/** Validate phone number: must be at least 6 digits */
export function validatePhone(input: unknown): { valid: boolean; error?: string; value: string } {
    const sanitized = sanitizePhone(input);
    const digitsOnly = sanitized.replace(/\D/g, '');
    if (digitsOnly.length < 6) {
        return { valid: false, error: 'Số điện thoại không hợp lệ', value: '' };
    }
    if (digitsOnly.length > 15) {
        return { valid: false, error: 'Số điện thoại quá dài', value: '' };
    }
    return { valid: true, value: sanitized };
}

/** Validate OTP code: must be exactly 6 digits */
export function validateOtpCode(input: unknown): { valid: boolean; error?: string; value: string } {
    if (typeof input !== 'string' || !input) {
        return { valid: false, error: 'Mã OTP không được để trống', value: '' };
    }
    const trimmed = input.trim();
    if (!/^\d{6}$/.test(trimmed)) {
        return { valid: false, error: 'Mã OTP phải là 6 chữ số', value: '' };
    }
    return { valid: true, value: trimmed };
}

/** Validate OTP token: must be alphanumeric, 20-64 chars */
export function validateOtpToken(input: unknown): { valid: boolean; error?: string; value: string } {
    if (typeof input !== 'string' || !input) {
        return { valid: false, error: 'Token OTP không hợp lệ', value: '' };
    }
    const trimmed = input.trim();
    if (trimmed.length < 10 || trimmed.length > 64) {
        return { valid: false, error: 'Token OTP không hợp lệ', value: '' };
    }
    if (!/^[a-zA-Z0-9_\-]+$/.test(trimmed)) {
        return { valid: false, error: 'Token OTP chứa ký tự không hợp lệ', value: '' };
    }
    return { valid: true, value: trimmed };
}

/** Validate a generic string (e.g., device ID, session ID, user ID) */
export function validateStringParam(input: unknown, name: string, minLen = 1, maxLen = 200): { valid: boolean; error?: string; value: string } {
    if (typeof input !== 'string' || !input.trim()) {
        return { valid: false, error: `${name} không được để trống`, value: '' };
    }
    const trimmed = input.trim();
    if (trimmed.length < minLen || trimmed.length > maxLen) {
        return { valid: false, error: `${name} không hợp lệ (${minLen}-${maxLen} ký tự)`, value: '' };
    }
    return { valid: true, value: trimmed };
}

/** Validate URL: must be a valid HTTP(S) URL */
export function validateUrl(input: unknown): { valid: boolean; error?: string; value: string } {
    if (typeof input !== 'string' || !input) {
        return { valid: false, error: 'URL không hợp lệ', value: '' };
    }
    try {
        const url = new URL(input.trim());
        if (!['http:', 'https:'].includes(url.protocol)) {
            return { valid: false, error: 'Chỉ hỗ trợ HTTP/HTTPS URL', value: '' };
        }
        return { valid: true, value: url.toString() };
    } catch {
        return { valid: false, error: 'URL không hợp lệ', value: '' };
    }
}

/** Check if a Matrix user ID is valid format (@localpart:domain) */
export function validateMatrixUserId(input: unknown): { valid: boolean; error?: string; value: string } {
    if (typeof input !== 'string' || !input) {
        return { valid: false, error: 'User ID không hợp lệ', value: '' };
    }
    const trimmed = input.trim();
    if (!/^@[a-zA-Z0-9._=\-/]+:[a-zA-Z0-9.\-]+$/.test(trimmed)) {
        return { valid: false, error: 'User ID phải có dạng @user:domain', value: '' };
    }
    return { valid: true, value: trimmed };
}

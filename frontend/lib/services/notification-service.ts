/**
 * PieChat Platform Notification Adapter
 * 
 * Provides a unified notification API across:
 * - Web (Notification API)
 * - Desktop (Tauri notification plugin)
 * - Mobile (Capacitor local notifications)
 * - PWA (Notification API + Service Worker)
 */

import { getConfig } from '../config';

interface NotificationPayload {
    title: string;
    body?: string;
    icon?: string;
    tag?: string;
    data?: Record<string, unknown>;
}

/**
 * Send a notification using the appropriate platform API.
 */
export async function sendNotification(payload: NotificationPayload): Promise<void> {
    const { platform } = getConfig();

    switch (platform) {
        case 'desktop':
            return sendTauriNotification(payload);
        case 'mobile':
            return sendCapacitorNotification(payload);
        default:
            return sendWebNotification(payload);
    }
}

/**
 * Request notification permission for the current platform.
 */
export async function requestNotificationPermission(): Promise<boolean> {
    const { platform } = getConfig();

    if (platform === 'desktop') {
        // Tauri handles permissions at OS level
        return true;
    }

    if (typeof window === 'undefined' || !('Notification' in window)) {
        return false;
    }

    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;

    const permission = await Notification.requestPermission();
    return permission === 'granted';
}

// ─── Web Notifications ──────────────────────────────────

async function sendWebNotification(payload: NotificationPayload): Promise<void> {
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    if (Notification.permission === 'granted') {
        new Notification(payload.title, {
            body: payload.body,
            icon: payload.icon || '/PieChatIcon.png',
            tag: payload.tag,
            data: payload.data,
        });
    } else if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            new Notification(payload.title, {
                body: payload.body,
                icon: payload.icon || '/PieChatIcon.png',
                tag: payload.tag,
                data: payload.data,
            });
        }
    }
}

// ─── Tauri Desktop Notifications ────────────────────────

async function sendTauriNotification(payload: NotificationPayload): Promise<void> {
    try {
        // @ts-ignore — Module available only in Tauri environment
        const { sendNotification: tauriNotify } = await import('@tauri-apps/plugin-notification');
        await tauriNotify({ title: payload.title, body: payload.body });
    } catch {
        // Fallback to web notification
        return sendWebNotification(payload);
    }
}

// ─── Capacitor Mobile Notifications ─────────────────────

async function sendCapacitorNotification(payload: NotificationPayload): Promise<void> {
    try {
        // @ts-ignore — Module available only in Capacitor environment
        const { LocalNotifications } = await import('@capacitor/local-notifications');
        await LocalNotifications.schedule({
            notifications: [{
                title: payload.title,
                body: payload.body || '',
                id: Date.now(),
                extra: payload.data,
            }],
        });
    } catch {
        // Fallback to web notification
        return sendWebNotification(payload);
    }
}

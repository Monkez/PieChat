'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { Message } from '@/lib/services/matrix-service';

interface NotificationItem {
  id: string;
  type: 'reminder' | 'poll_expired' | 'poll_locked';
  title: string;
  body: string;
  deadline: number;
  roomId: string;
}

// Track which message IDs we've already notified
let _notifiedMessageIds = new Set<string>();
const MAX_NOTIFIED = 500;

// Request notification permission
export function requestNotificationPermission() {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

// Show a browser notification (via SW if available)
async function showNotification(title: string, body: string, options?: {
  icon?: string;
  tag?: string;
  data?: Record<string, unknown>;
  silent?: boolean;
}) {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    // Try service worker notification first
    const sw = await navigator.serviceWorker?.ready;
    if (sw) {
      await sw.showNotification(title, {
        body,
        icon: options?.icon || '/PieChatIcon.png',
        badge: '/PieChatIcon.png',
        tag: options?.tag || `piechat-${Date.now()}`,
        data: options?.data,
        silent: options?.silent,
        requireInteraction: false,
      });
    } else {
      const n = new Notification(title, {
        body,
        icon: options?.icon || '/PieChatIcon.png',
        tag: options?.tag || `piechat-${Date.now()}`,
        silent: options?.silent,
      });
      setTimeout(() => n.close(), 8000);
    }
  } catch {
    // Fallback
    try {
      const n = new Notification(title, {
        body,
        icon: options?.icon || '/PieChatIcon.png',
        tag: options?.tag || `piechat-${Date.now()}`,
        silent: options?.silent,
      });
      setTimeout(() => n.close(), 8000);
    } catch { /* ignore */ }
  }
}

// Play a synthesized notification chime (no file needed)
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const playTone = (freq: number, startTime: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };
    const now = ctx.currentTime;
    playTone(880, now, 0.15);        // A5
    playTone(1174.66, now + 0.12, 0.2); // D6
    setTimeout(() => ctx.close(), 500);
  } catch {
    // Audio not available
  }
}

// In-app toast notification
function showToast(title: string, body: string) {
  // Create toast container if not exists
  let container = document.getElementById('piechat-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'piechat-toast-container';
    container.style.cssText = 'position:fixed;top:16px;right:16px;z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.style.cssText = `
    pointer-events:auto;
    max-width:320px;
    padding:12px 16px;
    border-radius:12px;
    background:white;
    border:1px solid rgba(0,0,0,0.08);
    box-shadow:0 8px 32px rgba(0,0,0,0.12);
    transform:translateX(120%);
    transition:all 0.3s cubic-bezier(0.4,0,0.2,1);
    font-family:inherit;
    cursor:pointer;
  `;
  toast.innerHTML = `
    <div style="display:flex;align-items:flex-start;gap:10px">
      <span style="font-size:20px;line-height:1">🔔</span>
      <div>
        <p style="font-size:13px;font-weight:700;color:#18181b;margin:0">${title}</p>
        <p style="font-size:12px;color:#71717a;margin:2px 0 0">${body}</p>
      </div>
    </div>
  `;
  toast.onclick = () => {
    toast.style.transform = 'translateX(120%)';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  };

  container.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.style.transform = 'translateX(0)';
    });
  });

  // Auto remove after 6s
  setTimeout(() => {
    toast.style.transform = 'translateX(120%)';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 6000);
}

// The notification storage key
const STORAGE_KEY = 'piechat_notifications';
const FIRED_KEY = 'piechat_notifications_fired';

// Get pending notifications from localStorage
function getPendingNotifications(): NotificationItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// Save pending notifications
function savePendingNotifications(items: NotificationItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

// Get fired notification IDs
function getFiredIds(): Set<string> {
  try {
    const raw = localStorage.getItem(FIRED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

// Mark as fired
function markFired(id: string) {
  const fired = getFiredIds();
  fired.add(id);
  // Keep only last 200 IDs
  const arr = Array.from(fired).slice(-200);
  localStorage.setItem(FIRED_KEY, JSON.stringify(arr));
}

// Schedule a notification
export function scheduleNotification(item: NotificationItem) {
  const items = getPendingNotifications();
  // Avoid duplicates
  if (items.some(n => n.id === item.id)) return;
  items.push(item);
  savePendingNotifications(items);
}

// Schedule a reminder notification
export function scheduleReminderNotification(reminderId: string, title: string, deadline: number, roomId: string) {
  scheduleNotification({
    id: `reminder-${reminderId}`,
    type: 'reminder',
    title: '⏰ Nhắc hẹn',
    body: title,
    deadline,
    roomId,
  });
}

// Schedule poll expiry notification
export function schedulePollExpiryNotification(pollId: string, question: string, deadline: number, roomId: string) {
  scheduleNotification({
    id: `poll-expire-${pollId}`,
    type: 'poll_expired',
    title: '📊 Bình chọn đã kết thúc',
    body: question,
    deadline,
    roomId,
  });
}

// React hook for the notification checker
export function useChatNotifications() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkNotifications = useCallback(() => {
    const items = getPendingNotifications();
    const now = Date.now();
    const fired = getFiredIds();
    const remaining: NotificationItem[] = [];

    for (const item of items) {
      if (fired.has(item.id)) continue;

      if (item.deadline <= now) {
        // Fire!
        showNotification(item.title, item.body);
        showToast(item.title, item.body);
        playNotificationSound();
        markFired(item.id);
      } else {
        remaining.push(item);
      }
    }

    savePendingNotifications(remaining);
  }, []);

  useEffect(() => {
    // Request permission on mount
    requestNotificationPermission();

    // Check every 5 seconds
    intervalRef.current = setInterval(checkNotifications, 5000);
    // Also check immediately
    checkNotifications();

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [checkNotifications]);
}

// ─── New Message Notifications ──────────────────────────

function isDocumentVisible(): boolean {
  if (typeof document === 'undefined') return true;
  return document.visibilityState === 'visible' && document.hasFocus();
}

function getMessageBody(msg: Message): string {
  if (msg.msgtype === 'm.image') return '🖼️ Đã gửi hình ảnh';
  if (msg.msgtype === 'm.video') return '🎬 Đã gửi video';
  if (msg.msgtype === 'm.audio') return '🎤 Tin nhắn thoại';
  if (msg.msgtype === 'm.file') return `📎 ${msg.fileName || 'Tệp đính kèm'}`;
  if (msg.msgtype === 'io.piechat.folder') return `📁 ${msg.fileName || 'Thư mục'}`;
  if (msg.msgtype === 'io.piechat.sticker') return '🎨 Sticker';
  if (msg.msgtype === 'io.piechat.poll') return '📊 Bình chọn mới';
  if (msg.msgtype === 'io.piechat.reminder') return '⏰ Nhắc hẹn mới';
  if (msg.msgtype === 'io.piechat.contact') return '📇 Danh thiếp';
  const text = msg.content || '';
  return text.length > 100 ? text.slice(0, 97) + '...' : text;
}

/**
 * Notify user about new messages.
 * Call this after each message poll with the new messages.
 * Only notifies when tab is not focused.
 */
export function notifyNewMessages(
  newMessages: Message[],
  currentUserId: string,
  activeRoomId: string | null,
  resolveUserName: (userId: string) => string,
  resolveRoomName: (roomId: string) => string,
): void {
  if (typeof window === 'undefined') return;

  const canUseBrowserNotif = 'Notification' in window && Notification.permission === 'granted';

  for (const msg of newMessages) {
    // Skip own messages
    if (msg.senderId === currentUserId) continue;
    // Skip temp messages
    if (msg.id.startsWith('temp-')) continue;
    // Skip vote messages  
    if (msg.msgtype === 'io.piechat.poll.vote') continue;
    // Skip already notified
    if (_notifiedMessageIds.has(msg.id)) continue;
    _notifiedMessageIds.add(msg.id);

    // Trim tracked IDs
    if (_notifiedMessageIds.size > MAX_NOTIFIED) {
      const arr = Array.from(_notifiedMessageIds);
      _notifiedMessageIds = new Set(arr.slice(-200));
    }

    // Only notify if tab is not focused OR message is from different room
    if (isDocumentVisible() && msg.roomId === activeRoomId) continue;

    const senderName = resolveUserName(msg.senderId);
    const roomName = resolveRoomName(msg.roomId);
    const body = getMessageBody(msg);

    // Browser notification (only works on HTTPS / localhost)
    if (canUseBrowserNotif && !isDocumentVisible()) {
      showNotification(`${senderName} • ${roomName}`, body, {
        tag: `room-${msg.roomId}`,
        data: {
          url: `/chat/${encodeURIComponent(msg.roomId)}`,
          roomId: msg.roomId,
        },
      });
    }

    // Always show in-app toast + sound (works on HTTP too)
    showToast(`${senderName} • ${roomName}`, body);
    playNotificationSound();
  }
}

/**
 * Seed the notified message IDs set so that existing messages
 * loaded on first render don't trigger notifications.
 */
export function seedNotifiedMessageIds(messageIds: string[]): void {
  for (const id of messageIds) {
    _notifiedMessageIds.add(id);
  }
}

/**
 * Init Capacitor local notifications (if available)
 */
export async function initCapacitorNotifications(): Promise<void> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return;

    // @ts-ignore — optional dependency, only available in Capacitor builds
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const perms = await LocalNotifications.requestPermissions();
    if (perms.display !== 'granted') return;

    // Handle notification tap
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await LocalNotifications.addListener('localNotificationActionPerformed', (action: any) => {
      const url = action.notification.extra?.url as string;
      if (url && typeof window !== 'undefined') {
        window.location.href = url;
      }
    });
  } catch {
    // Capacitor not available (web)
  }
}

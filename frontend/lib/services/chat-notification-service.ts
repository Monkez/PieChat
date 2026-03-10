'use client';

import { useEffect, useRef, useCallback } from 'react';

interface NotificationItem {
  id: string;
  type: 'reminder' | 'poll_expired' | 'poll_locked';
  title: string;
  body: string;
  deadline: number;
  roomId: string;
}

// Request notification permission
export function requestNotificationPermission() {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

// Show a browser notification
function showNotification(title: string, body: string, icon?: string) {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window)) return;

  if (Notification.permission === 'granted') {
    const n = new Notification(title, {
      body,
      icon: icon || '/icon.svg',
      badge: '/icon.svg',
      tag: `piechat-${Date.now()}`,
      requireInteraction: false,
    });
    // Auto-close after 8s
    setTimeout(() => n.close(), 8000);
  }
}

// Play a notification sound
function playNotificationSound() {
  try {
    const audio = new Audio('/notification.mp3');
    audio.volume = 0.5;
    audio.play().catch(() => {});
  } catch {
    // Ignore audio errors
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

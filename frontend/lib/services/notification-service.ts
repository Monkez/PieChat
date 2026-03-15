// ─── Notification Service ─────────────────────────────────────
// Stores and manages system notifications in localStorage

export interface AppNotification {
  id: string;
  type: 'system' | 'mention' | 'pin' | 'friend' | 'admin' | 'alert';
  title: string;
  body: string;
  timestamp: number;
  read: boolean;
  icon?: string;        // emoji
  roomId?: string;      // for navigation
  senderId?: string;
  data?: Record<string, unknown>;
}

const STORAGE_KEY = 'piechat_notifications';
const MAX_NOTIFICATIONS = 200;

function loadAll(): AppNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAll(items: AppNotification[]) {
  // Keep only the most recent MAX_NOTIFICATIONS
  const trimmed = items.slice(0, MAX_NOTIFICATIONS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

export const notificationService = {
  getAll(): AppNotification[] {
    return loadAll();
  },

  getUnreadCount(): number {
    return loadAll().filter(n => !n.read).length;
  },

  add(notification: Omit<AppNotification, 'id' | 'timestamp' | 'read'>): AppNotification {
    const item: AppNotification = {
      ...notification,
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      read: false,
    };
    const items = loadAll();
    items.unshift(item);
    saveAll(items);
    return item;
  },

  markAsRead(id: string) {
    const items = loadAll();
    const item = items.find(n => n.id === id);
    if (item) {
      item.read = true;
      saveAll(items);
    }
  },

  markAllAsRead() {
    const items = loadAll();
    items.forEach(n => { n.read = true; });
    saveAll(items);
  },

  remove(id: string) {
    const items = loadAll().filter(n => n.id !== id);
    saveAll(items);
  },

  clearAll() {
    localStorage.removeItem(STORAGE_KEY);
  },

  // Add a system announcement (typically from admin broadcast)
  addSystemAnnouncement(title: string, body: string, senderId?: string): AppNotification {
    return this.add({
      type: 'system',
      title,
      body,
      icon: '📢',
      senderId,
    });
  },

  // Add mention notification
  addMention(roomId: string, senderName: string, content: string): AppNotification {
    return this.add({
      type: 'mention',
      title: `${senderName} đã nhắc đến bạn`,
      body: content.slice(0, 100),
      icon: '💬',
      roomId,
    });
  },

  // Add admin alert
  addAlert(title: string, body: string): AppNotification {
    return this.add({
      type: 'alert',
      title,
      body,
      icon: '⚠️',
    });
  },
};

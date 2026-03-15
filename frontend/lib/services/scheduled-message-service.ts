// ─── Scheduled Messages Service ──────────────────────────
// Stores scheduled messages in localStorage, checks every minute

export interface ScheduledMessage {
  id: string;
  roomId: string;
  content: string;
  scheduledAt: number; // timestamp when to send
  createdAt: number;
  type: 'text' | 'disappearing';
  ttlMs?: number; // for disappearing messages
}

const STORAGE_KEY = 'piechat_scheduled_messages';

function loadAll(): ScheduledMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAll(items: ScheduledMessage[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export const scheduledMessageService = {
  getAll(): ScheduledMessage[] {
    return loadAll();
  },

  getForRoom(roomId: string): ScheduledMessage[] {
    return loadAll().filter(m => m.roomId === roomId);
  },

  add(msg: Omit<ScheduledMessage, 'id' | 'createdAt'>): ScheduledMessage {
    const item: ScheduledMessage = {
      ...msg,
      id: `sched-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
    };
    const items = loadAll();
    items.push(item);
    saveAll(items);
    return item;
  },

  remove(id: string) {
    const items = loadAll().filter(m => m.id !== id);
    saveAll(items);
  },

  // Get messages that are due to be sent
  getDueMessages(): ScheduledMessage[] {
    const now = Date.now();
    return loadAll().filter(m => m.scheduledAt <= now);
  },

  // After sending, remove from storage
  markSent(id: string) {
    this.remove(id);
  },

  getCount(): number {
    return loadAll().length;
  },
};

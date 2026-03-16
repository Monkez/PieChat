'use client';

import { useState, useEffect } from 'react';
import { Bell, BellOff, Check, CheckCheck, Trash2, ArrowLeft, Megaphone, AtSign, Pin, UserPlus, ShieldAlert, AlertTriangle } from 'lucide-react';
import { notificationService, AppNotification } from '@/lib/services/notification-service';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const typeConfig: Record<AppNotification['type'], { icon: typeof Bell; color: string; bg: string; label: string }> = {
  system:  { icon: Megaphone,     color: 'text-sky-600 dark:text-sky-400',     bg: 'bg-sky-100 dark:bg-sky-900/30',     label: 'Hệ thống' },
  mention: { icon: AtSign,        color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-100 dark:bg-violet-900/30', label: 'Nhắc đến' },
  pin:     { icon: Pin,           color: 'text-amber-600 dark:text-amber-400',  bg: 'bg-amber-100 dark:bg-amber-900/30',  label: 'Ghim' },
  friend:  { icon: UserPlus,      color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30', label: 'Bạn bè' },
  admin:   { icon: ShieldAlert,   color: 'text-rose-600 dark:text-rose-400',   bg: 'bg-rose-100 dark:bg-rose-900/30',   label: 'Quản trị' },
  alert:   { icon: AlertTriangle, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/30', label: 'Cảnh báo' },
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Vừa xong';
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ngày trước`;
  return new Date(ts).toLocaleDateString('vi-VN');
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [filter, setFilter] = useState<'all' | AppNotification['type']>('all');

  useEffect(() => {
    setNotifications(notificationService.getAll());
  }, []);

  const filteredNotifications = filter === 'all'
    ? notifications
    : notifications.filter(n => n.type === filter);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleMarkAllRead = () => {
    notificationService.markAllAsRead();
    setNotifications(notificationService.getAll());
  };

  const handleMarkRead = (id: string) => {
    notificationService.markAsRead(id);
    setNotifications(notificationService.getAll());
  };

  const handleDelete = (id: string) => {
    notificationService.remove(id);
    setNotifications(notificationService.getAll());
  };

  const handleClearAll = () => {
    if (!confirm('Xóa toàn bộ thông báo?')) return;
    notificationService.clearAll();
    setNotifications([]);
  };

  return (
    <div className="flex h-full flex-col bg-white dark:bg-zinc-950">
      {/* Header */}
      <div className="border-b border-zinc-100 dark:border-zinc-800 px-4 lg:px-6" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        {/* PieChat Logo */}
        <div className="flex items-center gap-2 mb-3 lg:hidden">
          <Link href="/chat">
            <span className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 bg-clip-text text-transparent">PieChat</span>
          </Link>
        </div>
        <div className="flex items-center justify-between pb-3">
          <div className="flex items-center gap-3">
            <Link href="/chat" className="lg:hidden rounded-full p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-200/30 dark:shadow-amber-900/20">
                <Bell className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Thông báo</h1>
                {unreadCount > 0 && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">{unreadCount} chưa đọc</p>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1.5 rounded-lg bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-600 hover:bg-sky-100 dark:bg-sky-900/20 dark:text-sky-400 dark:hover:bg-sky-900/30 transition-colors"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Đọc tất cả
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={handleClearAll}
                className="flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-400 dark:hover:bg-rose-900/30 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Xóa hết
              </button>
            )}
          </div>
        </div>

        {/* Filter tabs */}
        <div className="mt-3 flex gap-1.5 overflow-x-auto scrollbar-none">
          {(['all', 'system', 'mention', 'admin', 'alert', 'friend', 'pin'] as const).map((f) => {
            const isActive = filter === f;
            const label = f === 'all' ? 'Tất cả' : typeConfig[f].label;
            const count = f === 'all' ? notifications.length : notifications.filter(n => n.type === f).length;
            if (f !== 'all' && count === 0) return null;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                  isActive
                    ? 'bg-sky-500 text-white shadow-md'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                )}
              >
                {label} {count > 0 && `(${count})`}
              </button>
            );
          })}
        </div>
      </div>

      {/* Notification List */}
      <div className="flex-1 overflow-y-auto">
        {filteredNotifications.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center p-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 mb-4">
              <BellOff className="h-8 w-8 text-zinc-300 dark:text-zinc-600" />
            </div>
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Không có thông báo</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Các thông báo mới sẽ hiển thị ở đây</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-50 dark:divide-zinc-800/50">
            {filteredNotifications.map((notif) => {
              const config = typeConfig[notif.type];
              const Icon = config.icon;
              return (
                <div
                  key={notif.id}
                  className={cn(
                    'flex items-start gap-3 px-4 py-3.5 lg:px-6 transition-colors group',
                    !notif.read
                      ? 'bg-sky-50/50 dark:bg-sky-900/5 hover:bg-sky-50 dark:hover:bg-sky-900/10'
                      : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/30'
                  )}
                >
                  {/* Icon */}
                  <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', config.bg)}>
                    <Icon className={cn('h-5 w-5', config.color)} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className={cn('text-sm font-semibold', !notif.read ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-700 dark:text-zinc-300')}>
                          {notif.icon && <span className="mr-1">{notif.icon}</span>}
                          {notif.title}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">{notif.body}</p>
                      </div>
                      <span className="shrink-0 text-[10px] text-zinc-400 dark:text-zinc-500 font-medium whitespace-nowrap mt-0.5">
                        {timeAgo(notif.timestamp)}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {notif.roomId && (
                        <Link
                          href={`/chat/${encodeURIComponent(notif.roomId)}`}
                          className="text-[10px] font-semibold text-sky-600 dark:text-sky-400 hover:underline"
                        >
                          Đi đến →
                        </Link>
                      )}
                      {!notif.read && (
                        <button
                          onClick={() => handleMarkRead(notif.id)}
                          className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-0.5"
                        >
                          <Check className="h-3 w-3" /> Đã đọc
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(notif.id)}
                        className="text-[10px] font-semibold text-rose-500 hover:underline flex items-center gap-0.5"
                      >
                        <Trash2 className="h-3 w-3" /> Xóa
                      </button>
                    </div>
                  </div>

                  {/* Unread dot */}
                  {!notif.read && (
                    <div className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-sky-500" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

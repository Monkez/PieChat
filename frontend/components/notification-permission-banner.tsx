'use client';

import { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function NotificationPermissionBanner() {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    // Don't show if already granted or denied
    if (Notification.permission !== 'default') return;
    // Don't show if dismissed this session
    const dismissedTime = sessionStorage.getItem('piechat_notif_dismissed');
    if (dismissedTime) return;
    
    // Show after a short delay
    const timer = setTimeout(() => setShow(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  if (!show || dismissed) return null;

  const handleAllow = async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setShow(false);
      } else {
        setDismissed(true);
        sessionStorage.setItem('piechat_notif_dismissed', '1');
      }
    } catch {
      setDismissed(true);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('piechat_notif_dismissed', '1');
  };

  return (
    <div className={cn(
      "fixed bottom-20 left-1/2 -translate-x-1/2 z-[200] w-[90vw] max-w-md",
      "animate-in slide-in-from-bottom-4 fade-in duration-300"
    )}>
      <div className="flex items-center gap-3 rounded-2xl bg-white/95 px-4 py-3 shadow-2xl ring-1 ring-black/10 backdrop-blur-xl dark:bg-zinc-800/95 dark:ring-white/10">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-100 dark:bg-sky-900/30">
          <Bell className="h-5 w-5 text-sky-600 dark:text-sky-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Bật thông báo
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Nhận thông báo khi có tin nhắn mới
          </p>
        </div>
        <button
          onClick={handleAllow}
          className="shrink-0 rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-600 active:scale-95 transition-all shadow-sm"
        >
          Cho phép
        </button>
        <button
          onClick={handleDismiss}
          className="shrink-0 rounded-full p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { AlarmClock, Bell, BellOff, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ReminderInfo {
  reminderId: string;
  title: string;
  deadline: number;
  creatorId: string;
}

interface ReminderCardProps {
  reminder: ReminderInfo;
  isMe: boolean;
}

export function ReminderCard({ reminder, isMe }: ReminderCardProps) {
  const [timeLeft, setTimeLeft] = useState('');
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    const tick = () => {
      const remaining = reminder.deadline - Date.now();
      if (remaining <= 0) {
        setIsExpired(true);
        setTimeLeft('Đã đến hẹn!');
        return;
      }
      const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
      const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((remaining % (1000 * 60)) / 1000);
      if (days > 0) setTimeLeft(`Còn ${days} ngày ${hours}h`);
      else if (hours > 0) setTimeLeft(`Còn ${hours}h ${mins} phút`);
      else if (mins > 0) setTimeLeft(`Còn ${mins} phút ${secs}s`);
      else setTimeLeft(`Còn ${secs}s`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [reminder.deadline]);

  const deadlineDate = new Date(reminder.deadline);
  const formattedTime = deadlineDate.toLocaleString('vi-VN', {
    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit'
  });

  return (
    <div className={cn(
      "w-full rounded-xl overflow-hidden",
      !isMe && "bg-zinc-50 dark:bg-zinc-800/50"
    )}>
      <div className="p-3">
        {/* Header */}
        <div className="flex items-start gap-2.5">
          <div className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all",
            isExpired
              ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
              : "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 animate-pulse"
          )}>
            {isExpired ? <Check className="h-4.5 w-4.5" /> : <AlarmClock className="h-4.5 w-4.5" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              {isExpired ? '⏰ Nhắc hẹn đã đến' : '🔔 Nhắc hẹn'}
            </p>
            <p className="mt-0.5 text-sm font-bold text-zinc-900 dark:text-zinc-100 leading-snug">
              {reminder.title}
            </p>
          </div>
        </div>

        {/* Time info */}
        <div className="mt-2.5 flex items-center gap-2">
          <div className={cn(
            "flex-1 flex items-center gap-2 rounded-lg px-2.5 py-1.5",
            isExpired
              ? "bg-emerald-50 dark:bg-emerald-900/20"
              : "bg-amber-50 dark:bg-amber-900/20"
          )}>
            {isExpired
              ? <BellOff className="h-3 w-3 text-emerald-500 shrink-0" />
              : <Bell className="h-3 w-3 text-amber-500 shrink-0 animate-bounce" />
            }
            <span className={cn(
              "text-[11px] font-semibold",
              isExpired ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"
            )}>
              {timeLeft}
            </span>
          </div>
          <span className="text-[10px] text-zinc-400 shrink-0">
            {formattedTime}
          </span>
        </div>
      </div>
    </div>
  );
}

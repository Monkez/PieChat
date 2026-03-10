'use client';

import { useState } from 'react';
import { UserPlus, Phone, MessageSquare, ExternalLink, Loader2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';

export interface ContactCardData {
  phone: string;
  displayName?: string;
  userId?: string;
  avatarUrl?: string;
}

interface ContactCardProps {
  contact: ContactCardData;
  isMe: boolean;
  onAddFriend?: (userId: string) => void;
  onCall?: (userId: string) => void;
  onMessage?: (userId: string) => void;
}

export function ContactCard({ contact, isMe, onAddFriend, onCall, onMessage }: ContactCardProps) {
  const [addFriendStatus, setAddFriendStatus] = useState<'idle' | 'loading' | 'done'>('idle');
  const displayName = contact.displayName || contact.phone;
  const initials = displayName.charAt(0).toUpperCase();

  const handleAddFriend = async () => {
    if (!contact.userId || addFriendStatus !== 'idle') return;
    setAddFriendStatus('loading');
    try {
      onAddFriend?.(contact.userId);
      setAddFriendStatus('done');
    } catch {
      setAddFriendStatus('idle');
    }
  };

  return (
    <div className={cn(
      "w-[280px] overflow-hidden rounded-2xl shadow-lg transition-all hover:shadow-xl",
      isMe ? "bg-gradient-to-br from-sky-700 to-indigo-700" : "bg-gradient-to-br from-white to-zinc-50 dark:from-zinc-800 dark:to-zinc-900 border border-zinc-200 dark:border-zinc-700"
    )}>
      {/* Header gradient strip */}
      <div className={cn(
        "h-16 relative overflow-hidden",
        isMe
          ? "bg-gradient-to-r from-sky-500/30 to-indigo-500/30"
          : "bg-gradient-to-r from-sky-100 to-indigo-100 dark:from-sky-900/30 dark:to-indigo-900/30"
      )}>
        <div className="absolute inset-0 opacity-20">
          <div className="absolute -top-4 -right-4 h-20 w-20 rounded-full bg-white/20" />
          <div className="absolute -bottom-6 -left-6 h-24 w-24 rounded-full bg-white/10" />
        </div>
        {/* Label */}
        <div className={cn(
          "absolute top-2 left-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest",
          isMe ? "text-sky-200/80" : "text-sky-600/70 dark:text-sky-400/70"
        )}>
          <ExternalLink className="h-3 w-3" />
          Danh thiếp
        </div>
      </div>

      {/* Avatar overlapping header */}
      <div className="relative -mt-8 px-4">
        <div className={cn(
          "inline-flex h-14 w-14 items-center justify-center rounded-2xl text-xl font-bold shadow-lg ring-3",
          isMe
            ? "bg-white text-sky-700 ring-sky-700/30"
            : "bg-sky-500 text-white ring-white dark:ring-zinc-800"
        )}>
          {initials}
        </div>
      </div>

      {/* Info */}
      <div className="px-4 pt-2 pb-3">
        <h4 className={cn(
          "text-sm font-bold truncate",
          isMe ? "text-white" : "text-zinc-900 dark:text-zinc-50"
        )}>
          {displayName}
        </h4>
        <p className={cn(
          "text-xs font-medium mt-0.5",
          isMe ? "text-sky-200" : "text-zinc-500 dark:text-zinc-400"
        )}>
          📱 {contact.phone}
        </p>
      </div>

      {/* Action buttons */}
      <div className={cn(
        "flex items-center gap-1.5 px-3 pb-3",
      )}>
        {contact.userId && (
          <>
            <button
              onClick={handleAddFriend}
              disabled={addFriendStatus !== 'idle'}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[11px] font-bold transition-all active:scale-95",
                addFriendStatus === 'done'
                  ? (isMe
                    ? "bg-emerald-500/30 text-emerald-200 cursor-default"
                    : "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 cursor-default")
                  : (isMe
                    ? "bg-white/15 text-white hover:bg-white/25"
                    : "bg-sky-50 text-sky-600 hover:bg-sky-100 dark:bg-sky-900/20 dark:text-sky-400 dark:hover:bg-sky-900/40")
              )}
            >
              {addFriendStatus === 'loading' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : addFriendStatus === 'done' ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <UserPlus className="h-3.5 w-3.5" />
              )}
              {addFriendStatus === 'done' ? 'Đã gửi' : 'Kết bạn'}
            </button>

            <button
              onClick={() => onCall?.(contact.userId!)}
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all active:scale-95",
                isMe
                  ? "bg-white/15 text-white hover:bg-white/25"
                  : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400"
              )}
              title="Gọi"
            >
              <Phone className="h-3.5 w-3.5" />
            </button>

            <button
              onClick={() => onMessage?.(contact.userId!)}
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all active:scale-95",
                isMe
                  ? "bg-white/15 text-white hover:bg-white/25"
                  : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-400"
              )}
              title="Nhắn tin"
            >
              <MessageSquare className="h-3.5 w-3.5" />
            </button>
          </>
        )}

        {!contact.userId && (
          <a
            href={`tel:${contact.phone}`}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[11px] font-bold transition-all active:scale-95",
              isMe
                ? "bg-white/15 text-white hover:bg-white/25"
                : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400"
            )}
          >
            <Phone className="h-3.5 w-3.5" />
            Gọi {contact.phone}
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Phone Detection ────────────────────────────────────
// Detect Vietnamese and international phone numbers
const PHONE_REGEX = /(?:(?:\+84|0)(?:\d[\s.-]?){8,9}\d)|(?:\+\d{1,4}[\s.-]?(?:\d[\s.-]?){6,12}\d)/g;

export function detectPhoneNumbers(text: string): ContactCardData[] {
  const matches = text.match(PHONE_REGEX);
  if (!matches) return [];

  return matches.map(raw => {
    const phone = raw.replace(/[\s.-]/g, '');
    return { phone };
  });
}

export function isPhoneOnlyMessage(text: string): boolean {
  const stripped = text.replace(PHONE_REGEX, '').trim();
  return stripped.length === 0 && PHONE_REGEX.test(text);
}

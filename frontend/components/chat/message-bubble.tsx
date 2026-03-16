'use client';

import { useState, useRef, useMemo, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { MoreVertical, Reply, Forward, Info, Trash2, Repeat, Download, Play, Pause, FileIcon, Copy, Pin, PinOff, Pencil, Phone, CreditCard, KeyRound, Link2, Code2, MapPin, Timer, Ban } from 'lucide-react';
import { Message } from '@/lib/services/matrix-service';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { useUiStore } from '@/lib/store/ui-store';
import { t } from '@/lib/i18n';
import { ContactCard, ContactCardData, detectPhoneNumbers, isPhoneOnlyMessage } from './contact-card';
import { PollCard, PollInfo, PollVote } from './poll-card';
import { ReminderCard, ReminderInfo } from './reminder-card';
import { LinkPreviews } from './link-preview';
import WidgetMessage from './widget-message';

interface MessageBubbleProps {
  message: Message;
  isMe: boolean;
  senderName: string;
  isFirst: boolean;
  searchQuery?: string;
  activeMenuId: string | null;
  setActiveMenuId: (id: string | null) => void;
  onReaction: (msgId: string, emoji: string) => void;
  onMenuAction: (action: 'reply' | 'forward' | 'details' | 'delete' | 'edit' | 'pin' | 'recall', msg: Message) => void;
  onRetry: (msgId: string) => void;
  getStatusLabel: (status: Message['status']) => string;
  onContactAddFriend?: (userId: string) => void;
  onContactCall?: (userId: string) => void;
  onContactMessage?: (userId: string) => void;
  resolveUserByPhone?: (phone: string) => ContactCardData | null;
  onPollVote?: (pollId: string, eventId: string, optionIds: string[]) => void;
  currentUserId?: string;
  pollVotes?: Record<string, PollVote[]>;
  onButtonClick?: (msgId: string, buttonId: string, label: string) => void;
  onWidgetAction?: (msgId: string, action: string, data: unknown) => void;
  onAvatarClick?: (userId: string) => void;
  senderRole?: 'leader' | 'deputy' | 'member' | null;
  isPinned?: boolean;
  onPinMessage?: (msgId: string) => void;
  onUnpinMessage?: (msgId: string) => void;
}

const REACTION_ICONS: Record<string, string> = {
  '⭐': '/emojis/star.png',
  '❤️': '/emojis/love.png',
  '😍': '/emojis/love-eye.png',
  '😂': '/emojis/happy.png',
  '😢': '/emojis/sad.png',
  '😭': '/emojis/cry.png',
  '😡': '/emojis/angry.png',
};

// ─── Voice Player Sub-component ───────────────────────
function VoicePlayer({ url, duration, isMe }: { url: string; duration?: number; isMe: boolean }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrent] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration ? duration / 1000 : 0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const togglePlay = () => {
    if (!audioRef.current) {
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.addEventListener('timeupdate', () => setCurrent(audio.currentTime));
      audio.addEventListener('loadedmetadata', () => {
        if (audio.duration && isFinite(audio.duration)) setTotalDuration(audio.duration);
      });
      audio.addEventListener('ended', () => { setIsPlaying(false); setCurrent(0); });
    }
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !progressRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    audioRef.current.currentTime = x * (totalDuration || 1);
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `voice_${Date.now()}.ogg`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(blobUrl); a.remove(); }, 100);
    } catch { window.open(url, '_blank'); }
  };

  const formatTime = (s: number) => {
    const mm = Math.floor(s / 60).toString().padStart(2, '0');
    const ss = Math.floor(s % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  };

  const progress = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  return (
    <div className="flex items-center gap-3 min-w-[200px]">
      <button
        onClick={togglePlay}
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all active:scale-95",
          isMe
            ? "bg-sky-200 text-sky-700 hover:bg-sky-300 dark:bg-sky-800/40 dark:text-sky-300"
            : "bg-sky-100 text-sky-600 hover:bg-sky-200 dark:bg-sky-900/30 dark:text-sky-400"
        )}
      >
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
      </button>
      <div className="flex-1 space-y-1">
        <div
          ref={progressRef}
          onClick={handleSeek}
          className={cn(
            "h-1.5 w-full rounded-full cursor-pointer",
            isMe ? "bg-sky-200 dark:bg-sky-800/40" : "bg-zinc-200 dark:bg-zinc-700"
          )}
        >
          <div
            className={cn(
              "h-full rounded-full transition-all duration-100",
              isMe ? "bg-sky-600 dark:bg-sky-400" : "bg-sky-500"
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className={cn("flex justify-between text-[10px] font-medium", isMe ? "text-sky-600 dark:text-sky-400" : "text-zinc-400")}>
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(totalDuration)}</span>
        </div>
      </div>
      <button
        onClick={handleDownload}
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all hover:scale-110 active:scale-95",
          isMe
            ? "text-sky-600/60 hover:text-sky-600 hover:bg-sky-200/50 dark:text-sky-400/60 dark:hover:text-sky-400 dark:hover:bg-sky-800/30"
            : "text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:text-zinc-300 dark:hover:bg-zinc-700/50"
        )}
        title="Tải xuống"
      >
        <Download className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── File Attachment Sub-component ────────────────────
function FileAttachment({ msg, isMe }: { msg: Message; isMe: boolean }) {
  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getIcon = () => {
    const mime = msg.mimeType || '';
    if (mime.includes('pdf')) return '📄';
    if (mime.includes('zip') || mime.includes('rar') || mime.includes('7z')) return '📦';
    if (mime.includes('word') || mime.includes('document')) return '📝';
    if (mime.includes('sheet') || mime.includes('excel')) return '📊';
    if (mime.includes('presentation') || mime.includes('powerpoint')) return '📑';
    return '📎';
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!msg.fileUrl) return;
    try {
      const resp = await fetch(msg.fileUrl);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = msg.fileName || 'file';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
    } catch {
      // Fallback: open in new tab
      window.open(msg.fileUrl, '_blank');
    }
  };

  return (
    <button
      onClick={handleDownload}
      className={cn(
        "flex items-center gap-3 rounded-xl p-2 transition-colors min-w-[200px] text-left",
        !isMe && "bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-700/50 dark:hover:bg-zinc-700"
      )}
    >
      <div className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg",
        isMe ? "bg-sky-200/60 dark:bg-sky-800/30" : "bg-sky-100 dark:bg-sky-900/30"
      )}>
        {getIcon()}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn(
          "truncate text-sm font-medium",
          isMe ? "text-zinc-800 dark:text-zinc-100" : "text-zinc-800 dark:text-zinc-100"
        )}>
          {msg.fileName || 'File'}
        </p>
        <p className={cn(
          "text-[10px]",
          isMe ? "text-sky-600/70 dark:text-sky-400" : "text-zinc-400"
        )}>
          {formatSize(msg.fileSize)}
        </p>
      </div>
      <Download className={cn("h-4 w-4 shrink-0", isMe ? "text-sky-600/70 dark:text-sky-400" : "text-zinc-400")} />
    </button>
  );
}

// ─── Folder Attachment Sub-component ──────────────────
function FolderAttachment({ msg, isMe }: { msg: Message; isMe: boolean }) {
  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const folderName = msg.fileName || 'Thư mục';
  const fileCount = msg.duration || 0;
  const totalSize = msg.fileSize || 0;
  const isUploading = msg.status === 'sending';
  const progress = msg.uploadProgress || 0;

  const handleDownload = async () => {
    if (!msg.fileUrl) return;
    try {
      const resp = await fetch(msg.fileUrl);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${folderName}.zip`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
    } catch {
      window.open(msg.fileUrl, '_blank');
    }
  };

  return (
    <div
      onClick={msg.fileUrl && !isUploading ? handleDownload : undefined}
      className={cn(
        "flex flex-col rounded-xl transition-colors min-w-[200px] overflow-hidden",
        msg.fileUrl && !isUploading && "cursor-pointer",
        !isMe && "bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-700/50 dark:hover:bg-zinc-700"
      )}
    >
      <div className="flex items-center gap-3 p-2">
        <div className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl",
          isMe ? "bg-sky-200/60 dark:bg-sky-800/30" : "bg-amber-100 dark:bg-amber-900/30",
          isUploading && "animate-pulse"
        )}>
          📁
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn(
            "truncate text-sm font-semibold",
            isMe ? "text-zinc-800 dark:text-zinc-100" : "text-zinc-800 dark:text-zinc-100"
          )}>
            {folderName}
          </p>
          <p className={cn(
            "text-[11px]",
            isMe ? "text-sky-600/70 dark:text-sky-400" : "text-zinc-400"
          )}>
            {isUploading
              ? (progress < 50 ? `Đang nén... ${progress}%` : `Đang tải lên... ${progress}%`)
              : (<>{fileCount > 0 ? `${fileCount} tệp` : ''}{fileCount > 0 && totalSize > 0 ? ' · ' : ''}{totalSize > 0 ? formatSize(totalSize) : ''}</>)
            }
          </p>
        </div>
        {!isUploading && <Download className={cn("h-4 w-4 shrink-0", isMe ? "text-sky-600/70 dark:text-sky-400" : "text-zinc-400")} />}
      </div>
      {/* Progress Bar */}
      {isUploading && (
        <div className={cn("h-1 w-full", isMe ? "bg-sky-200 dark:bg-sky-800/40" : "bg-zinc-200 dark:bg-zinc-600")}>
          <div
            className={cn(
              "h-full transition-all duration-300 ease-out rounded-r-full",
              isMe ? "bg-sky-500 dark:bg-sky-400" : "bg-sky-500"
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Image Attachment Sub-component ───────────────────
function ImageAttachment({ msg }: { msg: Message }) {
  const [loadError, setLoadError] = useState(false);

  if (loadError || !msg.fileUrl) {
    return <FileAttachment msg={msg} isMe={false} />;
  }

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!msg.fileUrl) return;
    try {
      const resp = await fetch(msg.fileUrl);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = msg.fileName || 'image';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
    } catch { window.open(msg.fileUrl, '_blank'); }
  };

  return (
    <div className="relative group/img max-w-[300px] overflow-hidden rounded-lg">
      <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={msg.fileUrl}
          alt={msg.fileName || 'image'}
          className="w-full h-auto rounded-lg object-cover max-h-[400px] transition-transform hover:scale-[1.02]"
          onError={() => setLoadError(true)}
        />
      </a>
      <button
        onClick={handleDownload}
        className="absolute bottom-2 right-2 h-8 w-8 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity hover:bg-black/70 shadow-lg"
        title="Tải xuống"
      >
        <Download className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Video Attachment Sub-component ───────────────────
function VideoAttachment({ msg }: { msg: Message }) {
  if (!msg.fileUrl) return null;

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!msg.fileUrl) return;
    try {
      const resp = await fetch(msg.fileUrl);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = msg.fileName || 'video';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
    } catch { window.open(msg.fileUrl, '_blank'); }
  };

  return (
    <div className="relative group/vid max-w-[300px] overflow-hidden rounded-lg">
      <video
        src={msg.fileUrl}
        controls
        className="w-full h-auto rounded-lg max-h-[300px]"
        preload="metadata"
      />
      <button
        onClick={handleDownload}
        className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover/vid:opacity-100 transition-opacity hover:bg-black/70 shadow-lg"
        title="Tải xuống"
      >
        <Download className="h-4 w-4" />
      </button>
    </div>
  );
}

function MessageBubbleInner({
  message: msg,
  isMe,
  senderName,
  isFirst,
  searchQuery,
  activeMenuId,
  setActiveMenuId,
  onReaction,
  onMenuAction,
  onRetry,
  getStatusLabel,
  onContactAddFriend,
  onContactCall,
  onContactMessage,
  resolveUserByPhone,
  onPollVote,
  currentUserId,
  pollVotes,
  onButtonClick,
  onWidgetAction,
  onAvatarClick,
  senderRole,
  isPinned,
  onPinMessage,
  onUnpinMessage,
}: MessageBubbleProps) {
  const { language } = useUiStore();
  const [showAbove, setShowAbove] = useState(false);
  const [longPressActive, setLongPressActive] = useState(false);
  const msgRef = useRef<HTMLDivElement>(null);
  const touchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchMoved = useRef(false);
  const sheetTouchStartY = useRef(0);
  const [sheetDragY, setSheetDragY] = useState(0);

  const handleMouseEnter = () => {
    if (msgRef.current) {
      const rect = msgRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      setShowAbove(viewportHeight - rect.bottom < 150);
    }
  };

  // ─── Long Press (Mobile) ──────────────────────────────
  const handleTouchStart = useCallback(() => {
    if (msg.id.startsWith('temp-')) return;
    touchMoved.current = false;
    touchTimerRef.current = setTimeout(() => {
      if (!touchMoved.current) {
        setLongPressActive(true);
        // Haptic feedback if available
        if (navigator.vibrate) navigator.vibrate(30);
      }
    }, 500);
  }, [msg.id]);

  const handleTouchEnd = useCallback(() => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
  }, []);

  const handleTouchMove = useCallback(() => {
    touchMoved.current = true;
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
  }, []);

  const closeLongPress = useCallback(() => {
    setLongPressActive(false);
  }, []);

  // ─── Smart Copy Helpers ────────────────────────────────
  const extractPhones = (text: string): string[] => {
    const matches = text.match(/(?:\+84|0)[3-9]\d{8}\b/g) || [];
    return [...new Set(matches)];
  };

  const extractBankAccounts = (text: string): string[] => {
    const matches = text.match(/\b\d{9,19}\b/g) || [];
    return [...new Set(matches.filter(n => n.length >= 9 && n.length <= 19))];
  };

  const extractOtps = (text: string): string[] => {
    const matches = text.match(/\b\d{4,8}\b/g) || [];
    // filter out phone-like numbers (10 digits) and only keep 4-8 digit codes
    return [...new Set(matches.filter(n => !extractPhones(text).some(p => p.includes(n))))];
  };

  const extractUrls = (text: string): string[] => {
    const matches = text.match(/https?:\/\/[^\s,'"<>]+/g) || [];
    return [...new Set(matches)];
  };

  const isScript = msg.widget != null;
  // Include content for plain text messages (m.text or no msgtype). Exclude media (m.image, m.audio, m.video, m.file) and custom types.
  const isPlainText = !msg.widget && (!msg.msgtype || msg.msgtype === 'm.text');
  const msgText = isPlainText ? msg.content : '';
  const smartPhones = useMemo(() => extractPhones(msgText), [msgText]);
  const smartAccounts = useMemo(() => extractBankAccounts(msgText), [msgText]);
  const smartOtps = useMemo(() => extractOtps(msgText), [msgText]);
  const smartUrls = useMemo(() => extractUrls(msgText), [msgText]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
  };

  const [copyToast, setCopyToast] = useState<string | null>(null);
  const showCopyToast = (label: string) => {
    setCopyToast(label);
    setTimeout(() => setCopyToast(null), 1800);
  };

  const handleCopy = useCallback(() => {
    navigator.clipboard?.writeText(msg.content).catch(() => {});
    closeLongPress();
  }, [msg.content, closeLongPress]);

  const handleReactionClick = (emoji: string, e: React.MouseEvent) => {
    onReaction(msg.id, emoji);
    // Do NOT close menu — user may want to tap multiple reactions
    // Get click origin from the button that was clicked
    const btnRect = e.currentTarget.getBoundingClientRect();
    const cx = btnRect.left + btnRect.width / 2;
    const cy = btnRect.top + btnRect.height / 2;

    // ─── ❤️ Love: lots of burst particles ───
    if (emoji === '❤️') {
      const COUNT = 12;
      for (let i = 0; i < COUNT; i++) {
        const el = document.createElement('div');
        const angle = (Math.PI * 2 * i) / COUNT + (Math.random() - 0.5) * 0.6;
        const distance = 50 + Math.random() * 60;
        const dx = Math.cos(angle) * distance;
        const dy = Math.sin(angle) * distance - 25;
        el.textContent = '❤️';
        el.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;z-index:99999;font-size:${14 + Math.random() * 12}px;pointer-events:none;will-change:transform,opacity;`;
        el.animate([
          { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 1 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.3)`, opacity: 1, offset: 0.35 },
          { transform: `translate(calc(-50% + ${dx * 1.4}px), calc(-50% + ${dy * 1.4 + 35}px)) scale(0.5)`, opacity: 0 }
        ], { duration: 800 + Math.random() * 400, easing: 'cubic-bezier(0.25,0.46,0.45,0.94)', fill: 'forwards' }).onfinish = () => el.remove();
        document.body.appendChild(el);
      }
      return;
    }

    // ─── ⭐ Star: moderate burst ───
    if (emoji === '⭐') {
      const COUNT = 6;
      for (let i = 0; i < COUNT; i++) {
        const el = document.createElement('div');
        const angle = (Math.PI * 2 * i) / COUNT + (Math.random() - 0.5) * 0.4;
        const distance = 35 + Math.random() * 40;
        const dx = Math.cos(angle) * distance;
        const dy = Math.sin(angle) * distance - 15;
        el.textContent = '⭐';
        el.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;z-index:99999;font-size:${15 + Math.random() * 8}px;pointer-events:none;will-change:transform,opacity;`;
        el.animate([
          { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 1 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.1)`, opacity: 1, offset: 0.3 },
          { transform: `translate(calc(-50% + ${dx * 1.2}px), calc(-50% + ${dy * 1.2 + 20}px)) scale(0.5)`, opacity: 0 }
        ], { duration: 650 + Math.random() * 250, easing: 'cubic-bezier(0.25,0.46,0.45,0.94)', fill: 'forwards' }).onfinish = () => el.remove();
        document.body.appendChild(el);
      }
      return;
    }

    // ─── 😍 Love-eye: zoom-in effect ───
    if (emoji === '😍') {
      const el = document.createElement('div');
      el.textContent = '😍';
      el.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;z-index:99999;font-size:24px;pointer-events:none;will-change:transform,opacity;`;
      el.animate([
        { transform: 'translate(-50%,-50%) scale(0.5)', opacity: 0.8 },
        { transform: 'translate(-50%,-50%) scale(2.5)', opacity: 1, offset: 0.4 },
        { transform: 'translate(-50%, calc(-50% - 30px)) scale(3)', opacity: 0 }
      ], { duration: 800, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', fill: 'forwards' }).onfinish = () => el.remove();
      document.body.appendChild(el);
      return;
    }

    // ─── Other emojis: no animation ───
  };

  const highlightContent = (content: string) => {
    // First split by @mentions
    const mentionRegex = /@([\w\u00C0-\u024F\u1E00-\u1EFF\s]+?)(?=\s|$|[.,!?;:])/g;
    const parts: Array<{ type: 'text' | 'mention'; value: string }> = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = mentionRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', value: content.slice(lastIndex, match.index) });
      }
      parts.push({ type: 'mention', value: match[0] });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < content.length) {
      parts.push({ type: 'text', value: content.slice(lastIndex) });
    }

    const keyword = searchQuery?.trim();

    const highlightSearch = (text: string, key: string) => {
      if (!keyword) return <span key={key}>{text}</span>;
      const searchParts = text.split(new RegExp(`(${keyword})`, 'gi'));
      return (
        <span key={key}>
          {searchParts.map((part, i) =>
            part.toLowerCase() === keyword.toLowerCase() ? (
              <span key={i} className="bg-yellow-200/80 px-0.5 rounded text-zinc-900 font-medium">
                {part}
              </span>
            ) : (
              part
            )
          )}
        </span>
      );
    };

    return (
      <>
        {parts.map((part, i) =>
          part.type === 'mention' ? (
            <span
              key={i}
              className="inline-block rounded-md bg-sky-100 px-1 py-0.5 text-sky-700 font-semibold dark:bg-sky-900/40 dark:text-sky-300 cursor-default"
            >
              {part.value}
            </span>
          ) : (
            highlightSearch(part.value, `t${i}`)
          )
        )}
      </>
    );
  };

  // ─── Determine content type ─────────────────────────
  const isVoice = msg.msgtype === 'm.audio';
  const isImage = msg.msgtype === 'm.image';
  const isVideo = msg.msgtype === 'm.video';
  const isFile = msg.msgtype === 'm.file';
  const isFolder = msg.msgtype === 'io.piechat.folder';
  const isSticker = msg.msgtype === 'io.piechat.sticker';
  const isContactMsg = msg.msgtype === 'io.piechat.contact';
  const isPoll = msg.msgtype === 'io.piechat.poll';
  const isReminder = msg.msgtype === 'io.piechat.reminder';

  // Auto-detect phone numbers in text messages
  const detectedContacts = useMemo(() => {
    if (msg.msgtype && msg.msgtype !== 'm.text') return [];
    if (!isPhoneOnlyMessage(msg.content)) return [];
    const phones = detectPhoneNumbers(msg.content);
    return phones.map(p => {
      const resolved = resolveUserByPhone?.(p.phone);
      return resolved || p;
    });
  }, [msg.content, msg.msgtype, resolveUserByPhone]);

  const hasContactCards = detectedContacts.length > 0 || isContactMsg;

  const renderContactCards = () => {
    // Explicit contact message
    if (isContactMsg) {
      const contactData: ContactCardData = {
        phone: msg.content,
        displayName: msg.fileName, // reuse fileName for displayName
        userId: msg.fileUrl, // reuse fileUrl for userId
      };
      return (
        <ContactCard
          contact={contactData}
          isMe={isMe}
          onAddFriend={onContactAddFriend}
          onCall={onContactCall}
          onMessage={onContactMessage}
        />
      );
    }
    // Auto-detected phone numbers
    return detectedContacts.map((contact, idx) => (
      <ContactCard
        key={`${contact.phone}-${idx}`}
        contact={contact}
        isMe={isMe}
        onAddFriend={onContactAddFriend}
        onCall={onContactCall}
        onMessage={onContactMessage}
      />
    ));
  };

  const renderMediaContent = () => {
    if (isVoice && msg.fileUrl) {
      return <VoicePlayer url={msg.fileUrl} duration={msg.duration} isMe={isMe} />;
    }
    if (isImage && msg.fileUrl) {
      return <ImageAttachment msg={msg} />;
    }
    if (isVideo && msg.fileUrl) {
      return <VideoAttachment msg={msg} />;
    }
    if (isFile && msg.fileUrl) {
      return <FileAttachment msg={msg} isMe={isMe} />;
    }
    if (isFolder) {
      return <FolderAttachment msg={msg} isMe={isMe} />;
    }
    if (isPoll) {
      try {
        const pollData = JSON.parse(msg.content) as PollInfo;
        // Use local optimistic votes if available, otherwise use server-synced votes from content
        const votes = pollVotes?.[pollData.pollId] ?? pollData.votes ?? [];
        return (
          <PollCard
            poll={{ ...pollData, votes }}
            currentUserId={currentUserId || ''}
            isMe={isMe}
            onVote={(pollId, optionIds) => onPollVote?.(pollId, msg.id, optionIds)}
          />
        );
      } catch {
        return <p className="text-sm text-zinc-500">📊 Bình chọn</p>;
      }
    }
    if (isReminder) {
      try {
        const reminderData = JSON.parse(msg.content) as ReminderInfo;
        return <ReminderCard reminder={reminderData} isMe={isMe} />;
      } catch {
        return <p className="text-sm text-zinc-500">⏰ Nhắc hẹn</p>;
      }
    }
    return null;
  };

  const hasMediaContent = isVoice || isImage || isVideo || isFile || isFolder || isPoll || isReminder;

  // ─── Bottom Sheet (Long Press) ─────────────────────────
  const renderMobileSheet = () => {
    if (!longPressActive) return null;

    // Preview text for the selected message
    const previewText = isSticker ? '🎨 Sticker'
      : isPoll ? '📊 Bình chọn'
      : isReminder ? '⏰ Nhắc hẹn'
      : isContactMsg ? '📇 Danh thiếp'
      : isVoice ? '🎤 Tin nhắn thoại'
      : isImage ? '🖼️ Hình ảnh'
      : isVideo ? '🎬 Video'
      : isFile || isFolder ? '📁 Tệp đính kèm'
      : msg.content;

    const previewTime = new Date(msg.timestamp).toLocaleString([], { hour: '2-digit', minute: '2-digit' });

    return createPortal(
      <div className="fixed inset-0 z-[9999] flex flex-col justify-end">
        {/* Backdrop — semi-transparent, instant close on tap */}
        <div className="absolute inset-0 bg-black/50" onClick={closeLongPress} />

        {/* Highlighted Message Preview */}
        <div className={cn(
          "relative mx-4 mb-3 flex animate-in fade-in zoom-in-95 duration-200",
          isMe ? "justify-end" : "justify-start"
        )}>
          <div className={cn(
            "max-w-[80%] rounded-2xl px-4 py-2.5 shadow-lg ring-2",
            isMe
              ? "bg-sky-100 text-zinc-900 ring-sky-400/60 dark:bg-sky-900/60 dark:text-zinc-100 dark:ring-sky-500/40"
              : "bg-white text-zinc-900 ring-sky-400/60 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-sky-500/40",
          )}>
            <p className="text-sm leading-snug line-clamp-2">{previewText}</p>
            <div className="flex items-center justify-between mt-1">
              <p className={cn(
                "text-[10px] font-medium",
                isMe ? "text-sky-500/70" : "text-zinc-400"
              )}>{previewTime}</p>
              {/* Live reactions in preview */}
              {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                <div className="flex items-center gap-0.5">
                  {Object.entries(msg.reactions).slice(0, 5).map(([emoji, count]) => {
                    const emojiPath = REACTION_ICONS[emoji];
                    return emojiPath ? (
                      <div key={emoji} className="flex items-center gap-0.5 rounded-full bg-white/80 dark:bg-zinc-700/80 px-1.5 py-0.5 ring-1 ring-zinc-200/50 dark:ring-zinc-600/50">
                        <div className="relative h-3.5 w-3.5">
                          <Image src={emojiPath} alt={emoji} width={14} height={14} className="object-contain" />
                        </div>
                        <span className="text-[9px] font-bold text-zinc-600 dark:text-zinc-300">{count}</span>
                      </div>
                    ) : (
                      <span key={emoji} className="text-[10px]">{emoji} {count}</span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Sheet with swipe-down-to-close */}
        <div
          className="relative bg-white dark:bg-zinc-900 rounded-t-3xl shadow-2xl ring-1 ring-black/5 dark:ring-zinc-700 max-h-[60vh] overflow-y-auto"
          style={{
            transform: sheetDragY > 0 ? `translateY(${sheetDragY}px)` : undefined,
            transition: sheetDragY > 0 ? 'none' : 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
            animation: sheetDragY > 0 ? 'none' : undefined,
          }}
          onTouchStart={(e) => {
            sheetTouchStartY.current = e.touches[0].clientY;
            setSheetDragY(0);
          }}
          onTouchMove={(e) => {
            const dy = e.touches[0].clientY - sheetTouchStartY.current;
            if (dy > 0) {
              setSheetDragY(dy);
            }
          }}
          onTouchEnd={() => {
            if (sheetDragY > 80) {
              closeLongPress();
            }
            setSheetDragY(0);
          }}
        >
          {/* Drag Handle */}
          <div className="flex justify-center pt-3 pb-2 cursor-grab">
            <div className="h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-600" />
          </div>

          {/* Reaction Bar */}
          <div className="flex items-center justify-center gap-1 px-4 pb-3">
            <div className="flex items-center gap-1 rounded-full bg-zinc-100 dark:bg-zinc-800 p-1.5">
              {Object.entries(REACTION_ICONS).map(([emoji, path]) => (
                <button
                  key={emoji}
                  onClick={(e) => handleReactionClick(emoji, e)}
                  className="relative h-9 w-9 rounded-full transition-all active:scale-90 active:bg-zinc-200 dark:active:bg-zinc-700 p-1"
                >
                  <div className="relative h-full w-full">
                    <Image src={path} alt={emoji} fill className="object-contain" />
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-zinc-100 dark:bg-zinc-800 mx-4" />

          {/* Action Grid */}
          <div className="grid grid-cols-4 gap-1 p-4">
            <button
              onClick={() => { onMenuAction('reply', msg); closeLongPress(); }}
              className="flex flex-col items-center gap-1.5 rounded-xl py-3 active:bg-zinc-100 dark:active:bg-zinc-800 transition-colors"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 dark:bg-sky-900/30">
                <Reply className="h-5 w-5 text-sky-600 dark:text-sky-400" />
              </div>
              <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">{t(language, 'msgReply' as any)}</span>
            </button>

            <button
              onClick={() => { onMenuAction('forward', msg); closeLongPress(); }}
              className="flex flex-col items-center gap-1.5 rounded-xl py-3 active:bg-zinc-100 dark:active:bg-zinc-800 transition-colors"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
                <Forward className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">{t(language, 'msgForward' as any)}</span>
            </button>

            <button
              onClick={() => {
                if (isScript) {
                  copyToClipboard(JSON.stringify(msg.widget));
                  showCopyToast('Script');
                } else {
                  copyToClipboard(msg.content);
                  showCopyToast('Văn bản');
                }
                closeLongPress();
              }}
              className="flex flex-col items-center gap-1.5 rounded-xl py-3 active:bg-zinc-100 dark:active:bg-zinc-800 transition-colors"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/30">
                {isScript ? <Code2 className="h-5 w-5 text-amber-600 dark:text-amber-400" /> : <Copy className="h-5 w-5 text-amber-600 dark:text-amber-400" />}
              </div>
              <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">{isScript ? 'Sao chép Script' : t(language, 'msgCopy' as any)}</span>
            </button>

            {/* Smart copy options in mobile sheet */}
            {!isScript && smartPhones.length > 0 && (
              <button
                onClick={() => { copyToClipboard(smartPhones[0]); showCopyToast('SĐT'); closeLongPress(); }}
                className="flex flex-col items-center gap-1.5 rounded-xl py-3 active:bg-zinc-100 dark:active:bg-zinc-800 transition-colors"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100 dark:bg-green-900/30">
                  <Phone className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">Sao chép SĐT</span>
              </button>
            )}
            {!isScript && smartOtps.length > 0 && (
              <button
                onClick={() => { copyToClipboard(smartOtps[0]); showCopyToast('OTP'); closeLongPress(); }}
                className="flex flex-col items-center gap-1.5 rounded-xl py-3 active:bg-zinc-100 dark:active:bg-zinc-800 transition-colors"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 dark:bg-orange-900/30">
                  <KeyRound className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                </div>
                <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">Sao chép OTP</span>
              </button>
            )}

            <button
              onClick={() => { onMenuAction('details', msg); closeLongPress(); }}
              className="flex flex-col items-center gap-1.5 rounded-xl py-3 active:bg-zinc-100 dark:active:bg-zinc-800 transition-colors"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/30">
                <Info className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </div>
              <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">{t(language, 'msgDetails' as any)}</span>
            </button>

            {!msg.id.startsWith('temp-') && (
              isPinned ? (
                <button
                  onClick={() => { onUnpinMessage?.(msg.id); closeLongPress(); }}
                  className="flex flex-col items-center gap-1.5 rounded-xl py-3 active:bg-zinc-100 dark:active:bg-zinc-800 transition-colors"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 dark:bg-orange-900/30">
                    <PinOff className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">Bỏ ghim</span>
                </button>
              ) : (
                <button
                  onClick={() => { onPinMessage?.(msg.id); closeLongPress(); }}
                  className="flex flex-col items-center gap-1.5 rounded-xl py-3 active:bg-zinc-100 dark:active:bg-zinc-800 transition-colors"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/30">
                    <Pin className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">Ghim</span>
                </button>
              )
            )}

            <button
              onClick={() => { onMenuAction('delete', msg); closeLongPress(); }}
              className="flex flex-col items-center gap-1.5 rounded-xl py-3 active:bg-zinc-100 dark:active:bg-zinc-800 transition-colors"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 dark:bg-rose-900/30">
                <Trash2 className="h-5 w-5 text-rose-600 dark:text-rose-400" />
              </div>
              <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">{t(language, 'msgDelete' as any)}</span>
            </button>

            {isMe && msg.msgtype !== 'm.image' && msg.msgtype !== 'm.video' && msg.msgtype !== 'm.file' && msg.msgtype !== 'm.audio' && (
              <button
                onClick={() => { onMenuAction('edit', msg); closeLongPress(); }}
                className="flex flex-col items-center gap-1.5 rounded-xl py-3 active:bg-zinc-100 dark:active:bg-zinc-800 transition-colors"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/30">
                  <Pencil className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">Sửa</span>
              </button>
            )}
          </div>

          {/* Safe area bottom */}
          <div className="h-4" />
        </div>
      </div>,
      document.body
    );
  };

  return (
    <>
    {renderMobileSheet()}
    <div
      className={cn(
        "group flex w-full gap-2 lg:gap-3 transition-all hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 px-1 py-0.5 lg:px-2 lg:py-1",
        isMe ? "justify-end" : "justify-start",
        longPressActive && "bg-sky-50/80 dark:bg-sky-900/20"
      )}
      onMouseEnter={handleMouseEnter}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
    >
      {!isMe && (
        <div className={cn("flex flex-col justify-end pb-1 cursor-pointer", isFirst ? "opacity-100" : "opacity-0")} onClick={() => onAvatarClick?.(msg.senderId)}>
          <Avatar name={senderName} size="sm" className="h-7 w-7 lg:h-8 lg:w-8" />
        </div>
      )}

      <div
        ref={msgRef}
        className={cn(
          "group/msg relative rounded-2xl transition-all",
          isSticker
            ? "max-w-[140px] lg:max-w-[120px] p-1"
            : (isContactMsg || hasContactCards)
              ? "max-w-[85%] lg:max-w-[75%] p-0"
              : msg.widget
                ? cn(
                    "text-[15px] lg:text-sm shadow-sm",
                    "px-0 py-0",
                    isMe
                      ? "bg-sky-100 text-zinc-900 dark:bg-sky-900/30 dark:text-zinc-100 rounded-tr-sm border border-sky-200 dark:border-sky-800/40"
                      : "bg-white text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100 rounded-tl-sm border border-zinc-200 dark:border-zinc-700",
                  )
              : cn(
                  "max-w-[85%] lg:max-w-[75%] text-[15px] lg:text-sm shadow-sm",
                  (isFile || isFolder) ? "px-2 py-1.5 lg:px-3 lg:py-2" : "px-3 py-1.5 lg:px-4 lg:py-2.5",
                  isMe
                    ? "bg-sky-100 text-zinc-900 dark:bg-sky-900/30 dark:text-zinc-100 rounded-tr-sm border border-sky-200 dark:border-sky-800/40"
                    : "bg-white text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100 rounded-tl-sm border border-zinc-200 dark:border-zinc-700",
                ),
          msg.status === 'sending' && "opacity-70",
          msg.status === 'failed' && "border-rose-300 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-900/20"
        )}
        style={msg.widget ? (() => {
          const raw = msg.widget.width;
          if (!raw) return { width: '100%', maxWidth: '680px' };   // default: fill bubble up to 680px
          const val = typeof raw === 'number' ? `${raw}px` : raw;
          return typeof raw === 'number'
            ? { width: val, maxWidth: '95%' }   // e.g. 500 → exactly 500px, capped at 95vw
            : { width: val };                   // e.g. "80%" → exactly 80% of parent — explicit width, NOT maxWidth
        })() : undefined}
      >
        {/* Reaction Bar on Hover — hidden when menu is open */}
        {!msg.id.startsWith('temp-') && activeMenuId !== msg.id && (
          <div className={cn(
            "absolute z-30 hidden group-hover/msg:flex justify-center min-w-[220px]",
            showAbove
              ? "bottom-full pb-2.5"
              : "top-full pt-2.5",
            isMe ? "right-0" : "left-0"
          )}>
            <div className={cn(
              "flex items-center gap-0.5 rounded-full bg-white/95 p-1 shadow-2xl ring-1 ring-black/10 backdrop-blur-md dark:bg-zinc-800/95 transition-all animate-in fade-in zoom-in-95 duration-200",
              showAbove ? "slide-in-from-bottom-2" : "slide-in-from-top-2"
            )}>
              {Object.entries(REACTION_ICONS).map(([emoji, path]) => (
                <button
                  key={emoji}
                  onClick={(e) => handleReactionClick(emoji, e)}
                  className="relative h-8 w-8 rounded-full transition-all hover:scale-125 active:scale-95 hover:z-10 hover:bg-zinc-100 dark:hover:bg-zinc-700/50 p-1"
                >
                  <div className="relative h-full w-full">
                    <Image src={path} alt={emoji} fill className="object-contain" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Click-outside overlay to close menu */}
        {activeMenuId === msg.id && (
          <div className="fixed inset-0 z-30" onClick={() => setActiveMenuId(null)} />
        )}

        {/* Message Actions Menu Button */}
        <div className={cn(
          "absolute top-1 items-center z-40 transition-all",
          activeMenuId === msg.id
            ? "flex opacity-100"
            : "hidden group-hover/msg:flex opacity-0 group-hover/msg:opacity-100",
          isMe ? "right-full mr-3" : "left-full ml-3"
        )}>
          <div className={cn("absolute h-10 w-10", isMe ? "-right-5" : "-left-5")} />
          <div className="relative">
            <button
              onClick={() => setActiveMenuId(activeMenuId === msg.id ? null : msg.id)}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-zinc-500 hover:bg-zinc-100 hover:text-sky-600 dark:bg-zinc-800/95 dark:text-zinc-400 dark:hover:bg-zinc-700 shadow-md ring-1 ring-black/5 transition-all active:scale-95"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>

            {activeMenuId === msg.id && (
              <div className={cn(
                "absolute z-[100] w-52 overflow-hidden rounded-2xl border border-zinc-200 bg-white/95 p-1.5 shadow-2xl ring-1 ring-black/5 backdrop-blur-md dark:border-zinc-700 dark:bg-zinc-800/95 animate-in fade-in zoom-in-95 duration-200",
                showAbove
                  ? "bottom-full mb-2 origin-bottom-right"
                  : "top-full mt-2 origin-top-right",
                isMe ? "right-0" : "left-0"
              )}>
                <div className={cn("absolute left-0 right-0 h-3", showAbove ? "-bottom-3" : "-top-3")} />
                <button onClick={() => onMenuAction('reply', msg)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-zinc-700 hover:bg-sky-50 hover:text-sky-700 dark:text-zinc-200 dark:hover:bg-sky-900/30 dark:hover:text-sky-400 transition-all text-nowrap">
                  <Reply className="h-4 w-4" /> {t(language, 'msgReply' as any) || 'Reply'}
                </button>
                <button onClick={() => onMenuAction('forward', msg)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-zinc-700 hover:bg-sky-50 hover:text-sky-700 dark:text-zinc-200 dark:hover:bg-sky-900/30 dark:hover:text-sky-400 transition-all text-nowrap">
                  <Forward className="h-4 w-4" /> {t(language, 'msgForward' as any) || 'Forward'}
                </button>
                <button onClick={() => onMenuAction('details', msg)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-zinc-700 hover:bg-sky-50 hover:text-sky-700 dark:text-zinc-200 dark:hover:bg-sky-900/30 dark:hover:text-sky-400 transition-all text-nowrap">
                  <Info className="h-4 w-4" /> {t(language, 'msgDetails' as any) || 'Details'}
                </button>
                <div className="my-1.5 h-px bg-zinc-100 dark:bg-zinc-700/50" />
                {/* ── Smart Copy Options ── */}
                {isScript ? (
                  <button onClick={() => { copyToClipboard(JSON.stringify(msg.widget)); setActiveMenuId(null); showCopyToast('Script'); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-zinc-700 hover:bg-amber-50 hover:text-amber-700 dark:text-zinc-200 dark:hover:bg-amber-900/20 transition-all text-nowrap">
                    <Code2 className="h-4 w-4 text-amber-500" /> Sao chép mã script
                  </button>
                ) : (
                  <>
                    {msgText && (
                      <button onClick={() => { copyToClipboard(msg.content); setActiveMenuId(null); showCopyToast('Văn bản'); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-zinc-700 hover:bg-sky-50 hover:text-sky-700 dark:text-zinc-200 dark:hover:bg-sky-900/30 dark:hover:text-sky-400 transition-all text-nowrap">
                        <Copy className="h-4 w-4" /> Sao chép văn bản
                      </button>
                    )}
                    {smartPhones.length > 0 && (
                      <button onClick={() => { copyToClipboard(smartPhones[0]); setActiveMenuId(null); showCopyToast('SĐT'); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-zinc-700 hover:bg-green-50 hover:text-green-700 dark:text-zinc-200 dark:hover:bg-green-900/20 transition-all text-nowrap">
                        <Phone className="h-4 w-4 text-green-500" /> Sao chép số điện thoại
                      </button>
                    )}
                    {smartAccounts.length > 0 && smartPhones.length === 0 && (
                      <button onClick={() => { copyToClipboard(smartAccounts[0]); setActiveMenuId(null); showCopyToast('Số TK'); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-zinc-700 hover:bg-violet-50 hover:text-violet-700 dark:text-zinc-200 dark:hover:bg-violet-900/20 transition-all text-nowrap">
                        <CreditCard className="h-4 w-4 text-violet-500" /> Sao chép số tài khoản
                      </button>
                    )}
                    {smartOtps.length > 0 && (
                      <button onClick={() => { copyToClipboard(smartOtps[0]); setActiveMenuId(null); showCopyToast('OTP'); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-zinc-700 hover:bg-orange-50 hover:text-orange-700 dark:text-zinc-200 dark:hover:bg-orange-900/20 transition-all text-nowrap">
                        <KeyRound className="h-4 w-4 text-orange-500" /> Sao chép mã OTP
                      </button>
                    )}
                    {smartUrls.length > 0 && (
                      <button onClick={() => { copyToClipboard(smartUrls[0]); setActiveMenuId(null); showCopyToast('Link'); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-zinc-700 hover:bg-sky-50 hover:text-sky-700 dark:text-zinc-200 dark:hover:bg-sky-900/30 dark:hover:text-sky-400 transition-all text-nowrap">
                        <Link2 className="h-4 w-4 text-sky-500" /> Sao chép liên kết
                      </button>
                    )}
                  </>
                )}
                {/* Pin / Unpin */}
                {!msg.id.startsWith('temp-') && (
                  isPinned ? (
                    <button onClick={() => { onUnpinMessage?.(msg.id); setActiveMenuId(null); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-zinc-700 hover:bg-orange-50 hover:text-orange-700 dark:text-zinc-200 dark:hover:bg-orange-900/20 transition-all text-nowrap">
                      <PinOff className="h-4 w-4 text-orange-500" /> Bỏ ghim
                    </button>
                  ) : (
                    <button onClick={() => { onPinMessage?.(msg.id); setActiveMenuId(null); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-zinc-700 hover:bg-amber-50 hover:text-amber-700 dark:text-zinc-200 dark:hover:bg-amber-900/20 transition-all text-nowrap">
                      <Pin className="h-4 w-4 text-amber-500" /> Ghim tin nhắn
                    </button>
                  )
                )}
                <div className="my-1.5 h-px bg-zinc-100 dark:bg-zinc-700/50" />
                {isMe && !msg.redacted && (Date.now() - msg.timestamp < 5 * 60 * 1000) && (
                  <button onClick={() => { onMenuAction('recall', msg); setActiveMenuId(null); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-orange-600 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-900/20 transition-all text-nowrap">
                    <Ban className="h-4 w-4" /> Thu hồi
                  </button>
                )}
                <button onClick={() => { onMenuAction('delete', msg); setActiveMenuId(null); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-900/20 transition-all text-nowrap">
                  <Trash2 className="h-4 w-4" /> {t(language, 'msgDelete' as any) || 'Delete'}
                </button>
                {isMe && msg.msgtype !== 'm.image' && msg.msgtype !== 'm.video' && msg.msgtype !== 'm.file' && msg.msgtype !== 'm.audio' && (
                  <button onClick={() => { onMenuAction('edit', msg); setActiveMenuId(null); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20 transition-all text-nowrap">
                    <Pencil className="h-4 w-4" /> Sửa
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sender Name (for others) */}
        {!isMe && isFirst && (
          <p className="mb-0.5 text-[11px] font-bold text-sky-600 dark:text-sky-400 select-none leading-none flex items-center gap-1">
            {senderName}
            {senderRole === 'leader' && <span title="Trưởng">👑</span>}
            {senderRole === 'deputy' && <span title="Phó">⭐</span>}
          </p>
        )}

        {/* Reply-to reference */}
        {msg.replyTo && msg.replyTo.body && (
          <div
            onClick={() => {
              const el = document.querySelector(`[data-msg-id="${msg.replyTo!.eventId}"]`);
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.add('ring-2', 'ring-sky-400', 'ring-offset-1');
                setTimeout(() => el.classList.remove('ring-2', 'ring-sky-400', 'ring-offset-1'), 2000);
              }
            }}
            className={cn(
              "mb-1 rounded-lg px-2.5 py-1.5 text-xs border-l-2 cursor-pointer active:scale-[0.98] transition-transform",
              isMe
                ? "bg-sky-200/50 border-sky-400 dark:bg-sky-800/20 dark:border-sky-500"
                : "bg-zinc-100 border-zinc-300 dark:bg-zinc-700/50 dark:border-zinc-500"
            )}>
            <p className="font-bold text-[10px] text-sky-600 dark:text-sky-400 mb-0.5">
              {msg.replyTo.senderId.split(':')[0].replace('@', '')}
            </p>
            <p className="text-zinc-500 dark:text-zinc-400 line-clamp-2">{msg.replyTo.body}</p>
          </div>
        )}

        {/* Media / Sticker / Contact / Text Content */}
        {isSticker && msg.fileUrl ? (
          <div className="sticker-image">
            <img
              src={msg.fileUrl}
              alt="sticker"
              className="w-full h-full object-contain drop-shadow-md"
            />
          </div>
        ) : hasContactCards ? (
          <div>
            {renderContactCards()}
          </div>
        ) : hasMediaContent ? (
          <div className="mb-1">
            {renderMediaContent()}
          </div>
        ) : msg.callInfo ? (
          /* Call Message with custom icons */
          <div className="flex items-center gap-2.5 py-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={
                msg.callInfo.type === 'video'
                  ? (msg.callInfo.status === 'missed' ? '/call-icons/missing-video-call.png' : '/call-icons/video-call.png')
                  : (msg.callInfo.status === 'missed' ? '/call-icons/missing-call.png' : '/call-icons/call.png')
              }
              alt="call"
              className="h-7 w-7 object-contain"
            />
            <div>
              <p className={cn(
                "text-[13px] font-semibold leading-tight",
                msg.callInfo.status === 'missed' ? "text-rose-500" : "text-zinc-800 dark:text-zinc-200"
              )}>
                {msg.content}
              </p>
              {msg.callInfo.duration && (
                <p className="text-[11px] text-zinc-400 tabular-nums">{msg.callInfo.duration}</p>
              )}
            </div>
          </div>
        ) : msg.widget ? (
          /* Widget Message (sandboxed interactive content) */
          <div>
            <WidgetMessage
              widget={msg.widget}
              isMe={isMe}
              messageId={msg.id}
              onAction={onWidgetAction}
            />
          </div>
        ) : msg.redacted ? (
          /* Recalled / Redacted Message */
          <div className="flex items-center gap-2 py-1">
            <Ban className="h-4 w-4 text-zinc-400 shrink-0" />
            <span className="text-[13px] italic text-zinc-400 dark:text-zinc-500 select-none">
              Tin nhắn đã bị thu hồi
            </span>
          </div>
        ) : msg.location ? (
          /* Location Message */
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-rose-500 shrink-0" />
              <span className="text-[13px] font-medium">{msg.location.description || 'Vị trí'}</span>
            </div>
            <a
              href={`https://www.openstreetmap.org/?mlat=${msg.location.lat}&mlon=${msg.location.lng}#map=16/${msg.location.lat}/${msg.location.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 hover:opacity-90 transition-opacity"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://staticmap.openstreetmap.de/staticmap.php?center=${msg.location.lat},${msg.location.lng}&zoom=15&size=300x150&maptype=mapnik&markers=${msg.location.lat},${msg.location.lng},ol-marker`}
                alt="map"
                className="w-full h-[150px] object-cover"
              />
              <div className="px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-800 text-[10px] text-zinc-500">
                📍 {msg.location.lat.toFixed(5)}, {msg.location.lng.toFixed(5)} • Mở bản đồ →
              </div>
            </a>
          </div>
        ) : msg.expiresAt ? (
          /* Disappearing Message */
          <div>
            <div className="break-words leading-snug text-[14px] lg:text-sm">
              {msg.expiresAt > Date.now() ? (
                highlightContent(msg.content)
              ) : (
                <span className="italic text-zinc-400 dark:text-zinc-500 flex items-center gap-1.5">
                  <Timer className="h-3.5 w-3.5" /> Tin nhắn đã hết hạn
                </span>
              )}
            </div>
            {msg.expiresAt > Date.now() && (
              <div className="flex items-center gap-1 mt-1 text-[10px] text-amber-500 dark:text-amber-400 font-medium">
                <Timer className="h-3 w-3" />
                Tự hủy {(() => {
                  const remaining = msg.expiresAt - Date.now();
                  const mins = Math.ceil(remaining / 60000);
                  const hours = Math.ceil(remaining / 3600000);
                  if (hours > 24) return `sau ${Math.ceil(hours / 24)} ngày`;
                  if (hours > 1) return `sau ${hours} giờ`;
                  return `sau ${mins} phút`;
                })()}
              </div>
            )}
          </div>
        ) : (
          /* Text Message Content */
          <div>
            <div className="break-words leading-snug text-[14px] lg:text-sm">
              {highlightContent(msg.content)}
            </div>
            <LinkPreviews text={msg.content} isMe={isMe} />
            {/* Inline Buttons */}
            {msg.inlineButtons && msg.inlineButtons.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {msg.inlineButtons.map((btn) => {
                  const styleClass = btn.style === 'danger'
                    ? 'bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:hover:bg-rose-900/50 border-rose-200 dark:border-rose-800/40'
                    : btn.style === 'secondary'
                      ? 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-700/50 dark:text-zinc-300 dark:hover:bg-zinc-700 border-zinc-200 dark:border-zinc-600'
                      : 'bg-sky-100 text-sky-700 hover:bg-sky-200 dark:bg-sky-900/30 dark:text-sky-400 dark:hover:bg-sky-900/50 border-sky-200 dark:border-sky-800/40';
                  if (btn.url) {
                    return (
                      <a
                        key={btn.id}
                        href={btn.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn('inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all active:scale-95', styleClass)}
                      >
                        {btn.label} ↗
                      </a>
                    );
                  }
                  return (
                    <button
                      key={btn.id}
                      onClick={() => onButtonClick?.(msg.id, btn.id, btn.label)}
                      className={cn('inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all active:scale-95', styleClass)}
                    >
                      {btn.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Timestamp */}
        <div
          className={cn(
            "mt-0.5 flex items-center gap-1 text-[10px] font-medium select-none leading-none",
            msg.reactions && Object.keys(msg.reactions).length > 0 && "pb-2.5",
            isMe ? "text-sky-500/70 dark:text-sky-400 justify-end" : "text-zinc-400 justify-end"
          )}
        >
          {isPinned && (
            <Pin className="h-3 w-3 text-amber-500 dark:text-amber-400" />
          )}
          <span>{new Date(msg.timestamp).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
          {msg.edited && (
            <span className="italic opacity-70">đã sửa</span>
          )}
          {isMe && (
            <span className="ml-0.5 inline-flex items-center">
              {msg.status === 'sending' && (
                <span className="opacity-60 text-[9px]">⏳</span>
              )}
              {msg.status === 'sent' && (
                <svg className="h-3.5 w-3.5 text-zinc-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="4 8 7 11 12 5" />
                </svg>
              )}
              {msg.status === 'delivered' && (
                <svg className="h-3.5 w-3.5 text-zinc-400" viewBox="0 0 20 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="2 8 5 11 10 5" />
                  <polyline points="7 8 10 11 15 5" />
                </svg>
              )}
              {msg.status === 'read' && (
                <svg className="h-3.5 w-3.5 text-sky-500" viewBox="0 0 20 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="2 8 5 11 10 5" />
                  <polyline points="7 8 10 11 15 5" />
                </svg>
              )}
              {msg.status === 'failed' && (
                <span className="text-rose-500 text-[10px] font-bold">!</span>
              )}
            </span>
          )}
        </div>

        {/* Reactions Display */}
        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
          <div className={cn(
            "absolute -bottom-3 z-20 flex items-center gap-1",
            isMe ? "right-2" : "left-2"
          )}>
            <div className="flex items-center gap-1 rounded-full bg-white px-1.5 py-0.5 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700 cursor-help transition-transform hover:scale-105">
              <div className="flex -space-x-1">
                {Object.entries(msg.reactions).slice(0, 4).map(([emoji]) => {
                  const emojiPath = REACTION_ICONS[emoji];
                  const reactors = msg.reactionDetails?.[emoji]?.join(', ') || '';
                  return emojiPath && (
                    <div key={emoji} title={reactors} className="relative h-4 w-4 rounded-full ring-2 ring-white dark:ring-zinc-800 overflow-hidden bg-white dark:bg-zinc-800">
                      <Image src={emojiPath} alt={emoji} width={16} height={16} className="object-cover" />
                    </div>
                  );
                })}
              </div>
              <span className="ml-1 text-[10px] font-bold text-zinc-600 dark:text-zinc-400">
                {Object.values(msg.reactions).reduce((a, b) => a + b, 0)}
              </span>
            </div>
          </div>
        )}

        {/* Retry Button */}
        {isMe && msg.status === 'failed' && (
          <button
            type="button"
            onClick={() => onRetry(msg.id)}
            className="absolute -bottom-6 right-0 flex items-center gap-1 text-[10px] font-bold text-rose-500 hover:text-rose-600 bg-white/80 dark:bg-zinc-900/80 px-2 py-0.5 rounded-full shadow-sm"
          >
            <Repeat className="h-3 w-3" /> Retry
          </button>
        )}
      </div>

      {/* Copy Toast */}
      {copyToast && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-zinc-900/90 px-3 py-1 text-[11px] font-semibold text-white shadow-lg animate-in fade-in zoom-in-95 duration-150 pointer-events-none z-50">
          ✓ Đã sao chép {copyToast}
        </div>
      )}
    </div>
    </>
  );
}

export const MessageBubble = memo(MessageBubbleInner, (prev, next) => {
  // Custom shallow comparison — only re-render when meaningful data changes
  if (prev.message.id !== next.message.id) return false;
  if (prev.message.content !== next.message.content) return false;
  if (prev.message.status !== next.message.status) return false;
  if (prev.message.redacted !== next.message.redacted) return false;
  if (prev.isMe !== next.isMe) return false;
  if (prev.isFirst !== next.isFirst) return false;
  if (prev.searchQuery !== next.searchQuery) return false;
  if (prev.isPinned !== next.isPinned) return false;
  if (prev.activeMenuId !== next.activeMenuId) return false;
  if (prev.senderRole !== next.senderRole) return false;
  // Compare reactions by serialization (small objects)
  const prevR = JSON.stringify(prev.message.reactions || {});
  const nextR = JSON.stringify(next.message.reactions || {});
  if (prevR !== nextR) return false;
  // Poll votes comparison
  if (prev.pollVotes !== next.pollVotes) return false;
  return true;
});

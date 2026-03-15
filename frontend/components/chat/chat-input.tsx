'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Paperclip, Smile, Mic, Square, FolderOpen, File, X, Loader2, Contact, BarChart3, AlarmClock, Reply, Pencil, Clock, AtSign, Code2, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StickerPicker } from './sticker-picker';
import { createChartWidget, createTableWidget, createProgressWidget, createCodeWidget, createCustomWidget } from '@/lib/widget-sdk';
import type { WidgetPayload } from '@/lib/widget-sdk';

export interface MentionMember {
  id: string;       // @user:domain
  displayName: string;
  username: string;
}

export interface ReplyEditState {
  mode: 'reply' | 'edit';
  messageId: string;
  senderName: string;
  content: string;
}

interface ChatInputProps {
  onSendMessage: (content: string) => void;
  onSendFiles?: (files: File[]) => void;
  onSendFolder?: (folderName: string, files: File[]) => void;
  onSendVoice?: (blob: Blob, durationMs: number) => void;
  onSendContact?: () => void;
  onSendSticker?: (packId: string, stickerId: string, stickerUrl: string) => void;
  onOpenPollDialog?: () => void;
  onOpenReminderDialog?: () => void;
  onTyping?: (typing: boolean) => void;
  replyEdit?: ReplyEditState | null;
  onCancelReplyEdit?: () => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onReplyMessage?: (messageId: string, content: string) => void;
  placeholder?: string;
  disabled?: boolean;
  onScheduleMessage?: (content: string, sendAt: number) => void;
  members?: MentionMember[];
  onSendWidget?: (widgetPayload: object) => void;
}

export function ChatInput({ onSendMessage, onSendFiles, onSendFolder, onSendVoice, onSendContact, onSendSticker, onOpenPollDialog, onOpenReminderDialog, onTyping, replyEdit, onCancelReplyEdit, onEditMessage, onReplyMessage, placeholder, disabled, onScheduleMessage, members, onSendWidget }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [isAttachMenuOpen, setIsAttachMenuOpen] = useState(false);
  const [isStickerOpen, setIsStickerOpen] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const attachMenuRef = useRef<HTMLDivElement>(null);

  // Widget paste state
  const [pendingWidget, setPendingWidget] = useState<object | null>(null);
  const [widgetPreviewTitle, setWidgetPreviewTitle] = useState<string>('');

  // Mention state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionStartPos = useRef<number>(-1);
  const mentionRef = useRef<HTMLDivElement>(null);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartRef = useRef<number>(0);

  // File upload state
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Close attach menu on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(event.target as Node)) {
        setIsAttachMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Set edit content when entering edit mode
  useEffect(() => {
    if (replyEdit?.mode === 'edit') {
      setMessage(replyEdit.content);
      textareaRef.current?.focus();
    }
  }, [replyEdit]);

  // ─── Widget Paste Handling ────────────────────────────
  /**
   * WIDGET PASTE FORMAT:
   * Paste text starting with `//widget:` followed by a JSON WidgetPayload.
   * Example: //widget:{"type":"chart","title":"Sales",...}
   * The system will detect this, show a preview banner, and send as a widget.
   */
  const WIDGET_PREFIX = '//widget:';

  const tryParseWidgetPaste = (text: string): { valid: boolean; payload?: WidgetPayload; title?: string } => {
    const trimmed = text.trim();
    if (!trimmed.startsWith(WIDGET_PREFIX)) return { valid: false };
    const jsonStr = trimmed.slice(WIDGET_PREFIX.length).trim();
    try {
      const raw = JSON.parse(jsonStr) as Record<string, any>;
      if (!raw || typeof raw !== 'object' || !('type' in raw)) return { valid: false };

      let payload: WidgetPayload;

      // If payload already has html/script, it's a complete widget — use directly
      if (raw.html || raw.script) {
        payload = raw as WidgetPayload;
      } else {
        // Build full payload using SDK helpers based on type
        switch (raw.type) {
          case 'chart': {
            // Support shorthand: {type:'chart', chartType:'bar', labels:[...], datasets:[...], title?}
            const labels: string[] = raw.labels || raw.data?.labels || [];
            const rawDs = raw.datasets || raw.data?.datasets || [];
            const datasets = rawDs.map((d: any) => ({
              label: d.label || '',
              data: d.data || [],
              color: d.color || d.backgroundColor,
            }));
            payload = createChartWidget({
              type: raw.chartType || 'bar',
              labels,
              datasets,
              title: raw.title,
              showLegend: raw.showLegend !== false,
            });
            if (raw.title) payload.title = raw.title;
            break;
          }
          case 'table': {
            // Support shorthand: {type:'table', columns:['A','B'], rows:[['v1','v2']], title?}
            const rawCols: any[] = raw.columns || [];
            const cols = rawCols.map((c: any) =>
              typeof c === 'string' ? { key: c, label: c } : c
            );
            const rawRows: any[][] = raw.rows || [];
            const rows = rawRows.map((r: any[]) => {
              const obj: Record<string, string | number> = {};
              cols.forEach((c, i) => { obj[c.key] = r[i] ?? ''; });
              return obj;
            });
            payload = createTableWidget({ columns: cols, rows, title: raw.title, sortable: raw.sortable !== false, striped: raw.striped !== false });
            break;
          }
          case 'progress': {
            payload = createProgressWidget({
              value: Number(raw.value ?? 0),
              max: Number(raw.max ?? 100),
              label: raw.label || raw.title,
              color: raw.color,
              showPercent: raw.showPercent !== false,
            });
            if (raw.title) payload.title = raw.title;
            break;
          }
          case 'code': {
            payload = createCodeWidget(raw.code || '', raw.language || 'javascript', raw.title);
            break;
          }
          case 'custom':
          default: {
            payload = createCustomWidget(raw.html || '', raw.css, raw.script, { title: raw.title, height: raw.height, interactive: raw.interactive });
            break;
          }
        }
      }

      // Carry over width/height from user input — SDK builders don't propagate these
      if (raw.width != null)  payload.width  = raw.width;
      if (raw.height != null) payload.height = raw.height;

      return { valid: true, payload, title: payload.title || raw.type || 'Widget' };
    } catch {
      return { valid: false };
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (disabled) return;

    // Handle pending widget send
    if (pendingWidget) {
      onSendWidget?.(pendingWidget);
      setPendingWidget(null);
      setWidgetPreviewTitle('');
      return;
    }


    if (replyEdit?.mode === 'edit' && message.trim()) {
      onEditMessage?.(replyEdit.messageId, message.trim());
      setMessage('');
      onCancelReplyEdit?.();
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      return;
    }

    // Handle reply mode
    if (replyEdit?.mode === 'reply' && message.trim()) {
      onReplyMessage?.(replyEdit.messageId, message.trim());
      setMessage('');
      onCancelReplyEdit?.();
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      return;
    }

    // Send pending files first
    if (pendingFiles.length > 0 && onSendFiles) {
      setIsUploading(true);
      onSendFiles(pendingFiles);
      setPendingFiles([]);
      setIsUploading(false);
    }

    // Then send text if any
    if (message.trim()) {
      onSendMessage(message.trim());
      setMessage('');
    }

    onTyping?.(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Mention navigation
    if (mentionQuery !== null && filteredMembers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(i => (i + 1) % filteredMembers.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(i => (i - 1 + filteredMembers.length) % filteredMembers.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredMembers[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMention();
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Typing debounce
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setMessage(value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;

    // Widget paste detection on input change (covers non-paste paths too)
    if (value.trim().startsWith(WIDGET_PREFIX)) {
      const result = tryParseWidgetPaste(value);
      if (result.valid && result.payload) {
        setPendingWidget(result.payload);
        setWidgetPreviewTitle(result.title || 'Widget');
        setMessage(''); // clear the input
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
        return;
      }
    }

    // Send typing indicator immediately when starting to type
    if (value.length > 0 && !isTypingRef.current) {
      isTypingRef.current = true;
      onTyping?.(true);
    }

    // If input is empty, stop typing immediately
    if (value.length === 0 && isTypingRef.current) {
      isTypingRef.current = false;
      onTyping?.(false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      return;
    }

    // Reset the stop-typing timeout
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      onTyping?.(false);
    }, 2000);

    // Mention detection: find '@' before cursor
    detectMention(value, e.target.selectionStart ?? value.length);
  };

  // ─── Mention Helpers ──────────────────────────────────
  const filteredMembers = (members || []).filter(m => {
    if (mentionQuery === null) return false;
    if (mentionQuery === '') return true; // show all on just '@'
    const q = mentionQuery.toLowerCase();
    return m.displayName.toLowerCase().includes(q) || m.username.toLowerCase().includes(q);
  }).slice(0, 8);

  function detectMention(text: string, cursorPos: number) {
    // Look backwards from cursor for '@'
    const before = text.slice(0, cursorPos);
    const match = before.match(/@([^@\s]*)$/);
    if (match) {
      mentionStartPos.current = cursorPos - match[0].length;
      setMentionQuery(match[1]);
      setMentionIndex(0);
    } else {
      closeMention();
    }
  }

  function closeMention() {
    setMentionQuery(null);
    setMentionIndex(0);
    mentionStartPos.current = -1;
  }

  function insertMention(member: MentionMember) {
    const startPos = mentionStartPos.current;
    if (startPos < 0) return;
    const cursorPos = textareaRef.current?.selectionStart ?? message.length;
    const before = message.slice(0, startPos);
    const after = message.slice(cursorPos);
    const mentionText = `@${member.displayName} `;
    const newMessage = before + mentionText + after;
    setMessage(newMessage);
    closeMention();
    // Set cursor after mention
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const pos = before.length + mentionText.length;
        textareaRef.current.selectionStart = pos;
        textareaRef.current.selectionEnd = pos;
        textareaRef.current.focus();
      }
    });
  }

  // ─── File Handling ────────────────────────────────────
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setPendingFiles(prev => [...prev, ...files]);
    }
    e.target.value = '';
    setIsAttachMenuOpen(false);
  };

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0 && onSendFolder) {
      // Extract folder name from webkitRelativePath (e.g. "MyFolder/file.txt" -> "MyFolder")
      const firstPath = (files[0] as any).webkitRelativePath || files[0].name;
      const folderName = firstPath.split('/')[0] || 'Folder';
      onSendFolder(folderName, files);
    }
    e.target.value = '';
    setIsAttachMenuOpen(false);
  };

  const removePendingFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return '🖼️';
    if (file.type.startsWith('video/')) return '🎬';
    if (file.type.startsWith('audio/')) return '🎵';
    if (file.type.includes('pdf')) return '📄';
    if (file.type.includes('zip') || file.type.includes('rar') || file.type.includes('7z')) return '📦';
    if (file.type.includes('word') || file.type.includes('document')) return '📝';
    if (file.type.includes('sheet') || file.type.includes('excel')) return '📊';
    return '📎';
  };

  // ─── Voice Recording ──────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const durationMs = Date.now() - recordingStartRef.current;
        if (durationMs > 500 && onSendVoice) {
          onSendVoice(audioBlob, durationMs);
        }
      };

      mediaRecorder.start(250); // collect data every 250ms
      recordingStartRef.current = Date.now();
      setIsRecording(true);
      setRecordingDuration(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(Date.now() - recordingStartRef.current);
      }, 100);
    } catch (err) {
      console.error('Microphone access denied:', err);
      alert('Không thể truy cập microphone. Vui lòng cấp quyền.');
    }
  }, [onSendVoice]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecording(false);
    setRecordingDuration(0);
  }, []);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = () => {
        mediaRecorderRef.current = null;
      };
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    audioChunksRef.current = [];
    setIsRecording(false);
    setRecordingDuration(0);
  }, []);

  const formatDuration = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const mm = Math.floor(s / 60).toString().padStart(2, '0');
    const ss = (s % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  // ─── Recording UI ─────────────────────────────────────
  if (isRecording) {
    return (
      <div className="flex items-center gap-3 rounded-3xl border border-rose-200 bg-rose-50/80 p-3 shadow-sm dark:border-rose-900/40 dark:bg-rose-950/30">
        <div className="flex items-center gap-2 flex-1">
          <div className="h-3 w-3 rounded-full bg-rose-500 animate-pulse" />
          <span className="text-sm font-bold text-rose-600 dark:text-rose-400 tabular-nums">
            {formatDuration(recordingDuration)}
          </span>
          <span className="text-xs text-rose-500 dark:text-rose-400">Đang ghi âm...</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={cancelRecording}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-200 text-zinc-600 transition-all hover:bg-zinc-300 active:scale-95 dark:bg-zinc-700 dark:text-zinc-300"
            title="Hủy"
          >
            <X className="h-4 w-4" />
          </button>
          <button
            onClick={stopRecording}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-500 text-white shadow-md transition-all hover:bg-rose-600 hover:scale-105 active:scale-95"
            title="Dừng và gửi"
          >
            <Send className="h-4 w-4 ml-0.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {/* Reply/Edit Preview Bar */}
      {replyEdit && (
        <div className={cn(
          "flex items-center gap-2 rounded-t-2xl border border-b-0 px-3 py-2 text-sm",
          replyEdit.mode === 'reply'
            ? "border-sky-200 bg-sky-50/80 dark:border-sky-800/40 dark:bg-sky-950/30"
            : "border-amber-200 bg-amber-50/80 dark:border-amber-800/40 dark:bg-amber-950/30"
        )}>
          <div className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
            replyEdit.mode === 'reply'
              ? "bg-sky-200 dark:bg-sky-800/40"
              : "bg-amber-200 dark:bg-amber-800/40"
          )}>
            {replyEdit.mode === 'reply'
              ? <Reply className="h-3 w-3 text-sky-600 dark:text-sky-400" />
              : <Pencil className="h-3 w-3 text-amber-600 dark:text-amber-400" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className={cn(
              "text-[11px] font-bold",
              replyEdit.mode === 'reply' ? "text-sky-600 dark:text-sky-400" : "text-amber-600 dark:text-amber-400"
            )}>
              {replyEdit.mode === 'reply' ? `↩ ${replyEdit.senderName}` : '✏️ Chỉnh sửa tin nhắn'}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{replyEdit.content}</p>
          </div>
          <button
            onClick={onCancelReplyEdit}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Widget Paste Preview Bar */}
      {pendingWidget && (
        <div className="flex items-center gap-2 rounded-t-2xl border border-b-0 border-violet-200 bg-violet-50/80 px-3 py-2 text-sm dark:border-violet-800/40 dark:bg-violet-950/30 animate-in fade-in slide-in-from-bottom-1 duration-200">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-200 dark:bg-violet-800/40">
            <Code2 className="h-3 w-3 text-violet-600 dark:text-violet-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-violet-600 dark:text-violet-400">🧩 Widget sẵn sàng gửi</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{widgetPreviewTitle}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setPendingWidget(null); setWidgetPreviewTitle(''); }}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
              title="Hủy widget"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
      {/* Pending Files Preview */}
      {pendingFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 px-2">
          {pendingFiles.map((file, idx) => (
            <div
              key={`${file.name}-${idx}`}
              className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800 group animate-in fade-in zoom-in-95 duration-200"
            >
              <span className="text-base">{getFileIcon(file)}</span>
              <div className="max-w-[120px]">
                <p className="truncate font-medium text-zinc-700 dark:text-zinc-200">{file.name}</p>
                <p className="text-zinc-400">{formatFileSize(file.size)}</p>
              </div>
              <button
                onClick={() => removePendingFile(idx)}
                className="flex h-5 w-5 items-center justify-center rounded-full text-zinc-400 hover:bg-rose-100 hover:text-rose-500 transition-colors dark:hover:bg-rose-900/30"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main Input */}
      <div className="relative flex items-end gap-1 rounded-2xl border border-zinc-200 bg-white p-1 lg:p-1.5 shadow-sm transition-all focus-within:border-sky-500 focus-within:ring-4 focus-within:ring-sky-500/10 dark:border-zinc-800 dark:bg-zinc-900 dark:focus-within:border-sky-500/50">
        {/* Attach Button */}
        <div className="relative" ref={attachMenuRef}>
          <button
            type="button"
            onClick={() => setIsAttachMenuOpen(!isAttachMenuOpen)}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300",
              isAttachMenuOpen && "bg-sky-50 text-sky-500 dark:bg-sky-900/20 dark:text-sky-400"
            )}
          >
            <Paperclip className="h-4 w-4" />
          </button>

          {isAttachMenuOpen && (
            <div className="absolute bottom-full left-0 mb-2 w-48 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-2xl ring-1 ring-black/5 dark:border-zinc-700 dark:bg-zinc-900 animate-in fade-in slide-in-from-bottom-2 zoom-in-95 duration-200">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-700 hover:bg-sky-50 hover:text-sky-700 dark:text-zinc-200 dark:hover:bg-sky-900/20 dark:hover:text-sky-400 transition-colors"
              >
                <File className="h-4 w-4" />
                Chọn file
              </button>
              <button
                onClick={() => folderInputRef.current?.click()}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-700 hover:bg-sky-50 hover:text-sky-700 dark:text-zinc-200 dark:hover:bg-sky-900/20 dark:hover:text-sky-400 transition-colors"
              >
                <FolderOpen className="h-4 w-4" />
                Chọn thư mục
              </button>
              <div className="my-1 h-px bg-zinc-100 dark:bg-zinc-800" />
              <button
                onClick={() => { setIsAttachMenuOpen(false); onSendContact?.(); }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-700 hover:bg-sky-50 hover:text-sky-700 dark:text-zinc-200 dark:hover:bg-sky-900/20 dark:hover:text-sky-400 transition-colors"
              >
                <Contact className="h-4 w-4" />
                Gửi danh thiếp
              </button>
              <button
                onClick={() => { setIsAttachMenuOpen(false); onOpenPollDialog?.(); }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-700 hover:bg-sky-50 hover:text-sky-700 dark:text-zinc-200 dark:hover:bg-sky-900/20 dark:hover:text-sky-400 transition-colors"
              >
                <BarChart3 className="h-4 w-4" />
                Tạo bình chọn
              </button>
              <button
                onClick={() => { setIsAttachMenuOpen(false); onOpenReminderDialog?.(); }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-700 hover:bg-sky-50 hover:text-sky-700 dark:text-zinc-200 dark:hover:bg-sky-900/20 dark:hover:text-sky-400 transition-colors"
              >
                <AlarmClock className="h-4 w-4" />
                Nhắc hẹn
              </button>
              <button
                onClick={() => { setIsAttachMenuOpen(false); setIsScheduleOpen(true); }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-700 hover:bg-sky-50 hover:text-sky-700 dark:text-zinc-200 dark:hover:bg-sky-900/20 dark:hover:text-sky-400 transition-colors"
              >
                <Clock className="h-4 w-4" />
                Hẹn giờ gửi
              </button>
            </div>
          )}

          {/* Schedule Picker */}
          {isScheduleOpen && (
            <div className="absolute bottom-full left-0 mb-2 w-64 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl p-4 z-50">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">⏰ Hẹn giờ gửi</h4>
                <button onClick={() => setIsScheduleOpen(false)} className="text-zinc-400 hover:text-zinc-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
              {!message.trim() && (
                <p className="text-xs text-amber-600 mb-2">Nhập tin nhắn trước khi hẹn giờ</p>
              )}
              <div className="grid grid-cols-2 gap-2 mb-3">
                {[
                  { label: '5 phút', ms: 5 * 60 * 1000 },
                  { label: '30 phút', ms: 30 * 60 * 1000 },
                  { label: '1 giờ', ms: 60 * 60 * 1000 },
                  { label: '3 giờ', ms: 3 * 60 * 60 * 1000 },
                ].map(opt => (
                  <button
                    key={opt.label}
                    disabled={!message.trim()}
                    onClick={() => {
                      const sendAt = Date.now() + opt.ms;
                      onScheduleMessage?.(message.trim(), sendAt);
                      setMessage('');
                      setIsScheduleOpen(false);
                      if (textareaRef.current) textareaRef.current.style.height = 'auto';
                    }}
                    className="rounded-lg border border-zinc-200 dark:border-zinc-700 px-3 py-2 text-xs font-medium hover:bg-sky-50 dark:hover:bg-sky-900/20 disabled:opacity-40 transition-colors"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <input
                type="datetime-local"
                min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                onChange={(e) => {
                  if (!message.trim() || !e.target.value) return;
                  const sendAt = new Date(e.target.value).getTime();
                  if (sendAt <= Date.now()) return;
                  onScheduleMessage?.(message.trim(), sendAt);
                  setMessage('');
                  setIsScheduleOpen(false);
                  if (textareaRef.current) textareaRef.current.style.height = 'auto';
                }}
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          )}
        </div>

        {/* Hidden File Inputs */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          // @ts-expect-error: webkitdirectory is not in standard types
          webkitdirectory=""
          directory=""
          className="hidden"
          onChange={handleFolderSelect}
        />

        <textarea
          ref={textareaRef}
          data-chat-input
          value={message}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || "Nhập tin nhắn..."}
          rows={1}
          disabled={disabled}
          className="max-h-[120px] min-h-[28px] lg:min-h-[32px] flex-1 resize-none bg-transparent py-1 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-zinc-100 scrollbar-hide"
        />

        {/* Mention Dropdown */}
        {mentionQuery !== null && filteredMembers.length > 0 && (
          <div
            ref={mentionRef}
            className="absolute bottom-full left-0 right-0 mb-1 max-h-[240px] overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900 animate-in fade-in slide-in-from-bottom-2 duration-150 z-50"
          >
            {filteredMembers.map((member, idx) => (
              <button
                key={member.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault(); // prevent blur
                  insertMention(member);
                }}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors",
                  idx === mentionIndex
                    ? "bg-sky-50 dark:bg-sky-900/30"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-800"
                )}
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                  {member.displayName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-zinc-900 dark:text-zinc-100 truncate">{member.displayName}</p>
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate">@{member.username}</p>
                </div>
                <AtSign className="h-3.5 w-3.5 shrink-0 text-zinc-300 dark:text-zinc-600" />
              </button>
            ))}
          </div>
        )}

        <div className="flex shrink-0 items-center gap-0.5 self-end">
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsStickerOpen(!isStickerOpen)}
              className={cn(
                "flex h-8 w-8 lg:h-7 lg:w-7 items-center justify-center rounded-full transition-colors",
                isStickerOpen
                  ? "bg-sky-50 text-sky-500 dark:bg-sky-900/20 dark:text-sky-400"
                  : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
              )}
              title="Sticker"
            >
              <Smile className="h-5 w-5 lg:h-4 lg:w-4" />
            </button>
            <StickerPicker
              isOpen={isStickerOpen}
              onClose={() => setIsStickerOpen(false)}
              onSelectSticker={(packId, stickerId, stickerUrl) => {
                onSendSticker?.(packId, stickerId, stickerUrl);
              }}
            />
          </div>

          {/* Voice / Send toggle */}
          {pendingWidget ? (
            <button
              onClick={() => handleSubmit()}
              disabled={disabled}
              className={cn(
                "flex h-8 w-8 lg:h-7 lg:w-7 items-center justify-center rounded-full transition-all",
                "bg-violet-600 text-white shadow-md hover:bg-violet-700 hover:scale-105 active:scale-95"
              )}
              title="Gửi widget"
            >
              <Zap className="h-4 w-4 lg:h-3.5 lg:w-3.5" />
            </button>
          ) : message.trim() || pendingFiles.length > 0 ? (
            <button
              onClick={() => handleSubmit()}
              disabled={disabled || isUploading}
              className={cn(
                "flex h-8 w-8 lg:h-7 lg:w-7 items-center justify-center rounded-full transition-all",
                "bg-sky-600 text-white shadow-md hover:bg-sky-700 hover:scale-105 active:scale-95"
              )}
            >
              {isUploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-4 w-4 lg:h-3.5 lg:w-3.5" />
              )}
            </button>
          ) : (
            <button
              onClick={startRecording}
              disabled={disabled}
              className={cn(
                "flex h-8 w-8 lg:h-7 lg:w-7 items-center justify-center rounded-full transition-all",
                disabled
                  ? "bg-zinc-100 text-zinc-300 dark:bg-zinc-800 dark:text-zinc-600 cursor-not-allowed"
                  : "bg-sky-600 text-white shadow-md hover:bg-sky-700 hover:scale-105 active:scale-95"
              )}
              title="Ghi âm tin nhắn thoại"
            >
              <Mic className="h-4 w-4 lg:h-3.5 lg:w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

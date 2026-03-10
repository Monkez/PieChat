'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Paperclip, Smile, Mic, Square, FolderOpen, File, X, Loader2, Contact, BarChart3, AlarmClock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StickerPicker } from './sticker-picker';

interface ChatInputProps {
  onSendMessage: (content: string) => void;
  onSendFiles?: (files: File[]) => void;
  onSendFolder?: (folderName: string, files: File[]) => void;
  onSendVoice?: (blob: Blob, durationMs: number) => void;
  onSendContact?: () => void;
  onSendSticker?: (packId: string, stickerId: string, stickerUrl: string) => void;
  onOpenPollDialog?: () => void;
  onOpenReminderDialog?: () => void;
  placeholder?: string;
  disabled?: boolean;
}

export function ChatInput({ onSendMessage, onSendFiles, onSendFolder, onSendVoice, onSendContact, onSendSticker, onOpenPollDialog, onOpenReminderDialog, placeholder, disabled }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [isAttachMenuOpen, setIsAttachMenuOpen] = useState(false);
  const [isStickerOpen, setIsStickerOpen] = useState(false);
  const attachMenuRef = useRef<HTMLDivElement>(null);

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

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (disabled) return;

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

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

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
    <div className="space-y-2">
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
          value={message}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || "Nhập tin nhắn..."}
          rows={1}
          disabled={disabled}
          className="max-h-[120px] min-h-[28px] lg:min-h-[32px] flex-1 resize-none bg-transparent py-1 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-zinc-100 scrollbar-hide"
        />

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
          {message.trim() || pendingFiles.length > 0 ? (
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

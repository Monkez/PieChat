'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Bell, Calendar, Clock, AlarmClock } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ReminderData {
  title: string;
  deadline: number; // timestamp
}

interface ReminderCreateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateReminder: (data: ReminderData) => void;
}

export function ReminderCreateDialog({ isOpen, onClose, onCreateReminder }: ReminderCreateDialogProps) {
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<'preset' | 'custom'>('preset');
  const [presetMinutes, setPresetMinutes] = useState(30);
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState('');

  if (!isOpen) return null;

  const PRESETS = [
    { label: '5 phút', value: 5, icon: '⚡' },
    { label: '15 phút', value: 15, icon: '🔔' },
    { label: '30 phút', value: 30, icon: '⏰' },
    { label: '1 giờ', value: 60, icon: '🕐' },
    { label: '2 giờ', value: 120, icon: '🕑' },
    { label: '6 giờ', value: 360, icon: '🕕' },
    { label: '12 giờ', value: 720, icon: '🌙' },
    { label: '1 ngày', value: 1440, icon: '📅' },
    { label: '3 ngày', value: 4320, icon: '📆' },
    { label: '1 tuần', value: 10080, icon: '🗓️' },
  ];

  const getDeadline = (): number | null => {
    if (mode === 'preset') {
      return Date.now() + presetMinutes * 60 * 1000;
    }
    if (customDate && customTime) {
      const dt = new Date(`${customDate}T${customTime}`);
      if (dt.getTime() > Date.now()) return dt.getTime();
    }
    return null;
  };

  const canSubmit = title.trim().length > 0 && getDeadline() !== null;

  const handleSubmit = () => {
    const deadline = getDeadline();
    if (!canSubmit || !deadline) return;
    onCreateReminder({ title: title.trim(), deadline });
    setTitle('');
    setPresetMinutes(30);
    setCustomDate('');
    setCustomTime('');
    setMode('preset');
    onClose();
  };

  // Format preview time
  const formatPreview = (): string => {
    const dl = getDeadline();
    if (!dl) return '';
    const d = new Date(dl);
    return d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  // Min date for custom picker
  const now = new Date();
  const minDate = now.toISOString().split('T')[0];
  const minTime = customDate === minDate
    ? `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
    : '00:00';

  return createPortal(
    <div className="fixed inset-0 z-[9999]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-48px)] max-w-[340px] flex flex-col max-h-[70vh] rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 dark:bg-zinc-900 dark:ring-zinc-700 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2.5 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <AlarmClock className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Tạo nhắc hẹn</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-hide">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1">Nội dung nhắc hẹn</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ví dụ: Họp nhóm lúc 3h chiều..."
              maxLength={200}
              autoFocus
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-300 focus:ring-2 focus:ring-amber-100 focus:outline-none transition-all dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          {/* Mode tabs */}
          <div className="flex gap-1 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800">
            <button
              onClick={() => setMode('preset')}
              className={cn(
                "flex-1 rounded-md py-1.5 text-xs font-medium transition-all",
                mode === 'preset'
                  ? "bg-white text-amber-600 shadow-sm dark:bg-zinc-700 dark:text-amber-400"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400"
              )}
            >
              <Clock className="inline h-3 w-3 mr-1" /> Nhanh
            </button>
            <button
              onClick={() => setMode('custom')}
              className={cn(
                "flex-1 rounded-md py-1.5 text-xs font-medium transition-all",
                mode === 'custom'
                  ? "bg-white text-amber-600 shadow-sm dark:bg-zinc-700 dark:text-amber-400"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400"
              )}
            >
              <Calendar className="inline h-3 w-3 mr-1" /> Tùy chọn
            </button>
          </div>

          {/* Preset grid */}
          {mode === 'preset' && (
            <div className="grid grid-cols-2 gap-1.5 animate-in fade-in duration-150">
              {PRESETS.map(p => (
                <button
                  key={p.value}
                  onClick={() => setPresetMinutes(p.value)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all text-left",
                    presetMinutes === p.value
                      ? "bg-amber-500 text-white shadow-md shadow-amber-500/20 scale-[1.02]"
                      : "bg-zinc-50 text-zinc-600 hover:bg-amber-50 hover:text-amber-600 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-amber-900/20"
                  )}
                >
                  <span className="text-sm">{p.icon}</span>
                  {p.label}
                </button>
              ))}
            </div>
          )}

          {/* Custom date/time */}
          {mode === 'custom' && (
            <div className="space-y-2 animate-in fade-in duration-150">
              <div>
                <label className="block text-[10px] font-medium text-zinc-400 mb-1">Ngày</label>
                <input
                  type="date"
                  value={customDate}
                  min={minDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:border-amber-300 focus:ring-1 focus:ring-amber-100 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-zinc-400 mb-1">Giờ</label>
                <input
                  type="time"
                  value={customTime}
                  min={minTime}
                  onChange={(e) => setCustomTime(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:border-amber-300 focus:ring-1 focus:ring-amber-100 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
            </div>
          )}

          {/* Preview */}
          {canSubmit && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 dark:bg-amber-900/20 animate-in fade-in duration-200">
              <Bell className="h-3.5 w-3.5 text-amber-500 animate-bounce" />
              <span className="text-[11px] text-amber-700 dark:text-amber-300">
                Sẽ nhắc lúc <strong>{formatPreview()}</strong>
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-100 px-4 py-2.5 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 transition-colors"
            >
              Hủy
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={cn(
                "flex-1 rounded-lg px-3 py-2 text-xs font-bold transition-all",
                canSubmit
                  ? "bg-amber-500 text-white hover:bg-amber-600 shadow-md shadow-amber-500/20 active:scale-[0.98]"
                  : "bg-zinc-100 text-zinc-400 cursor-not-allowed dark:bg-zinc-800 dark:text-zinc-600"
              )}
            >
              Đặt nhắc hẹn
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

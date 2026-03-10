'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, Clock, BarChart3, Eye, EyeOff, CheckSquare, Square } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PollData {
  question: string;
  options: string[];
  allowMultiple: boolean;
  anonymous: boolean;
  deadline: number | null; // timestamp or null
}

interface PollCreateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreatePoll: (poll: PollData) => void;
}

export function PollCreateDialog({ isOpen, onClose, onCreatePoll }: PollCreateDialogProps) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [hasDeadline, setHasDeadline] = useState(false);
  const [deadlineMinutes, setDeadlineMinutes] = useState(60);

  if (!isOpen) return null;

  const addOption = () => {
    if (options.length < 10) {
      setOptions([...options, '']);
    }
  };

  const removeOption = (index: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const updateOption = (index: number, value: string) => {
    setOptions(options.map((opt, i) => (i === index ? value : opt)));
  };

  const canSubmit = question.trim().length > 0 && options.filter(o => o.trim().length > 0).length >= 2;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const validOptions = options.filter(o => o.trim().length > 0).map(o => o.trim());
    const deadline = hasDeadline ? Date.now() + deadlineMinutes * 60 * 1000 : null;
    onCreatePoll({
      question: question.trim(),
      options: validOptions,
      allowMultiple,
      anonymous,
      deadline,
    });
    // Reset
    setQuestion('');
    setOptions(['', '']);
    setAllowMultiple(false);
    setAnonymous(false);
    setHasDeadline(false);
    setDeadlineMinutes(60);
    onClose();
  };

  const DEADLINE_PRESETS = [
    { label: '5 phút', value: 5 },
    { label: '15 phút', value: 15 },
    { label: '30 phút', value: 30 },
    { label: '1 giờ', value: 60 },
    { label: '6 giờ', value: 360 },
    { label: '12 giờ', value: 720 },
    { label: '1 ngày', value: 1440 },
    { label: '3 ngày', value: 4320 },
    { label: '1 tuần', value: 10080 },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[9999]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      
      {/* Dialog — absolute centered */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-48px)] max-w-[340px] flex flex-col max-h-[65vh] rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 dark:bg-zinc-900 dark:ring-zinc-700 animate-in fade-in zoom-in-95 duration-200">
        {/* Header — compact inline */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2.5 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Tạo bình chọn</h2>
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
          {/* Question */}
          <div>
            <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1">Câu hỏi</label>
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Nhập câu hỏi..."
              maxLength={200}
              autoFocus
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-sky-300 focus:ring-2 focus:ring-sky-100 focus:outline-none transition-all dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          {/* Options */}
          <div>
            <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1">
              Lựa chọn ({options.filter(o => o.trim()).length}/{options.length})
            </label>
            <div className="space-y-1.5">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[9px] font-bold text-sky-600 dark:bg-sky-900/30 dark:text-sky-400">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <input
                    value={opt}
                    onChange={(e) => updateOption(i, e.target.value)}
                    placeholder={`Lựa chọn ${i + 1}`}
                    maxLength={100}
                    className="flex-1 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-sky-300 focus:ring-1 focus:ring-sky-100 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                  {options.length > 2 && (
                    <button
                      onClick={() => removeOption(i)}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-300 hover:bg-rose-50 hover:text-rose-500 transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {options.length < 10 && (
              <button
                onClick={addOption}
                className="mt-1.5 flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-900/20 transition-colors"
              >
                <Plus className="h-3 w-3" />
                Thêm lựa chọn
              </button>
            )}
          </div>

          {/* Settings — compact inline toggles */}
          <div className="space-y-1 rounded-lg border border-zinc-100 bg-zinc-50/50 p-2.5 dark:border-zinc-800 dark:bg-zinc-800/30">
            {/* Allow Multiple */}
            <button
              onClick={() => setAllowMultiple(!allowMultiple)}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 hover:bg-white dark:hover:bg-zinc-800 transition-colors"
            >
              <div className="flex items-center gap-2">
                <CheckSquare className="h-3.5 w-3.5 text-zinc-400" />
                <span className="text-xs text-zinc-700 dark:text-zinc-300">Chọn nhiều</span>
              </div>
              <div className={cn(
                "h-4 w-7 rounded-full transition-colors relative",
                allowMultiple ? "bg-sky-500" : "bg-zinc-300 dark:bg-zinc-600"
              )}>
                <div className={cn(
                  "absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform",
                  allowMultiple ? "translate-x-3" : "translate-x-0.5"
                )} />
              </div>
            </button>

            {/* Anonymous */}
            <button
              onClick={() => setAnonymous(!anonymous)}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 hover:bg-white dark:hover:bg-zinc-800 transition-colors"
            >
              <div className="flex items-center gap-2">
                {anonymous ? <EyeOff className="h-3.5 w-3.5 text-zinc-400" /> : <Eye className="h-3.5 w-3.5 text-zinc-400" />}
                <span className="text-xs text-zinc-700 dark:text-zinc-300">Ẩn danh</span>
              </div>
              <div className={cn(
                "h-4 w-7 rounded-full transition-colors relative",
                anonymous ? "bg-sky-500" : "bg-zinc-300 dark:bg-zinc-600"
              )}>
                <div className={cn(
                  "absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform",
                  anonymous ? "translate-x-3" : "translate-x-0.5"
                )} />
              </div>
            </button>

            {/* Deadline Toggle */}
            <button
              onClick={() => setHasDeadline(!hasDeadline)}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 hover:bg-white dark:hover:bg-zinc-800 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-zinc-400" />
                <span className="text-xs text-zinc-700 dark:text-zinc-300">Thời hạn</span>
              </div>
              <div className={cn(
                "h-4 w-7 rounded-full transition-colors relative",
                hasDeadline ? "bg-sky-500" : "bg-zinc-300 dark:bg-zinc-600"
              )}>
                <div className={cn(
                  "absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform",
                  hasDeadline ? "translate-x-3" : "translate-x-0.5"
                )} />
              </div>
            </button>

            {/* Deadline Presets */}
            {hasDeadline && (
              <div className="pt-1 pl-6 flex flex-wrap gap-1 animate-in fade-in slide-in-from-top-1 duration-200">
                {DEADLINE_PRESETS.map(p => (
                  <button
                    key={p.value}
                    onClick={() => setDeadlineMinutes(p.value)}
                    className={cn(
                      "rounded-md px-2 py-1 text-[10px] font-medium transition-all",
                      deadlineMinutes === p.value
                        ? "bg-sky-500 text-white shadow-sm"
                        : "bg-white text-zinc-500 hover:bg-sky-50 hover:text-sky-600 dark:bg-zinc-800 dark:text-zinc-400"
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer — compact */}
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
                  ? "bg-sky-500 text-white hover:bg-sky-600 shadow-md shadow-sky-500/20 active:scale-[0.98]"
                  : "bg-zinc-100 text-zinc-400 cursor-not-allowed dark:bg-zinc-800 dark:text-zinc-600"
              )}
            >
              Tạo bình chọn
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

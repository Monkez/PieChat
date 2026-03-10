'use client';

import { useState, useEffect, useMemo } from 'react';
import { BarChart3, Clock, Check, Users, Lock, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PollOption {
  id: string;
  text: string;
}

export interface PollVote {
  optionId: string;
  userId: string;
}

export interface PollInfo {
  pollId: string;
  question: string;
  options: PollOption[];
  allowMultiple: boolean;
  anonymous: boolean;
  deadline: number | null;
  creatorId: string;
  votes: PollVote[];
}

interface PollCardProps {
  poll: PollInfo;
  currentUserId: string;
  isMe: boolean;
  onVote: (pollId: string, optionIds: string[]) => void;
}

export function PollCard({ poll, currentUserId, isMe, onVote }: PollCardProps) {
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(new Set());
  const [hasVoted, setHasVoted] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');
  const [isExpired, setIsExpired] = useState(false);

  // Check if user already voted
  const myVotes = useMemo(() =>
    poll.votes.filter(v => v.userId === currentUserId).map(v => v.optionId),
    [poll.votes, currentUserId]
  );

  useEffect(() => {
    if (myVotes.length > 0) {
      setHasVoted(true);
      setSelectedOptions(new Set(myVotes));
    }
  }, [myVotes]);

  // Countdown timer
  useEffect(() => {
    if (!poll.deadline) return;
    const tick = () => {
      const remaining = poll.deadline! - Date.now();
      if (remaining <= 0) {
        setIsExpired(true);
        setTimeLeft('Đã kết thúc');
        return;
      }
      const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
      const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
      if (days > 0) setTimeLeft(`${days}d ${hours}h`);
      else if (hours > 0) setTimeLeft(`${hours}h ${mins}m`);
      else setTimeLeft(`${mins} phút`);
    };
    tick();
    const interval = setInterval(tick, 30000);
    return () => clearInterval(interval);
  }, [poll.deadline]);

  const totalVotes = poll.votes.length;
  const uniqueVoters = new Set(poll.votes.map(v => v.userId)).size;

  const optionVoteCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const opt of poll.options) {
      counts[opt.id] = poll.votes.filter(v => v.optionId === opt.id).length;
    }
    return counts;
  }, [poll.options, poll.votes]);

  const maxVotes = Math.max(...Object.values(optionVoteCounts), 1);

  const toggleOption = (optionId: string) => {
    if (isExpired || hasVoted) return;
    setSelectedOptions(prev => {
      const next = new Set(prev);
      if (next.has(optionId)) {
        next.delete(optionId);
      } else {
        if (!poll.allowMultiple) next.clear();
        next.add(optionId);
      }
      return next;
    });
  };

  const handleVote = () => {
    if (selectedOptions.size === 0 || isExpired) return;
    onVote(poll.pollId, Array.from(selectedOptions));
    setHasVoted(true);
  };

  const showResults = hasVoted || isExpired;

  return (
    <div className={cn(
      "w-full rounded-xl overflow-hidden",
      !isMe && "bg-zinc-50 dark:bg-zinc-800/50"
    )}>
      {/* Header */}
      <div className="flex items-start gap-2.5 p-3 pb-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400">
          <BarChart3 className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 leading-tight">
            {poll.question}
          </p>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            {poll.allowMultiple && (
              <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-1.5 py-0.5 text-[9px] font-medium text-sky-600 dark:bg-sky-900/20 dark:text-sky-400">
                <Check className="h-2.5 w-2.5" /> Chọn nhiều
              </span>
            )}
            {poll.anonymous && (
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">
                <EyeOff className="h-2.5 w-2.5" /> Ẩn danh
              </span>
            )}
            {poll.deadline && (
              <span className={cn(
                "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-medium",
                isExpired
                  ? "bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400"
                  : "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400"
              )}>
                {isExpired ? <Lock className="h-2.5 w-2.5" /> : <Clock className="h-2.5 w-2.5" />}
                {timeLeft}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Options */}
      <div className="px-3 pb-2 space-y-1.5">
        {poll.options.map((opt) => {
          const count = optionVoteCounts[opt.id] || 0;
          const percent = totalVotes > 0 ? Math.round((count / uniqueVoters) * 100) : 0;
          const isSelected = selectedOptions.has(opt.id);
          const isWinner = showResults && count === maxVotes && count > 0;

          return (
            <button
              key={opt.id}
              onClick={() => toggleOption(opt.id)}
              disabled={isExpired || hasVoted}
              className={cn(
                "relative w-full rounded-lg text-left transition-all overflow-hidden",
                "border text-sm",
                isExpired || hasVoted ? "cursor-default" : "cursor-pointer hover:border-sky-300 active:scale-[0.99]",
                isSelected && !showResults
                  ? "border-sky-400 bg-sky-50 dark:border-sky-600 dark:bg-sky-900/20"
                  : "border-zinc-200 dark:border-zinc-700",
                isWinner && "border-violet-300 dark:border-violet-700"
              )}
            >
              {/* Results bar */}
              {showResults && (
                <div
                  className={cn(
                    "absolute inset-0 transition-all duration-500 ease-out rounded-lg",
                    isWinner
                      ? "bg-violet-100/70 dark:bg-violet-900/20"
                      : "bg-zinc-100/70 dark:bg-zinc-700/20"
                  )}
                  style={{ width: `${percent}%` }}
                />
              )}
              <div className="relative flex items-center gap-2.5 px-3 py-2.5">
                {/* Checkbox/Radio */}
                <div className={cn(
                  "flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-md border transition-colors",
                  poll.allowMultiple ? "rounded-md" : "rounded-full",
                  isSelected
                    ? "border-sky-500 bg-sky-500 text-white"
                    : "border-zinc-300 dark:border-zinc-600"
                )}>
                  {isSelected && <Check className="h-3 w-3" />}
                </div>
                <span className={cn(
                  "flex-1 font-medium",
                  isWinner ? "text-violet-700 dark:text-violet-300" : "text-zinc-700 dark:text-zinc-300"
                )}>
                  {opt.text}
                </span>
                {showResults && (
                  <span className={cn(
                    "text-xs font-bold shrink-0",
                    isWinner ? "text-violet-600 dark:text-violet-400" : "text-zinc-400"
                  )}>
                    {percent}%
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-zinc-100 dark:border-zinc-700/50">
        <div className="flex items-center gap-1 text-[10px] text-zinc-400">
          <Users className="h-3 w-3" />
          <span>{uniqueVoters} lượt bầu</span>
        </div>
        {!hasVoted && !isExpired && (
          <button
            onClick={handleVote}
            disabled={selectedOptions.size === 0}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-bold transition-all",
              selectedOptions.size > 0
                ? "bg-sky-500 text-white hover:bg-sky-600 active:scale-95 shadow-sm"
                : "bg-zinc-100 text-zinc-400 cursor-not-allowed dark:bg-zinc-800 dark:text-zinc-600"
            )}
          >
            Bình chọn
          </button>
        )}
        {hasVoted && (
          <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-500">
            <Check className="h-3 w-3" /> Đã bình chọn
          </span>
        )}
      </div>
    </div>
  );
}

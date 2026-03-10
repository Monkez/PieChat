'use client';

import { useUiStore } from '@/lib/store/ui-store';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export default function LanguageSwitcher() {
  const { language, setLanguage } = useUiStore();

  return (
    <div className="inline-flex items-center rounded-md border border-zinc-200 bg-white p-0.5 dark:border-zinc-700 dark:bg-zinc-900">
      <button
        type="button"
        onClick={() => setLanguage('vi')}
        className={cn(
          'rounded px-2 py-1 text-xs font-medium transition-colors',
          language === 'vi'
            ? 'bg-black text-white dark:bg-white dark:text-black'
            : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800',
        )}
      >
        VI
      </button>
      <button
        type="button"
        onClick={() => setLanguage('en')}
        className={cn(
          'rounded px-2 py-1 text-xs font-medium transition-colors',
          language === 'en'
            ? 'bg-black text-white dark:bg-white dark:text-black'
            : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800',
        )}
      >
        EN
      </button>
    </div>
  );
}

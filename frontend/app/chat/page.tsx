'use client';

import { MessageSquare } from 'lucide-react';
import { useUiStore } from '@/lib/store/ui-store';
import { t } from '@/lib/i18n';

export default function ChatPage() {
  const { language } = useUiStore();

  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center text-zinc-500">
      <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-sky-100 dark:bg-sky-900/30">
        <MessageSquare className="h-10 w-10 text-sky-500 dark:text-sky-300" />
      </div>
      <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
        {t(language, 'chatSelectConversation')}
      </h3>
      <p className="mt-2 max-w-sm text-sm">
        {t(language, 'chatSelectHint')}
      </p>
    </div>
  );
}

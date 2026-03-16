'use client';

import Link from 'next/link';

/**
 * PieChat gradient logo header — matches the sidebar header exactly.
 * Only visible on mobile (lg:hidden). Desktop uses the sidebar logo.
 */
export function PieChatLogoHeader() {
  return (
    <div className="lg:hidden px-4 pt-4" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top, 1rem))' }}>
      <div className="flex items-center gap-2 mb-1">
        <Link href="/chat">
          <span className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 bg-clip-text text-transparent drop-shadow-sm">PieChat</span>
        </Link>
      </div>
    </div>
  );
}

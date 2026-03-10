'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { Mail, Lock, User, Loader2 } from 'lucide-react';
import { useUiStore } from '@/lib/store/ui-store';
import { t } from '@/lib/i18n';
import LanguageSwitcher from '@/components/language-switcher';

export default function RegisterPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const { language } = useUiStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setNotice('Server đang tắt đăng ký công khai. Hãy dùng tài khoản do admin tạo.');
    }, 700);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-sky-50 via-white to-sky-100 px-4 py-12 dark:from-[#060b12] dark:via-[#0b1420] dark:to-black sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="mb-4 flex justify-center">
            <LanguageSwitcher />
          </div>
          <Link href="/" className="inline-flex items-center gap-2 text-4xl font-bold tracking-tighter text-sky-700 dark:text-sky-300">
            <Image src="/PieChatIcon.png" alt="PieChat" width={36} height={36} className="rounded-lg" style={{ width: 'auto', height: 'auto' }} />
            <span>PieChat</span>
          </Link>
          <h2 className="mt-6 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            {t(language, 'registerTitle')}
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {t(language, 'registerSubTitle')}{' '}
            <Link href="/login" className="font-medium text-sky-700 hover:text-sky-600 dark:text-sky-300 dark:hover:text-sky-200">
              {t(language, 'registerBackToLogin')}
            </Link>
          </p>
        </div>

        <div className="mt-8 border border-sky-100 bg-white/85 px-4 py-8 shadow sm:rounded-lg sm:px-10 dark:border-sky-900/40 dark:bg-[#101a2a]/80">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {t(language, 'registerUsername')}
              </label>
              <div className="relative mt-1 rounded-md shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <User className="h-5 w-5 text-zinc-400" aria-hidden="true" />
                </div>
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  required
                  className="block w-full rounded-md border-zinc-300 pl-10 focus:border-sky-500 focus:ring-sky-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white dark:placeholder-zinc-400 sm:text-sm py-2 px-3 border"
                  placeholder="cooluser"
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {t(language, 'registerEmail')}
              </label>
              <div className="relative mt-1 rounded-md shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Mail className="h-5 w-5 text-zinc-400" aria-hidden="true" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  className="block w-full rounded-md border-zinc-300 pl-10 focus:border-sky-500 focus:ring-sky-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white dark:placeholder-zinc-400 sm:text-sm py-2 px-3 border"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {t(language, 'registerPassword')}
              </label>
              <div className="relative mt-1 rounded-md shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Lock className="h-5 w-5 text-zinc-400" aria-hidden="true" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  className="block w-full rounded-md border-zinc-300 pl-10 focus:border-sky-500 focus:ring-sky-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white dark:placeholder-zinc-400 sm:text-sm py-2 px-3 border"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {t(language, 'registerConfirmPassword')}
              </label>
              <div className="relative mt-1 rounded-md shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Lock className="h-5 w-5 text-zinc-400" aria-hidden="true" />
                </div>
                <input
                  id="confirm-password"
                  name="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  className="block w-full rounded-md border-zinc-300 pl-10 focus:border-sky-500 focus:ring-sky-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white dark:placeholder-zinc-400 sm:text-sm py-2 px-3 border"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="group relative flex w-full justify-center rounded-md border border-transparent bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-sky-500 dark:text-white dark:hover:bg-sky-600"
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  t(language, 'registerSubmit')
                )}
              </button>
            </div>
          </form>
          {notice && (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-300">
              {t(language, 'registerAdminOnly')} {t(language, 'registerQuickAccount')}
            </div>
          )}

          <div className="mt-6">
            <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
              {t(language, 'registerPolicyPrefix')}{' '}
              <a href="#" className="font-medium text-sky-700 hover:text-sky-600 dark:text-sky-300 dark:hover:text-sky-200">
                {t(language, 'registerTerms')}
              </a>{' '}
              {t(language, 'registerAnd')}{' '}
              <a href="#" className="font-medium text-sky-700 hover:text-sky-600 dark:text-sky-300 dark:hover:text-sky-200">
                {t(language, 'registerPrivacy')}
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

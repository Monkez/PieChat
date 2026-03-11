'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { Lock, Loader2, Smartphone } from 'lucide-react';
import { useUiStore } from '@/lib/store/ui-store';
import { t } from '@/lib/i18n';
import LanguageSwitcher from '@/components/language-switcher';

export default function RegisterPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [noticeType, setNoticeType] = useState<'success' | 'error' | 'info'>('info');
  const { language } = useUiStore();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim() || !password.trim()) return;
    if (password !== confirmPassword) {
      setNotice(t(language, 'registerPasswordMismatch' as any) || 'Mật khẩu xác nhận không khớp');
      setNoticeType('error');
      return;
    }
    if (password.length < 6) {
      setNotice(t(language, 'registerPasswordTooShort' as any) || 'Mật khẩu phải ít nhất 6 ký tự');
      setNoticeType('error');
      return;
    }
    setIsLoading(true);
    setNotice('');
    try {
      const { authUrl } = await import('@/lib/config');
      const res = await fetch(authUrl('/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), password }),
      });
      const data = await res.json();
      if (data.success) {
        setNotice(data.message || 'Đăng ký thành công! Đang chuyển đến trang đăng nhập...');
        setNoticeType('success');
        setTimeout(() => { window.location.href = '/login'; }, 2000);
      } else {
        setNotice(data.error || 'Đăng ký thất bại');
        setNoticeType('error');
      }
    } catch {
      setNotice('Lỗi kết nối server');
      setNoticeType('error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-sky-50 via-white to-sky-100 px-4 py-12 dark:from-[#060b12] dark:via-[#0b1420] dark:to-black sm:px-6 lg:px-8">
      <div className="absolute top-4 right-4 z-50" style={{ top: 'max(1rem, env(safe-area-inset-top, 1rem))' }}>
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
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
              <label htmlFor="phone" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {t(language, 'loginPhoneLabel')}
              </label>
              <div className="relative mt-1 rounded-md shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Smartphone className="h-5 w-5 text-zinc-400" aria-hidden="true" />
                </div>
                <input
                  id="phone"
                  name="phone"
                  type="text"
                  autoComplete="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="block w-full rounded-md border-zinc-300 pl-10 focus:border-sky-500 focus:ring-sky-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white dark:placeholder-zinc-400 sm:text-sm py-2 px-3 border"
                  placeholder={t(language, 'loginPhonePlaceholder')}
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
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
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
            <div className={`mt-4 rounded-md border px-3 py-2 text-sm ${
              noticeType === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700/50 dark:bg-emerald-900/20 dark:text-emerald-300'
                : noticeType === 'error'
                  ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-700/50 dark:bg-rose-900/20 dark:text-rose-300'
                  : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-300'
            }`}>
              {notice}
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

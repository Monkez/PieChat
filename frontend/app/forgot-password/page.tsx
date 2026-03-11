'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { Smartphone, Lock, Loader2, KeyRound, ArrowLeft } from 'lucide-react';
import { useUiStore } from '@/lib/store/ui-store';
import { t } from '@/lib/i18n';
import { authUrl } from '@/lib/config';
import LanguageSwitcher from '@/components/language-switcher';

type Step = 'phone' | 'otp' | 'done';

export default function ForgotPasswordPage() {
  const { language } = useUiStore();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [noticeType, setNoticeType] = useState<'success' | 'error'>('error');

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;
    setIsLoading(true);
    setNotice('');
    try {
      const res = await fetch(authUrl('/forgot-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setStep('otp');
        setNotice(data.message || 'OTP đã được gửi');
        setNoticeType('success');
      } else {
        setNotice(data.error || 'Lỗi');
        setNoticeType('error');
      }
    } catch {
      setNotice('Lỗi kết nối server');
      setNoticeType('error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim() || !newPassword.trim()) return;
    if (newPassword !== confirmPassword) {
      setNotice('Mật khẩu xác nhận không khớp');
      setNoticeType('error');
      return;
    }
    if (newPassword.length < 6) {
      setNotice('Mật khẩu phải ít nhất 6 ký tự');
      setNoticeType('error');
      return;
    }
    setIsLoading(true);
    setNotice('');
    try {
      const res = await fetch(authUrl('/reset-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), otp: otp.trim(), newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        setStep('done');
        setNotice(data.message || 'Đổi mật khẩu thành công!');
        setNoticeType('success');
        setTimeout(() => { window.location.href = '/login'; }, 2500);
      } else {
        setNotice(data.error || 'Đổi mật khẩu thất bại');
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
            <KeyRound className="inline h-6 w-6 mr-2 mb-1" />
            {t(language, 'forgotPasswordTitle' as any) || 'Quên mật khẩu'}
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {step === 'phone' && (t(language, 'forgotPasswordSubTitle' as any) || 'Nhập số điện thoại để nhận mã OTP')}
            {step === 'otp' && 'Nhập mã OTP và mật khẩu mới'}
            {step === 'done' && 'Đổi mật khẩu thành công!'}
          </p>
        </div>

        <div className="mt-8 border border-sky-100 bg-white/85 px-4 py-8 shadow sm:rounded-lg sm:px-10 dark:border-sky-900/40 dark:bg-[#101a2a]/80">
          {step === 'phone' && (
            <form className="space-y-6" onSubmit={handleRequestOtp}>
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
                    type="text"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="block w-full rounded-md border-zinc-300 pl-10 focus:border-sky-500 focus:ring-sky-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white dark:placeholder-zinc-400 sm:text-sm py-2 px-3 border"
                    placeholder={t(language, 'loginPhonePlaceholder')}
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="group relative flex w-full justify-center rounded-md border border-transparent bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-sky-500 dark:text-white dark:hover:bg-sky-600"
              >
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Gửi mã OTP'}
              </button>
            </form>
          )}

          {step === 'otp' && (
            <form className="space-y-5" onSubmit={handleResetPassword}>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Mã OTP</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  className="mt-1 block w-full rounded-md border-zinc-300 text-center text-2xl tracking-[0.5em] font-mono focus:border-sky-500 focus:ring-sky-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white sm:text-sm py-2 px-3 border"
                  placeholder="• • • • • •"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Mật khẩu mới</label>
                <div className="relative mt-1 rounded-md shadow-sm">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Lock className="h-5 w-5 text-zinc-400" aria-hidden="true" />
                  </div>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="block w-full rounded-md border-zinc-300 pl-10 focus:border-sky-500 focus:ring-sky-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white sm:text-sm py-2 px-3 border"
                    placeholder="••••••••"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Xác nhận mật khẩu</label>
                <div className="relative mt-1 rounded-md shadow-sm">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Lock className="h-5 w-5 text-zinc-400" aria-hidden="true" />
                  </div>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="block w-full rounded-md border-zinc-300 pl-10 focus:border-sky-500 focus:ring-sky-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white sm:text-sm py-2 px-3 border"
                    placeholder="••••••••"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="group relative flex w-full justify-center rounded-md border border-transparent bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-sky-500 dark:text-white dark:hover:bg-sky-600"
              >
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Đổi mật khẩu'}
              </button>
            </form>
          )}

          {step === 'done' && (
            <div className="text-center py-4">
              <div className="text-4xl mb-3">✅</div>
              <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">Đổi mật khẩu thành công!</p>
              <p className="text-sm text-zinc-500 mt-2">Đang chuyển đến trang đăng nhập...</p>
            </div>
          )}

          {notice && (
            <div className={`mt-4 rounded-md border px-3 py-2 text-sm ${
              noticeType === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700/50 dark:bg-emerald-900/20 dark:text-emerald-300'
                : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-700/50 dark:bg-rose-900/20 dark:text-rose-300'
            }`}>
              {notice}
            </div>
          )}

          <div className="mt-6 text-center">
            <Link href="/login" className="inline-flex items-center gap-1 text-sm font-medium text-sky-700 hover:text-sky-600 dark:text-sky-300 dark:hover:text-sky-200">
              <ArrowLeft className="h-4 w-4" />
              {t(language, 'registerBackToLogin')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

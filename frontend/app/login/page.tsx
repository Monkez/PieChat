'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef, useCallback } from 'react';
import { Smartphone, ArrowRight, Loader2, ShieldCheck, Monitor, QrCode, RefreshCw } from 'lucide-react';
import { useMatrixStore } from '@/lib/store/matrix-store';
import { useUiStore } from '@/lib/store/ui-store';
import { t } from '@/lib/i18n';
import { authUrl } from '@/lib/config';
import LanguageSwitcher from '@/components/language-switcher';
import QRCode from 'qrcode';

type LoginMode = 'phone' | 'qr';

export default function LoginPage() {
  const router = useRouter();
  const { login, verifyOtp, cancelOtp, resendOtp, decreaseRetryAfter, retryAfterSeconds, isLoading, error, otpRequired, otpMaskedPhone, otpDevCode } = useMatrixStore();
  const { language } = useUiStore();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [autoLoginChecked, setAutoLoginChecked] = useState(false);

  // Detect mobile vs desktop
  const [isMobile, setIsMobile] = useState(false);
  const [loginMode, setLoginMode] = useState<LoginMode>('phone');

  // QR state
  const [qrSessionId, setQrSessionId] = useState('');
  const [qrImageUrl, setQrImageUrl] = useState('');
  const [qrStatus, setQrStatus] = useState<'idle' | 'pending' | 'approved' | 'expired'>('idle');
  const [qrLoading, setQrLoading] = useState(false);
  const [qrDataText, setQrDataText] = useState('');
  const [qrCountdown, setQrCountdown] = useState(60);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const mobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      || window.innerWidth < 768;
    setIsMobile(mobile);
    setLoginMode(mobile ? 'phone' : 'qr');
  }, []);

  // Auto-login: if session token exists, try restore and redirect
  useEffect(() => {
    const tryAutoLogin = async () => {
      if (typeof window === 'undefined') { setAutoLoginChecked(true); return; }
      const token = localStorage.getItem('matrix_access_token');
      if (!token) {
        // Pre-fill phone from last login
        const savedPhone = localStorage.getItem('piechat_login_phone') || '';
        if (savedPhone) setPhone(savedPhone);
        setAutoLoginChecked(true);
        return;
      }
      // Try restore session
      try {
        const { restoreSession } = useMatrixStore.getState();
        await restoreSession();
        const user = useMatrixStore.getState().currentUser;
        if (user) {
          router.replace('/chat');
          return;
        }
      } catch { /* session invalid */ }
      // Pre-fill phone
      const savedPhone = localStorage.getItem('piechat_login_phone') || '';
      if (savedPhone) setPhone(savedPhone);
      setAutoLoginChecked(true);
    };
    tryAutoLogin();
  }, [router]);

  useEffect(() => {
    if (retryAfterSeconds <= 0) return;
    const timer = setTimeout(() => decreaseRetryAfter(), 1000);
    return () => clearTimeout(timer);
  }, [decreaseRetryAfter, retryAfterSeconds]);

  // Generate QR code
  const generateQr = useCallback(async () => {
    setQrLoading(true);
    setQrStatus('idle');
    try {
      const res = await fetch(authUrl('/qr/generate'), { method: 'POST' });
      const data = await res.json();
      setQrSessionId(data.sessionId);
      // Generate QR image from qrData
      const url = await QRCode.toDataURL(data.qrData, {
        width: 280,
        margin: 2,
        color: { dark: '#0068ff', light: '#ffffff' },
      });
      setQrImageUrl(url);
      setQrDataText(data.qrData);
      setQrCountdown(60);
      setQrStatus('pending');
    } catch (err) {
      console.error('QR generate error:', err);
      setQrStatus('expired');
    } finally {
      setQrLoading(false);
    }
  }, []);

  // Poll QR status
  useEffect(() => {
    if (loginMode !== 'qr' || qrStatus !== 'pending' || !qrSessionId) return;

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(authUrl(`/qr/status/${qrSessionId}`));
        const data = await res.json();
        if (data.status === 'approved' && data.accessToken) {
          setQrStatus('approved');
          if (pollRef.current) clearInterval(pollRef.current);
          // Login with the received token
          const { restoreSessionFromQr } = useMatrixStore.getState();
          if (restoreSessionFromQr) {
            await restoreSessionFromQr(data.accessToken, data.userId);
          } else {
            // Fallback: manually save and redirect
            localStorage.setItem('matrix_access_token', data.accessToken);
            localStorage.setItem('matrix_user_id', data.userId);
          }
          router.push('/chat');
        } else if (data.status === 'expired') {
          setQrStatus('expired');
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // Network error, keep polling
      }
    }, 2000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loginMode, qrStatus, qrSessionId, router]);

  // Auto-generate QR when switching to QR mode
  useEffect(() => {
    if (loginMode === 'qr' && qrStatus === 'idle') {
      void generateQr();
    }
  }, [loginMode, qrStatus, generateQr]);

  // Countdown timer for QR expiry
  useEffect(() => {
    if (qrStatus !== 'pending') return;
    if (qrCountdown <= 0) {
      setQrStatus('expired');
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    const timer = setTimeout(() => setQrCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [qrStatus, qrCountdown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpRequired) {
      if (!phone.trim() || !password.trim()) return;
      const done = await login(phone, password);
      if (done && !useMatrixStore.getState().error) {
        router.push('/chat');
      }
      return;
    }
    if (!otpCode.trim()) return;
    const done = await verifyOtp(otpCode);
    if (done && !useMatrixStore.getState().error) {
      router.push('/chat');
    }
  };

  if (!autoLoginChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-sky-50 via-white to-sky-100 dark:from-[#060b12] dark:via-[#0b1420] dark:to-black">
        <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-sky-50 via-white to-sky-100 px-4 py-12 dark:from-[#060b12] dark:via-[#0b1420] dark:to-black sm:px-6 lg:px-8">
      <div className="absolute top-4 right-4 z-50" style={{ top: 'max(1rem, env(safe-area-inset-top, 1rem))' }}>
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <Link href="/" className="inline-flex items-center gap-2 text-4xl font-bold tracking-tighter text-sky-700 dark:text-sky-300">
            <Image src="/PieChatIcon.png" alt="PieChat" width={36} height={36} className="h-9 w-9 rounded-lg" />
            <span>PieChat</span>
          </Link>
          <h2 className="mt-6 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            {loginMode === 'qr'
              ? (t(language, 'loginQrTitle' as any) || 'Đăng nhập bằng mã QR')
              : !otpRequired
                ? t(language, 'loginTitlePhone')
                : t(language, 'loginTitleOtp')}
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {loginMode === 'qr'
              ? (t(language, 'loginQrSubtitle' as any) || 'Sử dụng điện thoại đã đăng nhập PieChat để quét mã')
              : !otpRequired
                ? (
                  <>
                    {t(language, 'loginSubTitle')}{' '}
                    <Link href="/register" className="font-medium text-sky-700 hover:text-sky-600 dark:text-sky-300 dark:hover:text-sky-200">
                      {t(language, 'loginCreateNew')}
                    </Link>
                  </>
                )
                : <>{t(language, 'loginOtpHint')} {otpMaskedPhone || ''}</>}
          </p>
        </div>

        {/* Mode Switcher */}
        <div className="flex gap-2 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800/60">
          <button
            onClick={() => setLoginMode('phone')}
            className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-all ${loginMode === 'phone'
              ? 'bg-white text-sky-700 shadow dark:bg-zinc-700 dark:text-sky-300'
              : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
              }`}
          >
            <Smartphone className="h-4 w-4" />
            {t(language, 'loginModePhone' as any) || 'Số điện thoại'}
          </button>
          <button
            onClick={() => { setLoginMode('qr'); if (qrStatus === 'expired') setQrStatus('idle'); }}
            className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-all ${loginMode === 'qr'
              ? 'bg-white text-sky-700 shadow dark:bg-zinc-700 dark:text-sky-300'
              : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
              }`}
          >
            <Monitor className="h-4 w-4" />
            {t(language, 'loginModeQr' as any) || 'Mã QR'}
          </button>
        </div>

        <div className="border border-sky-100 bg-white/85 px-4 py-8 shadow sm:rounded-lg sm:px-10 dark:border-sky-900/40 dark:bg-[#101a2a]/80">
          {loginMode === 'phone' ? (
            /* ─── Phone + OTP Mode ─── */
            <form className="space-y-6" onSubmit={handleSubmit}>
              {!otpRequired ? (
                <>
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
                      {t(language, 'loginPassword')}
                    </label>
                    <div className="relative mt-1 rounded-md shadow-sm">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                        <ShieldCheck className="h-5 w-5 text-zinc-400" aria-hidden="true" />
                      </div>
                      <input
                        id="password"
                        name="password"
                        type="password"
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="block w-full rounded-md border-zinc-300 pl-10 focus:border-sky-500 focus:ring-sky-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white dark:placeholder-zinc-400 sm:text-sm py-2 px-3 border"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <label htmlFor="otp" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {t(language, 'loginOtpLabel')}
                  </label>
                  <div className="relative mt-1 rounded-md shadow-sm">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <ShieldCheck className="h-5 w-5 text-zinc-400" aria-hidden="true" />
                    </div>
                    <input
                      id="otp"
                      name="otp"
                      type="text"
                      inputMode="numeric"
                      required
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      className="block w-full rounded-md border-zinc-300 pl-10 focus:border-sky-500 focus:ring-sky-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white dark:placeholder-zinc-400 sm:text-sm py-2 px-3 border"
                      placeholder={t(language, 'loginOtpPlaceholder')}
                    />
                  </div>
                  {otpDevCode && (
                    <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                      {t(language, 'loginOtpDevHint')} {otpDevCode}
                    </p>
                  )}
                </div>
              )}

              {error && (
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              )}
              {retryAfterSeconds > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {t(language, 'loginRetryAfter')} {retryAfterSeconds} {t(language, 'loginRetrySeconds')}
                </p>
              )}

              {otpRequired && (
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => { cancelOtp(); setOtpCode(''); }}
                    className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
                  >
                    {t(language, 'loginBackToPassword')}
                  </button>
                  <button
                    type="button"
                    onClick={async () => { await resendOtp(); }}
                    disabled={retryAfterSeconds > 0 || isLoading}
                    className="text-sm font-medium text-sky-700 hover:text-sky-600 dark:text-sky-300 dark:hover:text-sky-200"
                  >
                    {t(language, 'loginResendOtp')}
                  </button>
                </div>
              )}

              <div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="group relative flex w-full justify-center rounded-md border border-transparent bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-sky-500 dark:text-white dark:hover:bg-sky-600"
                >
                  {isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      {!otpRequired ? t(language, 'loginSubmit') : t(language, 'loginOtpSubmit')}
                      <span className="absolute inset-y-0 right-0 flex items-center pr-3">
                        <ArrowRight className="h-5 w-5 text-zinc-500 group-hover:text-zinc-400 dark:text-zinc-400" aria-hidden="true" />
                      </span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            /* ─── QR Code Mode ─── */
            <div className="flex flex-col items-center space-y-6">
              {qrLoading ? (
                <div className="flex h-[280px] w-[280px] items-center justify-center">
                  <Loader2 className="h-10 w-10 animate-spin text-sky-600" />
                </div>
              ) : qrStatus === 'expired' ? (
                <div className="flex h-[280px] w-[280px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/30">
                  <QrCode className="h-12 w-12 text-zinc-300 dark:text-zinc-600 mb-3" />
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
                    {t(language, 'loginQrExpired' as any) || 'Mã QR đã hết hạn'}
                  </p>
                  <button
                    onClick={() => { setQrStatus('idle'); }}
                    className="flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 transition-colors"
                  >
                    <RefreshCw className="h-4 w-4" />
                    {t(language, 'loginQrRefresh' as any) || 'Tạo mã mới'}
                  </button>
                </div>
              ) : qrStatus === 'approved' ? (
                <div className="flex h-[280px] w-[280px] flex-col items-center justify-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                    <ShieldCheck className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                    {t(language, 'loginQrApproved' as any) || 'Đã cấp phép!'}
                  </p>
                  <p className="mt-2 text-sm text-zinc-500">
                    {t(language, 'loginQrRedirecting' as any) || 'Đang chuyển hướng...'}
                  </p>
                  <Loader2 className="mt-3 h-5 w-5 animate-spin text-sky-600" />
                </div>
              ) : (
                <>
                  <div className="rounded-2xl border-2 border-sky-100 bg-white p-3 shadow-lg dark:border-sky-900/40 dark:bg-zinc-900">
                    {qrImageUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={qrImageUrl} alt="QR Login" className="h-[260px] w-[260px] rounded-lg" />
                    ) : (
                      <div className="h-[260px] w-[260px] rounded-lg bg-zinc-100 dark:bg-zinc-800 animate-pulse flex items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
                      </div>
                    )}
                  </div>
                  {/* Countdown timer */}
                  <div className="flex items-center justify-center gap-2 text-sm">
                    <svg className="h-5 w-5 -rotate-90" viewBox="0 0 20 20">
                      <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-200 dark:text-zinc-700" />
                      <circle cx="10" cy="10" r="8" fill="none" strokeWidth="2" strokeLinecap="round"
                        className={qrCountdown > 30 ? 'text-emerald-500' : qrCountdown > 10 ? 'text-amber-500' : 'text-red-500'}
                        stroke="currentColor"
                        strokeDasharray={`${(qrCountdown / 60) * 50.27} 50.27`}
                      />
                    </svg>
                    <span className={`font-mono font-bold ${qrCountdown > 30 ? 'text-emerald-600 dark:text-emerald-400' : qrCountdown > 10 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                      {qrCountdown}s
                    </span>
                    <span className="text-zinc-400 dark:text-zinc-500">còn lại</span>
                  </div>
                  <div className="text-center space-y-2">
                    <div className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-sky-700 text-xs font-bold dark:bg-sky-900/30 dark:text-sky-300">1</span>
                      <span>{t(language, 'loginQrStep1' as any) || 'Mở PieChat trên điện thoại'}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-sky-700 text-xs font-bold dark:bg-sky-900/30 dark:text-sky-300">2</span>
                      <span>{t(language, 'loginQrStep2' as any) || 'Vào Cài đặt → Quét mã QR'}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-sky-700 text-xs font-bold dark:bg-sky-900/30 dark:text-sky-300">3</span>
                      <span>{t(language, 'loginQrStep3' as any) || 'Quét mã để đăng nhập'}</span>
                    </div>
                  </div>
                  {/* Show copyable QR data for manual input fallback */}
                  {qrDataText && (
                    <div className="mt-4 w-full">
                      <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-1 text-center">Nếu không quét được, sao chép mã này vào điện thoại:</p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400 break-all select-all">{qrDataText}</code>
                        <button
                          type="button"
                          onClick={() => { void navigator.clipboard.writeText(qrDataText); }}
                          className="shrink-0 rounded-lg bg-sky-100 dark:bg-sky-900/30 px-3 py-2 text-xs font-semibold text-sky-700 dark:text-sky-300 hover:bg-sky-200 transition-colors"
                        >
                          Sao chép
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-zinc-300 dark:border-zinc-600" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white px-2 text-zinc-500 dark:bg-[#101a2a] dark:text-zinc-400">
                  {t(language, 'loginProtected')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

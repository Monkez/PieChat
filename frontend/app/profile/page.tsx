'use client';

import { useEffect, useState, useRef } from 'react';
import { ArrowLeft, Camera, Check, LogOut, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useMatrixStore } from '@/lib/store/matrix-store';
import { matrixService } from '@/lib/services/matrix-service';
import { useRouter } from 'next/navigation';
import { useUiStore } from '@/lib/store/ui-store';
import { t } from '@/lib/i18n';
import { MobileBottomBar } from '@/components/mobile-bottom-bar';

export default function ProfilePage() {
  const { currentUser, logout, fetchCurrentUser } = useMatrixStore();
  const { language } = useUiStore();
  const router = useRouter();
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState('');
  const [originalName, setOriginalName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const name = currentUser?.displayName || currentUser?.username || '';
    setDisplayName(name);
    setOriginalName(name);
  }, [currentUser?.displayName, currentUser?.username]);

  const hasNameChanged = displayName.trim() !== originalName && displayName.trim().length > 0;

  const handleSaveName = async () => {
    if (!hasNameChanged) return;
    setSavingName(true);
    try {
      await matrixService.setDisplayName(displayName.trim());
      // Refresh user data immediately
      if (fetchCurrentUser) await fetchCurrentUser();
      setOriginalName(displayName.trim());
      setNotice('Đã cập nhật tên hiển thị!');
    } catch {
      setNotice('Lỗi khi cập nhật tên');
    }
    setSavingName(false);
    setTimeout(() => setNotice(null), 3000);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      await matrixService.uploadAvatar(file);
      if (fetchCurrentUser) await fetchCurrentUser();
      setNotice('Đã cập nhật ảnh đại diện!');
    } catch {
      setNotice('Lỗi khi tải ảnh');
    }
    setAvatarUploading(false);
    setTimeout(() => setNotice(null), 3000);
  };

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const initials = (displayName || currentUser?.username || '?').charAt(0).toUpperCase();

  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-black overflow-y-auto">
      <div className="mx-auto w-full max-w-lg px-4 py-8 pb-24 lg:pb-8" style={{ paddingTop: 'max(2rem, env(safe-area-inset-top, 2rem))' }}>
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <Link href="/chat" className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
            Hồ sơ cá nhân
          </h1>
        </div>

        {/* Avatar Section — centred */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative group">
            <div className="h-24 w-24 rounded-full overflow-hidden bg-gradient-to-br from-sky-400 to-violet-500 shadow-lg ring-4 ring-white dark:ring-zinc-900">
              {currentUser?.avatarUrl ? (
                <img src={currentUser.avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-white text-3xl font-bold">
                  {initials}
                </div>
              )}
            </div>
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarUploading}
              className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-sky-500 text-white flex items-center justify-center shadow-md hover:bg-sky-600 transition-colors border-2 border-white dark:border-zinc-900 disabled:opacity-50"
            >
              {avatarUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarUpload}
            />
          </div>
          {notice && (
            <p className="mt-3 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1 rounded-full">{notice}</p>
          )}
        </div>

        {/* Profile Info Card */}
        <div className="rounded-2xl bg-white dark:bg-zinc-900 shadow-sm border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          {/* Display Name */}
          <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              {t(language, 'settingsDisplayName') || 'Tên hiển thị'}
            </label>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleSaveName(); }}
                className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                placeholder="Nhập tên hiển thị..."
              />
              {hasNameChanged && (
                <button
                  onClick={handleSaveName}
                  disabled={savingName}
                  className="flex h-9 items-center gap-1.5 rounded-lg bg-sky-500 px-3 text-sm font-bold text-white hover:bg-sky-600 transition-colors shadow-sm disabled:opacity-50"
                >
                  {savingName ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Lưu
                </button>
              )}
            </div>
          </div>

          {/* Username (readonly) */}
          <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Matrix ID
            </label>
            <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400 font-mono">
              {currentUser?.id || '@guest'}
            </p>
          </div>

          {/* Phone */}
          <div className="px-5 py-4">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Số điện thoại
            </label>
            <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">
              {typeof window !== 'undefined' ? localStorage.getItem('piechat_login_phone') || 'Chưa liên kết' : '—'}
            </p>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-red-200 dark:border-red-900/50 bg-white dark:bg-zinc-900 px-4 py-3.5 text-sm font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          {t(language, 'settingsSignOut') || 'Đăng xuất'}
        </button>

        <p className="mt-4 text-center text-[11px] text-zinc-400 dark:text-zinc-600">
          PieChat v1.0 • Bảo mật bằng mã hóa đầu cuối
        </p>
      </div>

      <MobileBottomBar />
    </div>
  );
}

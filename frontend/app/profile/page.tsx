'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { ArrowLeft, Camera, Check, LogOut, Loader2, Eye, EyeOff, ImagePlus, X, Pencil } from 'lucide-react';
import Link from 'next/link';
import { useMatrixStore } from '@/lib/store/matrix-store';
import { matrixService } from '@/lib/services/matrix-service';
import { useRouter } from 'next/navigation';
import { useUiStore } from '@/lib/store/ui-store';
import { t } from '@/lib/i18n';
import { MobileBottomBar } from '@/components/mobile-bottom-bar';
import { PieChatLogoHeader } from '@/components/piechat-logo-header';

interface ProfileSettings {
  bio: string;
  coverUrl: string;
  photos: string[];
  visibility: {
    bio: boolean;
    photos: boolean;
    phone: boolean;
  };
}

const DEFAULT_PROFILE: ProfileSettings = {
  bio: '',
  coverUrl: '',
  photos: [],
  visibility: { bio: true, photos: true, phone: false },
};

export default function ProfilePage() {
  const { currentUser, logout, fetchCurrentUser } = useMatrixStore();
  const { language } = useUiStore();
  const router = useRouter();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState('');
  const [originalName, setOriginalName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileSettings>(DEFAULT_PROFILE);
  const [editingBio, setEditingBio] = useState(false);
  const [bioText, setBioText] = useState('');
  const [savingBio, setSavingBio] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

  // Load profile settings from localStorage
  useEffect(() => {
    const userId = currentUser?.id;
    if (!userId) return;
    const stored = localStorage.getItem(`piechat_profile_${userId}`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as ProfileSettings;
        setProfile({ ...DEFAULT_PROFILE, ...parsed });
        setBioText(parsed.bio || '');
      } catch { /* ignore */ }
    }
    const name = currentUser?.displayName || currentUser?.username || '';
    setDisplayName(name);
    setOriginalName(name);
  }, [currentUser?.id, currentUser?.displayName, currentUser?.username]);

  const saveProfile = useCallback((update: Partial<ProfileSettings>) => {
    const userId = currentUser?.id;
    if (!userId) return;
    const next = { ...profile, ...update };
    setProfile(next);
    localStorage.setItem(`piechat_profile_${userId}`, JSON.stringify(next));
  }, [currentUser?.id, profile]);

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3000);
  };

  const hasNameChanged = displayName.trim() !== originalName && displayName.trim().length > 0;

  const handleSaveName = async () => {
    if (!hasNameChanged) return;
    setSavingName(true);
    try {
      await matrixService.setDisplayName(displayName.trim());
      if (fetchCurrentUser) await fetchCurrentUser();
      setOriginalName(displayName.trim());
      showNotice('Đã cập nhật tên hiển thị!');
    } catch { showNotice('Lỗi khi cập nhật tên'); }
    setSavingName(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      await matrixService.uploadAvatar(file);
      if (fetchCurrentUser) await fetchCurrentUser();
      showNotice('Đã cập nhật ảnh đại diện!');
    } catch { showNotice('Lỗi khi tải ảnh'); }
    setAvatarUploading(false);
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverUploading(true);
    try {
      const mxcUri = await matrixService.uploadMedia(file, file.name);
      const baseUrl = (matrixService as any).baseUrl;
      const httpUrl = mxcUri.startsWith('mxc://')
        ? `${baseUrl}/_matrix/media/v3/download/${mxcUri.slice(6)}`
        : mxcUri;
      saveProfile({ coverUrl: httpUrl });
      showNotice('Đã cập nhật ảnh bìa!');
    } catch { showNotice('Lỗi khi tải ảnh bìa'); }
    setCoverUploading(false);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setPhotoUploading(true);
    try {
      const newPhotos: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const mxcUri = await matrixService.uploadMedia(files[i], files[i].name);
        const baseUrl = (matrixService as any).baseUrl;
        const httpUrl = mxcUri.startsWith('mxc://')
          ? `${baseUrl}/_matrix/media/v3/download/${mxcUri.slice(6)}`
          : mxcUri;
        newPhotos.push(httpUrl);
      }
      saveProfile({ photos: [...profile.photos, ...newPhotos] });
      showNotice(`Đã thêm ${newPhotos.length} ảnh!`);
    } catch { showNotice('Lỗi khi tải ảnh'); }
    setPhotoUploading(false);
    if (photoInputRef.current) photoInputRef.current.value = '';
  };

  const removePhoto = (index: number) => {
    saveProfile({ photos: profile.photos.filter((_, i) => i !== index) });
  };

  const handleSaveBio = () => {
    setSavingBio(true);
    saveProfile({ bio: bioText.trim() });
    setEditingBio(false);
    setSavingBio(false);
    showNotice('Đã cập nhật giới thiệu!');
  };

  const toggleVisibility = (key: keyof ProfileSettings['visibility']) => {
    saveProfile({ visibility: { ...profile.visibility, [key]: !profile.visibility[key] } });
  };

  const handleLogout = () => { logout(); router.push('/login'); };

  const initials = (displayName || currentUser?.username || '?').charAt(0).toUpperCase();

  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-black overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl pb-24 lg:pb-8">
        <PieChatLogoHeader />
        {/* Back Button — floating */}
        <div className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3">
          <Link href="/chat" className="rounded-full p-2 bg-black/30 text-white hover:bg-black/50 backdrop-blur-sm transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </div>

        {/* Cover Image */}
        <div className="relative -mt-14 h-52 sm:h-64 w-full overflow-hidden bg-gradient-to-br from-sky-500 via-violet-500 to-fuchsia-500">
          {profile.coverUrl && (
            <img src={profile.coverUrl} alt="Cover" className="absolute inset-0 w-full h-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
          <button
            onClick={() => coverInputRef.current?.click()}
            disabled={coverUploading}
            className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-black/40 backdrop-blur-sm px-3 py-1.5 text-xs font-medium text-white hover:bg-black/60 transition-colors"
          >
            {coverUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            Đổi ảnh bìa
          </button>
          <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
        </div>

        {/* Avatar — overlapping cover */}
        <div className="relative px-6 -mt-16 z-10">
          <div className="relative inline-block group">
            <div className="h-28 w-28 rounded-full overflow-hidden bg-gradient-to-br from-sky-400 to-violet-500 ring-4 ring-white dark:ring-zinc-900 shadow-xl">
              {currentUser?.avatarUrl ? (
                <img src={currentUser.avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-white text-4xl font-bold">{initials}</div>
              )}
            </div>
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarUploading}
              className="absolute bottom-1 right-1 h-9 w-9 rounded-full bg-sky-500 text-white flex items-center justify-center shadow-lg hover:bg-sky-600 transition-colors border-3 border-white dark:border-zinc-900 disabled:opacity-50"
            >
              {avatarUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            </button>
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
          </div>
        </div>

        {/* Name + notice */}
        <div className="px-6 mt-3">
          {notice && (
            <div className="mb-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-400 animate-in fade-in slide-in-from-top-2 duration-200">
              {notice}
            </div>
          )}
        </div>

        {/* Profile Card */}
        <div className="mx-4 sm:mx-6 mt-4 rounded-2xl bg-white dark:bg-zinc-900 shadow-sm border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          {/* Display Name */}
          <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Tên hiển thị</label>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleSaveName(); }}
                className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2.5 text-sm font-medium text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                placeholder="Nhập tên hiển thị..."
              />
              {hasNameChanged && (
                <button onClick={handleSaveName} disabled={savingName}
                  className="flex h-10 items-center gap-1.5 rounded-xl bg-sky-500 px-4 text-sm font-bold text-white hover:bg-sky-600 transition-colors shadow-sm disabled:opacity-50">
                  {savingName ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Lưu
                </button>
              )}
            </div>
          </div>

          {/* Matrix ID */}
          <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Matrix ID</label>
            <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400 font-mono">{currentUser?.id || '@guest'}</p>
          </div>

          {/* Custom Status */}
          <CustomStatusSection />

          {/* Phone with visibility toggle */}
          <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Số điện thoại</label>
              <button onClick={() => toggleVisibility('phone')} className="flex items-center gap-1 text-[10px] font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
                {profile.visibility.phone ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                {profile.visibility.phone ? 'Công khai' : 'Riêng tư'}
              </button>
            </div>
            <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">
              {typeof window !== 'undefined' ? localStorage.getItem('piechat_login_phone') || 'Chưa liên kết' : '—'}
            </p>
          </div>

          {/* Bio with visibility toggle */}
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Giới thiệu</label>
              <div className="flex items-center gap-2">
                <button onClick={() => toggleVisibility('bio')} className="flex items-center gap-1 text-[10px] font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
                  {profile.visibility.bio ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  {profile.visibility.bio ? 'Công khai' : 'Riêng tư'}
                </button>
              </div>
            </div>
            {editingBio ? (
              <div className="space-y-2">
                <textarea
                  value={bioText}
                  onChange={(e) => setBioText(e.target.value)}
                  rows={3}
                  maxLength={500}
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                  placeholder="Viết vài dòng giới thiệu về bạn..."
                  autoFocus
                />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-zinc-400">{bioText.length}/500</span>
                  <div className="flex gap-2">
                    <button onClick={() => { setEditingBio(false); setBioText(profile.bio); }}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">Hủy</button>
                    <button onClick={handleSaveBio} disabled={savingBio}
                      className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-600 disabled:opacity-50">Lưu</button>
                  </div>
                </div>
              </div>
            ) : (
              <button onClick={() => { setBioText(profile.bio); setEditingBio(true); }}
                className="w-full text-left group">
                {profile.bio ? (
                  <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{profile.bio}
                    <Pencil className="inline h-3 w-3 ml-1.5 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </p>
                ) : (
                  <p className="text-sm text-zinc-400 italic hover:text-zinc-500">Thêm giới thiệu bản thân... ✏️</p>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Photos Section */}
        <div className="mx-4 sm:mx-6 mt-4 rounded-2xl bg-white dark:bg-zinc-900 shadow-sm border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Hình ảnh</h3>
              <p className="text-[10px] text-zinc-400 mt-0.5">{profile.photos.length} ảnh đã tải lên</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => toggleVisibility('photos')} className="flex items-center gap-1 text-[10px] font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
                {profile.visibility.photos ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                {profile.visibility.photos ? 'Công khai' : 'Riêng tư'}
              </button>
              <button
                onClick={() => photoInputRef.current?.click()}
                disabled={photoUploading}
                className="flex items-center gap-1 rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-600 transition-colors disabled:opacity-50"
              >
                {photoUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImagePlus className="h-3 w-3" />}
                Thêm
              </button>
              <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
            </div>
          </div>
          {profile.photos.length > 0 && (
            <div className="px-5 pb-4 grid grid-cols-3 sm:grid-cols-4 gap-2">
              {profile.photos.map((url, i) => (
                <div key={i} className="relative aspect-square rounded-xl overflow-hidden group cursor-pointer" onClick={() => setPreviewPhoto(url)}>
                  <img src={url} alt="" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                  <button
                    onClick={(e) => { e.stopPropagation(); removePhoto(i); }}
                    className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {profile.photos.length === 0 && (
            <div className="px-5 pb-5">
              <button
                onClick={() => photoInputRef.current?.click()}
                className="w-full h-28 rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-700 flex flex-col items-center justify-center gap-1.5 text-zinc-400 hover:text-sky-500 hover:border-sky-300 transition-colors"
              >
                <ImagePlus className="h-6 w-6" />
                <span className="text-xs font-medium">Tải ảnh lên</span>
              </button>
            </div>
          )}
        </div>

        {/* Logout */}
        <div className="mx-4 sm:mx-6 mt-4 mb-8">
          <button
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-red-200 dark:border-red-900/50 bg-white dark:bg-zinc-900 px-4 py-3.5 text-sm font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            {t(language, 'settingsSignOut') || 'Đăng xuất'}
          </button>
        </div>

        <p className="text-center text-[11px] text-zinc-400 dark:text-zinc-600 pb-8">
          PieChat v1.0 • Bảo mật bằng mã hóa đầu cuối
        </p>
      </div>

      {/* Photo Preview Modal */}
      {previewPhoto && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setPreviewPhoto(null)}>
          <button className="absolute top-4 right-4 text-white/80 hover:text-white z-10" onClick={() => setPreviewPhoto(null)}>
            <X className="h-6 w-6" />
          </button>
          <img src={previewPhoto} alt="" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      <MobileBottomBar />
    </div>
  );
}

const STATUS_PRESETS = [
  { emoji: '💼', label: 'Đang làm việc' },
  { emoji: '🏢', label: 'Đang họp' },
  { emoji: '✈️', label: 'Nghỉ phép' },
  { emoji: '🔴', label: 'Không làm phiền' },
  { emoji: '🍜', label: 'Đang ăn' },
  { emoji: '🏠', label: 'Làm việc tại nhà' },
  { emoji: '🎉', label: 'Đang rảnh' },
];

function CustomStatusSection() {
  const [statusText, setStatusText] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [savedStatus, setSavedStatus] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('piechat_custom_status');
    if (stored) {
      setSavedStatus(stored);
      setStatusText(stored);
    }
  }, []);

  const saveStatus = async (text: string) => {
    setSavedStatus(text);
    setStatusText(text);
    localStorage.setItem('piechat_custom_status', text);
    setIsEditing(false);
    try {
      await matrixService.setPresence('online', text);
    } catch { /* ignore */ }
  };

  const clearStatus = async () => {
    setSavedStatus('');
    setStatusText('');
    localStorage.removeItem('piechat_custom_status');
    setIsEditing(false);
    try {
      await matrixService.setPresence('online', '');
    } catch { /* ignore */ }
  };

  return (
    <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Trạng thái</label>
      {isEditing ? (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {STATUS_PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => saveStatus(`${p.emoji} ${p.label}`)}
                className="rounded-full border border-zinc-200 dark:border-zinc-700 px-2.5 py-1 text-xs font-medium hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors"
              >
                {p.emoji} {p.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={statusText}
              onChange={(e) => setStatusText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveStatus(statusText); }}
              maxLength={100}
              className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
              placeholder="Nhập trạng thái..."
              autoFocus
            />
            <button onClick={() => saveStatus(statusText)}
              className="rounded-lg bg-sky-500 px-3 py-2 text-xs font-bold text-white hover:bg-sky-600">Lưu</button>
            <button onClick={() => { setIsEditing(false); setStatusText(savedStatus); }}
              className="rounded-lg px-3 py-2 text-xs font-medium text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">Hủy</button>
          </div>
          {savedStatus && (
            <button onClick={clearStatus} className="text-xs text-rose-500 hover:text-rose-600">Xóa trạng thái</button>
          )}
        </div>
      ) : (
        <button onClick={() => setIsEditing(true)} className="mt-1.5 w-full text-left group">
          {savedStatus ? (
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              {savedStatus}
              <Pencil className="inline h-3 w-3 ml-1.5 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </p>
          ) : (
            <p className="text-sm text-zinc-400 italic hover:text-zinc-500">Đặt trạng thái... ✏️</p>
          )}
        </button>
      )}
    </div>
  );
}

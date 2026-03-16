'use client';

import { useEffect, useState } from 'react';
import { Bell, Shield, Moon, ArrowLeft, Lock, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useUiStore } from '@/lib/store/ui-store';
import { t } from '@/lib/i18n';
import { authUrl } from '@/lib/config';
import LanguageSwitcher from '@/components/language-switcher';
import { MobileBottomBar } from '@/components/mobile-bottom-bar';
import { getNotifSound, setNotifSound, playNotifSoundPreview, type NotifSoundType } from '@/lib/services/chat-notification-service';
import { useThemeStore, PRESET_COLORS } from '@/lib/store/theme-store';

type LoginEventItem = {
  id: string;
  timestamp: number;
  type: string;
  success: boolean;
  suspicious: boolean;
  deviceId?: string;
  ip?: string;
  message?: string;
};

export default function SettingsPage() {
  const [notifications, setNotifications] = useState(true);
  const [trustedDevices, setTrustedDevices] = useState<Array<{ deviceId: string; lastSeenAt: number }>>([]);
  const [loginEvents, setLoginEvents] = useState<LoginEventItem[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [deviceNotice, setDeviceNotice] = useState<string | null>(null);
  const [suspiciousEvents, setSuspiciousEvents] = useState<LoginEventItem[]>([]);
  const [currentDeviceId] = useState(() => (typeof window !== 'undefined' ? localStorage.getItem('piechat_device_id') || '' : ''));
  const [loginPhone] = useState(() => (typeof window !== 'undefined' ? localStorage.getItem('piechat_login_phone') || '' : ''));
  const { theme, setTheme } = useTheme();
  const { language } = useUiStore();
  const { accent, setAccent, customColor, setCustomColor } = useThemeStore();
  const [selectedSound, setSelectedSound] = useState<NotifSoundType>(() => getNotifSound());

  useEffect(() => {
    const loadDevices = async () => {
      if (!loginPhone) { setTrustedDevices([]); return; }
      setDevicesLoading(true);
      const response = await fetch(authUrl(`/devices?phone=${encodeURIComponent(loginPhone)}`));
      if (response.ok) {
        const payload = (await response.json()) as { devices: Array<{ deviceId: string; lastSeenAt: number }> };
        setTrustedDevices(payload.devices);
      }
      setDevicesLoading(false);
    };
    loadDevices();
  }, [loginPhone]);

  useEffect(() => {
    const loadLoginEvents = async () => {
      if (!loginPhone) { setLoginEvents([]); setSuspiciousEvents([]); return; }
      setEventsLoading(true);
      const [allResponse, suspiciousResponse] = await Promise.all([
        fetch(authUrl(`/login-events?phone=${encodeURIComponent(loginPhone)}`)),
        fetch(authUrl(`/login-events?phone=${encodeURIComponent(loginPhone)}&suspiciousOnly=1&sinceMs=${Date.now() - 24 * 60 * 60 * 1000}`)),
      ]);
      if (allResponse.ok) {
        const payload = (await allResponse.json()) as { events: LoginEventItem[] };
        setLoginEvents(payload.events);
      }
      if (suspiciousResponse.ok) {
        const payload = (await suspiciousResponse.json()) as { events: LoginEventItem[] };
        setSuspiciousEvents(payload.events);
      }
      setEventsLoading(false);
    };
    loadLoginEvents();
    const pollingTimer = setInterval(loadLoginEvents, 15000);
    return () => clearInterval(pollingTimer);
  }, [loginPhone]);

  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-black overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 lg:pb-8" style={{ paddingTop: 'max(2rem, env(safe-area-inset-top, 2rem))', paddingBottom: 'calc(8rem + env(safe-area-inset-bottom, 0px))' }}>
        {/* PieChat Logo — mobile only */}
        <div className="flex items-center gap-2 mb-4 lg:hidden">
          <Link href="/chat">
            <span className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 bg-clip-text text-transparent">PieChat</span>
          </Link>
        </div>

        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/chat" className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
              {t(language, 'settingsTitle')}
            </h1>
          </div>
          <LanguageSwitcher />
        </div>

        {suspiciousEvents.length > 0 && (
          <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
            <p className="font-semibold">{t(language, 'settingsSuspiciousAlertTitle')}</p>
            <p className="mt-1">{t(language, 'settingsSuspiciousAlertDesc')} {suspiciousEvents.length}</p>
          </div>
        )}

        <div className="space-y-6">
          {/* Preferences Section */}
          <div className="overflow-hidden rounded-lg bg-white shadow dark:bg-zinc-900 dark:border dark:border-zinc-800">
            <div className="px-4 py-5 sm:px-6">
              <h3 className="text-lg font-medium leading-6 text-zinc-900 dark:text-zinc-100">
                {t(language, 'settingsPreferences')}
              </h3>
            </div>
            <div className="border-t border-zinc-200 px-4 py-5 dark:border-zinc-800 sm:p-0">
              <dl className="sm:divide-y sm:divide-zinc-200 dark:sm:divide-zinc-800">
                <div className="flex items-center justify-between py-4 px-4 sm:px-6 sm:py-5">
                  <div className="flex items-center gap-3">
                    <Bell className="h-5 w-5 text-zinc-400" />
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {t(language, 'settingsNotifications')}
                    </span>
                  </div>
                  <button
                    onClick={() => setNotifications(!notifications)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 dark:focus:ring-white ${notifications ? 'bg-black dark:bg-white' : 'bg-zinc-200 dark:bg-zinc-700'}`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out dark:bg-black ${notifications ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
                <div className="flex items-center justify-between py-4 px-4 sm:px-6 sm:py-5">
                  <div className="flex items-center gap-3">
                    <Moon className="h-5 w-5 text-zinc-400" />
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {t(language, 'settingsDarkMode')}
                    </span>
                  </div>
                  <button
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 dark:focus:ring-white ${theme === 'dark' ? 'bg-black dark:bg-white' : 'bg-zinc-200 dark:bg-zinc-700'}`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out dark:bg-black ${theme === 'dark' ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
                {/* Notification Sound */}
                <div className="py-4 px-4 sm:px-6 sm:py-5 border-t border-zinc-200 dark:border-zinc-800">
                  <div className="flex items-center gap-3 mb-3">
                    <Bell className="h-5 w-5 text-zinc-400" />
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Âm thanh thông báo</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { value: 'chime' as NotifSoundType, label: '🔔 Chime' },
                      { value: 'bell' as NotifSoundType, label: '🔊 Bell' },
                      { value: 'ping' as NotifSoundType, label: '📌 Ping' },
                      { value: 'marimba' as NotifSoundType, label: '🎵 Marimba' },
                      { value: 'silent' as NotifSoundType, label: '🔇 Im lặng' },
                    ]).map((s) => (
                      <button
                        key={s.value}
                        onClick={() => {
                          setNotifSound(s.value);
                          setSelectedSound(s.value);
                          playNotifSoundPreview(s.value);
                        }}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                          selectedSound === s.value
                            ? 'border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-600'
                            : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Accent Color */}
                <div className="py-4 px-4 sm:px-6 sm:py-5 border-t border-zinc-200 dark:border-zinc-800">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="h-5 w-5 rounded-full" style={{ background: 'var(--accent-500)' }} />
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Màu chủ đạo</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    {PRESET_COLORS.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => setAccent(preset.id)}
                        className={`h-8 w-8 rounded-full transition-all ${accent === preset.id ? 'ring-2 ring-offset-2 ring-zinc-900 dark:ring-white dark:ring-offset-zinc-900 scale-110' : 'hover:scale-110'}`}
                        style={{ background: preset.color }}
                        title={preset.label}
                      />
                    ))}
                    <label
                      className={`relative h-8 w-8 rounded-full cursor-pointer transition-all overflow-hidden border-2 border-dashed border-zinc-300 dark:border-zinc-600 hover:scale-110 flex items-center justify-center ${accent === 'custom' ? 'ring-2 ring-offset-2 ring-zinc-900 dark:ring-white dark:ring-offset-zinc-900 scale-110 border-solid' : ''}`}
                      style={accent === 'custom' ? { background: customColor } : {}}
                      title="Chọn màu tùy chỉnh"
                    >
                      {accent !== 'custom' && <span className="text-xs">🎨</span>}
                      <input type="color" value={customColor} onChange={(e) => setCustomColor(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
                    </label>
                  </div>
                </div>
              </dl>
            </div>
          </div>

          {/* Change Password Section */}
          <ChangePasswordCard loginPhone={loginPhone} />

          {/* Security Section */}
          <div className="overflow-hidden rounded-lg bg-white shadow dark:bg-zinc-900 dark:border dark:border-zinc-800">
            <div className="px-4 py-5 sm:px-6">
              <h3 className="text-lg font-medium leading-6 text-zinc-900 dark:text-zinc-100">
                {t(language, 'settingsSecurity')}
              </h3>
            </div>
            <div className="border-t border-zinc-200 px-4 py-5 dark:border-zinc-800 sm:p-0">
              <div className="space-y-4 py-4 sm:px-6 sm:py-5">
                <button className="flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-500">
                  <Shield className="h-4 w-4" />
                  {t(language, 'settingsExportKeys')}
                </button>
                <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-700">
                  <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t(language, 'settingsDevices')}</h4>
                  <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                    {t(language, 'settingsCurrentDevice')}: <span className="font-mono">{currentDeviceId || '-'}</span>
                  </p>
                  {!loginPhone && (
                    <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{t(language, 'settingsNeedPhoneForDevices')}</p>
                  )}
                  {loginPhone && (
                    <div className="mt-3">
                      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        {t(language, 'settingsTrustedDevices')}
                      </p>
                      {devicesLoading && <p className="text-xs text-zinc-500 dark:text-zinc-400">...</p>}
                      {!devicesLoading && trustedDevices.length === 0 && (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">{t(language, 'settingsNoTrustedDevices')}</p>
                      )}
                      <div className="space-y-2">
                        {trustedDevices.map((device) => (
                          <div key={device.deviceId} className="flex items-center justify-between rounded-md border border-zinc-200 px-2 py-2 dark:border-zinc-700">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-mono text-zinc-900 dark:text-zinc-100">{device.deviceId}</p>
                              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                {t(language, 'settingsLastSeen')}: {new Date(device.lastSeenAt).toLocaleString()}
                              </p>
                            </div>
                            {device.deviceId !== currentDeviceId && (
                              <button
                                type="button"
                                onClick={async () => {
                                  const response = await fetch(authUrl('/devices'), {
                                    method: 'DELETE',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ phone: loginPhone, deviceId: device.deviceId }),
                                  });
                                  if (response.ok) {
                                    setTrustedDevices((prev) => prev.filter((item) => item.deviceId !== device.deviceId));
                                    setDeviceNotice(t(language, 'settingsDeviceRevokeSuccess'));
                                  } else {
                                    setDeviceNotice(t(language, 'settingsDeviceRevokeFailed'));
                                  }
                                }}
                                className="ml-3 rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-700 dark:hover:bg-red-900/20"
                              >
                                {t(language, 'settingsRevoke')}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      {deviceNotice && <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">{deviceNotice}</p>}
                    </div>
                  )}
                </div>
                <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-700">
                  <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t(language, 'settingsLoginHistory')}</h4>
                  {eventsLoading && <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">...</p>}
                  {!eventsLoading && loginEvents.length === 0 && (
                    <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{t(language, 'settingsNoLoginHistory')}</p>
                  )}
                  <div className="mt-3 space-y-2">
                    {loginEvents.slice(0, 10).map((event) => (
                      <div key={event.id} className="rounded-md border border-zinc-200 px-2 py-2 dark:border-zinc-700">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{event.message || event.type}</p>
                          {event.suspicious && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                              {t(language, 'settingsSuspicious')}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                          {new Date(event.timestamp).toLocaleString()} • {event.success ? 'OK' : 'FAIL'} • {event.deviceId || '-'} • {event.ip || '-'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <MobileBottomBar />
    </div>
  );
}

function ChangePasswordCard({ loginPhone }: { loginPhone: string }) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginPhone) { setNotice({ text: 'Chưa đăng nhập', type: 'error' }); return; }
    if (newPassword.length < 6) { setNotice({ text: 'Mật khẩu mới phải ít nhất 6 ký tự', type: 'error' }); return; }
    if (newPassword !== confirmPassword) { setNotice({ text: 'Mật khẩu xác nhận không khớp', type: 'error' }); return; }

    setLoading(true);
    setNotice(null);
    try {
      const res = await fetch(authUrl('/change-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: loginPhone, oldPassword, newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        setNotice({ text: data.message || 'Đổi mật khẩu thành công!', type: 'success' });
        setOldPassword(''); setNewPassword(''); setConfirmPassword('');
      } else {
        setNotice({ text: data.error || 'Đổi mật khẩu thất bại', type: 'error' });
      }
    } catch {
      setNotice({ text: 'Lỗi kết nối server', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-lg bg-white shadow dark:bg-zinc-900 dark:border dark:border-zinc-800">
      <div className="px-4 py-5 sm:px-6">
        <h3 className="text-lg font-medium leading-6 text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
          <Lock className="h-5 w-5 text-zinc-400" />
          Đổi mật khẩu
        </h3>
      </div>
      <form onSubmit={handleSubmit} className="border-t border-zinc-200 px-4 py-5 dark:border-zinc-800 sm:px-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Mật khẩu hiện tại</label>
          <input type="password" required value={oldPassword} onChange={(e) => setOldPassword(e.target.value)}
            className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-sky-500 focus:ring-sky-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white" placeholder="••••••••" />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Mật khẩu mới</label>
          <input type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
            className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-sky-500 focus:ring-sky-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white" placeholder="••••••••" />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Xác nhận mật khẩu mới</label>
          <input type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
            className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-sky-500 focus:ring-sky-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white" placeholder="••••••••" />
        </div>
        {notice && (
          <div className={`rounded-md border px-3 py-2 text-sm ${notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700/50 dark:bg-emerald-900/20 dark:text-emerald-300' : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-700/50 dark:bg-rose-900/20 dark:text-rose-300'}`}>
            {notice.text}
          </div>
        )}
        <button type="submit" disabled={loading}
          className="flex items-center gap-2 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50 transition-colors">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
          Đổi mật khẩu
        </button>
      </form>
    </div>
  );
}

'use client';

import { useEffect, useState, useRef } from 'react';
import { Bell, Shield, Moon, LogOut, ArrowLeft, Check, Camera } from 'lucide-react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useMatrixStore } from '@/lib/store/matrix-store';
import { matrixService } from '@/lib/services/matrix-service';
import { useRouter } from 'next/navigation';
import { useUiStore } from '@/lib/store/ui-store';
import { t } from '@/lib/i18n';
import { authUrl } from '@/lib/config';
import LanguageSwitcher from '@/components/language-switcher';
import { MobileBottomBar } from '@/components/mobile-bottom-bar';

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
  const { currentUser, logout } = useMatrixStore();
  const { language } = useUiStore();
  const router = useRouter();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [editingName, setEditingName] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);



  useEffect(() => {
    const loadDevices = async () => {
      if (!loginPhone) {
        setTrustedDevices([]);
        return;
      }
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
      if (!loginPhone) {
        setLoginEvents([]);
        setSuspiciousEvents([]);
        return;
      }
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

  const handleLogout = () => {
    logout();
    router.push('/login');
  };



  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-black overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 pb-24 lg:pb-8" style={{ paddingTop: 'max(2rem, env(safe-area-inset-top, 2rem))' }}>
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/chat" className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
              {t(language, 'settingsTitle')}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <button onClick={handleLogout} className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 transition-colors shadow-sm">
              <LogOut className="h-3.5 w-3.5" />
              {t(language, 'settingsSignOut')}
            </button>
          </div>
        </div>

        {suspiciousEvents.length > 0 && (
          <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
            <p className="font-semibold">{t(language, 'settingsSuspiciousAlertTitle')}</p>
            <p className="mt-1">
              {t(language, 'settingsSuspiciousAlertDesc')} {suspiciousEvents.length}
            </p>
          </div>
        )}

        <div className="space-y-6">


          {/* Profile Section */}
          <div className="overflow-hidden rounded-lg bg-white shadow dark:bg-zinc-900 dark:border dark:border-zinc-800">
            <div className="px-4 py-5 sm:px-6">
              <h3 className="text-lg font-medium leading-6 text-zinc-900 dark:text-zinc-100">
                {t(language, 'settingsProfile')}
              </h3>
              <p className="mt-1 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
                {t(language, 'settingsManageProfile')}
              </p>
            </div>
            <div className="border-t border-zinc-200 px-4 py-5 dark:border-zinc-800 sm:p-0">
              <dl className="sm:divide-y sm:divide-zinc-200 dark:sm:divide-zinc-800">
                <div className="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 sm:py-5">
                  <dt className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                    {t(language, 'registerUsername')}
                  </dt>
                  <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100 sm:col-span-2 sm:mt-0">
                    {currentUser?.id || '@guest:piechat.local'}
                  </dd>
                </div>
                <div className="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 sm:py-5">
                  <dt className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                    {t(language, 'settingsDisplayName')}
                  </dt>
                  <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100 sm:col-span-2 sm:mt-0">
                    {editingName ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={newDisplayName}
                          onChange={e => setNewDisplayName(e.target.value)}
                          className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                          autoFocus
                        />
                        <button
                          disabled={savingName || !newDisplayName.trim()}
                          onClick={async () => {
                            setSavingName(true);
                            try {
                              await matrixService.setDisplayName(newDisplayName.trim());
                              setProfileNotice('Đã cập nhật tên hiển thị!');
                              setEditingName(false);
                            } catch {
                              setProfileNotice('Lỗi khi cập nhật tên');
                            }
                            setSavingName(false);
                            setTimeout(() => setProfileNotice(null), 3000);
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-100 text-sky-600 hover:bg-sky-200 dark:bg-sky-900/30 dark:text-sky-400 disabled:opacity-50"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setNewDisplayName(currentUser?.displayName || currentUser?.username || '');
                          setEditingName(true);
                        }}
                        className="hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
                      >
                        {currentUser?.displayName || currentUser?.username || 'guest'}
                        <span className="ml-2 text-xs text-zinc-400">✏️</span>
                      </button>
                    )}
                    {profileNotice && (
                      <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">{profileNotice}</p>
                    )}
                  </dd>
                </div>
                <div className="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 sm:py-5">
                  <dt className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                    {t(language, 'settingsAvatar')}
                  </dt>
                  <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100 sm:col-span-2 sm:mt-0">
                    <div className="flex items-center gap-4">
                      <div className="relative h-12 w-12 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden group">
                        {currentUser?.avatarUrl && <img src={currentUser.avatarUrl} alt="Avatar" className="rounded-full w-full h-full object-cover" />}
                        <button
                          onClick={() => avatarInputRef.current?.click()}
                          className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-full"
                        >
                          <Camera className="h-4 w-4 text-white" />
                        </button>
                      </div>
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setAvatarUploading(true);
                          try {
                            await matrixService.uploadAvatar(file);
                            setProfileNotice('Đã cập nhật ảnh đại diện!');
                          } catch {
                            setProfileNotice('Lỗi khi tải ảnh');
                          }
                          setAvatarUploading(false);
                          setTimeout(() => setProfileNotice(null), 3000);
                        }}
                      />
                      <button
                        onClick={() => avatarInputRef.current?.click()}
                        disabled={avatarUploading}
                        className="text-sm font-medium text-black hover:text-zinc-700 dark:text-white dark:hover:text-zinc-300 disabled:opacity-50"
                      >
                        {avatarUploading ? 'Đang tải...' : t(language, 'settingsChange')}
                      </button>
                    </div>
                  </dd>
                </div>
              </dl>
            </div>
          </div>

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
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 dark:focus:ring-white ${notifications ? 'bg-black dark:bg-white' : 'bg-zinc-200 dark:bg-zinc-700'
                      }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out dark:bg-black ${notifications ? 'translate-x-5' : 'translate-x-0'
                        }`}
                    />
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
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 dark:focus:ring-white ${theme === 'dark' ? 'bg-black dark:bg-white' : 'bg-zinc-200 dark:bg-zinc-700'
                      }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out dark:bg-black ${theme === 'dark' ? 'translate-x-5' : 'translate-x-0'
                        }`}
                    />
                  </button>
                </div>
              </dl>
            </div>
          </div>

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
                      {devicesLoading && (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">...</p>
                      )}
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
                      {deviceNotice && (
                        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">{deviceNotice}</p>
                      )}
                    </div>
                  )}
                </div>
                <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-700">
                  <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t(language, 'settingsLoginHistory')}</h4>
                  {eventsLoading && (
                    <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">...</p>
                  )}
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

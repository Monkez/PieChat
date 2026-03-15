'use client';

import { useState, useEffect, useCallback } from 'react';
import { Shield, Users, MessageSquare, BarChart3, Megaphone, Send, ArrowLeft, RefreshCw, Key, Search, ChevronDown, ChevronUp, Activity, Server } from 'lucide-react';
import { matrixService } from '@/lib/services/matrix-service';
import { notificationService } from '@/lib/services/notification-service';
import Link from 'next/link';
import { cn } from '@/lib/utils';

type AdminTab = 'dashboard' | 'users' | 'broadcast' | 'settings';

interface UserEntry {
  user_id: string;
  display_name?: string;
  avatar_url?: string;
}

export default function AdminPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [stats, setStats] = useState({ totalUsers: 0, totalRooms: 0 });
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState('');

  // Broadcast state
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastBody, setBroadcastBody] = useState('');
  const [broadcastMode, setBroadcastMode] = useState<'notification' | 'room'>('notification');
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<string | null>(null);

  // Password reset
  const [resetUserId, setResetUserId] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetResult, setResetResult] = useState<string | null>(null);

  // Expanded user
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  useEffect(() => {
    matrixService.isServerAdmin().then(setIsAdmin).catch(() => setIsAdmin(false));
  }, []);

  const loadStats = useCallback(async () => {
    const s = await matrixService.getServerStats();
    setStats(s);
  }, []);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    const u = await matrixService.listAllUsers();
    setUsers(u);
    setLoadingUsers(false);
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadStats();
      loadUsers();
    }
  }, [isAdmin, loadStats, loadUsers]);

  const handleBroadcast = async () => {
    if (!broadcastTitle.trim()) return;
    setBroadcastSending(true);
    setBroadcastResult(null);
    try {
      const result = await matrixService.sendSystemAnnouncement(
        broadcastTitle.trim(),
        broadcastBody.trim(),
        broadcastMode,
      );
      // Also add to notification service for local storage
      notificationService.addSystemAnnouncement(broadcastTitle, broadcastBody);
      setBroadcastResult(`✅ Đã gửi thành công đến ${result.sent} người dùng`);
      setBroadcastTitle('');
      setBroadcastBody('');
    } catch (err: any) {
      setBroadcastResult(`❌ Lỗi: ${err.message || 'Không rõ'}`);
    } finally {
      setBroadcastSending(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetUserId.trim() || !resetPassword.trim()) return;
    setResetResult(null);
    try {
      await matrixService.resetUserPassword(resetUserId.trim(), resetPassword.trim());
      setResetResult(`✅ Đã đặt lại mật khẩu cho ${resetUserId}`);
      setResetUserId('');
      setResetPassword('');
    } catch (err: any) {
      setResetResult(`❌ Lỗi: ${err.message || 'Không thể đặt lại mật khẩu'}`);
    }
  };

  // Loading state
  if (isAdmin === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-sky-500 border-t-transparent" />
          <p className="text-sm text-zinc-500">Đang kiểm tra quyền admin...</p>
        </div>
      </div>
    );
  }

  // Not admin
  if (!isAdmin) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-900/30 mb-4">
          <Shield className="h-10 w-10 text-rose-500" />
        </div>
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Không có quyền truy cập</h2>
        <p className="text-sm text-zinc-500 mt-2 max-w-sm">Trang này chỉ dành cho quản trị viên hệ thống.</p>
        <Link href="/chat" className="mt-4 rounded-xl bg-sky-500 px-4 py-2 text-sm font-bold text-white hover:bg-sky-600 transition-colors">
          Quay lại Chat
        </Link>
      </div>
    );
  }

  const filteredUsers = userSearch.trim()
    ? users.filter(u =>
        u.user_id.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.display_name?.toLowerCase().includes(userSearch.toLowerCase())
      )
    : users;

  const tabs: { key: AdminTab; label: string; icon: typeof Shield }[] = [
    { key: 'dashboard', label: 'Tổng quan', icon: BarChart3 },
    { key: 'users', label: 'User', icon: Users },
    { key: 'broadcast', label: 'Broadcast', icon: Megaphone },
    { key: 'settings', label: 'Cài đặt', icon: Shield },
  ];

  return (
    <div className="flex h-full flex-col bg-white dark:bg-zinc-950">
      {/* Header */}
      <div className="border-b border-zinc-100 dark:border-zinc-800 px-4 py-4 lg:px-6">
        <div className="flex items-center gap-3">
          <Link href="/chat" className="lg:hidden rounded-full p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-200/30 dark:shadow-violet-900/20">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Admin Panel</h1>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Quản trị hệ thống PieChat</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-3 flex gap-1">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                  activeTab === tab.key
                    ? 'bg-violet-500 text-white shadow-md'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-6">
        {/* Dashboard */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'Tổng User', value: stats.totalUsers, icon: Users, color: 'from-sky-500 to-blue-600', shadow: 'shadow-sky-200/30' },
                { label: 'Phòng Chat', value: stats.totalRooms, icon: MessageSquare, color: 'from-emerald-500 to-green-600', shadow: 'shadow-emerald-200/30' },
                { label: 'Đang online', value: '-', icon: Activity, color: 'from-amber-500 to-orange-600', shadow: 'shadow-amber-200/30' },
                { label: 'Server', value: 'OK', icon: Server, color: 'from-violet-500 to-purple-600', shadow: 'shadow-violet-200/30' },
              ].map((stat, i) => {
                const Icon = stat.icon;
                return (
                  <div key={i} className="rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
                    <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg', stat.color, stat.shadow)}>
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    <p className="mt-3 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{stat.value}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{stat.label}</p>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => { loadStats(); loadUsers(); }}
              className="flex items-center gap-2 rounded-xl bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Làm mới dữ liệu
            </button>
          </div>
        )}

        {/* Users */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Tìm kiếm user..."
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 pl-10 pr-4 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-sky-600 dark:focus:ring-sky-900/30"
              />
            </div>

            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
              {filteredUsers.length} user {userSearch && '(đã lọc)'}
              {loadingUsers && ' — đang tải...'}
            </p>

            <div className="space-y-1">
              {filteredUsers.map(user => (
                <div key={user.user_id} className="rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
                  <button
                    onClick={() => setExpandedUser(expandedUser === user.user_id ? null : user.user_id)}
                    className="flex w-full items-center gap-3 p-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 font-bold text-sm overflow-hidden shrink-0">
                      {user.avatar_url
                        ? <img src={user.avatar_url.startsWith('mxc://') ? `${(typeof window !== 'undefined' ? localStorage.getItem('matrix_base_url') : '') || ''}/_matrix/media/v3/download/${user.avatar_url.slice(6)}` : user.avatar_url} alt="" className="h-full w-full object-cover" />
                        : (user.display_name || user.user_id).charAt(0).toUpperCase()
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                        {user.display_name || user.user_id}
                      </p>
                      <p className="text-[10px] text-zinc-400 font-mono truncate">{user.user_id}</p>
                    </div>
                    {expandedUser === user.user_id ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />}
                  </button>
                  {expandedUser === user.user_id && (
                    <div className="border-t border-zinc-100 dark:border-zinc-800 px-3 py-2.5 bg-zinc-50/50 dark:bg-zinc-800/30 space-y-2">
                      <p className="text-[10px] text-zinc-500 font-mono select-all">{user.user_id}</p>
                      <div className="flex gap-2">
                        <Link
                          href={`/chat/${encodeURIComponent(user.user_id)}`}
                          className="rounded-lg bg-sky-500 px-3 py-1 text-xs font-bold text-white hover:bg-sky-600 transition-colors"
                        >
                          Nhắn tin
                        </Link>
                        <button
                          onClick={() => { setResetUserId(user.user_id); setActiveTab('settings'); }}
                          className="rounded-lg bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50 transition-colors"
                        >
                          Reset mật khẩu
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Broadcast */}
        {activeTab === 'broadcast' && (
          <div className="max-w-xl space-y-5">
            <div className="rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500">
                  <Megaphone className="h-4 w-4 text-white" />
                </div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Gửi thông báo hệ thống</h3>
              </div>

              <input
                type="text"
                placeholder="Tiêu đề thông báo *"
                value={broadcastTitle}
                onChange={e => setBroadcastTitle(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-sky-600"
              />

              <textarea
                placeholder="Nội dung chi tiết..."
                value={broadcastBody}
                onChange={e => setBroadcastBody(e.target.value)}
                rows={4}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm outline-none resize-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-sky-600"
              />

              {/* Mode selection */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Phương thức gửi</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setBroadcastMode('notification')}
                    className={cn(
                      'rounded-xl border p-3 text-left transition-all',
                      broadcastMode === 'notification'
                        ? 'border-sky-400 bg-sky-50 dark:bg-sky-900/20 ring-2 ring-sky-200 dark:ring-sky-800'
                        : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300'
                    )}
                  >
                    <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">💬 Tin nhắn DM</p>
                    <p className="text-[10px] text-zinc-500 mt-1">Gửi trực tiếp vào DM mỗi user</p>
                  </button>
                  <button
                    onClick={() => setBroadcastMode('room')}
                    className={cn(
                      'rounded-xl border p-3 text-left transition-all',
                      broadcastMode === 'room'
                        ? 'border-sky-400 bg-sky-50 dark:bg-sky-900/20 ring-2 ring-sky-200 dark:ring-sky-800'
                        : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300'
                    )}
                  >
                    <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">🏠 Tạo phòng</p>
                    <p className="text-[10px] text-zinc-500 mt-1">Tạo nhóm mới với tất cả user</p>
                  </button>
                </div>
              </div>

              <button
                onClick={handleBroadcast}
                disabled={broadcastSending || !broadcastTitle.trim()}
                className={cn(
                  'flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white shadow-lg transition-all',
                  broadcastSending || !broadcastTitle.trim()
                    ? 'bg-zinc-300 dark:bg-zinc-700 cursor-not-allowed shadow-none'
                    : 'bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 shadow-violet-200/30 dark:shadow-violet-900/20'
                )}
              >
                {broadcastSending ? (
                  <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Đang gửi...</>
                ) : (
                  <><Send className="h-4 w-4" /> Gửi thông báo</>
                )}
              </button>

              {broadcastResult && (
                <div className={cn(
                  'rounded-xl px-4 py-2.5 text-sm font-medium',
                  broadcastResult.startsWith('✅')
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                    : 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400'
                )}>
                  {broadcastResult}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Settings */}
        {activeTab === 'settings' && (
          <div className="max-w-xl space-y-5">
            {/* Reset Password */}
            <div className="rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500">
                  <Key className="h-4 w-4 text-white" />
                </div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Đặt lại mật khẩu user</h3>
              </div>

              <input
                type="text"
                placeholder="User ID (ví dụ: @user:server.tld)"
                value={resetUserId}
                onChange={e => setResetUserId(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-sky-600"
              />
              <input
                type="password"
                placeholder="Mật khẩu mới"
                value={resetPassword}
                onChange={e => setResetPassword(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-sky-600"
              />
              <button
                onClick={handleResetPassword}
                disabled={!resetUserId.trim() || !resetPassword.trim()}
                className={cn(
                  'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-colors',
                  !resetUserId.trim() || !resetPassword.trim()
                    ? 'bg-zinc-200 text-zinc-400 cursor-not-allowed dark:bg-zinc-800'
                    : 'bg-amber-500 text-white hover:bg-amber-600'
                )}
              >
                <Key className="h-4 w-4" />
                Đặt lại mật khẩu
              </button>

              {resetResult && (
                <div className={cn(
                  'rounded-xl px-4 py-2.5 text-sm font-medium',
                  resetResult.startsWith('✅')
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                    : 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400'
                )}>
                  {resetResult}
                </div>
              )}
            </div>

            {/* Server Info */}
            <div className="rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm space-y-2">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Server className="h-4 w-4 text-violet-500" /> Thông tin server
              </h3>
              <div className="space-y-1 text-xs">
                <p className="text-zinc-500 dark:text-zinc-400">
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">Backend:</span> Dendrite (Matrix)
                </p>
                <p className="text-zinc-500 dark:text-zinc-400">
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">Frontend:</span> Next.js + PieChat
                </p>
                <p className="text-zinc-500 dark:text-zinc-400">
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">Users:</span> {stats.totalUsers}
                </p>
                <p className="text-zinc-500 dark:text-zinc-400">
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">Rooms:</span> {stats.totalRooms}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

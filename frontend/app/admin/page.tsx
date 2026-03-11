'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Users, MessageSquare, Server, Shield, Search, Trash2, UserPlus, RefreshCw, Key, Activity, HardDrive, AlertTriangle, CheckCircle, XCircle, Loader2, Copy, Eye, Cpu, MemoryStick, Wifi, Phone, Lock, LogOut } from 'lucide-react';
import Link from 'next/link';
import { authUrl } from '@/lib/config';

interface MatrixUser {
  name: string;
  displayname?: string;
  avatar_url?: string;
  phone?: string;
  lastSeen?: number;
  is_online?: boolean;
  device_count?: number;
  created_ts?: number;
  is_deactivated?: boolean;
}

interface MatrixRoom {
  room_id: string;
  name?: string;
  joined_members?: number;
  topic?: string;
  creator?: string;
  room_version?: string;
  members?: string[];
  is_stub?: boolean;
}

interface OtpLogEntry {
  id: string;
  timestamp: number;
  phone: string;
  type: string;
  success: boolean;
  suspicious: boolean;
  deviceId?: string;
  ip?: string;
  message?: string;
}

interface SystemInfo {
  cpu: { model: string; cores: number; loadAvg: { '1m': number; '5m': number; '15m': number }; usagePercent: number };
  memory: { total: number; used: number; free: number; usagePercent: number };
  disk: string;
  diskParsed?: Array<{ filesystem: string; size: string; used: string; available: string; usagePercent: number; mountedOn: string }>;
  docker: string;
  network: { interfaces: Array<{ name: string; address: string; family: string }>; traffic: string };
  os: { platform: string; release: string; hostname: string; uptime: number; arch: string };
}

type TabId = 'overview' | 'users' | 'rooms' | 'logs';

function extractPhone(userId: string): string {
  const match = userId.match(/@u(\d+):/);
  if (match) return `+${match[1]}`;
  return '—';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(2) + ' GB';
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function AdminPage() {
  // ─── Admin Auth ────────────────────────────────────────
  const [adminKey, setAdminKey] = useState('');
  const [adminKeyInput, setAdminKeyInput] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<TabId>('overview');

  // Overview
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  // Users
  const [users, setUsers] = useState<MatrixUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [creating, setCreating] = useState(false);
  // Rooms
  const [rooms, setRooms] = useState<MatrixRoom[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomSearch, setRoomSearch] = useState('');
  // Logs
  const [logs, setLogs] = useState<OtpLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logPhone, setLogPhone] = useState('');
  const [pendingOtps, setPendingOtps] = useState<Array<{ token: string; phone: string; code: string; matrixUsername: string; expiresAt: number; expired: boolean }>>([]);
  // UI
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  // Dashboard
  interface DashboardStats { users: { total: number; online: number; deactivated: number }; rooms: { total: number; active: number }; devices: { total: number }; media: { totalFiles: number; totalSize: number }; memberships: { total: number } }
  const [dashStats, setDashStats] = useState<DashboardStats | null>(null);

  // Restore session
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('piechat_admin_key');
      if (saved) { setAdminKey(saved); setIsAuthenticated(true); }
    }
  }, []);

  // ─── Admin Login ───────────────────────────────────────
  const handleAdminLogin = async () => {
    setAuthError('');
    setAuthLoading(true);
    try {
      const res = await fetch(authUrl(`/admin/stats?key=${encodeURIComponent(adminKeyInput)}`));
      if (res.ok) {
        setAdminKey(adminKeyInput);
        setIsAuthenticated(true);
        sessionStorage.setItem('piechat_admin_key', adminKeyInput);
      } else {
        setAuthError('Mật khẩu không đúng');
      }
    } catch {
      setAuthError('Không thể kết nối server');
    }
    setAuthLoading(false);
  };

  const handleLogout = () => {
    setAdminKey('');
    setIsAuthenticated(false);
    sessionStorage.removeItem('piechat_admin_key');
  };

  const showNotice = (type: 'success' | 'error', text: string) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 4000);
  };

  // Helper: fetch from auth service with admin key
  const adminFetch = useCallback((path: string) => {
    const sep = path.includes('?') ? '&' : '?';
    return fetch(authUrl(`${path}${sep}key=${encodeURIComponent(adminKey)}`));
  }, [adminKey]);

  // ─── Load System Info ─────────────────────────────────
  const loadSystemInfo = useCallback(async () => {
    try {
      const [sysRes, dashRes] = await Promise.all([
        adminFetch('/admin/system-info'),
        adminFetch('/admin/dashboard'),
      ]);
      if (sysRes.ok) setSystemInfo((await sysRes.json()) as SystemInfo);
      if (dashRes.ok) setDashStats((await dashRes.json()) as DashboardStats);
    } catch { /* ignore */ }
  }, [adminFetch]);

  // ─── Load Users ────────────────────────────────────────
  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const res = await adminFetch('/admin/users');
      if (res.ok) {
        const data = (await res.json()) as { users: Array<{ user_id: string; display_name?: string; avatar_url?: string; phone?: string; last_seen?: number; is_online?: boolean; device_count?: number; created_ts?: number; is_deactivated?: boolean }> };
        setUsers((data.users || []).map(u => ({
          name: u.user_id,
          displayname: u.display_name,
          avatar_url: u.avatar_url,
          phone: u.phone,
          lastSeen: u.last_seen,
          is_online: u.is_online,
          device_count: u.device_count,
          created_ts: u.created_ts,
          is_deactivated: u.is_deactivated,
        })));
      } else {
        showNotice('error', `Lỗi tải người dùng: ${res.status}`);
      }
    } catch { showNotice('error', 'Không thể kết nối server'); }
    setUsersLoading(false);
  }, [adminFetch]);

  // ─── Load Rooms ────────────────────────────────────────
  const loadRooms = useCallback(async () => {
    setRoomsLoading(true);
    try {
      const res = await adminFetch('/admin/rooms');
      if (res.ok) {
        const data = (await res.json()) as { rooms: MatrixRoom[] };
        setRooms(data.rooms || []);
      } else {
        showNotice('error', `Lỗi tải phòng: ${res.status}`);
      }
    } catch { showNotice('error', 'Không thể kết nối server'); }
    setRoomsLoading(false);
  }, [adminFetch]);

  // ─── Load Logs ─────────────────────────────────────────
  const loadLogs = useCallback(async (phone?: string) => {
    setLogsLoading(true);
    try {
      const phoneParam = phone || logPhone || '';
      if (phoneParam) {
        const res = await fetch(authUrl(`/login-events?phone=${encodeURIComponent(phoneParam)}`));
        if (res.ok) { setLogs(((await res.json()) as { events: OtpLogEntry[] }).events || []); }
      } else {
        const res = await adminFetch('/admin/recent-logs?limit=200');
        if (res.ok) { setLogs(((await res.json()) as { events: OtpLogEntry[] }).events || []); }
      }
      const otpRes = await adminFetch('/admin/pending-otps');
      if (otpRes.ok) {
        setPendingOtps(((await otpRes.json()) as { otps: typeof pendingOtps }).otps || []);
      }
    } catch { showNotice('error', 'Không thể tải log'); }
    setLogsLoading(false);
  }, [logPhone, adminFetch]);

  // ─── Delete User ───────────────────────────────────────
  const deleteUser = async (userId: string) => {
    if (!confirm(`Xác nhận xóa tài khoản ${userId}?`)) return;
    try {
      // Use auth service proxy for admin operations
      showNotice('error', 'Chức năng xóa user cần Dendrite admin API (chưa hỗ trợ qua proxy)');
    } catch { showNotice('error', 'Lỗi kết nối'); }
  };

  // ─── Delete Room ───────────────────────────────────────
  const deleteRoom = async (roomId: string) => {
    if (!confirm(`Xác nhận xóa phòng ${roomId}?`)) return;
    try {
      showNotice('error', 'Chức năng xóa room cần Dendrite admin API (chưa hỗ trợ qua proxy)');
    } catch { showNotice('error', 'Lỗi kết nối'); }
  };

  // ─── Reset Password ────────────────────────────────────
  const handleResetPassword = async () => {
    if (!resetUserId || !resetPassword) return;
    try {
      showNotice('error', 'Chức năng đổi MK cần Dendrite admin API (chưa hỗ trợ qua proxy)');
      setResetUserId(null);
      setResetPassword('');
    } catch { showNotice('error', 'Lỗi kết nối'); }
  };

  // ─── Create User ───────────────────────────────────────
  const createUser = async () => {
    if (!newUsername || !newPassword) return;
    setCreating(true);
    try {
      showNotice('error', 'Chức năng tạo user cần Dendrite admin API (chưa hỗ trợ qua proxy)');
    } catch { showNotice('error', 'Lỗi kết nối'); }
    setCreating(false);
  };

  // Auto-load on tab change
  useEffect(() => {
    if (!isAuthenticated) return;
    if (activeTab === 'overview') void loadSystemInfo();
    if (activeTab === 'users') void loadUsers();
    if (activeTab === 'rooms') void loadRooms();
    if (activeTab === 'logs') void loadLogs();
  }, [activeTab, isAuthenticated, loadSystemInfo, loadUsers, loadRooms, loadLogs]);

  const filteredUsers = users.filter(u => {
    const q = userSearch.toLowerCase();
    return !q || u.name?.toLowerCase().includes(q) || u.displayname?.toLowerCase().includes(q);
  });

  const filteredRooms = rooms.filter(r => {
    const q = roomSearch.toLowerCase();
    return !q || r.room_id?.toLowerCase().includes(q) || r.name?.toLowerCase().includes(q);
  });

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Tổng quan', icon: <Activity className="h-4 w-4" /> },
    { id: 'users', label: 'Người dùng', icon: <Users className="h-4 w-4" /> },
    { id: 'rooms', label: 'Phòng chat', icon: <MessageSquare className="h-4 w-4" /> },
    { id: 'logs', label: 'OTP & Log', icon: <Key className="h-4 w-4" /> },
  ];

  // ═══════════════════════════════════════════════════════
  // LOGIN GATE
  // ═══════════════════════════════════════════════════════
  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-950 to-black p-4">
        <div className="w-full max-w-sm">
          <div className="rounded-3xl bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 p-8 shadow-2xl">
            <div className="flex flex-col items-center mb-8">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-sky-500 to-violet-600 flex items-center justify-center mb-4 shadow-lg shadow-sky-500/20">
                <Shield className="h-8 w-8 text-white" />
              </div>
              <h1 className="text-xl font-bold text-white">PieChat Admin</h1>
              <p className="text-sm text-zinc-400 mt-1">Nhập mật khẩu quản trị</p>
            </div>
            <div className="space-y-4">
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input
                  type="password"
                  value={adminKeyInput}
                  onChange={(e) => setAdminKeyInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleAdminLogin(); }}
                  placeholder="Mật khẩu admin..."
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-800 pl-10 pr-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-all"
                  autoFocus
                />
              </div>
              {authError && (
                <div className="rounded-xl bg-red-900/30 border border-red-800 px-3 py-2 text-sm text-red-400 flex items-center gap-2">
                  <XCircle className="h-4 w-4 shrink-0" />
                  {authError}
                </div>
              )}
              <button
                onClick={() => void handleAdminLogin()}
                disabled={!adminKeyInput || authLoading}
                className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-violet-600 py-3 text-sm font-bold text-white hover:from-sky-600 hover:to-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-lg shadow-sky-500/20"
              >
                {authLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                Đăng nhập
              </button>
            </div>
            <div className="mt-6 text-center">
              <Link href="/chat" className="text-xs text-zinc-500 hover:text-zinc-400 transition-colors">
                ← Quay về Chat
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // MAIN DASHBOARD
  // ═══════════════════════════════════════════════════════
  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-black overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 pb-24 lg:pb-6" style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top))' }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/chat" className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Shield className="h-5 w-5 text-sky-500" /> Admin Dashboard
              </h1>
              <p className="text-xs text-zinc-400 mt-0.5">Quản lý hệ thống PieChat</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Online
            </div>
            <button onClick={handleLogout} className="rounded-lg p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Đăng xuất">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Notice */}
        {notice && (
          <div className={`mb-4 rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200 ${
            notice.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800'
              : 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
          }`}>
            {notice.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {notice.text}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 p-1 mb-6 rounded-2xl bg-white dark:bg-zinc-900 shadow-sm border border-zinc-200 dark:border-zinc-800">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-sky-500 text-white shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800'
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* ═══════ OVERVIEW TAB ═══════ */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-10 w-10 rounded-xl bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
                    <Users className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{dashStats?.users.total ?? '—'}</p>
                    <p className="text-[11px] text-zinc-400">Người dùng</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="flex items-center gap-1 text-emerald-500"><div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />{dashStats?.users.online ?? 0} online</span>
                  {(dashStats?.users.deactivated ?? 0) > 0 && <span className="text-red-400">{dashStats?.users.deactivated} disabled</span>}
                </div>
                <button onClick={() => { setActiveTab('users'); void loadUsers(); }} className="text-[11px] text-sky-500 hover:text-sky-600 font-medium mt-1">Xem chi tiết →</button>
              </div>
              <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-10 w-10 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                    <MessageSquare className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{dashStats?.rooms.total ?? '—'}</p>
                    <p className="text-[11px] text-zinc-400">Phòng chat</p>
                  </div>
                </div>
                <p className="text-[11px] text-violet-500">{dashStats?.rooms.active ?? 0} phòng hoạt động</p>
                <button onClick={() => { setActiveTab('rooms'); void loadRooms(); }} className="text-[11px] text-violet-500 hover:text-violet-600 font-medium mt-1">Xem chi tiết →</button>
              </div>
              <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <Server className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{dashStats?.devices.total ?? '—'}</p>
                    <p className="text-[11px] text-zinc-400">Thiết bị</p>
                  </div>
                </div>
                <p className="text-[11px] text-emerald-500 font-medium">Đã kết nối</p>
              </div>
              <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <HardDrive className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{dashStats?.media.totalFiles ?? '—'}</p>
                    <p className="text-[11px] text-zinc-400">Media files</p>
                  </div>
                </div>
                <p className="text-[11px] text-zinc-400">{dashStats ? formatBytes(dashStats.media.totalSize) : '—'} tổng dung lượng</p>
              </div>
            </div>

            {/* System Monitor */}
            {systemInfo && (
              <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 shadow-sm">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-sky-500" /> System Monitor
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-500 flex items-center gap-1"><Cpu className="h-3 w-3" /> CPU</span>
                      <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{systemInfo.cpu.usagePercent}%</span>
                    </div>
                    <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${systemInfo.cpu.usagePercent > 80 ? 'bg-red-500' : systemInfo.cpu.usagePercent > 50 ? 'bg-amber-500' : 'bg-sky-500'}`} style={{ width: `${systemInfo.cpu.usagePercent}%` }} />
                    </div>
                    <p className="text-[10px] text-zinc-400">{systemInfo.cpu.model}</p>
                    <p className="text-[10px] text-zinc-400">{systemInfo.cpu.cores} cores • Load: {systemInfo.cpu.loadAvg['1m'].toFixed(2)}</p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-500 flex items-center gap-1"><MemoryStick className="h-3 w-3" /> RAM</span>
                      <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{systemInfo.memory.usagePercent}%</span>
                    </div>
                    <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${systemInfo.memory.usagePercent > 85 ? 'bg-red-500' : systemInfo.memory.usagePercent > 60 ? 'bg-amber-500' : 'bg-violet-500'}`} style={{ width: `${systemInfo.memory.usagePercent}%` }} />
                    </div>
                    <p className="text-[10px] text-zinc-400">{formatBytes(systemInfo.memory.used)} / {formatBytes(systemInfo.memory.total)}</p>
                    <p className="text-[10px] text-zinc-400">Free: {formatBytes(systemInfo.memory.free)}</p>
                  </div>
                  <div className="space-y-2">
                    <span className="text-xs font-medium text-zinc-500 flex items-center gap-1"><HardDrive className="h-3 w-3" /> Storage</span>
                    {systemInfo.diskParsed && systemInfo.diskParsed.length > 0 ? systemInfo.diskParsed.map((d: { mountedOn: string; usagePercent: number; used: string; size: string; available: string; filesystem: string }, i: number) => (
                      <div key={i} className="space-y-1">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-medium text-zinc-600 dark:text-zinc-300">{d.mountedOn}</span>
                          <span className={`font-bold ${d.usagePercent > 85 ? 'text-red-500' : d.usagePercent > 60 ? 'text-amber-500' : 'text-emerald-500'}`}>{d.usagePercent}%</span>
                        </div>
                        <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${d.usagePercent > 85 ? 'bg-red-500' : d.usagePercent > 60 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${d.usagePercent}%` }} />
                        </div>
                        <p className="text-[10px] text-zinc-400">{d.used} / {d.size} — Trống: {d.available}</p>
                      </div>
                    )) : (
                      <pre className="text-[9px] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800 rounded-lg p-2 overflow-x-auto whitespace-pre">{systemInfo.disk || 'N/A'}</pre>
                    )}
                  </div>
                  <div className="space-y-2">
                    <span className="text-xs font-medium text-zinc-500 flex items-center gap-1"><Wifi className="h-3 w-3" /> Network</span>
                    <div className="space-y-1">
                      {systemInfo.network.interfaces.map((iface, i) => (
                        <div key={i} className="text-[10px] text-zinc-500">
                          <span className="font-medium">{iface.name}</span>: <span className="font-mono">{iface.address}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {systemInfo.docker && (
                  <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                    <h4 className="text-xs font-bold text-zinc-600 dark:text-zinc-400 mb-2">🐳 Docker Containers</h4>
                    <pre className="text-[10px] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800 rounded-lg p-2 overflow-x-auto">{systemInfo.docker}</pre>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-zinc-400">
                  <span>💻 {systemInfo.os.hostname}</span>
                  <span>🛡️ {systemInfo.os.platform} {systemInfo.os.arch}</span>
                  <span>⏱️ Uptime: {formatUptime(systemInfo.os.uptime)}</span>
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 shadow-sm">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3">Thao tác nhanh</h3>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => { void loadUsers(); void loadRooms(); void loadSystemInfo(); }} className="flex items-center gap-1.5 rounded-xl bg-sky-50 dark:bg-sky-900/20 px-3 py-2 text-xs font-medium text-sky-600 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-900/30 transition-colors">
                  <RefreshCw className="h-3.5 w-3.5" /> Refresh tất cả
                </button>
                <button onClick={() => setActiveTab('users')} className="flex items-center gap-1.5 rounded-xl bg-violet-50 dark:bg-violet-900/20 px-3 py-2 text-xs font-medium text-violet-600 dark:text-violet-400 hover:bg-violet-100 transition-colors">
                  <UserPlus className="h-3.5 w-3.5" /> Tạo tài khoản
                </button>
                <button onClick={() => setActiveTab('logs')} className="flex items-center gap-1.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-100 transition-colors">
                  <Key className="h-3.5 w-3.5" /> Xem OTP Log
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══════ USERS TAB ═══════ */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-[200px] relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Tìm người dùng..." className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
              </div>
              <button onClick={loadUsers} disabled={usersLoading} className="flex items-center gap-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2.5 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50">
                <RefreshCw className={`h-4 w-4 ${usersLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{filteredUsers.length} người dùng</p>
                <div className="flex items-center gap-1 text-[11px] text-emerald-500"><div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />{filteredUsers.filter(u => u.is_online).length} online</div>
              </div>
              <div className="max-h-[500px] overflow-y-auto">
                {usersLoading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>
                ) : filteredUsers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
                    <Users className="h-8 w-8 mb-2" /><p className="text-sm">Không có người dùng</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-50 dark:bg-zinc-800/50 sticky top-0">
                      <tr>
                        <th className="text-center px-2 py-2 text-[11px] uppercase tracking-wider text-zinc-400 font-semibold w-8"></th>
                        <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">User</th>
                        <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">SĐT</th>
                        <th className="text-center px-3 py-2 text-[11px] uppercase tracking-wider text-zinc-400 font-semibold hidden md:table-cell">Thiết bị</th>
                        <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider text-zinc-400 font-semibold hidden lg:table-cell">Lần cuối</th>
                        <th className="text-right px-3 py-2 text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {filteredUsers.map((user) => {
                        const phone = user.phone || extractPhone(user.name);
                        return (
                          <tr key={user.name} className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors ${user.is_deactivated ? 'opacity-50' : ''}`}>
                            <td className="px-2 py-3 text-center">
                              <div className={`h-2.5 w-2.5 rounded-full mx-auto ${user.is_online ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-300 dark:bg-zinc-600'}`} title={user.is_online ? 'Online' : 'Offline'} />
                            </td>
                            <td className="px-3 py-3">
                              <p className="font-medium text-xs text-zinc-800 dark:text-zinc-200">{user.displayname || user.name.split(':')[0]?.replace('@', '')}</p>
                              <p className="font-mono text-[10px] text-zinc-400 truncate max-w-[180px]">{user.name}</p>
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-1">
                                <Phone className="h-3 w-3 text-zinc-400" />
                                <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">{phone || '—'}</span>
                                {phone && phone !== '—' && phone !== '(admin)' && (
                                  <button onClick={() => { navigator.clipboard.writeText(phone); showNotice('success', 'Đã copy SĐT'); }} className="text-zinc-400 hover:text-zinc-600">
                                    <Copy className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-center hidden md:table-cell">
                              <span className="text-xs text-zinc-500">{user.device_count || 0}</span>
                            </td>
                            <td className="px-3 py-3 hidden lg:table-cell">
                              <span className="text-[10px] text-zinc-400">{user.lastSeen ? new Date(user.lastSeen).toLocaleString() : '—'}</span>
                            </td>
                            <td className="px-3 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => { setResetUserId(user.name); setResetPassword(''); }} className="h-7 w-7 rounded-lg flex items-center justify-center text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors" title="Đổi mật khẩu">
                                  <Key className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => deleteUser(user.name)} className="h-7 w-7 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Xóa">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {resetUserId && (
              <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setResetUserId(null)}>
                <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 w-full max-w-md shadow-2xl border border-zinc-200 dark:border-zinc-800" onClick={(e) => e.stopPropagation()}>
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-1">Đổi mật khẩu</h3>
                  <p className="text-sm text-zinc-400 mb-4 font-mono">{resetUserId}</p>
                  <input type="password" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} placeholder="Mật khẩu mới" className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-sky-500" autoFocus />
                  <div className="flex gap-2">
                    <button onClick={handleResetPassword} disabled={!resetPassword} className="flex-1 rounded-xl bg-sky-500 py-2.5 text-sm font-bold text-white hover:bg-sky-600 disabled:opacity-50">Xác nhận</button>
                    <button onClick={() => setResetUserId(null)} className="rounded-xl px-4 py-2.5 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">Hủy</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════ ROOMS TAB ═══════ */}
        {activeTab === 'rooms' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <input value={roomSearch} onChange={(e) => setRoomSearch(e.target.value)} placeholder="Tìm phòng..." className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
              </div>
              <button onClick={loadRooms} disabled={roomsLoading} className="flex items-center gap-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2.5 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50">
                <RefreshCw className={`h-4 w-4 ${roomsLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800"><p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{filteredRooms.length} phòng</p></div>
              <div className="max-h-[500px] overflow-y-auto">
                {roomsLoading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>
                ) : filteredRooms.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-zinc-400"><MessageSquare className="h-8 w-8 mb-2" /><p className="text-sm">Không có phòng</p></div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-50 dark:bg-zinc-800/50 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">Phòng</th>
                        <th className="text-center px-3 py-2 text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">TV</th>
                        <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider text-zinc-400 font-semibold hidden md:table-cell">Thành viên</th>
                        <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider text-zinc-400 font-semibold hidden lg:table-cell">Chi tiết</th>
                        <th className="text-right px-3 py-2 text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {filteredRooms.map((room) => (
                        <tr key={room.room_id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                          <td className="px-3 py-3">
                            <p className="font-medium text-xs text-zinc-800 dark:text-zinc-200">{room.name || '(Không tên)'}</p>
                            <p className="font-mono text-[10px] text-zinc-400 truncate max-w-[180px]">{room.room_id}</p>
                            {room.topic && <p className="text-[10px] text-zinc-400 italic mt-0.5 truncate max-w-[200px]">{room.topic}</p>}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-sky-100 dark:bg-sky-900/30 text-xs font-bold text-sky-600 dark:text-sky-400">{room.joined_members ?? 0}</span>
                          </td>
                          <td className="px-3 py-3 hidden md:table-cell">
                            <div className="flex flex-wrap gap-1 max-w-[200px]">
                              {(room.members || []).slice(0, 5).map(m => (
                                <span key={m} className="text-[9px] bg-zinc-100 dark:bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded">{m.split(':')[0]?.replace('@', '')}</span>
                              ))}
                              {(room.members?.length || 0) > 5 && <span className="text-[9px] text-zinc-400">+{(room.members?.length || 0) - 5}</span>}
                            </div>
                          </td>
                          <td className="px-3 py-3 hidden lg:table-cell">
                            <div className="text-[10px] text-zinc-400 space-y-0.5">
                              {room.creator && <p>Tạo bởi: {room.creator.split(':')[0]?.replace('@', '')}</p>}
                              {room.room_version && <p>Version: {room.room_version}</p>}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => { navigator.clipboard.writeText(room.room_id); showNotice('success', 'Đã copy Room ID'); }} className="h-7 w-7 rounded-lg flex items-center justify-center text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" title="Copy ID"><Copy className="h-3.5 w-3.5" /></button>
                              <button onClick={() => deleteRoom(room.room_id)} className="h-7 w-7 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Xóa phòng"><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══════ LOGS TAB ═══════ */}
        {activeTab === 'logs' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <input value={logPhone} onChange={(e) => setLogPhone(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void loadLogs(); }} placeholder="Nhập SĐT hoặc để trống xem tất cả..." className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
              </div>
              <button onClick={() => loadLogs()} disabled={logsLoading} className="flex items-center gap-1.5 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-600 disabled:opacity-50">
                {logsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                Tra cứu
              </button>
            </div>

            {/* Pending OTPs */}
            {pendingOtps.filter(o => !o.expired).length > 0 && (
              <div className="rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/10 dark:to-teal-900/10 border border-emerald-200 dark:border-emerald-800 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Key className="h-4 w-4 text-emerald-600" />
                  <h3 className="text-sm font-bold text-emerald-800 dark:text-emerald-400">OTP đang chờ xác thực ({pendingOtps.filter(o => !o.expired).length})</h3>
                </div>
                <div className="space-y-2">
                  {pendingOtps.filter(o => !o.expired).map(otp => (
                    <div key={otp.token} className="flex items-center justify-between bg-white/70 dark:bg-zinc-800/50 rounded-xl px-3 py-2">
                      <div>
                        <span className="text-xs font-medium text-zinc-500">{otp.phone}</span>
                        <span className="text-xs text-zinc-400 ml-2">({otp.matrixUsername})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-lg font-bold text-emerald-700 dark:text-emerald-400 tracking-widest">{otp.code}</span>
                        <button onClick={() => { navigator.clipboard.writeText(otp.code); showNotice('success', 'Đã copy OTP'); }} className="text-zinc-400 hover:text-zinc-600"><Copy className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/10 dark:to-orange-900/10 border border-amber-200 dark:border-amber-800 p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <h3 className="text-sm font-bold text-amber-800 dark:text-amber-400">OTP Quick View</h3>
              </div>
              <p className="text-xs text-amber-600 dark:text-amber-500">Nhấn &quot;Tra cứu&quot; để xem tất cả log. OTP đang chờ hiển thị ở card phía trên.</p>
            </div>

            <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800"><p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{logs.length} sự kiện</p></div>
              <div className="max-h-[500px] overflow-y-auto">
                {logsLoading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>
                ) : logs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-zinc-400"><Key className="h-8 w-8 mb-2" /><p className="text-sm">Nhấn Tra cứu để xem log</p></div>
                ) : (
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {logs.map((log) => (
                      <div key={log.id} className="px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {log.success ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" /> : <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                log.type.includes('success') ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                                log.suspicious ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                                'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                              }`}>{log.type}</span>
                            </div>
                            <p className="text-sm text-zinc-700 dark:text-zinc-300">{log.message || log.type}</p>
                            <div className="flex items-center gap-3 mt-1 text-[11px] text-zinc-400">
                              <span>{new Date(log.timestamp).toLocaleString()}</span>
                              {log.ip && <span>IP: {log.ip}</span>}
                              {log.deviceId && <span className="font-mono truncate max-w-[120px]">Device: {log.deviceId}</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

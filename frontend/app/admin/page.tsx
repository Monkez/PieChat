'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Users, MessageSquare, Server, Shield, Search, Trash2, UserPlus, RefreshCw, Key, Activity, HardDrive, AlertTriangle, CheckCircle, XCircle, Loader2, Copy, Eye, Cpu, MemoryStick, Wifi, Phone } from 'lucide-react';
import Link from 'next/link';
import { getConfig, authUrl } from '@/lib/config';
import { MobileBottomBar } from '@/components/mobile-bottom-bar';

interface MatrixUser {
  name: string;
  displayname?: string;
  avatar_url?: string;
  creation_ts?: number;
  is_guest?: boolean;
  admin?: boolean;
}

interface MatrixRoom {
  room_id: string;
  name?: string;
  canonical_alias?: string;
  joined_members?: number;
  topic?: string;
  creator?: string;
  guest_access?: string;
  history_visibility?: string;
  join_rules?: string;
  version?: string;
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

type TabId = 'overview' | 'users' | 'rooms' | 'logs';

interface SystemInfo {
  cpu: { model: string; cores: number; loadAvg: { '1m': number; '5m': number; '15m': number }; usagePercent: number };
  memory: { total: number; used: number; free: number; usagePercent: number };
  disk: string;
  docker: string;
  network: { interfaces: Array<{ name: string; address: string; family: string }>; traffic: string };
  os: { platform: string; release: string; hostname: string; uptime: number; arch: string };
}

// Extract phone from Matrix userId like @u84111111:server -> +84111111
function extractPhone(userId: string): string {
  const match = userId.match(/@u(\d+):/);
  if (match) {
    const digits = match[1];
    if (digits.startsWith('84')) return `+${digits}`;
    return `+${digits}`;
  }
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
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [accessToken, setAccessToken] = useState('');
  const [baseUrl, setBaseUrl] = useState('');

  // Overview state
  const [serverInfo, setServerInfo] = useState<Record<string, unknown> | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);

  // Users state
  const [users, setUsers] = useState<MatrixUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [creating, setCreating] = useState(false);

  // Rooms state
  const [rooms, setRooms] = useState<MatrixRoom[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomSearch, setRoomSearch] = useState('');

  // Logs state
  const [logs, setLogs] = useState<OtpLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logPhone, setLogPhone] = useState('');
  const [pendingOtps, setPendingOtps] = useState<Array<{ token: string; phone: string; code: string; matrixUsername: string; expiresAt: number; expired: boolean }>>([]);

  // Notifications
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setAccessToken(localStorage.getItem('matrix_access_token') || '');
      setBaseUrl(getConfig().matrixBaseUrl);
    }
  }, []);

  const showNotice = (type: 'success' | 'error', text: string) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 4000);
  };

  const matrixFetch = useCallback(async (path: string, opts?: RequestInit) => {
    const res = await fetch(`${baseUrl}${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...(opts?.headers || {}) },
    });
    return res;
  }, [accessToken, baseUrl]);

  // ─── Load Server Info ──────────────────────────────────
  const loadServerInfo = useCallback(async () => {
    try {
      const [versionRes, mediaRes] = await Promise.all([
        matrixFetch('/_matrix/client/versions'),
        matrixFetch('/_matrix/media/v3/config'),
      ]);
      const versions = versionRes.ok ? await versionRes.json() : null;
      const media = mediaRes.ok ? await mediaRes.json() : null;
      setServerInfo({ versions, media });
    } catch { /* ignore */ }

    // Load system info from auth service
    try {
      const sysRes = await fetch(authUrl('/admin/system-info?key=piechat-admin-dev'));
      if (sysRes.ok) {
        const data = (await sysRes.json()) as SystemInfo;
        setSystemInfo(data);
      }
    } catch { /* ignore */ }
  }, [matrixFetch]);

  // ─── Load Users ────────────────────────────────────────
  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      // Use user_directory/search with broad query to find all users
      const queries = ['u', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'v', 'w', 'x', 'y', 'z', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
      const allUsers = new Map<string, MatrixUser>();
      
      // Search with several common prefixes to get comprehensive list
      for (const q of queries) {
        try {
          const res = await matrixFetch('/_matrix/client/v3/user_directory/search', {
            method: 'POST',
            body: JSON.stringify({ search_term: q, limit: 100 }),
          });
          if (res.ok) {
            const data = (await res.json()) as { results: Array<{ user_id: string; display_name?: string; avatar_url?: string }> };
            for (const u of (data.results || [])) {
              if (!allUsers.has(u.user_id)) {
                allUsers.set(u.user_id, { name: u.user_id, displayname: u.display_name, avatar_url: u.avatar_url });
              }
            }
          }
        } catch { /* skip */ }
      }
      setUsers(Array.from(allUsers.values()));
      if (allUsers.size === 0) {
        showNotice('error', 'Không tìm thấy người dùng nào');
      }
    } catch {
      showNotice('error', 'Không thể kết nối server');
    }
    setUsersLoading(false);
  }, [matrixFetch]);

  // ─── Load Rooms ────────────────────────────────────────
  const loadRooms = useCallback(async () => {
    setRoomsLoading(true);
    try {
      // Get rooms the current user has joined
      const res = await matrixFetch('/_matrix/client/v3/joined_rooms');
      if (res.ok) {
        const data = (await res.json()) as { joined_rooms: string[] };
        const roomList: MatrixRoom[] = [];
        
        // Fetch details for each room
        for (const roomId of (data.joined_rooms || [])) {
          try {
            const stateRes = await matrixFetch(`/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state`);
            let name = '';
            let joinedMembers = 0;
            let topic = '';
            let creator = '';
            if (stateRes.ok) {
              const states = (await stateRes.json()) as Array<{ type: string; content: Record<string, unknown>; state_key?: string }>;
              for (const s of states) {
                if (s.type === 'm.room.name') name = String(s.content?.name || '');
                if (s.type === 'm.room.topic') topic = String(s.content?.topic || '');
                if (s.type === 'm.room.create') creator = String(s.content?.creator || '');
                if (s.type === 'm.room.member' && s.content?.membership === 'join') joinedMembers++;
              }
            }
            roomList.push({ room_id: roomId, name, joined_members: joinedMembers, topic, creator });
          } catch {
            roomList.push({ room_id: roomId });
          }
        }
        setRooms(roomList);
      } else {
        showNotice('error', `Lỗi tải phòng: ${res.status}`);
      }
    } catch {
      showNotice('error', 'Không thể kết nối server');
    }
    setRoomsLoading(false);
  }, [matrixFetch]);

  // ─── Load Logs ─────────────────────────────────────────
  const loadLogs = useCallback(async (phone?: string) => {
    setLogsLoading(true);
    try {
      const phoneParam = phone || logPhone || '';
      if (phoneParam) {
        const res = await fetch(authUrl(`/login-events?phone=${encodeURIComponent(phoneParam)}`));
        if (res.ok) {
          const data = (await res.json()) as { events: OtpLogEntry[] };
          setLogs(data.events || []);
        }
      } else {
        // Get all recent logs from admin API
        const res = await fetch(authUrl('/admin/recent-logs?key=piechat-admin-dev&limit=200'));
        if (res.ok) {
          const data = (await res.json()) as { events: OtpLogEntry[] };
          setLogs(data.events || []);
        }
      }
      // Always load pending OTPs
      const otpRes = await fetch(authUrl('/admin/pending-otps?key=piechat-admin-dev'));
      if (otpRes.ok) {
        const otpData = (await otpRes.json()) as { otps: typeof pendingOtps };
        setPendingOtps(otpData.otps || []);
      }
    } catch {
      showNotice('error', 'Không thể tải log');
    }
    setLogsLoading(false);
  }, [logPhone]);

  // ─── Create User ───────────────────────────────────────
  const createUser = async () => {
    if (!newUsername || !newPassword) return;
    setCreating(true);
    try {
      const res = await matrixFetch('/_matrix/client/v3/register', {
        method: 'POST',
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          auth: { type: 'm.login.dummy' },
        }),
      });
      if (res.ok) {
        showNotice('success', `Đã tạo tài khoản @${newUsername}`);
        if (newDisplayName) {
          // Set display name
          const data = (await matrixFetch('/_matrix/client/v3/register', {
            method: 'POST',
            body: JSON.stringify({
              username: newUsername,
              password: newPassword,
              auth: { type: 'm.login.dummy' },
            }),
          }).then(r => r.json())) as { access_token?: string };
          // Use admin API to set display name
        }
        setNewUsername('');
        setNewPassword('');
        setNewDisplayName('');
        setShowCreateUser(false);
        await loadUsers();
      } else {
        const err = (await res.json()) as { error?: string; errcode?: string };
        showNotice('error', err.error || err.errcode || 'Lỗi tạo tài khoản');
      }
    } catch { showNotice('error', 'Lỗi kết nối server'); }
    setCreating(false);
  };

  // ─── Delete User ───────────────────────────────────────
  const deleteUser = async (userId: string) => {
    if (!confirm(`Xác nhận xóa tài khoản ${userId}? Hành động này không thể hoàn tác.`)) return;
    try {
      // Evacuate user from all rooms via Dendrite admin API
      const res = await matrixFetch(`/_dendrite/admin/evacuateUser/${userId}`, { method: 'POST' });
      if (res.ok) {
        showNotice('success', `Đã loại ${userId} khỏi tất cả phòng`);
        await loadUsers();
      } else {
        showNotice('error', `Không thể xóa tài khoản (${res.status})`);
      }
    } catch { showNotice('error', 'Lỗi kết nối'); }
  };

  // ─── Delete Room ───────────────────────────────────────
  const deleteRoom = async (roomId: string) => {
    if (!confirm(`Xác nhận xóa phòng ${roomId}?`)) return;
    try {
      // First evacuate all users from the room
      const evacRes = await matrixFetch(`/_dendrite/admin/evacuateRoom/${roomId}`, { method: 'POST' });
      // Then purge the room from database
      const purgeRes = await matrixFetch(`/_dendrite/admin/purgeRoom/${roomId}`, { method: 'POST' });
      if (evacRes.ok || purgeRes.ok) {
        showNotice('success', 'Đã xóa phòng');
        await loadRooms();
      } else {
        // Fallback: just leave the room
        const leaveRes = await matrixFetch(`/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/leave`, { method: 'POST', body: '{}' });
        if (leaveRes.ok) {
          showNotice('success', 'Đã rời phòng');
          await loadRooms();
        } else {
          showNotice('error', 'Không thể xóa phòng');
        }
      }
    } catch { showNotice('error', 'Lỗi kết nối'); }
  };

  // ─── Reset Password ────────────────────────────────────
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const handleResetPassword = async () => {
    if (!resetUserId || !resetPassword) return;
    try {
      const res = await matrixFetch(`/_dendrite/admin/resetPassword/${resetUserId}`, {
        method: 'POST',
        body: JSON.stringify({ password: resetPassword }),
      });
      if (res.ok) {
        showNotice('success', `Đã đổi mật khẩu ${resetUserId}`);
        setResetUserId(null);
        setResetPassword('');
      } else {
        showNotice('error', 'Không thể đổi mật khẩu');
      }
    } catch { showNotice('error', 'Lỗi kết nối'); }
  };

  // Auto-load on tab change
  useEffect(() => {
    if (!accessToken || !baseUrl) return;
    if (activeTab === 'overview') loadServerInfo();
    if (activeTab === 'users') loadUsers();
    if (activeTab === 'rooms') loadRooms();
    if (activeTab === 'logs') void loadLogs();
  }, [activeTab, accessToken, baseUrl, loadServerInfo, loadUsers, loadRooms, loadLogs]);

  const filteredUsers = users.filter(u => {
    const q = userSearch.toLowerCase();
    return !q || u.name?.toLowerCase().includes(q) || u.displayname?.toLowerCase().includes(q);
  });

  const filteredRooms = rooms.filter(r => {
    const q = roomSearch.toLowerCase();
    return !q || r.room_id?.toLowerCase().includes(q) || r.name?.toLowerCase().includes(q) || r.canonical_alias?.toLowerCase().includes(q);
  });

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Tổng quan', icon: <Activity className="h-4 w-4" /> },
    { id: 'users', label: 'Người dùng', icon: <Users className="h-4 w-4" /> },
    { id: 'rooms', label: 'Phòng chat', icon: <MessageSquare className="h-4 w-4" /> },
    { id: 'logs', label: 'OTP & Log', icon: <Key className="h-4 w-4" /> },
  ];

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
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Online
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
                    <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{users.length || '—'}</p>
                    <p className="text-[11px] text-zinc-400">Người dùng</p>
                  </div>
                </div>
                <button onClick={() => { setActiveTab('users'); void loadUsers(); }} className="text-[11px] text-sky-500 hover:text-sky-600 font-medium">Xem chi tiết →</button>
              </div>
              <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-10 w-10 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                    <MessageSquare className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{rooms.length || '—'}</p>
                    <p className="text-[11px] text-zinc-400">Phòng chat</p>
                  </div>
                </div>
                <button onClick={() => { setActiveTab('rooms'); void loadRooms(); }} className="text-[11px] text-violet-500 hover:text-violet-600 font-medium">Xem chi tiết →</button>
              </div>
              <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <Server className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">✓</p>
                    <p className="text-[11px] text-zinc-400">Server Status</p>
                  </div>
                </div>
                <p className="text-[11px] text-emerald-500 font-medium">Hoạt động bình thường</p>
              </div>
              <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <HardDrive className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{serverInfo ? '✓' : '—'}</p>
                    <p className="text-[11px] text-zinc-400">Matrix API</p>
                  </div>
                </div>
                <p className="text-[11px] text-zinc-400">{baseUrl || 'N/A'}</p>
              </div>
            </div>

            {/* ─── System Monitor ─── */}
            {systemInfo && (
              <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 shadow-sm">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-sky-500" /> System Monitor
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* CPU */}
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

                  {/* RAM */}
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

                  {/* Storage */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-500 flex items-center gap-1"><HardDrive className="h-3 w-3" /> Storage</span>
                    </div>
                    <pre className="text-[9px] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800 rounded-lg p-2 overflow-x-auto whitespace-pre">{systemInfo.disk || 'N/A'}</pre>
                  </div>

                  {/* Network */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-500 flex items-center gap-1"><Wifi className="h-3 w-3" /> Network</span>
                    </div>
                    <div className="space-y-1">
                      {systemInfo.network.interfaces.map((iface, i) => (
                        <div key={i} className="text-[10px] text-zinc-500">
                          <span className="font-medium">{iface.name}</span>: <span className="font-mono">{iface.address}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Docker Stats */}
                {systemInfo.docker && (
                  <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                    <h4 className="text-xs font-bold text-zinc-600 dark:text-zinc-400 mb-2">🐳 Docker Containers</h4>
                    <pre className="text-[10px] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800 rounded-lg p-2 overflow-x-auto">{systemInfo.docker}</pre>
                  </div>
                )}

                {/* OS Info */}
                <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-zinc-400">
                  <span>💻 {systemInfo.os.hostname}</span>
                  <span>🛡️ {systemInfo.os.platform} {systemInfo.os.arch}</span>
                  <span>⏱️ Uptime: {formatUptime(systemInfo.os.uptime)}</span>
                  <span>🏛️ Kernel: {systemInfo.os.release}</span>
                </div>
              </div>
            )}

            {/* Server Info */}
            {serverInfo && (
              <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 shadow-sm">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
                  <Server className="h-4 w-4 text-zinc-400" /> Matrix Server Info
                </h3>
                <pre className="text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800 rounded-xl p-3 overflow-x-auto max-h-[200px] overflow-y-auto">
                  {JSON.stringify(serverInfo, null, 2)}
                </pre>
              </div>
            )}

            {/* Quick Actions */}
            <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 shadow-sm">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3">Thao tác nhanh</h3>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => { void loadUsers(); void loadRooms(); void loadServerInfo(); }} className="flex items-center gap-1.5 rounded-xl bg-sky-50 dark:bg-sky-900/20 px-3 py-2 text-xs font-medium text-sky-600 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-900/30 transition-colors">
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
            {/* Toolbar */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-[200px] relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Tìm người dùng..."
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <button onClick={() => setShowCreateUser(!showCreateUser)} className="flex items-center gap-1.5 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-600 transition-colors shadow-sm">
                <UserPlus className="h-4 w-4" /> Tạo mới
              </button>
              <button onClick={loadUsers} disabled={usersLoading} className="flex items-center gap-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2.5 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50">
                <RefreshCw className={`h-4 w-4 ${usersLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Create User Form */}
            {showCreateUser && (
              <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-sky-200 dark:border-sky-800 p-4 shadow-sm animate-in fade-in slide-in-from-top-2 duration-200">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3">Tạo tài khoản mới</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="Username" className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                  <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Password" className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                  <input value={newDisplayName} onChange={(e) => setNewDisplayName(e.target.value)} placeholder="Tên hiển thị (tùy chọn)" className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                </div>
                <div className="mt-3 flex gap-2">
                  <button onClick={createUser} disabled={creating || !newUsername || !newPassword} className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-bold text-white hover:bg-sky-600 disabled:opacity-50 flex items-center gap-1.5">
                    {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                    Tạo
                  </button>
                  <button onClick={() => setShowCreateUser(false)} className="rounded-xl px-4 py-2 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">Hủy</button>
                </div>
              </div>
            )}

            {/* Users Table */}
            <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{filteredUsers.length} người dùng</p>
              </div>
              <div className="max-h-[500px] overflow-y-auto">
                {usersLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
                    <Users className="h-8 w-8 mb-2" />
                    <p className="text-sm">Không có người dùng</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-50 dark:bg-zinc-800/50 sticky top-0">
                      <tr>
                        <th className="text-left px-4 py-2 text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">User ID</th>
                        <th className="text-left px-4 py-2 text-[11px] uppercase tracking-wider text-zinc-400 font-semibold hidden sm:table-cell">Tên</th>
                        <th className="text-left px-4 py-2 text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">SĐT</th>
                        <th className="text-left px-4 py-2 text-[11px] uppercase tracking-wider text-zinc-400 font-semibold hidden md:table-cell">Mật khẩu</th>
                        <th className="text-right px-4 py-2 text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {filteredUsers.map((user) => {
                        const phone = extractPhone(user.name);
                        return (
                        <tr key={user.name} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-mono text-xs text-zinc-700 dark:text-zinc-300">{user.name}</p>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell text-xs text-zinc-500">{user.displayname || '—'}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <Phone className="h-3 w-3 text-zinc-400" />
                              <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">{phone}</span>
                              {phone !== '—' && (
                                <button onClick={() => { navigator.clipboard.writeText(phone); showNotice('success', 'Đã copy SĐT'); }} className="text-zinc-400 hover:text-zinc-600">
                                  <Copy className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <span className="font-mono text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded">12345678</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => { setResetUserId(user.name); setResetPassword(''); }}
                                className="h-7 w-7 rounded-lg flex items-center justify-center text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                                title="Đổi mật khẩu"
                              >
                                <Key className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => deleteUser(user.name)}
                                className="h-7 w-7 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                title="Xóa"
                              >
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

            {/* Reset Password Modal */}
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
                <input
                  value={roomSearch}
                  onChange={(e) => setRoomSearch(e.target.value)}
                  placeholder="Tìm phòng..."
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <button onClick={loadRooms} disabled={roomsLoading} className="flex items-center gap-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2.5 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50">
                <RefreshCw className={`h-4 w-4 ${roomsLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{filteredRooms.length} phòng</p>
              </div>
              <div className="max-h-[500px] overflow-y-auto">
                {roomsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
                  </div>
                ) : filteredRooms.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
                    <MessageSquare className="h-8 w-8 mb-2" />
                    <p className="text-sm">Không có phòng</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-50 dark:bg-zinc-800/50 sticky top-0">
                      <tr>
                        <th className="text-left px-4 py-2 text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">Tên phòng</th>
                        <th className="text-left px-4 py-2 text-[11px] uppercase tracking-wider text-zinc-400 font-semibold hidden sm:table-cell">Room ID</th>
                        <th className="text-center px-4 py-2 text-[11px] uppercase tracking-wider text-zinc-400 font-semibold hidden md:table-cell">Thành viên</th>
                        <th className="text-right px-4 py-2 text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {filteredRooms.map((room) => (
                        <tr key={room.room_id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-medium text-zinc-700 dark:text-zinc-300">{room.name || room.canonical_alias || '(Không tên)'}</p>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell">
                            <div className="flex items-center gap-1">
                              <p className="font-mono text-[11px] text-zinc-500 truncate max-w-[200px]">{room.room_id}</p>
                              <button onClick={() => { navigator.clipboard.writeText(room.room_id); showNotice('success', 'Đã copy'); }} className="text-zinc-400 hover:text-zinc-600">
                                <Copy className="h-3 w-3" />
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center hidden md:table-cell text-zinc-500">{room.joined_members ?? '—'}</td>
                          <td className="px-4 py-3 text-right">
                            <button onClick={() => deleteRoom(room.room_id)} className="h-7 w-7 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Xóa phòng">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
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
                <input
                  value={logPhone}
                  onChange={(e) => setLogPhone(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void loadLogs(); }}
                  placeholder="Nhập số điện thoại (VD: 0111111)..."
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <button onClick={() => loadLogs()} disabled={logsLoading} className="flex items-center gap-1.5 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-600 disabled:opacity-50">
                {logsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                Tra cứu
              </button>
            </div>

            {/* Pending OTPs */}
            {pendingOtps.length > 0 && (
              <div className="rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/10 dark:to-teal-900/10 border border-emerald-200 dark:border-emerald-800 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Key className="h-4 w-4 text-emerald-600" />
                  <h3 className="text-sm font-bold text-emerald-800 dark:text-emerald-400">OTP đang chờ xác thực ({pendingOtps.length})</h3>
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
                        <button onClick={() => { navigator.clipboard.writeText(otp.code); showNotice('success', 'Đã copy OTP'); }} className="text-zinc-400 hover:text-zinc-600">
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* OTP Quick Lookup */}
            <div className="rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/10 dark:to-orange-900/10 border border-amber-200 dark:border-amber-800 p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <h3 className="text-sm font-bold text-amber-800 dark:text-amber-400">OTP Quick View</h3>
              </div>
              <p className="text-xs text-amber-600 dark:text-amber-500">
                Nhấn &quot;Tra cứu&quot; không cần nhập SĐT để xem tất cả log gần đây. Hoặc nhập SĐT cụ thể để lọc.
              </p>
              <p className="text-xs text-amber-500 mt-1">
                OTP đang chờ sẽ hiển thị ở card phía trên (nếu có).
              </p>
            </div>

            {/* Log Table */}
            <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{logs.length} sự kiện</p>
              </div>
              <div className="max-h-[500px] overflow-y-auto">
                {logsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
                  </div>
                ) : logs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
                    <Key className="h-8 w-8 mb-2" />
                    <p className="text-sm">Nhập số điện thoại để xem log</p>
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {logs.map((log) => (
                      <div key={log.id} className="px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {log.success ? (
                                <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                              ) : (
                                <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                              )}
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                log.type.includes('success') ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                                log.suspicious ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                                'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                              }`}>
                                {log.type}
                              </span>
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

      <MobileBottomBar />
    </div>
  );
}

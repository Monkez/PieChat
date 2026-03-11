export interface User {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  status: 'online' | 'offline' | 'away';
}

export interface Room {
  id: string;
  name: string;
  type: 'dm' | 'group' | 'channel';
  unreadCount: number;
  lastMessage?: Message;
  members: User[];
  channelId?: string;
  isDefaultGroup?: boolean;
  isArchived?: boolean;
  isAssistant?: boolean;
  priority?: number;
  createdAt?: number;
  channelRoles: Record<string, PieChatRole>;
  groupRoles: Record<string, PieChatRole>;
  createdBy?: string;
  callInvite?: {
    callId: string;
    offer: any;
    senderId: string;
    type: 'voice' | 'video';
    timestamp: number;
  };
  lastCallStatus?: 'invite' | 'hangup' | 'answer';
  restrictSpeaking?: boolean;
  friendship?: {
    status: 'pending' | 'accepted' | 'rejected';
    requester: string;
  };
}

export interface Message {
  id: string;
  roomId: string;
  senderId: string;
  content: string;
  timestamp: number;
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  reactions?: Record<string, number>;
  reactionDetails?: Record<string, string[]>;
  msgtype?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  duration?: number;
  thumbnailUrl?: string;
  uploadProgress?: number;
  replyTo?: { eventId: string; senderId: string; body: string };
  edited?: boolean;
  inlineButtons?: Array<{ id: string; label: string; action?: string; url?: string; style?: 'primary' | 'secondary' | 'danger' }>;
  callInfo?: { type: 'voice' | 'video'; status: 'answered' | 'missed' | 'ongoing' | 'calling'; duration?: string };
}

export interface UserDirectoryAccount {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
}

export type PieChatRole = 'leader' | 'deputy' | 'member';

interface PieChatChannelMeta {
  kind: 'channel';
  channelId: string;
  defaultGroupId?: string;
  createdBy: string;
  createdAt: number;
  restrictSpeaking?: boolean;
}

interface PieChatGroupMeta {
  kind: 'group';
  channelId: string;
  isDefaultGroup: boolean;
  archived?: boolean;
  priority?: number;
  createdBy: string;
  createdAt: number;
  restrictSpeaking?: boolean;
}

interface PieChatRoleState {
  channelRoles: Record<string, PieChatRole>;
  groupRoles: Record<string, PieChatRole>;
}

interface LoginResponse {
  access_token: string;
  user_id: string;
}

interface PhoneLoginStartResponse {
  requiresOtp: boolean;
  matrixUsername: string;
  otpToken?: string;
  maskedPhone?: string;
  devOtp?: string;
}

interface OtpVerifyResponse {
  success: boolean;
  matrixUsername: string;
}

export interface OtpChallenge {
  otpToken: string;
  matrixUsername: string;
  phone: string;
  password: string;
  maskedPhone: string;
  deviceId: string;
  devOtp?: string;
}

export class OtpRequiredError extends Error {
  challenge: OtpChallenge;

  constructor(challenge: OtpChallenge) {
    super('OTP_REQUIRED');
    this.challenge = challenge;
  }
}

export class AuthApiError extends Error {
  retryAfterSeconds?: number;

  constructor(message: string, retryAfterSeconds?: number) {
    super(message);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

interface SyncResponse {
  account_data?: {
    events?: Array<{ type: string; content: Record<string, unknown> }>;
  };
  rooms?: {
    join?: Record<
      string,
      {
        state?: { events?: Array<{ type: string; state_key?: string; content: Record<string, unknown> }> };
        timeline?: { events?: Array<{ event_id: string; sender: string; type: string; content: Record<string, unknown>; origin_server_ts: number; state_key?: string }> };
        unread_notifications?: { notification_count?: number; highlight_count?: number };
        ephemeral?: { events?: Array<{ type: string; content: Record<string, unknown> }> };
      }
    >;
    invite?: Record<
      string,
      {
        invite_state?: { events?: Array<{ type: string; state_key?: string; content: Record<string, unknown> }> };
      }
    >;
  };
}

interface JoinedMembersResponse {
  joined: Record<
    string,
    {
      display_name?: string;
      avatar_url?: string;
    }
  >;
}

interface JoinedRoomsResponse {
  joined_rooms: string[];
}

interface UserDirectorySearchResponse {
  results?: Array<{
    user_id: string;
    display_name?: string;
    avatar_url?: string;
  }>;
}

class MatrixService {
  private static instance: MatrixService;
  private accessToken: string | null = null;
  private baseUrl = (() => {
    try {
      const { getConfig } = require('../config');
      return getConfig().matrixBaseUrl;
    } catch {
      return process.env.NEXT_PUBLIC_MATRIX_BASE_URL ||
        (typeof window !== 'undefined' ? `http://${window.location.hostname}:8008` : 'http://localhost:8008');
    }
  })();
  private presenceCache = new Map<string, 'online' | 'offline' | 'away'>();
  private lastMessageCache = new Map<string, Message>();
  private displayNameCache = new Map<string, string>();

  public static getInstance(): MatrixService {
    if (!MatrixService.instance) {
      MatrixService.instance = new MatrixService();
    }
    return MatrixService.instance;
  }

  private getPersistedAccessToken() {
    if (typeof window === 'undefined') {
      return null;
    }
    return localStorage.getItem('matrix_access_token');
  }

  private getCurrentUserId() {
    if (typeof window === 'undefined') {
      return '';
    }
    return localStorage.getItem('matrix_user_id') || '';
  }

  private async request<T>(path: string, init?: RequestInit, requiresAuth = true): Promise<T> {
    const headers = new Headers(init?.headers || {});
    headers.set('Content-Type', 'application/json');
    if (requiresAuth && !this.accessToken) {
      this.accessToken = this.getPersistedAccessToken();
    }
    if (requiresAuth && this.accessToken) {
      headers.set('Authorization', `Bearer ${this.accessToken}`);
    }
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });
    if (!response.ok) {
      const errorPayload = await response.text();
      throw new Error(errorPayload || `Matrix request failed: ${response.status}`);
    }
    return response.json() as Promise<T>;
  }

  private async parseAuthError(response: Response, fallbackMessage: string) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string; retryAfterSeconds?: number };
    return new AuthApiError(payload.error || fallbackMessage, payload.retryAfterSeconds);
  }

  private persistSession(accessToken: string, userId: string) {
    this.accessToken = accessToken;
    if (typeof window !== 'undefined') {
      localStorage.setItem('matrix_access_token', accessToken);
      localStorage.setItem('matrix_user_id', userId);
    }
  }

  private clearSession() {
    this.accessToken = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('matrix_access_token');
      localStorage.removeItem('matrix_user_id');
    }
  }

  private userFromId(userId: string, presence?: 'online' | 'offline' | 'away', displayName?: string): User {
    const username = userId.replace(/^@/, '').split(':')[0];
    // Use provided displayName, then check cache, then undefined
    const resolvedDisplayName = displayName || this.displayNameCache.get(userId) || undefined;
    if (resolvedDisplayName && !this.displayNameCache.has(userId)) {
      this.displayNameCache.set(userId, resolvedDisplayName);
    }
    const seed = resolvedDisplayName || username;
    return {
      id: userId,
      username,
      displayName: resolvedDisplayName,
      status: presence || 'offline',
      avatarUrl: `https://api.dicebear.com/7.x/initials/png?seed=${encodeURIComponent(seed)}`,
    };
  }

  public normalizePhone(phone: string) {
    const digits = phone.replace(/\D/g, '');
    if (!digits) {
      return '';
    }
    if (digits.startsWith('0')) {
      return `+84${digits.slice(1)}`;
    }
    if (digits.startsWith('84')) {
      return `+${digits}`;
    }
    return `+${digits}`;
  }

  private resolveMatrixUsernameFromPhone(phone: string) {
    const normalized = this.normalizePhone(phone);
    const mapped = this.getPhoneAuthMap()[normalized];
    if (mapped) {
      return mapped;
    }
    const digits = normalized.replace(/\D/g, '');
    return `u${digits}`;
  }

  private getPhoneAuthMap() {
    const fallbackMap: Record<string, string> = {
      '+84111111': 'u111111',
      '+84222222': 'u222222',
      '+84333333': 'u333333',
      '+84444444': 'u444444',
      '+84555555': 'u555555',
    };
    let envMap: Record<string, string> = {};
    if (process.env.NEXT_PUBLIC_PHONE_AUTH_MAP) {
      try {
        envMap = JSON.parse(process.env.NEXT_PUBLIC_PHONE_AUTH_MAP) as Record<string, string>;
      } catch {
        envMap = {};
      }
    }
    const merged = { ...envMap, ...fallbackMap };
    // console.log('[MatrixService] Phone Map:', merged);
    return merged;
  }

  public resolveKnownMatrixUserIdFromPhone(phone: string) {
    const normalized = this.normalizePhone(phone);
    const mappedUsername = this.getPhoneAuthMap()[normalized];
    if (!mappedUsername) {
      return null;
    }
    const matrixDomain = process.env.NEXT_PUBLIC_MATRIX_SERVER_NAME || 'localhost';
    return `@${mappedUsername}:${matrixDomain}`;
  }

  private resolveMatrixUserIdFromPhone(phone: string) {
    const username = this.resolveMatrixUsernameFromPhone(phone);
    const matrixDomain = process.env.NEXT_PUBLIC_MATRIX_SERVER_NAME || 'localhost';
    return `@${username}:${matrixDomain}`;
  }

  private normalizeRole(value: unknown): PieChatRole {
    if (value === 'leader' || value === 'deputy') {
      return value;
    }
    return 'member';
  }

  private normalizeRoleMap(value: unknown): Record<string, PieChatRole> {
    if (!value || typeof value !== 'object') {
      return {};
    }
    const entries = Object.entries(value as Record<string, unknown>);
    return entries.reduce<Record<string, PieChatRole>>((acc, [userId, role]) => {
      if (!userId.startsWith('@')) {
        return acc;
      }
      acc[userId] = this.normalizeRole(role);
      return acc;
    }, {});
  }

  private async sendStateEvent<T extends object>(roomId: string, eventType: string, content: T, stateKey = '') {
    await this.request<{ event_id: string }>(
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/${encodeURIComponent(eventType)}/${encodeURIComponent(stateKey)}`,
      {
        method: 'PUT',
        body: JSON.stringify(content),
      },
    );
  }

  private async fetchRoomState(roomId: string) {
    return this.request<Array<{ type: string; state_key?: string; content: Record<string, unknown> }>>(
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state`,
    );
  }

  private normalizeUserIdCandidate(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }
    if (trimmed.startsWith('@') && trimmed.includes(':')) {
      return trimmed;
    }
    const raw = trimmed.replace(/^@/, '').split(':')[0];
    const matrixDomain = process.env.NEXT_PUBLIC_MATRIX_SERVER_NAME || 'localhost';
    return `@${raw}:${matrixDomain}`;
  }

  private async resolveInviteUserIds(memberUserIds: string[]) {
    const invite = memberUserIds
      .map((userId) => this.normalizeUserIdCandidate(userId))
      .filter((value) => value.startsWith('@'))
      .filter((value, index, array) => Boolean(value) && array.indexOf(value) === index);
    if (memberUserIds.length > 0 && invite.length === 0) {
      throw new Error('Không tìm thấy thành viên phù hợp');
    }
    return invite;
  }

  async searchUsersByName(query: string): Promise<UserDirectoryAccount[]> {
    const keyword = query.trim();
    if (keyword.length < 2) {
      return [];
    }
    const response = await this.request<UserDirectorySearchResponse>(
      '/_matrix/client/v3/user_directory/search',
      {
        method: 'POST',
        body: JSON.stringify({
          search_term: keyword,
          limit: 10,
        }),
      },
    ).catch(() => null);
    const currentUserId = this.getCurrentUserId();
    const fromDirectory = (response?.results || [])
      .map((item) => {
        const userId = String(item.user_id || '');
        if (!userId.startsWith('@')) {
          return null;
        }
        const username = userId.replace(/^@/, '').split(':')[0];
        return {
          userId,
          username,
          displayName: item.display_name || username,
          avatarUrl: item.avatar_url || this.userFromId(userId).avatarUrl,
        } as UserDirectoryAccount;
      })
      .filter((item): item is UserDirectoryAccount => Boolean(item))
      .filter((item) => item.userId !== currentUserId);
    if (fromDirectory.length > 0) {
      return fromDirectory;
    }
    const isPhoneNumber = /^\d+$/.test(keyword) || keyword.startsWith('+');
    const directSearchUserId = isPhoneNumber ? this.resolveMatrixUserIdFromPhone(keyword) : null;

    const fallbackUserIds = Object.keys(this.getPhoneAuthMap())
      .map((phone) => this.resolveKnownMatrixUserIdFromPhone(phone))
      .filter((value): value is string => Boolean(value));

    if (directSearchUserId) {
      fallbackUserIds.push(directSearchUserId);
    }

    const uniqueFallbackIds = Array.from(new Set(fallbackUserIds))
      .filter((userId) => {
        if (directSearchUserId && userId === directSearchUserId) return true;
        return userId.toLowerCase().includes(keyword.toLowerCase());
      })
      .slice(0, 10);

    const fallbackProfiles = await Promise.all(
      uniqueFallbackIds.map(async (userId) => {
        const username = userId.replace(/^@/, '').split(':')[0];
        const profile = await this.fetchProfileUser(userId);
        return {
          userId,
          username,
          displayName: profile?.displayname || username,
          avatarUrl: profile?.avatar_url || this.userFromId(userId).avatarUrl,
        } as UserDirectoryAccount;
      }),
    );
    return fallbackProfiles.filter((item) => item.userId !== currentUserId);
  }

  private async fetchProfileUser(userId: string) {
    const encoded = encodeURIComponent(userId);
    const response = await fetch(`${this.baseUrl}/_matrix/client/v3/profile/${encoded}`, {
      headers: this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : undefined,
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json().catch(() => ({}))) as { displayname?: string; avatar_url?: string };
    return payload;
  }

  private async autoJoinInvitedRooms(sync: SyncResponse): Promise<string[]> {
    const inviteRooms = Object.keys(sync.rooms?.invite || {});
    if (!inviteRooms.length) {
      return [];
    }
    const joinedRoomIds: string[] = [];

    await Promise.all(
      inviteRooms.map(async (roomId) => {
        try {
          await this.request<{ room_id: string }>(
            `/_matrix/client/v3/join/${encodeURIComponent(roomId)}`,
            {
              method: 'POST',
              body: JSON.stringify({}),
            },
          );
          joinedRoomIds.push(roomId);
        } catch {
          try {
            await this.request<{ room_id: string }>(
              `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/join`,
              {
                method: 'POST',
                body: JSON.stringify({}),
              },
            );
            joinedRoomIds.push(roomId);
          } catch {
          }
        }
      }),
    );
    return joinedRoomIds;
  }

  private getOrCreateDeviceId() {
    if (typeof window === 'undefined') {
      return 'server-device';
    }
    const existing = localStorage.getItem('piechat_device_id');
    if (existing) {
      return existing;
    }
    const generated = `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem('piechat_device_id', generated);
    return generated;
  }

  private async loginMatrix(username: string, password: string): Promise<User> {
    const devMatrixPassword = process.env.NEXT_PUBLIC_DEV_MATRIX_PASSWORD || '12345678';
    const allowDevPassword = process.env.NODE_ENV !== 'production' &&
      (password === '1' || password === devMatrixPassword);
    // Use actual password if provided in dev environment
    const effectivePassword = password;

    const loginWithPassword = async (secret: string) => {
      let lastError: Error | null = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const payload: LoginResponse = await this.request<LoginResponse>(
            '/_matrix/client/v3/login',
            {
              method: 'POST',
              body: JSON.stringify({
                type: 'm.login.password',
                identifier: {
                  type: 'm.id.user',
                  user: username,
                },
                password: secret,
              }),
            },
            false,
          );
          this.persistSession(payload.access_token, payload.user_id);
          const profile = await this.fetchProfileUser(payload.user_id);
          return this.userFromId(payload.user_id, undefined, profile?.displayname);
        } catch (error) {
          lastError = error instanceof Error ? error : new Error('Đăng nhập thất bại');
          const message = lastError.message || '';
          const transient = message.includes('SQLITE_BUSY') || message.includes('database is locked') || message.includes('500');
          if (!transient || attempt === 2) {
            throw lastError;
          }
          await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
        }
      }
      throw lastError || new Error('Đăng nhập thất bại');
    };

    try {
      return await loginWithPassword(effectivePassword);
    } catch (error) {
      if (!allowDevPassword) {
        throw error;
      }

      // Trong môi trường dev, thử đăng ký tài khoản mới nếu đăng nhập thất bại
      try {
        const registerPayload = await this.request<LoginResponse>(
          '/_matrix/client/v3/register',
          {
            method: 'POST',
            body: JSON.stringify({
              username,
              password: password,
              auth: { type: 'm.login.dummy' },
            }),
          },
          false,
        );
        this.persistSession(registerPayload.access_token, registerPayload.user_id);
        return this.userFromId(registerPayload.user_id);
      } catch (registerError) {
        // Nếu đăng ký thất bại (có thể username đã tồn tại), thử đăng nhập lại
        try {
          return await loginWithPassword(devMatrixPassword);
        } catch (finalError) {
          throw finalError instanceof Error ? finalError : new Error('Đăng nhập thất bại');
        }
      }
    }
  }

  async login(phone: string, password: string): Promise<User> {
    const deviceId = this.getOrCreateDeviceId();
    const { authUrl } = require('../config');
    const start = await fetch(authUrl('/request-otp'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password, deviceId }),
    });
    if (!start.ok) {
      throw await this.parseAuthError(start, 'Đăng nhập thất bại');
    }
    const startData = (await start.json()) as PhoneLoginStartResponse;
    if (startData.requiresOtp) {
      const challenge: OtpChallenge = {
        otpToken: startData.otpToken || '',
        matrixUsername: startData.matrixUsername,
        phone,
        password,
        maskedPhone: startData.maskedPhone || phone,
        deviceId,
        devOtp: startData.devOtp,
      };
      throw new OtpRequiredError(challenge);
    }
    return this.loginMatrix(startData.matrixUsername, password);
  }

  async verifyOtpAndLogin(challenge: OtpChallenge, otpCode: string): Promise<User> {
    const { authUrl } = require('../config');
    const verifyResponse = await fetch(authUrl('/verify-otp'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        otpToken: challenge.otpToken,
        otpCode,
      }),
    });
    if (!verifyResponse.ok) {
      throw await this.parseAuthError(verifyResponse, 'Xác thực OTP thất bại');
    }
    const verifyData = (await verifyResponse.json()) as OtpVerifyResponse;
    if (!verifyData.success) {
      throw new Error('Xác thực OTP thất bại');
    }
    return this.loginMatrix(verifyData.matrixUsername, challenge.password);
  }

  async restoreSession(): Promise<User | null> {
    if (typeof window === 'undefined') {
      return null;
    }
    const token = localStorage.getItem('matrix_access_token');
    const userId = localStorage.getItem('matrix_user_id');
    if (!token || !userId) {
      return null;
    }
    this.accessToken = token;
    try {
      const whoAmI = await this.request<{ user_id: string }>('/_matrix/client/v3/account/whoami');
      const profile = await this.fetchProfileUser(whoAmI.user_id);
      return this.userFromId(whoAmI.user_id, undefined, profile?.displayname);
    } catch {
      this.clearSession();
      return null;
    }
  }

  async fetchCurrentProfile(): Promise<User | null> {
    const userId = this.getCurrentUserId();
    if (!userId) return null;
    try {
      const profile = await this.fetchProfileUser(userId);
      return this.userFromId(userId, undefined, profile?.displayname);
    } catch {
      return null;
    }
  }

  async showNotification(title: string, options?: NotificationOptions & { data?: any }) {
    try {
      if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return;

      // Prefer SW notification (supports notificationclick → open room)
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(title, options);
      } else {
        new Notification(title, options);
      }
    } catch {
      // Notification not available
    }
  }

  logout() {
    this.clearSession();
  }

  async leaveRoom(roomId: string): Promise<void> {
    await this.request(
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/leave`,
      {
        method: 'POST',
        body: JSON.stringify({}),
      }
    );
  }

  async getRooms(): Promise<Room[]> {
    const firstSync = await this.request<SyncResponse>('/_matrix/client/v3/sync?timeout=0');
    const newlyJoinedIds = await this.autoJoinInvitedRooms(firstSync);
    const sync = await this.request<SyncResponse>('/_matrix/client/v3/sync?timeout=0');

    const joinedRooms = sync.rooms?.join || {};
    const invitedRooms = sync.rooms?.invite || {};

    const currentUserPresence = this.getCurrentUserId();
    if (currentUserPresence) {
      this.presenceCache.set(currentUserPresence, 'online');
    }

    (sync as any).presence?.events?.forEach((event: any) => {
      const p = event.content?.presence;
      let status: 'online' | 'offline' | 'away' = 'offline';
      if (p === 'online') status = 'online';
      else if (p === 'unavailable') status = 'away';
      this.presenceCache.set(event.sender, status);
    });

    newlyJoinedIds.forEach(id => {
      if (!joinedRooms[id]) {
        return;
      }
    });

    const currentUserId = this.getCurrentUserId();
    const currentUsername = currentUserId ? this.userFromId(currentUserId).username : '';

    const directRoomIds = new Set<string>();
    const directEvent = (sync.account_data?.events || []).find((event) => event.type === 'm.direct');
    const directContent = (directEvent?.content || {}) as Record<string, unknown>;
    Object.values(directContent).forEach((value) => {
      if (!Array.isArray(value)) {
        return;
      }
      value.forEach((roomId) => {
        if (typeof roomId === 'string' && roomId.length > 0) {
          directRoomIds.add(roomId);
        }
      });
    });

    const allRoomIds = Array.from(new Set([
      ...Object.keys(joinedRooms),
      ...Object.keys(invitedRooms),
      ...newlyJoinedIds
    ]));

    const rooms = await Promise.all(
      allRoomIds.map(async (roomId) => {
        let stateEvents: Array<{ type: string; state_key?: string; content: Record<string, unknown> }> = [];
        let timelineEvents: Array<{ event_id: string; sender: string; type: string; content: Record<string, unknown>; origin_server_ts: number; state_key?: string }> = [];

        if (joinedRooms[roomId]) {
          stateEvents = joinedRooms[roomId].state?.events || [];

          // Matrix sync response divides state into 'state' and 'timeline'
          // We must take state events from timeline too as they are the most recent
          const timelineEventsSource = joinedRooms[roomId].timeline?.events || [];
          const timelineStateEvents = timelineEventsSource
            .filter((e) => e.state_key !== undefined)
            .map((e) => ({
              type: e.type,
              state_key: e.state_key,
              content: e.content,
            }));

          if (timelineStateEvents.length > 0) {
            const stateMap = new Map();
            // Load base state
            stateEvents.forEach(ev => stateMap.set(`${ev.type}_${ev.state_key || ''}`, ev));
            // Overwrite with timeline state (newer)
            timelineStateEvents.forEach(ev => stateMap.set(`${ev.type}_${ev.state_key || ''}`, ev));
            stateEvents = Array.from(stateMap.values());
          }

          timelineEvents = timelineEventsSource;
        } else if (invitedRooms[roomId]) {
          stateEvents = invitedRooms[roomId].invite_state?.events || [];
        } else if (newlyJoinedIds.includes(roomId)) {
          try {
            const state = await this.request<Array<{ type: string; state_key?: string; content: Record<string, unknown> }>>(
              `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state`
            );
            stateEvents = state;
          } catch {
          }
        }

        const nameState = stateEvents.find((event) => event.type === 'm.room.name');
        const joinRuleState = stateEvents.find((event) => event.type === 'm.room.join_rules');
        const createState = stateEvents.find((event) => event.type === 'm.room.create');
        const channelMetaState = stateEvents.find((event) => event.type === 'io.piechat.channel.meta');
        const groupMetaState = stateEvents.find((event) => event.type === 'io.piechat.group.meta');
        const roleState = stateEvents.find((event) => event.type === 'io.piechat.roles');
        const friendshipState = stateEvents.find((event) => event.type === 'io.piechat.friendship');
        const assistantMetaState = stateEvents.find((event) => event.type === 'io.piechat.assistant.meta');
        const memberStateEvents = stateEvents.filter((event) => event.type === 'm.room.member') || [];

        const activeMembers = memberStateEvents.filter((event) => {
          const membership = String(event.content?.membership || '');
          return membership === 'join' || membership === 'invite';
        });
        const joinedMembers = memberStateEvents.filter((event) => String(event.content?.membership || '') === 'join');
        const joinRule = String(joinRuleState?.content?.join_rule || '');
        const hasInvitedMember = activeMembers.some((event) => String(event.content?.membership || '') === 'invite');
        const isDirectFromCreate = Boolean(createState?.content?.is_direct);

        const isTwoPeople = (activeMembers.length === 2) || (activeMembers.length === 1 && hasInvitedMember);

        const channelMeta = (channelMetaState?.content || null) as Partial<PieChatChannelMeta> | null;
        const groupMeta = (groupMetaState?.content || null) as Partial<PieChatGroupMeta> | null;

        const isDirect =
          directRoomIds.has(roomId) ||
          isDirectFromCreate ||
          (isTwoPeople && joinRule !== 'public' && !channelMetaState && !groupMetaState);

        let inferredType: Room['type'] =
          isDirect
            ? 'dm'
            : joinRule === 'public'
              ? 'channel'
              : 'group';

        if (channelMeta?.kind === 'channel') {
          inferredType = 'channel';
        } else if (groupMeta?.kind === 'group') {
          inferredType = 'group';
        }
        const channelRoles = this.normalizeRoleMap((roleState?.content as Partial<PieChatRoleState> | undefined)?.channelRoles);
        const groupRoles = this.normalizeRoleMap((roleState?.content as Partial<PieChatRoleState> | undefined)?.groupRoles);
        const channelId =
          groupMeta?.kind === 'group' && typeof groupMeta.channelId === 'string' && groupMeta.channelId
            ? groupMeta.channelId
            : channelMeta?.kind === 'channel'
              ? roomId
              : undefined;
        const isArchived = Boolean(groupMeta?.archived);
        const priority = typeof (groupMeta?.priority) === 'number' ? groupMeta.priority : 100;
        const createdAt = typeof (groupMeta?.createdAt) === 'number' ? groupMeta.createdAt : 0;

        let roomMembers = activeMembers
          .filter((event) => (event.state_key || '').startsWith('@'))
          .map((event) => {
            const userId = event.state_key!;
            const displayName = event.content?.displayname as string | undefined;
            return this.userFromId(userId, this.presenceCache.get(userId), displayName);
          });

        // If members list is empty (common in minimal sync or initial invite), try to fetch if joined
        if (!roomMembers.length && joinedRooms[roomId]) {
          const joinedMembersPayload = await this.request<JoinedMembersResponse>(
            `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/joined_members`,
          ).catch(() => null);
          if (joinedMembersPayload?.joined) {
            roomMembers = Object.entries(joinedMembersPayload.joined).map(([userId, details]) =>
              this.userFromId(userId, this.presenceCache.get(userId), details.display_name)
            );
          }
        }

        // Enrich members without display names by fetching their profiles
        const membersNeedingProfile = roomMembers.filter(m => !m.displayName && !this.displayNameCache.has(m.id));
        if (membersNeedingProfile.length > 0) {
          await Promise.all(membersNeedingProfile.map(async (member) => {
            const profile = await this.fetchProfileUser(member.id);
            if (profile?.displayname) {
              this.displayNameCache.set(member.id, profile.displayname);
              member.displayName = profile.displayname;
              member.avatarUrl = `https://api.dicebear.com/7.x/initials/png?seed=${encodeURIComponent(profile.displayname)}`;
            }
          }));
        } else {
          // Apply cached names to members that were built without display names
          roomMembers.forEach(member => {
            if (!member.displayName && this.displayNameCache.has(member.id)) {
              member.displayName = this.displayNameCache.get(member.id);
              member.avatarUrl = `https://api.dicebear.com/7.x/initials/png?seed=${encodeURIComponent(member.displayName!)}`;
            }
          });
        }
        // Removed forced DM override for 1-2 member rooms without meta - rely on isDirect logic above instead.

        const otherMember =
          roomMembers.find((user) => user.id !== currentUserId) ||
          roomMembers[0] ||
          null;

        const fallbackDmName = otherMember?.username || roomId;
        const rawName = String(nameState?.content?.name || '');

        const shouldUsePeerName =
          inferredType === 'dm' &&
          otherMember &&
          (!rawName || rawName.startsWith('!') || rawName === currentUsername);

        const resolvedName =
          rawName && !shouldUsePeerName
            ? rawName
            : inferredType === 'dm' && otherMember
              ? otherMember.displayName || otherMember.username
              : rawName || roomId;

        const isDefaultGroup = Boolean(groupMeta?.isDefaultGroup) ||
          (inferredType === 'group' && (resolvedName === 'Chung' || resolvedName === 'General'));

        const timeline = timelineEvents;
        const lastEvent = [...timeline].reverse().find((event) =>
          event.type === 'm.room.message' || event.type === 'm.room.encrypted'
        );
        const lastMessage: Message | undefined = lastEvent
          ? {
            id: lastEvent.event_id,
            roomId,
            senderId: lastEvent.sender,
            content: String(lastEvent.content?.body || ''),
            timestamp: lastEvent.origin_server_ts,
            status: 'read',
          }
          : this.lastMessageCache.get(roomId);

        if (lastMessage) {
          this.lastMessageCache.set(roomId, lastMessage);
        }

        const unreadCount = joinedRooms[roomId]?.unread_notifications?.notification_count || 0;

        // Call Detection
        const callInviteEvent = [...timeline].reverse().find(e => e.type === 'm.call.invite');
        const callHangupEvent = [...timeline].reverse().find(e => e.type === 'm.call.hangup');
        const callAnswerEvent = [...timeline].reverse().find(e => e.type === 'm.call.answer');

        let callInvite = undefined;
        let lastCallStatus: Room['lastCallStatus'] = undefined;

        if (callHangupEvent) {
          lastCallStatus = 'hangup';
        } else if (callAnswerEvent) {
          lastCallStatus = 'answer';
        } else if (callInviteEvent) {
          lastCallStatus = 'invite';
          if (callInviteEvent.sender !== currentUserId) {
            // Check if recent (last 60s)
            if (Date.now() - callInviteEvent.origin_server_ts < 60000) {
              const sdp = (callInviteEvent.content.offer as any)?.sdp || '';
              callInvite = {
                callId: callInviteEvent.content.call_id as string,
                offer: callInviteEvent.content.offer,
                senderId: callInviteEvent.sender,
                type: sdp.includes('m=video') ? 'video' : 'voice' as any,
                timestamp: callInviteEvent.origin_server_ts
              };
            }
          }
        }

        // Parse ephemeral typing events
        if (joinedRooms[roomId]?.ephemeral?.events) {
          for (const ev of joinedRooms[roomId].ephemeral!.events!) {
            if (ev.type === 'm.typing') {
              const userIds = (ev.content?.user_ids as string[]) || [];
              this.setTypingUsers(roomId, userIds);
            }
          }
        }

        return {
          id: roomId,
          name: resolvedName,
          type: inferredType,
          unreadCount,
          members: roomMembers,
          lastMessage,
          channelId,
          isDefaultGroup,
          isArchived,
          isAssistant: Boolean(assistantMetaState?.content?.isAssistant),
          priority,
          createdAt,
          channelRoles,
          groupRoles,
          createdBy: groupMeta?.createdBy || channelMeta?.createdBy,
          callInvite,
          lastCallStatus,
          restrictSpeaking: Boolean(groupMeta?.restrictSpeaking || channelMeta?.restrictSpeaking),
          friendship: friendshipState?.content as any
        };
      }),
    );
    return rooms.filter((room) => !(room.type === 'group' && room.isArchived));
  }

  async createChannel(name: string, topic: string, isPublic: boolean, memberUserIds: string[] = []): Promise<{ channel: Room; defaultGroup: Room | null }> {
    const currentUserId = this.getCurrentUserId();
    const payload = await this.request<{ room_id: string }>(
      '/_matrix/client/v3/createRoom',
      {
        method: 'POST',
        body: JSON.stringify({
          name,
          topic,
          preset: isPublic ? 'public_chat' : 'private_chat',
          visibility: isPublic ? 'public' : 'private',
        }),
      },
    );
    const channelId = payload.room_id;
    const channelMeta: PieChatChannelMeta = {
      kind: 'channel',
      channelId,
      createdBy: currentUserId,
      createdAt: Date.now(),
    };
    const channelRoleState: PieChatRoleState = {
      channelRoles: currentUserId ? { [currentUserId]: 'leader' } : {},
      groupRoles: {},
    };
    await this.sendStateEvent(channelId, 'io.piechat.channel.meta', channelMeta);
    await this.sendStateEvent(channelId, 'io.piechat.roles', channelRoleState);

    const invite = await this.resolveInviteUserIds(memberUserIds);
    await Promise.all(
      invite.map((userId) =>
        this.request<{ event_id: string }>(
          `/_matrix/client/v3/rooms/${encodeURIComponent(channelId)}/invite`,
          {
            method: 'POST',
            body: JSON.stringify({ user_id: userId }),
          },
        ).catch(() => null),
      ),
    );

    let defaultGroup: Room | null = null;
    try {
      defaultGroup = await this.createGroup(channelId, 'Chung', [], true);
      await this.sendStateEvent(channelId, 'io.piechat.channel.meta', {
        ...channelMeta,
        defaultGroupId: defaultGroup.id,
      });
    } catch {
      defaultGroup = null;
    }
    const channel: Room = {
      id: channelId,
      name,
      type: 'channel',
      unreadCount: 0,
      members: [],
      channelId,
      isDefaultGroup: false,
      isArchived: false,
      channelRoles: channelRoleState.channelRoles,
      groupRoles: {},
    };
    return { channel, defaultGroup };
  }

  async createGroup(channelId: string | null, name: string, memberUserIds: string[], isDefaultGroup = false): Promise<Room> {
    const invite = await this.resolveInviteUserIds(memberUserIds);
    const createPayload: {
      name: string;
      preset: 'private_chat';
      visibility: 'private';
      invite?: string[];
    } = {
      name,
      preset: 'private_chat',
      visibility: 'private',
    };
    if (invite.length > 0) {
      createPayload.invite = invite;
    }
    const payload = await this.request<{ room_id: string }>(
      '/_matrix/client/v3/createRoom',
      {
        method: 'POST',
        body: JSON.stringify(createPayload),
      });
    const roomId = payload.room_id;

    // Invite explicitly listed members
    if (memberUserIds.length > 0) {
      const invite = await this.resolveInviteUserIds(memberUserIds);
      await Promise.all(
        invite.map((userId) =>
          this.request(
            `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/invite`,
            {
              method: 'POST',
              body: JSON.stringify({ user_id: userId }),
            }
          ).catch(() => null)
        )
      );
    }

    // Auto-invite channel leaders/deputies so they can always see group messages
    if (channelId) {
      try {
        const channelState = await this.fetchRoomState(channelId).catch(() => []);
        const channelRoleEvent = channelState.find((e: any) => e.type === 'io.piechat.roles');
        const channelRoles = this.normalizeRoleMap((channelRoleEvent?.content as any)?.channelRoles);
        const currentUserId = this.getCurrentUserId();
        const leaderDeputyIds = Object.entries(channelRoles)
          .filter(([uid, role]) => uid !== currentUserId && (role === 'leader' || role === 'deputy'))
          .map(([uid]) => uid)
          .filter(uid => !memberUserIds.includes(uid));
        if (leaderDeputyIds.length > 0) {
          await Promise.all(
            leaderDeputyIds.map((userId) =>
              this.request(
                `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/invite`,
                { method: 'POST', body: JSON.stringify({ user_id: userId }) }
              ).catch(() => null)
            )
          );
        }
      } catch {
        // Channel roles not accessible, skip
      }
    }

    const currentUserId = this.getCurrentUserId();
    const groupMeta: PieChatGroupMeta = {
      kind: 'group',
      channelId: channelId || '',
      isDefaultGroup,
      archived: false,
      priority: isDefaultGroup ? 0 : 100,
      createdBy: currentUserId,
      createdAt: Date.now(),
    };
    const roleState: PieChatRoleState = {
      channelRoles: {},
      groupRoles: currentUserId ? { [currentUserId]: 'leader' } : {},
    };
    await this.sendStateEvent(roomId, 'io.piechat.group.meta', groupMeta);
    await this.sendStateEvent(roomId, 'io.piechat.roles', roleState);
    return {
      id: roomId,
      name,
      type: 'group',
      unreadCount: 0,
      members: [],
      channelId: channelId || '',
      isDefaultGroup,
      isArchived: false,
      priority: groupMeta.priority,
      createdAt: groupMeta.createdAt,
      channelRoles: {},
      groupRoles: roleState.groupRoles,
    };
  }

  async archiveGroup(groupId: string): Promise<void> {
    const rooms = await this.getRooms();
    const room = rooms.find(r => r.id === groupId);
    if (room?.isDefaultGroup) {
      throw new Error('Không thể xóa nhóm mặc định');
    }
    const state = await this.fetchRoomState(groupId).catch(() => []);
    const existingMeta = state.find((event) => event.type === 'io.piechat.group.meta');
    const current = (existingMeta?.content || {}) as Partial<PieChatGroupMeta>;
    if (!current.channelId) {
      throw new Error('Nhóm chưa thuộc kênh nào');
    }
    const content: PieChatGroupMeta = {
      kind: 'group',
      channelId: current.channelId,
      isDefaultGroup: Boolean(current.isDefaultGroup),
      archived: true,
      priority: typeof current.priority === 'number' ? current.priority : 100,
      createdBy: String(current.createdBy || this.getCurrentUserId()),
      createdAt: Number(current.createdAt || Date.now()),
    };
    await this.sendStateEvent(groupId, 'io.piechat.group.meta', content);
  }

  async updateGroupPriority(groupId: string, priority: number): Promise<void> {
    const state = await this.fetchRoomState(groupId).catch(() => []);
    const existingMeta = state.find((event) => event.type === 'io.piechat.group.meta');
    const current = (existingMeta?.content || {}) as Partial<PieChatGroupMeta>;
    if (!current.channelId) {
      throw new Error('Nhóm chưa thuộc kênh nào');
    }
    const content: PieChatGroupMeta = {
      kind: 'group',
      channelId: current.channelId,
      isDefaultGroup: Boolean(current.isDefaultGroup),
      archived: Boolean(current.archived),
      priority,
      createdBy: String(current.createdBy || this.getCurrentUserId()),
      createdAt: Number(current.createdAt || Date.now()),
    };
    await this.sendStateEvent(groupId, 'io.piechat.group.meta', content);
  }

  async addMemberByUserId(roomId: string, userId: string): Promise<string> {
    const resolvedUserId = this.normalizeUserIdCandidate(userId);
    if (!resolvedUserId.startsWith('@')) {
      throw new Error('Không tìm thấy tài khoản hợp lệ');
    }
    await this.request<{ event_id: string }>(
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/invite`,
      {
        method: 'POST',
        body: JSON.stringify({ user_id: resolvedUserId }),
      },
    );
    return resolvedUserId;
  }

  async removeMember(roomId: string, userId: string): Promise<void> {
    await this.request<{ event_id: string }>(
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/kick`,
      {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, reason: 'Removed by admin' }),
      },
    );
  }

  async updateChannelRole(roomId: string, userId: string, role: PieChatRole): Promise<void> {
    const state = await this.fetchRoomState(roomId).catch(() => []);
    const roleEvent = state.find((event) => event.type === 'io.piechat.roles');
    const content = (roleEvent?.content || {}) as Partial<PieChatRoleState>;
    const channelRoles = this.normalizeRoleMap(content.channelRoles);
    channelRoles[userId] = role;
    await this.sendStateEvent(roomId, 'io.piechat.roles', {
      channelRoles,
      groupRoles: this.normalizeRoleMap(content.groupRoles),
    });
  }

  async updateGroupRole(roomId: string, userId: string, role: PieChatRole): Promise<void> {
    const state = await this.fetchRoomState(roomId).catch(() => []);
    const roleEvent = state.find((event) => event.type === 'io.piechat.roles');
    const content = (roleEvent?.content || {}) as Partial<PieChatRoleState>;
    const groupRoles = this.normalizeRoleMap(content.groupRoles);
    groupRoles[userId] = role;
    await this.sendStateEvent(roomId, 'io.piechat.roles', {
      channelRoles: this.normalizeRoleMap(content.channelRoles),
      groupRoles,
    });
  }

  async updateRoomRoles(roomId: string, channelRoles?: Record<string, PieChatRole>, groupRoles?: Record<string, PieChatRole>): Promise<void> {
    const state = await this.fetchRoomState(roomId).catch(() => []);
    const roleEvent = state.find((event) => event.type === 'io.piechat.roles');
    const content = (roleEvent?.content || {}) as Partial<PieChatRoleState>;
    await this.sendStateEvent(roomId, 'io.piechat.roles', {
      channelRoles: channelRoles || this.normalizeRoleMap(content.channelRoles),
      groupRoles: groupRoles || this.normalizeRoleMap(content.groupRoles),
    });
  }

  async createDirectChatByUserId(userId: string): Promise<Room> {
    const inviteUserId = this.normalizeUserIdCandidate(userId);
    if (!inviteUserId.startsWith('@')) {
      throw new Error('Tài khoản chưa hợp lệ');
    }
    const profile = await this.fetchProfileUser(inviteUserId);
    const roomName = profile?.displayname || this.userFromId(inviteUserId).username;
    const currentUserId = this.getCurrentUserId();
    const existingRooms = await this.getRooms().catch(() => []);
    const existingDirectRoom = existingRooms.find(
      (room) =>
        room.type === 'dm' &&
        room.members.some((member) => member.id === inviteUserId),
    );
    if (existingDirectRoom) {
      return existingDirectRoom;
    }

    // Aggressive discovery loop removed to prevent misidentifying small groups as DMs
    // Trusting existingDirectRoom check from getRooms/sync logic instead


    try {
      const payload = await this.request<{ room_id: string }>(
        '/_matrix/client/v3/createRoom',
        {
          method: 'POST',
          body: JSON.stringify({
            name: roomName,
            preset: 'trusted_private_chat',
            visibility: 'private',
            is_direct: true,
            invite: [inviteUserId],
          }),
        },
      );

      return {
        id: payload.room_id,
        name: roomName,
        type: 'dm',
        unreadCount: 0,
        members: [
          this.userFromId(currentUserId),
          this.userFromId(inviteUserId)
        ],
        channelRoles: {},
        groupRoles: {},
      };
    } catch (error) {
      throw error;
    }
  }

  async getMessages(roomId: string): Promise<Message[]> {
    try {
      // Fetch with larger limit to handle reaction-heavy rooms
      const response = await this.request<{
        chunk: Array<{
          event_id: string;
          sender: string;
          type: string;
          content: Record<string, unknown>;
          origin_server_ts: number;
          unsigned?: { redacted_because?: unknown };
        }>;
        end?: string;
      }>(`/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=500`);
      let chunk = response.chunk || [];

      // If no real messages in this batch, paginate backwards to find them
      let end = response.end;
      let attempts = 0;
      while (
        chunk.filter(e => e.type === 'm.room.message' || e.type === 'm.call.invite').length === 0
        && end && attempts < 3
      ) {
        const more = await this.request<{
          chunk: Array<{
            event_id: string;
            sender: string;
            type: string;
            content: Record<string, unknown>;
            origin_server_ts: number;
            unsigned?: { redacted_because?: unknown };
          }>;
          end?: string;
        }>(`/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=200&from=${encodeURIComponent(end)}`);
        chunk = [...chunk, ...(more.chunk || [])];
        end = more.end;
        attempts++;
      }

      const reactions = chunk.filter(e => e.type === 'm.reaction');

      // Aggregate poll votes from all vote events
      const pollVotesMap: Record<string, Array<{ optionId: string; userId: string }>> = {};
      chunk.forEach(e => {
        if (e.type === 'm.room.message') {
          const msgtype = e.content?.msgtype as string;
          if (msgtype === 'io.piechat.poll.vote') {
            const voteInfo = e.content?.['io.piechat.poll.vote'] as { pollId?: string; optionIds?: string[] } | undefined;
            if (voteInfo?.pollId && voteInfo?.optionIds) {
              if (!pollVotesMap[voteInfo.pollId]) pollVotesMap[voteInfo.pollId] = [];
              // Remove previous votes from same user, then add new
              pollVotesMap[voteInfo.pollId] = pollVotesMap[voteInfo.pollId].filter(v => v.userId !== e.sender);
              for (const optId of voteInfo.optionIds) {
                pollVotesMap[voteInfo.pollId].push({ optionId: optId, userId: e.sender });
              }
            }
          }
        }
      });
      // Store poll votes for external access
      this._lastPollVotes = pollVotesMap;

      // Group call events by callId
      const callMap: Record<string, { invite?: any, answer?: any, hangup?: any }> = {};
      const rawCallEvents: typeof this._lastCallEvents = [];
      chunk.forEach(e => {
        if (['m.call.invite', 'm.call.answer', 'm.call.hangup', 'm.call.candidates'].includes(e.type)) {
          rawCallEvents.push({
            type: e.type,
            content: e.content,
            sender: e.sender,
            event_id: e.event_id,
            origin_server_ts: e.origin_server_ts,
          });
          const callId = e.content.call_id as string;
          if (callId) {
            if (!callMap[callId]) callMap[callId] = {};
            if (e.type === 'm.call.invite') callMap[callId].invite = e;
            else if (e.type === 'm.call.answer') callMap[callId].answer = e;
            else if (e.type === 'm.call.hangup') callMap[callId].hangup = e;
          }
        }
      });
      this._lastCallEvents = rawCallEvents;

      const messages = chunk
        .filter((event) => {
          // Skip redacted (deleted) events — they have empty content or redacted_because
          if (event.unsigned?.redacted_because) return false;
          if (event.type === 'm.room.message' && (!event.content || Object.keys(event.content).length === 0)) return false;
          if (event.type === 'm.room.message') return true;
          // Only show the invite event for a call, we will enrich its content
          if (event.type === 'm.call.invite') return true;
          return false;
        })
        .map((event) => {
          const msgReactions: Record<string, number> = {};
          const msgReactionDetails: Record<string, string[]> = {};
          reactions.filter(r => (r.content as any)?.['m.relates_to']?.event_id === event.event_id)
            .forEach(r => {
              const key = (r.content as any)?.['m.relates_to']?.key as string;
              if (key) {
                msgReactions[key] = (msgReactions[key] || 0) + 1;
                if (!msgReactionDetails[key]) {
                  msgReactionDetails[key] = [];
                }
                msgReactionDetails[key].push(r.sender);
              }
            });

          let content = String(event.content?.body || '');
          const msgtype = String(event.content?.msgtype || 'm.text');
          let fileUrl: string | undefined;
          let fileName: string | undefined;
          let fileSize: number | undefined;
          let mimeType: string | undefined;
          let duration: number | undefined;
          let thumbnailUrl: string | undefined;

          // Parse media messages
          if (['m.file', 'm.image', 'm.audio', 'm.video'].includes(msgtype)) {
            const url = event.content?.url as string | undefined;
            if (url) {
              // Convert mxc:// URI to HTTP download URL
              fileUrl = url.startsWith('mxc://') 
                ? `${this.baseUrl}/_matrix/media/v3/download/${url.slice(6)}`
                : url;
            }
            fileName = (event.content?.filename as string) || (event.content?.body as string) || 'file';
            const info = event.content?.info as Record<string, unknown> | undefined;
            if (info) {
              fileSize = info.size as number | undefined;
              mimeType = info.mimetype as string | undefined;
              duration = info.duration as number | undefined;
              const thumbUrl = info.thumbnail_url as string | undefined;
              if (thumbUrl) {
                thumbnailUrl = thumbUrl.startsWith('mxc://')
                  ? `${this.baseUrl}/_matrix/media/v3/download/${thumbUrl.slice(6)}`
                  : thumbUrl;
              }
            }
            // Friendly content for display in room list
            if (msgtype === 'm.image') content = `📷 ${fileName || 'Hình ảnh'}`;
            else if (msgtype === 'm.audio') content = `🎤 Tin nhắn thoại`;
            else if (msgtype === 'm.video') content = `🎬 ${fileName || 'Video'}`;
            else content = `📎 ${fileName || 'File'}`;
          }

          // Parse contact card messages
          if (msgtype === 'io.piechat.contact') {
            const contactInfo = event.content?.['io.piechat.contact'] as Record<string, string> | undefined;
            if (contactInfo) {
              content = contactInfo.phone || content;
              fileName = contactInfo.displayName;
              fileUrl = contactInfo.userId;
            }
            content = content || String(event.content?.body || '');
          }

          // Parse sticker messages
          if (msgtype === 'io.piechat.sticker') {
            const stickerInfo = event.content?.['io.piechat.sticker'] as Record<string, string> | undefined;
            if (stickerInfo) {
              fileUrl = stickerInfo.url;
              fileName = stickerInfo.stickerId;
            }
            content = content || 'Sticker';
          }

          // Parse folder messages
          if (msgtype === 'io.piechat.folder') {
            const folderInfo = event.content?.['io.piechat.folder'] as Record<string, unknown> | undefined;
            if (folderInfo) {
              fileName = String(folderInfo.folderName || 'Thư mục');
              duration = Number(folderInfo.fileCount || 0); // reuse duration for file count
              fileSize = Number(folderInfo.totalSize || 0);
            }
            // Extract download URL from the message url field
            const folderUrl = event.content?.url as string | undefined;
            if (folderUrl) {
              fileUrl = folderUrl.startsWith('mxc://')
                ? `${this.baseUrl}/_matrix/media/v3/download/${folderUrl.slice(6)}`
                : folderUrl;
            }
            content = content || `📁 ${fileName}`;
          }

          // Skip vote messages from display (they are aggregated into poll)
          if (msgtype === 'io.piechat.poll.vote') {
            return null;
          }

          // Parse poll messages — store full poll data as JSON in content, inject aggregated votes
          if (msgtype === 'io.piechat.poll') {
            const pollInfo = event.content?.['io.piechat.poll'] as Record<string, unknown> | undefined;
            if (pollInfo) {
              const pollId = pollInfo.pollId as string;
              const aggregatedVotes = pollVotesMap[pollId] || [];
              content = JSON.stringify({ ...pollInfo, votes: aggregatedVotes });
            }
          }

          // Parse reminder messages
          if (msgtype === 'io.piechat.reminder') {
            const reminderInfo = event.content?.['io.piechat.reminder'] as Record<string, unknown> | undefined;
            if (reminderInfo) {
              content = JSON.stringify(reminderInfo);
            }
          }

          if (event.type === 'm.call.invite') {
            const callId = event.content.call_id as string;
            const info = callMap[callId];
            const isVideo = (event.content.offer as any)?.sdp?.includes('m=video');
            const callType = isVideo ? 'video' as const : 'voice' as const;
            const typeLabel = isVideo ? 'Video' : 'Thoại';

            let callStatus: 'answered' | 'missed' | 'ongoing' | 'calling' = 'calling';
            let durationStr: string | undefined;

            if (info?.hangup) {
              if (info.answer) {
                callStatus = 'answered';
                const durationMs = info.hangup.origin_server_ts - info.answer.origin_server_ts;
                const seconds = Math.floor(durationMs / 1000);
                const mm = Math.floor(seconds / 60).toString().padStart(2, '0');
                const ss = (seconds % 60).toString().padStart(2, '0');
                durationStr = `${mm}:${ss}`;
                content = `Cuộc gọi ${typeLabel.toLowerCase()} - ${mm}:${ss}`;
              } else {
                callStatus = 'missed';
                content = `Cuộc gọi nhỡ (${typeLabel.toLowerCase()})`;
              }
            } else if (info?.answer) {
              callStatus = 'ongoing';
              content = `Cuộc gọi ${typeLabel.toLowerCase()} - Đang diễn ra`;
            } else {
              callStatus = 'calling';
              content = `Cuộc gọi ${typeLabel.toLowerCase()} - Đang gọi...`;
            }

            // Store call info for rendering custom icons
            (event as any)._callInfo = { type: callType, status: callStatus, duration: durationStr };
          }

          // Parse reply-to
          const relatesTo = event.content?.['m.relates_to'] as any;
          let replyTo: Message['replyTo'] = undefined;
          if (relatesTo?.['m.in_reply_to']?.event_id) {
            const replyEventId = relatesTo['m.in_reply_to'].event_id;
            const replyEvent = chunk.find((e: any) => e.event_id === replyEventId);
            replyTo = {
              eventId: replyEventId,
              senderId: replyEvent?.sender || '',
              body: (replyEvent?.content?.body as string) || '',
            };
            // Strip Matrix reply fallback from content
            if (content.startsWith('> ')) {
              const lines = content.split('\n');
              const bodyStart = lines.findIndex((l: string) => !l.startsWith('> ') && l !== '');
              if (bodyStart > 0) {
                content = lines.slice(bodyStart).join('\n').trim();
              }
            }
          }

          // Check if this message was edited (has m.replace relation targeting it)
          const editEvent = chunk.find((e: any) =>
            e.content?.['m.relates_to']?.rel_type === 'm.replace' &&
            e.content?.['m.relates_to']?.event_id === event.event_id
          );
          let edited = false;
          if (editEvent) {
            const newContent = editEvent.content?.['m.new_content'] as any;
            if (newContent?.body) {
              content = newContent.body as string;
              edited = true;
            }
          }

          // Skip m.replace events from showing as separate messages
          if (relatesTo?.rel_type === 'm.replace') return null;

          return {
            id: event.event_id,
            roomId,
            senderId: event.sender,
            content,
            timestamp: event.origin_server_ts,
            status: 'read' as const,
            reactions: Object.keys(msgReactions).length > 0 ? msgReactions : undefined,
            reactionDetails: Object.keys(msgReactionDetails).length > 0 ? msgReactionDetails : undefined,
            msgtype,
            fileUrl,
            fileName,
            fileSize,
            mimeType,
            duration,
            thumbnailUrl,
            replyTo,
            edited,
            inlineButtons: (event.content?.['io.piechat.buttons'] as Message['inlineButtons']) || undefined,
            callInfo: (event as any)._callInfo || undefined,
          };
        })
        .filter(Boolean)
        .reverse() as unknown as Message[];

      if (messages.length > 0) {
        this.lastMessageCache.set(roomId, messages[messages.length - 1]);
      }
      return messages;
    } catch (error) {
      throw error;
    }
  }

  /** Returns poll votes aggregated during the last getMessages() call */
  private _lastPollVotes: Record<string, Array<{ optionId: string; userId: string }>> = {};
  getLastPollVotes(): Record<string, Array<{ optionId: string; userId: string }>> {
    return this._lastPollVotes;
  }

  /** Returns raw call events from the last getMessages() call */
  private _lastCallEvents: Array<{ type: string; content: any; sender: string; event_id: string; origin_server_ts: number }> = [];
  getLastCallEvents() {
    return this._lastCallEvents;
  }

  async sendReaction(roomId: string, eventId: string, key: string): Promise<void> {
    const txnId = `react-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const payload = {
      body: key,
      'm.relates_to': {
        rel_type: 'm.annotation',
        event_id: eventId,
        key: key,
      },
    };
    console.log('[MatrixService] Sending reaction:', { roomId, eventId, key, payload });
    await this.request(
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.reaction/${txnId}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
    );
  }

  async sendMessage(roomId: string, content: string): Promise<Message> {
    const txnId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const response = await this.request<{ event_id: string }>(
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          msgtype: 'm.text',
          body: content,
        }),
      },
    );
    const userId = typeof window !== 'undefined' ? localStorage.getItem('matrix_user_id') || 'unknown' : 'unknown';
    const msg: Message = {
      id: response.event_id,
      roomId,
      senderId: userId,
      content,
      timestamp: Date.now(),
      status: 'sent',
    };
    this.lastMessageCache.set(roomId, msg);
    return msg;
  }

  async uploadMedia(file: File | Blob, fileName: string): Promise<string> {
    if (!this.accessToken) {
      this.accessToken = this.getPersistedAccessToken();
    }
    const headers = new Headers();
    headers.set('Authorization', `Bearer ${this.accessToken}`);
    headers.set('Content-Type', file.type || 'application/octet-stream');

    const response = await fetch(
      `${this.baseUrl}/_matrix/media/v3/upload?filename=${encodeURIComponent(fileName)}`,
      {
        method: 'POST',
        headers,
        body: file,
      },
    );
    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`);
    }
    const data = await response.json() as { content_uri: string };
    return data.content_uri; // mxc:// URI
  }

  /** Upload with progress callback (0-100) */
  uploadMediaWithProgress(
    file: File | Blob,
    fileName: string,
    onProgress: (percent: number) => void,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.accessToken) {
        this.accessToken = this.getPersistedAccessToken();
      }
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${this.baseUrl}/_matrix/media/v3/upload?filename=${encodeURIComponent(fileName)}`);
      xhr.setRequestHeader('Authorization', `Bearer ${this.accessToken}`);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const data = JSON.parse(xhr.responseText) as { content_uri: string };
          onProgress(100);
          resolve(data.content_uri);
        } else {
          reject(new Error(`Upload failed: ${xhr.status}`));
        }
      };
      xhr.onerror = () => reject(new Error('Upload network error'));
      xhr.send(file);
    });
  }

  async sendFileMessage(roomId: string, file: File, thumbnailBlob?: Blob): Promise<Message> {
    const mxcUri = await this.uploadMedia(file, file.name);
    let thumbnailUri: string | undefined;
    if (thumbnailBlob) {
      thumbnailUri = await this.uploadMedia(thumbnailBlob, 'thumbnail.jpg');
    }

    // Determine msgtype
    let msgtype = 'm.file';
    if (file.type.startsWith('image/')) msgtype = 'm.image';
    else if (file.type.startsWith('video/')) msgtype = 'm.video';
    else if (file.type.startsWith('audio/')) msgtype = 'm.audio';

    const txnId = `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const info: Record<string, unknown> = {
      mimetype: file.type,
      size: file.size,
    };
    if (thumbnailUri) {
      info.thumbnail_url = thumbnailUri;
    }
    const body: Record<string, unknown> = {
      msgtype,
      body: file.name,
      filename: file.name,
      url: mxcUri,
      info,
    };

    const response = await this.request<{ event_id: string }>(
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
      {
        method: 'PUT',
        body: JSON.stringify(body),
      },
    );
    const userId = typeof window !== 'undefined' ? localStorage.getItem('matrix_user_id') || 'unknown' : 'unknown';
    const msg: Message = {
      id: response.event_id,
      roomId,
      senderId: userId,
      content: `📎 ${file.name}`,
      timestamp: Date.now(),
      status: 'sent',
      msgtype,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      fileUrl: mxcUri.startsWith('mxc://') 
        ? `${this.baseUrl}/_matrix/media/v3/download/${mxcUri.slice(6)}`
        : mxcUri,
    };
    this.lastMessageCache.set(roomId, msg);
    return msg;
  }

  async sendFolderMessage(roomId: string, zipBlob: Blob, folderName: string, fileCount: number, totalSize: number, onProgress?: (percent: number) => void): Promise<Message> {
    const fileName = `${folderName}.zip`;
    const mxcUri = onProgress
      ? await this.uploadMediaWithProgress(zipBlob, fileName, onProgress)
      : await this.uploadMedia(zipBlob, fileName);

    const txnId = `folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const body = {
      msgtype: 'io.piechat.folder',
      body: `📁 ${folderName}`,
      url: mxcUri,
      filename: fileName,
      info: {
        mimetype: 'application/zip',
        size: zipBlob.size,
      },
      'io.piechat.folder': {
        folderName,
        fileCount,
        totalSize,
      },
    };

    const response = await this.request<{ event_id: string }>(
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
      {
        method: 'PUT',
        body: JSON.stringify(body),
      },
    );
    const userId = typeof window !== 'undefined' ? localStorage.getItem('matrix_user_id') || 'unknown' : 'unknown';
    const downloadUrl = mxcUri.startsWith('mxc://') 
      ? `${this.baseUrl}/_matrix/media/v3/download/${mxcUri.slice(6)}`
      : mxcUri;
    const msg: Message = {
      id: response.event_id,
      roomId,
      senderId: userId,
      content: `📁 ${folderName}`,
      timestamp: Date.now(),
      status: 'sent',
      msgtype: 'io.piechat.folder',
      fileName: folderName,
      fileSize: totalSize,
      fileUrl: downloadUrl,
      duration: fileCount, // reuse for file count
    };
    this.lastMessageCache.set(roomId, msg);
    return msg;
  }

  async sendVoiceMessage(roomId: string, audioBlob: Blob, durationMs: number): Promise<Message> {
    const fileName = `voice-${Date.now()}.webm`;
    const mxcUri = await this.uploadMedia(audioBlob, fileName);

    const txnId = `voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const body = {
      msgtype: 'm.audio',
      body: 'Tin nhắn thoại',
      url: mxcUri,
      info: {
        mimetype: audioBlob.type || 'audio/webm',
        size: audioBlob.size,
        duration: durationMs,
      },
      'org.matrix.msc1767.audio': {
        duration: durationMs,
      },
      'org.matrix.msc3245.voice': {},
    };

    const response = await this.request<{ event_id: string }>(
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
      {
        method: 'PUT',
        body: JSON.stringify(body),
      },
    );
    const userId = typeof window !== 'undefined' ? localStorage.getItem('matrix_user_id') || 'unknown' : 'unknown';
    const msg: Message = {
      id: response.event_id,
      roomId,
      senderId: userId,
      content: '🎤 Tin nhắn thoại',
      timestamp: Date.now(),
      status: 'sent',
      msgtype: 'm.audio',
      fileName,
      fileSize: audioBlob.size,
      mimeType: audioBlob.type || 'audio/webm',
      duration: durationMs,
      fileUrl: mxcUri.startsWith('mxc://') 
        ? `${this.baseUrl}/_matrix/media/v3/download/${mxcUri.slice(6)}`
        : mxcUri,
    };
    this.lastMessageCache.set(roomId, msg);
    return msg;
  }

  async sendContactMessage(roomId: string, phone: string, displayName: string, userId?: string): Promise<Message> {
    const txnId = `contact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const body = {
      msgtype: 'io.piechat.contact',
      body: phone,
      'io.piechat.contact': {
        phone,
        displayName,
        userId: userId || '',
      },
    };

    const response = await this.request<{ event_id: string }>(
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
      {
        method: 'PUT',
        body: JSON.stringify(body),
      },
    );
    const currentUserId = typeof window !== 'undefined' ? localStorage.getItem('matrix_user_id') || 'unknown' : 'unknown';
    const msg: Message = {
      id: response.event_id,
      roomId,
      senderId: currentUserId,
      content: phone,
      timestamp: Date.now(),
      status: 'sent',
      msgtype: 'io.piechat.contact',
      fileName: displayName, // reuse for displayName
      fileUrl: userId, // reuse for userId
    };
    this.lastMessageCache.set(roomId, msg);
    return msg;
  }

  async sendStickerMessage(roomId: string, packId: string, stickerId: string, stickerUrl: string): Promise<Message> {
    const txnId = `sticker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const body = {
      msgtype: 'io.piechat.sticker',
      body: `sticker:${packId}:${stickerId}`,
      'io.piechat.sticker': {
        packId,
        stickerId,
        url: stickerUrl,
      },
    };

    const response = await this.request<{ event_id: string }>(
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
      {
        method: 'PUT',
        body: JSON.stringify(body),
      },
    );
    const currentUserId = typeof window !== 'undefined' ? localStorage.getItem('matrix_user_id') || 'unknown' : 'unknown';
    const msg: Message = {
      id: response.event_id,
      roomId,
      senderId: currentUserId,
      content: `sticker:${packId}:${stickerId}`,
      timestamp: Date.now(),
      status: 'sent',
      msgtype: 'io.piechat.sticker',
      fileUrl: stickerUrl,
      fileName: stickerId,
    };
    this.lastMessageCache.set(roomId, msg);
    return msg;
  }

  async sendPollMessage(roomId: string, pollData: {
    question: string;
    options: { id: string; text: string }[];
    allowMultiple: boolean;
    anonymous: boolean;
    deadline: number | null;
  }): Promise<Message> {
    const pollId = `poll-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const txnId = `poll-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const userId = typeof window !== 'undefined' ? localStorage.getItem('matrix_user_id') || 'unknown' : 'unknown';

    const body = {
      msgtype: 'io.piechat.poll',
      body: `📊 ${pollData.question}`,
      'io.piechat.poll': {
        pollId,
        question: pollData.question,
        options: pollData.options,
        allowMultiple: pollData.allowMultiple,
        anonymous: pollData.anonymous,
        deadline: pollData.deadline,
        creatorId: userId,
      },
    };

    const response = await this.request<{ event_id: string }>(
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
      {
        method: 'PUT',
        body: JSON.stringify(body),
      },
    );

    const msg: Message = {
      id: response.event_id,
      roomId,
      senderId: userId,
      content: `📊 ${pollData.question}`,
      timestamp: Date.now(),
      status: 'sent',
      msgtype: 'io.piechat.poll',
    };
    this.lastMessageCache.set(roomId, msg);
    return msg;
  }

  async votePoll(roomId: string, pollEventId: string, pollId: string, optionIds: string[]): Promise<void> {
    const txnId = `vote-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const body = {
      msgtype: 'io.piechat.poll.vote',
      body: 'vote',
      'm.relates_to': {
        rel_type: 'm.reference',
        event_id: pollEventId,
      },
      'io.piechat.poll.vote': {
        pollId,
        optionIds,
      },
    };

    await this.request(
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
      {
        method: 'PUT',
        body: JSON.stringify(body),
      },
    );
  }

  async sendReminderMessage(roomId: string, reminderData: {
    title: string;
    deadline: number;
  }): Promise<Message> {
    const reminderId = `rem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const txnId = `rem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const userId = typeof window !== 'undefined' ? localStorage.getItem('matrix_user_id') || 'unknown' : 'unknown';

    const body = {
      msgtype: 'io.piechat.reminder',
      body: `⏰ ${reminderData.title}`,
      'io.piechat.reminder': {
        reminderId,
        title: reminderData.title,
        deadline: reminderData.deadline,
        creatorId: userId,
      },
    };

    const response = await this.request<{ event_id: string }>(
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
      {
        method: 'PUT',
        body: JSON.stringify(body),
      },
    );

    const msg: Message = {
      id: response.event_id,
      roomId,
      senderId: userId,
      content: JSON.stringify({ reminderId, ...reminderData, creatorId: userId }),
      timestamp: Date.now(),
      status: 'sent',
      msgtype: 'io.piechat.reminder',
    };
    this.lastMessageCache.set(roomId, msg);
    return msg;
  }

  async markRoomAsRead(roomId: string, lastEventId?: string) {
    if (!lastEventId) {
      const msgs = await this.getMessages(roomId).catch(() => []);
      if (msgs.length > 0) {
        lastEventId = msgs[msgs.length - 1].id;
      }
    }
    if (!lastEventId) {
      return;
    }
    try {
      await this.request(
        `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/receipt/m.read/${encodeURIComponent(lastEventId)}`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        },
      );
    } catch {
      // Ignore
    }
  }

  async searchMessages(query: string): Promise<Message[]> {
    const payload = {
      search_categories: {
        room_events: {
          search_term: query,
          keys: ['content.body'],
          filter: {
            limit: 50,
          },
        },
      },
    };

    try {
      const response = await this.request<{
        search_categories: {
          room_events: {
            results: Array<{
              rank: number;
              result: {
                content: { body: string };
                event_id: string;
                origin_server_ts: number;
                room_id: string;
                sender: string;
              };
            }>;
          };
        };
      }>('/_matrix/client/v3/search', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const results = response.search_categories.room_events.results || [];
      return results.map((item) => ({
        id: item.result.event_id,
        roomId: item.result.room_id,
        senderId: item.result.sender,
        content: item.result.content.body,
        timestamp: item.result.origin_server_ts,
        status: 'sent',
      }));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('M_NOT_FOUND')) {
        return [];
      }
      console.error('Search request failed:', error);
      return [];
    }
  }

  async inviteUserToRoom(roomId: string, userId: string): Promise<void> {
    await this.request(
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/invite`,
      {
        method: 'POST',
        body: JSON.stringify({ user_id: userId }),
      },
    );
  }

  async joinRoom(roomId: string): Promise<void> {
    await this.request(
      `/_matrix/client/v3/join/${encodeURIComponent(roomId)}`,
      { method: 'POST' }
    );
  }

  async toggleRestrictSpeaking(roomId: string, restricted: boolean): Promise<void> {
    const state = await this.fetchRoomState(roomId).catch(() => []);
    const groupMeta = state.find((e) => e.type === 'io.piechat.group.meta');
    const channelMeta = state.find((e) => e.type === 'io.piechat.channel.meta');

    if (groupMeta) {
      const content = { ...(groupMeta.content as unknown as PieChatGroupMeta), restrictSpeaking: restricted };
      await this.sendStateEvent(roomId, 'io.piechat.group.meta', content);
    } else if (channelMeta) {
      const content = { ...(channelMeta.content as unknown as PieChatChannelMeta), restrictSpeaking: restricted };
      await this.sendStateEvent(roomId, 'io.piechat.channel.meta', content);
    }
  }
  async sendFriendRequest(userId: string): Promise<string> {
    const room = await this.createDirectChatByUserId(userId);
    await this.sendStateEvent(room.id, 'io.piechat.friendship', {
      status: 'pending',
      requester: this.getCurrentUserId()
    });
    return room.id;
  }

  async acceptFriendRequest(roomId: string): Promise<void> {
    await this.sendStateEvent(roomId, 'io.piechat.friendship', {
      status: 'accepted',
      requester: '' // Not needed anymore
    });

    // Also mark as direct in account data to be sure
    const rooms = await this.getRooms();
    const room = rooms.find(r => r.id === roomId);
    if (room && room.type === 'dm') {
      const otherMember = room.members.find(m => m.id !== this.getCurrentUserId());
      if (otherMember) {
        await this.markAsDirect(roomId, otherMember.id);
      }
    }
  }

  async unfriend(roomId: string): Promise<void> {
    // Set friendship status to 'none' so the other user also sees the change
    await this.sendStateEvent(roomId, 'io.piechat.friendship', {
      status: 'none',
      requester: '',
    });
    // Leave the room
    await this.leaveRoom(roomId);
  }

  private async markAsDirect(roomId: string, userId: string) {
    const accountData = await this.request<any>('/_matrix/client/v3/user/' + encodeURIComponent(this.getCurrentUserId()!) + '/account_data/m.direct').catch(() => ({}));
    const direct = accountData || {};
    if (!direct[userId]) direct[userId] = [];
    if (!direct[userId].includes(roomId)) {
      direct[userId].push(roomId);
      await this.request('/_matrix/client/v3/user/' + encodeURIComponent(this.getCurrentUserId()!) + '/account_data/m.direct', {
        method: 'PUT',
        body: JSON.stringify(direct)
      });
    }
  }

  // Signaling for Voice/Video Calls (Matrix VOIP standards)
  async sendCallEvent(roomId: string, callId: string, type: string, content: any) {
    const txnId = `call-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await this.request(
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/${encodeURIComponent(type)}/${txnId}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          call_id: callId,
          version: '1',
          ...content,
        }),
      },
    );
  }

  async convertDmToGroupChannel(dmRoomId: string, channelId: string): Promise<string> {
    const rooms = await this.getRooms();
    const dmRoom = rooms.find(r => r.id === dmRoomId);
    if (!dmRoom) throw new Error('Không tìm thấy hội thoại');
    if (dmRoom.type !== 'dm') throw new Error('Hội thoại không phải là cá nhân');

    const channelRoom = rooms.find(r => r.id === channelId);
    if (!channelRoom) throw new Error('Không tìm thấy kênh');

    const currentUserId = this.getCurrentUserId();
    const otherMember = dmRoom.members.find(m => m.id !== currentUserId);
    if (!otherMember) throw new Error('Không tìm thấy đối tác trong hội thoại');

    const currentUser = this.userFromId(currentUserId!);
    const otherName = otherMember.displayName || otherMember.username;
    const currentName = currentUser.displayName || currentUser.username;
    const groupName = `${otherName} - ${currentName}`;

    // Collect members to invite to the new group only (guest visitors — not full channel members)
    const inviteUserIds = new Set<string>();
    inviteUserIds.add(otherMember.id);

    // Also invite channel leaders/deputies to the new group
    const roles = channelRoom.channelRoles || {};
    Object.entries(roles).forEach(([uid, role]) => {
      if (uid !== currentUserId && (role === 'leader' || role === 'deputy')) {
        inviteUserIds.add(uid);
      }
    });

    // Create the new group (only invites to this specific group, not the channel or "Chung")
    const newGroup = await this.createGroup(channelId, groupName, Array.from(inviteUserIds));
    return newGroup.id;
  }

  async getRoomMembers(roomId: string): Promise<User[]> {
    const response = await this.request<JoinedMembersResponse>(
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/joined_members`,
    ).catch(() => null);
    if (!response?.joined) return [];
    return Object.entries(response.joined).map(([userId, details]) =>
      this.userFromId(userId, this.presenceCache.get(userId), details.display_name)
    );
  }

  async markRoomAsAssistant(roomId: string): Promise<void> {
    await this.sendStateEvent(roomId, 'io.piechat.assistant.meta', {
      isAssistant: true,
      markedAt: Date.now(),
    });
  }

  // ─── Reply to message ────────────────────────────────
  async sendReply(roomId: string, replyToEventId: string, body: string): Promise<string> {
    const txnId = `reply-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const res = await this.request<{ event_id: string }>(
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          msgtype: 'm.text',
          body,
          'm.relates_to': {
            'm.in_reply_to': {
              event_id: replyToEventId,
            },
          },
        }),
      },
    );
    return res.event_id;
  }

  // ─── Edit message ────────────────────────────────────
  async editMessage(roomId: string, originalEventId: string, newBody: string): Promise<string> {
    const txnId = `edit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const res = await this.request<{ event_id: string }>(
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          msgtype: 'm.text',
          body: `* ${newBody}`,
          'm.new_content': {
            msgtype: 'm.text',
            body: newBody,
          },
          'm.relates_to': {
            rel_type: 'm.replace',
            event_id: originalEventId,
          },
        }),
      },
    );
    return res.event_id;
  }

  // ─── Delete (redact) message ─────────────────────────
  async deleteMessage(roomId: string, eventId: string, reason?: string): Promise<void> {
    const txnId = `redact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await this.request(
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/redact/${encodeURIComponent(eventId)}/${txnId}`,
      {
        method: 'PUT',
        body: JSON.stringify({ reason: reason || 'deleted by user' }),
      },
    );
  }

  // ─── Read Receipts ──────────────────────────────────
  async sendReadReceipt(roomId: string, eventId: string): Promise<void> {
    try {
      await this.request(
        `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/receipt/m.read/${encodeURIComponent(eventId)}`,
        { method: 'POST', body: '{}' },
      );
    } catch { /* silently fail */ }
  }

  async sendReadMarker(roomId: string, eventId: string): Promise<void> {
    try {
      await this.request(
        `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/read_markers`,
        {
          method: 'POST',
          body: JSON.stringify({
            'm.fully_read': eventId,
            'm.read': eventId,
          }),
        },
      );
    } catch { /* silently fail */ }
  }

  // ─── Typing indicator ───────────────────────────────
  async sendTyping(roomId: string, typing: boolean, timeoutMs = 5000): Promise<void> {
    const userId = this.getCurrentUserId();
    if (!userId) return;
    await this.request(
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/typing/${encodeURIComponent(userId)}`,
      {
        method: 'PUT',
        body: JSON.stringify({ typing, timeout: timeoutMs }),
      },
    ).catch(() => {}); // silently fail
  }

  // ─── Get typing users ───────────────────────────────
  private _typingUsers: Record<string, string[]> = {};
  getTypingUsers(roomId: string): string[] {
    return this._typingUsers[roomId] || [];
  }
  setTypingUsers(roomId: string, userIds: string[]) {
    this._typingUsers[roomId] = userIds;
  }

  // ─── Presence / Online status ────────────────────────
  async setPresence(status: 'online' | 'offline' | 'unavailable', statusMsg?: string): Promise<void> {
    const userId = this.getCurrentUserId();
    if (!userId) return;
    await this.request(
      `/_matrix/client/v3/presence/${encodeURIComponent(userId)}/status`,
      {
        method: 'PUT',
        body: JSON.stringify({
          presence: status,
          status_msg: statusMsg || '',
        }),
      },
    ).catch(() => {});
  }

  async getPresence(userId: string): Promise<{ presence: string; last_active_ago?: number; currently_active?: boolean }> {
    try {
      return await this.request<{ presence: string; last_active_ago?: number; currently_active?: boolean }>(
        `/_matrix/client/v3/presence/${encodeURIComponent(userId)}/status`,
      );
    } catch {
      return { presence: 'offline' };
    }
  }

  // ─── Profile editing ─────────────────────────────────
  async setDisplayName(displayName: string): Promise<void> {
    const userId = this.getCurrentUserId();
    if (!userId) return;
    await this.request(
      `/_matrix/client/v3/profile/${encodeURIComponent(userId)}/displayname`,
      {
        method: 'PUT',
        body: JSON.stringify({ displayname: displayName }),
      },
    );
  }

  async setAvatarUrl(avatarMxcUrl: string): Promise<void> {
    const userId = this.getCurrentUserId();
    if (!userId) return;
    await this.request(
      `/_matrix/client/v3/profile/${encodeURIComponent(userId)}/avatar_url`,
      {
        method: 'PUT',
        body: JSON.stringify({ avatar_url: avatarMxcUrl }),
      },
    );
  }

  async uploadAvatar(file: File): Promise<string> {
    const mxcUrl = await this.uploadMedia(file, file.name);
    await this.setAvatarUrl(mxcUrl);
    return mxcUrl.startsWith('mxc://')
      ? `${this.baseUrl}/_matrix/media/v3/download/${mxcUrl.slice(6)}`
      : mxcUrl;
  }

  // ─── Inline Buttons (for Bot/AI assistant) ───────────
  async sendMessageWithButtons(
    roomId: string,
    body: string,
    buttons: Array<{ id: string; label: string; action?: string; url?: string; style?: 'primary' | 'secondary' | 'danger' }>,
  ): Promise<Message> {
    const txnId = `btn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const eventRes = await this.request<{ event_id: string }>(
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          msgtype: 'm.text',
          body,
          'io.piechat.buttons': buttons,
        }),
      },
    );

    const msg: Message = {
      id: eventRes.event_id,
      roomId,
      senderId: this.getCurrentUserId() || '',
      content: body,
      timestamp: Date.now(),
      status: 'sent',
      inlineButtons: buttons,
    };
    return msg;
  }

  async sendButtonClick(roomId: string, messageId: string, buttonId: string, label: string): Promise<void> {
    const txnId = `btnclk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await this.request(
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/io.piechat.button_click/${txnId}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          message_id: messageId,
          button_id: buttonId,
          label,
        }),
      },
    );
  }
}

export const matrixService = MatrixService.getInstance();

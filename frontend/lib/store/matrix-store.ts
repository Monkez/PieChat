import { create } from 'zustand';
import { matrixService, User, Room, OtpChallenge, OtpRequiredError, AuthApiError, PieChatRole } from '../services/matrix-service';

interface MatrixState {
  currentUser: User | null;
  rooms: Room[];
  currentRoom: Room | null;
  isLoading: boolean;
  error: string | null;
  otpRequired: boolean;
  otpMaskedPhone: string | null;
  otpDevCode: string | null;
  pendingChallenge: OtpChallenge | null;
  retryAfterSeconds: number;

  login: (phone: string, password: string) => Promise<boolean>;
  verifyOtp: (otpCode: string) => Promise<boolean>;
  cancelOtp: () => void;
  resendOtp: () => Promise<boolean>;
  decreaseRetryAfter: () => void;
  restoreSession: () => Promise<void>;
  restoreSessionFromQr: (accessToken: string, userId: string) => Promise<void>;
  logout: () => void;
  fetchRooms: () => Promise<void>;
  createChannel: (name: string, topic: string, isPublic: boolean, memberUserIds: string[]) => Promise<string | null>;
  createGroup: (channelId: string | null, name: string, memberUserIds: string[]) => Promise<string | null>;
  archiveGroup: (groupId: string) => Promise<boolean>;
  deleteRoom: (roomId: string) => Promise<boolean>;
  addMemberByUserId: (roomId: string, userId: string) => Promise<string | null>;
  removeMember: (roomId: string, userId: string) => Promise<boolean>;
  updateChannelRole: (roomId: string, userId: string, role: PieChatRole) => Promise<boolean>;
  updateGroupRole: (roomId: string, userId: string, role: PieChatRole) => Promise<boolean>;
  updateRoomRoles: (roomId: string, channelRoles?: Record<string, PieChatRole>, groupRoles?: Record<string, PieChatRole>) => Promise<boolean>;
  updateGroupPriority: (groupId: string, priority: number) => Promise<boolean>;
  createDirectChatByUserId: (userId: string) => Promise<string | null>;
  moveRoomToChannel: (roomId: string, channelId: string) => Promise<boolean>;
  selectRoom: (roomId: string) => void;
  sendMessage: (roomId: string, content: string) => Promise<void>;
  sendReaction: (roomId: string, eventId: string, emoji: string) => Promise<void>;
  toggleRestrictSpeaking: (roomId: string, restricted: boolean) => Promise<boolean>;
  joinRoom: (roomId: string) => Promise<boolean>;
  sendFriendRequest: (userId: string) => Promise<boolean>;
  acceptFriendRequest: (roomId: string) => Promise<boolean>;
  declineFriendRequest: (roomId: string) => Promise<boolean>;
  unfriend: (roomId: string) => Promise<boolean>;
  fetchCurrentUser: () => Promise<void>;
}

export const useMatrixStore = create<MatrixState>((set, get) => ({
  currentUser: null,
  rooms: [],
  currentRoom: null,
  isLoading: false,
  error: null,
  otpRequired: false,
  otpMaskedPhone: null,
  otpDevCode: null,
  pendingChallenge: null,
  retryAfterSeconds: 0,

  login: async (phone: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const user = await matrixService.login(phone, password);
      set({
        currentUser: user,
        isLoading: false,
        otpRequired: false,
        otpMaskedPhone: null,
        otpDevCode: null,
        pendingChallenge: null,
        retryAfterSeconds: 0,
      });
      if (typeof window !== 'undefined') {
        localStorage.setItem('piechat_login_phone', phone);
      }
      return true;
    } catch (error) {
      if (error instanceof OtpRequiredError) {
        set({
          isLoading: false,
          otpRequired: true,
          otpMaskedPhone: error.challenge.maskedPhone,
          otpDevCode: error.challenge.devOtp || null,
          pendingChallenge: error.challenge,
          retryAfterSeconds: 0,
          error: null,
        });
        return false;
      }
      if (error instanceof AuthApiError) {
        set({
          error: error.message,
          retryAfterSeconds: error.retryAfterSeconds || 0,
          isLoading: false,
        });
        return false;
      }
      console.error('[PieChat Login] Unexpected error:', error);
      set({ error: 'Đăng nhập thất bại. Kiểm tra số điện thoại hoặc mật khẩu.', retryAfterSeconds: 0, isLoading: false });
      return false;
    }
  },

  verifyOtp: async (otpCode: string) => {
    const challenge = get().pendingChallenge;
    if (!challenge) {
      set({ error: 'Phiên OTP không tồn tại, vui lòng đăng nhập lại.' });
      return false;
    }
    set({ isLoading: true, error: null });
    try {
      const user = await matrixService.verifyOtpAndLogin(challenge, otpCode);
      set({
        currentUser: user,
        isLoading: false,
        otpRequired: false,
        otpMaskedPhone: null,
        otpDevCode: null,
        pendingChallenge: null,
        retryAfterSeconds: 0,
      });
      if (typeof window !== 'undefined') {
        localStorage.setItem('piechat_login_phone', challenge.phone);
      }
      return true;
    } catch (error) {
      if (error instanceof Error) {
        const retryAfterSeconds = error instanceof AuthApiError ? error.retryAfterSeconds || 0 : 0;
        set({ error: error.message, retryAfterSeconds, isLoading: false });
      } else {
        set({ error: 'Xác thực OTP thất bại', retryAfterSeconds: 0, isLoading: false });
      }
      return false;
    }
  },

  cancelOtp: () => {
    set({
      otpRequired: false,
      otpMaskedPhone: null,
      otpDevCode: null,
      pendingChallenge: null,
      retryAfterSeconds: 0,
      error: null,
    });
  },

  resendOtp: async () => {
    const challenge = get().pendingChallenge;
    if (!challenge) {
      set({ error: 'Không có phiên OTP để gửi lại.', retryAfterSeconds: 0 });
      return false;
    }
    if (get().retryAfterSeconds > 0) {
      return false;
    }
    const resent = await get().login(challenge.phone, challenge.password);
    return !resent;
  },

  decreaseRetryAfter: () => {
    const current = get().retryAfterSeconds;
    if (current > 0) {
      set({ retryAfterSeconds: current - 1 });
    }
  },

  restoreSession: async () => {
    set({ isLoading: true, error: null });
    try {
      const user = await matrixService.restoreSession();
      if (!user) {
        // Token invalid or DB reset -> force logout
        get().logout();
      }
      set({ currentUser: user, isLoading: false });
    } catch {
      // API failure or critical error -> assume session lost
      get().logout();
      set({ currentUser: null, isLoading: false });
    }
  },

  fetchCurrentUser: async () => {
    try {
      const user = await matrixService.fetchCurrentProfile();
      if (user) set({ currentUser: user });
    } catch {
      // ignore
    }
  },

  restoreSessionFromQr: async (accessToken: string, userId: string) => {
    set({ isLoading: true, error: null });
    try {
      // Save QR-received credentials so restoreSession can pick them up
      if (typeof window !== 'undefined') {
        localStorage.setItem('matrix_access_token', accessToken);
        localStorage.setItem('matrix_user_id', userId);
      }
      const user = await matrixService.restoreSession();
      if (!user) {
        get().logout();
      }
      set({ currentUser: user, isLoading: false });
      // Fetch rooms immediately
      await get().fetchRooms();
    } catch {
      get().logout();
      set({ currentUser: null, isLoading: false });
    }
  },

  logout: () => {
    matrixService.logout();
    if (typeof window !== 'undefined') {
      localStorage.removeItem('piechat_login_phone');
    }
    set({
      currentUser: null,
      rooms: [],
      currentRoom: null,
      otpRequired: false,
      otpMaskedPhone: null,
      otpDevCode: null,
      pendingChallenge: null,
      retryAfterSeconds: 0,
      error: null,
    });
  },

  fetchRooms: async () => {
    const existingRooms = get().rooms;
    if (existingRooms.length === 0) {
      set({ isLoading: true });
    }
    try {
      const rooms = await matrixService.getRooms();
      const currentRoomId = get().currentRoom?.id;

      // Notification & Call Logic
      const callStore = (await import('./call-store')).useCallStore.getState();

      rooms.forEach((nextRoom) => {
        const prevRoom = existingRooms.find(r => r.id === nextRoom.id);
        const isNewMessage = nextRoom.lastMessage && (!prevRoom?.lastMessage || nextRoom.lastMessage.id !== prevRoom.lastMessage.id);

        // Call logic
        if (nextRoom.callInvite && (!prevRoom?.callInvite || nextRoom.callInvite.timestamp > prevRoom.callInvite.timestamp)) {
          // Detected a new call invite
          if (callStore.status === 'none') {
            const remoteUser = nextRoom.members.find(m => m.id === nextRoom.callInvite?.senderId) || nextRoom.members[0];
            callStore.receiveCall(
              nextRoom.id,
              remoteUser,
              nextRoom.callInvite.type,
              nextRoom.callInvite.callId,
              nextRoom.callInvite.offer
            );
          }
        }

        if (nextRoom.lastCallStatus === 'hangup' && prevRoom?.lastCallStatus !== 'hangup') {
          if (callStore.roomId === nextRoom.id) {
            callStore.endCall();
          }
        }

        if (isNewMessage && nextRoom.id !== currentRoomId) {
          // Skip notification for own messages
          const myUserId = get().currentUser?.id;
          if (nextRoom.lastMessage?.senderId === myUserId) return;

          const senderName = nextRoom.members.find(m => m.id === nextRoom.lastMessage?.senderId)?.displayName
            || nextRoom.members.find(m => m.id === nextRoom.lastMessage?.senderId)?.username || 'Ai đó';
          const roomName = nextRoom.name || 'Phòng chat';

          void matrixService.showNotification(`${senderName} (${roomName})`, {
            body: nextRoom.lastMessage?.content,
            icon: '/icons/icon-192.png',
            data: { url: `/chat/${encodeURIComponent(nextRoom.id)}` },
          } as any);
        }

        // AUTO-READ if user is already in this room
        if (nextRoom.id === currentRoomId && nextRoom.unreadCount > 0) {
          nextRoom.unreadCount = 0;
          void matrixService.markRoomAsRead(currentRoomId, nextRoom.lastMessage?.id);
        }
      });

      const unchanged =
        existingRooms.length === rooms.length &&
        existingRooms.every((room, index) => {
          const next = rooms[index];
          if (!next) {
            return false;
          }
          return (
            room.id === next.id &&
            room.name === next.name &&
            room.type === next.type &&
            room.unreadCount === next.unreadCount &&
            room.lastMessage?.id === next.lastMessage?.id &&
            room.lastMessage?.timestamp === next.lastMessage?.timestamp &&
            room.priority === next.priority &&
            room.isDefaultGroup === next.isDefaultGroup &&
            room.isArchived === next.isArchived &&
            room.isAssistant === next.isAssistant &&
            room.callInvite?.callId === next.callInvite?.callId &&
            room.lastCallStatus === next.lastCallStatus
          );
        });
      if (unchanged) {
        set({ isLoading: false });
        return;
      }
      set({ rooms, isLoading: false });
    } catch {
      set({ error: 'Không tải được danh sách phòng', isLoading: false });
    }
  },

  createChannel: async (name: string, topic: string, isPublic: boolean, memberUserIds: string[]) => {
    try {
      const room = await matrixService.createChannel(name, topic, isPublic, memberUserIds);
      await get().fetchRooms();
      return room.channel.id;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Không tạo được channel' });
      return null;
    }
  },

  createGroup: async (channelId: string | null, name: string, memberUserIds: string[]) => {
    try {
      const room = await matrixService.createGroup(channelId, name, memberUserIds);
      await get().fetchRooms();
      return room.id;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Không tạo được nhóm' });
      return null;
    }
  },

  archiveGroup: async (groupId: string) => {
    try {
      await matrixService.archiveGroup(groupId);
      await get().fetchRooms();
      return true;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Không xóa được nhóm' });
      return false;
    }
  },

  deleteRoom: async (roomId: string) => {
    try {
      await matrixService.leaveRoom(roomId);
      await get().fetchRooms();
      return true;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Không thể xóa hội thoại' });
      return false;
    }
  },

  addMemberByUserId: async (roomId: string, userId: string) => {
    try {
      const resolvedUserId = await matrixService.addMemberByUserId(roomId, userId);
      await get().fetchRooms();
      return resolvedUserId;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Không thêm được thành viên' });
      return null;
    }
  },

  removeMember: async (roomId: string, userId: string) => {
    try {
      await matrixService.removeMember(roomId, userId);
      await get().fetchRooms();
      return true;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Không xóa được thành viên' });
      return false;
    }
  },

  updateChannelRole: async (roomId: string, userId: string, role: PieChatRole) => {
    try {
      await matrixService.updateChannelRole(roomId, userId, role);
      await get().fetchRooms();
      return true;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Không cập nhật được vai trò kênh' });
      return false;
    }
  },

  updateGroupRole: async (roomId: string, userId: string, role: PieChatRole) => {
    try {
      await matrixService.updateGroupRole(roomId, userId, role);
      await get().fetchRooms();
      return true;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Không cập nhật được vai trò nhóm' });
      return false;
    }
  },
  updateRoomRoles: async (roomId: string, channelRoles?: Record<string, PieChatRole>, groupRoles?: Record<string, PieChatRole>) => {
    try {
      await matrixService.updateRoomRoles(roomId, channelRoles, groupRoles);
      await get().fetchRooms();
      return true;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Không cập nhật được quyền' });
      return false;
    }
  },
  updateGroupPriority: async (groupId: string, priority: number) => {
    try {
      await matrixService.updateGroupPriority(groupId, priority);
      await get().fetchRooms();
      return true;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Không cập nhật được độ ưu tiên nhóm' });
      return false;
    }
  },

  createDirectChatByUserId: async (userId: string) => {
    try {
      const existingLocalRoom = get().rooms.find(
        (room) => room.type === 'dm' && room.members.some((member) => member.id === userId),
      );
      if (existingLocalRoom) {
        return existingLocalRoom.id;
      }
      const newRoom = await matrixService.createDirectChatByUserId(userId);

      const { rooms } = get();
      const exists = rooms.some(r => r.id === newRoom.id);
      if (!exists) {
        set({ rooms: [newRoom, ...rooms] });
      }
      void get().fetchRooms();

      return newRoom.id;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Không tạo được chat cá nhân' });
      return null;
    }
  },

  moveRoomToChannel: async (roomId: string, channelId: string) => {
    try {
      await matrixService.convertDmToGroupChannel(roomId, channelId);
      await get().fetchRooms();
      return true;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Không thể chuyển hội thoại' });
      return false;
    }
  },

  selectRoom: (roomId: string) => {
    const { rooms } = get();
    const roomIndex = rooms.findIndex(r => r.id === roomId);
    if (roomIndex !== -1) {
      const updatedRooms = [...rooms];
      updatedRooms[roomIndex] = { ...updatedRooms[roomIndex], unreadCount: 0 };
      set({ rooms: updatedRooms, currentRoom: updatedRooms[roomIndex] });
      void matrixService.markRoomAsRead(roomId, updatedRooms[roomIndex].lastMessage?.id);
    } else {
      set({ currentRoom: null });
    }
  },

  sendMessage: async (roomId: string, content: string) => {
    try {
      await matrixService.sendMessage(roomId, content);
      void get().fetchRooms();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gửi tin nhắn thất bại';
      set({ error: message });
      throw new Error(message);
    }
  },

  sendReaction: async (roomId: string, eventId: string, emoji: string) => {
    try {
      await matrixService.sendReaction(roomId, eventId, emoji);
      void get().fetchRooms();
    } catch (err) {
      console.error('Failed to send reaction:', err);
    }
  },

  toggleRestrictSpeaking: async (roomId: string, restricted: boolean) => {
    try {
      await matrixService.toggleRestrictSpeaking(roomId, restricted);
      await get().fetchRooms();
      return true;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Không thể cập nhật quyền phát biểu' });
      return false;
    }
  },

  joinRoom: async (roomId: string) => {
    try {
      await matrixService.joinRoom(roomId);
      await get().fetchRooms();
      return true;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Không thể tham gia hội thoại' });
      return false;
    }
  },

  sendFriendRequest: async (userId: string) => {
    try {
      await matrixService.sendFriendRequest(userId);
      await get().fetchRooms();
      return true;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Không thể gửi yêu cầu kết bạn' });
      return false;
    }
  },

  acceptFriendRequest: async (roomId: string) => {
    try {
      // Optimistic update: instantly move to accepted locally
      const { rooms } = get();
      const updatedRooms = rooms.map(r => {
        if (r.id === roomId) {
          return {
            ...r,
            friendship: { status: 'accepted' as const, requester: r.friendship?.requester || '' }
          };
        }
        return r;
      });
      set({ rooms: updatedRooms });

      await matrixService.acceptFriendRequest(roomId);
      // Background sync to ensure server data is in sync
      void get().fetchRooms();
      return true;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Không thể chấp nhận lời mời' });
      // Revert if failed
      void get().fetchRooms();
      return false;
    }
  },

  declineFriendRequest: async (roomId: string) => {
    try {
      // Remove the room from local state immediately
      const { rooms } = get();
      set({ rooms: rooms.filter(r => r.id !== roomId) });

      // Leave the room on the server
      await matrixService.leaveRoom(roomId);
      // Sync to ensure consistency
      void get().fetchRooms();
      return true;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Không thể từ chối tin nhắn' });
      // Revert if failed
      void get().fetchRooms();
      return false;
    }
  },

  unfriend: async (roomId: string) => {
    try {
      // Optimistic: remove from local state
      const { rooms } = get();
      set({ rooms: rooms.filter(r => r.id !== roomId) });

      await matrixService.unfriend(roomId);
      void get().fetchRooms();
      return true;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Không thể hủy kết bạn' });
      void get().fetchRooms();
      return false;
    }
  },
}));

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Language } from '@/lib/i18n';

import { normalizePhoneNumber } from '../utils';

interface UiState {
  language: Language;
  globalSearch: string;
  friends: Array<{ phone: string; displayName: string; userId?: string }>;
  pinnedRoomIds: string[];
  friendRequests: Array<{ phone: string; displayName: string }>;
  sentFriendRequests: string[];
  setLanguage: (language: Language) => void;
  setGlobalSearch: (value: string) => void;
  addFriend: (phone: string, displayName?: string, userId?: string) => void;
  sendFriendRequest: (phone: string) => void;
  cancelSentRequest: (phone: string) => void;
  removeFriend: (phone: string) => void;
  acceptFriendRequest: (phone: string) => void;
  togglePinRoom: (roomId: string) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      language: 'vi',
      globalSearch: '',
      friends: [],
      pinnedRoomIds: [],
      friendRequests: [],
      sentFriendRequests: [],
      setLanguage: (language) => set({ language }),
      setGlobalSearch: (value) => set({ globalSearch: value }),
      addFriend: (phone, displayName, userId) =>
        set((state) => {
          const normalized = normalizePhoneNumber(phone);
          if (!normalized && !userId) {
            return state;
          }
          const isRequest = state.friendRequests.some(r => normalizePhoneNumber(r.phone) === normalized);
          if (isRequest) {
            // If already a request, just move to friends
            const req = state.friendRequests.find(r => normalizePhoneNumber(r.phone) === normalized);
            return {
              friends: [...state.friends, { ...req!, userId, phone: normalized }],
              friendRequests: state.friendRequests.filter(r => normalizePhoneNumber(r.phone) !== normalized),
              sentFriendRequests: state.sentFriendRequests.filter(p => normalizePhoneNumber(p) !== normalized)
            };
          }
          const existing = state.friends.find((item) => (normalized && normalizePhoneNumber(item.phone) === normalized) || (userId && item.userId === userId));
          if (existing) {
            if (userId && !existing.userId) {
              // Update missing userId
              return {
                friends: state.friends.map(f => normalizePhoneNumber(f.phone) === normalized ? { ...f, userId } : f)
              };
            }
            return state;
          }
          return {
            friends: [
              ...state.friends,
              {
                phone: normalized,
                displayName: displayName?.trim() || normalized,
                userId,
              },
            ],
            sentFriendRequests: state.sentFriendRequests.filter(p => normalizePhoneNumber(p) !== normalized)
          };
        }),
      sendFriendRequest: (phone) => {
        const normalized = normalizePhoneNumber(phone);
        set((state) => ({
          sentFriendRequests: state.sentFriendRequests.includes(normalized)
            ? state.sentFriendRequests
            : [...state.sentFriendRequests, normalized]
        }));
      },
      cancelSentRequest: (phone) => {
        const normalized = normalizePhoneNumber(phone);
        set((state) => ({
          sentFriendRequests: state.sentFriendRequests.filter(p => normalizePhoneNumber(p) !== normalized)
        }));
      },
      removeFriend: (phone) => {
        const normalized = normalizePhoneNumber(phone);
        set((state) => ({
          friends: state.friends.filter((item) => normalizePhoneNumber(item.phone) !== normalized),
        }));
      },
      acceptFriendRequest: (phone) => {
        const normalized = normalizePhoneNumber(phone);
        set((state) => {
          const request = state.friendRequests.find(r => normalizePhoneNumber(r.phone) === normalized);
          if (!request) return state;
          return {
            friends: [...state.friends, { ...request, phone: normalized }],
            friendRequests: state.friendRequests.filter(r => normalizePhoneNumber(r.phone) !== normalized),
            sentFriendRequests: state.sentFriendRequests.filter(p => normalizePhoneNumber(p) !== normalized)
          };
        });
      },
      togglePinRoom: (roomId) =>
        set((state) => {
          const isPinned = state.pinnedRoomIds.includes(roomId);
          if (isPinned) {
            return {
              pinnedRoomIds: state.pinnedRoomIds.filter((id) => id !== roomId),
            };
          }
          return {
            pinnedRoomIds: [...state.pinnedRoomIds, roomId],
          };
        }),
    }),
    {
      name: 'piechat-ui-store',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

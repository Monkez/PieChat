'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  UserRound,
  Hash,
  BookUser,
  Users,
  Settings,
  LogOut,
  Search,
  Menu,
  X,
  MessageCircle,
  MessageSquare,
  Plus,
  UserPlus,
  Crown,
  Trash2,
  ShieldCheck,
  Shield,
  QrCode,
  Pin,
  PinOff,
  MoreVertical,
  Bot,
  Sparkles,
  Zap,
  LayoutGrid,
  ShieldAlert,
  UserCheck,
  UserX,
  MessageSquareWarning,
  ChevronRight,
  ChevronDown,
  Camera,
  CheckCircle
} from 'lucide-react';
import { useMatrixStore } from '@/lib/store/matrix-store';
import { usePathname, useRouter } from 'next/navigation';
import { cn, normalizePhoneNumber } from '@/lib/utils';
import { useUiStore } from '@/lib/store/ui-store';
import { t } from '@/lib/i18n';
import LanguageSwitcher from '@/components/language-switcher';
import { matrixService, UserDirectoryAccount } from '@/lib/services/matrix-service';
import { authUrl } from '@/lib/config';
import { CallOverlay } from '@/components/chat/call-overlay';
import { MobileBottomBar } from '@/components/mobile-bottom-bar';
import { useAssistantStore } from '@/lib/store/assistant-store';
import { AssistantManagerModal } from '@/components/assistant-config-modal';
import { App as CapApp } from '@capacitor/app';
import jsQR from 'jsqr';
import { NotificationPermissionBanner } from '@/components/notification-permission-banner';

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<'personal' | 'channels' | 'contacts' | 'assistants'>('personal');

  // Assistant store
  const { assistants: configuredAssistants, assistantRoomIds, loadAssistants, addAssistantRoom, syncAssistantRooms, openModal: openAssistantModal } = useAssistantStore();
  const [isChannelModalOpen, setIsChannelModalOpen] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [isDirectModalOpen, setIsDirectModalOpen] = useState(false);
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);
  const createMenuRef = useRef<HTMLDivElement>(null);
  const [channelName, setChannelName] = useState('');
  const [channelTopic, setChannelTopic] = useState('');
  const [channelIsPublic, setChannelIsPublic] = useState(true);
  const [channelMemberQuery, setChannelMemberQuery] = useState('');
  const [channelSuggestions, setChannelSuggestions] = useState<UserDirectoryAccount[]>([]);
  const [channelMembers, setChannelMembers] = useState<UserDirectoryAccount[]>([]);
  const [groupName, setGroupName] = useState('');
  const [groupChannelId, setGroupChannelId] = useState('');
  const [groupMemberQuery, setGroupMemberQuery] = useState('');
  const [groupSuggestions, setGroupSuggestions] = useState<UserDirectoryAccount[]>([]);
  const [groupMembers, setGroupMembers] = useState<UserDirectoryAccount[]>([]);
  const [dmQuery, setDmQuery] = useState('');
  const [dmSuggestions, setDmSuggestions] = useState<UserDirectoryAccount[]>([]);
  const [selectedDmUser, setSelectedDmUser] = useState<UserDirectoryAccount | null>(null);
  const [dmLookupLoading, setDmLookupLoading] = useState(false);
  const [friendPhone, setFriendPhone] = useState('');
  const [friendName, setFriendName] = useState('');
  const [friendNotice, setFriendNotice] = useState('');
  const [showGlobalSearchSuggestions, setShowGlobalSearchSuggestions] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // QR Scanner state
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [qrScanResult, setQrScanResult] = useState<'idle' | 'scanning' | 'success' | 'error'>('idle');
  const [qrScanMessage, setQrScanMessage] = useState('');
  const [qrManualCode, setQrManualCode] = useState('');
  const [hasCameraAccess, setHasCameraAccess] = useState(true);
  const qrVideoRef = useRef<HTMLVideoElement>(null);
  const qrStreamRef = useRef<MediaStream | null>(null);
  const qrScanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qrFileInputRef = useRef<HTMLInputElement>(null);
  const isFetchingRoomsRef = useRef(false);
  const {
    rooms,
    currentUser,
    fetchRooms,
    restoreSession,
    logout,
    createChannel,
    createGroup,
    archiveGroup,
    deleteRoom,
    createDirectChatByUserId,
    joinRoom,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    unfriend,
    moveRoomToChannel,
    selectRoom,
    error,
  } = useMatrixStore();
  const { language, globalSearch, setGlobalSearch, friends: localFriends, addFriend: addLocalFriend, removeFriend: removeLocalFriend, pinnedRoomIds, togglePinRoom, friendRequests: localRequests, acceptFriendRequest: acceptLocalRequest, sentFriendRequests: localSentRequests, sendFriendRequest: sendLocalRequest } = useUiStore();

  const [isMessageRequestsOpen, setIsMessageRequestsOpen] = useState(false);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [movingRoomId, setMovingRoomId] = useState<string | null>(null);
  const [searchUserResults, setSearchUserResults] = useState<UserDirectoryAccount[]>([]);

  useEffect(() => {
    const q = globalSearch.trim();
    if (q.length < 3) {
      setSearchUserResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const results = await matrixService.searchUsersByName(q);
        setSearchUserResults(results);
      } catch (err) {
        console.error('Global search user lookup failed:', err);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [globalSearch]);

  // Capacitor back button handler
  useEffect(() => {
    let listener: any;
    const setup = async () => {
      try {
        listener = await CapApp.addListener('backButton', () => {
          // If we're in a chat room, go back to lobby
          if (pathname.startsWith('/chat/')) {
            router.replace('/chat');
          } else {
            // At lobby or any other chat page — minimize app, never go back to login
            CapApp.minimizeApp();
          }
        });
      } catch (e) {
        // Not running in Capacitor (browser) — ignore
      }
    };
    setup();
    return () => { listener?.remove?.(); };
  }, [pathname, router]);

  const fetchRoomsSafely = useCallback(async () => {
    if (isFetchingRoomsRef.current) {
      return;
    }
    isFetchingRoomsRef.current = true;
    try {
      await fetchRooms();
    } finally {
      isFetchingRoomsRef.current = false;
    }
  }, [fetchRooms]);

  useEffect(() => {
    const boot = async () => {
      if (!currentUser) {
        await restoreSession();
      }
      const user = useMatrixStore.getState().currentUser;
      if (!user) {
        router.push('/login');
        return;
      }
      await fetchRoomsSafely();
      loadAssistants();
    };
    boot();
  }, [currentUser, fetchRoomsSafely, restoreSession, router]);

  useEffect(() => {
    const timer = setInterval(() => {
      void fetchRoomsSafely();
    }, 5000);
    return () => clearInterval(timer);
  }, [fetchRoomsSafely]);

  // Filter out rooms with raw IDs if they don't have a resolved name or valid peer
  // Ensure all joined rooms are visible
  const visibleRooms = rooms;

  // Sync assistant rooms detected from server state + migrate localStorage-only rooms to server
  useEffect(() => {
    if (rooms.length > 0) {
      const serverAssistantIds = rooms.filter(r => r.isAssistant).map(r => r.id);
      if (serverAssistantIds.length > 0) {
        syncAssistantRooms(serverAssistantIds);
      }

      // Migrate: for rooms in localStorage assistantRoomIds but NOT flagged on server, persist to server
      const serverSet = new Set(serverAssistantIds);
      assistantRoomIds.forEach(roomId => {
        if (!serverSet.has(roomId) && rooms.some(r => r.id === roomId)) {
          void matrixService.markRoomAsAssistant(roomId);
        }
      });
    }
  }, [rooms, syncAssistantRooms, assistantRoomIds]);

  const searchableRooms = visibleRooms;
  const isPersonalRoom = (room: { type: string }) => room.type === 'dm';

  const recentChats = useMemo(() => {
    return searchableRooms
      .filter((room) => {
        if (room.type === 'dm') return true;
        // Show channels and groups even without messages (newly created)
        if (room.type === 'channel' || room.type === 'group') return true;
        return !!room.lastMessage;
      })
      .sort((a, b) => {
        const isAPinned = pinnedRoomIds.includes(a.id);
        const isBPinned = pinnedRoomIds.includes(b.id);
        if (isAPinned && !isBPinned) return -1;
        if (!isAPinned && isBPinned) return 1;

        const timeA = a.lastMessage?.timestamp || a.createdAt || 0;
        const timeB = b.lastMessage?.timestamp || b.createdAt || 0;
        return timeB - timeA;
      });
  }, [searchableRooms, pinnedRoomIds]);

  const personalChats = useMemo(() => {
    // Collect IDs of channels the user is actually a member of
    const joinedChannelIds = new Set(
      rooms.filter(r => r.type === 'channel').map(r => r.id)
    );

    return recentChats.filter(room => {
      // Hide assistant rooms from personal tab
      if (assistantRoomIds.includes(room.id) || room.isAssistant) return false;
      // Groups without channelId (standalone groups)
      if (room.type === 'group' && !room.channelId) return true;
      // Groups where user is NOT a member of parent channel (guest visitor / khách vãng lai)
      if (room.type === 'group' && room.channelId && !joinedChannelIds.has(room.channelId)) return true;
      if (room.type !== 'dm') return false;

      // In the new logic, they are personal if friendship status is 'accepted'
      // Hide if no messages have been sent yet to keep UI clean
      return room.friendship?.status === 'accepted' && !!room.lastMessage;
    });
  }, [recentChats, rooms, assistantRoomIds]);

  const messageRequests = useMemo(() => {
    return recentChats.filter(room => {
      if (room.type !== 'dm') return false;

      // They are requests if not accepted and not me talking to me
      const otherMember = room.members.find(m => m.id !== currentUser?.id);
      if (!otherMember) return false;

      return room.friendship?.status !== 'accepted';
    });
  }, [recentChats, currentUser]);

  const incomingFriendRequests = useMemo(() => {
    return rooms.filter(r =>
      r.type === 'dm' &&
      r.friendship?.status === 'pending' &&
      r.friendship?.requester !== currentUser?.id
    ).map(r => {
      const otherMember = r.members.find(m => m.id !== currentUser?.id);
      return {
        id: r.id,
        displayName: otherMember?.displayName || otherMember?.username || 'Stranger',
        phone: otherMember?.username || ''
      };
    });
  }, [rooms, currentUser]);

  const contacts = useMemo(() => {
    return rooms.filter(r => r.type === 'dm' && r.friendship?.status === 'accepted')
      .map(r => {
        const otherMember = r.members.find(m => m.id !== currentUser?.id);
        return {
          id: r.id,
          userId: otherMember?.id || '',
          displayName: otherMember?.displayName || otherMember?.username || 'User',
          phone: otherMember?.username || ''
        };
      });
  }, [rooms, currentUser]);
  const groupRooms = searchableRooms.filter((room) => room.type === 'group' && !isPersonalRoom(room) && !assistantRoomIds.includes(room.id) && !room.isAssistant);
  const channelRooms = searchableRooms.filter((room) => room.type === 'channel' && !assistantRoomIds.includes(room.id) && !room.isAssistant);
  // Rooms that were created with assistant members
  const assistantRooms = searchableRooms.filter((room) => assistantRoomIds.includes(room.id) || room.isAssistant);
  const groupedChannels = channelRooms.map((channelRoom) => ({
    channel: channelRoom,
    groups: groupRooms
      .filter((groupRoom) => groupRoom.channelId === channelRoom.id)
      .sort((a, b) => {
        if (a.isDefaultGroup) return -1;
        if (b.isDefaultGroup) return 1;
        const ap = a.priority || 100;
        const bp = b.priority || 100;
        if (ap !== bp) return ap - bp;
        return (a.createdAt || 0) - (b.createdAt || 0);
      }),
  }));
  // Moved up for useEffect visibility
  const isRoomRoute = /^\/chat\/.+/.test(pathname);
  const activeRoomId = isRoomRoute ? decodeURIComponent(pathname.replace('/chat/', '')) : '';

  useEffect(() => {
    if (activeRoomId) {
      void selectRoom(activeRoomId);
    }
  }, [activeRoomId, selectRoom]);

  const globalSearchResults = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return [];

    const matchedRooms = rooms.filter(room =>
      room.name.toLowerCase().includes(q) ||
      room.members.some(m => m.username.toLowerCase().includes(q))
    ).map(room => {
      if (room.type === 'dm') {
        const other = room.members.find(m => m.id !== currentUser?.id);
        return {
          ...room,
          phone: other?.id.includes(':') ? other.id.split(':')[0].replace('@u', '') : other?.username,
          username: other?.username
        };
      }
      return room;
    });

    // Find contacts whose phone or name matches and aren't already represented in matchedRooms as a DM
    const matchedFriends = contacts.filter(f => {
      const match = f.displayName.toLowerCase().includes(q) || f.phone.includes(q);
      if (!match) return false;
      // Check if we already have a DM with this person in matchedRooms
      return !matchedRooms.some(r => r.type === 'dm' && r.name.toLowerCase().includes(f.displayName.toLowerCase()));
    }).map(f => ({
      id: f.userId || `friend-${f.phone}`,
      name: f.displayName,
      type: 'contact',
      phone: f.phone
    }));

    // Discovered users from directory search
    const discoveredUsers = searchUserResults
      .filter(u => {
        const isMatchedInRooms = matchedRooms.some(r => r.type === 'dm' && r.members.some(m => m.id === u.userId));
        const isAlreadyInFriends = contacts.some(f => f.phone === u.username || u.userId.toLowerCase().includes(f.phone.toLowerCase()));
        return !isAlreadyInFriends && !isMatchedInRooms;
      })
      .map(u => ({
        id: u.userId,
        name: u.displayName,
        type: 'user',
        username: u.username,
        avatarUrl: u.avatarUrl
      }));

    const allResults = [...matchedRooms, ...matchedFriends, ...discoveredUsers];

    return allResults
      .sort((a, b) => {
        const typeOrder: Record<string, number> = { 'dm': 1, 'contact': 1, 'user': 1, 'channel': 2, 'group': 3 };
        const orderA = typeOrder[a.type as string] || 99;
        const orderB = typeOrder[b.type as string] || 99;
        if (orderA !== orderB) return orderA - orderB;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 10);
  }, [rooms, globalSearch, contacts, searchUserResults, currentUser]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowGlobalSearchSuggestions(false);
      }
      if (createMenuRef.current && !createMenuRef.current.contains(event.target as Node)) {
        setIsCreateMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  useEffect(() => {
    const keyword = dmQuery.trim();
    if (keyword.length < 2) {
      setDmSuggestions([]);
      setSelectedDmUser(null);
      setDmLookupLoading(false);
      return;
    }
    setDmLookupLoading(true);
    // Inject matching assistants
    const assistantMatches: UserDirectoryAccount[] = configuredAssistants
      .filter((a) => a.name.toLowerCase().includes(keyword.toLowerCase()))
      .map((a) => ({
        userId: `@assistant-${a.id}:piepie`,
        username: a.name,
        displayName: `${a.avatar || '🤖'} ${a.name}`,
        avatarUrl: undefined,
      }));
    const timer = setTimeout(() => {
      void matrixService.searchUsersByName(keyword).then((results) => {
        const merged = [...assistantMatches, ...results];
        setDmSuggestions(merged);
        setSelectedDmUser(merged[0] || null);
        setDmLookupLoading(false);
      }).catch(() => {
        setDmSuggestions(assistantMatches);
        setSelectedDmUser(assistantMatches[0] || null);
        setDmLookupLoading(false);
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [dmQuery, configuredAssistants]);

  useEffect(() => {
    const keyword = channelMemberQuery.trim();
    if (keyword.length < 2) {
      setChannelSuggestions([]);
      return;
    }
    // Inject matching assistants
    const assistantMatches: UserDirectoryAccount[] = configuredAssistants
      .filter((a) => a.name.toLowerCase().includes(keyword.toLowerCase()))
      .filter((a) => !channelMembers.some((m) => m.userId === `@assistant-${a.id}:piepie`))
      .map((a) => ({
        userId: `@assistant-${a.id}:piepie`,
        username: a.name,
        displayName: `${a.avatar || '🤖'} ${a.name}`,
        avatarUrl: undefined,
      }));
    const timer = setTimeout(() => {
      void matrixService.searchUsersByName(keyword).then((results) => {
        const filtered = results.filter((r) => !channelMembers.some((s) => s.userId === r.userId));
        setChannelSuggestions([...assistantMatches, ...filtered]);
      }).catch(() => {
        setChannelSuggestions(assistantMatches);
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [channelMemberQuery, channelMembers, configuredAssistants]);

  useEffect(() => {
    const keyword = groupMemberQuery.trim();
    if (keyword.length < 2) {
      setGroupSuggestions([]);
      return;
    }
    // Inject matching assistants
    const assistantMatches: UserDirectoryAccount[] = configuredAssistants
      .filter((a) => a.name.toLowerCase().includes(keyword.toLowerCase()))
      .filter((a) => !groupMembers.some((m) => m.userId === `@assistant-${a.id}:piepie`))
      .map((a) => ({
        userId: `@assistant-${a.id}:piepie`,
        username: a.name,
        displayName: `${a.avatar || '🤖'} ${a.name}`,
        avatarUrl: undefined,
      }));
    const timer = setTimeout(() => {
      void matrixService.searchUsersByName(keyword).then((results) => {
        const filtered = results.filter((r) => !groupMembers.some((s) => s.userId === r.userId));
        setGroupSuggestions([...assistantMatches, ...filtered]);
      }).catch(() => {
        setGroupSuggestions(assistantMatches);
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [groupMemberQuery, groupMembers, configuredAssistants]);

  const handleCreateChannel = async () => {
    if (!channelName.trim()) {
      return;
    }
    // Filter out assistant userIds — they aren't real Matrix users yet
    const memberUserIds = channelMembers
      .map((member) => member.userId)
      .filter((id) => !id.includes(':piepie'));
    console.log('[PieChat] Creating channel:', { channelName, channelIsPublic, memberUserIds, allMembers: channelMembers.map(m => m.userId) });
    try {
      const roomId = await createChannel(channelName.trim(), channelTopic.trim(), channelIsPublic, memberUserIds);
      console.log('[PieChat] Channel created, roomId:', roomId);
      if (roomId) {
        // Mark as assistant room if any member was a bot
        const hasAssistant = channelMembers.some((m) => m.userId.includes(':piepie'));
        if (hasAssistant) {
          addAssistantRoom(roomId);
          // Persist to Matrix server state
          void matrixService.markRoomAsAssistant(roomId);
        }
        setChannelName('');
        setChannelTopic('');
        setChannelMemberQuery('');
        setChannelSuggestions([]);
        setChannelMembers([]);
        setIsChannelModalOpen(false);
        router.push(`/chat/${encodeURIComponent(roomId)}`);
      } else {
        console.error('[PieChat] createChannel returned null');
        alert('Không tạo được kênh. Vui lòng thử lại.');
      }
    } catch (err) {
      console.error('[PieChat] Channel creation error:', err);
      alert('Lỗi tạo kênh: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      return;
    }
    // Filter out assistant userIds — they aren't real Matrix users yet
    const memberUserIds = groupMembers
      .map((member) => member.userId)
      .filter((id) => !id.includes(':piepie'));
    const roomId = await createGroup(groupChannelId || null, groupName.trim(), memberUserIds);
    if (roomId) {
      // Mark as assistant room if any member was a bot
      const hasAssistant = groupMembers.some((m) => m.userId.includes(':piepie'));
      if (hasAssistant) {
        addAssistantRoom(roomId);
        // Persist to Matrix server state
        void matrixService.markRoomAsAssistant(roomId);
      }
      setGroupName('');
      setGroupMemberQuery('');
      setGroupSuggestions([]);
      setGroupMembers([]);
      setGroupChannelId('');
      setIsGroupModalOpen(false);
      router.push(`/chat/${encodeURIComponent(roomId)}`);
    }
  };

  const handleOpenCreateChannelModal = () => {
    setIsChannelModalOpen(true);
  };

  const handleCloseCreateChannelModal = () => {
    setIsChannelModalOpen(false);
    setChannelName('');
    setChannelTopic('');
    setChannelMemberQuery('');
    setChannelSuggestions([]);
    setChannelMembers([]);
  };

  const handleOpenCreateGroupModal = (channelId = '') => {
    setGroupChannelId(channelId);
    setIsGroupModalOpen(true);
  };

  const handleCloseDirectModal = () => {
    setIsDirectModalOpen(false);
    setDmQuery('');
    setDmSuggestions([]);
    setSelectedDmUser(null);
  };

  const handleCloseCreateGroupModal = () => {
    setIsGroupModalOpen(false);
    setGroupName('');
    setGroupMemberQuery('');
    setGroupSuggestions([]);
    setGroupMembers([]);
    setGroupChannelId('');
  };

  const handleArchiveGroup = async (groupId: string) => {
    const ok = await archiveGroup(groupId);
    if (!ok) {
      return;
    }
    if (activeRoomId === groupId) {
      router.push('/chat');
    }
  };

  const handleDirectChat = async (userId: string) => {
    if (!userId) {
      return;
    }
    // Assistant users aren't real Matrix users yet
    if (userId.includes(':piepie')) {
      alert('Trò chuyện với trợ lý sẽ sớm ra mắt! Hãy thêm trợ lý vào Kênh hoặc Nhóm.');
      return;
    }
    setDmLookupLoading(true);
    try {
      const roomId = await createDirectChatByUserId(userId);
      if (roomId) {
        setDmQuery('');
        setDmSuggestions([]);
        setSelectedDmUser(null);
        setIsSidebarOpen(false);
        router.push(`/chat/${encodeURIComponent(roomId)}`);
      }
    } finally {
      setDmLookupLoading(false);
    }
  };

  const handleDirectChatFromContact = async (displayName: string, phone: string) => {
    setDmLookupLoading(true);
    try {
      // 1. Try local map first (best for test users like alice/bob)
      const mappedId = matrixService.resolveKnownMatrixUserIdFromPhone(phone);
      if (mappedId) {
        await handleDirectChat(mappedId);
        return;
      }

      // 2. Try search by phone/name in directory
      const results = await matrixService.searchUsersByName(phone);
      if (results.length > 0) {
        await handleDirectChat(results[0].userId);
        return;
      }

      const resultsByName = await matrixService.searchUsersByName(displayName);
      if (resultsByName.length > 0) {
        await handleDirectChat(resultsByName[0].userId);
        return;
      }

      // 3. Guess MXID if everything else fails
      const digits = matrixService.normalizePhone(phone).replace(/\D/g, '');
      const matrixDomain = process.env.NEXT_PUBLIC_MATRIX_SERVER_NAME || 'localhost';
      await handleDirectChat(`@u${digits}:${matrixDomain}`);
    } catch (err) {
      console.error('Failed to start direct chat:', err);
    } finally {
      setDmLookupLoading(false);
    }
  };

  const addSelectedMember = (
    candidate: UserDirectoryAccount,
    selected: UserDirectoryAccount[],
    setter: (next: UserDirectoryAccount[]) => void,
  ) => {
    if (selected.some((item) => item.userId === candidate.userId)) {
      return;
    }
    setter([...selected, candidate]);
  };

  const removeSelectedMember = (
    userId: string,
    selected: UserDirectoryAccount[],
    setter: (next: UserDirectoryAccount[]) => void,
  ) => {
    setter(selected.filter((item) => item.userId !== userId));
  };

  const handleAddFriend = async () => {
    const normalized = normalizePhoneNumber(friendPhone);
    if (!normalized) {
      return;
    }
    const digits = normalized.replace(/\D/g, '');
    const matrixDomain = process.env.NEXT_PUBLIC_MATRIX_SERVER_NAME || 'localhost';
    const mxid = `@u${digits}:${matrixDomain}`;

    const ok = await sendFriendRequest(mxid);
    if (ok) {
      setFriendNotice(t(language, 'chatFriendAdded'));
      setFriendPhone('');
      setFriendName('');
    }
  };

  // ─── QR Scanner Functions ──────────────────────────────
  const stopQrScanner = useCallback(() => {
    if (qrStreamRef.current) {
      qrStreamRef.current.getTracks().forEach(track => track.stop());
      qrStreamRef.current = null;
    }
    if (qrScanTimerRef.current) {
      clearInterval(qrScanTimerRef.current);
      qrScanTimerRef.current = null;
    }
  }, []);

  const handleQrDetected = useCallback(async (rawValue: string) => {
    stopQrScanner();
    try {
      const data = JSON.parse(rawValue);
      if (data.type !== 'piechat-qr-login' || !data.sessionId) {
        setQrScanResult('error');
        setQrScanMessage('Mã QR không hợp lệ');
        return;
      }
      const accessToken = localStorage.getItem('matrix_access_token');
      if (!accessToken) {
        setQrScanResult('error');
        setQrScanMessage('Bạn chưa đăng nhập trên điện thoại này');
        return;
      }
      const res = await fetch(authUrl('/qr/approve'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: data.sessionId, accessToken }),
      });
      if (res.ok) {
        setQrScanResult('success');
        setQrScanMessage('Đã cấp phép đăng nhập!');
      } else {
        const err = await res.json();
        setQrScanResult('error');
        setQrScanMessage(err.error || 'Không thể cấp phép');
      }
    } catch {
      setQrScanResult('error');
      setQrScanMessage('Mã QR không hợp lệ');
    }
  }, [stopQrScanner]);

  const startQrScanner = useCallback(async () => {
    // Try ML Kit native scanner first (works on Capacitor/Android without HTTPS)
    try {
      const { BarcodeScanner, BarcodeFormat } = await import('@capacitor-mlkit/barcode-scanning');
      
      // Check/request camera permission
      const permStatus = await BarcodeScanner.checkPermissions();
      if (permStatus.camera !== 'granted') {
        const reqResult = await BarcodeScanner.requestPermissions();
        if (reqResult.camera !== 'granted') {
          setHasCameraAccess(false);
          setQrScanResult('idle');
          setQrScanMessage('Cần cấp quyền camera để quét mã QR');
          return;
        }
      }

      // Use the native scanner overlay (inline in app)
      setQrScanResult('scanning');
      setQrScanMessage('');
      const result = await BarcodeScanner.scan({
        formats: [BarcodeFormat.QrCode],
      });
      
      if (result.barcodes.length > 0 && result.barcodes[0].rawValue) {
        void handleQrDetected(result.barcodes[0].rawValue);
      } else {
        setQrScanResult('idle');
        setQrScanMessage('Không tìm thấy mã QR. Hãy thử lại.');
      }
      return;
    } catch (mlkitErr) {
      // ML Kit not available (browser, or plugin error) — fall through to getUserMedia
      console.log('ML Kit not available, trying getUserMedia:', mlkitErr);
    }

    // Browser fallback: use getUserMedia (requires HTTPS)
    if (!navigator.mediaDevices?.getUserMedia) {
      setHasCameraAccess(false);
      setQrScanResult('idle');
      setQrScanMessage('');
      return;
    }
    setQrScanResult('scanning');
    setQrScanMessage('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: 640, height: 480 },
      });
      qrStreamRef.current = stream;
      if (qrVideoRef.current) {
        qrVideoRef.current.srcObject = stream;
        await qrVideoRef.current.play();
      }
      if ('BarcodeDetector' in window) {
        const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
        qrScanTimerRef.current = setInterval(async () => {
          if (!qrVideoRef.current) return;
          try {
            const barcodes = await detector.detect(qrVideoRef.current);
            if (barcodes.length > 0) {
              void handleQrDetected(barcodes[0].rawValue);
            }
          } catch { /* frame not ready */ }
        }, 300);
      } else {
        setQrScanMessage('Trình duyệt không hỗ trợ quét QR. Dùng Chrome 83+.');
      }
    } catch (err) {
      console.error('Camera error:', err);
      setHasCameraAccess(false);
      setQrScanResult('idle');
      setQrScanMessage('');
    }
  }, [handleQrDetected]);

  // Handle QR from captured photo (file input fallback — kept for edge cases)
  const handleQrFileCapture = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setQrScanResult('scanning');
    setQrScanMessage('Đang phân tích mã QR...');
    try {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      await new Promise((resolve) => { img.onload = resolve; });
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      URL.revokeObjectURL(img.src);
      if (code?.data) {
        void handleQrDetected(code.data);
      } else {
        setQrScanResult('idle');
        setQrScanMessage('Không tìm thấy mã QR trong ảnh. Hãy thử lại.');
      }
    } catch (err) {
      console.error('QR decode error:', err);
      setQrScanResult('idle');
      setQrScanMessage('Lỗi phân tích ảnh. Hãy thử lại.');
    }
    if (qrFileInputRef.current) qrFileInputRef.current.value = '';
  }, [handleQrDetected]);

  return (
    <div className={cn(
      "flex h-screen overflow-hidden bg-white dark:bg-black",
      "flex-col lg:flex-row"
    )}>
      {/* Desktop: Vertical Navigation Rail (left side) */}
      <nav className="hidden lg:flex w-16 flex-col items-center py-4 text-white z-40 shrink-0" style={{ background: 'var(--accent-600)' }}>
        <div className="mb-6">
          <div className="h-12 w-12 overflow-hidden rounded-full border-2 border-white/20 shadow-sm">
            {currentUser?.avatarUrl ? (
              <Image src={currentUser.avatarUrl} alt="Avatar" width={48} height={48} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-sky-400 font-bold text-lg">
                {(currentUser?.username || 'U').charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-4">
          <button
            onClick={() => setActiveSection('personal')}
            className={cn(
              "p-3 rounded-xl transition-all hover:bg-white/10 relative",
              activeSection === 'personal' ? "bg-white/20 shadow-inner" : ""
            )}
            title={t(language, 'chatTabPersonal')}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/menubar-icons/conversation.png" alt="Chat" className="h-6 w-6" />
            {recentChats.some((r: any) => r.unreadCount > 0) && (
              <span className="absolute top-2 right-2 h-4 min-w-[16px] flex items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold">
                {recentChats.reduce((acc: number, r: any) => acc + r.unreadCount, 0)}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveSection('channels')}
            className={cn(
              "p-3 rounded-xl transition-all hover:bg-white/10",
              activeSection === 'channels' ? "bg-white/20 shadow-inner" : ""
            )}
            title={t(language, 'chatTabChannels')}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/menubar-icons/group.png" alt="Channels" className="h-6 w-6" />
          </button>

          <button
            onClick={() => setActiveSection('contacts')}
            className={cn(
              "p-3 rounded-xl transition-all hover:bg-white/10",
              activeSection === 'contacts' ? "bg-white/20 shadow-inner" : ""
            )}
            title={t(language, 'chatTabContacts')}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/menubar-icons/contact.png" alt="Contacts" className="h-6 w-6" />
          </button>

          <button
            onClick={() => setActiveSection('assistants')}
            className={cn(
              "p-3 rounded-xl transition-all hover:bg-white/10",
              activeSection === 'assistants' ? "bg-white/20 shadow-inner" : ""
            )}
            title={t(language, 'chatTabAssistant' as any)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/menubar-icons/bot.png" alt="Bot" className="h-6 w-6" />
          </button>
        </div>

        <div className="flex flex-col gap-4 mt-auto">
          <Link
            href="/settings"
            className="p-3 rounded-xl transition-all hover:bg-white/10"
            title={t(language, 'settingsTitle')}
          >
            <Settings className="h-6 w-6" />
          </Link>
          <button
            onClick={handleLogout}
            className="p-3 rounded-xl transition-all hover:bg-white/10 text-white/80 hover:text-white"
            title={t(language, 'settingsSignOut')}
          >
            <LogOut className="h-6 w-6" />
          </button>
        </div>
      </nav>

      {/* Mobile: Bottom Navigation Bar */}
      {!activeRoomId && (
        <MobileBottomBar activeSection={activeSection} onSectionChange={setActiveSection} />
      )}

      {/* Sidebar List */}
      <aside
        className={cn(
          "flex flex-col border-r border-[#e5e7eb] bg-white dark:border-zinc-800 dark:bg-zinc-950 shrink-0 min-h-0",
          "flex-1 lg:flex-none lg:w-80 pb-16 lg:pb-0",
          activeRoomId ? "hidden lg:flex" : "flex"
        )}
      >
        {/* Sidebar Header with Search */}
        <div className="p-4 lg:p-4 space-y-3 lg:space-y-4" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top, 1rem))' }}>
          <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100 mb-1">
            <span className="text-2xl lg:text-xl font-extrabold tracking-tight bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 bg-clip-text text-transparent drop-shadow-sm">PieChat</span>
          </div>
          <div className="flex items-center gap-2">
            <div ref={searchContainerRef} className="relative flex-1 group">
              <div className="flex items-center w-full rounded-xl bg-[#f0f2f5] dark:bg-zinc-900 focus-within:bg-white dark:focus-within:bg-zinc-900 ring-offset-white focus-within:ring-1 focus-within:ring-sky-500 transition-all h-11 lg:h-9">
                <Search className="ml-3 h-4 w-4 text-zinc-400 shrink-0" />
                <input
                  type="text"
                  value={globalSearch}
                  onChange={(e) => {
                    setGlobalSearch(e.target.value);
                    setShowGlobalSearchSuggestions(true);
                  }}
                  onFocus={() => setShowGlobalSearchSuggestions(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && globalSearch.trim()) {
                      setShowGlobalSearchSuggestions(false);
                      router.push(`/chat/search?q=${encodeURIComponent(globalSearch.trim())}`);
                    }
                  }}
                  placeholder={t(language, 'chatSearchGlobal')}
                  className="h-full w-full bg-transparent px-3 text-base lg:text-sm outline-none border-none focus:ring-0 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                />

                <div className="flex items-center gap-0.5 pr-1 shrink-0 border-l border-zinc-200 dark:border-zinc-800 ml-1">
                  <button
                    onClick={async () => {
                      // Try ML Kit native scanner directly (one tap → camera)
                      let mlkitAvailable = false;
                      try {
                        const { BarcodeScanner, BarcodeFormat } = await import('@capacitor-mlkit/barcode-scanning');
                        mlkitAvailable = true;
                        const permStatus = await BarcodeScanner.checkPermissions();
                        if (permStatus.camera !== 'granted') {
                          const reqResult = await BarcodeScanner.requestPermissions();
                          if (reqResult.camera !== 'granted') return;
                        }
                        const result = await BarcodeScanner.scan({ formats: [BarcodeFormat.QrCode] });
                        if (result.barcodes.length > 0 && result.barcodes[0].rawValue) {
                          void handleQrDetected(result.barcodes[0].rawValue);
                        }
                        // User cancelled or no QR found — just return, don't show modal
                        return;
                      } catch (err) {
                        if (mlkitAvailable) {
                          // ML Kit exists but scan was cancelled/failed — just return silently
                          console.log('QR scan cancelled or failed:', err);
                          return;
                        }
                        // ML Kit not available (browser) — open modal fallback
                      }
                      setIsQrScannerOpen(true);
                      setQrScanResult('idle');
                      setQrScanMessage('');
                    }}
                    className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors text-zinc-500 hover:text-sky-600"
                    title={t(language, 'chatScanQR' as any) || 'Quét mã QR'}
                  >
                    <QrCode className="h-4 w-4" />
                  </button>

                  <div className="relative" ref={createMenuRef}>
                    <button
                      onClick={() => setIsCreateMenuOpen(!isCreateMenuOpen)}
                      className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors text-zinc-500 hover:text-sky-600"
                      title={t(language, 'chatCreateDirect')}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    {isCreateMenuOpen && (
                      <div className="absolute right-0 top-full z-[110] mt-1 w-44 origin-top-right rounded-xl border border-zinc-100 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950 p-1.5 ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-100">
                        <button
                          onClick={() => {
                            setIsCreateMenuOpen(false);
                            setIsChannelModalOpen(true);
                          }}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                            "text-zinc-700 hover:bg-sky-50 hover:text-sky-700 dark:text-zinc-300 dark:hover:bg-sky-900/20 dark:hover:text-sky-400"
                          )}
                        >
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-zinc-100 dark:bg-zinc-800 group-hover:bg-sky-100 dark:group-hover:bg-sky-900/30">
                            <Users className="h-4 w-4" />
                          </div>
                          {t(language, 'chatCreateChannel')}
                        </button>
                        <button
                          onClick={() => {
                            setIsCreateMenuOpen(false);
                            setIsGroupModalOpen(true);
                          }}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                            "text-zinc-700 hover:bg-sky-50 hover:text-sky-700 dark:text-zinc-300 dark:hover:bg-sky-900/20 dark:hover:text-sky-400"
                          )}
                        >
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-zinc-100 dark:bg-zinc-800 group-hover:bg-sky-100 dark:group-hover:bg-sky-900/30">
                            <Hash className="h-4 w-4" />
                          </div>
                          {t(language, 'chatCreateGroup')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {showGlobalSearchSuggestions && globalSearchResults.length > 0 && (
                <div className="absolute top-full left-0 z-[100] mt-1 w-[calc(100%+40px)] -ml-5 overflow-hidden rounded-xl border border-zinc-100 bg-white shadow-2xl dark:border-zinc-800 dark:bg-[#0f1726]">
                  <div className="max-h-[70vh] overflow-y-auto py-1.5">
                    {globalSearchResults.map((result: any) => {
                      // Determine identity status regardless of result.type (dm, group, contact, user)
                      const targetId = result.phone || result.username || (result.type === 'user' ? result.id : null);
                      const currentIsFriend = result.type === 'contact' || contacts.some(f =>
                        (f.phone && (f.phone === normalizePhoneNumber(result.phone || '') || f.phone === result.username)) ||
                        (f.userId && f.userId === result.id)
                      );
                      const currentIsSent = rooms.some(r => r.type === 'dm' && r.friendship?.status === 'pending' && r.friendship?.requester === currentUser?.id && r.members.some(m => m.id === result.id));
                      const currentIsNewUser = result.type === 'user' || (!currentIsFriend && result.type === 'dm');

                      const content = (
                        <div className="flex items-center gap-3 px-3 py-2 w-full text-left">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/30 font-bold overflow-hidden shadow-sm">
                            {(currentIsFriend || currentIsNewUser) ? (
                              result.avatarUrl ? <Image src={result.avatarUrl} alt="" width={40} height={40} className="h-full w-full object-cover" /> : <UserRound className="h-5 w-5" />
                            ) :
                              result.type === 'dm' ? result.name.charAt(0).toUpperCase() :
                                <Hash className="h-5 w-5" />}
                          </div>
                          <div className="flex-1 flex flex-col min-w-0">
                            <span className="truncate text-[13px] font-bold text-zinc-900 dark:text-zinc-100">
                              {result.type === 'group' && result.channelId
                                ? `${rooms.find(r => r.id === result.channelId)?.name || '...'} - ${result.name}`
                                : result.name}
                            </span>
                            <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                              {currentIsFriend ? 'Bạn bè' : currentIsSent ? 'Đã gửi lời mời' : (currentIsNewUser && result.type !== 'dm') ? 'Người lạ (Matrix)' : result.type}
                              {result.phone && ` • ${result.phone}`}
                            </span>
                          </div>

                          {(currentIsFriend || currentIsNewUser || result.type === 'dm') && (
                            <div className="flex gap-1 shrink-0">
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setShowGlobalSearchSuggestions(false);
                                  if (currentIsFriend || result.type === 'contact') handleDirectChatFromContact(result.name, result.phone);
                                  else handleDirectChat(result.id);
                                }}
                                className="h-8 w-8 flex items-center justify-center rounded-lg bg-sky-600 text-white hover:bg-sky-700 shadow-sm transition-colors"
                                title="Gửi tin nhắn"
                              >
                                <MessageSquare className="h-4 w-4" />
                              </button>
                              {currentIsNewUser && !currentIsFriend && !currentIsSent && (
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const phoneOrId = result.username || result.phone || result.id;
                                    const mxid = result.id.startsWith('@') ? result.id : `@u${matrixService.normalizePhone(phoneOrId).replace(/\D/g, '')}:${process.env.NEXT_PUBLIC_MATRIX_SERVER_NAME || 'localhost'}`;
                                    void (useMatrixStore.getState().sendFriendRequest(mxid));
                                    alert('Đã gửi yêu cầu kết bạn!');
                                  }}
                                  className="h-8 w-8 flex items-center justify-center rounded-lg bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50 shadow-sm transition-all"
                                  title="Thêm bạn"
                                >
                                  <UserPlus className="h-4 w-4" />
                                </button>
                              )}
                              {currentIsSent && !currentIsFriend && (
                                <div
                                  className="h-8 px-2 flex items-center justify-center rounded-lg bg-zinc-50 border border-zinc-100 text-zinc-400 text-[10px] font-medium"
                                  title="Chờ đồng ý"
                                >
                                  Đã gửi
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );

                      if (currentIsFriend || currentIsNewUser) {
                        return (
                          <div key={result.id} className="hover:bg-zinc-50 dark:hover:bg-sky-900/10 transition-colors">
                            {content}
                          </div>
                        );
                      }

                      return (
                        <Link
                          key={result.id}
                          href={`/chat/${encodeURIComponent(result.id)}`}
                          onClick={() => setShowGlobalSearchSuggestions(false)}
                          className="block hover:bg-zinc-50 dark:hover:bg-sky-900/10 transition-colors"
                        >
                          {content}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto px-1">
          {error && <p className="m-3 p-2 text-xs text-red-500 bg-red-50 rounded-lg">{error}</p>}

          {activeSection === 'personal' && (
            <div className="space-y-0.5 pt-2">
              {recentChats.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 text-zinc-400">
                  <MessageSquare className="h-10 w-10 mb-2 opacity-20" />
                  <p className="text-xs">{t(language, 'chatNoMessages')}</p>
                </div>
              )}
              {personalChats.map((room) => (
                <div key={room.id} className="group relative mx-1">
                  <Link
                    href={`/chat/${encodeURIComponent(room.id)}`}
                    className={cn(
                      'flex items-center gap-3 rounded-xl py-2.5 px-3 transition-all',
                      room.id === activeRoomId
                        ? 'bg-sky-50 dark:bg-sky-900/10'
                        : 'hover:bg-[#f0f2f5] dark:hover:bg-zinc-800/50',
                      pinnedRoomIds.includes(room.id) && 'border-l-2 border-sky-500'
                    )}
                  >
                    <div className="relative h-14 w-14 lg:h-12 lg:w-12 shrink-0">
                      <div className="flex h-full w-full items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/30 font-bold text-xl lg:text-lg">
                        {room.name.charAt(0).toUpperCase()}
                      </div>
                      {room.type === 'dm' ? (
                        (() => {
                          const otherMember = room.members.find(m => m.id !== currentUser?.id);
                          const status = otherMember?.status || 'offline';
                          if (status === 'offline') return null;
                          return (
                            <div className={cn(
                              "absolute bottom-0 right-0 h-3.5 w-3.5 lg:h-3 lg:w-3 rounded-full border-2 border-white dark:border-zinc-900",
                              status === 'online' ? "bg-emerald-500" : "bg-amber-500"
                            )} />
                          );
                        })()
                      ) : (
                        <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-zinc-100 dark:border-zinc-900 dark:bg-zinc-800 text-zinc-500">
                          <Users className="h-3 w-3" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className={cn(
                          "truncate text-[15px] lg:text-[13px] font-semibold transition-colors",
                          room.unreadCount > 0 ? "text-zinc-900 dark:text-zinc-50" : "text-zinc-700 dark:text-zinc-200"
                        )}>
                          {room.name}
                        </span>
                        <span className="shrink-0 text-xs lg:text-[10px] text-zinc-400 font-medium ml-2">
                          {(() => {
                            if (!room.lastMessage) return '';
                            const date = new Date(room.lastMessage.timestamp);
                            const now = new Date();
                            const isToday = date.toDateString() === now.toDateString();
                            const isThisYear = date.getFullYear() === now.getFullYear();
                            if (isToday) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                            if (isThisYear) return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;
                            return date.toLocaleDateString([], { year: '2-digit', month: '2-digit', day: '2-digit' });
                          })()}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-[13px] lg:text-[11px] text-zinc-500 dark:text-zinc-400 mb-1 h-5 lg:h-4 overflow-hidden">
                        {room.type !== 'dm' ? (
                          <>
                            {room.channelId && (
                              <span className="truncate max-w-[100px] text-sky-600 dark:text-sky-400 font-medium shrink-0">
                                {rooms.find(r => r.id === room.channelId)?.name || '...'}
                                <span className="mx-1 text-zinc-300 dark:text-zinc-700 items-center inline-flex">•</span>
                              </span>
                            )}
                            <span className="truncate shrink-0">
                              {room.members?.length || 0} {t(language, 'chatMembers')}
                            </span>
                          </>
                        ) : (
                          <span className="text-zinc-400 italic shrink-0 font-medium">{t(language, 'chatPersonal')}</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={cn(
                          "truncate text-[13px] lg:text-xs pr-2",
                          room.unreadCount > 0
                            ? "font-bold text-sky-600 dark:text-sky-400"
                            : "text-zinc-500 dark:text-zinc-400"
                        )}>
                          {room.lastMessage ? (
                            <>
                              <span className="font-semibold mr-1">
                                {room.lastMessage.senderId === currentUser?.id
                                  ? `${t(language, 'chatYou')}:`
                                  : `${room.members.find(m => m.id === room.lastMessage?.senderId)?.displayName || room.members.find(m => m.id === room.lastMessage?.senderId)?.username || t(language, 'chatSomeone')}:`
                                }
                              </span>
                              {room.lastMessage.content}
                            </>
                          ) : (
                            t(language, 'chatNoMessages')
                          )}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          {pinnedRoomIds.includes(room.id) && (
                            <Pin className="h-3 w-3 text-sky-500" />
                          )}
                          {room.unreadCount > 0 && (
                            <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                              {room.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>

                  <div className="absolute right-2 top-2 z-10 hidden group-hover:block">
                    <div className="relative inline-block text-left">
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow-sm hover:bg-white dark:bg-zinc-800/90 dark:hover:bg-zinc-800 text-zinc-500 hover:text-sky-500 transition-all border border-zinc-100 dark:border-zinc-800"
                        onMouseEnter={(e) => {
                          const menu = e.currentTarget.nextElementSibling;
                          if (menu) menu.classList.remove('hidden');
                        }}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>

                      <div
                        className="absolute right-0 mt-1 hidden w-36 overflow-hidden rounded-lg border border-zinc-100 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900 group-hover:block-on-child-hover"
                        onMouseLeave={(e) => e.currentTarget.classList.add('hidden')}
                      >
                        <button
                          onClick={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (confirm(t(language, 'chatDelete') + '?')) {
                              await deleteRoom(room.id);
                            }
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {t(language, 'chatDelete')}
                        </button>

                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            addAssistantRoom(room.id);
                            void matrixService.markRoomAsAssistant(room.id);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-xs text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-900/20"
                        >
                          <Bot className="h-3.5 w-3.5" />
                          Chuyển vào Trợ lý
                        </button>

                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setMovingRoomId(room.id);
                            setIsMoveModalOpen(true);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800/50"
                        >
                          <Users className="h-3.5 w-3.5" />
                          {t(language, 'chatAddToGroup')}
                        </button>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      togglePinRoom(room.id);
                    }}
                    className="absolute right-2 bottom-2 hidden group-hover:flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow-sm hover:bg-white dark:bg-zinc-800/90 dark:hover:bg-zinc-800 text-zinc-400 hover:text-sky-500 transition-all border border-zinc-100 dark:border-zinc-800"
                    title={pinnedRoomIds.includes(room.id) ? t(language, 'chatUnpin') : t(language, 'chatPin')}
                  >
                    {pinnedRoomIds.includes(room.id) ? (
                      <PinOff className="h-3.5 w-3.5 text-sky-500" />
                    ) : (
                      <Pin className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              ))}

              {messageRequests.length > 0 && (
                <div className="mt-4 px-2">
                  <button
                    onClick={() => setIsMessageRequestsOpen(!isMessageRequestsOpen)}
                    className="flex w-full items-center justify-between rounded-xl bg-amber-50/50 p-3 text-left transition-all hover:bg-amber-50 dark:bg-amber-900/10 dark:hover:bg-amber-900/20 border border-amber-100/50 dark:border-amber-900/30"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                        <MessageSquareWarning className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-amber-900 dark:text-amber-100">{t(language, 'chatMessageRequests' as any)}</p>
                        <p className="text-[10px] text-amber-600/70 dark:text-amber-400/70">{messageRequests.length} {t(language, 'chatOther' as any)}</p>
                      </div>
                    </div>
                    {isMessageRequestsOpen ? <ChevronDown className="h-4 w-4 text-amber-600" /> : <ChevronRight className="h-4 w-4 text-amber-600" />}
                  </button>

                  {isMessageRequestsOpen && (
                    <div className="mt-2 space-y-1 pl-1 border-l border-amber-100 dark:border-amber-900/30 animate-in slide-in-from-top-1 duration-200">
                      {messageRequests.map(room => {
                        const otherMember = room.members.find(m => m.id !== currentUser?.id);
                        const displayName = otherMember?.displayName || otherMember?.username || room.name;
                        return (
                          <div
                            key={room.id}
                            className={cn(
                              "flex items-center gap-3 p-2 rounded-xl transition-all",
                              room.id === activeRoomId ? "bg-amber-100/30" : "hover:bg-gray-50 dark:hover:bg-zinc-900/20"
                            )}
                          >
                            <Link
                              href={`/chat/${encodeURIComponent(room.id)}`}
                              className="flex items-center gap-3 flex-1 min-w-0"
                            >
                              <div className="h-9 w-9 shrink-0 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 font-bold text-sm dark:bg-amber-900/30 dark:text-amber-400">
                                {displayName.charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">{displayName}</p>
                                <p className="truncate text-[10px] text-zinc-500">{room.lastMessage?.content || t(language, 'chatNoMessages')}</p>
                              </div>
                            </Link>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={async (e) => { e.stopPropagation(); await acceptFriendRequest(room.id); }}
                                className="h-7 w-7 rounded-full bg-emerald-100 text-emerald-600 hover:bg-emerald-200 flex items-center justify-center transition-colors dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50"
                                title={t(language, 'chatAcceptFriend')}
                              >
                                <UserPlus className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={async (e) => { e.stopPropagation(); await declineFriendRequest(room.id); }}
                                className="h-7 w-7 rounded-full bg-rose-100 text-rose-600 hover:bg-rose-200 flex items-center justify-center transition-colors dark:bg-rose-900/30 dark:text-rose-400 dark:hover:bg-rose-900/50"
                                title={t(language, 'chatRejectFriend')}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
          }

          {
            activeSection === 'channels' && (
              <div className="space-y-4 pt-3 px-2">
                {groupedChannels.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-10 text-zinc-400">
                    <Users className="h-10 w-10 mb-2 opacity-20" />
                    <p className="text-xs">{t(language, 'chatNoChannels')}</p>
                  </div>
                )}
                {groupedChannels.map((channel) => (
                  <div key={channel.channel.id} className="rounded-xl border border-zinc-100 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900/50 shadow-sm">
                    <div className="mb-2 flex flex-col gap-1">
                      <Link
                        href={`/chat/${encodeURIComponent(channel.channel.id)}`}
                        className="flex min-w-0 flex-1 items-center justify-between rounded-md px-2 py-1.5 bg-sky-50/50 dark:bg-sky-900/10 hover:bg-sky-100 transition-colors"
                      >
                        <span className="truncate text-sm font-bold text-sky-700 dark:text-sky-300">{channel.channel.name}</span>
                        <div className="flex shrink-0 items-center gap-2">
                          {channel.channel.unreadCount > 0 && (
                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                              {channel.channel.unreadCount}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-white px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-200">
                            <Crown className="h-3 w-3" />
                            {t(language, 'chatChannel')}
                          </span>
                        </div>
                      </Link>
                      {(channel.channel.channelRoles[currentUser?.id || ''] === 'leader' || channel.channel.channelRoles[currentUser?.id || ''] === 'deputy') && (
                        <button
                          type="button"
                          onClick={() => handleOpenCreateGroupModal(channel.channel.id)}
                          className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-sky-200 py-1.5 text-xs font-semibold text-sky-600 hover:bg-sky-50 dark:border-sky-900/40 dark:text-sky-400 dark:hover:bg-sky-900/20 transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          {t(language, 'chatCreateNewGroup')}
                        </button>
                      )}
                    </div>
                    <div className="space-y-1">
                      {channel.groups.map((group) => {
                        const myRole = group.groupRoles[currentUser?.id || ''] || 'member';
                        return (
                          <Link
                            key={group.id}
                            href={`/chat/${encodeURIComponent(group.id)}`}
                            className={cn(
                              "flex items-center gap-3 p-2.5 rounded-lg transition-all",
                              group.id === activeRoomId
                                ? "bg-sky-100/50 dark:bg-sky-900/20"
                                : "hover:bg-gray-50 dark:hover:bg-zinc-800/50"
                            )}
                          >
                            <div className="h-9 w-9 shrink-0 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
                              {group.isDefaultGroup ? <ShieldCheck className="h-5 w-5" /> : <Hash className="h-5 w-5" />}
                            </div>
                            <div className="flex-1 min-w-0 flex items-center justify-between">
                              <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">{group.name}</span>
                                  {myRole === 'leader' && <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                                  {(myRole === 'member' && (channel.channel.channelRoles[currentUser?.id || ''] === 'leader')) && (
                                    <button
                                      onClick={async (e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        await joinRoom(group.id);
                                      }}
                                      className="ml-auto rounded-md bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-600 hover:bg-sky-100 dark:bg-sky-900/40 dark:text-sky-400"
                                    >
                                      {t(language, 'chatJoin')}
                                    </button>
                                  )}
                                  {myRole === 'deputy' && <Shield className="h-3.5 w-3.5 text-sky-500 shrink-0" />}
                                </div>
                              </div>
                              {group.unreadCount > 0 && (
                                <span className="bg-red-500 text-white text-[10px] rounded-full h-4 min-w-[16px] flex items-center justify-center font-bold px-1">
                                  {group.unreadCount}
                                </span>
                              )}
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )
          }

          {
            activeSection === 'contacts' && (
              <div className="space-y-4 pt-2">
                {/* Incoming Requests Section */}
                {incomingFriendRequests.length > 0 && (
                  <div className="px-2 space-y-2">
                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 px-2">{t(language, 'chatIncomingRequests')}</h3>
                    {incomingFriendRequests.map(req => (
                      <div key={req.id} className="flex items-center justify-between p-3 rounded-2xl bg-sky-50/50 dark:bg-sky-900/10 border border-sky-100/50 dark:border-sky-900/20">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-10 w-10 shrink-0 rounded-full bg-sky-200 flex items-center justify-center text-sky-700 font-bold">
                            {req.displayName.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">{req.displayName}</span>
                            <span className="text-[10px] text-zinc-500">{req.phone}</span>
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={() => {
                              void (useMatrixStore.getState().acceptFriendRequest(req.id));
                            }}
                            className="p-1.5 rounded-lg bg-sky-600 text-white hover:bg-sky-700 shadow-sm transition-colors"
                            title={t(language, 'chatAcceptFriend')}
                          >
                            <UserCheck className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => {
                              // Rejecting is basically leaving for now
                              void (useMatrixStore.getState().deleteRoom(req.id));
                            }}
                            className="p-1.5 rounded-lg bg-white border border-zinc-200 text-zinc-500 hover:bg-red-50 hover:text-red-500 shadow-sm transition-colors"
                            title={t(language, 'chatRejectFriend')}
                          >
                            <UserX className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-1">
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 px-4 mb-2">{t(language, 'chatTabContacts')}</h3>
                  {contacts.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-10 text-zinc-400">
                      <BookUser className="h-10 w-10 mb-2 opacity-20" />
                      <p className="text-xs">{t(language, 'chatNoContacts')}</p>
                    </div>
                  )}
                  {contacts.map(contact => (
                    <div key={contact.userId} className="flex items-center justify-between p-3 rounded-lg mx-1 hover:bg-gray-50 dark:hover:bg-zinc-900/40 group">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 shrink-0 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400 font-bold">
                          {contact.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{contact.displayName}</span>
                          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">{contact.phone}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleDirectChatFromContact(contact.displayName, contact.phone)}
                          className="text-sky-600 hover:text-sky-700 text-xs font-bold px-2 py-1 rounded-md hover:bg-sky-50 transition-colors"
                        >
                          {t(language, 'chatStartChat')}
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Hủy kết bạn với ${contact.displayName}?`)) {
                              void unfriend(contact.id);
                            }
                          }}
                          className="text-rose-500 hover:text-rose-600 text-xs font-bold px-2 py-1 rounded-md hover:bg-rose-50 transition-colors"
                          title="Hủy kết bạn"
                        >
                          <UserX className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          }

          {
            activeSection === 'assistants' && (
              <div className="space-y-3 pt-4 px-3">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">Trợ lý PiePie</h3>
                </div>

                {/* "Tôi" - Self note conversation — always visible */}
                <button
                  onClick={() => {
                    // Create or navigate to self-chat room
                    const selfRoomId = 'self-note';
                    router.push(`/chat/${selfRoomId}`);
                  }}
                  className="group flex w-full items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 text-left transition-all hover:border-emerald-200 hover:shadow-md dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:hover:border-emerald-800"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/30 shadow-sm text-lg">
                    📌
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">{currentUser?.displayName || currentUser?.username || 'Me'}</span>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">{t(language, 'assistantNotes' as any)}</span>
                    </div>
                    <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">{t(language, 'assistantNotesDesc' as any)}</p>
                  </div>
                </button>

                {/* Manage Assistants Button */}
                <button
                  onClick={() => openAssistantModal()}
                  className="flex w-full items-center justify-between rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900/60 p-3 text-left hover:border-sky-300 hover:shadow-sm dark:hover:border-sky-800 transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 dark:bg-sky-900/20">
                      <Bot className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                    </div>
                    <div>
                      <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{t(language, 'assistantManage' as any)}</span>
                      <p className="text-[10px] text-zinc-400">{configuredAssistants.length} {language === 'vi' ? 'trợ lý đã cấu hình' : 'configured'}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-zinc-300 group-hover:text-sky-500 transition-colors" />
                </button>

                {/* Separator */}
                <div className="flex items-center gap-2 pt-2">
                  <div className="h-px flex-1 bg-zinc-100 dark:bg-zinc-800" />
                  <span className="text-[10px] font-semibold text-zinc-400 uppercase">{t(language, 'assistantConversations' as any)}</span>
                  <div className="h-px flex-1 bg-zinc-100 dark:bg-zinc-800" />
                </div>

                {/* Assistant conversations — rooms that contain bot members */}
                <div className="space-y-1.5">
                  {assistantRooms.length > 0 ? (
                    assistantRooms.map((room) => (
                      <button
                        key={room.id}
                        onClick={() => {
                          router.push(`/chat/${encodeURIComponent(room.id)}`);
                          setIsSidebarOpen(false);
                        }}
                        className={cn(
                          "group flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all",
                          activeRoomId === room.id
                            ? "border-sky-200 bg-sky-50/80 dark:border-sky-800 dark:bg-sky-950/30"
                            : "border-zinc-100 bg-white hover:border-sky-200 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-sky-800"
                        )}
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 dark:bg-sky-900/20 text-lg">
                          🤖
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{room.name}</span>
                            {room.unreadCount > 0 && (
                              <span className="ml-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-sky-500 px-1.5 text-[10px] font-bold text-white">{room.unreadCount}</span>
                            )}
                          </div>
                          <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                            {room.lastMessage?.content || 'Chưa có tin nhắn'}
                          </p>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/30 p-4 text-center">
                      <p className="text-xs text-zinc-400 dark:text-zinc-500">
                        Chưa có hội thoại nào với trợ lý
                      </p>
                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1">
                        Tạo hội thoại mới và mời trợ lý vào để bắt đầu
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )
          }
        </div >
      </aside >

      <main className={cn(
        "relative flex min-w-0 min-h-0 flex-1 flex-col bg-zinc-50 dark:bg-zinc-900/20",
        activeRoomId ? "flex" : "hidden lg:flex"
      )}>
        <div className="flex-1 overflow-hidden flex flex-col relative min-h-0">
          {children}
        </div>
      </main>

      {
        isChannelModalOpen && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-sky-100 bg-white p-6 shadow-2xl dark:border-sky-900/40 dark:bg-[#0f1726]">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t(language, 'chatCreateChannel')}</h3>
                <button type="button" onClick={handleCloseCreateChannelModal} className="rounded-md p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-4">
                <input
                  value={channelName}
                  onChange={(event) => setChannelName(event.target.value)}
                  placeholder={t(language, 'chatRoomName')}
                  className="h-9 w-full rounded-md border border-sky-100 bg-white px-3 text-sm outline-none focus:border-sky-500 dark:border-sky-900/40 dark:bg-zinc-900 dark:text-zinc-100"
                />
                <input
                  value={channelTopic}
                  onChange={(event) => setChannelTopic(event.target.value)}
                  placeholder={t(language, 'chatRoomTopic')}
                  className="h-9 w-full rounded-md border border-sky-100 bg-white px-3 text-sm outline-none focus:border-sky-500 dark:border-sky-900/40 dark:bg-zinc-900 dark:text-zinc-100"
                />
                <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={channelIsPublic}
                    onChange={(event) => setChannelIsPublic(event.target.checked)}
                  />
                  {t(language, 'chatPublicChannel')}
                </label>
                <input
                  value={channelMemberQuery}
                  onChange={(event) => setChannelMemberQuery(event.target.value)}
                  placeholder={t(language, 'chatInviteByName')}
                  className="h-9 w-full rounded-md border border-sky-100 bg-white px-3 text-sm outline-none focus:border-sky-500 dark:border-sky-900/40 dark:bg-zinc-900 dark:text-zinc-100"
                />
                {channelSuggestions.length > 0 && (
                  <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-sky-100 bg-white p-1 dark:border-sky-900/40 dark:bg-zinc-900 shadow-inner">
                    {channelSuggestions.map((candidate) => (
                      <button
                        key={candidate.userId}
                        type="button"
                        onClick={() => addSelectedMember(candidate, channelMembers, setChannelMembers)}
                        className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-sky-50 dark:hover:bg-sky-900/20"
                      >
                        <span className="truncate">{candidate.displayName}</span>
                        <span className="truncate text-[10px] text-zinc-500 dark:text-zinc-400">@{candidate.username}</span>
                      </button>
                    ))}
                  </div>
                )}
                {channelMembers.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {channelMembers.map((member) => (
                      <button
                        key={member.userId}
                        type="button"
                        onClick={() => removeSelectedMember(member.userId, channelMembers, setChannelMembers)}
                        className="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300"
                      >
                        {member.displayName} ×
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCloseCreateChannelModal}
                  className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  {t(language, 'chatCancel')}
                </button>
                <button
                  type="button"
                  onClick={handleCreateChannel}
                  className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700 dark:bg-sky-500"
                >
                  {t(language, 'chatCreateAction')}
                </button>
              </div>
            </div>
          </div>
        )
      }

      {
        isGroupModalOpen && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-sky-100 bg-white p-6 shadow-2xl dark:border-sky-900/40 dark:bg-[#0f1726]">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t(language, 'chatCreateGroup')}</h3>
                <button type="button" onClick={handleCloseCreateGroupModal} className="rounded-md p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-4">
                <input
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                  placeholder={t(language, 'chatRoomName')}
                  className="h-9 w-full rounded-md border border-sky-100 bg-white px-3 text-sm outline-none focus:border-sky-500 dark:border-sky-900/40 dark:bg-zinc-900 dark:text-zinc-100"
                />
                <select
                  value={groupChannelId}
                  onChange={(event) => setGroupChannelId(event.target.value)}
                  className="h-9 w-full rounded-md border border-sky-100 bg-white px-3 text-sm outline-none focus:border-sky-500 dark:border-sky-900/40 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  <option value="">{t(language, 'chatStandalone')}</option>
                  {channelRooms.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.name}
                    </option>
                  ))}
                </select>
                <input
                  value={groupMemberQuery}
                  onChange={(event) => setGroupMemberQuery(event.target.value)}
                  placeholder={t(language, 'chatInviteByName')}
                  className="h-9 w-full rounded-md border border-sky-100 bg-white px-3 text-sm outline-none focus:border-sky-500 dark:border-sky-900/40 dark:bg-zinc-900 dark:text-zinc-100"
                />
                {groupSuggestions.length > 0 && (
                  <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-sky-100 bg-white p-1 dark:border-sky-900/40 dark:bg-zinc-900 shadow-inner">
                    {groupSuggestions.map((candidate) => (
                      <button
                        key={candidate.userId}
                        type="button"
                        onClick={() => addSelectedMember(candidate, groupMembers, setGroupMembers)}
                        className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-sky-50 dark:hover:bg-sky-900/20"
                      >
                        <span className="truncate">{candidate.displayName}</span>
                        <span className="truncate text-[10px] text-zinc-500 dark:text-zinc-400">@{candidate.username}</span>
                      </button>
                    ))}
                  </div>
                )}
                {groupMembers.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {groupMembers.map((member) => (
                      <button
                        key={member.userId}
                        type="button"
                        onClick={() => removeSelectedMember(member.userId, groupMembers, setGroupMembers)}
                        className="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300"
                      >
                        {member.displayName} ×
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCloseCreateGroupModal}
                  className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  {t(language, 'chatCancel')}
                </button>
                <button
                  type="button"
                  onClick={handleCreateGroup}
                  className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700 dark:bg-sky-500"
                >
                  {t(language, 'chatCreateAction')}
                </button>
              </div>
            </div>
          </div>
        )
      }
      {
        isDirectModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-sky-100 bg-white p-6 shadow-2xl dark:border-sky-900/40 dark:bg-[#0f1726]">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t(language, 'chatPersonal')}</h3>
                <button type="button" onClick={handleCloseDirectModal} className="rounded-md p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
                    {dmLookupLoading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" /> : <Search className="h-4 w-4" />}
                  </div>
                  <input
                    value={dmQuery}
                    onChange={(e) => setDmQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && dmQuery.trim()) {
                        void handleDirectChatFromContact(dmQuery.trim(), dmQuery.trim());
                        handleCloseDirectModal();
                      }
                    }}
                    placeholder={t(language, 'chatSearchByName')}
                    className="h-10 w-full rounded-xl border border-sky-100 bg-white pl-10 pr-4 text-sm outline-none focus:border-sky-500 dark:border-sky-900/40 dark:bg-zinc-900 dark:text-zinc-100"
                    autoFocus
                  />

                  {dmSuggestions.length > 0 && (
                    <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-sky-100 bg-white p-1 dark:border-sky-900/40 dark:bg-zinc-900 shadow-xl">
                      {dmSuggestions.map((candidate) => (
                        <button
                          key={candidate.userId}
                          type="button"
                          onClick={() => {
                            void handleDirectChat(candidate.userId);
                            handleCloseDirectModal();
                          }}
                          className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs hover:bg-sky-50 dark:hover:bg-sky-900/20"
                        >
                          <div className="flex flex-col">
                            <span className="font-semibold text-zinc-900 dark:text-zinc-100">{candidate.displayName}</span>
                            <span className="text-[10px] text-zinc-500">@{candidate.username}</span>
                          </div>
                          <Plus className="h-4 w-4 text-sky-600" />
                        </button>
                      ))}
                    </div>
                  )}

                  {dmQuery.trim().length > 3 && (
                    <div className="mt-2 flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void handleDirectChatFromContact(dmQuery.trim(), dmQuery.trim());
                          handleCloseDirectModal();
                        }}
                        className="flex w-full items-center gap-3 rounded-xl border border-dashed border-sky-200 p-3 text-left text-xs text-sky-600 hover:bg-sky-50 dark:border-sky-900/40 dark:hover:bg-sky-900/20 transition-all"
                      >
                        <MessageCircle className="h-4 w-4" />
                        <div>
                          <p className="font-bold">Nhắn tin cho: {dmQuery.trim()}</p>
                          <p className="text-[10px] opacity-60 italic">Bắt đầu chat ngay (Sẽ vào mục Tin nhắn chờ)</p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={async () => {
                          const digits = matrixService.normalizePhone(dmQuery.trim()).replace(/\D/g, '');
                          const matrixDomain = process.env.NEXT_PUBLIC_MATRIX_SERVER_NAME || 'localhost';
                          const targetUserId = `@u${digits}:${matrixDomain}`;
                          const ok = await (useMatrixStore.getState().sendFriendRequest(targetUserId));
                          if (ok) {
                            alert('Đã gửi yêu cầu kết bạn!');
                            handleCloseDirectModal();
                          }
                        }}
                        className="flex w-full items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-left text-xs text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300 transition-all shadow-sm"
                      >
                        <UserPlus className="h-4 w-4" />
                        <div>
                          <p className="font-bold">Gửi lời mời kết bạn</p>
                          <p className="text-[10px] opacity-60 italic">Yêu cầu người này vào danh bạ của bạn</p>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      }
      <CallOverlay />
      <AssistantManagerModal />

      {/* QR Scanner Modal */}
      {isQrScannerOpen && (
        <div className="fixed inset-0 z-[200] flex flex-col bg-black">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-black/80 text-white" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0.75rem))' }}>
            <h3 className="text-base font-bold flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              Quét mã QR đăng nhập
            </h3>
            <button
              onClick={() => {
                stopQrScanner();
                setIsQrScannerOpen(false);
              }}
              className="rounded-full p-2 hover:bg-white/10 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 flex flex-col items-center justify-center p-4 gap-6">
            {qrScanResult === 'success' ? (
              <div className="flex flex-col items-center gap-4 text-white">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20 ring-2 ring-emerald-400">
                  <CheckCircle className="h-10 w-10 text-emerald-400" />
                </div>
                <p className="text-xl font-bold text-emerald-400">{qrScanMessage}</p>
                <p className="text-sm text-zinc-400">Máy tính sẽ tự động đăng nhập</p>
                <button
                  onClick={() => {
                    setIsQrScannerOpen(false);
                    stopQrScanner();
                  }}
                  className="mt-4 rounded-xl bg-white/10 px-6 py-3 text-sm font-semibold text-white hover:bg-white/20 transition-colors"
                >
                  Đóng
                </button>
              </div>
            ) : qrScanResult === 'error' ? (
              <div className="flex flex-col items-center gap-4 text-white">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-rose-500/20 ring-2 ring-rose-400">
                  <X className="h-10 w-10 text-rose-400" />
                </div>
                <p className="text-lg font-bold text-rose-400">{qrScanMessage}</p>
                <button
                  onClick={() => {
                    setQrScanResult('idle');
                    setQrScanMessage('');
                  }}
                  className="mt-4 rounded-xl bg-sky-600 px-6 py-3 text-sm font-semibold text-white hover:bg-sky-700 transition-colors"
                >
                  Thử lại
                </button>
              </div>
            ) : qrScanResult === 'scanning' ? (
              <>
                <div className="relative w-full max-w-[320px] aspect-square overflow-hidden rounded-2xl border-2 border-white/20 bg-zinc-900">
                  <video ref={qrVideoRef} className="h-full w-full object-cover" playsInline muted />
                  {/* Scanning frame overlay */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="h-52 w-52 rounded-2xl border-2 border-sky-400/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]" />
                  </div>
                  {/* Scan line animation */}
                  <div className="absolute left-1/2 -translate-x-1/2 h-0.5 w-48 bg-gradient-to-r from-transparent via-sky-400 to-transparent animate-pulse" style={{ top: '40%' }} />
                </div>
                {qrScanMessage && (
                  <p className="text-sm text-amber-400">{qrScanMessage}</p>
                )}
                <p className="text-sm text-zinc-400">Hướng camera vào mã QR trên màn hình máy tính</p>
                <button
                  onClick={() => {
                    stopQrScanner();
                    setQrScanResult('idle');
                  }}
                  className="rounded-xl bg-white/10 px-6 py-3 text-sm font-semibold text-white hover:bg-white/20 transition-colors"
                >
                  Hủy quét
                </button>
              </>
            ) : (
              /* idle — show start button + manual fallback */
              <div className="flex flex-col items-center gap-6 text-white w-full max-w-sm">
                <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-sky-600/20 ring-2 ring-sky-400/50">
                  <Camera className="h-12 w-12 text-sky-400" />
                </div>
                <div className="text-center space-y-2">
                  <p className="text-lg font-bold">Quét mã QR để đăng nhập Web</p>
                  <p className="text-sm text-zinc-400">Mở PieChat trên máy tính, chọn đăng nhập bằng QR</p>
                </div>

                <button
                  onClick={() => void startQrScanner()}
                  className="flex items-center gap-2 rounded-xl bg-sky-600 px-8 py-3.5 text-base font-bold text-white shadow-lg shadow-sky-600/30 hover:bg-sky-700 transition-colors"
                >
                  <Camera className="h-5 w-5" />
                  Mở camera quét mã
                </button>

                {/* File capture fallback when no inline camera */}
                {!hasCameraAccess && (
                  <>
                    <input
                      ref={qrFileInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => void handleQrFileCapture(e)}
                    />
                    <button
                      onClick={() => qrFileInputRef.current?.click()}
                      className="flex items-center gap-2 rounded-xl bg-white/10 px-6 py-3 text-sm font-semibold text-white hover:bg-white/20 transition-colors"
                    >
                      <Camera className="h-4 w-4" />
                      Hoặc chụp ảnh mã QR
                    </button>
                  </>
                )}

                {/* Warning message */}
                {qrScanMessage && (
                  <p className="text-sm text-amber-400 text-center bg-amber-500/10 rounded-lg px-4 py-2">{qrScanMessage}</p>
                )}

                {/* Manual code input — always show, primary method when no camera */}
                <div className="w-full space-y-3 border-t border-white/10 pt-4">
                  <p className="text-xs text-zinc-400 text-center">
                    {!hasCameraAccess ? 'Nhập mã đăng nhập từ màn hình máy tính' : 'Hoặc nhập mã thủ công'}
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={qrManualCode}
                      onChange={(e) => setQrManualCode(e.target.value)}
                      placeholder="Dán mã QR tại đây..."
                      className="flex-1 rounded-xl bg-white/10 px-4 py-3 text-sm text-white placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-sky-500 border border-white/10"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && qrManualCode.trim()) {
                          void handleQrDetected(qrManualCode.trim());
                        }
                      }}
                    />
                    <button
                      onClick={() => {
                        if (qrManualCode.trim()) {
                          void handleQrDetected(qrManualCode.trim());
                        }
                      }}
                      disabled={!qrManualCode.trim()}
                      className="rounded-xl bg-sky-600 px-4 py-3 text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-40 transition-colors"
                    >
                      Gửi
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Move Room to Group Modal */}
      {isMoveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-zinc-100 p-4 dark:border-zinc-800">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{t(language, 'chatAddToGroup')}</h3>
              <button onClick={() => setIsMoveModalOpen(false)} className="rounded-full p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                <X className="h-4 w-4 text-zinc-500" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-2">
              {groupedChannels.length === 0 ? (
                <div className="py-10 text-center text-zinc-400">
                  <p className="text-xs">{t(language, 'chatNoChannels')}</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {groupedChannels.map((channel) => (
                    <button
                      key={channel.channel.id}
                      onClick={async () => {
                        if (movingRoomId) {
                          const success = await moveRoomToChannel(movingRoomId, channel.channel.id);
                          if (success) {
                            setIsMoveModalOpen(false);
                            setMovingRoomId(null);
                            alert('Đã chuyển hội thoại vào nhóm công ty thành công!');
                          }
                        }
                      }}
                      className="flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all hover:bg-sky-50 dark:hover:bg-sky-900/10"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-600 dark:bg-sky-900/30">
                        <Users className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{channel.channel.name}</p>
                        <p className="text-[10px] text-zinc-500">{channel.groups.length} {t(language, 'chatGroup' as any)}</p>
                      </div>
                      <Plus className="ml-auto h-4 w-4 text-sky-400" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    <NotificationPermissionBanner />
    </div >
  );
}

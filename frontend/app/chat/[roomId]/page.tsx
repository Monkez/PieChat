'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Send, Paperclip, MoreVertical, Phone, Video, Search, UserPlus, Crown, ShieldCheck, Trash2, Users, GripVertical, Shield, MessageSquare, Plus, ArrowLeft, FolderOpen, X, Check, BellOff, Bell, LogOut, Ban, Pin, Copy, Download, Eraser, ImageIcon, Wallpaper, MapPin, BarChart3, Timer } from 'lucide-react';
import { MessageBubble } from '@/components/chat/message-bubble';
import { ChatInput, type ReplyEditState } from '@/components/chat/chat-input';
import { MediaGallery } from '@/components/chat/media-gallery';
import { useMatrixStore } from '@/lib/store/matrix-store';
import { matrixService, Message, UserDirectoryAccount } from '@/lib/services/matrix-service';
import { useUiStore } from '@/lib/store/ui-store';
import type { ContactCardData } from '@/components/chat/contact-card';
import type { PollData } from '@/components/chat/poll-create-dialog';
import { PollCreateDialog } from '@/components/chat/poll-create-dialog';
import type { PollVote } from '@/components/chat/poll-card';
import { ReminderCreateDialog, type ReminderData } from '@/components/chat/reminder-create-dialog';
import { useChatNotifications, scheduleReminderNotification, schedulePollExpiryNotification, notifyNewMessages, seedNotifiedMessageIds } from '@/lib/services/chat-notification-service';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { WidgetPayload } from '@/lib/widget-sdk';
import { scheduledMessageService } from '@/lib/services/scheduled-message-service';

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = decodeURIComponent(params.roomId as string);
  const [message, setMessage] = useState('');
  const [roomSearch, setRoomSearch] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [memberQuery, setMemberQuery] = useState('');
  const [memberSuggestions, setMemberSuggestions] = useState<UserDirectoryAccount[]>([]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [activeMenuMessageId, setActiveMenuMessageId] = useState<string | null>(null);
  const [pinnedMessage, setPinnedMessage] = useState<Message | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [isGroupStatsOpen, setIsGroupStatsOpen] = useState(false);
  const [disappearingTtl, setDisappearingTtl] = useState<number | null>(null);
  const [showDisappearingDialog, setShowDisappearingDialog] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  const clearedBeforeRef = useRef<number>(0);
  const prevMessageCountRef = useRef(0);
  const lastReadEventRef = useRef<string>('');
  const lastMsgIdsRef = useRef<string>('');

  const {
    currentUser,
    rooms,
    sendMessage,
    addMemberByUserId,
    removeMember,
    updateChannelRole,
    updateGroupRole,
    updateRoomRoles,
    createGroup,
    archiveGroup,
    deleteRoom,
    updateGroupPriority,
    fetchRooms,
    sendReaction,
    toggleRestrictSpeaking,
    joinRoom,
    sendFriendRequest,
    createDirectChatByUserId,
  } = useMatrixStore();
  const { language, toggleMuteRoom, mutedRoomIds } = useUiStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [pollVotes, setPollVotes] = useState<Record<string, PollVote[]>>({});
  const [isPollDialogOpen, setIsPollDialogOpen] = useState(false);
  const [isReminderDialogOpen, setIsReminderDialogOpen] = useState(false);
  const [replyEdit, setReplyEdit] = useState<ReplyEditState | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [remotePresence, setRemotePresence] = useState<string>('offline');
  const [lastSeenText, setLastSeenText] = useState<string>('');
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [isMemberListOpen, setIsMemberListOpen] = useState(false);
  const [isBroadcastOpen, setIsBroadcastOpen] = useState(false);
  const [broadcastText, setBroadcastText] = useState('');
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [forwardSearch, setForwardSearch] = useState('');
  const [forwardTargetChannel, setForwardTargetChannel] = useState<string | null>(null);
  const [forwardSelectedMembers, setForwardSelectedMembers] = useState<Set<string>>(new Set());
  const [pinnedMessageIds, setPinnedMessageIds] = useState<string[]>([]);
  const [chatBackground, setChatBackground] = useState<string | null>(null);
  const roomAvatarInputRef = useRef<HTMLInputElement>(null);
  const chatBgInputRef = useRef<HTMLInputElement>(null);

  // Enable notification checker
  useChatNotifications();
  const room = rooms.find(r => r.id === roomId);
  const parentChannel = room?.channelId ? rooms.find((item) => item.id === room.channelId) : null;
  const channelRole = parentChannel?.channelRoles[currentUser?.id || ''] || room?.channelRoles[currentUser?.id || ''] || 'member';
  const groupRole = room?.groupRoles[currentUser?.id || ''] || 'member';
  const isGeneral = room?.isDefaultGroup || room?.name === 'Chung' || room?.name === 'General';
  const isCreator = room?.createdBy === currentUser?.id;
  const canManageChannel = channelRole === 'leader'; // Only leaders can manage channel (delete/roles)
  const canManageGroup = (groupRole === 'leader' || (groupRole === 'deputy' && isCreator) || channelRole === 'leader') && !isGeneral;
  const canCreateInChannel = channelRole === 'leader' || channelRole === 'deputy';
  const canToggleRestrictSpeaking = channelRole === 'leader' || groupRole === 'leader';
  const isStaff = channelRole === 'leader' || channelRole === 'deputy' || groupRole === 'leader' || groupRole === 'deputy';
  const isReadOnlyForMe = room?.restrictSpeaking && !isStaff;
  const canManageMembers = channelRole === 'leader' || groupRole === 'leader'; // Leaders of either can manage members
  const childGroups = useMemo(() => {
    if (room?.type !== 'channel') return [];
    return rooms.filter((item) => item.type === 'group' && item.channelId === room.id)
      .sort((a, b) => {
        if (a.isDefaultGroup) return -1;
        if (b.isDefaultGroup) return 1;
        const ap = a.priority || 100;
        const bp = b.priority || 100;
        if (ap !== bp) return ap - bp;
        return (a.createdAt || 0) - (b.createdAt || 0);
      });
  }, [rooms, room?.id, room?.type]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [firstLoadDone, setFirstLoadDone] = useState(false);
  const [localChildGroups, setLocalChildGroups] = useState<typeof childGroups>([]);
  const [isReordering, setIsReordering] = useState(false);
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
  const [pendingRoles, setPendingRoles] = useState<Record<string, 'leader' | 'deputy' | 'member'>>({});
  const [isDragging, setIsDragging] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);
  const [dropCaption, setDropCaption] = useState('');
  const [droppedFolderName, setDroppedFolderName] = useState<string | null>(null);
  const dragCounterRef = useRef(0);

  useEffect(() => {
    if (isMemberModalOpen && room) {
      setPendingRoles(room.type === 'channel' ? room.channelRoles : room.groupRoles);
    }
  }, [isMemberModalOpen, room?.id]);

  useEffect(() => {
    if (!isReordering) {
      setLocalChildGroups(childGroups);
    }
  }, [childGroups, isReordering]);

  const handleDragStart = (index: number) => {
    if (localChildGroups[index].isDefaultGroup) return;
    setDraggedItemIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedItemIndex === null || draggedItemIndex === index) return;
    if (localChildGroups[index].isDefaultGroup) return;

    const newList = [...localChildGroups];
    const item = newList.splice(draggedItemIndex, 1)[0];
    newList.splice(index, 0, item);
    setDraggedItemIndex(index);
    setLocalChildGroups(newList);
    setIsReordering(true);
  };

  const handleDragEnd = () => {
    setDraggedItemIndex(null);
  };

  const handleSaveOrder = async () => {
    setLoadingMessages(true);
    try {
      let hasChanges = false;
      for (let i = 0; i < localChildGroups.length; i++) {
        const g = localChildGroups[i];
        const newPriority = g.isDefaultGroup ? 0 : 100 + i;
        if (g.priority !== newPriority) {
          await matrixService.updateGroupPriority(g.id, newPriority);
          hasChanges = true;
        }
      }
      if (hasChanges) {
        await fetchRooms();
      }
      setIsReordering(false);
    } catch (err) {
      console.error('Failed to save group order:', err);
    } finally {
      setLoadingMessages(false);
    }
  };
  const otherMember = room?.type === 'dm' ? room.members.find((member) => member.id !== currentUser?.id) : null;
  const isSelfNote = roomId === 'self-note';
  const headerName = isSelfNote
    ? 'Tôi'
    : room?.type === 'dm' && otherMember
      ? otherMember.displayName || room?.name || otherMember.username
      : room?.name || '';

  const loadMessages = useCallback(async (silent = false) => {
    if (!roomId) {
      return;
    }
    if (!silent) {
      setLoadingMessages(true);
    }
    try {
      const msgs = await matrixService.getMessages(roomId);
      const cutoff = clearedBeforeRef.current;
      const filteredMsgs = cutoff ? msgs.filter(m => m.timestamp > cutoff) : msgs;
      // Build ID signature to skip state update when messages haven't changed
      const newIds = filteredMsgs.map(m => `${m.id}:${m.status || ''}:${JSON.stringify(m.reactions || {})}`).join(',');
      const shouldUpdate = newIds !== lastMsgIdsRef.current;
      if (shouldUpdate) {
        lastMsgIdsRef.current = newIds;
        setMessages((prev) => {
          const localDrafts = prev.filter((item) => item.id.startsWith('temp-') && item.status !== 'sent');
          return [...filteredMsgs, ...localDrafts].sort((a, b) => a.timestamp - b.timestamp);
        });
      }
      // Sync poll votes from timeline
      const serverVotes = matrixService.getLastPollVotes();
      if (Object.keys(serverVotes).length > 0) {
        setPollVotes(prev => {
          const merged = { ...prev };
          for (const [pollId, votes] of Object.entries(serverVotes)) {
            merged[pollId] = votes;
          }
          return merged;
        });
      }
      // Send read receipt for the last message to clear unread badge
      if (msgs.length > 0) {
        const lastMsg = msgs[msgs.length - 1];
        // Only send read marker when last message ID changes
        if (lastMsg.id !== lastReadEventRef.current) {
          lastReadEventRef.current = lastMsg.id;
          void matrixService.sendReadMarker(roomId, lastMsg.id);
        }
      }
      // Notify about new messages (only during silent polls, not initial load)
      if (silent && currentUser?.id) {
        notifyNewMessages(
          msgs,
          currentUser.id,
          roomId,
          (userId) => {
            const member = room?.members.find(m => m.id === userId);
            return member?.displayName || member?.username || userId;
          },
          () => room?.name || 'PieChat',
          useUiStore.getState().mutedRoomIds,
        );

        // Detect incoming calls
        const callEvents = matrixService.getLastCallEvents();
        const callStore = (await import('@/lib/store/call-store')).useCallStore.getState();
        if (callStore.status === 'none') {
          // Find an unanswered invite from someone else
          const invites = callEvents.filter(e => e.type === 'm.call.invite' && e.sender !== currentUser.id);
          const hangups = callEvents.filter(e => e.type === 'm.call.hangup');
          const answers = callEvents.filter(e => e.type === 'm.call.answer');
          for (const invite of invites) {
            const cid = invite.content.call_id as string;
            const hasHangup = hangups.some(h => h.content.call_id === cid);
            const hasAnswer = answers.some(a => a.content.call_id === cid);
            const isRecent = Date.now() - invite.origin_server_ts < 30000; // 30s lifetime
            if (!hasHangup && !hasAnswer && isRecent) {
              const callerMember = room?.members.find(m => m.id === invite.sender);
              if (callerMember) {
                const isVideo = (invite.content.offer as any)?.sdp?.includes('m=video');
                callStore.receiveCall(roomId, callerMember, isVideo ? 'video' : 'voice', cid, invite.content);
              }
              break;
            }
          }
        }
      }
    } catch {
      setMessages((prev) => prev);
    } finally {
      if (!silent) {
        setLoadingMessages(false);
      }
    }
  }, [roomId, currentUser?.id, room]);

  useEffect(() => {
    // Restore cleared-before timestamp from server (account-level, syncs across devices)
    matrixService.getClearedBefore(roomId).then(ts => {
      clearedBeforeRef.current = ts;
      // Also sync to localStorage for sidebar usage
      if (ts) {
        try { localStorage.setItem(`piechat_cleared_${roomId}`, String(ts)); } catch {}
      }
    }).catch(() => {
      // Fallback to localStorage
      try {
        const saved = localStorage.getItem(`piechat_cleared_${roomId}`);
        clearedBeforeRef.current = saved ? Number(saved) : 0;
      } catch { clearedBeforeRef.current = 0; }
    });
    setFirstLoadDone(false);
    void loadMessages().then(() => {
      // Seed existing message IDs so they don't trigger notifications
      setMessages(prev => {
        seedNotifiedMessageIds(prev.map(m => m.id));
        return prev;
      });
    }).finally(() => setFirstLoadDone(true));
    // Load pinned messages
    matrixService.getPinnedEventIds(roomId).then(ids => setPinnedMessageIds(ids)).catch(() => {});
    // Load chat background
    matrixService.getChatBackground(roomId).then(url => setChatBackground(url)).catch(() => {});
    const timer = setInterval(() => {
      void loadMessages(true);
    }, 2500);
    return () => clearInterval(timer);
  }, [loadMessages]);

  // ─── Smart scroll: only auto-scroll when user is near bottom ───
  const isNearBottom = () => {
    const el = chatContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 150;
  };

  const scrollToBottom = (force = false) => {
    if (force || isNearBottom()) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      userScrolledUpRef.current = false;
    }
  };

  useEffect(() => {
    const prevCount = prevMessageCountRef.current;
    const newCount = messages.length;
    prevMessageCountRef.current = newCount;

    // Initial load or first batch → always scroll to bottom
    if (prevCount === 0 && newCount > 0) {
      setTimeout(() => scrollToBottom(true), 100);
      return;
    }

    // New messages appeared
    if (newCount > prevCount) {
      const lastMsg = messages[messages.length - 1];
      const isMine = lastMsg?.senderId === currentUser?.id;
      // Always scroll for own messages, only scroll for others if near bottom
      if (isMine) {
        setTimeout(() => scrollToBottom(true), 50);
      } else {
        scrollToBottom(false);
      }
    }
  }, [messages, currentUser?.id]);

  const displayedMessages = useMemo(() => {
    const q = roomSearch.trim().toLowerCase();
    return q ? messages.filter((item) => item.content.toLowerCase().includes(q)) : messages;
  }, [messages, roomSearch]);

  const hasFailedMessages = useMemo(() => messages.some((item) => item.status === 'failed'), [messages]);

  const getStatusLabel = useCallback((status: Message['status']) => {
    if (status === 'sending') return t(language, 'roomStatusSending');
    if (status === 'failed') return t(language, 'roomStatusFailed');
    return t(language, 'roomStatusSent');
  }, [language]);

  const handleSendMessage = async (contentOrEvent: React.FormEvent | string) => {
    let content = '';
    if (typeof contentOrEvent === 'string') {
      content = contentOrEvent;
    } else {
      contentOrEvent.preventDefault();
      content = message;
    }

    if (!content.trim()) {
      return;
    }
    content = content.trim();
    const tempId = `temp-${Date.now()}`;

    const tempMsg: Message = {
      id: tempId,
      roomId,
      senderId: currentUser?.id || 'me',
      content,
      timestamp: Date.now(),
      status: 'sending',
      ...(disappearingTtl ? { expiresAt: Date.now() + disappearingTtl } : {}),
    };
    setMessages((prev) => [...prev, tempMsg]);
    setMessage('');

    try {
      if (disappearingTtl) {
        await matrixService.sendDisappearingMessage(roomId, content, disappearingTtl);
      } else {
        await sendMessage(roomId, content);
      }
      setMessages((prev) => prev.map((item) => (item.id === tempId ? { ...item, status: 'sent' } : item)));
      await loadMessages(true);
    } catch {
      setMessages((prev) => prev.map((item) => (item.id === tempId ? { ...item, status: 'failed' } : item)));
    }
  };

  const handleSendFiles = async (files: File[]) => {
    for (const file of files) {
      const tempId = `temp-file-${crypto.randomUUID()}`;
      const icon = file.type.startsWith('image/') ? '📷' : file.type.startsWith('video/') ? '🎬' : '📎';
      const tempMsg: Message = {
        id: tempId,
        roomId,
        senderId: currentUser?.id || 'me',
        content: `${icon} ${file.name}`,
        timestamp: Date.now(),
        status: 'sending',
        msgtype: file.type.startsWith('image/') ? 'm.image' : file.type.startsWith('video/') ? 'm.video' : 'm.file',
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      };
      setMessages((prev) => [...prev, tempMsg]);

      try {
        await matrixService.sendFileMessage(roomId, file);
        setMessages((prev) => prev.map((item) => (item.id === tempId ? { ...item, status: 'sent' } : item)));
      } catch (err) {
        console.error('File upload failed:', err);
        setMessages((prev) => prev.map((item) => (item.id === tempId ? { ...item, status: 'failed' } : item)));
      }
    }
    await loadMessages(true);
  };

  const handleSendFolder = async (folderName: string, files: File[]) => {
    if (!roomId || files.length === 0) return;
    const tempId = `temp-folder-${Date.now()}`;
    const totalSize = files.reduce((acc, f) => acc + f.size, 0);
    const tempMsg: Message = {
      id: tempId,
      roomId,
      senderId: currentUser?.id || 'me',
      content: `📁 ${folderName}`,
      timestamp: Date.now(),
      status: 'sending',
      msgtype: 'io.piechat.folder',
      fileName: folderName,
      fileSize: totalSize,
      duration: files.length, // reuse for file count
      uploadProgress: 0,
    };
    setMessages((prev) => [...prev, tempMsg]);

    const updateProgress = (p: number) => {
      setMessages((prev) => prev.map((item) =>
        item.id === tempId ? { ...item, uploadProgress: p } : item
      ));
    };

    try {
      // Zip files using JSZip (0-50% progress)
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const relativePath = (file as any).webkitRelativePath || file.name;
        zip.file(relativePath, file);
        updateProgress(Math.round(((i + 1) / files.length) * 40));
      }
      updateProgress(45);
      const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      updateProgress(50);

      // Upload zip (50-100% progress)
      await matrixService.sendFolderMessage(roomId, zipBlob, folderName, files.length, totalSize, (uploadPercent) => {
        updateProgress(50 + Math.round(uploadPercent * 0.5));
      });
      setMessages((prev) => prev.map((item) => (item.id === tempId ? { ...item, status: 'sent', uploadProgress: 100 } : item)));
      await loadMessages(true);
    } catch (err) {
      console.error('Folder upload failed:', err);
      setMessages((prev) => prev.map((item) => (item.id === tempId ? { ...item, status: 'failed' } : item)));
    }
  };

  const handleSendVoice = async (blob: Blob, durationMs: number) => {
    const tempId = `temp-voice-${Date.now()}`;
    const tempMsg: Message = {
      id: tempId,
      roomId,
      senderId: currentUser?.id || 'me',
      content: '🎤 Tin nhắn thoại',
      timestamp: Date.now(),
      status: 'sending',
      msgtype: 'm.audio',
      duration: durationMs,
    };
    setMessages((prev) => [...prev, tempMsg]);

    try {
      await matrixService.sendVoiceMessage(roomId, blob, durationMs);
      setMessages((prev) => prev.map((item) => (item.id === tempId ? { ...item, status: 'sent' } : item)));
      await loadMessages(true);
    } catch (err) {
      console.error('Voice message failed:', err);
      setMessages((prev) => prev.map((item) => (item.id === tempId ? { ...item, status: 'failed' } : item)));
    }
  };

  // ─── Sticker Handler ───────────────────────────────────
  const handleSendSticker = async (packId: string, stickerId: string, stickerUrl: string) => {
    if (!roomId) return;
    const tempId = `temp-sticker-${Date.now()}`;
    const tempMsg: Message = {
      id: tempId,
      roomId,
      senderId: currentUser?.id || 'me',
      content: `sticker:${packId}:${stickerId}`,
      timestamp: Date.now(),
      status: 'sending',
      msgtype: 'io.piechat.sticker',
      fileUrl: stickerUrl,
      fileName: stickerId,
    };
    setMessages((prev) => [...prev, tempMsg]);

    try {
      await matrixService.sendStickerMessage(roomId, packId, stickerId, stickerUrl);
      setMessages((prev) => prev.map((item) => (item.id === tempId ? { ...item, status: 'sent' } : item)));
      await loadMessages(true);
    } catch (err) {
      console.error('Sticker send failed:', err);
      setMessages((prev) => prev.map((item) => (item.id === tempId ? { ...item, status: 'failed' } : item)));
    }
  };

  // ─── Contact Card Handlers ────────────────────────────
  const handleSendContact = async () => {
    const phone = prompt('Nhập số điện thoại danh thiếp:');
    if (!phone?.trim()) return;
    const name = prompt('Nhập tên hiển thị (hoặc để trống):') || phone.trim();
    
    // Try to resolve to Matrix user
    const resolved = matrixService.resolveKnownMatrixUserIdFromPhone(phone.trim());
    
    const tempId = `temp-contact-${Date.now()}`;
    const tempMsg: Message = {
      id: tempId,
      roomId,
      senderId: currentUser?.id || 'me',
      content: phone.trim(),
      timestamp: Date.now(),
      status: 'sending',
      msgtype: 'io.piechat.contact',
      fileName: name, // displayName
      fileUrl: resolved || undefined, // userId
    };
    setMessages(prev => [...prev, tempMsg]);

    try {
      await matrixService.sendContactMessage(roomId, phone.trim(), name, resolved || undefined);
      setMessages(prev => prev.map(item => item.id === tempId ? { ...item, status: 'sent' } : item));
      await loadMessages(true);
    } catch (err) {
      console.error('Contact send failed:', err);
      setMessages(prev => prev.map(item => item.id === tempId ? { ...item, status: 'failed' } : item));
    }
  };

  const resolveUserByPhone = useCallback((phone: string): ContactCardData | null => {
    const userId = matrixService.resolveKnownMatrixUserIdFromPhone(phone);
    if (!userId) return null;
    // Try to find in any room's member list
    for (const r of rooms) {
      const member = r.members.find(m => m.id === userId);
      if (member) {
        return {
          phone,
          displayName: member.displayName || member.username,
          userId: member.id,
        };
      }
    }
    return { phone, userId };
  }, [rooms]);

  // ─── Poll Handlers ────────────────────────────────────
  const handleCreatePoll = async (pollData: PollData) => {
    if (!roomId) return;
    const options = pollData.options.map((text, i) => ({
      id: `opt-${i}-${Date.now().toString(36)}`,
      text,
    }));
    const tempId = `temp-poll-${Date.now()}`;
    const tempMsg: Message = {
      id: tempId,
      roomId,
      senderId: currentUser?.id || 'me',
      content: JSON.stringify({ ...pollData, options, pollId: tempId, creatorId: currentUser?.id, votes: [] }),
      timestamp: Date.now(),
      status: 'sending',
      msgtype: 'io.piechat.poll',
    };
    setMessages((prev) => [...prev, tempMsg]);

    try {
      await matrixService.sendPollMessage(roomId, {
        question: pollData.question,
        options,
        allowMultiple: pollData.allowMultiple,
        anonymous: pollData.anonymous,
        deadline: pollData.deadline,
      });
      setMessages((prev) => prev.map((item) => (item.id === tempId ? { ...item, status: 'sent' } : item)));
      await loadMessages(true);
      // Schedule poll expiry notification if deadline is set
      if (pollData.deadline) {
        schedulePollExpiryNotification(tempId, pollData.question, pollData.deadline, roomId);
      }
    } catch (err) {
      console.error('Poll create failed:', err);
      setMessages((prev) => prev.map((item) => (item.id === tempId ? { ...item, status: 'failed' } : item)));
    }
  };

  const handlePollVote = async (pollId: string, eventId: string, optionIds: string[]) => {
    if (!roomId || !currentUserId) return;
    try {
      await matrixService.votePoll(roomId, eventId, pollId, optionIds);
      // Optimistically add votes
      setPollVotes(prev => {
        const existing = prev[pollId] || [];
        const newVotes = optionIds.map(optId => ({ optionId: optId, userId: currentUserId }));
        return { ...prev, [pollId]: [...existing.filter(v => v.userId !== currentUserId), ...newVotes] };
      });
    } catch (err) {
      console.error('Vote failed:', err);
    }
  };

  // ─── Reminder Handler ─────────────────────────────────
  const handleCreateReminder = async (data: ReminderData) => {
    if (!roomId) return;
    const tempId = `temp-rem-${Date.now()}`;
    const reminderId = `rem-${crypto.randomUUID()}`;
    const tempMsg: Message = {
      id: tempId,
      roomId,
      senderId: currentUser?.id || 'me',
      content: JSON.stringify({ reminderId, title: data.title, deadline: data.deadline, creatorId: currentUser?.id }),
      timestamp: Date.now(),
      status: 'sending',
      msgtype: 'io.piechat.reminder',
    };
    setMessages((prev) => [...prev, tempMsg]);

    try {
      await matrixService.sendReminderMessage(roomId, {
        title: data.title,
        deadline: data.deadline,
      });
      setMessages((prev) => prev.map((item) => (item.id === tempId ? { ...item, status: 'sent' } : item)));
      await loadMessages(true);
      // Schedule browser notification
      scheduleReminderNotification(reminderId, data.title, data.deadline, roomId);
    } catch (err) {
      console.error('Reminder create failed:', err);
      setMessages((prev) => prev.map((item) => (item.id === tempId ? { ...item, status: 'failed' } : item)));
    }
  };

  const currentUserId = currentUser?.id || '';

  const handleContactAddFriend = async (userId: string) => {
    try {
      await sendFriendRequest(userId);
    } catch (err) {
      console.error('Add friend failed:', err);
    }
  };

  const handleContactCall = async (userId: string) => {
    // Navigate to DM with user, then start call
    const dmRoom = await createDirectChatByUserId(userId);
    if (dmRoom) {
      router.push(`/chat/${encodeURIComponent(dmRoom)}`);
    }
  };

  // ─── Widget Handler ────────────────────────────────────
  const handleSendWidget = async (widgetPayload: object) => {
    if (!roomId) return;
    const payload = widgetPayload as WidgetPayload;
    const tempId = `temp-widget-${Date.now()}`;
    const tempMsg: Message = {
      id: tempId,
      roomId,
      senderId: currentUser?.id || 'me',
      content: `🧩 Widget: ${payload.title || payload.type || 'Widget'}`,
      timestamp: Date.now(),
      status: 'sending',
      widget: payload,
    };
    setMessages(prev => [...prev, tempMsg]);

    try {
      await matrixService.sendWidgetMessage(roomId, `🧩 Widget: ${payload.title || payload.type || 'Widget'}`, payload);
      setMessages(prev => prev.map(item => item.id === tempId ? { ...item, status: 'sent' } : item));
      await loadMessages(true);
    } catch (err) {
      console.error('Widget send failed:', err);
      setMessages(prev => prev.map(item => item.id === tempId ? { ...item, status: 'failed' } : item));
    }
  };

  // ─── Inline Buttons Handler ───────────────────────────────
  const handleSendButtons = async (text: string, buttons: Array<{ id: string; label: string; action?: string; url?: string; style?: 'primary' | 'secondary' | 'danger' }>) => {
    if (!roomId) return;
    const tempId = `temp-btn-${Date.now()}`;
    const tempMsg: Message = {
      id: tempId,
      roomId,
      senderId: currentUser?.id || 'me',
      content: text,
      timestamp: Date.now(),
      status: 'sending',
      inlineButtons: buttons,
    };
    setMessages(prev => [...prev, tempMsg]);

    try {
      await matrixService.sendMessageWithButtons(roomId, text, buttons);
      setMessages(prev => prev.map(item => item.id === tempId ? { ...item, status: 'sent' } : item));
      await loadMessages(true);
    } catch (err) {
      console.error('Buttons send failed:', err);
      setMessages(prev => prev.map(item => item.id === tempId ? { ...item, status: 'failed' } : item));
    }
  };

  // ─── Pin Message Handlers ─────────────────────────────────
  const handlePinMessage = async (msgId: string) => {
    try {
      const newPinned = await matrixService.pinMessage(roomId, msgId);
      setPinnedMessageIds(newPinned);
    } catch (err: any) {
      if (err?.message === 'PIN_LIMIT') {
        alert('Đã đạt giới hạn 3 tin nhắn ghim. Bỏ ghim một tin trước khi ghim thêm.');
      } else {
        console.error('Pin failed:', err);
      }
    }
  };

  const handleUnpinMessage = async (msgId: string) => {
    try {
      const newPinned = await matrixService.unpinMessage(roomId, msgId);
      setPinnedMessageIds(newPinned);
    } catch (err) {
      console.error('Unpin failed:', err);
    }
  };

  const handleContactMessage = async (userId: string) => {
    const dmRoom = await createDirectChatByUserId(userId);
    if (dmRoom) {
      router.push(`/chat/${encodeURIComponent(dmRoom)}`);
    }
  };

  const retryMessage = async (id: string) => {
    const target = messages.find((item) => item.id === id);
    if (!target) {
      return;
    }
    setMessages((prev) => prev.map((item) => (item.id === id ? { ...item, status: 'sending' } : item)));
    try {
      await sendMessage(roomId, target.content);
      setMessages((prev) => prev.map((item) => (item.id === id ? { ...item, status: 'sent' } : item)));
      await loadMessages(true);
    } catch {
      setMessages((prev) => prev.map((item) => (item.id === id ? { ...item, status: 'failed' } : item)));
    }
  };

  useEffect(() => {
    const keyword = memberQuery.trim();
    if (keyword.length < 2) {
      setMemberSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      void matrixService.searchUsersByName(keyword).then((results) => {
        const existing = new Set((room?.members || []).map((member) => member.id));
        setMemberSuggestions(results.filter((result) => !existing.has(result.userId)));
      }).catch(() => {
        setMemberSuggestions([]);
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [memberQuery, room?.members]);

  const handleAddMember = async (userId: string) => {
    if (!userId || !room) {
      return;
    }
    setLoadingMessages(true);
    try {
      const invitedUserId = await addMemberByUserId(room.id, userId);
      if (invitedUserId) {
        if (room.type === 'channel') {
          await updateChannelRole(room.id, invitedUserId, 'member');
        } else if (room.type === 'group') {
          await updateGroupRole(room.id, invitedUserId, 'member');
        }
        setMemberQuery('');
        setMemberSuggestions([]);
        alert(t(language, 'chatMemberAdded' as any) || 'Đã gửi lời mời thành công');
      } else {
        alert(t(language, 'chatInviteFailed' as any) || 'Không thể mời thành viên này. Vui lòng kiểm tra lại ID hoặc số điện thoại');
      }
    } catch (err) {
      console.error('Invite failed:', err);
      alert(t(language, 'chatInviteFailed' as any) || 'Lỗi khi mời thành viên');
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleRoleChange = (userId: string, role: 'leader' | 'deputy' | 'member') => {
    setPendingRoles(prev => ({ ...prev, [userId]: role }));
  };

  const handleApplyMemberChanges = async () => {
    if (!room) return;
    setLoadingMessages(true);
    try {
      if (room.type === 'channel') {
        await updateRoomRoles(room.id, pendingRoles, undefined);
      } else {
        await updateRoomRoles(room.id, undefined, pendingRoles);
      }
      setIsMemberModalOpen(false);
    } catch (err) {
      console.error('Failed to apply role changes:', err);
      alert('Lỗi khi cập nhật quyền');
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!room || !currentUser || userId === currentUser.id) {
      return;
    }
    if (confirm(`Bạn có chắc muốn mời thành viên này ra khỏi ${room.type === 'channel' ? 'Nhóm' : 'Kênh'}?`)) {
      try {
        await removeMember(room.id, userId);
      } catch (err) {
        console.error('Removal failed:', err);
      }
    }
  };

  const handleCreateSubGroup = async () => {
    if (!room || room.type !== 'channel') {
      return;
    }
    const randomName = `${t(language, 'chatGroup')} ${childGroups.length + 1}`;
    await createGroup(room.id, randomName, []);
  };

  const handleDeleteCurrentGroup = async () => {
    if (!room || room.type !== 'group' || isGeneral) {
      return;
    }
    const ok = await archiveGroup(room.id);
    if (ok) {
      router.push('/chat');
    }
  };

  const handleDeleteCurrentChannel = async () => {
    if (!room || room.type !== 'channel') {
      return;
    }
    const ok = await deleteRoom(room.id);
    if (ok) {
      router.push('/chat');
    }
  };

  const resolveUsername = (userId: string) => {
    const member = room?.members.find((m) => m.id === userId);
    return member?.displayName || member?.username || userId;
  };

  const handleMessageAction = (action: string, msg: Message) => {
    setActiveMenuMessageId(null);
    if (action === 'reply') {
      const senderMember = room?.members.find(m => m.id === msg.senderId);
      setReplyEdit({
        mode: 'reply',
        messageId: msg.id,
        senderName: senderMember?.displayName || senderMember?.username || msg.senderId,
        content: msg.content,
      });
      // Focus the text input so user can immediately type
      setTimeout(() => {
        const input = document.querySelector<HTMLTextAreaElement>('[data-chat-input]');
        input?.focus();
      }, 100);
    } else if (action === 'edit') {
      setReplyEdit({
        mode: 'edit',
        messageId: msg.id,
        senderName: '',
        content: msg.content,
      });
    } else if (action === 'delete') {
      if (confirm('Xóa tin nhắn này?')) {
        matrixService.deleteMessage(roomId, msg.id).then(() => {
          setMessages(prev => prev.filter(m => m.id !== msg.id));
        }).catch(() => alert('Không thể xóa tin nhắn'));
      }
    } else if (action === 'recall') {
      if (confirm('Thu hồi tin nhắn này? Mọi người sẽ không còn thấy nội dung.')) {
        matrixService.recallMessage(roomId, msg.id).then(() => {
          setMessages(prev => prev.map(m =>
            m.id === msg.id ? { ...m, content: '🚫 Tin nhắn đã bị thu hồi', redacted: true } : m
          ));
        }).catch(() => alert('Không thể thu hồi tin nhắn'));
      }
    } else if (action === 'forward') {
      setForwardingMessage(msg);
    } else if (action === 'pin') {
      setPinnedMessage(prev => prev?.id === msg.id ? null : msg);
    }
  };

  const handleReplyMessage = useCallback(async (replyToId: string, content: string) => {
    try {
      await matrixService.sendReply(roomId, replyToId, content);
      loadMessages(true);
    } catch (err) {
      console.error('Reply failed:', err);
    }
  }, [roomId, loadMessages]);

  const handleEditMessage = useCallback(async (messageId: string, newContent: string) => {
    try {
      await matrixService.editMessage(roomId, messageId, newContent);
      // Optimistic update
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, content: newContent, edited: true } : m
      ));
    } catch (err) {
      console.error('Edit failed:', err);
    }
  }, [roomId]);

  const handleTyping = useCallback((typing: boolean) => {
    matrixService.sendTyping(roomId, typing);
  }, [roomId]);

  // Stable callbacks for MessageBubble (prevents re-renders)
  const handleReaction = useCallback((msgId: string, emoji: string) => {
    // Optimistic update — update immediately
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId) return m;
      const reactions = { ...(m.reactions || {}) };
      reactions[emoji] = (reactions[emoji] || 0) + 1;
      return { ...m, reactions };
    }));
    // Then send to server
    sendReaction(roomId, msgId, emoji).catch(() => {
      // Revert on failure
      setMessages(prev => prev.map(m => {
        if (m.id !== msgId) return m;
        const reactions = { ...(m.reactions || {}) };
        reactions[emoji] = Math.max((reactions[emoji] || 1) - 1, 0);
        if (reactions[emoji] === 0) delete reactions[emoji];
        return { ...m, reactions };
      }));
    });
  }, [roomId]);

  const handleButtonClick = useCallback((msgId: string, btnId: string, label: string) => {
    matrixService.sendButtonClick(roomId, msgId, btnId, label).catch(console.error);
  }, [roomId]);

  const handleWidgetAction = useCallback((messageId: string, action: string, data: unknown) => {
    if (action === 'copy' && typeof data === 'string') {
      navigator.clipboard?.writeText(data).catch(() => {});
    }
  }, []);

  const handleAvatarClick = useCallback((userId: string) => {
    setProfileUserId(userId);
  }, []);

  // Poll typing users
  useEffect(() => {
    const interval = setInterval(() => {
      try {
        const users = matrixService.getTypingUsers(roomId);
        if (users.length > 0) {
          setTypingUsers(users.filter(u => u !== currentUser?.id));
        } else {
          setTypingUsers([]);
        }
      } catch {
        // ignore
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [roomId, currentUser?.id]);

  // Set presence online
  useEffect(() => {
    matrixService.setPresence('online');
    const interval = setInterval(() => matrixService.setPresence('online'), 60000);
    return () => {
      clearInterval(interval);
      matrixService.setPresence('unavailable');
    };
  }, []);

  // Poll remote presence for DM rooms — with last seen time
  useEffect(() => {
    if (room?.type !== 'dm') return;
    const remoteUser = room?.members.find(m => m.id !== currentUser?.id);
    if (!remoteUser) return;
    const fetchPresence = async () => {
      try {
        const p = await matrixService.getPresence(remoteUser.id);
        const isOnline = p.currently_active || p.presence === 'online';
        setRemotePresence(isOnline ? 'online' : p.presence);
        if (!isOnline) {
          const text = await matrixService.getLastActiveTime(remoteUser.id);
          setLastSeenText(text || 'Ngoại tuyến');
        } else {
          setLastSeenText('');
        }
      } catch {
        setRemotePresence('offline');
        setLastSeenText('Ngoại tuyến');
      }
    };
    fetchPresence();
    const interval = setInterval(fetchPresence, 15000);
    return () => clearInterval(interval);
  }, [room?.type, room?.members, currentUser?.id]);

  return (
    <div
      className="flex h-[100dvh] lg:h-full min-h-0 flex-col relative"
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current++;
        if (e.dataTransfer.types.includes('Files')) setIsDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current--;
        if (dragCounterRef.current <= 0) {
          dragCounterRef.current = 0;
          setIsDragging(false);
        }
      }}
      onDrop={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current = 0;
        setIsDragging(false);

        const items = e.dataTransfer.items;
        const fileList: File[] = [];
        let folderName: string | null = null;

        // Helper to read all files from a directory entry recursively
        const readEntry = (entry: FileSystemEntry): Promise<File[]> => {
          return new Promise((resolve) => {
            if (entry.isFile) {
              (entry as FileSystemFileEntry).file(
                (file) => {
                  // Preserve relative path
                  Object.defineProperty(file, 'webkitRelativePath', { value: entry.fullPath.slice(1), writable: false });
                  resolve([file]);
                },
                () => resolve([])
              );
            } else if (entry.isDirectory) {
              const dirReader = (entry as FileSystemDirectoryEntry).createReader();
              const readAll = (allEntries: FileSystemEntry[] = []): Promise<FileSystemEntry[]> => {
                return new Promise((res) => {
                  dirReader.readEntries((entries) => {
                    if (entries.length === 0) res(allEntries);
                    else readAll([...allEntries, ...entries]).then(res);
                  }, () => res(allEntries));
                });
              };
              readAll().then(async (entries) => {
                const results = await Promise.all(entries.map(readEntry));
                resolve(results.flat());
              });
            } else {
              resolve([]);
            }
          });
        };

        if (items) {
          const entries: FileSystemEntry[] = [];
          for (let i = 0; i < items.length; i++) {
            const entry = items[i].webkitGetAsEntry?.();
            if (entry) entries.push(entry);
          }
          // Check if any entry is a directory
          const hasDir = entries.some(e => e.isDirectory);
          if (hasDir && entries.length === 1 && entries[0].isDirectory) {
            folderName = entries[0].name;
          }
          for (const entry of entries) {
            const files = await readEntry(entry);
            fileList.push(...files);
          }
        } else {
          for (let i = 0; i < e.dataTransfer.files.length; i++) {
            fileList.push(e.dataTransfer.files[i]);
          }
        }

        if (fileList.length > 0) {
          setDroppedFiles(fileList);
          setDroppedFolderName(folderName);
          setDropCaption('');
        }
      }}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-[300] flex items-center justify-center bg-sky-500/10 backdrop-blur-sm border-2 border-dashed border-sky-400 rounded-xl pointer-events-none animate-in fade-in duration-150">
          <div className="flex flex-col items-center gap-3 text-sky-600 dark:text-sky-400">
            <div className="h-16 w-16 rounded-2xl bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
              <Paperclip className="h-8 w-8" />
            </div>
            <p className="text-lg font-bold">Thả file để gửi</p>
            <p className="text-sm text-sky-500/70">Hỗ trợ ảnh, video, tài liệu, thư mục</p>
          </div>
        </div>
      )}
      <header className="relative z-[100] border-b border-sky-100 bg-white/90 px-2 sm:px-4 backdrop-blur dark:border-sky-900/40 dark:bg-zinc-900/90 shadow-sm" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="flex h-14 sm:h-16 items-center gap-2">
          <Link
            href="/chat"
            className="rounded-full p-1 lg:hidden text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className={`flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full ${isSelfNote ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-sky-100 dark:bg-sky-900/30'} font-bold text-sm sm:text-base`}>
            {isSelfNote ? '📌' : (headerName?.charAt(0).toUpperCase() || '?')}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {headerName || t(language, 'roomLoading')}
            </h2>
            <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
              {isSelfNote
                ? t(language, 'assistantPersonalNotes' as any)
                : room?.type === 'dm'
                  ? (<>
                      <span className={cn(
                        "inline-block h-2 w-2 rounded-full",
                        remotePresence === 'online' ? "bg-emerald-500 animate-pulse" : "bg-zinc-300 dark:bg-zinc-600"
                      )} />
                      {remotePresence === 'online' ? 'Đang hoạt động' : (lastSeenText || 'Ngoại tuyến')}
                    </>)
                  : room?.type === 'group' && parentChannel
                    ? `${parentChannel.name} • ${room.members.length} ${t(language, 'chatRoleMember').toLowerCase()}`
                    : room?.type === 'channel'
                      ? `${room.members.length} ${t(language, 'chatRoleMember').toLowerCase()}`
                      : t(language, 'roomMembersOnline')}
            </p>
          </div>
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setIsSearchOpen((prev) => !prev)}
              className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              <Search className="h-5 w-5" />
            </button>
            {!isSelfNote && (
              <button
                onClick={async () => {
                  if (!room) return;
                  const members = await matrixService.getRoomMembers(room.id);
                  const remoteParticipant = members.find(m => m.id !== currentUser?.id) || members[0];
                  if (remoteParticipant) {
                    (await import('@/lib/store/call-store')).useCallStore.getState().startCall(room.id, remoteParticipant, 'voice');
                  }
                }}
                className="hidden sm:inline-flex rounded-full p-2 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                <Phone className="h-5 w-5" />
              </button>
            )}
            {!isSelfNote && (
              <button
                onClick={async () => {
                  if (!room) return;
                  const members = await matrixService.getRoomMembers(room.id);
                  const remoteParticipant = members.find(m => m.id !== currentUser?.id) || members[0];
                  if (remoteParticipant) {
                    (await import('@/lib/store/call-store')).useCallStore.getState().startCall(room.id, remoteParticipant, 'video');
                  }
                }}
                className="hidden sm:inline-flex rounded-full p-2 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                <Video className="h-5 w-5" />
              </button>
            )}
            {/* Member List Toggle */}
            {!isSelfNote && room?.type !== 'dm' && (
              <button
                onClick={() => setIsMemberListOpen(prev => !prev)}
                className={cn(
                  "hidden sm:inline-flex rounded-full p-2 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800",
                  isMemberListOpen && "bg-sky-50 text-sky-500 dark:bg-sky-900/20 dark:text-sky-400"
                )}
                title="Danh sách thành viên"
              >
                <Users className="h-5 w-5" />
              </button>
            )}
            {/* Broadcast Button for Channel Leaders */}
            {room?.type === 'channel' && canManageChannel && (
              <button
                onClick={() => setIsBroadcastOpen(true)}
                className="hidden sm:inline-flex rounded-full p-2 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                title="Gửi thông báo đến tất cả nhóm"
              >
                <MessageSquare className="h-5 w-5" />
              </button>
            )}
            <div className="relative">
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                <MoreVertical className="h-5 w-5" />
              </button>

              {isMenuOpen && (
                <div className="absolute right-0 top-full z-[100] mt-1 w-48 origin-top-right rounded-md border border-zinc-200 bg-white py-1 shadow-lg ring-1 ring-black/5 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800">
                  {/* Call buttons in menu for mobile */}
                  {!isSelfNote && (
                    <>
                      <button
                        onClick={async () => {
                          setIsMenuOpen(false);
                          if (!room) return;
                          const members = await matrixService.getRoomMembers(room.id);
                          const remoteParticipant = members.find(m => m.id !== currentUser?.id) || members[0];
                          if (remoteParticipant) {
                            (await import('@/lib/store/call-store')).useCallStore.getState().startCall(room.id, remoteParticipant, 'voice');
                          }
                        }}
                        className="flex w-full items-center gap-2 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700/50 sm:hidden"
                      >
                        <Phone className="h-4 w-4" />
                        {t(language, 'chatVoiceCall' as any) || 'Gọi thoại'}
                      </button>
                      <button
                        onClick={async () => {
                          setIsMenuOpen(false);
                          if (!room) return;
                          const members = await matrixService.getRoomMembers(room.id);
                          const remoteParticipant = members.find(m => m.id !== currentUser?.id) || members[0];
                          if (remoteParticipant) {
                            (await import('@/lib/store/call-store')).useCallStore.getState().startCall(room.id, remoteParticipant, 'video');
                          }
                        }}
                        className="flex w-full items-center gap-2 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700/50 sm:hidden"
                      >
                        <Video className="h-4 w-4" />
                        {t(language, 'chatVideoCall' as any) || 'Gọi video'}
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      setIsMemberModalOpen(true);
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700/50"
                  >
                    <UserPlus className="h-4 w-4" />
                    {t(language, 'chatManageMembers')}
                  </button>
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      setIsGalleryOpen(true);
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700/50"
                  >
                    <FolderOpen className="h-4 w-4" />
                    Kho lưu trữ
                  </button>
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      toggleMuteRoom(roomId);
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700/50"
                  >
                    {mutedRoomIds.includes(roomId) ? (
                      <>
                        <Bell className="h-4 w-4 text-amber-500" />
                        Bỏ tắt tiếng
                      </>
                    ) : (
                      <>
                        <BellOff className="h-4 w-4" />
                        Tắt tiếng
                      </>
                    )}
                  </button>
                  {(canManageGroup || canManageChannel) && (
                    <button
                      onClick={() => {
                        setIsMenuOpen(false);
                        if (room?.type === 'group') {
                          handleDeleteCurrentGroup();
                        } else {
                          handleDeleteCurrentChannel();
                        }
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-900/20"
                    >
                      <Trash2 className="h-4 w-4" />
                      {room?.type === 'group' ? t(language, 'chatDeleteGroup') : t(language, 'chatDeleteChannel' as any) || 'Xóa nhóm'}
                    </button>
                  )}
                  {canToggleRestrictSpeaking && (
                    <button
                      onClick={async () => {
                        setIsMenuOpen(false);
                        const restricted = !room?.restrictSpeaking;
                        await toggleRestrictSpeaking(room!.id, restricted);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors",
                        room?.restrictSpeaking ? "text-sky-600 hover:bg-sky-50" : "text-zinc-700 hover:bg-zinc-100"
                      )}
                    >
                      <Shield className="h-4 w-4" />
                      {t(language, 'chatRestrictSpeaking')}
                      {room?.restrictSpeaking && <ShieldCheck className="ml-auto h-3 w-3" />}
                    </button>
                  )}
                  {/* Join Room option for Leaders of channel who are not yet in this sub-group */}
                  {channelRole === 'leader' && !room?.members.some(m => m.id === currentUser?.id) && (
                    <button
                      onClick={async () => {
                        setIsMenuOpen(false);
                        await joinRoom(room!.id);
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-sky-600 hover:bg-sky-50"
                    >
                      <UserPlus className="h-4 w-4" />
                      {t(language, 'chatJoin')}
                    </button>
                  )}
                  {/* Copy Invite Link */}
                  {room?.type !== 'dm' && (
                    <button
                      onClick={() => {
                        setIsMenuOpen(false);
                        const base = typeof window !== 'undefined' ? window.location.origin : '';
                        const link = `${base}/chat/${encodeURIComponent(roomId)}`;
                        navigator.clipboard.writeText(link).then(() => {
                          alert('Đã sao chép link mời vào clipboard!');
                        }).catch(() => {
                          prompt('Sao chép link này:', link);
                        });
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      <Copy className="h-4 w-4" />
                      Sao chép link mời
                    </button>
                  )}
                  {/* Export Chat History */}
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      const exportData = {
                        roomId,
                        roomName: room?.name || roomId,
                        exportedAt: new Date().toISOString(),
                        messageCount: messages.length,
                        messages: messages.map(m => ({
                          id: m.id,
                          sender: m.senderId,
                          content: m.content,
                          timestamp: new Date(m.timestamp).toISOString(),
                          type: m.msgtype || 'm.text',
                          ...(m.fileName ? { fileName: m.fileName } : {}),
                        })),
                      };
                      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `chat-${(room?.name || roomId).replace(/[^a-zA-Z0-9]/g, '_')}-${new Date().toISOString().slice(0, 10)}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    <Download className="h-4 w-4" />
                    Xuất lịch sử chat
                  </button>
                  {/* Room Avatar (channel/group only) */}
                  {room && room.type !== 'dm' && (
                    <button
                      onClick={() => { setIsMenuOpen(false); roomAvatarInputRef.current?.click(); }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      <ImageIcon className="h-4 w-4" />
                      Đổi ảnh đại diện phòng
                    </button>
                  )}
                  {/* Chat Background */}
                  <button
                    onClick={() => { setIsMenuOpen(false); chatBgInputRef.current?.click(); }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    <Wallpaper className="h-4 w-4" />
                    Đặt hình nền chat
                  </button>
                  {chatBackground && (
                    <button
                      onClick={async () => {
                        setIsMenuOpen(false);
                        try {
                          await matrixService.setChatBackground(roomId, null);
                          setChatBackground(null);
                        } catch (err) { console.error('Clear background failed:', err); }
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20"
                    >
                      <Eraser className="h-4 w-4" />
                      Xóa hình nền
                    </button>
                  )}
                  {/* Location Sharing */}
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      if (!navigator.geolocation) {
                        alert('Trình duyệt không hỗ trợ định vị');
                        return;
                      }
                      navigator.geolocation.getCurrentPosition(
                        async (pos) => {
                          try {
                            const msg = await matrixService.sendLocationMessage(
                              roomId,
                              pos.coords.latitude,
                              pos.coords.longitude,
                            );
                            setMessages(prev => [...prev, msg]);
                          } catch (err) {
                            alert('Không thể gửi vị trí');
                          }
                        },
                        (err) => {
                          if (err.code === 1) alert('Bạn đã từ chối quyền truy cập vị trí');
                          else alert('Không thể lấy vị trí: ' + err.message);
                        },
                        { enableHighAccuracy: true, timeout: 10000 }
                      );
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    <MapPin className="h-4 w-4" />
                    Chia sẻ vị trí
                  </button>
                  {/* Disappearing Messages */}
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      setShowDisappearingDialog(true);
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    <Timer className="h-4 w-4" />
                    Tin nhắn tự hủy
                    {disappearingTtl && (
                      <span className="ml-auto text-[10px] text-amber-500 font-bold">
                        {disappearingTtl >= 86400000 ? `${Math.floor(disappearingTtl / 86400000)}d` : disappearingTtl >= 3600000 ? `${Math.floor(disappearingTtl / 3600000)}h` : `${Math.floor(disappearingTtl / 60000)}m`}
                      </span>
                    )}
                  </button>
                  {/* Group Stats */}
                  {room?.type !== 'dm' && (
                    <button
                      onClick={() => {
                        setIsMenuOpen(false);
                        setIsGroupStatsOpen(true);
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      <BarChart3 className="h-4 w-4" />
                      Thống kê nhóm
                    </button>
                  )}
                  {/* Clear Chat History */}
                  <button
                    onClick={async () => {
                      setIsMenuOpen(false);
                      if (!confirm('Xóa toàn bộ lịch sử chat? (Xóa trên tài khoản này, nếu tất cả thành viên đều xóa thì tin nhắn sẽ bị xóa vĩnh viễn)')) return;
                      const now = Date.now();
                      clearedBeforeRef.current = now;
                      try { localStorage.setItem(`piechat_cleared_${roomId}`, String(now)); } catch {}
                      setMessages([]);

                      // Save to server (account-level, syncs across devices)
                      try {
                        await matrixService.setClearedBefore(roomId, now);
                      } catch (err) {
                        console.error('Failed to save cleared state to server:', err);
                      }

                      // Check if all members have cleared → redact from server
                      try {
                        const consensusTs = await matrixService.getAllMembersClearedBefore(roomId);
                        if (consensusTs > 0) {
                          const count = await matrixService.redactMessagesBefore(roomId, consensusTs);
                          if (count > 0) {
                            console.log(`[PieChat] All members cleared — redacted ${count} messages from server`);
                          }
                        }
                      } catch (err) {
                        console.error('Consensus redact check failed:', err);
                      }
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20"
                  >
                    <Eraser className="h-4 w-4" />
                    Xóa lịch sử chat
                  </button>
                  {/* Leave Room */}
                  {room?.type !== 'dm' && (
                    <button
                      onClick={async () => {
                        setIsMenuOpen(false);
                        if (!confirm('Bạn có chắc muốn rời khỏi phòng này?')) return;
                        try {
                          await matrixService.leaveRoom(roomId);
                          await fetchRooms();
                          router.push('/chat');
                        } catch (err) {
                          console.error('Leave room failed:', err);
                        }
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-900/20"
                    >
                      <LogOut className="h-4 w-4" />
                      Rời phòng
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        {
          isSearchOpen && (
            <div className="pb-3">
              <input
                type="text"
                value={roomSearch}
                onChange={(event) => setRoomSearch(event.target.value)}
                placeholder={t(language, 'roomSearchPlaceholder')}
                className="h-9 w-full rounded-md border border-sky-100 bg-white px-3 text-sm outline-none focus:border-sky-500 dark:border-sky-900/40 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-sky-500"
              />
            </div>
          )
        }
        {/* Pinned Message Banner */}
        {pinnedMessage && (
          <div className="flex items-center gap-2 border-t border-orange-100 dark:border-orange-900/30 bg-orange-50/50 dark:bg-orange-900/10 px-4 py-2">
            <Pin className="h-4 w-4 text-orange-500 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-orange-600 dark:text-orange-400">Tin nhắn đã ghim</p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 truncate">{pinnedMessage.content}</p>
            </div>
            <button onClick={() => setPinnedMessage(null)} className="shrink-0 rounded-full p-1 hover:bg-orange-100 dark:hover:bg-orange-900/20">
              <X className="h-3.5 w-3.5 text-orange-400" />
            </button>
          </div>
        )}
        {
          room?.type === 'channel' && (
            <div className="flex items-center justify-between border-t border-sky-100 py-3 dark:border-sky-900/30">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {t(language, 'chatRoleInChannel')}: {channelRole === 'leader' ? t(language, 'chatRoleLeader') : channelRole === 'deputy' ? t(language, 'chatRoleDeputy') : t(language, 'chatRoleMember')}
              </p>
              {canCreateInChannel && (
                <button
                  type="button"
                  onClick={handleCreateSubGroup}
                  className="rounded-md border border-sky-200 px-2 py-1 text-xs text-sky-700 hover:bg-sky-50 dark:border-sky-700 dark:text-sky-300 dark:hover:bg-sky-900/20"
                >
                  {t(language, 'chatCreateGroup')}
                </button>
              )}
            </div>
          )
        }
      </header >

      {/* Member Management Modal */}
      {
        isMemberModalOpen && room && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-zinc-900">
              <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
                <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  {t(language, 'chatManageMembers')}
                </h3>
                <button
                  onClick={() => setIsMemberModalOpen(false)}
                  className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <MoreVertical className="h-5 w-5 rotate-90" />
                </button>
              </div>

              <div className="p-6">
                {(canManageChannel || canManageGroup) && (
                  <div className="mb-6">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      {t(language, 'chatInviteByName')}
                    </p>
                    <div className="relative">
                      <input
                        value={memberQuery}
                        onChange={(event) => setMemberQuery(event.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && memberQuery.trim()) {
                            void handleAddMember(memberQuery.trim());
                          }
                        }}
                        placeholder={t(language, 'chatInviteByName')}
                        className="h-10 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-sm outline-none focus:border-sky-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                      />
                      {(memberSuggestions.length > 0 || memberQuery.trim().length > 3) && (
                        <div className="absolute top-full z-[110] mt-1 w-full overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900 ring-1 ring-black/5">
                          <div className="max-h-60 overflow-y-auto">
                            {memberSuggestions.map((candidate) => (
                              <button
                                key={candidate.userId}
                                type="button"
                                onClick={() => void handleAddMember(candidate.userId)}
                                className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors"
                              >
                                <div className="flex flex-col">
                                  <span className="font-medium text-zinc-900 dark:text-zinc-100">{candidate.displayName}</span>
                                  <span className="text-[10px] text-zinc-500 dark:text-zinc-400">@{candidate.username}</span>
                                </div>
                                <Plus className="h-4 w-4 text-sky-600" />
                              </button>
                            ))}
                            {memberQuery.trim().length > 3 && (
                              <button
                                type="button"
                                onClick={() => void handleAddMember(memberQuery.trim())}
                                className="flex w-full items-center gap-3 border-t border-zinc-100 px-4 py-3 text-left text-sm text-sky-600 hover:bg-sky-50 dark:border-zinc-800 dark:hover:bg-sky-900/20"
                              >
                                <UserPlus className="h-4 w-4" />
                                <div className="flex flex-col">
                                  <span className="font-semibold">Mời trực tiếp: {memberQuery.trim()}</span>
                                  <span className="text-[10px] opacity-60">Dùng số điện thoại hoặc ID</span>
                                </div>
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="max-h-[300px] overflow-y-auto pr-2">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    {t(language, 'roomMembersOnline')} ({room.members.length})
                  </p>
                  <div className="space-y-2">
                    {room.members.map((member) => (
                      <div key={member.id} className="flex items-center justify-between rounded-xl border border-zinc-50 bg-zinc-50/50 p-3 dark:border-zinc-800/50 dark:bg-zinc-800/30">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-100 font-bold text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
                            {(member.displayName || member.username).charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{member.displayName || member.username}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          {canManageMembers ? (
                            <div className="flex items-center gap-2">
                              <select
                                value={pendingRoles[member.id] || 'member'}
                                onChange={(event) => void handleRoleChange(member.id, event.target.value as 'leader' | 'deputy' | 'member')}
                                className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                              >
                                <option value="leader">{t(language, 'chatRoleLeader')}</option>
                                <option value="deputy">{t(language, 'chatRoleDeputy')}</option>
                                <option value="member">{t(language, 'chatRoleMember')}</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => member.id !== currentUser?.id && handleRemoveMember(member.id)}
                                disabled={member.id === currentUser?.id}
                                className={cn(
                                  "rounded-lg p-1.5 transition-all",
                                  member.id === currentUser?.id
                                    ? "text-zinc-200 dark:text-zinc-700 cursor-not-allowed"
                                    : "text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-900/20"
                                )}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                              {room.type === 'channel' ? room.channelRoles[member.id] : room.groupRoles[member.id]}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-zinc-100 bg-zinc-50 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900/50">
                <button
                  onClick={() => setIsMemberModalOpen(false)}
                  className="rounded-xl border border-zinc-100 bg-white px-6 py-2 text-sm font-bold text-zinc-600 transition-all hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  {t(language, 'chatCancel')}
                </button>
                <button
                  onClick={handleApplyMemberChanges}
                  disabled={loadingMessages}
                  className="rounded-xl bg-zinc-900 px-6 py-2 text-sm font-bold text-white transition-all hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                >
                  {t(language, 'chatConfirm')}
                </button>
              </div>
            </div>
          </div>
        )
      }

      {
        room?.type === 'channel' ? (
          <div className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto bg-white/50 p-3 backdrop-blur-sm dark:bg-black/40 sm:p-6 lg:p-10">
            <div className="mx-auto w-full max-w-2xl">
              <div className="mb-8 flex flex-col items-center text-center sm:mb-10">
                <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-tr from-sky-500 to-blue-700 text-2xl font-bold text-white shadow-xl shadow-sky-500/20 sm:mb-6 sm:h-24 sm:w-24 sm:text-3xl">
                  {room.name.charAt(0).toUpperCase()}
                </div>
                <h1 className="mb-2 text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-3xl">
                  {room.name}
                </h1>
                <p className="max-w-md text-sm text-zinc-600 dark:text-zinc-400">
                  {room.members.length} {t(language, 'chatRoleMember').toLowerCase()} • {childGroups.length} {t(language, 'chatGroupsTitle').toLowerCase()}
                </p>
              </div>

              <div className="grid gap-6 sm:gap-8 lg:grid-cols-2 min-w-0">
                <div className="space-y-4 sm:space-y-6 min-w-0">
                  <section className="overflow-hidden rounded-2xl border border-sky-100 bg-white p-4 shadow-sm dark:border-sky-900/40 dark:bg-zinc-900/60 sm:p-6">
                    <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-zinc-400">
                      <Crown className="h-4 w-4" />
                      {t(language, 'chatRoomTopic')}
                    </h3>
                    <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                      {room.name} là không gian trao đổi chung. Hãy tham gia các nhóm bên dưới để bắt đầu thảo luận.
                    </p>
                  </section>

                  <section className="overflow-hidden rounded-2xl border border-sky-100 bg-white p-4 shadow-sm dark:border-sky-900/40 dark:bg-zinc-900/60 sm:p-6">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex flex-col gap-1">
                        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-zinc-400">
                          <ShieldCheck className="h-4 w-4" />
                          {t(language, 'chatGroupsTitle')}
                        </h3>
                        {isReordering && (
                          <p className="text-[10px] text-sky-600 dark:text-sky-400 font-medium">
                            {t(language, 'chatReorderingNotice') || 'Sắp xếp theo thứ tự ưu tiên'}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {isReordering && (
                          <button
                            onClick={handleSaveOrder}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition-all dark:bg-emerald-500 dark:hover:bg-emerald-600"
                          >
                            {t(language, 'chatSaveOrder') || 'Lưu thứ tự'}
                          </button>
                        )}
                        {canManageChannel && (
                          <button
                            onClick={handleCreateSubGroup}
                            className="text-xs font-bold text-sky-600 hover:text-sky-700 dark:text-sky-400"
                          >
                            + {t(language, 'chatCreateNewGroup')}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      {localChildGroups.map((group, index) => (
                        <div
                          key={group.id}
                          draggable={canManageChannel && !group.isDefaultGroup}
                          onDragStart={() => handleDragStart(index)}
                          onDragOver={(e) => handleDragOver(e, index)}
                          onDragEnd={handleDragEnd}
                          className={cn(
                            "group flex items-center gap-2 transition-all",
                            draggedItemIndex === index ? "opacity-40 scale-[0.98]" : "opacity-100"
                          )}
                        >
                          <a
                            href={isReordering ? '#' : `/chat/${encodeURIComponent(group.id)}`}
                            onClick={(e) => isReordering && e.preventDefault()}
                            className={cn(
                              "flex min-w-0 flex-1 items-center justify-between rounded-xl border p-3 transition-all",
                              isReordering
                                ? "border-sky-100 bg-sky-50/30 dark:border-sky-900/40 dark:bg-sky-900/10"
                                : "border-zinc-50 bg-zinc-50/50 hover:border-sky-200 hover:bg-sky-50 dark:border-zinc-800/50 dark:bg-zinc-800/30 dark:hover:border-sky-900/60 dark:hover:bg-sky-900/20"
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-sm dark:bg-zinc-800">
                                <Users className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                              </div>
                              <span className="truncate text-sm font-semibold text-zinc-700 dark:text-zinc-200">{group.name}</span>
                              {group.isDefaultGroup && (
                                <span className="ml-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                                  <ShieldCheck className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                                </span>
                              )}
                              {(() => {
                                const myRole = group.groupRoles[currentUser?.id || ''] || 'member';
                                if (myRole === 'leader') {
                                  return (
                                    <span className="ml-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-900/20">
                                      <Crown className="h-3 w-3 text-amber-500" />
                                    </span>
                                  );
                                }
                                if (myRole === 'deputy') {
                                  return (
                                    <span className="ml-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-50/50 dark:bg-amber-900/10">
                                      <Shield className="h-3 w-3 text-amber-400" />
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                            {group.unreadCount > 0 && (
                              <span className="rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-bold text-white">
                                {group.unreadCount}
                              </span>
                            )}
                          </a>
                          {canManageChannel && !group.isDefaultGroup && (
                            <div className="cursor-grab active:cursor-grabbing p-2 text-zinc-300 hover:text-sky-500 transition-colors dark:text-zinc-600 h-11 w-11 flex items-center justify-center">
                              <GripVertical className="h-5 w-5" />
                            </div>
                          )}
                          {group.isDefaultGroup && (
                            <div className="p-2 text-zinc-200 dark:text-zinc-800 h-11 w-11 flex items-center justify-center">
                              <ShieldCheck className="h-4 w-4" />
                            </div>
                          )}
                        </div>
                      ))}
                      {localChildGroups.length === 0 && (
                        <p className="py-4 text-center text-xs text-zinc-500 dark:text-zinc-400 italic">
                          {t(language, 'chatNoChannels')}
                        </p>
                      )}
                    </div>
                  </section>
                </div>

                <section className="overflow-hidden rounded-2xl border border-sky-100 bg-white p-4 shadow-sm dark:border-sky-900/40 dark:bg-zinc-900/60 sm:p-6 min-w-0">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-zinc-400">
                      <UserPlus className="h-4 w-4" />
                      {t(language, 'roomMembersOnline')}
                    </h3>
                    <button
                      onClick={() => setIsMemberModalOpen(true)}
                      className="text-xs font-bold text-sky-600 hover:text-sky-700 dark:text-sky-400"
                    >
                      {t(language, 'chatManageMembers')}
                    </button>
                  </div>
                  <div className="space-y-3">
                    {room.members.slice(0, 10).map(member => (
                      <div key={member.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold text-sky-700 dark:text-sky-400">
                            {(member.displayName || member.username).charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{member.displayName || member.username}</span>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                          {room.channelRoles[member.id] || 'member'}
                        </span>
                      </div>
                    ))}
                    {room.members.length > 10 && (
                      <p className="mt-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
                        + {room.members.length - 10} thành viên khác
                      </p>
                    )}
                  </div>
                </section>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Pinned Messages Banner */}
            {pinnedMessageIds.length > 0 && (() => {
              const lastPinnedId = pinnedMessageIds[pinnedMessageIds.length - 1];
              const lastPinnedMsg = messages.find(m => m.id === lastPinnedId);
              const previewText = lastPinnedMsg
                ? (lastPinnedMsg.widget ? `🧩 Widget: ${lastPinnedMsg.widget.title || 'Widget'}` : lastPinnedMsg.content)
                : '(tin nhắn đã ghim)';
              return (
                <div className="border-b border-amber-200/60 dark:border-amber-800/30 bg-amber-50/80 dark:bg-amber-950/20 px-3 py-2 lg:px-4">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-200 dark:bg-amber-800/40">
                      <svg className="h-3 w-3 text-amber-600 dark:text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 17v5" />
                        <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V5a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2z" />
                      </svg>
                    </div>
                    <button
                      onClick={() => {
                        const el = document.getElementById(`msg-${lastPinnedId}`);
                        if (el) {
                          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          el.classList.add('ring-2', 'ring-amber-400', 'ring-offset-1');
                          setTimeout(() => el.classList.remove('ring-2', 'ring-amber-400', 'ring-offset-1'), 2000);
                        }
                      }}
                      className="flex-1 min-w-0 text-left"
                    >
                      <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                        📌 {pinnedMessageIds.length} tin nhắn đã ghim
                      </p>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 truncate">{previewText}</p>
                    </button>
                    {pinnedMessageIds.length > 1 ? (
                      <details className="relative">
                        <summary className="cursor-pointer text-[10px] font-semibold text-amber-600 dark:text-amber-400 hover:underline select-none">
                          Xem tất cả
                        </summary>
                        <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-xl border border-zinc-200 bg-white p-2 shadow-xl dark:border-zinc-700 dark:bg-zinc-900 space-y-1">
                          {pinnedMessageIds.map(pid => {
                            const pmsg = messages.find(m => m.id === pid);
                            const pText = pmsg
                              ? (pmsg.widget ? `🧩 ${pmsg.widget.title || 'Widget'}` : pmsg.content)
                              : '(tin nhắn)';
                            return (
                              <div key={pid} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                                <button
                                  onClick={() => {
                                    const el = document.getElementById(`msg-${pid}`);
                                    if (el) {
                                      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                      el.classList.add('ring-2', 'ring-amber-400', 'ring-offset-1');
                                      setTimeout(() => el.classList.remove('ring-2', 'ring-amber-400', 'ring-offset-1'), 2000);
                                    }
                                  }}
                                  className="flex-1 min-w-0 text-left text-xs text-zinc-700 dark:text-zinc-300 truncate"
                                >
                                  {pText}
                                </button>
                                <button
                                  onClick={() => handleUnpinMessage(pid)}
                                  className="shrink-0 text-zinc-400 hover:text-rose-500 transition-colors"
                                  title="Bỏ ghim"
                                >
                                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="m2 2 20 20" />
                                    <path d="M12 17v5" />
                                    <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V5a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2z" />
                                  </svg>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </details>
                    ) : (
                      <button
                        onClick={() => handleUnpinMessage(lastPinnedId)}
                        className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-200 hover:text-rose-500 dark:hover:bg-zinc-700 transition-colors"
                        title="Bỏ ghim"
                      >
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}
            <div
              ref={chatContainerRef}
              className="flex-1 space-y-0.5 lg:space-y-1 overflow-y-auto bg-sky-50/50 px-1 py-1 lg:p-4 dark:bg-black/90 scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-800"
              style={chatBackground ? {
                backgroundImage: `url(${chatBackground})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundAttachment: 'local',
              } : undefined}
            >
              {!firstLoadDone && (
                <div className="space-y-4 p-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className={cn("flex w-full gap-3", i % 2 === 0 ? "justify-end" : "justify-start")}>
                      <div className={cn("h-12 w-1/3 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800", i % 2 === 0 ? "rounded-tr-none" : "rounded-tl-none")} />
                    </div>
                  ))}
                </div>
              )}

              {displayedMessages.map((msg, idx) => {
                const isMe = msg.senderId === currentUser?.id || msg.senderId === 'me';
                const member = room?.members.find((m) => m.id === msg.senderId);
                const senderName = member?.displayName || member?.username || msg.senderId;
                // Determine sender role for badge display
                const _sCR = room?.channelRoles[msg.senderId];
                const _sGR = room?.groupRoles[msg.senderId];
                const senderRole: 'leader' | 'deputy' | 'member' | null =
                  (_sCR === 'leader' || _sGR === 'leader') ? 'leader'
                  : (_sCR === 'deputy' || _sGR === 'deputy') ? 'deputy'
                  : (room?.type === 'dm') ? null : 'member';
                // Group messages if sender is same as previous and time diff is small (< 5 mins)
                const prevMsg = displayedMessages[idx - 1];
                const isFirst = !prevMsg || prevMsg.senderId !== msg.senderId || (msg.timestamp - prevMsg.timestamp > 5 * 60 * 1000);
                // isLast: true if next message is from different sender or >5min gap (show timestamp only on last)
                const nextMsg = displayedMessages[idx + 1];
                const isLast = !nextMsg || nextMsg.senderId !== msg.senderId || (nextMsg.timestamp - msg.timestamp > 5 * 60 * 1000);

                const showDateSeparator = !prevMsg || new Date(msg.timestamp).toDateString() !== new Date(prevMsg.timestamp).toDateString();

                return (
                  <div key={msg.id} id={`msg-${msg.id}`} data-msg-id={msg.id} className="flex flex-col w-full">
                    {showDateSeparator && (
                      <div className="my-6 flex items-center justify-center">
                        <span className="rounded-full bg-zinc-100/80 border border-zinc-200/50 px-4 py-1 text-[11px] font-medium text-zinc-500 shadow-sm backdrop-blur dark:bg-zinc-800/80 dark:border-zinc-700/50 dark:text-zinc-400">
                          {new Date(msg.timestamp).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    )}
                    <MessageBubble
                      message={msg}
                      isMe={isMe}
                      senderName={senderName}
                      isFirst={isFirst}
                      isLast={isLast}
                      searchQuery={roomSearch}
                      activeMenuId={activeMenuMessageId}
                      setActiveMenuId={setActiveMenuMessageId}
                      onReaction={handleReaction}
                      onMenuAction={handleMessageAction}
                      onRetry={retryMessage}
                      getStatusLabel={getStatusLabel}
                      onContactAddFriend={handleContactAddFriend}
                      onContactCall={handleContactCall}
                      onContactMessage={handleContactMessage}
                      resolveUserByPhone={resolveUserByPhone}
                      onPollVote={handlePollVote}
                      currentUserId={currentUserId}
                      pollVotes={pollVotes}
                      onButtonClick={handleButtonClick}
                      onWidgetAction={handleWidgetAction}
                      onAvatarClick={handleAvatarClick}
                      senderRole={senderRole}
                      isPinned={pinnedMessageIds.includes(msg.id)}
                      onPinMessage={handlePinMessage}
                      onUnpinMessage={handleUnpinMessage}
                    />
                  </div>
                );
              })}

              {!loadingMessages && firstLoadDone && displayedMessages.length === 0 && !roomSearch.trim() && (
                <div className="flex h-full flex-col items-center justify-center text-center opacity-50">
                  <MessageSquare className="h-12 w-12 text-zinc-300 dark:text-zinc-600 mb-2" />
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">{t(language, 'chatNoMessages')}</p>
                </div>
              )}

              {!loadingMessages && firstLoadDone && displayedMessages.length === 0 && roomSearch.trim() && (
                <p className="text-center text-xs text-zinc-500 dark:text-zinc-400 mt-10">{t(language, 'roomSearchNoResult')}</p>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-sky-100 bg-white/90 p-4 backdrop-blur dark:border-sky-900/40 dark:bg-zinc-900/90">
              {hasFailedMessages && (
                <p className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-900/20 dark:text-rose-300 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                  {t(language, 'roomSendFailedBanner')}
                </p>
              )}
              {/* Typing indicator */}
              {typingUsers.length > 0 && (
                <div className="px-4 py-1.5">
                  <div className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500">
                    <div className="flex gap-0.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-[11px] italic">
                      {typingUsers.map(u => {
                        const member = room?.members.find(m => m.id === u);
                        return member?.displayName || member?.username || u.split(':')[0].replace('@', '');
                      }).join(', ')} đang nhập...
                    </span>
                  </div>
                </div>
              )}
              {/* Disappearing mode indicator */}
              {disappearingTtl && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 border-t border-amber-200 dark:border-amber-800">
                  <Timer className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                    Tin nhắn tự hủy sau {disappearingTtl >= 86400000 ? `${Math.floor(disappearingTtl / 86400000)} ngày` : disappearingTtl >= 3600000 ? `${Math.floor(disappearingTtl / 3600000)} giờ` : `${Math.floor(disappearingTtl / 60000)} phút`}
                  </span>
                  <button onClick={() => setDisappearingTtl(null)} className="ml-auto text-[10px] text-amber-500 hover:text-amber-700 font-bold">
                    Tắt
                  </button>
                </div>
              )}
              <ChatInput
                onSendMessage={handleSendMessage}
                onSendFiles={handleSendFiles}
                onSendFolder={handleSendFolder}
                onSendVoice={handleSendVoice}
                onSendContact={handleSendContact}
                onSendSticker={handleSendSticker}
                onOpenPollDialog={() => setIsPollDialogOpen(true)}
                onOpenReminderDialog={() => setIsReminderDialogOpen(true)}
                onTyping={handleTyping}
                replyEdit={replyEdit}
                onCancelReplyEdit={() => setReplyEdit(null)}
                onEditMessage={handleEditMessage}
                onReplyMessage={handleReplyMessage}
                disabled={isReadOnlyForMe}
                placeholder={isReadOnlyForMe ? t(language, 'chatRestrictSpeaking') : undefined}
                onScheduleMessage={(content, sendAt) => {
                  const delay = sendAt - Date.now();
                  if (delay <= 0) {
                    void handleSendMessage(content);
                    return;
                  }
                  scheduledMessageService.add({
                    roomId,
                    content,
                    scheduledAt: sendAt,
                    type: disappearingTtl ? 'disappearing' : 'text',
                    ttlMs: disappearingTtl || undefined,
                  });
                  const dt = new Date(sendAt);
                  const timeStr = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                  const dateStr = dt.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
                  alert(`📨 Tin nhắn sẽ được gửi lúc ${timeStr} ngày ${dateStr}`);
                }}
                members={room?.members.map(m => ({
                  id: m.id,
                  displayName: m.displayName || m.username,
                  username: m.username,
                }))}
                onSendWidget={handleSendWidget}
                onSendButtons={handleSendButtons}
                onSendLocation={() => {
                  if (!navigator.geolocation) {
                    alert('Trình duyệt không hỗ trợ định vị');
                    return;
                  }
                  navigator.geolocation.getCurrentPosition(
                    async (pos) => {
                      try {
                        const msg = await matrixService.sendLocationMessage(
                          roomId,
                          pos.coords.latitude,
                          pos.coords.longitude,
                        );
                        setMessages(prev => [...prev, msg]);
                      } catch {
                        alert('Không thể gửi vị trí');
                      }
                    },
                    (err) => {
                      if (err.code === 1) alert('Bạn đã từ chối quyền truy cập vị trí');
                      else alert('Không thể lấy vị trí: ' + err.message);
                    },
                    { enableHighAccuracy: true, timeout: 10000 }
                  );
                }}
                onToggleDisappearing={() => setShowDisappearingDialog(true)}
                isDisappearingActive={!!disappearingTtl}
              />
            </div>
          </>
        )
      }

      {/* Poll Dialog */}
      <PollCreateDialog
        isOpen={isPollDialogOpen}
        onClose={() => setIsPollDialogOpen(false)}
        onCreatePoll={handleCreatePoll}
      />

      {/* Reminder Dialog */}
      <ReminderCreateDialog
        isOpen={isReminderDialogOpen}
        onClose={() => setIsReminderDialogOpen(false)}
        onCreateReminder={handleCreateReminder}
      />

      {/* Media Gallery */}
      <MediaGallery
        isOpen={isGalleryOpen}
        onClose={() => setIsGalleryOpen(false)}
        messages={messages}
      />

      {/* Forward Message Modal */}
      {forwardingMessage && !forwardTargetChannel && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm mx-4 rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-700">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Chuyển tiếp tin nhắn</h3>
                <button onClick={() => { setForwardingMessage(null); setForwardSearch(''); }} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2">
                {forwardingMessage.content}
              </div>
              <input
                type="text"
                value={forwardSearch}
                onChange={(e) => setForwardSearch(e.target.value)}
                placeholder="Tìm cuộc hội thoại..."
                className="mt-2 w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                autoFocus
              />
            </div>
            <div className="max-h-64 overflow-y-auto p-2 space-y-0.5">
              {rooms
                .filter(r => r.id !== roomId)
                .filter(r => {
                  if (!forwardSearch.trim()) return true;
                  const q = forwardSearch.toLowerCase();
                  return (r.name || '').toLowerCase().includes(q) ||
                    r.members.some(m => (m.displayName || m.username || '').toLowerCase().includes(q));
                })
                .slice(0, 20)
                .map(r => {
                  const rName = r.name || r.members.find(m => m.id !== currentUser?.id)?.displayName || r.id;
                  const isChannel = r.type === 'channel';
                  return (
                    <button
                      key={r.id}
                      onClick={async () => {
                        if (isChannel) {
                          // Step 2: Show member selection for channel
                          setForwardTargetChannel(r.id);
                          // Default: current room members + channel leaders/deputies
                          const defaultMembers = new Set<string>();
                          room?.members.forEach(m => { if (m.id !== currentUser?.id) defaultMembers.add(m.id); });
                          // Add channel leaders/deputies
                          Object.entries(r.channelRoles || {}).forEach(([uid, role]) => {
                            if (uid !== currentUser?.id && (role === 'leader' || role === 'deputy')) {
                              defaultMembers.add(uid);
                            }
                          });
                          setForwardSelectedMembers(defaultMembers);
                          setForwardSearch('');
                        } else {
                          try {
                            await sendMessage(r.id, `↪️ [Chuyển tiếp]\n${forwardingMessage.content}`);
                            setForwardingMessage(null);
                            setForwardSearch('');
                            router.push(`/chat/${encodeURIComponent(r.id)}`);
                          } catch {
                            alert('Chuyển tiếp thất bại');
                          }
                        }
                      }}
                      className="flex w-full items-center gap-3 px-3 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left"
                    >
                      <div className={`h-9 w-9 shrink-0 rounded-full flex items-center justify-center font-bold text-sm ${isChannel ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400' : 'bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400'}`}>
                        {rName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{rName}</p>
                        <p className="truncate text-[10px] text-zinc-500">
                          {r.type === 'dm' ? 'Tin nhắn' : r.type === 'group' ? 'Nhóm' : 'Kênh → tạo nhóm mới'}
                        </p>
                      </div>
                      {isChannel && <Plus className="h-4 w-4 text-violet-500 shrink-0" />}
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* Forward to Channel — Step 2: Member selection */}
      {forwardingMessage && forwardTargetChannel && (() => {
        const targetChannel = rooms.find(r => r.id === forwardTargetChannel);
        if (!targetChannel) return null;
        const allCandidates = targetChannel.members.filter(m => m.id !== currentUser?.id);
        return (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-sm mx-4 rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-700">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Tạo nhóm trong {targetChannel.name}</h3>
                    <p className="text-[10px] text-zinc-500 mt-0.5">Chọn thành viên sẽ được thêm vào nhóm</p>
                  </div>
                  <button onClick={() => { setForwardTargetChannel(null); setForwardSelectedMembers(new Set()); }} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="max-h-56 overflow-y-auto p-2 space-y-0.5">
                {allCandidates.map(member => {
                  const isSelected = forwardSelectedMembers.has(member.id);
                  const channelRole = targetChannel.channelRoles?.[member.id];
                  const isLeaderDeputy = channelRole === 'leader' || channelRole === 'deputy';
                  return (
                    <button
                      key={member.id}
                      onClick={() => {
                        setForwardSelectedMembers(prev => {
                          const next = new Set(prev);
                          if (next.has(member.id)) next.delete(member.id);
                          else next.add(member.id);
                          return next;
                        });
                      }}
                      className={`flex w-full items-center gap-3 px-3 py-2 rounded-xl transition-colors text-left ${isSelected ? 'bg-sky-50 dark:bg-sky-900/20' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                    >
                      <div className={`h-5 w-5 shrink-0 rounded border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-sky-500 border-sky-500 text-white' : 'border-zinc-300 dark:border-zinc-600'}`}>
                        {isSelected && <Check className="h-3 w-3" />}
                      </div>
                      <div className="h-8 w-8 shrink-0 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-600 dark:text-zinc-300">
                        {(member.displayName || member.username || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{member.displayName || member.username}</p>
                      </div>
                      {isLeaderDeputy && (
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold ${channelRole === 'leader' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400'}`}>
                          {channelRole === 'leader' ? 'Trưởng' : 'Phó'}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-700 flex gap-2">
                <button
                  onClick={() => { setForwardTargetChannel(null); }}
                  className="flex-1 rounded-xl border border-zinc-300 dark:border-zinc-600 px-4 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  Quay lại
                </button>
                <button
                  onClick={async () => {
                    try {
                      const groupName = `Chuyển tiếp - ${new Date().toLocaleDateString('vi')}`;
                      const memberIds = Array.from(forwardSelectedMembers);
                      const newGroup = await matrixService.createGroup(forwardTargetChannel, groupName, memberIds);
                      await sendMessage(newGroup.id, `↪️ [Chuyển tiếp]\n${forwardingMessage.content}`);
                      setForwardingMessage(null);
                      setForwardTargetChannel(null);
                      setForwardSelectedMembers(new Set());
                      await fetchRooms();
                      router.push(`/chat/${encodeURIComponent(newGroup.id)}`);
                    } catch {
                      alert('Tạo nhóm thất bại');
                    }
                  }}
                  className="flex-1 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-700 transition-colors shadow-sm"
                >
                  Tạo nhóm ({forwardSelectedMembers.size})
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {/* Dropped Files Preview */}
      {droppedFiles.length > 0 && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md mx-4 rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                {droppedFolderName ? `📁 ${droppedFolderName} (${droppedFiles.length} tệp)` : `Gửi ${droppedFiles.length} tệp`}
              </h3>
              <button onClick={() => { setDroppedFiles([]); setDropCaption(''); setDroppedFolderName(null); }} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* File previews */}
            <div className="max-h-48 overflow-y-auto p-3 space-y-1.5">
              {droppedFiles.map((file, i) => {
                const isImage = file.type.startsWith('image/');
                const isVideo = file.type.startsWith('video/');
                const icon = isImage ? '📷' : isVideo ? '🎬' : '📎';
                const sizeStr = file.size < 1024 * 1024
                  ? `${(file.size / 1024).toFixed(0)} KB`
                  : `${(file.size / 1024 / 1024).toFixed(1)} MB`;
                return (
                  <div key={i} className="flex items-center gap-3 rounded-xl bg-zinc-50 dark:bg-zinc-800 px-3 py-2">
                    {isImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={URL.createObjectURL(file)}
                        alt=""
                        className="h-10 w-10 rounded-lg object-cover shrink-0"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-lg bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center text-lg shrink-0">
                        {icon}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-zinc-900 dark:text-zinc-100">{file.name}</p>
                      <p className="text-[10px] text-zinc-500">{sizeStr}</p>
                    </div>
                    {!droppedFolderName && (
                      <button
                        onClick={() => setDroppedFiles(prev => prev.filter((_, idx) => idx !== i))}
                        className="text-zinc-400 hover:text-rose-500 shrink-0"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Caption input */}
            <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-700 space-y-3">
              <input
                type="text"
                value={dropCaption}
                onChange={(e) => setDropCaption(e.target.value)}
                placeholder="Thêm tin nhắn kèm theo (tuỳ chọn)..."
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    const caption = dropCaption.trim();
                    const files = [...droppedFiles];
                    const folderName = droppedFolderName;
                    setDroppedFiles([]); setDropCaption(''); setDroppedFolderName(null);
                    if (caption) void handleSendMessage(caption);
                    if (folderName) {
                      void handleSendFolder(folderName, files);
                    } else {
                      void handleSendFiles(files);
                    }
                  }
                }}
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const files = [...droppedFiles];
                    const folderName = droppedFolderName;
                    setDroppedFiles([]); setDropCaption(''); setDroppedFolderName(null);
                    if (folderName) {
                      void handleSendFolder(folderName, files);
                    } else {
                      void handleSendFiles(files);
                    }
                  }}
                  className="flex-1 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-700 transition-colors shadow-sm"
                >
                  Gửi ngay
                </button>
                {dropCaption.trim() && (
                  <button
                    onClick={() => {
                      const caption = dropCaption.trim();
                      const files = [...droppedFiles];
                      const folderName = droppedFolderName;
                      setDroppedFiles([]); setDropCaption(''); setDroppedFolderName(null);
                      void handleSendMessage(caption);
                      if (folderName) {
                        void handleSendFolder(folderName, files);
                      } else {
                        void handleSendFiles(files);
                      }
                    }}
                    className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 transition-colors shadow-sm"
                  >
                    Gửi kèm text
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* User Profile Popup */}
      {profileUserId && (() => {
        const profileMember = room?.members.find(m => m.id === profileUserId);
        const isCurrentUser = profileUserId === currentUser?.id;
        const memberRole = room?.type === 'channel'
          ? room.channelRoles[profileUserId]
          : room?.groupRoles[profileUserId];
        const roleLabel = memberRole === 'leader' ? '👑 Trưởng nhóm'
          : memberRole === 'deputy' ? '🛡️ Phó nhóm' : null;
        return (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setProfileUserId(null)}>
            <div className="w-[360px] rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
              {/* Header gradient */}
              <div className="h-28 bg-gradient-to-br from-sky-500 via-violet-500 to-fuchsia-500 relative">
                <button onClick={() => setProfileUserId(null)} className="absolute top-3 right-3 rounded-full bg-black/30 p-1.5 text-white hover:bg-black/50 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
              {/* Avatar with online indicator */}
              <div className="flex justify-center -mt-14">
                <div className="relative">
                  <div className="h-28 w-28 rounded-full overflow-hidden bg-gradient-to-br from-sky-400 to-violet-500 ring-4 ring-white dark:ring-zinc-900 shadow-xl flex items-center justify-center">
                    {profileMember?.avatarUrl ? (
                      <img src={profileMember.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-white text-4xl font-bold">
                        {(profileMember?.displayName || profileMember?.username || '?').charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  {/* Online status dot */}
                  <span className={`absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-white dark:border-zinc-900 ${
                    profileMember?.status === 'online' ? 'bg-emerald-500' :
                    profileMember?.status === 'away' ? 'bg-amber-400' : 'bg-zinc-400'
                  }`} />
                </div>
              </div>
              {/* Info */}
              <div className="px-6 py-4 text-center">
                <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  {profileMember?.displayName || profileMember?.username || profileUserId}
                </h3>
                {profileMember?.username && (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">@{profileMember.username}</p>
                )}
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono mt-1 select-all">{profileUserId}</p>
                {/* Role badge */}
                {roleLabel && (
                  <span className="inline-block mt-2 rounded-full bg-amber-100 dark:bg-amber-900/30 px-3 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                    {roleLabel}
                  </span>
                )}
                {/* Status */}
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  {profileMember?.status === 'online' ? '🟢 Đang hoạt động' :
                   profileMember?.status === 'away' ? '🟡 Vắng mặt' : '⚫ Ngoại tuyến'}
                </p>
              </div>
              {/* Actions */}
              {!isCurrentUser && (
                <div className="px-6 pb-5 flex gap-2">
                  <button
                    onClick={() => {
                      setProfileUserId(null);
                      router.push(`/chat/${encodeURIComponent(profileUserId)}`);
                    }}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-sky-500 py-2.5 text-sm font-bold text-white hover:bg-sky-600 transition-colors"
                  >
                    <MessageSquare className="h-4 w-4" />
                    Nhắn tin
                  </button>
                  <button
                    onClick={() => { setProfileUserId(null); }}
                    className="flex items-center justify-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-700 py-2.5 px-3 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                    title="Gọi thoại"
                  >
                    <Phone className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => { setProfileUserId(null); }}
                    className="flex items-center justify-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-700 py-2.5 px-3 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                    title="Gọi video"
                  >
                    <Video className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}
      {/* Member List Side Panel */}
      {isMemberListOpen && room && room.type !== 'dm' && (
        <div className="fixed right-0 top-0 bottom-0 z-[150] w-72 sm:w-80 bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div className="flex items-center justify-between px-4 py-4 border-b border-zinc-100 dark:border-zinc-800">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Users className="h-4 w-4 text-sky-500" />
              Thành viên ({room.members.length})
            </h3>
            <button onClick={() => setIsMemberListOpen(false)} className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
            {room.members
              .sort((a, b) => {
                const roleOrder = (uid: string) => {
                  const cr = room.channelRoles[uid];
                  const gr = room.groupRoles[uid];
                  if (cr === 'leader' || gr === 'leader') return 0;
                  if (cr === 'deputy' || gr === 'deputy') return 1;
                  return 2;
                };
                return roleOrder(a.id) - roleOrder(b.id);
              })
              .map(member => {
                const cr = room.channelRoles[member.id];
                const gr = room.groupRoles[member.id];
                const roleBadge = (cr === 'leader' || gr === 'leader')
                  ? '👑'
                  : (cr === 'deputy' || gr === 'deputy')
                    ? '⭐'
                    : null;
                const roleLabel = (cr === 'leader' || gr === 'leader')
                  ? t(language, 'chatRoleLeader')
                  : (cr === 'deputy' || gr === 'deputy')
                    ? t(language, 'chatRoleDeputy')
                    : t(language, 'chatRoleMember');
                return (
                  <button
                    key={member.id}
                    onClick={() => { setIsMemberListOpen(false); setProfileUserId(member.id); }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group"
                  >
                    <div className="relative shrink-0">
                      <div className="h-9 w-9 rounded-full bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center text-sm font-bold text-sky-700 dark:text-sky-300">
                        {(member.displayName || member.username || '?').charAt(0).toUpperCase()}
                      </div>
                      {member.id === currentUser?.id && (
                        <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-white dark:border-zinc-900" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate flex items-center gap-1">
                        {member.displayName || member.username}
                        {roleBadge && <span className="text-xs">{roleBadge}</span>}
                        {member.id === currentUser?.id && <span className="text-[10px] text-zinc-400">(bạn)</span>}
                      </p>
                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500">{roleLabel}</p>
                    </div>
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {/* Broadcast Modal */}
      {isBroadcastOpen && room?.type === 'channel' && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => setIsBroadcastOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 px-6 py-4">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-sky-500" />
                Gửi thông báo hàng loạt
              </h3>
              <button onClick={() => setIsBroadcastOpen(false)} className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Tin nhắn sẽ được gửi đến tất cả {childGroups.length} nhóm trong kênh &ldquo;{room.name}&rdquo;
              </p>
              <textarea
                value={broadcastText}
                onChange={e => setBroadcastText(e.target.value)}
                rows={4}
                placeholder="Nhập nội dung thông báo..."
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                autoFocus
              />
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setIsBroadcastOpen(false)}
                  className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  Hủy
                </button>
                <button
                  disabled={!broadcastText.trim() || broadcastSending}
                  onClick={async () => {
                    if (!broadcastText.trim()) return;
                    setBroadcastSending(true);
                    try {
                      const groupIds = childGroups.map(g => g.id);
                      const sent = await matrixService.broadcastToChannel(room.id, broadcastText.trim(), groupIds);
                      alert(`Đã gửi thông báo đến ${sent}/${groupIds.length} nhóm!`);
                      setBroadcastText('');
                      setIsBroadcastOpen(false);
                    } catch (err) {
                      console.error('Broadcast failed:', err);
                      alert('Lỗi khi gửi thông báo hàng loạt');
                    } finally {
                      setBroadcastSending(false);
                    }
                  }}
                  className="flex-1 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-600 disabled:opacity-50 transition-colors"
                >
                  {broadcastSending ? 'Đang gửi...' : `Gửi đến ${childGroups.length} nhóm`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Hidden file inputs for room avatar and chat background */}
      <input
        ref={roomAvatarInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            await matrixService.setRoomAvatar(roomId, file);
            await fetchRooms();
          } catch (err) { console.error('Set room avatar failed:', err); }
          e.target.value = '';
        }}
      />
      <input
        ref={chatBgInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            const url = await matrixService.setChatBackground(roomId, file);
            setChatBackground(url);
          } catch (err) { console.error('Set background failed:', err); }
          e.target.value = '';
        }}
      />

      {/* Scheduled Message Checker */}
      <ScheduledMessageChecker roomId={roomId} onSend={handleSendMessage} />

      {/* Disappearing Message TTL Dialog */}
      {showDisappearingDialog && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowDisappearingDialog(false)}>
          <div className="w-[320px] rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-700 p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-1 flex items-center gap-2">
              <Timer className="h-4 w-4 text-amber-500" /> Tin nhắn tự hủy
            </h3>
            <p className="text-[11px] text-zinc-400 mb-4">Tin nhắn sẽ biến mất sau thời gian đã chọn</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Tắt', value: null },
                { label: '5 phút', value: 5 * 60 * 1000 },
                { label: '30 phút', value: 30 * 60 * 1000 },
                { label: '1 giờ', value: 60 * 60 * 1000 },
                { label: '6 giờ', value: 6 * 60 * 60 * 1000 },
                { label: '1 ngày', value: 24 * 60 * 60 * 1000 },
                { label: '3 ngày', value: 3 * 24 * 60 * 60 * 1000 },
                { label: '7 ngày', value: 7 * 24 * 60 * 60 * 1000 },
              ].map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => {
                    setDisappearingTtl(opt.value);
                    setShowDisappearingDialog(false);
                  }}
                  className={cn(
                    "rounded-xl px-3 py-2.5 text-sm font-medium border transition-all",
                    disappearingTtl === opt.value
                      ? "bg-amber-100 border-amber-400 text-amber-700 dark:bg-amber-900/30 dark:border-amber-600 dark:text-amber-400"
                      : "bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Group Statistics Modal */}
      {isGroupStatsOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setIsGroupStatsOpen(false)}>
          <div className="w-[400px] max-h-[80vh] rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-sky-500" /> Thống kê nhóm
              </h3>
              <button onClick={() => setIsGroupStatsOpen(false)} className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto max-h-[60vh]">
              {/* Overview */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-sky-50 dark:bg-sky-900/20 p-3 text-center">
                  <p className="text-lg font-bold text-sky-600">{messages.length}</p>
                  <p className="text-[10px] text-zinc-500">Tin nhắn</p>
                </div>
                <div className="rounded-xl bg-violet-50 dark:bg-violet-900/20 p-3 text-center">
                  <p className="text-lg font-bold text-violet-600">{new Set(messages.map(m => m.senderId)).size}</p>
                  <p className="text-[10px] text-zinc-500">Thành viên</p>
                </div>
                <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 p-3 text-center">
                  <p className="text-lg font-bold text-emerald-600">{messages.filter(m => m.fileUrl).length}</p>
                  <p className="text-[10px] text-zinc-500">Media</p>
                </div>
              </div>

              {/* Per-user stats */}
              <div>
                <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wide mb-2">Thành viên hoạt động</h4>
                {(() => {
                  const userStats: Record<string, { count: number; last: number }> = {};
                  messages.forEach(m => {
                    if (!userStats[m.senderId]) userStats[m.senderId] = { count: 0, last: 0 };
                    userStats[m.senderId].count++;
                    if (m.timestamp > userStats[m.senderId].last) userStats[m.senderId].last = m.timestamp;
                  });
                  const sorted = Object.entries(userStats).sort((a, b) => b[1].count - a[1].count);
                  const maxCount = sorted[0]?.[1].count || 1;
                  return sorted.slice(0, 10).map(([userId, stats], i) => {
                    const name = userId.split(':')[0].replace('@', '').replace(/^u/, '');
                    const pct = Math.round((stats.count / maxCount) * 100);
                    return (
                      <div key={userId} className="flex items-center gap-3 py-1.5">
                        <span className="text-[10px] font-bold text-zinc-400 w-4">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 truncate">{name}</span>
                            <span className="text-[10px] text-zinc-400 tabular-nums shrink-0">{stats.count} tin</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-sky-400 to-violet-500 transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Active hours */}
              <div>
                <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wide mb-2">Giờ hoạt động</h4>
                <div className="flex items-end gap-px h-16">
                  {(() => {
                    const hours = Array(24).fill(0);
                    messages.forEach(m => {
                      const h = new Date(m.timestamp).getHours();
                      hours[h]++;
                    });
                    const max = Math.max(...hours, 1);
                    return hours.map((count, h) => (
                      <div key={h} className="flex-1 flex flex-col items-center">
                        <div
                          className="w-full rounded-t bg-gradient-to-t from-sky-400 to-sky-300 dark:from-sky-600 dark:to-sky-500 transition-all"
                          style={{ height: `${Math.max((count / max) * 100, 2)}%` }}
                          title={`${h}:00 — ${count} tin`}
                        />
                        {h % 6 === 0 && (
                          <span className="text-[8px] text-zinc-400 mt-0.5">{h}h</span>
                        )}
                      </div>
                    ));
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div >
  );
}

// ─── Scheduled Message Checker Component ─────────────
function ScheduledMessageChecker({ roomId, onSend }: { roomId: string; onSend: (content: string) => void }) {
  useEffect(() => {
    const check = () => {
      const due = scheduledMessageService.getDueMessages().filter(m => m.roomId === roomId);
      for (const msg of due) {
        onSend(msg.content);
        scheduledMessageService.markSent(msg.id);
      }
    };
    check();
    const interval = setInterval(check, 30_000); // check every 30s
    return () => clearInterval(interval);
  }, [roomId, onSend]);
  return null;
}

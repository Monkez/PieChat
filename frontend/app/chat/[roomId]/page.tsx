'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Send, Paperclip, MoreVertical, Phone, Video, Search, UserPlus, Crown, ShieldCheck, Trash2, Users, GripVertical, Shield, MessageSquare, Plus, ArrowLeft, FolderOpen } from 'lucide-react';
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  const prevMessageCountRef = useRef(0);

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
  const { language } = useUiStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [pollVotes, setPollVotes] = useState<Record<string, PollVote[]>>({});
  const [isPollDialogOpen, setIsPollDialogOpen] = useState(false);
  const [isReminderDialogOpen, setIsReminderDialogOpen] = useState(false);
  const [replyEdit, setReplyEdit] = useState<ReplyEditState | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [remotePresence, setRemotePresence] = useState<string>('offline');
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);

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
      setMessages((prev) => {
        const localDrafts = prev.filter((item) => item.id.startsWith('temp-') && item.status !== 'sent');
        return [...msgs, ...localDrafts].sort((a, b) => a.timestamp - b.timestamp);
      });
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
        void matrixService.sendReadMarker(roomId, lastMsg.id);
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
    setFirstLoadDone(false);
    void loadMessages().then(() => {
      // Seed existing message IDs so they don't trigger notifications
      setMessages(prev => {
        seedNotifiedMessageIds(prev.map(m => m.id));
        return prev;
      });
    }).finally(() => setFirstLoadDone(true));
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

  const displayedMessages = roomSearch.trim()
    ? messages.filter((item) => item.content.toLowerCase().includes(roomSearch.trim().toLowerCase()))
    : messages;
  const hasFailedMessages = messages.some((item) => item.status === 'failed');

  const getStatusLabel = (status: Message['status']) => {
    if (status === 'sending') {
      return t(language, 'roomStatusSending');
    }
    if (status === 'failed') {
      return t(language, 'roomStatusFailed');
    }
    return t(language, 'roomStatusSent');
  };

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
      status: 'sending'
    };
    setMessages((prev) => [...prev, tempMsg]);
    setMessage('');

    try {
      await sendMessage(roomId, content);
      setMessages((prev) => prev.map((item) => (item.id === tempId ? { ...item, status: 'sent' } : item)));
      await loadMessages(true);
    } catch {
      setMessages((prev) => prev.map((item) => (item.id === tempId ? { ...item, status: 'failed' } : item)));
    }
  };

  const handleSendFiles = async (files: File[]) => {
    for (const file of files) {
      const tempId = `temp-file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
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
    const reminderId = `rem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
    } else if (action === 'forward') {
      alert(t(language, 'featureNotReady') || 'Tính năng đang phát triển');
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

  // Poll remote presence for DM rooms
  useEffect(() => {
    if (room?.type !== 'dm') return;
    const remoteUser = room?.members.find(m => m.id !== currentUser?.id);
    if (!remoteUser) return;
    const fetchPresence = () => {
      matrixService.getPresence(remoteUser.id).then(p => {
        setRemotePresence(p.currently_active ? 'online' : p.presence);
      });
    };
    fetchPresence();
    const interval = setInterval(fetchPresence, 30000);
    return () => clearInterval(interval);
  }, [room?.type, room?.members, currentUser?.id]);

  return (
    <div className="flex h-full min-h-0 flex-col">
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
                        remotePresence === 'online' ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600"
                      )} />
                      {remotePresence === 'online' ? 'Đang hoạt động' : 'Ngoại tuyến'}
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
          <div className="flex-1 overflow-y-auto bg-white/50 p-6 backdrop-blur-sm dark:bg-black/40 lg:p-10">
            <div className="mx-auto max-w-4xl">
              <div className="mb-10 flex flex-col items-center text-center">
                <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-tr from-sky-500 to-blue-700 text-3xl font-bold text-white shadow-xl shadow-sky-500/20">
                  {room.name.charAt(0).toUpperCase()}
                </div>
                <h1 className="mb-2 text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">
                  {room.name}
                </h1>
                <p className="max-w-md text-zinc-600 dark:text-zinc-400">
                  {room.members.length} {t(language, 'chatRoleMember').toLowerCase()} • {childGroups.length} {t(language, 'chatGroupsTitle').toLowerCase()}
                </p>
              </div>

              <div className="grid gap-8 lg:grid-cols-2">
                <div className="space-y-6">
                  <section className="rounded-2xl border border-sky-100 bg-white p-6 shadow-sm dark:border-sky-900/40 dark:bg-zinc-900/60">
                    <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-zinc-400">
                      <Crown className="h-4 w-4" />
                      {t(language, 'chatRoomTopic')}
                    </h3>
                    <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                      {room.name} là không gian trao đổi chung. Hãy tham gia các nhóm bên dưới để bắt đầu thảo luận.
                    </p>
                  </section>

                  <section className="rounded-2xl border border-sky-100 bg-white p-6 shadow-sm dark:border-sky-900/40 dark:bg-zinc-900/60">
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

                <section className="rounded-2xl border border-sky-100 bg-white p-6 shadow-sm dark:border-sky-900/40 dark:bg-zinc-900/60">
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
            <div ref={chatContainerRef} className="flex-1 space-y-3 lg:space-y-3 overflow-y-auto bg-sky-50/50 px-1 py-1 lg:p-4 dark:bg-black/90 scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-800">
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
                // Group messages if sender is same as previous and time diff is small (< 5 mins)
                const prevMsg = displayedMessages[idx - 1];
                const isFirst = !prevMsg || prevMsg.senderId !== msg.senderId || (msg.timestamp - prevMsg.timestamp > 5 * 60 * 1000);

                const showDateSeparator = !prevMsg || new Date(msg.timestamp).toDateString() !== new Date(prevMsg.timestamp).toDateString();

                return (
                  <div key={msg.id} data-msg-id={msg.id} className="flex flex-col w-full">
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
                      searchQuery={roomSearch}
                      activeMenuId={activeMenuMessageId}
                      setActiveMenuId={setActiveMenuMessageId}
                      onReaction={(msgId, emoji) => {
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
                      }}
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
                      onButtonClick={(msgId, btnId, label) => {
                        matrixService.sendButtonClick(roomId, msgId, btnId, label).catch(console.error);
                      }}
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
    </div >
  );
}

'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
    Search,
    Users,
    Hash,
    MessageSquare,
    ChevronRight,
    Clock,
    UserRound,
    ShieldCheck
} from 'lucide-react';
import { useMatrixStore } from '@/lib/store/matrix-store';
import { matrixService, Message, UserDirectoryAccount } from '@/lib/services/matrix-service';
import { useUiStore } from '@/lib/store/ui-store';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

function SearchContent() {
    const searchParams = useSearchParams();
    const query = searchParams.get('q') || '';
    const router = useRouter();
    const { language, friends } = useUiStore();
    const { rooms } = useMatrixStore();

    const [messageResults, setMessageResults] = useState<Message[]>([]);
    const [directoryResults, setDirectoryResults] = useState<UserDirectoryAccount[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!query.trim()) return;

        const performSearch = async () => {
            setIsLoading(true);
            try {
                const [msgs, dirUsers] = await Promise.all([
                    matrixService.searchMessages(query),
                    matrixService.searchUsersByName(query)
                ]);
                setMessageResults(msgs);
                setDirectoryResults(dirUsers);
            } catch (error) {
                console.error('Search failed:', error);
            } finally {
                setIsLoading(false);
            }
        };

        void performSearch();
    }, [query]);

    const roomResults = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return [];

        const matchedRooms = rooms.filter(room =>
            room.name.toLowerCase().includes(q) ||
            room.members.some(m => m.username.toLowerCase().includes(q))
        );

        const matchedFriends = friends.filter(f => {
            const match = f.displayName.toLowerCase().includes(q) || f.phone.includes(q);
            return match && !matchedRooms.some(r => r.type === 'dm' && r.name.toLowerCase().includes(f.displayName.toLowerCase()));
        }).map(f => ({
            id: `friend-${f.phone}`,
            name: f.displayName,
            type: 'contact',
            phone: f.phone
        }));

        return [...matchedRooms, ...matchedFriends].sort((a, b) => {
            const typeOrder: Record<string, number> = { 'dm': 1, 'contact': 1, 'channel': 2, 'group': 3 };
            const orderA = typeOrder[a.type as string] || 99;
            const orderB = typeOrder[b.type as string] || 99;
            return orderA - orderB;
        });
    }, [rooms, query, friends]);

    const formatDate = (ts: number) => {
        return new Date(ts).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="flex-1 overflow-y-auto bg-zinc-50/50 dark:bg-zinc-950/20 p-4 md:p-8">
            <div className="max-w-4xl mx-auto space-y-8">
                <header className="flex items-center gap-4 mb-8">
                    <div className="h-12 w-12 rounded-2xl bg-sky-100 flex items-center justify-center dark:bg-sky-900/30">
                        <Search className="h-6 w-6 text-sky-600 dark:text-sky-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 italic">
                            {t(language, 'chatSearchResults')}
                        </h1>
                        <p className="text-sm text-zinc-500">
                            "{query}" • {roomResults.length + messageResults.length} {language === 'vi' ? 'kết quả' : 'matches'}
                        </p>
                    </div>
                </header>

                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-20 animate-pulse">
                        <Search className="h-12 w-12 text-zinc-300 mb-4 animate-bounce" />
                        <p className="text-zinc-500 font-medium">{t(language, 'chatSearchLoading')}</p>
                    </div>
                ) : (
                    <>
                        {/* Conversations & Contacts Section */}
                        {roomResults.length > 0 && (
                            <section className="space-y-4">
                                <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                                    <Users className="h-4 w-4" />
                                    {t(language, 'chatRoomsFound')}
                                </h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {roomResults.map((result: any) => {
                                        const isFriend = result.type === 'contact';
                                        const parentGroup = !isFriend && result.type === 'group' && result.channelId
                                            ? rooms.find(r => r.id === result.channelId)
                                            : null;

                                        return (
                                            <Link
                                                key={result.id}
                                                href={isFriend ? '/chat' : `/chat/${encodeURIComponent(result.id)}`}
                                                className="group flex items-center gap-4 p-4 rounded-2xl border border-sky-100 bg-white shadow-sm hover:border-sky-300 hover:shadow-md transition-all dark:border-sky-900/40 dark:bg-zinc-900/60"
                                            >
                                                <div className="h-16 w-16 shrink-0 rounded-2xl bg-sky-50 flex items-center justify-center text-sky-600 dark:bg-sky-900/20 dark:text-sky-400">
                                                    {isFriend ? <UserRound className="h-8 w-8" /> :
                                                        result.type === 'dm' ? <Users className="h-8 w-8" /> :
                                                            result.type === 'channel' ? <Image src="/PieChatIcon.png" alt="" width={48} height={48} className="opacity-90 shadow-sm" /> :
                                                                <Hash className="h-8 w-8" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-0.5">
                                                        <span className="font-bold text-zinc-900 dark:text-zinc-100 truncate">{result.name}</span>
                                                        {parentGroup && (
                                                            <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
                                                                {parentGroup.name}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="text-xs text-zinc-500 capitalize">
                                                        {isFriend ? t(language, 'chatTabContacts') :
                                                            result.type === 'dm' ? t(language, 'chatTabPersonal') :
                                                                result.type === 'channel' ? t(language, 'chatChannel') :
                                                                    t(language, 'chatGroup')}
                                                    </span>
                                                </div>
                                                <ChevronRight className="h-5 w-5 text-zinc-300 group-hover:text-sky-500 transition-colors" />
                                            </Link>
                                        );
                                    })}
                                </div>
                            </section>
                        )}

                        {/* Global Users Section */}
                        {directoryResults.length > 0 && (
                            <section className="space-y-4">
                                <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                                    <UserRound className="h-4 w-4" />
                                    {language === 'vi' ? 'NGƯỜI DÙNG MỚI' : 'GLOBAL USERS'}
                                </h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {directoryResults.map((user) => (
                                        <Link
                                            key={user.userId}
                                            href={`/chat`}
                                            className="group flex items-center gap-4 p-4 rounded-2xl border border-zinc-100 bg-white shadow-sm hover:border-zinc-300 transition-all dark:border-sky-900/20 dark:bg-zinc-900/40"
                                        >
                                            <div className="h-12 w-12 shrink-0 rounded-full overflow-hidden border-2 border-zinc-50 dark:border-zinc-800">
                                                {user.avatarUrl ? (
                                                    <Image src={user.avatarUrl} alt="" width={48} height={48} className="h-full w-full object-cover" />
                                                ) : (
                                                    <div className="h-full w-full bg-zinc-100 flex items-center justify-center text-zinc-400">
                                                        <UserRound className="h-6 w-6" />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-bold text-zinc-900 dark:text-zinc-100 truncate">{user.displayName}</div>
                                                <div className="text-[10px] text-zinc-500 truncate">@{user.username}</div>
                                            </div>
                                            <div className="p-2 rounded-xl bg-sky-50 text-sky-600 group-hover:bg-sky-600 group-hover:text-white transition-all dark:bg-sky-900/20 dark:text-sky-400">
                                                <ChevronRight className="h-4 w-4" />
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Messages Section */}
                        <section className="space-y-4">
                            <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                                <MessageSquare className="h-4 w-4" />
                                {t(language, 'chatSearchMessages')}
                            </h2>

                            {messageResults.length > 0 ? (
                                <div className="space-y-3">
                                    {messageResults.map((msg) => {
                                        const room = rooms.find(r => r.id === msg.roomId);
                                        const sender = room?.members.find(m => m.id === msg.senderId);

                                        return (
                                            <Link
                                                key={msg.id}
                                                href={`/chat/${encodeURIComponent(msg.roomId)}`}
                                                className="block group p-4 rounded-2xl border border-zinc-100 bg-white hover:border-sky-200 hover:shadow-sm transition-all dark:border-zinc-800 dark:bg-zinc-900/40"
                                            >
                                                <div className="flex items-start gap-4">
                                                    <div className="h-10 w-10 shrink-0 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400 dark:bg-zinc-800">
                                                        {sender?.avatarUrl ? (
                                                            <Image src={sender.avatarUrl} alt="" width={40} height={40} className="rounded-full h-full w-full object-cover" />
                                                        ) : (
                                                            <UserRound className="h-5 w-5" />
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between mb-1">
                                                            <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                                                                {sender?.username || msg.senderId}
                                                            </span>
                                                            <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                                                                <Clock className="h-3 w-3" />
                                                                {formatDate(msg.timestamp)}
                                                            </span>
                                                        </div>
                                                        <p className="text-sm text-zinc-600 dark:text-zinc-300 line-clamp-2 bg-zinc-50 dark:bg-zinc-800/50 p-3 rounded-xl border border-zinc-100 dark:border-zinc-800/50">
                                                            {msg.content}
                                                        </p>
                                                        {room && (
                                                            <div className="mt-2 flex items-center gap-1.5 overflow-hidden">
                                                                <span className="text-[10px] text-zinc-400">{language === 'vi' ? 'Trong:' : 'In:'}</span>
                                                                <span className="text-[11px] font-medium text-sky-600 dark:text-sky-400 truncate hover:underline">
                                                                    {room.name}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </Link>
                                        );
                                    })}
                                </div>
                            ) : (
                                !isLoading && roomResults.length === 0 && (
                                    <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-zinc-200 rounded-3xl dark:border-zinc-800">
                                        <Search className="h-12 w-12 text-zinc-200 mb-4" />
                                        <p className="text-zinc-400 font-medium">{t(language, 'chatSearchNoResults')}</p>
                                    </div>
                                )
                            )}
                        </section>
                    </>
                )}
            </div>
        </div>
    );
}

export default function SearchPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <SearchContent />
        </Suspense>
    );
}

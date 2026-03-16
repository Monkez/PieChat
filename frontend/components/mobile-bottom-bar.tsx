'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { MessageSquare, Users, BookUser, Bot, MoreHorizontal, Bell, Settings, User, X, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/lib/store/ui-store';
import { t } from '@/lib/i18n';
import { useMatrixStore } from '@/lib/store/matrix-store';
import { useState, useRef, useEffect } from 'react';
import { notificationService } from '@/lib/services/notification-service';
import { motion, AnimatePresence } from 'framer-motion';

interface MobileBottomBarProps {
    activeSection?: string;
    onSectionChange?: (section: 'personal' | 'channels' | 'contacts' | 'assistants') => void;
}

function Avatar({ name, avatarUrl }: { name: string; avatarUrl?: string }) {
    if (avatarUrl) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt={name} className="h-8 w-8 rounded-full object-cover ring-2 ring-white/30" />
        );
    }
    const initial = (name || '?')[0].toUpperCase();
    return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 text-sm font-bold text-white ring-2 ring-white/30">
            {initial}
        </div>
    );
}

export function MobileBottomBar({ activeSection, onSectionChange }: MobileBottomBarProps) {
    const { language } = useUiStore();
    const pathname = usePathname();
    const router = useRouter();
    const { rooms, currentUser, logout } = useMatrixStore();
    const [isMoreOpen, setIsMoreOpen] = useState(false);
    const sheetRef = useRef<HTMLDivElement>(null);
    const sheetTouchStartY = useRef(0);
    const [sheetDragY, setSheetDragY] = useState(0);

    const isSettings = pathname === '/settings';
    const isNotifications = pathname === '/chat/notifications';
    const recentChats = rooms.filter((r) => r.type === 'dm' || r.type === 'group');
    const totalUnread = recentChats.reduce((acc, r) => acc + (r.unreadCount || 0), 0);
    const notifUnread = notificationService.getUnreadCount();

    // Close "More" sheet when navigating
    useEffect(() => {
        setIsMoreOpen(false);
    }, [pathname]);

    const tabs = [
        {
            id: 'personal' as const,
            icon: MessageSquare,
            iconImg: '/menubar-icons/conversation.png',
            label: t(language, 'chatTabPersonal'),
            href: '/chat',
            badge: totalUnread > 0 ? totalUnread : undefined,
        },
        {
            id: 'channels' as const,
            icon: Users,
            iconImg: '/menubar-icons/group.png',
            label: t(language, 'chatTabChannels'),
            href: '/chat',
        },
        {
            id: 'contacts' as const,
            icon: BookUser,
            iconImg: '/menubar-icons/contact.png',
            label: t(language, 'chatTabContacts'),
            href: '/chat',
        },
        {
            id: 'assistants' as const,
            icon: Bot,
            iconImg: '/menubar-icons/bot.png',
            label: t(language, 'chatTabAssistant' as any),
            href: '/chat',
        },
    ];

    const moreMenuItems = [
        {
            icon: User,
            label: 'Trang cá nhân',
            color: 'text-sky-500',
            bg: 'bg-sky-50 dark:bg-sky-900/20',
            onClick: () => { router.push('/profile'); setIsMoreOpen(false); },
        },
        {
            icon: Bell,
            label: 'Thông báo',
            color: 'text-amber-500',
            bg: 'bg-amber-50 dark:bg-amber-900/20',
            badge: notifUnread > 0 ? notifUnread : undefined,
            onClick: () => { router.push('/chat/notifications'); setIsMoreOpen(false); },
        },
        {
            icon: Settings,
            label: t(language, 'settingsTitle'),
            color: 'text-zinc-500',
            bg: 'bg-zinc-100 dark:bg-zinc-800',
            onClick: () => { router.push('/settings'); setIsMoreOpen(false); },
        },
        {
            icon: LogOut,
            label: 'Đăng xuất',
            color: 'text-rose-500',
            bg: 'bg-rose-50 dark:bg-rose-900/20',
            onClick: async () => {
                setIsMoreOpen(false);
                await logout();
                router.push('/login');
            },
        },
    ];

    return (
        <>
            {/* More Sheet Overlay */}
            <AnimatePresence>
                {isMoreOpen && (
                    <div className="fixed inset-0 z-[200] flex flex-col justify-end lg:hidden">
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/50" 
                            onClick={() => setIsMoreOpen(false)} 
                        />

                        {/* Sheet */}
                        <motion.div
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            transition={{ type: "spring", damping: 25, stiffness: 200 }}
                            ref={sheetRef}
                            className="relative bg-white dark:bg-zinc-900 rounded-t-3xl shadow-2xl ring-1 ring-black/5 dark:ring-zinc-700 pb-24"
                        style={{
                            transform: sheetDragY > 0 ? `translateY(${sheetDragY}px)` : undefined,
                            transition: sheetDragY > 0 ? 'none' : 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
                        }}
                        onTouchStart={(e) => {
                            sheetTouchStartY.current = e.touches[0].clientY;
                            setSheetDragY(0);
                        }}
                        onTouchMove={(e) => {
                            const dy = e.touches[0].clientY - sheetTouchStartY.current;
                            if (dy > 0) setSheetDragY(dy);
                        }}
                        onTouchEnd={() => {
                            if (sheetDragY > 80) setIsMoreOpen(false);
                            setSheetDragY(0);
                        }}
                    >
                        {/* Drag Handle */}
                        <div className="flex justify-center pt-3 pb-2">
                            <div className="h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                        </div>

                        {/* User Profile Header */}
                        {currentUser && (
                            <div className="flex items-center gap-3 px-5 pb-4 border-b border-zinc-100 dark:border-zinc-800">
                                <Avatar name={currentUser.displayName || currentUser.username} avatarUrl={currentUser.avatarUrl} />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                                        {currentUser.displayName || currentUser.username}
                                    </p>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                                        {currentUser.id}
                                    </p>
                                </div>
                                <button onClick={() => setIsMoreOpen(false)} className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800">
                                    <X className="h-5 w-5 text-zinc-400" />
                                </button>
                            </div>
                        )}

                        {/* Menu Items */}
                        <div className="px-4 py-3 space-y-1">
                            {moreMenuItems.map((item) => (
                                <button
                                    key={item.label}
                                    onClick={item.onClick}
                                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-all active:scale-[0.98] hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                                >
                                    <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", item.bg)}>
                                        <item.icon className={cn("h-5 w-5", item.color)} />
                                    </div>
                                    <span className="flex-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">{item.label}</span>
                                    {item.badge && (
                                        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                                            {item.badge}
                                        </span>
                                    )}
                                </button>
                                ))}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Bottom Navigation Bar */}
            <nav
                className="lg:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around text-white py-1"
                style={{ background: 'var(--accent-600)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            >
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = !isSettings && !isNotifications && activeSection === tab.id;

                    return (
                        <Link
                            key={tab.id}
                            href={tab.href}
                            onClick={(e) => {
                                if (onSectionChange && !isSettings) {
                                    e.preventDefault();
                                    onSectionChange(tab.id);
                                }
                            }}
                            className={cn(
                                "flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg transition-all relative text-center min-w-0 group",
                                isActive ? "bg-white/20" : "hover:bg-white/10"
                            )}
                        >
                            <motion.div
                                whileTap={{ scale: 0.8 }}
                                transition={{ type: "spring", stiffness: 400, damping: 17 }}
                            >
                                {tab.iconImg ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={tab.iconImg} alt={tab.label} className="h-6 w-6" />
                                ) : (
                                    <Icon className="h-6 w-6" />
                                )}
                            </motion.div>
                            <span className="text-[11px] font-medium">{tab.label}</span>
                            {tab.badge && (
                                <span className="absolute top-0.5 right-0.5 h-[18px] min-w-[18px] flex items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold">
                                    {tab.badge}
                                </span>
                            )}
                        </Link>
                    );
                })}

                {/* "More" button replaces Settings */}
                <button
                    onClick={() => setIsMoreOpen(true)}
                    className={cn(
                        "flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg transition-all text-center min-w-0 relative group",
                        (isSettings || isNotifications || isMoreOpen) ? "bg-white/20" : "hover:bg-white/10"
                    )}
                >
                    <motion.div
                        whileTap={{ scale: 0.8 }}
                        transition={{ type: "spring", stiffness: 400, damping: 17 }}
                    >
                        <MoreHorizontal className="h-6 w-6" />
                    </motion.div>
                    <span className="text-[11px] font-medium">Thêm</span>
                    {notifUnread > 0 && (
                        <span className="absolute top-0.5 right-0.5 h-[18px] min-w-[18px] flex items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold">
                            {notifUnread}
                        </span>
                    )}
                </button>
            </nav>
        </>
    );
}
